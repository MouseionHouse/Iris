// The build of Home on a phone, for checking its look without a homeserver:
// the app's own row, section header, chip row, + button and sheets, on fake rooms. The pieces
// that read a Matrix room are left out; what they render is what is here.
//
// Under the list is the bottom bar, and its tabs work: DMs, Activity, Search and You show the
// presentational parts of those pages on the same fake household.
//
// Open /mock-home-phone-build.html on the vite dev server, on a phone or in a phone-sized
// window. ?dark and ?light override the system setting. ?sheet=create|row|section|places opens
// a sheet from the start and ?filter=unreads|mentions sets the chip row, for a capture.
// ?tab=direct|activity|search|you opens a tab, ?term= fills the search field, and ?inset=24
// pretends the display has a gesture area that tall under the app.
// Not part of the app build.
import React, { ReactNode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import '../index.css';
import {
  Box,
  Icon,
  IconSrc,
  Icons,
  Line,
  MenuItem,
  OverlayContainerProvider,
  PopOutContainerProvider,
  Text,
  color,
  config,
  configClass,
  varsClass,
} from 'folds';
import { onDarkFontWeight, onLightFontWeight } from '../config.css';
import { irisDarkTheme, irisLightTheme } from '../colors.css';
import { BottomSheet, BottomSheetMenu } from '../app/components/bottom-sheet';
import { RoomAvatar } from '../app/components/room-avatar';
import { UserAvatar } from '../app/components/user-avatar';
import { RoomRow, RoomRowIconTile } from '../app/features/room-nav/RoomRow';
import {
  ListFab,
  ListFilterChips,
  SectionHeaderTouch,
  SheetAction,
  SheetActions,
  TouchIconButton,
  TouchListArea,
  TouchListEmpty,
} from '../app/features/room-nav/TouchList';
import * as css from '../app/features/room-nav/touch.css';
import { SETTINGS_MENU_ITEMS } from '../app/features/settings/menu';
import { BottomNavAvatar, BottomNavBar, BottomNavItem } from '../app/pages/client/BottomNavBar';
import { ActivitySwitch } from '../app/pages/client/inbox/ActivityTouch';
import {
  MessageSearchRow,
  SearchField,
  SearchListLabel,
  SearchListNote,
} from '../app/pages/client/search/SearchTouchView';
import { YouProfile, YouRow, YouRows, YouWarningRow } from '../app/pages/client/you/YouView';
import { BottomNavTab } from '../app/pages/mobileNav';
import { ScreenSize, ScreenSizeProvider } from '../app/hooks/useScreenSize';
import { ListFilter } from '../app/state/listFilter';
import { RoomPreview } from '../app/utils/roomPreview';
import { timeShortStamp } from '../app/utils/time';

// ---------------------------------------------------------------------------------------------
// Fake data: a household. Times are offsets from now, so the stamps are the real function's.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type SectionId = 'starred' | 'family' | 'chats' | 'rooms';
type Conv = {
  id: string;
  name: string;
  direct: boolean;
  privateRoom?: boolean;
  section: SectionId;
  unread?: number;
  highlight?: boolean;
  muted?: boolean;
  typing?: boolean;
  live?: number;
  ago: number;
  preview: RoomPreview;
};

const CONVS: Conv[] = [
  {
    id: '!andromache:example.org',
    name: 'Andromache',
    direct: true,
    section: 'starred',
    unread: 2,
    highlight: true,
    ago: 4 * MINUTE,
    preview: { text: 'Can you grab the list off the fridge?' },
  },
  {
    id: '!mouseion:example.org',
    name: 'Mouseion',
    direct: false,
    privateRoom: true,
    section: 'starred',
    unread: 3,
    ago: 11 * MINUTE,
    preview: { sender: 'Andromache', text: 'The new icon is on my phone now' },
  },
  {
    id: '!dad:example.org',
    name: 'Dad',
    direct: true,
    section: 'family',
    ago: 67 * MINUTE,
    preview: { sender: 'You', text: 'Sunday works, we will bring dessert' },
  },
  {
    id: '!kitchen:example.org',
    name: 'Kitchen',
    direct: false,
    privateRoom: true,
    section: 'family',
    muted: true,
    ago: DAY,
    preview: { sender: 'Dad', text: 'Who took the good knife, it was in the drawer on Friday' },
  },
  {
    id: '!mum:example.org',
    name: 'Mum',
    direct: true,
    section: 'chats',
    ago: 3 * HOUR,
    preview: { text: 'Photo' },
  },
  {
    id: '!nestor:example.org',
    name: 'Nestor',
    direct: true,
    section: 'chats',
    typing: true,
    ago: 3 * DAY,
    preview: { text: 'See you at the game' },
  },
  {
    id: '!groceries:example.org',
    name: 'Groceries',
    direct: false,
    privateRoom: true,
    section: 'rooms',
    ago: DAY + 2 * HOUR,
    preview: { sender: 'You', text: 'Milk, eggs, coffee filters' },
  },
  {
    id: '!trips:example.org',
    name: 'Trips',
    direct: false,
    section: 'rooms',
    unread: 1,
    ago: 5 * DAY,
    preview: { sender: 'Mum', text: 'Flights are booked for March' },
  },
  {
    id: '!movies:example.org',
    name: 'Movie night',
    direct: false,
    section: 'rooms',
    live: 2,
    ago: 10 * DAY,
    preview: { sender: 'Andromache', text: 'Friday at 8?' },
  },
  {
    id: '!archive:example.org',
    name: 'Old house',
    direct: false,
    section: 'rooms',
    ago: 400 * DAY,
    preview: { text: 'Dad changed the room name' },
  },
];

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'starred', label: '⭐  Starred' },
  { id: 'family', label: '🏡  Family' },
  { id: 'chats', label: 'Chats' },
  { id: 'rooms', label: 'Rooms' },
];

const params = new URLSearchParams(window.location.search);
const NOW = Date.now();

function ConvAvatar({ conv }: { conv: Conv }) {
  if (conv.direct) {
    return (
      <RoomAvatar
        roomId={conv.id}
        alt={conv.name}
        renderFallback={() => (
          <Text as="span" size="H4">
            {conv.name[0]}
          </Text>
        )}
      />
    );
  }
  return (
    <RoomRowIconTile>
      <Icon size="200" src={conv.privateRoom ? Icons.HashLock : Icons.Hash} />
    </RoomRowIconTile>
  );
}

// The items of the app's room menu, as `RoomNavItemMenuItems` renders them.
function RowMenuItems({ onClose }: { onClose: () => void }) {
  const item = (label: string, icon: IconSrc, variant?: 'Primary' | 'Critical') => (
    <MenuItem
      onClick={onClose}
      size="300"
      radii="300"
      variant={variant}
      fill={variant ? 'None' : undefined}
      after={<Icon size="100" src={icon} />}
    >
      <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
        {label}
      </Text>
    </MenuItem>
  );
  return (
    <>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        {item('Mark as Read', Icons.CheckTwice)}
        {item('Notifications', Icons.Bell)}
        {item('Move to…', Icons.Star)}
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        {item('Invite', Icons.UserPlus, 'Primary')}
        {item('Copy Link', Icons.Link)}
        {item('Room Settings', Icons.Setting)}
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        {item('Leave Room', Icons.ArrowGoLeft, 'Critical')}
      </Box>
    </>
  );
}

// The items of the app's section menu, as `SectionOptionsItems` renders them.
function SectionMenuItems({ onClose }: { onClose: () => void }) {
  const item = (label: string, checked?: boolean) => (
    <MenuItem
      size="300"
      radii="300"
      variant="Surface"
      fill="None"
      after={checked ? <Icon size="100" src={Icons.Check} /> : undefined}
      onClick={onClose}
    >
      <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
        {label}
      </Text>
    </MenuItem>
  );
  const heading = (label: string) => (
    <Text size="L400" style={{ padding: `${config.space.S100} ${config.space.S200}` }}>
      {label}
    </Text>
  );
  return (
    <>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        {heading('Sort')}
        {item('Alphabetically')}
        {item('Recent activity', true)}
        {item('Priority')}
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        {heading('Show')}
        {item('All conversations', true)}
        {item('Active only')}
        {item('Unreads only')}
        {item('Mentions only')}
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        {item('Move up')}
        {item('Move down')}
        {item('Create new section')}
      </Box>
    </>
  );
}

type Sheet =
  | { kind: 'create' }
  | { kind: 'places' }
  | { kind: 'row'; conv: Conv }
  | { kind: 'section'; label: string };

const initialSheet = (): Sheet | undefined => {
  switch (params.get('sheet')) {
    case 'create':
      return { kind: 'create' };
    case 'places':
      return { kind: 'places' };
    case 'row':
      return { kind: 'row', conv: CONVS[1] };
    case 'section':
      return { kind: 'section', label: SECTIONS[1].label };
    default:
      return undefined;
  }
};

const initialFilter = (): ListFilter => {
  const asked = params.get('filter');
  return asked === 'unreads' || asked === 'mentions' ? asked : 'all';
};

const ME = { userId: '@hector:example.org', name: 'Hector' };
// one invite waiting, and one other device not verified yet
const INVITES = 1;
const UNVERIFIED = { current: false, others: 1 };

const initialTab = (): BottomNavTab => {
  const asked = params.get('tab');
  return asked === 'direct' || asked === 'activity' || asked === 'search' || asked === 'you'
    ? asked
    : 'home';
};

function ConvRow({ conv }: { conv: Conv }) {
  return (
    <RoomRow
      linkPath="/"
      name={conv.name}
      avatar={<ConvAvatar conv={conv} />}
      time={timeShortStamp(NOW - conv.ago, false, NOW)}
      preview={conv.preview}
      unread={
        conv.unread !== undefined ? { total: conv.unread, highlight: !!conv.highlight } : undefined
      }
      notificationIcon={conv.muted ? Icons.BellMute : undefined}
      onClick={(evt) => evt.preventDefault()}
      onOptions={() => undefined}
    />
  );
}

// DMs on a phone, as `Direct` lays it out: one list, newest first.
function DirectTab() {
  const [filter, setFilter] = useState<ListFilter>('all');
  const directs = CONVS.filter((conv) => conv.direct).sort((a, b) => a.ago - b.ago);
  const shown = directs.filter((conv) => {
    if (filter === 'unreads') return conv.unread !== undefined;
    if (filter === 'mentions') return !!conv.highlight;
    return true;
  });
  return (
    <>
      <header className={css.TouchHeader}>
        <Box grow="Yes">
          <Text size="H3" truncate>
            DMs
          </Text>
        </Box>
        <TouchIconButton src={Icons.VerticalDots} aria-label="More Options" />
      </header>
      <ListFilterChips
        value={filter}
        onChange={setFilter}
        unreadCount={directs.filter((conv) => conv.unread !== undefined).length}
      />
      <TouchListArea fab={<ListFab aria-label="Create Chat" />}>
        {shown.length === 0 && <TouchListEmpty>Nothing here</TouchListEmpty>}
        {shown.map((conv) => (
          <ConvRow key={conv.id} conv={conv} />
        ))}
      </TouchListArea>
    </>
  );
}

// The top of Activity. The feed and the invite cards under it read Matrix and are left out.
function ActivityTab() {
  const [list, setList] = useState<'notifications' | 'invites'>('notifications');
  return (
    <>
      <header className={css.TouchHeader}>
        <Text size="H3" truncate>
          Activity
        </Text>
      </header>
      <ActivitySwitch value={list} onChange={setList} inviteCount={INVITES} />
      <TouchListArea>
        <TouchListEmpty>
          {list === 'invites' ? 'The invite cards go here' : 'The notification feed goes here'}
        </TouchListEmpty>
      </TouchListArea>
    </>
  );
}

// Search, as `SearchTouch` lays it out: the recent chats, then the matches and the way to the messages.
function SearchTab() {
  const [value, setValue] = useState(params.get('term') ?? '');
  const term = value.trim();
  const recent = [...CONVS].sort((a, b) => a.ago - b.ago);
  const shown = term
    ? recent.filter((conv) => conv.name.toLowerCase().includes(term.toLowerCase()))
    : recent;
  return (
    <>
      <SearchField value={value} onChange={setValue} onSubmit={() => undefined} />
      <TouchListArea>
        <SearchListLabel>{term ? 'Chats' : 'Recent'}</SearchListLabel>
        {shown.length === 0 && <SearchListNote>No chat matches.</SearchListNote>}
        {shown.map((conv) => (
          <ConvRow key={conv.id} conv={conv} />
        ))}
        {term && (
          <>
            <SearchListLabel>Messages</SearchListLabel>
            <MessageSearchRow term={term} onClick={() => undefined} />
          </>
        )}
      </TouchListArea>
    </>
  );
}

// You, as `You` lays it out, with another device waiting to be verified.
function YouTab() {
  return (
    <TouchListArea>
      <YouProfile
        avatar={
          <UserAvatar
            userId={ME.userId}
            renderFallback={() => <Text size="H3">{ME.name[0]}</Text>}
          />
        }
        displayName={ME.name}
        userId={ME.userId}
      />
      <YouRows>
        <YouWarningRow unverifiedDevices={UNVERIFIED} onClick={() => undefined} />
      </YouRows>
      <Line variant="Background" size="300" />
      <YouRows>
        {SETTINGS_MENU_ITEMS.map((item) => (
          <YouRow key={item.slug} icon={item.icon} onClick={() => undefined}>
            {item.name}
          </YouRow>
        ))}
      </YouRows>
      <Line variant="Background" size="300" />
      <YouRows>
        <YouRow icon={Icons.Power} critical onClick={() => undefined}>
          Logout
        </YouRow>
      </YouRows>
    </TouchListArea>
  );
}

const unreadOf = (convs: Conv[]) => {
  const unread = convs.filter((conv) => conv.unread !== undefined);
  if (unread.length === 0) return undefined;
  return {
    count: unread.reduce((n, conv) => n + (conv.unread ?? 0), 0),
    highlight: unread.some((conv) => conv.highlight),
  };
};

// The app shell: a page above and the bottom bar below, as `ClientLayout` lays a phone out.
function Shell({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<BottomNavTab>(initialTab);
  const item = (id: BottomNavTab) => ({ active: tab === id, onClick: () => setTab(id) });

  return (
    <div
      style={{
        flexGrow: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: color.Background.Container,
        color: color.Background.OnContainer,
      }}
    >
      <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'home' && children}
        {tab === 'direct' && <DirectTab />}
        {tab === 'activity' && <ActivityTab />}
        {tab === 'search' && <SearchTab />}
        {tab === 'you' && <YouTab />}
      </div>
      <BottomNavBar>
        <BottomNavItem label="Home" icon={Icons.Home} badge={unreadOf(CONVS)} {...item('home')} />
        <BottomNavItem
          label="DMs"
          icon={Icons.User}
          badge={unreadOf(CONVS.filter((conv) => conv.direct))}
          {...item('direct')}
        />
        <BottomNavItem
          label="Activity"
          icon={Icons.Inbox}
          badge={{ count: INVITES, highlight: true }}
          {...item('activity')}
        />
        <BottomNavItem label="Search" icon={Icons.Search} {...item('search')} />
        <BottomNavItem label="You" dot="warning" {...item('you')}>
          <BottomNavAvatar>
            <UserAvatar
              userId={ME.userId}
              renderFallback={() => <Text size="L400">{ME.name[0]}</Text>}
            />
          </BottomNavAvatar>
        </BottomNavItem>
      </BottomNavBar>
    </div>
  );
}

function App() {
  const [filter, setFilter] = useState<ListFilter>(initialFilter);
  const [sheet, setSheet] = useState<Sheet | undefined>(initialSheet);
  // Rooms starts folded, to show the count a folded section carries.
  const [closed, setClosed] = useState<Record<string, boolean>>({ rooms: true });
  const close = () => setSheet(undefined);

  // The rules of `buildSidebar`: a chip filters every section and hides the ones it empties; a
  // folded section keeps its unread rooms.
  const sections = SECTIONS.map((section) => {
    const all = CONVS.filter((conv) => conv.section === section.id);
    const shown = all.filter((conv) => {
      if (filter === 'unreads') return conv.unread !== undefined;
      if (filter === 'mentions') return !!conv.highlight;
      if (closed[section.id]) return conv.unread !== undefined;
      return true;
    });
    return { ...section, shown };
  }).filter((section) => filter === 'all' || section.shown.length > 0);

  return (
    <Shell>
      <header className={css.TouchHeader}>
        <button
          type="button"
          className={css.TouchHeaderTitle}
          aria-pressed={sheet?.kind === 'places'}
          onClick={() => setSheet({ kind: 'places' })}
        >
          <Text as="span" size="H3" truncate>
            Home
          </Text>
          <Icon size="100" src={Icons.ChevronBottom} />
        </button>
      </header>
      <ListFilterChips
        value={filter}
        onChange={setFilter}
        unreadCount={CONVS.filter((conv) => conv.unread !== undefined).length}
      />
      <TouchListArea
        fab={<ListFab aria-label="Create or join" onClick={() => setSheet({ kind: 'create' })} />}
      >
        {sections.length === 0 && <TouchListEmpty>Nothing here</TouchListEmpty>}
        {sections.map((section) => {
          const unread = section.shown.filter((conv) => conv.unread !== undefined);
          return (
            <div key={section.id}>
              <SectionHeaderTouch
                label={section.label}
                closed={!!closed[section.id]}
                unread={
                  unread.length > 0
                    ? {
                        total: unread.reduce((n, conv) => n + (conv.unread ?? 0), 0),
                        highlight: unread.some((conv) => conv.highlight),
                      }
                    : undefined
                }
                onToggle={() => setClosed((c) => ({ ...c, [section.id]: !c[section.id] }))}
                optionsLabel={`${section.label} options`}
                optionsOpen={sheet?.kind === 'section' && sheet.label === section.label}
                onOptions={() => setSheet({ kind: 'section', label: section.label })}
              />
              {section.shown.map((conv) => (
                <RoomRow
                  key={conv.id}
                  linkPath="/"
                  name={conv.name}
                  avatar={<ConvAvatar conv={conv} />}
                  time={timeShortStamp(NOW - conv.ago, false, NOW)}
                  preview={conv.preview}
                  typing={conv.typing}
                  unread={
                    conv.unread !== undefined
                      ? { total: conv.unread, highlight: !!conv.highlight }
                      : undefined
                  }
                  notificationIcon={conv.muted ? Icons.BellMute : undefined}
                  liveCount={conv.live}
                  pressed={sheet?.kind === 'row' && sheet.conv.id === conv.id}
                  onClick={(evt) => evt.preventDefault()}
                  onOptions={() => setSheet({ kind: 'row', conv })}
                />
              ))}
            </div>
          );
        })}
      </TouchListArea>

      {sheet?.kind === 'create' && (
        <BottomSheet open requestClose={close} aria-label="Create or join">
          <SheetActions>
            <SheetAction before={<Icon size="200" src={Icons.Message} />} onClick={close}>
              Create Chat
            </SheetAction>
            <SheetAction before={<Icon size="200" src={Icons.HashPlus} />} onClick={close}>
              Create Room
            </SheetAction>
            <SheetAction before={<Icon size="200" src={Icons.Link} />} onClick={close}>
              Join with Address
            </SheetAction>
            <SheetAction before={<Icon size="200" src={Icons.Explore} />} onClick={close}>
              Explore rooms
            </SheetAction>
          </SheetActions>
        </BottomSheet>
      )}
      {sheet?.kind === 'places' && (
        <BottomSheet open requestClose={close} aria-label="Home and spaces">
          <SheetActions>
            <SheetAction
              before={<Icon size="200" src={Icons.Home} filled />}
              after={<Icon size="100" src={Icons.Check} />}
              current
              onClick={close}
            >
              Home
            </SheetAction>
            {['Mouseion House', 'Book club'].map((name) => (
              <SheetAction
                key={name}
                before={
                  <RoomAvatar
                    roomId={`!${name}:example.org`}
                    alt={name}
                    renderFallback={() => (
                      <Text as="span" size="L400">
                        {name[0]}
                      </Text>
                    )}
                  />
                }
                onClick={close}
              >
                {name}
              </SheetAction>
            ))}
            <SheetAction before={<Icon size="200" src={Icons.Plus} />} onClick={close}>
              Add space
            </SheetAction>
            <Line variant="Surface" size="300" />
            <SheetAction before={<Icon size="200" src={Icons.CheckTwice} />} onClick={close}>
              Mark as Read
            </SheetAction>
          </SheetActions>
        </BottomSheet>
      )}
      {sheet?.kind === 'row' && (
        <BottomSheet
          open
          requestClose={close}
          aria-label="Room Options"
          header={
            <Text className={css.SheetTitle} size="L400" truncate>
              {sheet.conv.name}
            </Text>
          }
        >
          <BottomSheetMenu iconLeading>
            <RowMenuItems onClose={close} />
          </BottomSheetMenu>
        </BottomSheet>
      )}
      {sheet?.kind === 'section' && (
        <BottomSheet
          open
          requestClose={close}
          aria-label="Section options"
          header={
            <Text className={css.SheetTitle} size="L400" truncate>
              {sheet.label}
            </Text>
          }
        >
          <BottomSheetMenu>
            <SectionMenuItems onClose={close} />
          </BottomSheetMenu>
        </BottomSheet>
      )}
    </Shell>
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
const inset = params.get('inset');
if (inset) document.documentElement.style.setProperty('--safe-area-inset-bottom', `${inset}px`);
const style = document.createElement('style');
// the app's #root: it is what keeps the app out of the display's unsafe areas
style.textContent = `#mock-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0 0 var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
}`;
document.head.appendChild(style);

const portalContainer = document.getElementById('portalContainer') ?? undefined;

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById('mock-root')!).render(
  <MemoryRouter>
    <ScreenSizeProvider value={ScreenSize.Mobile}>
      <PopOutContainerProvider value={portalContainer}>
        <OverlayContainerProvider value={portalContainer}>
          <App />
        </OverlayContainerProvider>
      </PopOutContainerProvider>
    </ScreenSizeProvider>
  </MemoryRouter>
);
