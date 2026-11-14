import { useAtomValue } from 'jotai';
import { SyncState } from 'matrix-js-sdk';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useRoomNavigate } from '../hooks/useRoomNavigate';
import { useSyncState } from '../hooks/useSyncState';
import {
  getDirectCreatePath,
  getHomeRoomPath,
  getInboxInvitesPath,
  withSearchParam,
} from '../pages/pathUtils';
import { DirectCreateSearchParams, _RoomSearchParams } from '../pages/paths';
import { getCanonicalAliasRoomId, isRoomAlias } from '../utils/matrix';
import { allInvitesAtom } from '../state/room-list/inviteList';
import { roomToUnreadAtom } from '../state/room/roomToUnread';
import {
  DesktopOpenRoom,
  desktopCloseNotifications,
  desktopNotifiedRooms,
  DesktopLink,
  isDesktopShell,
  onDesktopOpenLink,
  onDesktopOpenRoom,
  onDesktopReply,
  roomsToClose,
} from './desktop';
import { routeDesktopLink } from './desktopLink';
import { sendDesktopReply } from './desktopReply';

/**
 * Shows a room (and an event in it): an invitation opens the invitations, anything else the room
 * where it lives. The one handler for a click on a desktop notification, and for `matrix:` links
 * (mouseion/iris#69).
 */
export const useDesktopOpenRoom = (): ((target: DesktopOpenRoom) => void) => {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const { navigateRoom } = useRoomNavigate();
  return useCallback(
    ({ roomId, eventId }: DesktopOpenRoom) => {
      if (mx.getRoom(roomId)?.getMyMembership() === 'invite') navigate(getInboxInvitesPath());
      else navigateRoom(roomId, eventId);
    },
    [mx, navigate, navigateRoom]
  );
};

/**
 * Opens a `matrix:` link (mouseion/iris#69) where a `matrix.to` link clicked in Iris would go; see
 * `routeDesktopLink`. A known room goes through `useDesktopOpenRoom`, the one handler shared with
 * notification clicks.
 */
export const useDesktopOpenLink = (): ((link: DesktopLink) => void) => {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const { navigateSpace } = useRoomNavigate();
  const openRoom = useDesktopOpenRoom();
  return useCallback(
    (link: DesktopLink) => {
      const route = routeDesktopLink(link, (idOrAlias) => {
        const roomId = isRoomAlias(idOrAlias) ? getCanonicalAliasRoomId(mx, idOrAlias) : idOrAlias;
        const room = roomId ? mx.getRoom(roomId) : null;
        return room ? { roomId: room.roomId, isSpace: room.isSpaceRoom() } : undefined;
      });
      switch (route.to) {
        case 'room':
          openRoom({ roomId: route.roomId, eventId: route.eventId });
          break;
        case 'space':
          navigateSpace(route.roomId);
          break;
        case 'join': {
          const path = getHomeRoomPath(route.roomIdOrAlias, route.eventId);
          navigate(
            route.viaServers
              ? withSearchParam<_RoomSearchParams>(path, { viaServers: route.viaServers.join(',') })
              : path
          );
          break;
        }
        default: {
          const params: DirectCreateSearchParams = { userId: route.userId };
          navigate(withSearchParam(getDirectCreatePath(), params));
        }
      }
    },
    [mx, navigate, navigateSpace, openRoom]
  );
};

/**
 * The desktop shell's notifications, as far as the page is concerned: a click opens the room, a
 * reply typed in the popup is sent, and a room that has been read (here or on another device)
 * loses its notifications. Delivery itself is in `ClientNonUIFeatures`. A no-op outside the shell.
 */
export function DesktopNotificationsFeature() {
  const mx = useMatrixClient();
  const openRoom = useDesktopOpenRoom();
  const openLink = useDesktopOpenLink();
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const invites = useAtomValue(allInvitesAtom);
  const [inSync, setInSync] = useState(false);

  useSyncState(
    mx,
    useCallback((state: SyncState) => setInSync(state === SyncState.Syncing), [])
  );

  useEffect(() => (isDesktopShell() ? onDesktopOpenRoom(openRoom) : undefined), [openRoom]);
  useEffect(() => (isDesktopShell() ? onDesktopOpenLink(openLink) : undefined), [openLink]);

  useEffect(() => {
    if (!isDesktopShell()) return undefined;
    return onDesktopReply((reply) => {
      sendDesktopReply(mx, reply).catch((e) => console.warn('Reply from a notification failed', e));
    });
  }, [mx]);

  // The Android rule (`push.ts`): once a sync has completed, a room that is no longer unread
  // loses its notifications. Unlike on the phone, a hidden window (in the tray) still counts: that
  // is when the notifications matter most.
  useEffect(() => {
    if (!isDesktopShell() || !inSync) return;
    roomsToClose(desktopNotifiedRooms(), [...roomToUnread.keys(), ...invites]).forEach(
      desktopCloseNotifications
    );
  }, [inSync, roomToUnread, invites]);

  return null;
}
