import React, { MouseEventHandler, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Icon,
  IconButton,
  Icons,
  Line,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  config,
  toRem,
} from 'folds';
import { NavCategoryHeader } from '../../components/nav';
import { RoomNavCategoryButton } from './RoomNavCategoryButton';
import { stopPropagation } from '../../utils/keyboard';
import {
  SectionFilter,
  SectionSort,
  SectionView,
  SidebarSection,
  isCustomSection,
  sectionName,
} from '../../state/sidebar';
import { Sidebar } from '../../hooks/useSidebar';

const SORTS: [SectionSort, string][] = [
  ['alphabetical', 'Alphabetically'],
  ['recency', 'Recent activity'],
  ['priority', 'Priority'],
];
const FILTERS: [SectionFilter, string][] = [
  ['all', 'All conversations'],
  ['active', 'Active only'],
  ['unreads', 'Unreads only'],
  ['mentions', 'Mentions only'],
];

type SectionOptionsMenuProps = {
  section: SidebarSection;
  sidebar: Sidebar;
  requestClose: () => void;
  onNewSection: () => void;
  onRename: (section: SidebarSection) => void;
  onDelete: (section: SidebarSection) => void;
};
function SectionOptionsMenu({
  section,
  sidebar,
  requestClose,
  onNewSection,
  onRename,
  onDelete,
}: SectionOptionsMenuProps) {
  const index = sidebar.sections.findIndex((s) => s.tag === section.tag);
  const item = (
    label: string,
    onClick: () => void,
    opts: { checked?: boolean; disabled?: boolean; danger?: boolean } = {}
  ) => (
    <MenuItem
      size="300"
      radii="300"
      variant={opts.danger ? 'Critical' : 'Surface'}
      fill="None"
      disabled={opts.disabled}
      after={opts.checked ? <Icon size="100" src={Icons.Check} /> : undefined}
      onClick={() => {
        onClick();
        requestClose();
      }}
    >
      <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
        {label}
      </Text>
    </MenuItem>
  );
  return (
    <Menu style={{ width: toRem(200) }}>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <Text size="L400" style={{ padding: `${config.space.S100} ${config.space.S200}` }}>
          Sort
        </Text>
        {SORTS.map(([sort, label]) =>
          item(label, () => sidebar.update(section, { ...section, sort }), {
            checked: section.sort === sort,
          })
        )}
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <Text size="L400" style={{ padding: `${config.space.S100} ${config.space.S200}` }}>
          Show
        </Text>
        {FILTERS.map(([filter, label]) =>
          item(label, () => sidebar.update(section, { ...section, filter }), {
            checked: section.filter === filter,
          })
        )}
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        {item('Move up', () => sidebar.move(section, true), { disabled: index <= 0 })}
        {item('Move down', () => sidebar.move(section, false), {
          disabled: index < 0 || index >= sidebar.sections.length - 1,
        })}
        {item('Create new section', onNewSection)}
        {isCustomSection(section) && item('Rename section', () => onRename(section))}
        {isCustomSection(section) &&
          item('Delete section', () => onDelete(section), { danger: true })}
      </Box>
    </Menu>
  );
}

type SidebarSectionHeaderProps = {
  view: SectionView;
  sidebar: Sidebar;
  onNewSection: () => void;
  onRename: (section: SidebarSection) => void;
  onDelete: (section: SidebarSection) => void;
};

/**
 * A section header: Cinny's category pill (chevron, the emoji and the name) that folds the section,
 * with Slack's ⋯ at the end for the section's options.
 */
export function SidebarSectionHeader({
  view,
  sidebar,
  onNewSection,
  onRename,
  onDelete,
}: SidebarSectionHeaderProps) {
  const { section } = view;
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };
  return (
    <NavCategoryHeader>
      <Box grow="Yes" alignItems="Center" gap="100">
        <Box grow="Yes">
          <RoomNavCategoryButton
            closed={section.collapsed}
            onClick={() => sidebar.update(section, { ...section, collapsed: !section.collapsed })}
          >
            {section.emoji ? `${section.emoji}  ${sectionName(section)}` : sectionName(section)}
          </RoomNavCategoryButton>
        </Box>
        <Box shrink="No">
          <IconButton
            size="300"
            radii="300"
            variant="Background"
            aria-label={`${sectionName(section)} options`}
            aria-pressed={!!menuAnchor}
            onClick={handleOpenMenu}
          >
            <Icon size="50" src={Icons.VerticalDots} />
          </IconButton>
        </Box>
      </Box>
      <PopOut
        anchor={menuAnchor}
        position="Bottom"
        align="End"
        offset={4}
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
            <SectionOptionsMenu
              section={section}
              sidebar={sidebar}
              requestClose={() => setMenuAnchor(undefined)}
              onNewSection={onNewSection}
              onRename={onRename}
              onDelete={onDelete}
            />
          </FocusTrap>
        }
      />
    </NavCategoryHeader>
  );
}
