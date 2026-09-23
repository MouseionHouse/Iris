import { getLocalStorageItem, setLocalStorageItem } from './utils/atomWithLocalStorage';

const LAST_OPENED_ROOM = 'lastOpenedRoom';

export type LastOpenedRoom = {
  /** App path of the room as last visited (e.g. `/home/!abc:server/`). */
  path: string;
  roomId: string;
};

const getStoreKey = (userId: string): string => `${LAST_OPENED_ROOM}${userId}`;

export const getLastOpenedRoom = (userId: string): LastOpenedRoom | undefined =>
  getLocalStorageItem<LastOpenedRoom | undefined>(getStoreKey(userId), undefined);

export const setLastOpenedRoom = (userId: string, room: LastOpenedRoom): void => {
  setLocalStorageItem(getStoreKey(userId), room);
};
