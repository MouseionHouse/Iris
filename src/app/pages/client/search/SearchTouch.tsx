import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { PageNav } from '../../../components/page';
import { RoomNavItemTouch } from '../../../features/room-nav';
import { TouchListArea } from '../../../features/room-nav/TouchList';
import { useRoomSearch } from '../../../features/search/useRoomSearch';
import { useRoomNavigate } from '../../../hooks/useRoomNavigate';
import {
  getRoomNotificationMode,
  useRoomsNotificationPreferencesContext,
} from '../../../hooks/useRoomsNotificationPreferences';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getCanonicalAliasOrRoomId } from '../../../utils/matrix';
import { getSearchMessagesPath, getSpacePath, withSearchParam } from '../../pathUtils';
import { SearchTabSearchParams, _SearchPathSearchParams } from '../../paths';
import { MessageSearchRow, SearchField, SearchListLabel, SearchListNote } from './SearchTouchView';

// A short query matches most of the rooms; past this many the user is better served by typing on.
const MAX_MATCHES = 50;

/**
 * The Search tab of a phone. Before a query it lists the recent chats; with one, the chats that
 * match it, as the room switcher of a wide screen does, and under them the way to search the
 * messages for the same words.
 */
export function SearchTouch() {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const { getRoom, mDirects, result, roomsToRender, searchQuery } = useRoomSearch();
  const { getRoomPath } = useRoomNavigate();
  const notificationPreferences = useRoomsNotificationPreferencesContext();

  // The query lives in the address, so coming back from a room or from message search finds it
  // as it was left, and a tap on the tab starts clean.
  const [searchParams, setSearchParams] = useSearchParams();
  const [value, setValue] = useState(searchParams.get('term') ?? '');
  const term = value.trim();

  useEffect(() => {
    searchQuery(value);
  }, [value, searchQuery]);

  const handleChange = (next: string) => {
    setValue(next);
    const params: SearchTabSearchParams = next.trim() ? { term: next } : {};
    setSearchParams(params, { replace: true });
  };

  const openMessageSearch = () => {
    if (!term) return;
    navigate(
      withSearchParam<_SearchPathSearchParams>(getSearchMessagesPath(), { term, global: 'true' })
    );
  };

  const roomIds = roomsToRender.slice(0, MAX_MATCHES);

  return (
    <PageNav>
      <SearchField value={value} onChange={handleChange} onSubmit={openMessageSearch} />
      <TouchListArea>
        <SearchListLabel>{result ? 'Chats' : 'Recent'}</SearchListLabel>
        {roomIds.length === 0 && (
          <SearchListNote>{result ? 'No chat matches.' : 'No chats yet.'}</SearchListNote>
        )}
        {roomIds.map((roomId) => {
          const room = getRoom(roomId);
          if (!room) return null;
          return (
            <RoomNavItemTouch
              key={roomId}
              room={room}
              selected={false}
              direct={mDirects.has(roomId)}
              linkPath={
                room.isSpaceRoom()
                  ? getSpacePath(getCanonicalAliasOrRoomId(mx, roomId))
                  : getRoomPath(roomId)
              }
              notificationMode={getRoomNotificationMode(notificationPreferences, roomId)}
            />
          );
        })}
        {term && (
          <>
            <SearchListLabel>Messages</SearchListLabel>
            <MessageSearchRow term={term} onClick={openMessageSearch} />
          </>
        )}
      </TouchListArea>
    </PageNav>
  );
}
