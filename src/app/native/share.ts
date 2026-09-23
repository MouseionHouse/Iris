import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { atom, useSetAtom } from 'jotai';
import { useEffect } from 'react';

/**
 * Android text share bridge (mobile/WRAPPER-PLAN.md, Phase 2).
 *
 * The wrapper's MainActivity declares an ACTION_SEND/text/* intent filter, so the app
 * appears in the Android share sheet for text shares. The native `MouseionShare` plugin
 * forwards the shared text as a `sharedContent` event. The event is retained natively
 * until first consumed, so a share that cold-starts the app survives until the web app
 * registers its listener.
 *
 * Everything here is a no-op on the desktop web build.
 */

export type SharedContent = {
  text: string;
};

type MouseionShareApi = {
  addListener(
    eventName: 'sharedContent',
    listenerFunc: (event: SharedContent) => void
  ): Promise<PluginListenerHandle>;
};

const MouseionShare = registerPlugin<MouseionShareApi>('MouseionShare');

/** Shared text that arrived but has not been applied to a composer yet. */
export const pendingSharedTextAtom = atom<SharedContent | undefined>(undefined);

export const isNativeShareAvailable = (): boolean => Capacitor.isNativePlatform();

/**
 * Registers the native `sharedContent` listener once at app start. Mount it inside the
 * Jotai provider (App.tsx), ahead of the router, so shares received while signed out
 * are held in pendingSharedTextAtom until the client tree consumes them.
 */
export function SharedContentBridge() {
  const setPending = useSetAtom(pendingSharedTextAtom);

  useEffect(() => {
    if (!isNativeShareAvailable()) return undefined;

    let handle: PluginListenerHandle | undefined;
    let disposed = false;

    MouseionShare.addListener('sharedContent', (event) => {
      if (!disposed) setPending(event);
    }).then((listenerHandle) => {
      if (disposed) {
        listenerHandle.remove().catch(() => undefined);
      } else {
        handle = listenerHandle;
      }
    });

    return () => {
      disposed = true;
      handle?.remove().catch(() => undefined);
    };
  }, [setPending]);

  return null;
}
