import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { Icons, Text } from 'folds';
import { BottomNavAvatar, BottomNavBar, BottomNavItem, scrollTabToTop } from './BottomNavBar';
import { BottomNavTab, getBottomNavTab } from '../mobileNav';
import {
  getDirectPath,
  getHomePath,
  getInboxNotificationsPath,
  getSearchPath,
  getYouPath,
} from '../pathUtils';
import { UserAvatar } from '../../components/user-avatar';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useHomeConversations } from '../../hooks/useSidebar';
import { useUnverifiedDevices } from '../../hooks/useUnverifiedDevices';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useDirects } from '../../state/hooks/roomList';
import { useRoomsUnread } from '../../state/hooks/unread';
import { mDirectAtom } from '../../state/mDirectList';
import { allInvitesAtom } from '../../state/room-list/inviteList';
import { allRoomsAtom } from '../../state/room-list/roomList';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { nameInitials } from '../../utils/common';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';

const TAB_PATHS: Record<BottomNavTab, () => string> = {
  home: getHomePath,
  direct: getDirectPath,
  // Activity opens on the feed itself; the invites are one tap away in its header.
  activity: getInboxNotificationsPath,
  search: getSearchPath,
  you: getYouPath,
};

/**
 * The bar along the bottom of a phone: Home, DMs, Activity, Search and You, with what the rail's
 * tabs count on them. Rendered only on the pages `getBottomNavTab` gives a tab to.
 */
export function BottomNav() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeTab = getBottomNavTab(pathname);

  const homeRooms = useHomeConversations();
  const homeUnread = useRoomsUnread(homeRooms, roomToUnreadAtom);

  const mDirects = useAtomValue(mDirectAtom);
  const directs = useDirects(mx, allRoomsAtom, mDirects);
  const directUnread = useRoomsUnread(directs, roomToUnreadAtom);

  const inviteCount = useAtomValue(allInvitesAtom).length;
  const unverifiedDevices = useUnverifiedDevices();

  const userId = mx.getSafeUserId();
  const profile = useUserProfile(userId);
  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const tabProps = (tab: BottomNavTab) => ({
    active: tab === activeTab,
    onClick: () => {
      const path = TAB_PATHS[tab]();
      // A tap on the open tab is a way back to the top of its list. A space's list belongs to
      // Home, and there the tap leads home.
      if (tab === activeTab && (tab === 'activity' || pathname === path)) {
        scrollTabToTop();
        return;
      }
      navigate(path);
    },
  });

  return (
    <BottomNavBar>
      <BottomNavItem
        label="Home"
        icon={Icons.Home}
        badge={homeUnread && { count: homeUnread.total, highlight: homeUnread.highlight > 0 }}
        {...tabProps('home')}
      />
      <BottomNavItem
        label="DMs"
        icon={Icons.User}
        badge={directUnread && { count: directUnread.total, highlight: directUnread.highlight > 0 }}
        {...tabProps('direct')}
      />
      <BottomNavItem
        label="Activity"
        icon={Icons.Inbox}
        badge={inviteCount > 0 ? { count: inviteCount, highlight: true } : undefined}
        {...tabProps('activity')}
      />
      <BottomNavItem label="Search" icon={Icons.Search} {...tabProps('search')} />
      <BottomNavItem
        label="You"
        dot={unverifiedDevices && (unverifiedDevices.current ? 'critical' : 'warning')}
        {...tabProps('you')}
      >
        <BottomNavAvatar>
          <UserAvatar
            userId={userId}
            src={avatarUrl}
            renderFallback={() => <Text size="L400">{nameInitials(displayName)}</Text>}
          />
        </BottomNavAvatar>
      </BottomNavItem>
    </BottomNavBar>
  );
}
