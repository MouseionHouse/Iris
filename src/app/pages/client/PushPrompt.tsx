import React, { useCallback, useState } from 'react';
import { Box, Button, Line, Spinner, Text, color, config } from 'folds';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { MouseionPush, NativePushState } from '../../native/pushBridge';
import { useNativePushState } from '../../native/push';
import { getLocalStorageItem, setLocalStorageItem } from '../../state/utils/atomWithLocalStorage';
import { ContainerColor } from '../../styles/ContainerColor.css';

// The kinds of offer the user said "Not now" to. Cleared with the rest of localStorage on sign out.
const DISMISSED_KEY = 'pushPromptDismissed';

/**
 * What stands between the user and notifications, if anything they can act on:
 * - off: push was never turned on, and one push app is installed to turn it on with.
 * - choose: the same, with several push apps (Settings → Notifications lists them).
 * - noPushApp: no UnifiedPush app (ntfy) is installed.
 * - blocked: push is on, but Android does not let Iris post notifications.
 */
export type PushOffer =
  | { kind: 'off'; distributor: string }
  | { kind: 'choose' | 'noPushApp' | 'blocked' };

export const pushOfferOf = (state: NativePushState | undefined): PushOffer | undefined => {
  if (!state) return undefined;
  if (state.endpoint) return state.notificationsAllowed ? undefined : { kind: 'blocked' };
  // A push app is chosen and the endpoint is on its way: Settings shows that state.
  if (state.distributor) return undefined;
  if (state.distributors.length === 0) return { kind: 'noPushApp' };
  if (state.distributors.length > 1) return { kind: 'choose' };
  return { kind: 'off', distributor: state.distributors[0].id };
};

const OFFER_TEXT: Record<PushOffer['kind'], string> = {
  off: 'Turn them on to hear about new messages while Iris is closed.',
  choose: 'Pick a push app in Settings → Notifications to turn them on.',
  noPushApp: 'Iris delivers them through the ntfy app: install it from F-Droid and sign it in.',
  blocked: 'Android is blocking notifications from Iris.',
};

type PushPromptBarProps = {
  offer: PushOffer;
  busy?: boolean;
  error?: string;
  onAction: () => void;
  onDismiss: () => void;
};
export function PushPromptBar({ offer, busy, error, onAction, onDismiss }: PushPromptBarProps) {
  let actionLabel: string | undefined;
  if (offer.kind === 'off') actionLabel = 'Turn on';
  if (offer.kind === 'blocked') actionLabel = 'Allow';

  return (
    <Box direction="Column" shrink="No">
      <Box
        className={ContainerColor({ variant: 'SurfaceVariant' })}
        style={{ padding: `${config.space.S200} ${config.space.S400}` }}
        alignItems="Center"
        gap="300"
      >
        <Box grow="Yes" direction="Column">
          <Text size="L400">Notifications are off</Text>
          <Text size="T200" priority="300">
            {OFFER_TEXT[offer.kind]}
          </Text>
          {error && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              {error}
            </Text>
          )}
        </Box>
        <Box shrink="No" alignItems="Center" gap="200">
          <Button size="300" radii="300" variant="Secondary" fill="Soft" onClick={onDismiss}>
            <Text size="B300">Not now</Text>
          </Button>
          {actionLabel && (
            <Button
              size="300"
              radii="300"
              disabled={busy}
              before={busy ? <Spinner size="100" variant="Primary" fill="Solid" /> : undefined}
              onClick={onAction}
            >
              <Text size="B300">{actionLabel}</Text>
            </Button>
          )}
        </Box>
      </Box>
      <Line variant="SurfaceVariant" size="300" />
    </Box>
  );
}

/**
 * Offers to turn notifications on in the Android app. Push is off after every fresh install
 * (the app id change to Iris was one), and nothing else says so: the phone just stays silent.
 * Renders nothing on the web, or once push works or the offer was declined.
 */
export function PushPrompt() {
  const [state, reload] = useNativePushState();
  const [dismissed, setDismissed] = useState(() =>
    getLocalStorageItem<PushOffer['kind'][]>(DISMISSED_KEY, [])
  );

  const [actionState, act] = useAsyncCallback(
    useCallback(
      async (offer: PushOffer) => {
        if (offer.kind === 'off') await MouseionPush.enable({ distributor: offer.distributor });
        if (offer.kind === 'blocked') await MouseionPush.openNotificationSettings();
        reload();
      },
      [reload]
    )
  );

  const offer = pushOfferOf(state);
  if (!offer || dismissed.includes(offer.kind)) return null;

  const dismiss = () => {
    const next = [...dismissed, offer.kind];
    setLocalStorageItem(DISMISSED_KEY, next);
    setDismissed(next);
  };

  return (
    <PushPromptBar
      offer={offer}
      busy={actionState.status === AsyncStatus.Loading}
      error={
        actionState.status === AsyncStatus.Error ? 'Could not turn notifications on.' : undefined
      }
      onAction={() => act(offer).catch(() => undefined)}
      onDismiss={dismiss}
    />
  );
}
