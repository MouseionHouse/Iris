import React, { MouseEventHandler, forwardRef, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Avatar,
  Box,
  Button,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  RectCords,
  Text,
  config,
  toRem,
} from 'folds';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAtom, useAtomValue } from 'jotai';
import FocusTrap from 'focus-trap-react';
import {
  NavButton,
  NavCategory,
  NavEmptyCenter,
  NavEmptyLayout,
  NavItem,
  NavItemContent,
  NavLink,
} from '../../../components/nav';
import {
  encodeSearchParamValueArray,
  getDirectCreatePath,
  getExplorePath,
  getHomeCreatePath,
  getHomeRoomPath,
  getHomeSearchPath,
  withSearchParam,
} from '../../pathUtils';
import { getCanonicalAliasOrRoomId } from '../../../utils/matrix';
import { useSelectedRoom } from '../../../hooks/router/useSelectedRoom';
import {
  useHomeCreateSelected,
  useHomeSearchSelected,
} from '../../../hooks/router/useHomeSelected';
import { useHomeConversations, useSidebar } from '../../../hooks/useSidebar';
import { SidebarSectionHeader } from '../../../features/room-nav/SidebarSectionHeader';
import { SidebarDragTile, useSidebarDrag } from '../../../features/room-nav/sidebarDrag';
import { SectionDialog } from '../../../features/room-nav/SectionDialog';
import { SidebarSection, sectionName } from '../../../state/sidebar';
import { mDirectAtom } from '../../../state/mDirectList';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { VirtualTile } from '../../../components/virtualizer';
import { RoomNavItem, RoomNavItemTouch } from '../../../features/room-nav';
import {
  ListFilterChips,
  TouchListArea,
  TouchListEmpty,
} from '../../../features/room-nav/TouchList';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { homeListFilterAtom } from '../../../state/listFilter';
import { HomeCreateFab, HomeTouchHeader } from './HomeTouch';
import { roomToUnreadAtom } from '../../../state/room/roomToUnread';
import { useNavToActivePathMapper } from '../../../hooks/useNavToActivePathMapper';
import { PageNav, PageNavHeader, PageNavContent } from '../../../components/page';
import { useRoomsUnread } from '../../../state/hooks/unread';
import { markAsRead } from '../../../utils/notifications';
import { stopPropagation } from '../../../utils/keyboard';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import {
  getRoomNotificationMode,
  useRoomsNotificationPreferencesContext,
} from '../../../hooks/useRoomsNotificationPreferences';
import { UseStateProvider } from '../../../components/UseStateProvider';
import { JoinAddressPrompt } from '../../../components/join-address-prompt';
import { _RoomSearchParams } from '../../paths';

type HomeMenuProps = {
  requestClose: () => void;
};
const HomeMenu = forwardRef<HTMLDivElement, HomeMenuProps>(({ requestClose }, ref) => {
  const orphanRooms = useHomeConversations();
  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
  const unread = useRoomsUnread(orphanRooms, roomToUnreadAtom);
  const mx = useMatrixClient();

  const handleMarkAsRead = () => {
    if (!unread) return;
    orphanRooms.forEach((rId) => markAsRead(mx, rId, hideActivity));
    requestClose();
  };

  return (
    <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          onClick={handleMarkAsRead}
          size="300"
          after={<Icon size="100" src={Icons.CheckTwice} />}
          radii="300"
          aria-disabled={!unread}
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Mark as Read
          </Text>
        </MenuItem>
      </Box>
    </Menu>
  );
});

function HomeHeader() {
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((currentState) => {
      if (currentState) return undefined;
      return cords;
    });
  };

  return (
    <>
      <PageNavHeader>
        <Box alignItems="Center" grow="Yes" gap="300">
          <Box grow="Yes">
            <Text size="H4" truncate>
              Home
            </Text>
          </Box>
          <Box>
            <IconButton aria-pressed={!!menuAnchor} variant="Background" onClick={handleOpenMenu}>
              <Icon src={Icons.VerticalDots} size="200" />
            </IconButton>
          </Box>
        </Box>
      </PageNavHeader>
      <PopOut
        anchor={menuAnchor}
        position="Bottom"
        align="End"
        offset={6}
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              returnFocusOnDeactivate: false,
              onDeactivate: () => setMenuAnchor(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
              isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
              escapeDeactivates: stopPropagation,
            }}
          >
            <HomeMenu requestClose={() => setMenuAnchor(undefined)} />
          </FocusTrap>
        }
      />
    </>
  );
}

function HomeEmpty() {
  const navigate = useNavigate();

  return (
    <NavEmptyCenter>
      <NavEmptyLayout
        icon={<Icon size="600" src={Icons.Hash} />}
        title={
          <Text size="H5" align="Center">
            No Rooms
          </Text>
        }
        content={
          <Text size="T300" align="Center">
            You do not have any rooms yet.
          </Text>
        }
        options={
          <>
            <Button onClick={() => navigate(getHomeCreatePath())} variant="Secondary" size="300">
              <Text size="B300" truncate>
                Create Room
              </Text>
            </Button>
            <Button
              onClick={() => navigate(getExplorePath())}
              variant="Secondary"
              fill="Soft"
              size="300"
            >
              <Text size="B300" truncate>
                Explore Community Rooms
              </Text>
            </Button>
          </>
        }
      />
    </NavEmptyCenter>
  );
}

type DeleteSectionPromptProps = {
  section: SidebarSection;
  onConfirm: () => void;
  onCancel: () => void;
};
function DeleteSectionPrompt({ section, onConfirm, onCancel }: DeleteSectionPromptProps) {
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onCancel,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface">
            <Header
              style={{ padding: `0 ${config.space.S200} 0 ${config.space.S400}` }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Delete {sectionName(section)}?</Text>
              </Box>
              <IconButton size="300" onClick={onCancel} radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400, paddingTop: 0 }} direction="Column" gap="400">
              <Text priority="400">Its chats and rooms go back to Chats and Rooms.</Text>
              <Button variant="Critical" onClick={onConfirm}>
                <Text size="B400">Delete</Text>
              </Button>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

type HomeRow =
  | { kind: 'header'; view: ReturnType<typeof useSidebar>['views'][number] }
  | { kind: 'room'; roomId: string; sectionTag: string };

export function Home() {
  const mx = useMatrixClient();
  useNavToActivePathMapper('home');
  const scrollRef = useRef<HTMLDivElement>(null);
  const rooms = useHomeConversations();
  const mDirects = useAtomValue(mDirectAtom);
  const mobile = useScreenSizeContext() === ScreenSize.Mobile;
  // The chip row of a phone filters every section at once; a wider screen has no chip row.
  const [listFilter, setListFilter] = useAtom(homeListFilterAtom);
  const sidebar = useSidebar(mobile && listFilter !== 'all' ? listFilter : undefined);
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const notificationPreferences = useRoomsNotificationPreferencesContext();
  const navigate = useNavigate();

  const selectedRoomId = useSelectedRoom();
  const createRoomSelected = useHomeCreateSelected();
  const searchSelected = useHomeSearchSelected();
  const noRoomToDisplay = rooms.length === 0;

  const [newSection, setNewSection] = useState(false);
  const [renameSection, setRenameSection] = useState<SidebarSection>();
  const [deleteSection, setDeleteSection] = useState<SidebarSection>();

  // One flat list of section headers and their rooms, so a single virtualizer covers the sidebar.
  const rows = useMemo<HomeRow[]>(
    () =>
      sidebar.views.flatMap((view) => [
        { kind: 'header', view } as HomeRow,
        ...view.rooms.map(
          (r) => ({ kind: 'room', roomId: r.roomId, sectionTag: view.section.tag } as HomeRow)
        ),
      ]),
    [sidebar.views]
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      if (!mobile) return 38;
      return rows[index].kind === 'header' ? 48 : 64;
    },
    overscan: 10,
  });

  const drag = useSidebarDrag({
    scrollRef,
    enabled: !mobile && !noRoomToDisplay,
    sections: sidebar.sections,
    save: sidebar.save,
    moveRoom: sidebar.moveRoom,
  });

  // Drag and drop is for a pointer; a phone keeps the menus.
  const dragTile = (
    row: HomeRow,
    index: number,
    direct: boolean,
    content: React.ReactNode
  ): React.ReactNode => {
    if (mobile) return content;
    const tag = row.kind === 'header' ? row.view.section.tag : row.sectionTag;
    const next = rows[index + 1];
    const last = !next || next.kind === 'header';
    return (
      <SidebarDragTile
        tag={tag}
        header={row.kind === 'header'}
        roomId={row.kind === 'room' ? row.roomId : undefined}
        direct={direct}
        drag={drag}
        first={row.kind === 'header'}
        last={last}
      >
        {content}
      </SidebarDragTile>
    );
  };

  const list = (
    <div
      style={{
        position: 'relative',
        height: virtualizer.getTotalSize(),
      }}
    >
      {virtualizer.getVirtualItems().map((vItem) => {
        const row = rows[vItem.index];
        if (row.kind === 'header') {
          return (
            <VirtualTile
              virtualItem={vItem}
              key={`header:${row.view.section.tag}`}
              ref={virtualizer.measureElement}
            >
              {dragTile(
                row,
                vItem.index,
                false,
                <SidebarSectionHeader
                  view={row.view}
                  sidebar={sidebar}
                  onNewSection={() => setNewSection(true)}
                  onRename={setRenameSection}
                  onDelete={setDeleteSection}
                />
              )}
            </VirtualTile>
          );
        }
        const { roomId } = row;
        const room = mx.getRoom(roomId);
        if (!room) return null;
        const selected = selectedRoomId === roomId;
        const direct = mDirects.has(roomId);
        // A direct chat opened from Home stays under Home, so going back returns here.
        const linkPath = getHomeRoomPath(getCanonicalAliasOrRoomId(mx, roomId));
        const notificationMode = getRoomNotificationMode(notificationPreferences, room.roomId);
        return (
          <VirtualTile
            virtualItem={vItem}
            key={`${row.sectionTag}:${roomId}`}
            ref={virtualizer.measureElement}
          >
            {mobile ? (
              <RoomNavItemTouch
                room={room}
                selected={selected}
                direct={direct}
                linkPath={linkPath}
                notificationMode={notificationMode}
              />
            ) : (
              dragTile(
                row,
                vItem.index,
                direct,
                <RoomNavItem
                  room={room}
                  selected={selected}
                  showAvatar={direct}
                  direct={direct}
                  linkPath={linkPath}
                  notificationMode={notificationMode}
                />
              )
            )}
          </VirtualTile>
        );
      })}
    </div>
  );

  const dialogs = (
    <>
      {newSection && (
        <SectionDialog
          onSubmit={(name, emoji) => {
            setNewSection(false);
            sidebar.create(name, emoji);
          }}
          onCancel={() => setNewSection(false)}
        />
      )}
      {renameSection && (
        <SectionDialog
          section={renameSection}
          onSubmit={(name, emoji) => {
            const target = renameSection;
            setRenameSection(undefined);
            sidebar.rename(target, name, emoji);
          }}
          onCancel={() => setRenameSection(undefined)}
        />
      )}
      {deleteSection && (
        <DeleteSectionPrompt
          section={deleteSection}
          onConfirm={() => {
            const target = deleteSection;
            setDeleteSection(undefined);
            sidebar.remove(target);
          }}
          onCancel={() => setDeleteSection(undefined)}
        />
      )}
    </>
  );

  if (mobile) {
    return (
      <PageNav>
        <HomeTouchHeader />
        {dialogs}
        {!noRoomToDisplay && (
          <ListFilterChips
            value={listFilter}
            onChange={setListFilter}
            unreadCount={rooms.filter((rId) => roomToUnread.has(rId)).length}
          />
        )}
        <TouchListArea scrollRef={scrollRef} fab={<HomeCreateFab />}>
          {noRoomToDisplay && <HomeEmpty />}
          {!noRoomToDisplay && rows.length === 0 && <TouchListEmpty>Nothing here</TouchListEmpty>}
          {!noRoomToDisplay && rows.length > 0 && list}
        </TouchListArea>
      </PageNav>
    );
  }

  return (
    <PageNav>
      <HomeHeader />
      {dialogs}
      {noRoomToDisplay ? (
        <HomeEmpty />
      ) : (
        <PageNavContent scrollRef={scrollRef}>
          <Box direction="Column" gap="300">
            <NavCategory>
              <NavItem variant="Background" radii="400" aria-selected={createRoomSelected}>
                <NavButton onClick={() => navigate(getHomeCreatePath())}>
                  <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" gap="200">
                      <Avatar size="200" radii="400">
                        <Icon src={Icons.Plus} size="100" />
                      </Avatar>
                      <Box as="span" grow="Yes">
                        <Text as="span" size="Inherit" truncate>
                          Create Room
                        </Text>
                      </Box>
                    </Box>
                  </NavItemContent>
                </NavButton>
              </NavItem>
              <NavItem variant="Background" radii="400">
                <NavButton onClick={() => navigate(getDirectCreatePath())}>
                  <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" gap="200">
                      <Avatar size="200" radii="400">
                        <Icon src={Icons.Plus} size="100" />
                      </Avatar>
                      <Box as="span" grow="Yes">
                        <Text as="span" size="Inherit" truncate>
                          Create Chat
                        </Text>
                      </Box>
                    </Box>
                  </NavItemContent>
                </NavButton>
              </NavItem>
              <UseStateProvider initial={false}>
                {(open, setOpen) => (
                  <>
                    <NavItem variant="Background" radii="400">
                      <NavButton onClick={() => setOpen(true)}>
                        <NavItemContent>
                          <Box as="span" grow="Yes" alignItems="Center" gap="200">
                            <Avatar size="200" radii="400">
                              <Icon src={Icons.Link} size="100" />
                            </Avatar>
                            <Box as="span" grow="Yes">
                              <Text as="span" size="Inherit" truncate>
                                Join with Address
                              </Text>
                            </Box>
                          </Box>
                        </NavItemContent>
                      </NavButton>
                    </NavItem>
                    {open && (
                      <JoinAddressPrompt
                        onCancel={() => setOpen(false)}
                        onOpen={(roomIdOrAlias, viaServers, eventId) => {
                          setOpen(false);
                          const path = getHomeRoomPath(roomIdOrAlias, eventId);
                          navigate(
                            viaServers
                              ? withSearchParam<_RoomSearchParams>(path, {
                                  viaServers: encodeSearchParamValueArray(viaServers),
                                })
                              : path
                          );
                        }}
                      />
                    )}
                  </>
                )}
              </UseStateProvider>
              <NavItem variant="Background" radii="400" aria-selected={searchSelected}>
                <NavLink to={getHomeSearchPath()}>
                  <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" gap="200">
                      <Avatar size="200" radii="400">
                        <Icon src={Icons.Search} size="100" filled={searchSelected} />
                      </Avatar>
                      <Box as="span" grow="Yes">
                        <Text as="span" size="Inherit" truncate>
                          Message Search
                        </Text>
                      </Box>
                    </Box>
                  </NavItemContent>
                </NavLink>
              </NavItem>
            </NavCategory>
            <NavCategory>{list}</NavCategory>
          </Box>
        </PageNavContent>
      )}
    </PageNav>
  );
}
