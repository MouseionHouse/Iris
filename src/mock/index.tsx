/* eslint-disable react/no-array-index-key */
// Design mocks for the Home page, rendered with the real Cinny/folds components on fake data.
// Open /mock.html on the vite dev server. Not part of the app build.
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import '../index.css';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Box,
  Button,
  Chip,
  Header,
  Icon,
  IconButton,
  Icons,
  Line,
  Menu,
  MenuItem,
  Scroll,
  Text,
  color,
  config,
  configClass,
  lightTheme,
  toRem,
  varsClass,
} from 'folds';
import { onDarkFontWeight, onLightFontWeight } from '../config.css';
import { darkTheme, irisDarkTheme, irisLightTheme, mouseionTheme } from '../colors.css';
import {
  Sidebar,
  SidebarAvatar,
  SidebarContent,
  SidebarItem,
  SidebarItemBadge,
  SidebarStack,
  SidebarStackSeparator,
} from '../app/components/sidebar';
import {
  NavButton,
  NavCategory,
  NavCategoryHeader,
  NavItem,
  NavItemContent,
} from '../app/components/nav';
import { PageNav, PageNavContent, PageNavHeader } from '../app/components/page/Page';
import { RoomNavCategoryButton } from '../app/features/room-nav/RoomNavCategoryButton';
import { UnreadBadge, UnreadBadgeCenter } from '../app/components/unread-badge';
import { ScreenSize, ScreenSizeProvider } from '../app/hooks/useScreenSize';
import {
  AvatarBase,
  MessageBase,
  MessageTextBody,
  ModernLayout,
  Username,
  UsernameBold,
} from '../app/components/message/layout';
import colorMXID from '../util/colorMXID';

// ---------------------------------------------------------------------------------------------
// Fake data: a household. Activity is minutes ago.
type MockRoom = {
  id: string;
  name: string;
  direct: boolean;
  privateRoom?: boolean;
  unread?: number;
  highlight?: boolean;
  activityMin: number;
  favourite?: boolean;
  muted?: boolean;
};

const ROOMS: MockRoom[] = [
  {
    id: '!andromache:example.org',
    name: 'Andromache',
    direct: true,
    unread: 2,
    highlight: true,
    activityMin: 2,
    favourite: true,
  },
  {
    id: '!mouseion:example.org',
    name: 'Mouseion',
    direct: false,
    privateRoom: true,
    unread: 3,
    activityMin: 9,
  },
  { id: '!dad:example.org', name: 'Dad', direct: true, activityMin: 65 },
  { id: '!mum:example.org', name: 'Mum', direct: true, activityMin: 60 * 3 },
  {
    id: '!kitchen:example.org',
    name: 'Kitchen',
    direct: false,
    privateRoom: true,
    activityMin: 60 * 26,
    muted: true,
  },
  {
    id: '!trips:example.org',
    name: 'Trips',
    direct: false,
    unread: 1,
    activityMin: 60 * 24 * 5,
  },
];

const byActivity = (a: MockRoom, b: MockRoom) => a.activityMin - b.activityMin;
const byName = (a: MockRoom, b: MockRoom) => a.name.localeCompare(b.name);

type Variant = 'cinny' | 'a' | 'b' | 'c';
const VARIANTS: { id: Variant; title: string; blurb: string }[] = [
  {
    id: 'cinny',
    title: 'Cinny today',
    blurb: 'Home = rooms only (A→Z). Direct chats live on a separate Direct tab.',
  },
  {
    id: 'a',
    title: 'Option A — Chats above Rooms',
    blurb: 'One Home page: Chats (by activity) over Rooms (A→Z). No Direct tab.',
  },
  {
    id: 'b',
    title: 'Option B — One list by activity',
    blurb: 'Favourites, then everything by latest activity. No Direct tab.',
  },
  {
    id: 'c',
    title: 'Option C — Slack-style sections',
    blurb:
      'Direct tab kept. Home holds every conversation in sections you control: Starred and your own named sections mix chats and rooms; each section has its own sort and filter; a collapsed section keeps showing its unread items. The ⋯ menu is drawn open on “Family” to show the section options (on the real thing it appears on hover).',
  },
];

// ---------------------------------------------------------------------------------------------
// Pieces, written against the same components Cinny's Home/Direct/RoomNavItem use.

function RoomRow({
  room,
  selected,
  showAvatar,
}: {
  room: MockRoom;
  selected?: boolean;
  showAvatar: boolean;
}) {
  const unread = room.unread !== undefined;
  return (
    <NavItem variant="Background" radii="400" highlight={unread} aria-selected={selected}>
      <NavButton>
        <NavItemContent>
          <Box as="span" grow="Yes" alignItems="Center" gap="200">
            <Avatar size="200" radii="400">
              {showAvatar ? (
                <AvatarFallback
                  style={{ backgroundColor: colorMXID(room.id), color: color.Surface.Container }}
                >
                  <Text as="span" size="H6">
                    {room.name[0]}
                  </Text>
                </AvatarFallback>
              ) : (
                <Icon
                  style={{ opacity: unread ? config.opacity.P500 : config.opacity.P300 }}
                  filled={selected}
                  size="100"
                  src={room.privateRoom ? Icons.HashLock : Icons.Hash}
                />
              )}
            </Avatar>
            <Box as="span" grow="Yes">
              <Text priority={unread ? '500' : '300'} as="span" size="Inherit" truncate>
                {room.name}
              </Text>
            </Box>
            {unread && (
              <UnreadBadgeCenter>
                <UnreadBadge highlight={!!room.highlight} count={room.unread ?? 0} />
              </UnreadBadgeCenter>
            )}
            {room.muted && <Icon size="50" src={Icons.BellMute} />}
          </Box>
        </NavItemContent>
      </NavButton>
    </NavItem>
  );
}

function ActionRow({ icon, label }: { icon: typeof Icons[keyof typeof Icons]; label: string }) {
  return (
    <NavItem variant="Background" radii="400">
      <NavButton>
        <NavItemContent>
          <Box as="span" grow="Yes" alignItems="Center" gap="200">
            <Avatar size="200" radii="400">
              <Icon src={icon} size="100" />
            </Avatar>
            <Box as="span" grow="Yes">
              <Text as="span" size="Inherit" truncate>
                {label}
              </Text>
            </Box>
          </Box>
        </NavItemContent>
      </NavButton>
    </NavItem>
  );
}

function Category({
  label,
  rooms,
  showAvatar,
  selectedId,
}: {
  label: string;
  rooms: MockRoom[];
  showAvatar: (r: MockRoom) => boolean;
  selectedId?: string;
}) {
  return (
    <NavCategory>
      <NavCategoryHeader>
        <RoomNavCategoryButton closed={false}>{label}</RoomNavCategoryButton>
      </NavCategoryHeader>
      {rooms.map((room) => (
        <RoomRow
          key={room.id}
          room={room}
          showAvatar={showAvatar(room)}
          selected={room.id === selectedId}
        />
      ))}
    </NavCategory>
  );
}

/** Slack-style section header: caret + emoji + name (Cinny's category button), and + / ⋯ that Slack shows on hover. */
function SectionHeader({
  label,
  emoji,
  closed,
  actions,
}: {
  label: string;
  emoji?: string;
  closed?: boolean;
  actions?: boolean;
}) {
  return (
    <NavCategoryHeader>
      <Box grow="Yes" alignItems="Center" gap="100">
        <Box grow="Yes">
          <RoomNavCategoryButton closed={closed}>
            {emoji ? `${emoji}  ${label}` : label}
          </RoomNavCategoryButton>
        </Box>
        {actions && (
          <Box shrink="No" gap="100">
            <IconButton size="300" radii="300" variant="Background" aria-label="Add to section">
              <Icon size="50" src={Icons.Plus} />
            </IconButton>
            <IconButton
              size="300"
              radii="300"
              variant="Background"
              aria-label="Section options"
              aria-pressed={label === 'Family'}
            >
              <Icon size="50" src={Icons.VerticalDots} />
            </IconButton>
          </Box>
        )}
      </Box>
    </NavCategoryHeader>
  );
}

function SectionOptionsMenu() {
  const item = (label: string, checked?: boolean, danger?: boolean) => (
    <MenuItem
      size="300"
      radii="300"
      variant={danger ? 'Critical' : 'Surface'}
      fill="None"
      after={checked ? <Icon size="100" src={Icons.Check} /> : undefined}
    >
      <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
        {label}
      </Text>
    </MenuItem>
  );
  return (
    <Menu style={{ width: toRem(200) }}>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <Text size="L400" style={{ padding: `0 ${config.space.S200}` }}>
          Sort
        </Text>
        {item('Alphabetically')}
        {item('Recent activity', true)}
        {item('Priority')}
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <Text size="L400" style={{ padding: `0 ${config.space.S200}` }}>
          Show
        </Text>
        {item('All conversations', true)}
        {item('Unreads only')}
        {item('Mentions only')}
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        {item('Move section up')}
        {item('Rename section')}
        {item('Create new section')}
        {item('Delete section', false, true)}
      </Box>
    </Menu>
  );
}

function NavHeader({ title }: { title: string }) {
  return (
    <PageNavHeader>
      <Box alignItems="Center" grow="Yes" gap="300">
        <Box grow="Yes">
          <Text size="H4" truncate>
            {title}
          </Text>
        </Box>
        <Box>
          <IconButton variant="Background">
            <Icon src={Icons.VerticalDots} size="200" />
          </IconButton>
        </Box>
      </Box>
    </PageNavHeader>
  );
}

/** The room-list column for each variant. `page` is which sidebar tab is open (Cinny today only). */
function HomeNav({
  variant,
  page,
  selectedId,
}: {
  variant: Variant;
  page: 'home' | 'direct';
  selectedId?: string;
}) {
  const chats = ROOMS.filter((r) => r.direct).sort(byActivity);
  const rooms = ROOMS.filter((r) => !r.direct).sort(byName);
  const favourites = ROOMS.filter((r) => r.favourite).sort(byActivity);
  const rest = ROOMS.filter((r) => !r.favourite).sort(byActivity);
  const isDirect = (r: MockRoom) => r.direct;

  if ((variant === 'cinny' || variant === 'c') && page === 'direct') {
    return (
      <PageNav>
        <NavHeader title="Direct Messages" />
        <PageNavContent>
          <Box direction="Column" gap="300">
            <NavCategory>
              <ActionRow icon={Icons.Plus} label="Create Chat" />
            </NavCategory>
            <Category label="Chats" rooms={chats} showAvatar={() => true} selectedId={selectedId} />
          </Box>
        </PageNavContent>
      </PageNav>
    );
  }
  return (
    <PageNav>
      <NavHeader title="Home" />
      <PageNavContent>
        <Box direction="Column" gap="300">
          <NavCategory>
            <ActionRow icon={Icons.Plus} label="Create Room" />
            {variant !== 'cinny' && <ActionRow icon={Icons.Plus} label="Create Chat" />}
            <ActionRow icon={Icons.Link} label="Join with Address" />
            <ActionRow icon={Icons.Search} label="Message Search" />
          </NavCategory>
          {variant === 'cinny' && (
            <Category
              label="Rooms"
              rooms={rooms}
              showAvatar={() => false}
              selectedId={selectedId}
            />
          )}
          {variant === 'a' && (
            <>
              <Category
                label="Chats"
                rooms={chats}
                showAvatar={() => true}
                selectedId={selectedId}
              />
              <Category
                label="Rooms"
                rooms={rooms}
                showAvatar={() => false}
                selectedId={selectedId}
              />
            </>
          )}
          {variant === 'b' && (
            <>
              {favourites.length > 0 && (
                <Category
                  label="Favourites"
                  rooms={favourites}
                  showAvatar={isDirect}
                  selectedId={selectedId}
                />
              )}
              <Category label="All" rooms={rest} showAvatar={isDirect} selectedId={selectedId} />
            </>
          )}
          {variant === 'c' && (
            <>
              <NavCategory>
                <SectionHeader label="Starred" emoji="⭐" actions />
                {ROOMS.filter((r) => ['Andromache', 'Mouseion'].includes(r.name))
                  .sort(byActivity)
                  .map((r) => (
                    <RoomRow
                      key={r.id}
                      room={r}
                      showAvatar={r.direct}
                      selected={r.id === selectedId}
                    />
                  ))}
              </NavCategory>
              <NavCategory>
                <SectionHeader label="Family" emoji="🏡" actions />
                {ROOMS.filter((r) => ['Dad', 'Kitchen'].includes(r.name))
                  .sort(byName)
                  .map((r) => (
                    <RoomRow
                      key={r.id}
                      room={r}
                      showAvatar={r.direct}
                      selected={r.id === selectedId}
                    />
                  ))}
              </NavCategory>
              <NavCategory>
                <SectionHeader label="Chats" actions />
                {ROOMS.filter((r) => r.name === 'Mum').map((r) => (
                  <RoomRow key={r.id} room={r} showAvatar selected={r.id === selectedId} />
                ))}
              </NavCategory>
              <NavCategory>
                <SectionHeader label="Rooms" closed actions />
                {/* collapsed: only its unread conversations stay visible */}
                {ROOMS.filter((r) => r.name === 'Trips').map((r) => (
                  <RoomRow key={r.id} room={r} showAvatar={false} selected={r.id === selectedId} />
                ))}
              </NavCategory>
            </>
          )}
        </Box>
      </PageNavContent>
    </PageNav>
  );
}

function SideItem({
  icon,
  active,
  badge,
  highlight,
  label,
}: {
  icon: typeof Icons[keyof typeof Icons];
  active?: boolean;
  badge?: number;
  highlight?: boolean;
  label: string;
}) {
  return (
    <SidebarItem active={active}>
      <SidebarAvatar as="button" outlined aria-label={label}>
        <Icon src={icon} filled={active} />
      </SidebarAvatar>
      {badge !== undefined && (
        <SidebarItemBadge hasCount={badge > 0}>
          <UnreadBadge highlight={highlight} count={badge} />
        </SidebarItemBadge>
      )}
    </SidebarItem>
  );
}

function SideNav({
  variant,
  page,
  onPage,
}: {
  variant: Variant;
  page: 'home' | 'direct';
  onPage: (p: 'home' | 'direct') => void;
}) {
  const chatUnread = ROOMS.filter((r) => r.direct).reduce((n, r) => n + (r.unread ?? 0), 0);
  const roomUnread = ROOMS.filter((r) => !r.direct).reduce((n, r) => n + (r.unread ?? 0), 0);
  const chatHighlight = ROOMS.some((r) => r.direct && r.highlight);
  return (
    <Sidebar>
      <SidebarContent
        scrollable={
          <Scroll variant="Background" size="0">
            <SidebarStack>
              <div onClick={() => onPage('home')} role="presentation">
                <SideItem
                  icon={Icons.Home}
                  active={page === 'home'}
                  label="Home"
                  badge={variant === 'cinny' ? roomUnread : chatUnread + roomUnread}
                  highlight={variant !== 'cinny' && chatHighlight}
                />
              </div>
              {(variant === 'cinny' || variant === 'c') && (
                <div onClick={() => onPage('direct')} role="presentation">
                  <SideItem
                    icon={Icons.User}
                    active={page === 'direct'}
                    label="Direct Messages"
                    badge={chatUnread}
                    highlight={chatHighlight}
                  />
                </div>
              )}
            </SidebarStack>
            <SidebarStackSeparator />
            <SidebarStack>
              <SideItem icon={Icons.Explore} label="Explore Community" />
            </SidebarStack>
          </Scroll>
        }
        sticky={
          <>
            <SidebarStackSeparator />
            <SidebarStack>
              <SideItem icon={Icons.Search} label="Search" />
              <SideItem icon={Icons.Inbox} label="Inbox" />
              <SidebarItem>
                <SidebarAvatar as="button" aria-label="User Settings">
                  <AvatarFallback
                    style={{
                      backgroundColor: colorMXID('@hector:example.org'),
                      color: color.Surface.Container,
                    }}
                  >
                    <Text size="H4">J</Text>
                  </AvatarFallback>
                </SidebarAvatar>
              </SidebarItem>
            </SidebarStack>
          </>
        }
      />
    </Sidebar>
  );
}

// A stand-in for the open room: Cinny's header and modern message layout on fake messages.
const MESSAGES = [
  {
    who: 'Andromache',
    id: '@andromache:example.org',
    time: '9:41 AM',
    text: 'Are we still on for the market tomorrow?',
  },
  {
    who: 'John',
    id: '@hector:example.org',
    time: '9:44 AM',
    text: 'Yes — I’ll bring the bags. Leaving at 8?',
  },
  {
    who: 'Andromache',
    id: '@andromache:example.org',
    time: '9:45 AM',
    text: 'Perfect. Can you grab the list off the fridge?',
  },
];

function RoomView() {
  return (
    <Box
      direction="Column"
      grow="Yes"
      style={{
        backgroundColor: color.Surface.Container,
        color: color.Surface.OnContainer,
        minWidth: 0,
      }}
    >
      <Header
        size="600"
        variant="Surface"
        style={{
          paddingLeft: config.space.S400,
          paddingRight: config.space.S200,
          borderBottomWidth: config.borderWidth.B300,
        }}
      >
        <Box grow="Yes" alignItems="Center" gap="300">
          <Avatar size="300">
            <AvatarFallback
              style={{
                backgroundColor: colorMXID('!andromache:example.org'),
                color: color.Surface.Container,
              }}
            >
              <Text size="H4">A</Text>
            </AvatarFallback>
          </Avatar>
          <Box direction="Column" grow="Yes">
            <Text size="H3" truncate>
              Andromache
            </Text>
          </Box>
          <IconButton fill="None">
            <Icon size="400" src={Icons.Search} />
          </IconButton>
          <IconButton fill="None">
            <Icon size="400" src={Icons.Pin} />
          </IconButton>
          <IconButton fill="None">
            <Icon size="400" src={Icons.VerticalDots} />
          </IconButton>
        </Box>
      </Header>
      <Box
        grow="Yes"
        direction="Column"
        justifyContent="End"
        style={{ padding: `${config.space.S600} 0` }}
      >
        {MESSAGES.map((m, i) => (
          <MessageBase key={i} space="400">
            <ModernLayout
              before={
                <AvatarBase>
                  <Avatar size="300">
                    <AvatarFallback
                      style={{ backgroundColor: colorMXID(m.id), color: color.Surface.Container }}
                    >
                      <Text size="H4">{m.who[0]}</Text>
                    </AvatarFallback>
                  </Avatar>
                </AvatarBase>
              }
            >
              <Box gap="300" justifyContent="SpaceBetween" alignItems="Baseline" grow="Yes">
                <Username style={{ color: colorMXID(m.id) }}>
                  <Text as="span" size="T400" truncate>
                    <UsernameBold>{m.who}</UsernameBold>
                  </Text>
                </Username>
                <Text as="span" size="T200" priority="300">
                  {m.time}
                </Text>
              </Box>
              <MessageTextBody>{m.text}</MessageTextBody>
            </ModernLayout>
          </MessageBase>
        ))}
      </Box>
      <Box style={{ padding: `0 ${config.space.S400} ${config.space.S200}` }}>
        <Box
          alignItems="Center"
          style={{
            backgroundColor: color.SurfaceVariant.Container,
            color: color.SurfaceVariant.OnContainer,
            boxShadow: `inset 0 0 0 ${config.borderWidth.B300} ${color.SurfaceVariant.ContainerLine}`,
            borderRadius: config.radii.R400,
          }}
        >
          <Box style={{ padding: config.space.S200 }}>
            <IconButton variant="SurfaceVariant" size="300" radii="300">
              <Icon src={Icons.PlusCircle} />
            </IconButton>
          </Box>
          <Box grow="Yes">
            <Text
              size="T400"
              style={{ opacity: config.opacity.Placeholder, padding: `${toRem(13)} ${toRem(1)}` }}
            >
              Send a message...
            </Text>
          </Box>
          <Box style={{ padding: config.space.S200 }} gap="100">
            <IconButton variant="SurfaceVariant" size="300" radii="300">
              <Icon src={Icons.Smile} />
            </IconButton>
            <IconButton variant="SurfaceVariant" size="300" radii="300">
              <Icon src={Icons.Send} />
            </IconButton>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------------------------
// Frames

function Frame({
  title,
  width,
  height,
  children,
}: {
  title: string;
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <Box direction="Column" gap="200" shrink="No">
      <Text size="L400" priority="300">
        {title}
      </Text>
      <div
        style={{
          width,
          height,
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          border: `1px solid ${color.Background.ContainerLine}`,
          borderRadius: toRem(12),
          boxShadow: config.shadow.E300,
          backgroundColor: color.Background.Container,
          color: color.Background.OnContainer,
        }}
      >
        {children}
      </div>
    </Box>
  );
}

function Desktop({ variant }: { variant: Variant }) {
  const [page, setPage] = useState<'home' | 'direct'>('home');
  // In "Cinny today", Andromache is only reachable from the Direct tab; the other variants select it on Home.
  const selectedId = variant === 'cinny' && page === 'home' ? undefined : '!andromache:example.org';
  // The Direct tab stays in Option C (and Cinny today); the other two drop it.

  return (
    <ScreenSizeProvider value={ScreenSize.Desktop}>
      <Frame
        title={`Desktop — ${VARIANTS.find((v) => v.id === variant)?.title}`}
        width={1100}
        height={720}
      >
        <SideNav variant={variant} page={page} onPage={setPage} />
        <HomeNav variant={variant} page={page} selectedId={selectedId} />
        {variant === 'c' && page === 'home' && (
          <div style={{ position: 'absolute', left: 300, top: 318, zIndex: 2 }}>
            <SectionOptionsMenu />
          </div>
        )}
        {selectedId ? (
          <RoomView />
        ) : (
          <Box
            grow="Yes"
            alignItems="Center"
            justifyContent="Center"
            style={{ backgroundColor: color.Surface.Container }}
          >
            <Text priority="300">(no room open — Andromache is on the Direct tab)</Text>
          </Box>
        )}
      </Frame>
    </ScreenSizeProvider>
  );
}

function Mobile({ variant }: { variant: Variant }) {
  const [page, setPage] = useState<'home' | 'direct'>('home');
  return (
    <ScreenSizeProvider value={ScreenSize.Mobile}>
      <Frame title="Phone (412 × 892)" width={412} height={892}>
        <SideNav variant={variant} page={page} onPage={setPage} />
        <Box grow="Yes" style={{ minWidth: 0 }}>
          <div style={{ width: '100%', display: 'flex' }} className="mock-mobile-nav">
            <HomeNav variant={variant} page={page} />
          </div>
        </Box>
      </Frame>
    </ScreenSizeProvider>
  );
}

function MockApp() {
  const [variant, setVariant] = useState<Variant>('c');
  const [dark, setDark] = useState(window.location.search.includes('dark'));
  // ?cinny shows Cinny's own Light and Dark, for a before-and-after
  const iris = !window.location.search.includes('cinny');
  // ?hub shows the dark look the Hub frames
  const hub = window.location.search.includes('hub');
  const themeClasses = useMemo(() => {
    if (hub) return ['mouseion-theme', mouseionTheme, onDarkFontWeight];
    if (dark) {
      return iris
        ? ['iris-dark-theme', irisDarkTheme, onDarkFontWeight]
        : ['dark-theme', darkTheme, onDarkFontWeight];
    }
    return iris
      ? ['iris-light-theme', irisLightTheme, onLightFontWeight]
      : [lightTheme, onLightFontWeight];
  }, [dark, iris, hub]);
  React.useEffect(() => {
    document.body.className = '';
    document.body.classList.add(configClass, varsClass, ...themeClasses);
  }, [themeClasses]);
  const current = VARIANTS.find((v) => v.id === variant)!;
  return (
    <div
      style={{
        padding: 24,
        minHeight: '100%',
        boxSizing: 'border-box',
        backgroundColor: color.Background.Container,
        color: color.Background.OnContainer,
      }}
    >
      <Box direction="Column" gap="500">
        <Box direction="Column" gap="200">
          <Text size="H2">Home page: where do direct chats go?</Text>
          <Text priority="300">
            Real Cinny/folds components on fake rooms. Nothing here is wired to a server; clicks
            only switch the variant.
          </Text>
        </Box>
        <Box gap="200" wrap="Wrap" alignItems="Center">
          {VARIANTS.map((v) => (
            <Chip
              key={v.id}
              variant={v.id === variant ? 'Primary' : 'SurfaceVariant'}
              outlined={v.id === variant}
              radii="Pill"
              onClick={() => setVariant(v.id)}
            >
              <Text size="B300">{v.title}</Text>
            </Chip>
          ))}
          <Line direction="Vertical" style={{ height: toRem(16) }} />
          <Chip variant="SurfaceVariant" radii="Pill" onClick={() => setDark(!dark)}>
            <Text size="B300">{dark ? 'Light theme' : 'Dark theme'}</Text>
          </Chip>
        </Box>
        <Text size="T300" priority="400">
          {current.blurb}
        </Text>
        {/* The theme's accent and success colors on the real controls that use them. */}
        <Box gap="300" wrap="Wrap" alignItems="Center">
          <Button size="300" variant="Primary" fill="Solid" radii="300">
            <Text size="B300">Login</Text>
          </Button>
          <Button size="300" variant="Success" fill="Solid" radii="300">
            <Text size="B300">Save</Text>
          </Button>
          <Button size="300" variant="Success" fill="Soft" radii="300">
            <Text size="B300">Join</Text>
          </Button>
          <Badge as="span" size="500" variant="Success" fill="Solid" radii="300">
            <Text size="L400">New Messages</Text>
          </Badge>
          <Chip variant="Success" radii="Pill" outlined>
            <Text size="B300">This Room</Text>
          </Chip>
          <Chip variant="Surface" radii="Pill" outlined>
            <Text size="B300">Global</Text>
          </Chip>
        </Box>
        <Box gap="600" wrap="Wrap" alignItems="Start">
          <Desktop variant={variant} />
          <Mobile variant={variant} />
        </Box>
      </Box>
    </div>
  );
}

const style = document.createElement('style');
style.textContent = `
  #mock-root { width: 100%; height: 100%; overflow: auto; }
  .mock-mobile-nav > * { width: 100% !important; }
`;
document.head.appendChild(style);
createRoot(document.getElementById('mock-root')!).render(<MockApp />);
