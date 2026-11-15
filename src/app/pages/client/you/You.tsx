import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { Icons, Line, Text } from 'folds';
import { PageNav } from '../../../components/page';
import { UserAvatar } from '../../../components/user-avatar';
import { TouchListArea } from '../../../features/room-nav/TouchList';
import { LogoutPrompt, SettingsPage, SettingsPages } from '../../../features/settings';
import { SETTINGS_MENU_ITEMS, getSettingsPageSlug } from '../../../features/settings/menu';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { useUnverifiedDevices } from '../../../hooks/useUnverifiedDevices';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { nameInitials } from '../../../utils/common';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../../utils/matrix';
import { getYouPagePath, getYouPath } from '../../pathUtils';
import { YouProfile, YouRow, YouRows, YouWarningRow } from './YouView';

// Says a settings page was opened from the menu, so closing it is a step back in the history.
type YouPageState = { fromYou?: boolean };

/**
 * The You tab of a phone: who is signed in, the device warning the rail shows as a shield, and
 * the settings menu. It is the menu of the settings on a phone; each entry opens its page at a
 * path of its own, so the system back button returns here.
 */
export function You() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const navigate = useNavigate();
  const userId = mx.getSafeUserId();
  const profile = useUserProfile(userId);
  const unverifiedDevices = useUnverifiedDevices();
  const [logout, setLogout] = useState(false);

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const openPage = (page: SettingsPages) => {
    const state: YouPageState = { fromYou: true };
    navigate(getYouPagePath(getSettingsPageSlug(page)), { state });
  };

  return (
    <PageNav>
      <TouchListArea>
        <YouProfile
          avatar={
            <UserAvatar
              userId={userId}
              src={avatarUrl}
              renderFallback={() => <Text size="H3">{nameInitials(displayName)}</Text>}
            />
          }
          displayName={displayName}
          userId={userId}
        />
        {unverifiedDevices && (
          <YouRows>
            <YouWarningRow
              unverifiedDevices={unverifiedDevices}
              onClick={() => openPage(SettingsPages.DevicesPage)}
            />
          </YouRows>
        )}
        <Line variant="Background" size="300" />
        <YouRows>
          {SETTINGS_MENU_ITEMS.map((item) => (
            <YouRow key={item.slug} icon={item.icon} onClick={() => openPage(item.page)}>
              {item.name}
            </YouRow>
          ))}
        </YouRows>
        <Line variant="Background" size="300" />
        <YouRows>
          <YouRow icon={Icons.Power} critical onClick={() => setLogout(true)}>
            Logout
          </YouRow>
        </YouRows>
      </TouchListArea>
      {logout && <LogoutPrompt onClose={() => setLogout(false)} />}
    </PageNav>
  );
}

/** A settings page as a page of the You tab: the whole screen, without the bar. */
export function YouSettings() {
  const { page } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const item = SETTINGS_MENU_ITEMS.find((menuItem) => menuItem.slug === page);

  if (!item) return <Navigate to={getYouPath()} replace />;

  const handleClose = () => {
    // Opened from the menu, the menu is one step back. Opened from a link, there is no such step.
    if ((location.state as YouPageState | null)?.fromYou) {
      navigate(-1);
      return;
    }
    navigate(getYouPath(), { replace: true });
  };

  return <SettingsPage page={item.page} requestClose={handleClose} />;
}
