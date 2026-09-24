import FocusTrap from 'focus-trap-react';
import {
  Avatar,
  Box,
  Button,
  config,
  Icon,
  Icons,
  Input,
  Line,
  MenuItem,
  Modal,
  Overlay,
  OverlayCenter,
  Scroll,
  Text,
  toRem,
} from 'folds';
import React, {
  ChangeEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { isKeyHotkey } from 'is-hotkey';
import { useAtomValue } from 'jotai';
import { useDirects, useRooms } from '../../state/hooks/roomList';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { mDirectAtom } from '../../state/mDirectList';
import { allRoomsAtom } from '../../state/room-list/roomList';
import {
  SearchItemStrGetter,
  useAsyncSearch,
  UseAsyncSearchOptions,
} from '../../hooks/useAsyncSearch';
import { useAllJoinedRoomsSet, useGetRoom } from '../../hooks/useGetRoom';
import { RoomAvatar } from '../../components/room-avatar';
import { getDirectRoomAvatarUrl, getRoomAvatarUrl } from '../../utils/room';
import { highlightText, makeHighlightRegex } from '../../plugins/react-custom-html-parser';
import { factoryRoomIdByActivity } from '../../utils/sort';
import { nameInitials } from '../../utils/common';
import { useListFocusIndex } from '../../hooks/useListFocusIndex';
import { getMxIdLocalPart, guessDmRoomUserId } from '../../utils/matrix';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  matchOptions: {
    contain: true,
  },
  normalizeOptions: {
    ignoreWhitespace: false,
  },
};

const PREVIEW_LENGTH = 160;

type SharePickerProps = {
  text: string;
  onPick: (roomId: string) => void;
  requestClose: () => void;
};

/**
 * "Send to…" chooser for text shared from another app: the chats (rooms and DMs, most
 * recently active first) with a search box, modelled on the room switcher (features/search).
 * Spaces are left out: they are not somewhere a message can go.
 */
export function SharePicker({ text, onPick, requestClose }: SharePickerProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const screenSize = useScreenSizeContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allRoomsSet = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allRoomsSet);
  const mDirects = useAtomValue(mDirectAtom);
  const rooms = useRooms(mx, allRoomsAtom, mDirects);
  const directs = useDirects(mx, allRoomsAtom, mDirects);

  const chats = useMemo(
    () => [...rooms, ...directs].sort(factoryRoomIdByActivity(mx)),
    [mx, rooms, directs]
  );

  const getTargetStr: SearchItemStrGetter<string> = useCallback(
    (roomId: string) => {
      const room = getRoom(roomId);
      const roomName = room?.name ?? roomId;
      if (room && mDirects.has(roomId)) {
        const targetUserId = guessDmRoomUserId(room, mx.getSafeUserId());
        const targetUsername = targetUserId && getMxIdLocalPart(targetUserId);
        if (targetUsername) return [roomName, targetUsername];
      }
      return roomName;
    },
    [getRoom, mDirects, mx]
  );

  const [result, search, resetSearch] = useAsyncSearch(chats, getTargetStr, SEARCH_OPTIONS);
  const roomsToRender = result ? result.items : chats;
  const listFocus = useListFocusIndex(roomsToRender.length, 0);

  const queryHighlightRegex = result?.query
    ? makeHighlightRegex(result.query.split(' '))
    : undefined;

  const preview = text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;

  const handleInputChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    listFocus.reset();
    const value = evt.currentTarget.value.trim();
    if (value === '') {
      resetSearch();
      return;
    }
    search(value);
  };

  const handleInputKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    const roomId = roomsToRender[listFocus.index];
    if (isKeyHotkey('enter', evt) && roomId) {
      onPick(roomId);
      return;
    }
    if (isKeyHotkey('arrowdown', evt)) {
      evt.preventDefault();
      listFocus.next();
      return;
    }
    if (isKeyHotkey('arrowup', evt)) {
      evt.preventDefault();
      listFocus.previous();
    }
  };

  const handleRoomClick: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const roomId = evt.currentTarget.getAttribute('data-room-id');
    if (roomId) onPick(roomId);
  };

  useEffect(() => {
    const scrollView = scrollRef.current;
    const focusedItem = scrollView?.querySelector(`[data-focus-index="${listFocus.index}"]`);
    if (focusedItem && scrollView) {
      focusedItem.scrollIntoView({ block: 'center' });
    }
  }, [listFocus.index]);

  return (
    <Overlay open>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            // On a phone, focusing the search box would raise the keyboard over the list.
            initialFocus: screenSize === ScreenSize.Mobile ? false : () => inputRef.current,
            returnFocusOnDeactivate: false,
            allowOutsideClick: true,
            clickOutsideDeactivates: true,
            onDeactivate: requestClose,
            escapeDeactivates: (evt) => {
              evt.stopPropagation();
              return true;
            },
          }}
        >
          <Modal size="400" style={{ maxHeight: toRem(560), borderRadius: config.radii.R500 }}>
            <Box
              shrink="No"
              direction="Column"
              gap="300"
              style={{ padding: config.space.S400, paddingBottom: 0 }}
            >
              <Box direction="Column" gap="100">
                <Text size="H4">Send to…</Text>
                <Text
                  size="T300"
                  priority="300"
                  style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                >
                  {preview}
                </Text>
              </Box>
              <Input
                ref={inputRef}
                size="500"
                variant="Background"
                radii="400"
                outlined
                placeholder="Search chats"
                before={<Icon size="200" src={Icons.Search} />}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
              />
            </Box>
            <Box grow="Yes">
              {roomsToRender.length === 0 && (
                <Box
                  style={{ padding: config.space.S700 }}
                  grow="Yes"
                  alignItems="Center"
                  justifyContent="Center"
                  direction="Column"
                  gap="100"
                >
                  <Text size="H6" align="Center">
                    {result ? 'No Match Found' : 'No Chats'}
                  </Text>
                  {result && (
                    <Text size="T200" align="Center">
                      {`No chat matches "${result.query}".`}
                    </Text>
                  )}
                </Box>
              )}
              {roomsToRender.length > 0 && (
                <Scroll ref={scrollRef} size="300" hideTrack>
                  <div style={{ padding: config.space.S400, paddingRight: config.space.S200 }}>
                    {roomsToRender.map((roomId, index) => {
                      const room = getRoom(roomId);
                      if (!room) return null;

                      const dm = mDirects.has(roomId);
                      const dmUserId = dm && guessDmRoomUserId(room, mx.getSafeUserId());
                      const dmUsername = dmUserId && getMxIdLocalPart(dmUserId);

                      return (
                        <MenuItem
                          key={roomId}
                          as="button"
                          data-focus-index={index}
                          data-room-id={roomId}
                          onClick={handleRoomClick}
                          variant={listFocus.index === index ? 'Primary' : 'Surface'}
                          aria-pressed={listFocus.index === index}
                          radii="400"
                          before={
                            <Avatar size="300" radii={dm ? '400' : '300'}>
                              <RoomAvatar
                                roomId={room.roomId}
                                src={
                                  dm
                                    ? getDirectRoomAvatarUrl(mx, room, 96, useAuthentication)
                                    : getRoomAvatarUrl(mx, room, 96, useAuthentication)
                                }
                                alt={room.name}
                                renderFallback={() => (
                                  <Text as="span" size="H6">
                                    {nameInitials(room.name)}
                                  </Text>
                                )}
                              />
                            </Avatar>
                          }
                        >
                          <Box grow="Yes" alignItems="Center" gap="100">
                            <Text size="T400" truncate>
                              {queryHighlightRegex
                                ? highlightText(queryHighlightRegex, [room.name])
                                : room.name}
                            </Text>
                            {dmUsername && (
                              <Text as="span" size="T200" priority="300" truncate>
                                @
                                {queryHighlightRegex
                                  ? highlightText(queryHighlightRegex, [dmUsername])
                                  : dmUsername}
                              </Text>
                            )}
                          </Box>
                        </MenuItem>
                      );
                    })}
                  </div>
                </Scroll>
              )}
            </Box>
            <Line size="300" />
            <Box shrink="No" justifyContent="End" style={{ padding: config.space.S300 }}>
              <Button size="300" variant="Secondary" fill="Soft" radii="300" onClick={requestClose}>
                <Text size="B300">Cancel</Text>
              </Button>
            </Box>
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
