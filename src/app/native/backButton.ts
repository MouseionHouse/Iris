import { App } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { useEffect } from 'react';
import { editableActiveElement } from '../utils/dom';

/**
 * Android back button / back gesture (mobile/README.md, "Back button and gesture").
 *
 * Back first closes what is open on top of the page: an action sheet, a menu, a dialog,
 * the emoji board. Only with nothing open it goes back in the history, and at the start
 * of the history it puts the app in the background like the home button would, so the
 * session and the sync keep running.
 *
 * Overlays are not registered anywhere. All of them are rendered in #portalContainer
 * behind a focus trap which closes on Escape, so back is delivered to them as Escape
 * and new overlays are covered without knowing about this file.
 *
 * Everything here is a no-op on the desktop web build.
 */

export type BackAction = 'overlay' | 'history' | 'background';

const hasOverlay = (): boolean => {
  const portalContainer = document.getElementById('portalContainer');
  return !!portalContainer && portalContainer.children.length > 0;
};

const closeTopOverlay = (): boolean => {
  if (!hasOverlay()) return false;

  // Escape is left to a focused text field. Its keyboard is closed already:
  // Android spends the first back on the keyboard and does not report it.
  if (editableActiveElement()) (document.activeElement as HTMLElement).blur();

  const target = document.activeElement ?? document.body;
  const escape = new KeyboardEvent('keydown', {
    key: 'Escape',
    keyCode: 27,
    bubbles: true,
    cancelable: true,
  });
  // the focus trap which closes prevents the default of the event
  return !target.dispatchEvent(escape);
};

export const handleBackButton = (canGoBack: boolean): BackAction => {
  if (closeTopOverlay()) return 'overlay';
  if (canGoBack) {
    window.history.back();
    return 'history';
  }
  App.minimizeApp().catch(() => undefined);
  return 'background';
};

/**
 * Registers the native `backButton` listener once at app start. With a listener
 * registered the wrapper stops handling back on its own.
 */
export function BackButtonBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    let handle: PluginListenerHandle | undefined;
    let disposed = false;

    App.addListener('backButton', (event) => {
      if (!disposed) handleBackButton(event.canGoBack);
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
  }, []);

  return null;
}
