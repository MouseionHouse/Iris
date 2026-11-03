import React, { ReactNode, useEffect } from 'react';
import { configClass, varsClass } from 'folds';
import { useAtomValue } from 'jotai';
import {
  IrisDarkTheme,
  IrisLightTheme,
  Theme,
  ThemeContextProvider,
  ThemeKind,
  hubThemeAtom,
  useActiveTheme,
  useSystemThemeKind,
} from '../hooks/useTheme';
import { applyThemeChrome } from '../native/systemChrome';
import { useDesktopColorScheme, useDesktopSignedOut } from '../native/useDesktopBridge';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';

export function UnAuthRouteThemeManager() {
  // The sign-in screen follows Plasma too inside the desktop shell.
  useDesktopColorScheme();
  // The sign-in pages are what a signed-out Iris renders: no badge there.
  useDesktopSignedOut();
  const systemThemeKind = useSystemThemeKind();
  // Framed inside the hub, the login screen matches the hub's theme instead
  // of the browser's `prefers-color-scheme` (see `hubThemeAtom`'s doc comment
  // for why this has to be read pre-authentication, not just in
  // `AuthRouteThemeManager`).
  const hubTheme = useAtomValue(hubThemeAtom);

  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(configClass, varsClass);

    let theme: Theme;
    if (hubTheme) {
      theme = hubTheme;
      document.body.classList.add(...hubTheme.classNames);
    } else if (systemThemeKind === ThemeKind.Dark) {
      theme = IrisDarkTheme;
      document.body.classList.add(...IrisDarkTheme.classNames);
    } else {
      theme = IrisLightTheme;
      document.body.classList.add(...IrisLightTheme.classNames);
    }

    // Paint the page background / theme-color / status bar to match (safe-area +
    // edge-to-edge chrome, mobile/WRAPPER-PLAN.md Phase 3).
    applyThemeChrome(theme);
  }, [systemThemeKind, hubTheme]);

  return null;
}

export function AuthRouteThemeManager({ children }: { children: ReactNode }) {
  const activeTheme = useActiveTheme();
  const [monochromeMode] = useSetting(settingsAtom, 'monochromeMode');

  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(configClass, varsClass);

    document.body.classList.add(...activeTheme.classNames);

    if (monochromeMode) {
      document.body.style.filter = 'grayscale(1)';
    } else {
      document.body.style.filter = '';
    }

    // Paint the page background / theme-color / status bar to match (safe-area +
    // edge-to-edge chrome, mobile/WRAPPER-PLAN.md Phase 3).
    applyThemeChrome(activeTheme);
  }, [activeTheme, monochromeMode]);

  return <ThemeContextProvider value={activeTheme}>{children}</ThemeContextProvider>;
}
