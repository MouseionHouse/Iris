// PROTOTYPE, design round 2026-10-09-home-phone-1 (design/rounds/): what should Home look like on
// a phone? "Now" is Home as it ships; A, B and C are three structurally different answers, on
// fake rooms, built from folds and the app's own pieces. Nothing is wired to a server.
//
// Open /mock-home-phone.html on the vite dev server. On a desktop it shows the four side by side.
// On a phone, or with ?variant=now|a|b|c, it shows one full screen with a switcher (and the arrow
// keys). ?dark and ?light override the system setting. Not part of the app build.
import React, { CSSProperties, ReactNode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import '../index.css';
import {
  Avatar,
  AvatarFallback,
  Box,
  Icon,
  IconButton,
  IconSrc,
  Icons,
  Scroll,
  Text,
  color,
  config,
  configClass,
  toRem,
  varsClass,
} from 'folds';
import { onDarkFontWeight, onLightFontWeight } from '../config.css';
import { irisDarkTheme, irisLightTheme } from '../colors.css';
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
import colorMXID from '../util/colorMXID';

// ---------------------------------------------------------------------------------------------
// Fake data: a household, newest first.
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
  time: string;
  sender?: string;
  preview: string;
};

const CONVS: Conv[] = [
  {
    id: '!andromache:example.org',
    name: 'Andromache',
    direct: true,
    section: 'starred',
    unread: 2,
    highlight: true,
    time: '9:45 AM',
    preview: 'Can you grab the list off the fridge?',
  },
  {
    id: '!mouseion:example.org',
    name: 'Mouseion',
    direct: false,
    privateRoom: true,
    section: 'starred',
    unread: 3,
    time: '9:38 AM',
    sender: 'Andromache',
    preview: 'The new icon is on my phone now',
  },
  {
    id: '!dad:example.org',
    name: 'Dad',
    direct: true,
    section: 'family',
    time: '8:42 AM',
    sender: 'You',
    preview: 'Sunday works, we will bring dessert',
  },
  {
    id: '!mum:example.org',
    name: 'Mum',
    direct: true,
    section: 'chats',
    time: '6:50 AM',
    preview: 'Photo',
  },
  {
    id: '!groceries:example.org',
    name: 'Groceries',
    direct: false,
    privateRoom: true,
    section: 'rooms',
    time: 'Yesterday',
    sender: 'You',
    preview: 'Milk, eggs, coffee filters',
  },
  {
    id: '!kitchen:example.org',
    name: 'Kitchen',
    direct: false,
    privateRoom: true,
    section: 'family',
    muted: true,
    time: 'Yesterday',
    sender: 'Dad',
    preview: 'Who took the good knife',
  },
  {
    id: '!nestor:example.org',
    name: 'Nestor',
    direct: true,
    section: 'chats',
    time: 'Tue',
    preview: 'See you at the game',
  },
  {
    id: '!trips:example.org',
    name: 'Trips',
    direct: false,
    section: 'rooms',
    unread: 1,
    time: 'Sun',
    sender: 'Mum',
    preview: 'Flights are booked for March',
  },
  {
    id: '!movies:example.org',
    name: 'Movie night',
    direct: false,
    section: 'rooms',
    time: 'Oct 2',
    sender: 'Andromache',
    preview: 'Friday at 8?',
  },
];

const SECTIONS: { id: SectionId; label: string; emoji?: string }[] = [
  { id: 'starred', label: 'Starred', emoji: '⭐' },
  { id: 'family', label: 'Family', emoji: '🏡' },
  { id: 'chats', label: 'Chats' },
  { id: 'rooms', label: 'Rooms' },
];

const ME = '@hector:example.org';
// ?sheet opens the create sheet from the start, for a capture
const SHEET_OPEN = window.location.search.includes('sheet');
const unreadOf = (convs: Conv[]) => convs.reduce((n, c) => n + (c.unread ?? 0), 0);
const TOTAL_UNREAD = unreadOf(CONVS);
const DIRECT_UNREAD = unreadOf(CONVS.filter((c) => c.direct));

// ---------------------------------------------------------------------------------------------
// Styles the variants share. Layout is each variant's own.
const PRESS = 'hp-press';
const STYLES = `
html { overflow: auto; }
#mock-root { min-height: 100%; }
.${PRESS} { background: transparent; border: 0; padding: 0; margin: 0; font: inherit; color: inherit;
  text-align: left; cursor: pointer; -webkit-tap-highlight-color: transparent;
  transition: background-color 120ms ease; }
.${PRESS}:hover { background-color: ${color.Background.ContainerHover}; }
.${PRESS}:active { background-color: ${color.Background.ContainerActive}; }
.hp-noscroll::-webkit-scrollbar { display: none; }
.hp-noscroll { scrollbar-width: none; }
.hp-sheet { transition: transform 220ms cubic-bezier(.2,.8,.2,1); }
.hp-backdrop { transition: opacity 180ms ease; }
.hp-fold { display: grid; transition: grid-template-rows 200ms ease; }
.hp-fold > div { overflow: hidden; }
`;

function ConvAvatar({ conv, size }: { conv: Conv; size: number }) {
  const box: CSSProperties = {
    width: toRem(size),
    height: toRem(size),
    flexShrink: 0,
    borderRadius: toRem(size * 0.3),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  if (conv.direct) {
    return (
      <span style={{ ...box, backgroundColor: colorMXID(conv.id), color: color.Surface.Container }}>
        <span style={{ fontSize: toRem(size * 0.45), fontWeight: 600, lineHeight: 1 }}>
          {conv.name[0]}
        </span>
      </span>
    );
  }
  return (
    <span
      style={{
        ...box,
        backgroundColor: color.SurfaceVariant.Container,
        color: color.SurfaceVariant.OnContainer,
      }}
    >
      <Icon
        size={size >= 40 ? '200' : '100'}
        src={conv.privateRoom ? Icons.HashLock : Icons.Hash}
      />
    </span>
  );
}

/** Name, time, the last message and the count: the row every phone chat app has. */
function TwoLineRow({ conv, height }: { conv: Conv; height: number }) {
  const unread = conv.unread !== undefined;
  return (
    <button
      type="button"
      className={PRESS}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: config.space.S300,
        width: '100%',
        minHeight: toRem(height),
        padding: `${config.space.S200} ${config.space.S400}`,
      }}
    >
      <ConvAvatar conv={conv} size={44} />
      <Box grow="Yes" direction="Column" style={{ minWidth: 0, gap: toRem(2) }}>
        <Box alignItems="Center" gap="200">
          <Box grow="Yes" style={{ minWidth: 0 }}>
            <Text as="span" size="T400" truncate style={{ fontWeight: unread ? 600 : 500 }}>
              {conv.name}
            </Text>
          </Box>
          <Text
            as="span"
            size="T200"
            priority={unread ? '500' : '300'}
            style={{ flexShrink: 0, color: unread ? color.Primary.Main : undefined }}
          >
            {conv.time}
          </Text>
        </Box>
        <Box alignItems="Center" gap="200">
          <Box grow="Yes" style={{ minWidth: 0 }}>
            <Text as="span" size="T300" priority={unread ? '400' : '300'} truncate>
              {conv.sender ? `${conv.sender}: ` : ''}
              {conv.preview}
            </Text>
          </Box>
          {conv.muted && <Icon size="50" src={Icons.BellMute} style={{ opacity: 0.6 }} />}
          {unread && <UnreadBadge highlight={!!conv.highlight} count={conv.unread ?? 0} />}
        </Box>
      </Box>
    </button>
  );
}

function OneLineRow({ conv }: { conv: Conv }) {
  const unread = conv.unread !== undefined;
  return (
    <button
      type="button"
      className={PRESS}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: config.space.S300,
        width: '100%',
        minHeight: toRem(48),
        padding: `0 ${config.space.S300}`,
        borderRadius: config.radii.R400,
      }}
    >
      <ConvAvatar conv={conv} size={30} />
      <Box grow="Yes" style={{ minWidth: 0 }}>
        <Text as="span" size="T400" priority={unread ? '500' : '300'} truncate>
          {conv.name}
        </Text>
      </Box>
      {conv.muted && <Icon size="50" src={Icons.BellMute} style={{ opacity: 0.6 }} />}
      {unread && <UnreadBadge highlight={!!conv.highlight} count={conv.unread ?? 0} />}
    </button>
  );
}

function Me({ size }: { size: number }) {
  return (
    <span
      style={{
        width: toRem(size),
        height: toRem(size),
        flexShrink: 0,
        borderRadius: toRem(size * 0.3),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colorMXID(ME),
        color: color.Surface.Container,
        fontSize: toRem(size * 0.45),
        fontWeight: 600,
      }}
    >
      H
    </span>
  );
}

/** A 48 px touch target around a 24 px icon. */
function TouchIcon({ src, label, dot }: { src: IconSrc; label: string; dot?: boolean }) {
  return (
    <button
      type="button"
      className={PRESS}
      aria-label={label}
      style={{
        position: 'relative',
        width: toRem(48),
        height: toRem(48),
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon src={src} size="200" />
      {dot && (
        <span
          style={{
            position: 'absolute',
            top: toRem(11),
            right: toRem(11),
            width: toRem(9),
            height: toRem(9),
            borderRadius: '50%',
            backgroundColor: color.Primary.Main,
            border: `2px solid ${color.Background.Container}`,
          }}
        />
      )}
    </button>
  );
}

function Fab({ onClick, bottom }: { onClick: () => void; bottom: number }) {
  return (
    <button
      type="button"
      aria-label="Create"
      onClick={onClick}
      style={{
        position: 'absolute',
        right: toRem(16),
        bottom: toRem(bottom),
        width: toRem(56),
        height: toRem(56),
        borderRadius: toRem(18),
        border: 0,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color.Primary.Main,
        color: color.Primary.OnMain,
        boxShadow: '0 4px 14px rgba(0,0,0,.28)',
      }}
    >
      <Icon src={Icons.Plus} size="300" />
    </button>
  );
}

/** What the + button opens: today's three action rows, within thumb reach. */
function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const item = (icon: IconSrc, label: string) => (
    <button
      type="button"
      className={PRESS}
      onClick={onClose}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: config.space.S400,
        width: '100%',
        minHeight: toRem(56),
        padding: `0 ${config.space.S500}`,
      }}
    >
      <Icon src={icon} size="200" />
      <Text as="span" size="T400" style={{ fontWeight: 500 }}>
        {label}
      </Text>
    </button>
  );
  return (
    <>
      <div
        className="hp-backdrop"
        role="presentation"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: color.Other.Overlay,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          zIndex: 5,
        }}
      />
      <div
        className="hp-sheet"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 6,
          transform: open ? 'translateY(0)' : 'translateY(105%)',
          backgroundColor: color.Surface.Container,
          color: color.Surface.OnContainer,
          borderRadius: `${toRem(20)} ${toRem(20)} 0 0`,
          paddingBottom: `calc(${config.space.S400} + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        <Box justifyContent="Center" style={{ padding: config.space.S300 }}>
          <span
            style={{
              width: toRem(36),
              height: toRem(4),
              borderRadius: toRem(2),
              backgroundColor: color.Surface.ContainerLine,
            }}
          />
        </Box>
        {item(Icons.Message, 'Create Chat')}
        {item(Icons.HashPlus, 'Create Room')}
        {item(Icons.Link, 'Join with Address')}
      </div>
    </>
  );
}

function SectionHeaderTouch({
  label,
  emoji,
  closed,
  count,
  onToggle,
  controls,
}: {
  label: string;
  emoji?: string;
  closed: boolean;
  count?: number;
  onToggle: () => void;
  controls?: ReactNode;
}) {
  return (
    <Box alignItems="Center" style={{ minHeight: toRem(44), paddingLeft: config.space.S200 }}>
      <button
        type="button"
        className={PRESS}
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: config.space.S200,
          flexGrow: 1,
          minHeight: toRem(44),
          padding: `0 ${config.space.S200}`,
          borderRadius: config.radii.R400,
        }}
      >
        <Icon size="50" src={closed ? Icons.ChevronRight : Icons.ChevronBottom} />
        <Text as="span" size="O400" priority="300">
          {emoji ? `${emoji}  ${label}` : label}
        </Text>
        {closed && !!count && <UnreadBadge count={count} />}
      </button>
      {controls}
    </Box>
  );
}

function Fold({ closed, children }: { closed: boolean; children: ReactNode }) {
  return (
    <div className="hp-fold" style={{ gridTemplateRows: closed ? '0fr' : '1fr' }}>
      <div>{children}</div>
    </div>
  );
}

const useClosed = () => {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setClosed((c) => ({ ...c, [id]: !c[id] }));
  return [closed, toggle] as const;
};

// ---------------------------------------------------------------------------------------------
// Now: Home as it ships, from the same components the app uses.
function SideItem({
  icon,
  active,
  badge,
  highlight,
  label,
}: {
  icon: IconSrc;
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

function NowRow({ conv }: { conv: Conv }) {
  const unread = conv.unread !== undefined;
  return (
    <NavItem variant="Background" radii="400" highlight={unread}>
      <NavButton>
        <NavItemContent>
          <Box as="span" grow="Yes" alignItems="Center" gap="200">
            <Avatar size="200" radii="400">
              {conv.direct ? (
                <AvatarFallback
                  style={{ backgroundColor: colorMXID(conv.id), color: color.Surface.Container }}
                >
                  <Text as="span" size="H6">
                    {conv.name[0]}
                  </Text>
                </AvatarFallback>
              ) : (
                <Icon
                  style={{ opacity: unread ? config.opacity.P500 : config.opacity.P300 }}
                  size="100"
                  src={conv.privateRoom ? Icons.HashLock : Icons.Hash}
                />
              )}
            </Avatar>
            <Box as="span" grow="Yes">
              <Text priority={unread ? '500' : '300'} as="span" size="Inherit" truncate>
                {conv.name}
              </Text>
            </Box>
            {unread && (
              <UnreadBadgeCenter>
                <UnreadBadge highlight={!!conv.highlight} count={conv.unread ?? 0} />
              </UnreadBadgeCenter>
            )}
            {conv.muted && <Icon size="50" src={Icons.BellMute} />}
          </Box>
        </NavItemContent>
      </NavButton>
    </NavItem>
  );
}

function NowAction({ icon, label }: { icon: IconSrc; label: string }) {
  return (
    <NavItem variant="Background" radii="400">
      <NavButton>
        <NavItemContent>
          <Box as="span" grow="Yes" alignItems="Center" gap="200">
            <Avatar size="200" radii="400">
              <Icon src={icon} size="100" />
            </Avatar>
            <Text as="span" size="Inherit" truncate>
              {label}
            </Text>
          </Box>
        </NavItemContent>
      </NavButton>
    </NavItem>
  );
}

function VariantNow() {
  return (
    <ScreenSizeProvider value={ScreenSize.Mobile}>
      <Box grow="Yes" style={{ minHeight: 0 }}>
        <Sidebar>
          <SidebarContent
            scrollable={
              <Scroll variant="Background" size="0">
                <SidebarStack>
                  <SideItem icon={Icons.Home} active label="Home" badge={TOTAL_UNREAD} highlight />
                  <SideItem icon={Icons.User} label="Direct" badge={DIRECT_UNREAD} highlight />
                </SidebarStack>
                <SidebarStackSeparator />
                <SidebarStack>
                  <SideItem icon={Icons.Explore} label="Explore" />
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
                        style={{ backgroundColor: colorMXID(ME), color: color.Surface.Container }}
                      >
                        <Text size="H4">H</Text>
                      </AvatarFallback>
                    </SidebarAvatar>
                  </SidebarItem>
                </SidebarStack>
              </>
            }
          />
        </Sidebar>
        <Box grow="Yes" style={{ minWidth: 0, display: 'flex' }}>
          <PageNav>
            <PageNavHeader>
              <Box alignItems="Center" grow="Yes" gap="300">
                <Box grow="Yes">
                  <Text size="H4" truncate>
                    Home
                  </Text>
                </Box>
                <IconButton variant="Background">
                  <Icon src={Icons.VerticalDots} size="200" />
                </IconButton>
              </Box>
            </PageNavHeader>
            <PageNavContent>
              <Box direction="Column" gap="300">
                <NavCategory>
                  <NowAction icon={Icons.Plus} label="Create Room" />
                  <NowAction icon={Icons.Plus} label="Create Chat" />
                  <NowAction icon={Icons.Link} label="Join with Address" />
                  <NowAction icon={Icons.Search} label="Message Search" />
                </NavCategory>
                {SECTIONS.map((section) => (
                  <NavCategory key={section.id}>
                    <NavCategoryHeader>
                      <Box grow="Yes" alignItems="Center" gap="100">
                        <Box grow="Yes">
                          <RoomNavCategoryButton closed={false}>
                            {section.emoji ? `${section.emoji}  ${section.label}` : section.label}
                          </RoomNavCategoryButton>
                        </Box>
                        <Box shrink="No" gap="100">
                          <IconButton size="300" radii="300" variant="Background">
                            <Icon size="50" src={Icons.Plus} />
                          </IconButton>
                          <IconButton size="300" radii="300" variant="Background">
                            <Icon size="50" src={Icons.VerticalDots} />
                          </IconButton>
                        </Box>
                      </Box>
                    </NavCategoryHeader>
                    {CONVS.filter((c) => c.section === section.id).map((conv) => (
                      <NowRow key={conv.id} conv={conv} />
                    ))}
                  </NavCategory>
                ))}
              </Box>
            </PageNavContent>
          </PageNav>
        </Box>
      </Box>
    </ScreenSizeProvider>
  );
}

// ---------------------------------------------------------------------------------------------
// A: a bar along the bottom in place of the rail, sections kept, one + button for the create actions.
function BottomBarItem({
  icon,
  label,
  active,
  badge,
  highlight,
  onClick,
  children,
}: {
  icon?: IconSrc;
  label: string;
  active?: boolean;
  badge?: number;
  highlight?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: '1 1 0',
        minWidth: 0,
        height: toRem(64),
        border: 0,
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: toRem(4),
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        style={{
          position: 'relative',
          width: toRem(56),
          height: toRem(30),
          borderRadius: toRem(15),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 160ms ease',
          backgroundColor: active ? color.Primary.Container : 'transparent',
          color: active ? color.Primary.OnContainer : 'inherit',
        }}
      >
        {children ?? (icon && <Icon src={icon} size="200" filled={active} />)}
        {badge !== undefined && badge > 0 && (
          <span style={{ position: 'absolute', top: toRem(-5), right: toRem(2) }}>
            <UnreadBadge highlight={highlight} count={badge} />
          </span>
        )}
      </span>
      <Text as="span" size="T200" style={{ fontWeight: active ? 600 : 400 }}>
        {label}
      </Text>
    </button>
  );
}

function VariantA() {
  const [tab, setTab] = useState('home');
  const [sheet, setSheet] = useState(SHEET_OPEN);
  const [closed, toggle] = useClosed();
  return (
    <>
      <Box
        alignItems="Center"
        shrink="No"
        style={{ height: toRem(56), padding: `0 ${config.space.S100} 0 ${config.space.S400}` }}
      >
        <button
          type="button"
          className={PRESS}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: config.space.S100,
            minHeight: toRem(44),
            padding: `0 ${config.space.S200}`,
            marginLeft: `calc(-1 * ${config.space.S200})`,
            borderRadius: config.radii.R400,
          }}
        >
          <Text as="span" size="H3">
            Home
          </Text>
          <Icon size="100" src={Icons.ChevronBottom} />
        </button>
        <Box grow="Yes" />
        <TouchIcon src={Icons.Search} label="Search" />
      </Box>
      <div
        className="hp-noscroll"
        style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', paddingBottom: toRem(88) }}
      >
        {SECTIONS.map((section) => {
          const convs = CONVS.filter((c) => c.section === section.id);
          return (
            <div key={section.id}>
              <SectionHeaderTouch
                label={section.label}
                emoji={section.emoji}
                closed={!!closed[section.id]}
                count={unreadOf(convs)}
                onToggle={() => toggle(section.id)}
                controls={<TouchIcon src={Icons.VerticalDots} label="Section options" />}
              />
              <Fold closed={!!closed[section.id]}>
                {convs.map((conv) => (
                  <TwoLineRow key={conv.id} conv={conv} height={64} />
                ))}
              </Fold>
            </div>
          );
        })}
      </div>
      <Fab onClick={() => setSheet(true)} bottom={80} />
      <Box
        shrink="No"
        style={{
          borderTop: `1px solid ${color.Background.ContainerLine}`,
          backgroundColor: color.Surface.Container,
          color: color.Surface.OnContainer,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <BottomBarItem
          icon={Icons.Home}
          label="Home"
          active={tab === 'home'}
          badge={TOTAL_UNREAD}
          highlight
          onClick={() => setTab('home')}
        />
        <BottomBarItem
          icon={Icons.User}
          label="Direct"
          active={tab === 'direct'}
          badge={DIRECT_UNREAD}
          highlight
          onClick={() => setTab('direct')}
        />
        <BottomBarItem
          icon={Icons.Explore}
          label="Explore"
          active={tab === 'explore'}
          onClick={() => setTab('explore')}
        />
        <BottomBarItem
          icon={Icons.Inbox}
          label="Inbox"
          active={tab === 'inbox'}
          onClick={() => setTab('inbox')}
        />
        <BottomBarItem label="You" active={tab === 'you'} onClick={() => setTab('you')}>
          <Me size={24} />
        </BottomBarItem>
      </Box>
      <CreateSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// B: one list, newest first. Search is the top of the screen and the sections are filters.
function VariantB() {
  const [filter, setFilter] = useState<'all' | 'unread' | SectionId>('all');
  const [sheet, setSheet] = useState(SHEET_OPEN);
  const chips: { id: 'all' | 'unread' | SectionId; label: string; count?: number }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread', count: CONVS.filter((c) => c.unread).length },
    ...SECTIONS.map((s) => ({ id: s.id, label: s.emoji ? `${s.emoji} ${s.label}` : s.label })),
  ];
  const shown = CONVS.filter((c) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return c.unread !== undefined;
    return c.section === filter;
  });
  return (
    <>
      <Box shrink="No" style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}>
        <Box
          grow="Yes"
          alignItems="Center"
          style={{
            height: toRem(52),
            borderRadius: toRem(26),
            backgroundColor: color.SurfaceVariant.Container,
            color: color.SurfaceVariant.OnContainer,
            paddingLeft: config.space.S400,
            paddingRight: config.space.S100,
            gap: config.space.S300,
          }}
        >
          <Icon src={Icons.Search} size="200" />
          <Box grow="Yes">
            <Text as="span" size="T400" priority="300">
              Search
            </Text>
          </Box>
          <TouchIcon src={Icons.Inbox} label="Inbox" dot />
          <button
            type="button"
            aria-label="You"
            style={{
              border: 0,
              background: 'transparent',
              padding: toRem(6),
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <Me size={32} />
          </button>
        </Box>
      </Box>
      <div
        className="hp-noscroll"
        style={{
          display: 'flex',
          gap: config.space.S200,
          overflowX: 'auto',
          flexShrink: 0,
          padding: `${config.space.S300} ${config.space.S300}`,
        }}
      >
        {chips.map((chip) => {
          const on = chip.id === filter;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              style={{
                flexShrink: 0,
                height: toRem(36),
                padding: `0 ${config.space.S400}`,
                borderRadius: toRem(18),
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: config.space.S200,
                font: 'inherit',
                transition: 'background-color 160ms ease, color 160ms ease',
                border: `1px solid ${on ? 'transparent' : color.Background.ContainerLine}`,
                backgroundColor: on ? color.Primary.Container : 'transparent',
                color: on ? color.Primary.OnContainer : color.Background.OnContainer,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Text as="span" size="T300" style={{ fontWeight: on ? 600 : 500 }}>
                {chip.label}
              </Text>
              {!!chip.count && (
                <Text as="span" size="T200" style={{ fontWeight: 600, opacity: 0.8 }}>
                  {chip.count}
                </Text>
              )}
            </button>
          );
        })}
      </div>
      <div
        className="hp-noscroll"
        style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', paddingBottom: toRem(96) }}
      >
        {shown.map((conv) => (
          <TwoLineRow key={conv.id} conv={conv} height={72} />
        ))}
        {shown.length === 0 && (
          <Box justifyContent="Center" style={{ padding: config.space.S700 }}>
            <Text priority="300">Nothing here</Text>
          </Box>
        )}
      </div>
      <Fab onClick={() => setSheet(true)} bottom={24} />
      <CreateSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// C: the rail stays. The four action rows fold into the header and everything gets a thumb's size.
function RailItem({
  icon,
  label,
  active,
  badge,
  children,
}: {
  icon?: IconSrc;
  label: string;
  active?: boolean;
  badge?: number;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={PRESS}
      aria-label={label}
      style={{
        position: 'relative',
        width: toRem(48),
        height: toRem(48),
        borderRadius: toRem(14),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? color.Primary.Container : undefined,
        color: active ? color.Primary.OnContainer : undefined,
      }}
    >
      {children ?? (icon && <Icon src={icon} size="200" filled={active} />)}
      {badge !== undefined && badge > 0 && (
        <span style={{ position: 'absolute', top: toRem(-2), right: toRem(-2) }}>
          <UnreadBadge highlight count={badge} />
        </span>
      )}
    </button>
  );
}

function VariantC() {
  const [sheet, setSheet] = useState(SHEET_OPEN);
  const [closed, toggle] = useClosed();
  return (
    <>
      <Box grow="Yes" style={{ minHeight: 0 }}>
        <Box
          direction="Column"
          alignItems="Center"
          shrink="No"
          style={{
            width: toRem(60),
            padding: `${config.space.S200} 0`,
            gap: config.space.S100,
            borderRight: `1px solid ${color.Background.ContainerLine}`,
            paddingBottom: `calc(${config.space.S200} + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          <RailItem icon={Icons.Home} label="Home" active badge={TOTAL_UNREAD} />
          <RailItem icon={Icons.User} label="Direct" badge={DIRECT_UNREAD} />
          <RailItem icon={Icons.Explore} label="Explore" />
          <Box grow="Yes" />
          <RailItem icon={Icons.Inbox} label="Inbox" />
          <RailItem label="You">
            <Me size={32} />
          </RailItem>
        </Box>
        <Box grow="Yes" direction="Column" style={{ minWidth: 0 }}>
          <Box
            alignItems="Center"
            shrink="No"
            style={{ height: toRem(56), paddingLeft: config.space.S400 }}
          >
            <Box grow="Yes">
              <Text as="span" size="H3">
                Home
              </Text>
            </Box>
            <TouchIcon src={Icons.Search} label="Search" />
            <button
              type="button"
              className={PRESS}
              aria-label="Create"
              onClick={() => setSheet(true)}
              style={{
                width: toRem(48),
                height: toRem(48),
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon src={Icons.Plus} size="200" />
            </button>
          </Box>
          <div
            className="hp-noscroll"
            style={{
              flex: '1 1 0',
              minHeight: 0,
              overflowY: 'auto',
              padding: `0 ${config.space.S200} ${config.space.S400} 0`,
            }}
          >
            {SECTIONS.map((section) => {
              const convs = CONVS.filter((c) => c.section === section.id);
              return (
                <div key={section.id}>
                  <SectionHeaderTouch
                    label={section.label}
                    emoji={section.emoji}
                    closed={!!closed[section.id]}
                    count={unreadOf(convs)}
                    onToggle={() => toggle(section.id)}
                    controls={<TouchIcon src={Icons.VerticalDots} label="Section options" />}
                  />
                  <Fold closed={!!closed[section.id]}>
                    <div style={{ paddingLeft: config.space.S200 }}>
                      {convs.map((conv) => (
                        <OneLineRow key={conv.id} conv={conv} />
                      ))}
                    </div>
                  </Fold>
                </div>
              );
            })}
          </div>
        </Box>
      </Box>
      <CreateSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
type VariantId = 'now' | 'a' | 'b' | 'c';
const VARIANTS: { id: VariantId; name: string; blurb: string; render: () => ReactNode }[] = [
  {
    id: 'now',
    name: 'Now',
    blurb: 'Home as it ships: the rail on the left, four action rows, one line per conversation.',
    render: () => <VariantNow />,
  },
  {
    id: 'a',
    name: 'A · Bottom bar',
    blurb:
      'The rail becomes a bar along the bottom. Sections stay. Rows show the last message. One + button holds the create actions.',
    render: () => <VariantA />,
  },
  {
    id: 'b',
    name: 'B · One list',
    blurb:
      'No rail and no bar. Search is the top of the screen, sections are filters, and everything is one list, newest first.',
    render: () => <VariantB />,
  },
  {
    id: 'c',
    name: 'C · Rail kept',
    blurb:
      'The smallest change: the rail stays, the action rows fold into the header, and every row and button is thumb sized.',
    render: () => <VariantC />,
  },
];

function Screen({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: color.Background.Container,
        color: color.Background.OnContainer,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Not part of any design: a strip above the screen that flips between them.
const SWITCHER_HEIGHT = 36;
function Switcher({ current, onPick }: { current: VariantId; onPick: (id: VariantId) => void }) {
  const index = VARIANTS.findIndex((v) => v.id === current);
  const step = (by: number) =>
    onPick(VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length].id);
  useEffect(() => {
    const onKey = (evt: KeyboardEvent) => {
      if (evt.key === 'ArrowLeft') step(-1);
      if (evt.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const arrow: CSSProperties = {
    width: toRem(56),
    height: toRem(SWITCHER_HEIGHT),
    border: 0,
    background: 'transparent',
    color: 'inherit',
    fontSize: toRem(20),
    cursor: 'pointer',
  };
  return (
    <div
      style={{
        height: toRem(SWITCHER_HEIGHT),
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0B0B0D',
        color: '#fff',
        font: `600 ${toRem(13)}/1 Commissioner, sans-serif`,
        whiteSpace: 'nowrap',
      }}
    >
      <button type="button" style={arrow} onClick={() => step(-1)} aria-label="Previous">
        ‹
      </button>
      <span style={{ minWidth: toRem(120), textAlign: 'center' }}>{VARIANTS[index].name}</span>
      <button type="button" style={arrow} onClick={() => step(1)} aria-label="Next">
        ›
      </button>
    </div>
  );
}

function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const asked = params.get('variant') as VariantId | null;
  const single = asked !== null || window.innerWidth < 700;
  const [current, setCurrent] = useState<VariantId>(
    VARIANTS.some((v) => v.id === asked) ? (asked as VariantId) : 'a'
  );
  const pick = (id: VariantId) => {
    setCurrent(id);
    const next = new URLSearchParams(window.location.search);
    next.set('variant', id);
    window.history.replaceState(null, '', `?${next.toString()}`);
  };

  if (single) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <Switcher current={current} onPick={pick} />
        <Screen style={{ flex: '1 1 0', minHeight: 0 }}>
          {VARIANTS.find((v) => v.id === current)?.render()}
        </Screen>
      </div>
    );
  }
  return (
    <div
      style={{
        minHeight: '100%',
        padding: toRem(24),
        boxSizing: 'border-box',
        backgroundColor: color.SurfaceVariant.Container,
        color: color.SurfaceVariant.OnContainer,
      }}
    >
      <Box direction="Column" gap="200" style={{ marginBottom: toRem(20), maxWidth: toRem(900) }}>
        <Text size="H2">Home on a phone</Text>
        <Text priority="300">
          Round 1. Real components on fake rooms; nothing is wired to a server. Sections fold, the
          filters in B work, and + opens the create sheet. Open this page on a phone to try one full
          screen.
        </Text>
      </Box>
      <Box gap="500" wrap="Wrap" alignItems="Start">
        {VARIANTS.map((variant) => (
          <Box key={variant.id} direction="Column" gap="200" style={{ width: toRem(412) }}>
            <Text size="H4">{variant.name}</Text>
            <Text size="T300" priority="300" style={{ minHeight: toRem(60) }}>
              {variant.blurb}
            </Text>
            <Screen
              style={{
                width: toRem(412),
                height: toRem(892),
                borderRadius: toRem(28),
                border: `1px solid ${color.Background.ContainerLine}`,
                boxShadow: '0 8px 30px rgba(0,0,0,.18)',
              }}
            >
              {variant.render()}
            </Screen>
          </Box>
        ))}
      </Box>
    </div>
  );
}

const { search } = window.location;
const dark = search.includes('dark')
  ? true
  : !search.includes('light') && window.matchMedia('(prefers-color-scheme: dark)').matches;
document.body.classList.add(
  configClass,
  varsClass,
  ...(dark
    ? ['iris-dark-theme', irisDarkTheme, onDarkFontWeight]
    : ['iris-light-theme', irisLightTheme, onLightFontWeight])
);
const style = document.createElement('style');
style.textContent = STYLES;
document.head.appendChild(style);

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById('mock-root')!).render(<App />);
