import React, { ReactNode, useEffect } from 'react';
import { configClass, varsClass } from 'folds';
import { useAtomValue } from 'jotai';
import {
  DarkTheme,
  LightTheme,
  ThemeContextProvider,
  ThemeKind,
  hubThemeAtom,
  useActiveTheme,
  useSystemThemeKind,
} from '../hooks/useTheme';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';

export function UnAuthRouteThemeManager() {
  const systemThemeKind = useSystemThemeKind();
  // Framed inside the hub, the login screen matches the hub's theme instead
  // of the browser's `prefers-color-scheme` (see `hubThemeAtom`'s doc comment
  // for why this has to be read pre-authentication, not just in
  // `AuthRouteThemeManager`).
  const hubTheme = useAtomValue(hubThemeAtom);

  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(configClass, varsClass);
    if (hubTheme) {
      document.body.classList.add(...hubTheme.classNames);
    } else if (systemThemeKind === ThemeKind.Dark) {
      document.body.classList.add(...DarkTheme.classNames);
    } else if (systemThemeKind === ThemeKind.Light) {
      document.body.classList.add(...LightTheme.classNames);
    }
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
  }, [activeTheme, monochromeMode]);

  return <ThemeContextProvider value={activeTheme}>{children}</ThemeContextProvider>;
}
