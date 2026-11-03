/**
 * Which theme is active. Pure, so the rules can be tested without the style sheets.
 *
 * - A theme forced from outside (the framing hub) wins.
 * - A theme picked in settings (`useSystemTheme` off) wins over the system.
 * - Only "follow the system" follows it, and the system is the Plasma colour scheme inside the
 *   desktop shell (`desktopDark`), else the browser's `prefers-color-scheme` (`mediaDark`).
 */
export const systemIsDark = (desktopDark: boolean | null, mediaDark: boolean): boolean =>
  desktopDark ?? mediaDark;

type WithId = { id: string };

export const pickTheme = <T extends WithId>(o: {
  hubTheme: T | null;
  useSystemTheme: boolean;
  systemDark: boolean;
  themes: T[];
  themeId?: string;
  lightThemeId?: string;
  darkThemeId?: string;
  defaultLight: T;
  defaultDark: T;
}): T => {
  if (o.hubTheme) return o.hubTheme;
  if (!o.useSystemTheme) return o.themes.find((t) => t.id === o.themeId) ?? o.defaultLight;
  return o.systemDark
    ? o.themes.find((t) => t.id === o.darkThemeId) ?? o.defaultDark
    : o.themes.find((t) => t.id === o.lightThemeId) ?? o.defaultLight;
};
