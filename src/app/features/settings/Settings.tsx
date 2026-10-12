import React, { useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  config,
  Icon,
  IconButton,
  Icons,
  MenuItem,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { General } from './general';
import { PageNav, PageNavContent, PageNavHeader, PageRoot } from '../../components/page';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { Account } from './account';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { UserAvatar } from '../../components/user-avatar';
import { nameInitials } from '../../utils/common';
import { Notifications } from './notifications';
import { Devices } from './devices';
import { EmojisStickers } from './emojis-stickers';
import { DeveloperTools } from './developer-tools';
import { About } from './about';
import { UseStateProvider } from '../../components/UseStateProvider';
import { stopPropagation } from '../../utils/keyboard';
import { LogoutDialog } from '../../components/LogoutDialog';
import { SETTINGS_MENU_ITEMS, SettingsPages } from './menu';

export { SettingsPages };

type SettingsPageProps = {
  page: SettingsPages;
  requestClose: () => void;
};
/**
 * One page of the settings, by itself. The modal shows it beside its menu; on a phone the You
 * tab is the menu and a route shows the page.
 */
export function SettingsPage({ page, requestClose }: SettingsPageProps) {
  return (
    <>
      {page === SettingsPages.GeneralPage && <General requestClose={requestClose} />}
      {page === SettingsPages.AccountPage && <Account requestClose={requestClose} />}
      {page === SettingsPages.NotificationPage && <Notifications requestClose={requestClose} />}
      {page === SettingsPages.DevicesPage && <Devices requestClose={requestClose} />}
      {page === SettingsPages.EmojisStickersPage && <EmojisStickers requestClose={requestClose} />}
      {page === SettingsPages.DeveloperToolsPage && <DeveloperTools requestClose={requestClose} />}
      {page === SettingsPages.AboutPage && <About requestClose={requestClose} />}
    </>
  );
}

/** The dialog that asks before logging out. */
export function LogoutPrompt({ onClose }: { onClose: () => void }) {
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            onDeactivate: onClose,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <LogoutDialog handleClose={onClose} />
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

type SettingsProps = {
  initialPage?: SettingsPages;
  requestClose: () => void;
};
export function Settings({ initialPage, requestClose }: SettingsProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);
  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const screenSize = useScreenSizeContext();
  const [activePage, setActivePage] = useState<SettingsPages | undefined>(() => {
    if (initialPage) return initialPage;
    return screenSize === ScreenSize.Mobile ? undefined : SettingsPages.GeneralPage;
  });

  const handlePageRequestClose = () => {
    if (screenSize === ScreenSize.Mobile) {
      setActivePage(undefined);
      return;
    }
    requestClose();
  };

  return (
    <PageRoot
      nav={
        screenSize === ScreenSize.Mobile && activePage !== undefined ? undefined : (
          <PageNav size="300">
            <PageNavHeader outlined={false}>
              <Box grow="Yes" gap="200">
                <Avatar size="200" radii="300">
                  <UserAvatar
                    userId={userId}
                    src={avatarUrl}
                    renderFallback={() => <Text size="H6">{nameInitials(displayName)}</Text>}
                  />
                </Avatar>
                <Text size="H4" truncate>
                  Settings
                </Text>
              </Box>
              <Box shrink="No">
                {screenSize === ScreenSize.Mobile && (
                  <IconButton onClick={requestClose} variant="Background">
                    <Icon src={Icons.Cross} />
                  </IconButton>
                )}
              </Box>
            </PageNavHeader>
            <Box grow="Yes" direction="Column">
              <PageNavContent>
                <div style={{ flexGrow: 1 }}>
                  {SETTINGS_MENU_ITEMS.map((item) => (
                    <MenuItem
                      key={item.name}
                      variant="Background"
                      radii="400"
                      aria-pressed={activePage === item.page}
                      before={<Icon src={item.icon} size="100" filled={activePage === item.page} />}
                      onClick={() => setActivePage(item.page)}
                    >
                      <Text
                        style={{
                          fontWeight: activePage === item.page ? config.fontWeight.W600 : undefined,
                        }}
                        size="T300"
                        truncate
                      >
                        {item.name}
                      </Text>
                    </MenuItem>
                  ))}
                </div>
              </PageNavContent>
              <Box style={{ padding: config.space.S200 }} shrink="No" direction="Column">
                <UseStateProvider initial={false}>
                  {(logout, setLogout) => (
                    <>
                      <Button
                        size="300"
                        variant="Critical"
                        fill="None"
                        radii="Pill"
                        before={<Icon src={Icons.Power} size="100" />}
                        onClick={() => setLogout(true)}
                      >
                        <Text size="B400">Logout</Text>
                      </Button>
                      {logout && <LogoutPrompt onClose={() => setLogout(false)} />}
                    </>
                  )}
                </UseStateProvider>
              </Box>
            </Box>
          </PageNav>
        )
      }
    >
      {activePage !== undefined && (
        <SettingsPage page={activePage} requestClose={handlePageRequestClose} />
      )}
    </PageRoot>
  );
}
