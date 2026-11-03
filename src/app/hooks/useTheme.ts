import { lightTheme } from 'folds';
import { atom, useAtomValue } from 'jotai';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onDarkFontWeight, onLightFontWeight } from '../../config.css';
import {
  butterTheme,
  darkTheme,
  irisDarkTheme,
  irisLightTheme,
  mouseionTheme,
  silverTheme,
} from '../../colors.css';
import { settingsAtom } from '../state/settings';
import { useSetting } from '../state/hooks/settings';
import { isFramed } from '../hub/hubBridge';
import { pickTheme, systemIsDark } from './themeChoice';

export enum ThemeKind {
  Light = 'light',
  Dark = 'dark',
}

export type Theme = {
  id: string;
  kind: ThemeKind;
  classNames: string[];
};

export const LightTheme: Theme = {
  id: 'light-theme',
  kind: ThemeKind.Light,
  classNames: [lightTheme, onLightFontWeight, 'prism-light'],
};

export const SilverTheme: Theme = {
  id: 'silver-theme',
  kind: ThemeKind.Light,
  classNames: ['silver-theme', silverTheme, onLightFontWeight, 'prism-light'],
};
export const DarkTheme: Theme = {
  id: 'dark-theme',
  kind: ThemeKind.Dark,
  classNames: ['dark-theme', darkTheme, onDarkFontWeight, 'prism-dark'],
};
export const ButterTheme: Theme = {
  id: 'butter-theme',
  kind: ThemeKind.Dark,
  classNames: ['butter-theme', butterTheme, onDarkFontWeight, 'prism-dark'],
};
/** Iris's own look, and what a member sees until they pick another theme. */
export const IrisLightTheme: Theme = {
  id: 'iris-light-theme',
  kind: ThemeKind.Light,
  classNames: ['iris-light-theme', irisLightTheme, onLightFontWeight, 'prism-light'],
};
export const IrisDarkTheme: Theme = {
  id: 'iris-dark-theme',
  kind: ThemeKind.Dark,
  classNames: ['iris-dark-theme', irisDarkTheme, onDarkFontWeight, 'prism-dark'],
};
export const MouseionTheme: Theme = {
  id: 'mouseion-theme',
  kind: ThemeKind.Dark,
  classNames: ['mouseion-theme', mouseionTheme, onDarkFontWeight, 'prism-dark'],
};

/**
 * A theme override driven by the framing hub (see `useHubBridge`). When the
 * hub sends `hub.theme` the bridge sets this atom, and both
 * `AuthRouteThemeManager` and `UnAuthRouteThemeManager` give it top priority.
 *
 * Its initial value is `MouseionTheme` whenever the client is framed, not
 * `null`: `useHubBridge` only mounts once the member is authenticated
 * (`ClientRoot`), so the login screen paints and sits there, however briefly,
 * before any `hub.theme` message can arrive. Defaulting to the hub's theme as
 * soon as we know we are framed avoids a light login screen flashing inside
 * the hub's dark shell. A member opening the client on its own (`isFramed()`
 * false) keeps their own theme choice, as before.
 */
export const hubThemeAtom = atom<Theme | null>(isFramed() ? MouseionTheme : null);

/**
 * The Plasma colour scheme, set by the desktop shell (`useDesktopBridge`); `null` everywhere else.
 * It stands in for the browser's `prefers-color-scheme`, so only "follow the system" follows it.
 */
export const desktopDarkAtom = atom<boolean | null>(null);

export const useThemes = (): Theme[] => {
  const themes: Theme[] = useMemo(
    () => [
      IrisLightTheme,
      IrisDarkTheme,
      LightTheme,
      SilverTheme,
      DarkTheme,
      ButterTheme,
      MouseionTheme,
    ],
    []
  );

  return themes;
};

export const useThemeNames = (): Record<string, string> =>
  useMemo(
    () => ({
      [IrisLightTheme.id]: 'Iris light',
      [IrisDarkTheme.id]: 'Iris dark',
      [LightTheme.id]: 'Light',
      [SilverTheme.id]: 'Silver',
      [DarkTheme.id]: 'Dark',
      [ButterTheme.id]: 'Butter',
      [MouseionTheme.id]: 'Mouseion',
    }),
    []
  );

export const useSystemThemeKind = (): ThemeKind => {
  const desktopDark = useAtomValue(desktopDarkAtom);
  const darkModeQueryList = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [themeKind, setThemeKind] = useState<ThemeKind>(
    darkModeQueryList.matches ? ThemeKind.Dark : ThemeKind.Light
  );

  useEffect(() => {
    const handleMediaQueryChange = () => {
      setThemeKind(darkModeQueryList.matches ? ThemeKind.Dark : ThemeKind.Light);
    };

    darkModeQueryList.addEventListener('change', handleMediaQueryChange);
    return () => {
      darkModeQueryList.removeEventListener('change', handleMediaQueryChange);
    };
  }, [darkModeQueryList, setThemeKind]);

  return systemIsDark(desktopDark, themeKind === ThemeKind.Dark) ? ThemeKind.Dark : ThemeKind.Light;
};

export const useActiveTheme = (): Theme => {
  const systemThemeKind = useSystemThemeKind();
  const themes = useThemes();
  const hubTheme = useAtomValue(hubThemeAtom);
  const [systemTheme] = useSetting(settingsAtom, 'useSystemTheme');
  const [themeId] = useSetting(settingsAtom, 'themeId');
  const [lightThemeId] = useSetting(settingsAtom, 'lightThemeId');
  const [darkThemeId] = useSetting(settingsAtom, 'darkThemeId');

  // A hub-driven override (only ever set when framed) wins over the member's
  // own choice, so the client matches the hub's light/dark mode.
  return pickTheme({
    hubTheme,
    useSystemTheme: systemTheme,
    systemDark: systemThemeKind === ThemeKind.Dark,
    themes,
    themeId,
    lightThemeId,
    darkThemeId,
    defaultLight: IrisLightTheme,
    defaultDark: IrisDarkTheme,
  });
};

const ThemeContext = createContext<Theme | null>(null);
export const ThemeContextProvider = ThemeContext.Provider;

export const useTheme = (): Theme => {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('No theme provided!');
  }

  return theme;
};
