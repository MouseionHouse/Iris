import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAtom, useAtomValue, useStore } from 'jotai';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useDirects, useRooms } from '../../state/hooks/roomList';
import { mDirectAtom } from '../../state/mDirectList';
import { allRoomsAtom } from '../../state/room-list/roomList';
import { factoryRoomIdByActivity } from '../../utils/sort';
import { getDirectRoomAvatarUrl, getRoomAvatarUrl } from '../../utils/room';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { getCachedShareAvatar, loadShareAvatar } from '../../native/shareAvatar';
import {
  isNativeShareAvailable,
  pendingOpenRoomAtom,
  pendingSharedTextAtom,
  setShareTargets,
  ShareTarget,
} from '../../native/share';
import { roomIdToMsgDraftAtomFamily } from '../../state/room/roomInputDrafts';
import { BlockType } from '../../components/editor';
import type { CustomElement } from '../../components/editor/slate';
import { SharePicker } from '../../features/share-picker';

// How many recent chats become per-chat share targets. The share sheet shows only a
// handful per app anyway; the native side also caps this at the launcher's limit.
const SHARE_TARGET_COUNT = 8;

/**
 * Keeps the per-chat share targets (Direct Share shortcuts) in step with the most recently
 * active chats. Activity order changes without the room lists changing, so it is also
 * recomputed whenever the app goes to the background, which is when the user is about to
 * share from somewhere else. The targets are removed on sign out.
 */
function useShareTargetsSync() {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const rooms = useRooms(mx, allRoomsAtom, mDirects);
  const directs = useDirects(mx, allRoomsAtom, mDirects);
  const useAuthentication = useMediaAuthentication();
  const [backgroundedAt, setBackgroundedAt] = useState(0);
  const lastPushed = useRef<string>();

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') setBackgroundedAt(Date.now());
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    if (!isNativeShareAvailable()) return undefined;

    const chats = [...rooms, ...directs]
      .sort(factoryRoomIdByActivity(mx))
      .slice(0, SHARE_TARGET_COUNT)
      .flatMap((roomId) => {
        const room = mx.getRoom(roomId);
        if (!room?.name) return [];
        const url = mDirects.has(roomId)
          ? getDirectRoomAvatarUrl(mx, room, 96, useAuthentication)
          : getRoomAvatarUrl(mx, room, 96, useAuthentication);
        return [{ roomId, label: room.name, url }];
      });

    const push = (targets: ShareTarget[]) => {
      const key = JSON.stringify(targets);
      if (key === lastPushed.current) return;
      lastPushed.current = key;
      setShareTargets(targets).catch(() => {
        lastPushed.current = undefined;
      });
    };
    const withCachedAvatars = () =>
      chats.map(({ roomId, label, url }) => {
        const avatar = url ? getCachedShareAvatar(url) : undefined;
        return avatar ? { roomId, label, avatar } : { roomId, label };
      });

    // Names go out at once; avatars follow as they load, so a slow image never holds up
    // the targets.
    push(withCachedAvatars());

    let cancelled = false;
    const headers = useAuthentication
      ? { Authorization: `Bearer ${mx.getAccessToken()}` }
      : undefined;
    const pending = chats.flatMap(({ url }) =>
      url && getCachedShareAvatar(url) === undefined ? [loadShareAvatar(url, headers)] : []
    );
    if (pending.length > 0) {
      Promise.all(pending).then(() => {
        if (!cancelled) push(withCachedAvatars());
      });
    }
    return () => {
      cancelled = true;
    };
  }, [mx, mDirects, rooms, directs, useAuthentication, backgroundedAt]);

  useEffect(
    () => () => {
      lastPushed.current = undefined;
      setShareTargets([]).catch(() => undefined);
    },
    []
  );
}

/**
 * Delivers text shared from another app (src/app/native/share.ts). If the user picked a
 * chat in the share sheet, the text goes straight to it; otherwise a "Send to…" picker
 * asks which chat. Either way it lands in that chat's composer as a draft, not sent: the
 * user reviews it and presses send. Cancelling the picker drops the text.
 */
export function SharedContentConsumer() {
  const mx = useMatrixClient();
  const store = useStore();
  const { navigateRoom } = useRoomNavigate();
  const [pending, setPending] = useAtom(pendingSharedTextAtom);
  const [pendingOpenRoom, setPendingOpenRoom] = useAtom(pendingOpenRoomAtom);

  useShareTargetsSync();

  const sendToRoom = useCallback(
    (roomId: string, text: string) => {
      const draft: CustomElement[] = [{ type: BlockType.Paragraph, children: [{ text }] }];
      store.set(roomIdToMsgDraftAtomFamily(roomId), draft);
      setPending(undefined);
      navigateRoom(roomId);

      // Best-effort focus: brings up the keyboard so the arrival is obvious.
      window.setTimeout(() => {
        document.querySelector<HTMLElement>('[data-slate-editor="true"]')?.focus();
      }, 500);
    },
    [store, setPending, navigateRoom]
  );

  useEffect(() => {
    if (!pending?.roomId) return;
    if (mx.getRoom(pending.roomId)) {
      sendToRoom(pending.roomId, pending.text);
    } else {
      // A stale target (a chat since left): ask instead.
      setPending({ text: pending.text });
    }
  }, [pending, mx, sendToRoom, setPending]);

  useEffect(() => {
    if (!pendingOpenRoom) return;
    setPendingOpenRoom(undefined);
    if (mx.getRoom(pendingOpenRoom.roomId)) navigateRoom(pendingOpenRoom.roomId);
  }, [pendingOpenRoom, mx, navigateRoom, setPendingOpenRoom]);

  if (!pending || pending.roomId) return null;

  return (
    <SharePicker
      text={pending.text}
      onPick={(roomId) => sendToRoom(roomId, pending.text)}
      requestClose={() => setPending(undefined)}
    />
  );
}
