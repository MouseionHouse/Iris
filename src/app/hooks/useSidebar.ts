import { useAtomValue } from 'jotai';
import { useCallback, useMemo } from 'react';
import { useMatrixClient } from './useMatrixClient';
import { mDirectAtom } from '../state/mDirectList';
import { roomToParentsAtom } from '../state/room/roomToParents';
import { allRoomsAtom } from '../state/room-list/roomList';
import { useDirects, useOrphanRooms } from '../state/hooks/roomList';
import { roomToUnreadAtom } from '../state/room/roomToUnread';
import { useSelectedRoom } from './router/useSelectedRoom';
import {
  buildSidebar,
  customSectionTag,
  effectiveSections,
  moveSection,
  replaceSection,
  roomTagSet,
  roomTagsVersionAtom,
  SectionFilterOverride,
  SectionView,
  SIDEBAR_EVENT_TYPE,
  sidebarSectionsAtom,
  SidebarRoom,
  SidebarSection,
  STARRED_TAG,
  CUSTOM_TAG_PREFIX,
} from '../state/sidebar';

/** Every conversation Home lists: rooms outside spaces plus direct chats. */
export const useHomeConversations = (): string[] => {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const roomToParents = useAtomValue(roomToParentsAtom);
  const orphans = useOrphanRooms(mx, allRoomsAtom, mDirects, roomToParents);
  const directs = useDirects(mx, allRoomsAtom, mDirects);
  return useMemo(() => Array.from(new Set([...orphans, ...directs])), [orphans, directs]);
};

export type Sidebar = {
  sections: SidebarSection[];
  views: SectionView[];
  save: (sections: SidebarSection[]) => Promise<unknown>;
  update: (section: SidebarSection, updated: SidebarSection) => Promise<unknown>;
  move: (section: SidebarSection, up: boolean) => Promise<unknown>;
  create: (name: string, emoji?: string) => Promise<unknown>;
  rename: (section: SidebarSection, name: string, emoji?: string) => Promise<unknown>;
  remove: (section: SidebarSection) => Promise<unknown>;
  /** Slack "Move to…": the room leaves every section (Starred included) for `tag`; undefined = back to Chats / Rooms. */
  moveRoom: (roomId: string, tag: string | undefined) => Promise<unknown>;
};

export const useSidebar = (override?: SectionFilterOverride): Sidebar => {
  const mx = useMatrixClient();
  const conversations = useHomeConversations();
  const mDirects = useAtomValue(mDirectAtom);
  const stored = useAtomValue(sidebarSectionsAtom);
  const tagsVersion = useAtomValue(roomTagsVersionAtom);
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const selectedId = useSelectedRoom();

  const tagsByRoom = useMemo(() => {
    const map = new Map<string, Set<string>>();
    conversations.forEach((id) => map.set(id, roomTagSet(mx.getRoom(id))));
    return map;
    // tagsVersion is the signal that room.tags changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mx, conversations, tagsVersion]);

  const sections = useMemo(() => {
    const inUse = new Set<string>();
    tagsByRoom.forEach((tags) => tags.forEach((t) => inUse.add(t)));
    return effectiveSections(stored, inUse);
  }, [stored, tagsByRoom]);

  const views = useMemo(() => {
    const rooms: SidebarRoom[] = conversations.flatMap((id) => {
      const room = mx.getRoom(id);
      if (!room) return [];
      const unread = roomToUnread.get(id);
      return [
        {
          roomId: id,
          name: room.name,
          direct: mDirects.has(id),
          lastActivity: room.getLastActiveTimestamp(),
          tags: tagsByRoom.get(id) ?? new Set(),
          unread: unread !== undefined,
          highlight: (unread?.highlight ?? 0) > 0,
        },
      ];
    });
    return buildSidebar(sections, rooms, selectedId, Date.now(), override);
  }, [mx, conversations, mDirects, roomToUnread, tagsByRoom, sections, selectedId, override]);

  const save = useCallback(
    (next: SidebarSection[]) => mx.setAccountData(SIDEBAR_EVENT_TYPE as any, { sections: next }),
    [mx]
  );
  const update = useCallback(
    (s: SidebarSection, updated: SidebarSection) => save(replaceSection(sections, s.tag, updated)),
    [save, sections]
  );
  const move = useCallback(
    (s: SidebarSection, up: boolean) => save(moveSection(sections, s.tag, up)),
    [save, sections]
  );
  const create = useCallback(
    (name: string, emoji?: string) => {
      const tag = customSectionTag(name);
      if (sections.some((s) => s.tag === tag)) return Promise.resolve();
      const at = sections.findIndex((s) => s.tag === STARRED_TAG) + 1;
      const created: SidebarSection = {
        tag,
        emoji: emoji || undefined,
        sort: 'recency',
        filter: 'all',
        collapsed: false,
      };
      return save([...sections.slice(0, at), created, ...sections.slice(at)]);
    },
    [save, sections]
  );
  const roomsIn = useCallback(
    (tag: string) =>
      Array.from(tagsByRoom.entries())
        .filter(([, tags]) => tags.has(tag))
        .map(([id]) => id),
    [tagsByRoom]
  );
  const rename = useCallback(
    async (s: SidebarSection, name: string, emoji?: string) => {
      const tag = customSectionTag(name);
      if (tag !== s.tag) {
        await Promise.all(
          roomsIn(s.tag).map(async (roomId) => {
            await mx.setRoomTag(roomId, tag, {});
            await mx.deleteRoomTag(roomId, s.tag);
          })
        );
      }
      return save(replaceSection(sections, s.tag, { ...s, tag, emoji: emoji || undefined }));
    },
    [mx, roomsIn, save, sections]
  );
  const remove = useCallback(
    async (s: SidebarSection) => {
      await Promise.all(roomsIn(s.tag).map((roomId) => mx.deleteRoomTag(roomId, s.tag)));
      return save(sections.filter((x) => x.tag !== s.tag));
    },
    [mx, roomsIn, save, sections]
  );
  const moveRoom = useCallback(
    async (roomId: string, tag: string | undefined) => {
      const current = Array.from(tagsByRoom.get(roomId) ?? []).filter(
        (t) => t === STARRED_TAG || t.startsWith(CUSTOM_TAG_PREFIX)
      );
      if (tag && !current.includes(tag)) await mx.setRoomTag(roomId, tag, {});
      await Promise.all(current.filter((t) => t !== tag).map((t) => mx.deleteRoomTag(roomId, t)));
    },
    [mx, tagsByRoom]
  );

  return useMemo(
    () => ({ sections, views, save, update, move, create, rename, remove, moveRoom }),
    [sections, views, save, update, move, create, rename, remove, moveRoom]
  );
};
