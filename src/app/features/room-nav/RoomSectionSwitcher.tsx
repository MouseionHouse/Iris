import React, { MouseEventHandler, ReactNode, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { Room } from 'matrix-js-sdk';
import { Box, Icon, Icons, Menu, MenuItem, PopOut, RectCords, Text, config, toRem } from 'folds';
import { stopPropagation } from '../../utils/keyboard';
import { useSidebar } from '../../hooks/useSidebar';
import {
  STARRED_TAG,
  SidebarSection,
  isCustomSection,
  roomSection,
  sectionName,
} from '../../state/sidebar';
import { SectionDialog } from './SectionDialog';

type RoomSectionSwitcherProps = {
  room: Room;
  children: (handleOpen: MouseEventHandler<HTMLButtonElement>, opened: boolean) => ReactNode;
};

/**
 * Slack's "Move to…" for a conversation: Starred, each custom section, a new one, or out of every
 * section. The trigger (a menu item) comes from `children`, as with the notification switcher.
 */
export function RoomSectionSwitcher({ room, children }: RoomSectionSwitcherProps) {
  const sidebar = useSidebar();
  const current = roomSection(sidebar.sections, room);
  const [menuCords, setMenuCords] = useState<RectCords>();
  const [newSection, setNewSection] = useState(false);

  const handleOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };
  const close = () => setMenuCords(undefined);
  const select = (tag: string | undefined) => {
    sidebar.moveRoom(room.roomId, tag);
    close();
  };
  const choices: SidebarSection[] = sidebar.sections.filter(
    (s) => s.tag === STARRED_TAG || isCustomSection(s)
  );

  return (
    <>
      {newSection && (
        <SectionDialog
          onSubmit={async (name, emoji) => {
            setNewSection(false);
            await sidebar.create(name, emoji);
            sidebar.moveRoom(room.roomId, `u.${name}`);
          }}
          onCancel={() => setNewSection(false)}
        />
      )}
      <PopOut
        anchor={menuCords}
        offset={5}
        position="Right"
        align="Start"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: close,
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
              isKeyBackward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu style={{ maxWidth: toRem(200), width: '100vw' }}>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {choices.map((s) => (
                  <MenuItem
                    key={s.tag}
                    size="300"
                    variant="Surface"
                    radii="300"
                    aria-pressed={current?.tag === s.tag}
                    after={
                      current?.tag === s.tag ? <Icon size="100" src={Icons.Check} /> : undefined
                    }
                    onClick={() => select(s.tag)}
                  >
                    <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                      {s.emoji ? `${s.emoji} ${sectionName(s)}` : sectionName(s)}
                    </Text>
                  </MenuItem>
                ))}
                <MenuItem
                  size="300"
                  variant="Surface"
                  radii="300"
                  after={<Icon size="100" src={Icons.Plus} />}
                  onClick={() => {
                    close();
                    setNewSection(true);
                  }}
                >
                  <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                    New section…
                  </Text>
                </MenuItem>
                {current && (
                  <MenuItem
                    size="300"
                    variant="Surface"
                    radii="300"
                    onClick={() => select(undefined)}
                  >
                    <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                      Remove from {sectionName(current)}
                    </Text>
                  </MenuItem>
                )}
              </Box>
            </Menu>
          </FocusTrap>
        }
      >
        {children(handleOpen, !!menuCords)}
      </PopOut>
    </>
  );
}
