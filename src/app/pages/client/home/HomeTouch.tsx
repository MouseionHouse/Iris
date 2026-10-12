import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { Icon, Icons, Line, Text } from 'folds';
import { BottomSheet } from '../../../components/bottom-sheet';
import { ListFab, SheetAction, SheetActions } from '../../../features/room-nav/TouchList';
import * as css from '../../../features/room-nav/touch.css';
import {
  encodeSearchParamValueArray,
  getCreatePath,
  getDirectCreatePath,
  getExplorePath,
  getHomeCreatePath,
  getHomeRoomPath,
  getSpacePath,
  withSearchParam,
} from '../../pathUtils';
import { _RoomSearchParams } from '../../paths';
import { JoinAddressPrompt } from '../../../components/join-address-prompt';
import { RoomAvatar } from '../../../components/room-avatar';
import { UnreadBadge } from '../../../components/unread-badge';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { useHomeConversations } from '../../../hooks/useSidebar';
import { useSidebarItems } from '../../../hooks/useSidebarItems';
import {
  useOrphanSpaces,
  useRecursiveChildScopeFactory,
  useSpaceChildren,
} from '../../../state/hooks/roomList';
import { useRoomsUnread } from '../../../state/hooks/unread';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { roomToParentsAtom } from '../../../state/room/roomToParents';
import { roomToUnreadAtom } from '../../../state/room/roomToUnread';
import { getCanonicalAliasOrRoomId } from '../../../utils/matrix';
import { getRoomAvatarUrl } from '../../../utils/room';
import { nameInitials } from '../../../utils/common';
import { markAsRead } from '../../../utils/notifications';

const withViaServers = (path: string, viaServers?: string[]): string =>
  viaServers
    ? withSearchParam<_RoomSearchParams>(path, {
        viaServers: encodeSearchParamValueArray(viaServers),
      })
    : path;

/** The spaces of the rail, in its order. A folder is a grouping of the rail only, so it is flattened. */
const useRailSpaces = (): string[] => {
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const orphanSpaces = useOrphanSpaces(mx, allRoomsAtom, roomToParents);
  const [sidebarItems] = useSidebarItems(orphanSpaces);

  return useMemo(
    () => sidebarItems.flatMap((item) => (typeof item === 'string' ? [item] : item.content)),
    [sidebarItems]
  );
};

type SpaceSheetActionProps = {
  spaceId: string;
  onOpen: (spaceId: string) => void;
};
/** A space in the sheet, with what the rail counts on its tab: the unread of the rooms in it. */
function SpaceSheetAction({ spaceId, onOpen }: SpaceSheetActionProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const allChild = useSpaceChildren(
    allRoomsAtom,
    spaceId,
    useRecursiveChildScopeFactory(mx, roomToParents)
  );
  const unread = useRoomsUnread(allChild, roomToUnreadAtom);
  const space = mx.getRoom(spaceId);
  if (!space) return null;

  return (
    <SheetAction
      before={
        <RoomAvatar
          roomId={spaceId}
          src={getRoomAvatarUrl(mx, space, 96, useAuthentication)}
          alt={space.name}
          renderFallback={() => (
            <Text as="span" size="L400">
              {nameInitials(space.name)}
            </Text>
          )}
        />
      }
      after={unread && <UnreadBadge highlight={unread.highlight > 0} count={unread.total} />}
      onClick={() => onOpen(spaceId)}
    >
      {space.name}
    </SheetAction>
  );
}

type PlacesSheet = 'places' | 'add-space';

/**
 * Home's header on a phone. The title is the way to the spaces, which have no rail to live in:
 * it opens a sheet with Home, each space and Add space.
 */
export function HomeTouchHeader() {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const spaces = useRailSpaces();
  const rooms = useHomeConversations();
  const unread = useRoomsUnread(rooms, roomToUnreadAtom);
  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
  const [sheet, setSheet] = useState<PlacesSheet>();
  const [joinAddress, setJoinAddress] = useState(false);

  const close = () => setSheet(undefined);

  const handleMarkAsRead = () => {
    if (!unread) return;
    rooms.forEach((rId) => markAsRead(mx, rId, hideActivity));
    close();
  };

  return (
    <header className={css.TouchHeader}>
      <button
        type="button"
        className={css.TouchHeaderTitle}
        aria-haspopup="dialog"
        aria-pressed={!!sheet}
        onClick={() => setSheet('places')}
      >
        <Text as="span" size="H3" truncate>
          Home
        </Text>
        <Icon size="100" src={Icons.ChevronBottom} />
      </button>
      {/* One sheet for both lists: a second one would be closed by the first as it goes. */}
      {sheet && (
        <BottomSheet
          open
          requestClose={close}
          aria-label={sheet === 'places' ? 'Home and spaces' : 'Add space'}
        >
          {sheet === 'places' ? (
            <SheetActions>
              <SheetAction
                before={<Icon size="200" src={Icons.Home} filled />}
                after={<Icon size="100" src={Icons.Check} />}
                current
                onClick={close}
              >
                Home
              </SheetAction>
              {spaces.map((spaceId) => (
                <SpaceSheetAction
                  key={spaceId}
                  spaceId={spaceId}
                  onOpen={() => {
                    close();
                    navigate(getSpacePath(getCanonicalAliasOrRoomId(mx, spaceId)));
                  }}
                />
              ))}
              <SheetAction
                before={<Icon size="200" src={Icons.Plus} />}
                onClick={() => setSheet('add-space')}
              >
                Add space
              </SheetAction>
              <Line variant="Surface" size="300" />
              <SheetAction
                before={<Icon size="200" src={Icons.CheckTwice} />}
                aria-disabled={!unread}
                onClick={handleMarkAsRead}
              >
                Mark as Read
              </SheetAction>
            </SheetActions>
          ) : (
            <SheetActions>
              <SheetAction
                before={<Icon size="200" src={Icons.Space} />}
                onClick={() => {
                  close();
                  navigate(getCreatePath());
                }}
              >
                Create Space
              </SheetAction>
              <SheetAction
                before={<Icon size="200" src={Icons.Link} />}
                onClick={() => {
                  close();
                  setJoinAddress(true);
                }}
              >
                Join with Address
              </SheetAction>
            </SheetActions>
          )}
        </BottomSheet>
      )}
      {joinAddress && (
        <JoinAddressPrompt
          onCancel={() => setJoinAddress(false)}
          onOpen={(roomIdOrAlias, viaServers) => {
            setJoinAddress(false);
            navigate(withViaServers(getSpacePath(roomIdOrAlias), viaServers));
          }}
        />
      )}
    </header>
  );
}

/** The + button of Home on a phone: the create and join actions, within thumb reach. */
export function HomeCreateFab() {
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(false);
  const [joinAddress, setJoinAddress] = useState(false);

  const go = (path: string) => {
    setSheet(false);
    navigate(path);
  };

  return (
    <>
      <ListFab aria-label="Create or join" aria-haspopup="dialog" onClick={() => setSheet(true)} />
      {sheet && (
        <BottomSheet open requestClose={() => setSheet(false)} aria-label="Create or join">
          <SheetActions>
            <SheetAction
              before={<Icon size="200" src={Icons.Message} />}
              onClick={() => go(getDirectCreatePath())}
            >
              Create Chat
            </SheetAction>
            <SheetAction
              before={<Icon size="200" src={Icons.HashPlus} />}
              onClick={() => go(getHomeCreatePath())}
            >
              Create Room
            </SheetAction>
            <SheetAction
              before={<Icon size="200" src={Icons.Link} />}
              onClick={() => {
                setSheet(false);
                setJoinAddress(true);
              }}
            >
              Join with Address
            </SheetAction>
            <SheetAction
              before={<Icon size="200" src={Icons.Explore} />}
              onClick={() => go(getExplorePath())}
            >
              Explore rooms
            </SheetAction>
          </SheetActions>
        </BottomSheet>
      )}
      {joinAddress && (
        <JoinAddressPrompt
          onCancel={() => setJoinAddress(false)}
          onOpen={(roomIdOrAlias, viaServers, eventId) => {
            setJoinAddress(false);
            navigate(withViaServers(getHomeRoomPath(roomIdOrAlias, eventId), viaServers));
          }}
        />
      )}
    </>
  );
}
