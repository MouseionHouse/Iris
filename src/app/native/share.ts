import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { atom, useSetAtom } from 'jotai';
import { useEffect } from 'react';

/**
 * Android text share bridge (mobile/WRAPPER-PLAN.md, Phase 2).
 *
 * The native `MouseionShare` plugin (MouseionSharePlugin.java) makes the app a text share
 * target two ways: the app itself in the share sheet, and per-chat targets (Direct Share
 * shortcuts published from setShareTargets). A share arrives as a `sharedContent` event,
 * with `roomId` set when a per-chat target was picked. Tapping one of those shortcuts from
 * the launcher instead sends `openRoom`. Events are retained natively until first
 * consumed, so one that cold-starts the app survives until the listener registers.
 *
 * Everything here is a no-op on the desktop web build.
 */

export type SharedContent = {
  text: string;
  /** Set when the user picked a chat in the share sheet (a per-chat target). */
  roomId?: string;
};

export type OpenRoomRequest = {
  roomId: string;
};

export type ShareTarget = {
  roomId: string;
  label: string;
};

type MouseionShareApi = {
  addListener(
    eventName: 'sharedContent',
    listenerFunc: (event: SharedContent) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'openRoom',
    listenerFunc: (event: OpenRoomRequest) => void
  ): Promise<PluginListenerHandle>;
  setShareTargets(options: { targets: ShareTarget[] }): Promise<void>;
};

const MouseionShare = registerPlugin<MouseionShareApi>('MouseionShare');

/** Shared text that arrived but has not been sent to a chat's composer yet. */
export const pendingSharedTextAtom = atom<SharedContent | undefined>(undefined);

/** A chat shortcut tapped from the launcher, not yet navigated to. */
export const pendingOpenRoomAtom = atom<OpenRoomRequest | undefined>(undefined);

export const isNativeShareAvailable = (): boolean => Capacitor.isNativePlatform();

/** Publishes the per-chat share targets, most relevant first. An empty list removes them. */
export const setShareTargets = (targets: ShareTarget[]): Promise<void> =>
  isNativeShareAvailable() ? MouseionShare.setShareTargets({ targets }) : Promise.resolve();

/**
 * Registers the native listeners once at app start. Mount it inside the Jotai provider
 * (App.tsx), ahead of the router, so shares received while signed out are held in the
 * pending atoms until the client tree consumes them.
 */
export function SharedContentBridge() {
  const setPendingText = useSetAtom(pendingSharedTextAtom);
  const setPendingOpenRoom = useSetAtom(pendingOpenRoomAtom);

  useEffect(() => {
    if (!isNativeShareAvailable()) return undefined;

    const handles: PluginListenerHandle[] = [];
    let disposed = false;
    const keep = (handle: PluginListenerHandle) => {
      if (disposed) handle.remove().catch(() => undefined);
      else handles.push(handle);
    };

    MouseionShare.addListener('sharedContent', (event) => {
      if (!disposed) setPendingText(event);
    }).then(keep);
    MouseionShare.addListener('openRoom', (event) => {
      if (!disposed) setPendingOpenRoom(event);
    }).then(keep);

    return () => {
      disposed = true;
      handles.forEach((handle) => handle.remove().catch(() => undefined));
    };
  }, [setPendingText, setPendingOpenRoom]);

  return null;
}
