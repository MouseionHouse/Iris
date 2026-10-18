import React, { useState } from 'react';
import { Badge, color, Icon, Icons, Text } from 'folds';
import {
  SidebarAvatar,
  SidebarItem,
  SidebarItemBadge,
  SidebarItemTooltip,
} from '../../../components/sidebar';
import { useUnverifiedDevices } from '../../../hooks/useUnverifiedDevices';
import * as css from './UnverifiedTab.css';
import { useCrossSigningActive } from '../../../hooks/useCrossSigning';
import { Modal500 } from '../../../components/Modal500';
import { Settings, SettingsPages } from '../../../features/settings';

function UnverifiedIndicator() {
  const unverifiedDevices = useUnverifiedDevices();
  const unverified = !!unverifiedDevices?.current;
  const unverifiedDeviceCount = unverifiedDevices?.others;

  const [settings, setSettings] = useState(false);
  const closeSettings = () => setSettings(false);

  const hasUnverified = !!unverifiedDevices;
  return (
    <>
      {hasUnverified && (
        <SidebarItem active={settings} className={css.UnverifiedTab}>
          <SidebarItemTooltip tooltip={unverified ? 'Unverified Device' : 'Unverified Devices'}>
            {(triggerRef) => (
              <SidebarAvatar
                className={unverified ? css.UnverifiedAvatar : css.UnverifiedOtherAvatar}
                as="button"
                ref={triggerRef}
                outlined
                onClick={() => setSettings(true)}
              >
                <Icon
                  style={{ color: unverified ? color.Critical.Main : color.Warning.Main }}
                  src={Icons.ShieldUser}
                />
              </SidebarAvatar>
            )}
          </SidebarItemTooltip>
          {!unverified && unverifiedDeviceCount && unverifiedDeviceCount > 0 && (
            <SidebarItemBadge hasCount>
              <Badge variant="Warning" size="400" fill="Solid" radii="Pill" outlined={false}>
                <Text as="span" size="L400">
                  {unverifiedDeviceCount}
                </Text>
              </Badge>
            </SidebarItemBadge>
          )}
        </SidebarItem>
      )}
      {settings && (
        <Modal500 requestClose={closeSettings}>
          <Settings initialPage={SettingsPages.DevicesPage} requestClose={closeSettings} />
        </Modal500>
      )}
    </>
  );
}

export function UnverifiedTab() {
  const crossSigningActive = useCrossSigningActive();

  if (!crossSigningActive) return null;

  return <UnverifiedIndicator />;
}
