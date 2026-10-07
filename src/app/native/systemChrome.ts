import { Capacitor, SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';
import { color } from 'folds';
import { Theme, ThemeKind } from '../hooks/useTheme';

/**
 * Applies the active theme to the platform "chrome" that surrounds the web content:
 *
 *  - the page background, so the area under the status bar / inside the safe-area insets
 *    (notched phones, foldable punch-holes, edge-to-edge on Android 15+ and iOS standalone)
 *    is painted with the app surface instead of white;
 *  - the `<meta name="theme-color">`, which colours the browser toolbar / mobile status bar;
 *  - on the native wrapper, the Android status-bar icon style (light icons on dark themes,
 *    dark icons on light themes).
 *
 * Call this from the theme managers after the theme's classes have been applied to
 * `document.body` (the background is a folds `var(--…)` reference that only resolves once
 * the active theme class is present on the body).
 *
 * Everything here is a no-op on the desktop web build except the background and
 * `theme-color`, which are harmless there.
 */

// The Android core (Capacitor 8.5.x) registers the system-bars plugin under the id
// "SystemBars" (the `@capacitor/status-bar` web package still registers "StatusBar", which
// does not resolve on this core version), so we talk to "SystemBars" directly. The core
// already registers and exports it; registering the id a second time logs an error on
// every page load.

export function applyThemeChrome(theme: Theme): void {
  const background = color.Background.Container;

  document.body.style.backgroundColor = background;

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    // Resolve the `var(--…)` to a concrete colour for the meta tag (which can't use vars).
    themeColorMeta.setAttribute('content', getComputedStyle(document.body).backgroundColor);
  }

  if (Capacitor.isNativePlatform()) {
    // Best-effort: match the status-bar icon colour to the theme. "DARK" style = light icons
    // (for dark surfaces), "LIGHT" = dark icons (for light surfaces). No-ops (and is caught)
    // on web or if the plugin is unavailable.
    SystemBars.setStyle({
      bar: SystemBarType.StatusBar,
      style: theme.kind === ThemeKind.Dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    }).catch(() => undefined);
  }
}
