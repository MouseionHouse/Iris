import { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { ImagePack } from './ImagePack';
import { EmoteRoomsContent, ImageUsage, PackContent, PackImage } from './types';
import { StateEvent } from '../../../types/matrix/room';
import { getAccountData, getStateEvent, getStateEvents } from '../../utils/room';
import { replaceSpaceWithDash, suffixRename } from '../../utils/common';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { PackMetaReader } from './PackMetaReader';
import { PackAddress } from './PackAddress';

export function packAddressEqual(a1?: PackAddress, a2?: PackAddress): boolean {
  if (!a1 && !a2) return true;
  if (!a1 || !a2) return false;
  return a1.roomId === a2.roomId && a1.stateKey === a2.stateKey;
}

export function imageUsageEqual(u1: ImageUsage[], u2: ImageUsage[]) {
  return u1.length === u2.length && u1.every((u) => u2.includes(u));
}

export function packMetaEqual(a: PackMetaReader, b: PackMetaReader): boolean {
  return (
    a.name === b.name &&
    a.avatar === b.avatar &&
    a.attribution === b.attribution &&
    imageUsageEqual(a.usage, b.usage)
  );
}

export function makeImagePacks(packEvents: MatrixEvent[]): ImagePack[] {
  return packEvents.reduce<ImagePack[]>((imagePacks, packEvent) => {
    const packId = packEvent.getId();
    if (!packId) return imagePacks;
    imagePacks.push(ImagePack.fromMatrixEvent(packId, packEvent));
    return imagePacks;
  }, []);
}

export function getRoomImagePack(room: Room, stateKey: string): ImagePack | undefined {
  const packEvent = getStateEvent(room, StateEvent.PoniesRoomEmotes, stateKey);
  if (!packEvent) return undefined;
  const packId = packEvent.getId();
  if (!packId) return undefined;
  return ImagePack.fromMatrixEvent(packId, packEvent);
}

export function getRoomImagePacks(room: Room): ImagePack[] {
  const packEvents = getStateEvents(room, StateEvent.PoniesRoomEmotes);
  return makeImagePacks(packEvents);
}

export function getGlobalImagePacks(mx: MatrixClient): ImagePack[] {
  const emoteRoomsContent = getAccountData(mx, AccountDataEvent.PoniesEmoteRooms)?.getContent() as
    | EmoteRoomsContent
    | undefined;
  if (typeof emoteRoomsContent !== 'object') return [];

  const { rooms: roomIdToPackInfo } = emoteRoomsContent;
  if (typeof roomIdToPackInfo !== 'object') return [];

  const roomIds = Object.keys(roomIdToPackInfo);

  const packs = roomIds.flatMap((roomId) => {
    if (typeof roomIdToPackInfo[roomId] !== 'object') return [];
    const room = mx.getRoom(roomId);
    if (!room) return [];
    const packStateKeyToUnknown = roomIdToPackInfo[roomId];
    const packEvents = getStateEvents(room, StateEvent.PoniesRoomEmotes);
    const globalPackEvents = packEvents.filter((mE) => {
      const stateKey = mE.getStateKey();
      if (typeof stateKey === 'string') return !!packStateKeyToUnknown[stateKey];
      return false;
    });
    return makeImagePacks(globalPackEvents);
  });

  return packs;
}

export function getUserImagePack(mx: MatrixClient): ImagePack | undefined {
  const packEvent = getAccountData(mx, AccountDataEvent.PoniesUserEmotes);
  const userId = mx.getUserId();
  if (!packEvent || !userId) {
    return undefined;
  }

  const userImagePack = ImagePack.fromMatrixEvent(userId, packEvent);
  return userImagePack;
}

/**
 * Stable key of a pack across edits. A room pack's id is its state event id, which changes on
 * every commit, so packs are matched by address instead. The personal pack has no address.
 */
export const packKey = (pack: ImagePack): string =>
  pack.address ? `${pack.address.roomId}\u0000${pack.address.stateKey}` : '';

export const getPackLabel = (mx: MatrixClient, pack: ImagePack): string =>
  pack.meta.name ||
  (pack.address ? mx.getRoom(pack.address.roomId)?.name : 'Personal Pack') ||
  'Unknown';

export const normalizeShortcode = (name: string): string => replaceSpaceWithDash(name.trim());

/**
 * Why a shortcode can't be used, or undefined when it can.
 */
export const shortcodeError = (
  shortcode: string,
  isTaken: (shortcode: string) => boolean
): string | undefined => {
  if (!shortcode) return 'Name can’t be empty';
  if (shortcode.includes(':')) return 'Name can’t contain “:”';
  if (isTaken(shortcode)) return `“${shortcode}” is already in this pack`;
  return undefined;
};

export const withImage = (content: PackContent, shortcode: string, image: PackImage) => ({
  ...content,
  images: { ...content.images, [shortcode]: image },
});

export const withoutImage = (content: PackContent, shortcode: string): PackContent => {
  const images = { ...content.images };
  delete images[shortcode];
  return { ...content, images };
};

export const withRenamedImage = (content: PackContent, from: string, to: string): PackContent => {
  const image = content.images?.[from];
  if (!image) throw new Error(`“${from}” is no longer in this pack`);
  return withImage(withoutImage(content, from), to, image);
};

export const withPackName = (content: PackContent, name: string): PackContent => ({
  ...content,
  pack: { ...content.pack, display_name: name },
});

const addressKey = (address: PackAddress | undefined): string =>
  address ? `${address.roomId}\u0000${address.stateKey}` : '';

const readLiveEvent = (mx: MatrixClient, address: PackAddress | undefined) => {
  if (!address) return getAccountData(mx, AccountDataEvent.PoniesUserEmotes);
  const room = mx.getRoom(address.roomId);
  return room ? getStateEvent(room, StateEvent.PoniesRoomEmotes, address.stateKey) : undefined;
};

// What we last wrote to a pack, until the server's echo (or anyone's newer write) replaces the
// live event it was based on. Lets quick successive edits build on each other.
const written = new Map<string, { base: MatrixEvent | undefined; content: PackContent }>();
const queues = new Map<string, Promise<unknown>>();

export const readPackContent = (
  mx: MatrixClient,
  address: PackAddress | undefined
): PackContent => {
  const key = addressKey(address);
  const live = readLiveEvent(mx, address);
  const last = written.get(key);
  if (last && last.base === live) return last.content;
  written.delete(key);
  return (live?.getContent() as PackContent | undefined) ?? {};
};

/**
 * Commit a change to a pack at once. Changes to the same pack run one after another, each on
 * the newest content, so an edit never undoes the one before it.
 */
export const updatePack = (
  mx: MatrixClient,
  address: PackAddress | undefined,
  change: (content: PackContent) => PackContent
): Promise<PackContent> => {
  const key = addressKey(address);
  const run = async () => {
    const base = readLiveEvent(mx, address);
    const next = change(readPackContent(mx, address));
    if (address) {
      await mx.sendStateEvent(address.roomId, StateEvent.PoniesRoomEmotes, next, address.stateKey);
    } else {
      await mx.setAccountData(AccountDataEvent.PoniesUserEmotes, next);
    }
    written.set(key, { base, content: next });
    return next;
  };
  const queued = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(run);
  queues.set(key, queued);
  return queued;
};

/**
 * A room pack is deleted by sending empty content to its state key.
 */
export const deleteRoomPack = (mx: MatrixClient, address: PackAddress) =>
  updatePack(mx, address, () => ({}));

export const createRoomPack = async (
  mx: MatrixClient,
  room: Room,
  name: string,
  usage: ImageUsage[]
): Promise<PackAddress> => {
  const stateKeys = new Set(
    getStateEvents(room, StateEvent.PoniesRoomEmotes).map((mEvent) => mEvent.getStateKey())
  );
  const isTaken = (key: string) => stateKeys.has(key);
  let stateKey = name.trim().replace(/\s+/g, '-');
  if (isTaken(stateKey)) stateKey = suffixRename(stateKey, isTaken);

  const address = new PackAddress(room.roomId, stateKey);
  await updatePack(mx, address, () => ({
    pack: { display_name: name.trim(), usage },
    images: {},
  }));
  return address;
};

/**
 * Show a room pack in every room, through `im.ponies.emote_rooms`.
 */
export const enableGlobalPack = async (mx: MatrixClient, address: PackAddress) => {
  const content =
    (getAccountData(mx, AccountDataEvent.PoniesEmoteRooms)?.getContent() as
      | EmoteRoomsContent
      | undefined) ?? {};
  const rooms = { ...content.rooms };
  rooms[address.roomId] = { ...rooms[address.roomId], [address.stateKey]: {} };
  await mx.setAccountData(AccountDataEvent.PoniesEmoteRooms, { ...content, rooms });
};
