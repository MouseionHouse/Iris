import { PluginListenerHandle } from '@capacitor/core';
import { useAtomValue } from 'jotai';
import { SyncState } from 'matrix-js-sdk';
import { useCallback, useEffect, useState } from 'react';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useRoomNavigate } from '../hooks/useRoomNavigate';
import { useSyncState } from '../hooks/useSyncState';
import { allInvitesAtom } from '../state/room-list/inviteList';
import { roomToUnreadAtom } from '../state/room/roomToUnread';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import {
  MouseionPush,
  NativePushState,
  isNativePushAvailable,
  registerPusher,
  removePusher,
} from './pushBridge';

/**
 * Android push bridge (mobile/WRAPPER-PLAN.md, "Bridge contract"). A WebView does not run while
 * the app is in the background, so without this the phone only learns of a message when the app
 * is opened. The native `MouseionPush` plugin receives UnifiedPush (ntfy) messages, fetches the
 * event with the session stored here and posts the notification; the web app owns the Matrix
 * pusher that makes Synapse send them.
 *
 * Everything here is a no-op on the desktop web build.
 */

const listen = (handles: Promise<PluginListenerHandle>[]): (() => void) => {
  let disposed = false;
  const resolved: PluginListenerHandle[] = [];
  handles.forEach((p) =>
    p.then((handle) => {
      if (disposed) handle.remove().catch(() => undefined);
      else resolved.push(handle);
    })
  );
  return () => {
    disposed = true;
    resolved.forEach((handle) => handle.remove().catch(() => undefined));
  };
};

/**
 * Keeps native push in step with the signed-in client: hands the session to the push service,
 * (re)registers the pusher for the endpoint at every start and whenever the push app delivers a
 * new one, and opens the room of a tapped notification. Mount inside the client tree.
 */
export function NativePushFeature() {
  const mx = useMatrixClient();
  const { navigateRoom } = useRoomNavigate();
  const [isNotificationSounds] = useSetting(settingsAtom, 'isNotificationSounds');
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const invites = useAtomValue(allInvitesAtom);
  const [inSync, setInSync] = useState(false);

  useSyncState(
    mx,
    useCallback((state: SyncState) => setInSync(state === SyncState.Syncing), [])
  );

  // Coming back to the app, the state on screen is as old as the pause until the next sync.
  useEffect(() => {
    const onVisibilityChange = () => setInSync(false);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!isNativePushAvailable()) return undefined;

    const userId = mx.getUserId();
    const accessToken = mx.getAccessToken();
    if (userId && accessToken) {
      MouseionPush.setSession({ baseUrl: mx.baseUrl, userId, accessToken }).catch((e) =>
        console.warn('MouseionPush: could not store the session', e)
      );
    }

    const onEndpoint = ({ pushkey }: { pushkey: string }) => {
      MouseionPush.getState()
        .then((state) => registerPusher(mx, pushkey, state.deviceName))
        .catch((e) => console.warn('MouseionPush: pusher registration failed', e));
    };

    const stop = listen([
      MouseionPush.addListener('endpoint', onEndpoint),
      MouseionPush.addListener('unregistered', ({ pushkey }) => {
        removePusher(mx, pushkey).catch(() => undefined);
      }),
    ]);

    // Registered at every start: the endpoint may have arrived while the app was not running,
    // and UnifiedPush recommends re-registering so a lost registration heals itself.
    MouseionPush.getState()
      .then(async (state) => {
        if (state.endpoint) await registerPusher(mx, state.endpoint, state.deviceName);
        await MouseionPush.refresh();
      })
      .catch((e) => console.warn('MouseionPush: start-up registration failed', e));

    return stop;
  }, [mx]);

  useEffect(() => {
    if (!isNativePushAvailable()) return undefined;
    return listen([
      MouseionPush.addListener('notificationTap', ({ roomId }) => navigateRoom(roomId)),
    ]);
  }, [navigateRoom]);

  // A room read here, or on another device while the app was closed, leaves the shade. Only once
  // a sync has completed on screen: before that the unread state predates the notifications.
  useEffect(() => {
    if (!isNativePushAvailable() || !inSync || document.visibilityState !== 'visible') return;
    MouseionPush.setUnreadRooms({ roomIds: [...roomToUnread.keys(), ...invites] }).catch(
      () => undefined
    );
  }, [inSync, roomToUnread, invites]);

  useEffect(() => {
    if (!isNativePushAvailable()) return;
    MouseionPush.setSoundEnabled({ enabled: isNotificationSounds }).catch(() => undefined);
  }, [isNotificationSounds]);

  return null;
}

/** The push state for Settings, re-read when the app returns to the foreground. */
export const useNativePushState = (): [NativePushState | undefined, () => void] => {
  const [state, setState] = useState<NativePushState>();

  const reload = useCallback(() => {
    if (!isNativePushAvailable()) return;
    MouseionPush.getState()
      .then(setState)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    reload();
    if (!isNativePushAvailable()) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    const stop = listen([
      MouseionPush.addListener('stateChanged', reload),
      MouseionPush.addListener('endpoint', reload),
      MouseionPush.addListener('unregistered', reload),
    ]);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      stop();
    };
  }, [reload]);

  return [state, reload];
};
