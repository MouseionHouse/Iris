import React, { ReactNode, useCallback } from 'react';
import { Box, Text, Switch, Button, color, Spinner } from 'folds';
import { IPusherRequest } from 'matrix-js-sdk';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { getNotificationState, usePermissionState } from '../../../hooks/usePermission';
import { useEmailNotifications } from '../../../hooks/useEmailNotifications';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { MouseionPush, isNativePushAvailable, removePusher } from '../../../native/pushBridge';
import { useNativePushState } from '../../../native/push';

function EmailNotification() {
  const mx = useMatrixClient();
  const [result, refreshResult] = useEmailNotifications();

  const [setState, setEnable] = useAsyncCallback(
    useCallback(
      async (email: string, enable: boolean) => {
        if (enable) {
          await mx.setPusher({
            kind: 'email',
            app_id: 'm.email',
            pushkey: email,
            app_display_name: 'Email Notifications',
            device_display_name: email,
            lang: 'en',
            data: {
              brand: 'Iris',
            },
            append: true,
          });
          return;
        }
        await mx.setPusher({
          pushkey: email,
          app_id: 'm.email',
          kind: null,
        } as unknown as IPusherRequest);
      },
      [mx]
    )
  );

  const handleChange = (value: boolean) => {
    if (result && result.email) {
      setEnable(result.email, value).then(() => {
        refreshResult();
      });
    }
  };

  return (
    <SettingTile
      title="Email Notification"
      description={
        <>
          {result && !result.email && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              Your account does not have any email attached.
            </Text>
          )}
          {result && result.email && <>Send notification to your email. {`("${result.email}")`}</>}
          {result === null && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              Unexpected Error!
            </Text>
          )}
          {result === undefined && 'Send notification to your email.'}
        </>
      }
      after={
        <>
          {setState.status !== AsyncStatus.Loading &&
            typeof result === 'object' &&
            result?.email && <Switch value={result.enabled} onChange={handleChange} />}
          {(setState.status === AsyncStatus.Loading || result === undefined) && (
            <Spinner variant="Secondary" />
          )}
        </>
      }
    />
  );
}

/**
 * The Android app's notifications (mobile/WRAPPER-PLAN.md): the WebView cannot notify while the app
 * is closed, so messages arrive through a UnifiedPush app (ntfy) instead.
 */
function PushNotification() {
  const mx = useMatrixClient();
  const [state, reload] = useNativePushState();

  const [enableState, enable] = useAsyncCallback(
    useCallback(
      async (distributor: string) => {
        await MouseionPush.enable({ distributor });
        reload();
      },
      [reload]
    )
  );
  const [disableState, disable] = useAsyncCallback(
    useCallback(async () => {
      const { pushkey } = await MouseionPush.disable();
      if (pushkey) await removePusher(mx, pushkey).catch(() => undefined);
      reload();
    }, [mx, reload])
  );

  const busy =
    state === undefined ||
    enableState.status === AsyncStatus.Loading ||
    disableState.status === AsyncStatus.Loading;
  const pushApp = state?.distributors.find((d) => d.id === state.distributor);
  const on = !!state?.endpoint;
  const connecting = !on && !!state?.distributor;

  let description: ReactNode = 'Get notified of new messages while the app is closed.';
  if (state && state.distributors.length === 0) {
    description = 'Install ntfy (F-Droid) and sign it in to get notified while the app is closed.';
  } else if (on && !state?.notificationsAllowed) {
    description = (
      <Text as="span" style={{ color: color.Critical.Main }} size="T200">
        Android is blocking notifications from Iris.
      </Text>
    );
  } else if (on) {
    description = `On, delivered through ${pushApp?.label ?? 'your push app'}.`;
  } else if (connecting) {
    description = `Connecting to ${pushApp?.label ?? 'your push app'}…`;
  }

  let after: ReactNode = null;
  if (busy) {
    after = <Spinner variant="Secondary" />;
  } else if (on && !state?.notificationsAllowed) {
    after = (
      <Button size="300" radii="300" onClick={() => MouseionPush.openNotificationSettings()}>
        <Text size="B300">Allow</Text>
      </Button>
    );
  } else if (on || connecting) {
    after = <Switch value onChange={() => disable()} />;
  } else if (state && state.distributors.length > 0) {
    after = (
      <Box gap="200" wrap="Wrap" justifyContent="End">
        {state.distributors.map((d) => (
          <Button key={d.id} size="300" radii="300" onClick={() => enable(d.id)}>
            <Text size="B300">{state.distributors.length === 1 ? 'Enable' : `Use ${d.label}`}</Text>
          </Button>
        ))}
      </Box>
    );
  }

  return (
    <SettingTile
      title="Push Notifications"
      description={
        <>
          {description}
          {state?.error && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              {` ${state.error}`}
            </Text>
          )}
          {enableState.status === AsyncStatus.Error && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              {' Could not turn notifications on.'}
            </Text>
          )}
        </>
      }
      after={after}
    />
  );
}

export function SystemNotification() {
  const notifPermission = usePermissionState('notifications', getNotificationState());
  const [showNotifications, setShowNotifications] = useSetting(settingsAtom, 'showNotifications');
  const [isNotificationSounds, setIsNotificationSounds] = useSetting(
    settingsAtom,
    'isNotificationSounds'
  );

  const requestNotificationPermission = () => {
    window.Notification.requestPermission();
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">System</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        {isNativePushAvailable() ? (
          <PushNotification />
        ) : (
          <SettingTile
            title="Desktop Notifications"
            description={
              notifPermission === 'denied' ? (
                <Text as="span" style={{ color: color.Critical.Main }} size="T200">
                  {'Notification' in window
                    ? 'Notification permission is blocked. Please allow notification permission from browser address bar.'
                    : 'Notifications are not supported by the system.'}
                </Text>
              ) : (
                <span>Show desktop notifications when message arrive.</span>
              )
            }
            after={
              notifPermission === 'prompt' ? (
                <Button size="300" radii="300" onClick={requestNotificationPermission}>
                  <Text size="B300">Enable</Text>
                </Button>
              ) : (
                <Switch
                  disabled={notifPermission !== 'granted'}
                  value={showNotifications}
                  onChange={setShowNotifications}
                />
              )
            }
          />
        )}
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Notification Sound"
          description="Play sound when new message arrive."
          after={<Switch value={isNotificationSounds} onChange={setIsNotificationSounds} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <EmailNotification />
      </SequenceCard>
    </Box>
  );
}
