import { atom, useSetAtom } from 'jotai';
import { ClientEvent, MatrixClient, MatrixEvent, Room, RoomEvent } from 'matrix-js-sdk';
import { useEffect } from 'react';

/*
 * Slack-style sidebar sections on Matrix (the same model as the native app's Sidebar.kt).
 *
 * Which section a room is in is its room tags: `m.favourite` is Starred and a custom section is a
 * `u.<name>` tag — the tags Element groups by too. Untagged rooms fall into Chats (direct) or Rooms.
 * The list of sections with emoji, sort, filter and collapsed state is the `house.mouseion.sidebar`
 * account-data event, synced across desktop and mobile.
 */

export const SIDEBAR_EVENT_TYPE = 'house.mouseion.sidebar';
export const STARRED_TAG = 'm.favourite';
export const CHATS_SECTION = 'chats';
export const ROOMS_SECTION = 'rooms';
export const CUSTOM_TAG_PREFIX = 'u.';

export type SectionSort = 'alphabetical' | 'recency' | 'priority';
export type SectionFilter = 'all' | 'active' | 'unreads' | 'mentions';

export type SidebarSection = {
  tag: string;
  emoji?: string;
  sort: SectionSort;
  filter: SectionFilter;
  collapsed: boolean;
};

export type SidebarContent = { sections?: SidebarSection[] };

export const sectionName = (section: SidebarSection): string => {
  if (section.tag === STARRED_TAG) return 'Starred';
  if (section.tag === CHATS_SECTION) return 'Chats';
  if (section.tag === ROOMS_SECTION) return 'Rooms';
  return section.tag.slice(CUSTOM_TAG_PREFIX.length);
};
export const isCustomSection = (section: SidebarSection): boolean =>
  section.tag.startsWith(CUSTOM_TAG_PREFIX);
export const customSectionTag = (name: string): string => CUSTOM_TAG_PREFIX + name.trim();

const section = (tag: string, extra: Partial<SidebarSection> = {}): SidebarSection => ({
  tag,
  sort: 'recency',
  filter: 'all',
  collapsed: false,
  ...extra,
});

/** Cinny's calm defaults: Starred, Chats, Rooms (A→Z); no emoji, everything shown. */
export const DEFAULT_SIDEBAR: SidebarSection[] = [
  section(STARRED_TAG),
  section(CHATS_SECTION),
  section(ROOMS_SECTION, { sort: 'alphabetical' }),
];

const normalize = (raw: unknown): SidebarSection | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Partial<SidebarSection>;
  if (typeof s.tag !== 'string') return undefined;
  return section(s.tag, {
    emoji: typeof s.emoji === 'string' && s.emoji ? s.emoji : undefined,
    sort: (['alphabetical', 'recency', 'priority'] as SectionSort[]).includes(s.sort as SectionSort)
      ? (s.sort as SectionSort)
      : 'recency',
    filter: (['all', 'active', 'unreads', 'mentions'] as SectionFilter[]).includes(
      s.filter as SectionFilter
    )
      ? (s.filter as SectionFilter)
      : 'all',
    collapsed: s.collapsed === true,
  });
};

export const parseSidebar = (event: MatrixEvent | undefined): SidebarSection[] | undefined => {
  const content = event?.getContent() as SidebarContent | undefined;
  if (!content || !Array.isArray(content.sections)) return undefined;
  const list = (content.sections as unknown[])
    .map(normalize)
    .filter((s: SidebarSection | undefined): s is SidebarSection => !!s);
  return list.length > 0 ? list : undefined;
};

/**
 * The sections to show: the stored ones (or the defaults), any custom tag found on a room but not
 * listed added after Starred, and the built-ins added when missing.
 */
export const effectiveSections = (
  stored: SidebarSection[] | undefined,
  tagsInUse: Set<string>
): SidebarSection[] => {
  const base = stored && stored.length > 0 ? stored : DEFAULT_SIDEBAR;
  const known = new Set(base.map((s) => s.tag));
  const unlisted = Array.from(tagsInUse)
    .filter((t) => t.startsWith(CUSTOM_TAG_PREFIX) && !known.has(t))
    .sort()
    .map((t) => section(t));
  let withCustom = base;
  if (unlisted.length > 0) {
    const starredAt = base.findIndex((s) => s.tag === STARRED_TAG);
    withCustom = [...base.slice(0, starredAt + 1), ...unlisted, ...base.slice(starredAt + 1)];
  }
  const missing = DEFAULT_SIDEBAR.filter((d) => !withCustom.some((s) => s.tag === d.tag));
  return [...withCustom, ...missing];
};

export type SidebarRoom = {
  roomId: string;
  name: string;
  direct: boolean;
  lastActivity: number;
  tags: Set<string>;
  unread: boolean;
  highlight: boolean;
};

export type SectionView = { section: SidebarSection; rooms: SidebarRoom[]; hidden: number };

/** A filter set on the device for now, in place of each section's own synced filter. */
export type SectionFilterOverride = 'unreads' | 'mentions';

export const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const byName = (a: SidebarRoom, b: SidebarRoom) =>
  a.name.replace(/#/g, '').toLowerCase().localeCompare(b.name.replace(/#/g, '').toLowerCase());
const byRecency = (a: SidebarRoom, b: SidebarRoom) => b.lastActivity - a.lastActivity;
const byPriority = (a: SidebarRoom, b: SidebarRoom) =>
  Number(b.highlight) - Number(a.highlight) ||
  Number(b.unread) - Number(a.unread) ||
  byRecency(a, b);

export const sortRooms = (rooms: SidebarRoom[], sort: SectionSort): SidebarRoom[] => {
  let cmp = byRecency;
  if (sort === 'alphabetical') cmp = byName;
  if (sort === 'priority') cmp = byPriority;
  return [...rooms].sort(cmp);
};

/**
 * Each section's rooms after sort, filter and collapse. A collapsed section keeps only its unread
 * rooms; the selected room always stays. Empty built-in sections are left out, custom ones stay.
 *
 * With `override`, every section is filtered by it instead, folded or not, and a section it
 * leaves empty is left out, custom ones included.
 */
export const buildSidebar = (
  sections: SidebarSection[],
  rooms: SidebarRoom[],
  selectedId: string | undefined,
  now: number,
  override?: SectionFilterOverride
): SectionView[] => {
  const listed = new Set(sections.map((s) => s.tag));
  const members = (s: SidebarSection): SidebarRoom[] => {
    if (s.tag === CHATS_SECTION)
      return rooms.filter((r) => r.direct && !Array.from(r.tags).some((t) => listed.has(t)));
    if (s.tag === ROOMS_SECTION)
      return rooms.filter((r) => !r.direct && !Array.from(r.tags).some((t) => listed.has(t)));
    return rooms.filter((r) => r.tags.has(s.tag));
  };
  const views: SectionView[] = [];
  sections.forEach((s) => {
    const all = members(s);
    if (all.length === 0 && !isCustomSection(s)) return;
    const shown = sortRooms(all, s.sort).filter((r) => {
      if (r.roomId === selectedId) return true;
      if (override) return override === 'mentions' ? r.highlight : r.unread;
      if (s.collapsed) return r.unread;
      switch (s.filter) {
        case 'active':
          return now - r.lastActivity <= ACTIVE_WINDOW_MS || r.unread;
        case 'unreads':
          return r.unread;
        case 'mentions':
          return r.highlight;
        default:
          return true;
      }
    });
    if (override && shown.length === 0) return;
    views.push({ section: s, rooms: shown, hidden: all.length - shown.length });
  });
  return views;
};

export const replaceSection = (
  list: SidebarSection[],
  tag: string,
  updated: SidebarSection
): SidebarSection[] => list.map((s) => (s.tag === tag ? updated : s));

export const moveSection = (list: SidebarSection[], tag: string, up: boolean): SidebarSection[] => {
  const i = list.findIndex((s) => s.tag === tag);
  const j = up ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

// ---------------------------------------------------------------------------------------------
// Atoms: the stored sections, and a counter that bumps whenever any room's tags change so lists
// re-read `room.tags`.

const baseSidebarAtom = atom<SidebarSection[] | undefined>(undefined);
export const sidebarSectionsAtom = atom(
  (get) => get(baseSidebarAtom),
  (get, set, sections: SidebarSection[] | undefined) => set(baseSidebarAtom, sections)
);

export const roomTagsVersionAtom = atom(0);

export const useBindSidebarAtoms = (mx: MatrixClient) => {
  const setSidebar = useSetAtom(sidebarSectionsAtom);
  const bumpTags = useSetAtom(roomTagsVersionAtom);

  useEffect(() => {
    setSidebar(parseSidebar(mx.getAccountData(SIDEBAR_EVENT_TYPE as any)));
    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() === SIDEBAR_EVENT_TYPE) setSidebar(parseSidebar(event));
    };
    const handleTags = () => bumpTags((v) => v + 1);
    mx.on(ClientEvent.AccountData, handleAccountData);
    mx.on(RoomEvent.Tags, handleTags);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
      mx.removeListener(RoomEvent.Tags, handleTags);
    };
  }, [mx, setSidebar, bumpTags]);
};

export const roomTagSet = (room: Room | null | undefined): Set<string> =>
  new Set(Object.keys(room?.tags ?? {}));

/** The section (Starred or custom) a room sits in, if any. */
export const roomSection = (
  sections: SidebarSection[],
  room: Room | null | undefined
): SidebarSection | undefined => {
  const tags = roomTagSet(room);
  return sections.find(
    (s) => s.tag !== CHATS_SECTION && s.tag !== ROOMS_SECTION && tags.has(s.tag)
  );
};
