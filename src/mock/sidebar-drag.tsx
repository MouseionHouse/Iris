// Dragging in Home's sidebar (mouseion/iris#50), for checking it without a homeserver: the app's
// own section header and drag code over fake sections and stand-in rows. A fake Sidebar keeps the
// sections and each room's tag, and logs every `save` and `moveRoom` call to window.__calls.
//
// Open /mock-sidebar-drag.html on the vite dev server. ?dark and ?light override the system
// setting and ?h= sets the height of the list in px. Not part of the app build.
import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import '../index.css';
import {
  OverlayContainerProvider,
  PopOutContainerProvider,
  Text,
  configClass,
  varsClass,
} from 'folds';
import { onDarkFontWeight, onLightFontWeight } from '../config.css';
import { irisDarkTheme, irisLightTheme } from '../colors.css';
import { ScreenSize, ScreenSizeProvider } from '../app/hooks/useScreenSize';
import { Sidebar } from '../app/hooks/useSidebar';
import {
  CHATS_SECTION,
  ROOMS_SECTION,
  STARRED_TAG,
  SidebarRoom,
  SidebarSection,
  buildSidebar,
  moveSection,
  replaceSection,
} from '../app/state/sidebar';
import { SidebarSectionHeader } from '../app/features/room-nav/SidebarSectionHeader';
import { SidebarDragTile, useSidebarDrag } from '../app/features/room-nav/sidebarDrag';
import { NavCategory } from '../app/components/nav';
import { PageNav, PageNavContent } from '../app/components/page';

declare global {
  interface Window {
    __calls: { fn: string; args: unknown[] }[];
  }
}
window.__calls = [];
const params = new URLSearchParams(window.location.search);
const log = (fn: string, ...args: unknown[]) => window.__calls.push({ fn, args });

const section = (tag: string, extra: Partial<SidebarSection> = {}): SidebarSection => ({
  tag,
  sort: 'alphabetical',
  filter: 'all',
  collapsed: false,
  ...extra,
});

const room = (name: string, direct: boolean, tags: string[] = []): SidebarRoom => ({
  roomId: `!${name.toLowerCase()}:example.org`,
  name,
  direct,
  lastActivity: 0,
  tags: new Set(tags),
  unread: false,
  highlight: false,
});

// A plain square for every avatar; it only has to be an <img>.
const AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23888'/%3E%3C/svg%3E";

const FAMILY = 'u.Family';
const GARDEN = 'u.Garden';
const START: SidebarRoom[] = [
  room('Andromache', true, [STARRED_TAG]),
  room('Mouseion', false, [STARRED_TAG]),
  room('Dad', true, [FAMILY]),
  room('Kitchen', false, [FAMILY]),
  room('Mum', true),
  room('Sam', true),
  room('Jo', true),
  room('Ana', true),
  ...['Bikes', 'Books', 'Cooking', 'Games', 'Music', 'Photos', 'Recipes', 'Travel'].map((n) =>
    room(n, false)
  ),
];

function App() {
  const [sections, setSections] = useState<SidebarSection[]>([
    section(STARRED_TAG),
    section(FAMILY, { emoji: '🏠' }),
    section(GARDEN, { emoji: '🌱' }),
    section(CHATS_SECTION),
    section(ROOMS_SECTION),
  ]);
  const [rooms, setRooms] = useState(START);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sidebar = useMemo<Sidebar>(() => {
    const save = async (next: SidebarSection[]) => {
      log(
        'save',
        next.map((s) => s.tag)
      );
      setSections(next);
    };
    return {
      sections,
      views: buildSidebar(sections, rooms, undefined, Date.now()),
      save,
      update: (s, updated) => save(replaceSection(sections, s.tag, updated)),
      move: (s, up) => save(moveSection(sections, s.tag, up)),
      create: async () => log('create'),
      rename: async () => log('rename'),
      remove: async () => log('remove'),
      moveRoom: async (roomId, tag) => {
        log('moveRoom', roomId, tag);
        setRooms((all) =>
          all.map((r) => (r.roomId === roomId ? { ...r, tags: new Set(tag ? [tag] : []) } : r))
        );
      },
    };
  }, [sections, rooms]);

  const drag = useSidebarDrag({
    scrollRef,
    enabled: true,
    sections: sidebar.sections,
    save: sidebar.save,
    moveRoom: sidebar.moveRoom,
  });

  return (
    <div
      style={{ display: 'flex', width: 280, height: Number(params.get('h') ?? 440), margin: 24 }}
    >
      <PageNav>
        <PageNavContent scrollRef={scrollRef}>
          <NavCategory>
            {sidebar.views.map((view) => (
              <React.Fragment key={view.section.tag}>
                <SidebarDragTile
                  tag={view.section.tag}
                  header
                  drag={drag}
                  first
                  last={view.rooms.length === 0}
                >
                  <SidebarSectionHeader
                    view={view}
                    sidebar={sidebar}
                    onNewSection={() => log('newSection')}
                    onRename={() => log('renameSection')}
                    onDelete={() => log('deleteSection')}
                  />
                </SidebarDragTile>
                {view.rooms.map((r, i) => (
                  <SidebarDragTile
                    key={r.roomId}
                    tag={view.section.tag}
                    roomId={r.roomId}
                    direct={r.direct}
                    drag={drag}
                    last={i === view.rooms.length - 1}
                  >
                    {/* A link with an avatar image, as RoomNavItem renders a row: both are
                        drag sources of their own in a browser (#52). */}
                    <a
                      href={`#/home/${r.roomId}`}
                      data-room={r.name}
                      onClick={(evt) => {
                        evt.preventDefault();
                        log('open', r.roomId);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        boxSizing: 'border-box',
                        width: '100%',
                        height: 38,
                        padding: '0 12px',
                        color: 'inherit',
                        textDecoration: 'none',
                      }}
                    >
                      <img
                        src={AVATAR}
                        alt=""
                        data-avatar={r.name}
                        width={24}
                        height={24}
                        style={{ borderRadius: 8 }}
                      />
                      <Text as="span" size="T400">
                        {r.direct ? '@ ' : '# '}
                        {r.name}
                      </Text>
                    </a>
                  </SidebarDragTile>
                ))}
              </React.Fragment>
            ))}
          </NavCategory>
        </PageNavContent>
      </PageNav>
    </div>
  );
}

const dark = params.has('dark')
  ? true
  : !params.has('light') && window.matchMedia('(prefers-color-scheme: dark)').matches;
document.body.classList.add(
  configClass,
  varsClass,
  ...(dark
    ? ['iris-dark-theme', irisDarkTheme, onDarkFontWeight]
    : ['iris-light-theme', irisLightTheme, onLightFontWeight])
);

const portalContainer = document.getElementById('portalContainer') ?? undefined;

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById('mock-root')!).render(
  <ScreenSizeProvider value={ScreenSize.Desktop}>
    <PopOutContainerProvider value={portalContainer}>
      <OverlayContainerProvider value={portalContainer}>
        <App />
      </OverlayContainerProvider>
    </PopOutContainerProvider>
  </ScreenSizeProvider>
);
