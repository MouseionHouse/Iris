import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { IPusherRequest, MatrixClient } from 'matrix-js-sdk';

/**
 * The native `MouseionPush` plugin and the pusher rules, without React, so the client
 * (initMatrix) can clear the push session on logout. The feature itself is ./push.ts.
 */

export const PUSH_APP_ID = 'house.mouseion.iris';
// The app's id before it became Iris. That app is a separate install with its own pusher, which
// nothing removes when the phone moves to Iris: it keeps notifying from an app nobody opens.
const LEGACY_PUSH_APP_IDS = ['house.mouseion.chat'];
const PUSH_GATEWAY_PATH = '/_matrix/push/v1/notify';

export type PushDistributor = { id: string; label: string };

export type NativePushState = {
  distributors: PushDistributor[];
  /** The UnifiedPush app in use, if push was ever enabled. */
  distributor?: string;
  /** The endpoint the push app delivered; the pusher's pushkey. */
  endpoint?: string;
  notificationsAllowed: boolean;
  /** Why the last registration failed. */
  error?: string;
  /** Build.MODEL, for the pusher's device name. */
  deviceName: string;
};

type PushkeyEvent = { pushkey: string };

type MouseionPushApi = {
  getState(): Promise<NativePushState>;
  enable(options: { distributor: string }): Promise<void>;
  refresh(): Promise<{ registered: boolean }>;
  disable(): Promise<{ pushkey?: string }>;
  setSession(options: { baseUrl: string; userId: string; accessToken: string }): Promise<void>;
  clearSession(): Promise<void>;
  /** The rooms still unread: the notifications of every other room leave the shade. */
  setUnreadRooms(options: { roomIds: string[] }): Promise<void>;
  setSoundEnabled(options: { enabled: boolean }): Promise<void>;
  openNotificationSettings(): Promise<void>;
  addListener(
    eventName: 'endpoint' | 'unregistered',
    listenerFunc: (event: PushkeyEvent) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'notificationTap',
    listenerFunc: (event: { roomId: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(eventName: 'stateChanged', listenerFunc: () => void): Promise<PluginListenerHandle>;
};

export const MouseionPush = registerPlugin<MouseionPushApi>('MouseionPush');

export const isNativePushAvailable = (): boolean => Capacitor.isNativePlatform();

/**
 * The Matrix push gateway for a UnifiedPush endpoint: ntfy serves one at its own origin and only
 * accepts pushkeys on that origin, so the gateway follows the endpoint (2026-09-16).
 */
export const pushGatewayAt = (endpoint: string): string | undefined => {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return `${url.origin}${PUSH_GATEWAY_PATH}`;
  } catch {
    return undefined;
  }
};

export const pushDeviceDisplayName = (deviceName: string) => `Mouseion on ${deviceName}`;

export const removePusher = async (
  mx: MatrixClient,
  pushkey: string,
  appId: string = PUSH_APP_ID
): Promise<void> => {
  await mx.setPusher({
    pushkey,
    app_id: appId,
    kind: null,
  } as unknown as IPusherRequest);
};

/**
 * Makes [pushkey] this device's pusher. Always set (not only when missing), so the pusher follows
 * the current session: a pusher left on a deleted device would be dropped with it. Pushers this
 * device registered for older endpoints are removed, since they deliver to topics nobody reads,
 * and so are the ones it registered as the app Iris replaced.
 */
export const registerPusher = async (
  mx: MatrixClient,
  pushkey: string,
  deviceName: string
): Promise<void> => {
  const gateway = pushGatewayAt(pushkey);
  if (!gateway) throw new Error(`Not a push endpoint: ${pushkey}`);
  const deviceDisplayName = pushDeviceDisplayName(deviceName);

  await mx.setPusher({
    kind: 'http',
    app_id: PUSH_APP_ID,
    pushkey,
    app_display_name: 'Mouseion',
    device_display_name: deviceDisplayName,
    lang: 'en',
    data: { url: gateway, format: 'event_id_only' },
    append: false,
  });

  const { pushers } = await mx.getPushers();
  type Pusher = { app_id: string; pushkey: string; device_display_name?: string };
  const stale = pushers.filter(
    (p: Pusher) =>
      p.device_display_name === deviceDisplayName &&
      (p.app_id === PUSH_APP_ID ? p.pushkey !== pushkey : LEGACY_PUSH_APP_IDS.includes(p.app_id))
  );
  await Promise.all(stale.map((p: Pusher) => removePusher(mx, p.pushkey, p.app_id)));
};

/** Signed out: the push service must not keep fetching with the old token. */
export const clearNativePushSession = async (): Promise<void> => {
  if (!isNativePushAvailable()) return;
  await MouseionPush.clearSession().catch(() => undefined);
};
