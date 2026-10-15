import { Icons, IconSrc } from 'folds';

export enum SettingsPages {
  GeneralPage,
  AccountPage,
  NotificationPage,
  DevicesPage,
  EmojisStickersPage,
  DeveloperToolsPage,
  AboutPage,
}

export type SettingsMenuItem = {
  page: SettingsPages;
  name: string;
  icon: IconSrc;
  /** The page's segment of a path, where a route shows it instead of the modal. */
  slug: string;
};

/**
 * The settings menu. The modal lists it beside the open page; the You tab of a phone lists it
 * under the profile. It is kept free of the pages themselves, so listing it loads none of them.
 */
export const SETTINGS_MENU_ITEMS: SettingsMenuItem[] = [
  {
    page: SettingsPages.GeneralPage,
    name: 'General',
    icon: Icons.Setting,
    slug: 'general',
  },
  {
    page: SettingsPages.AccountPage,
    name: 'Account',
    icon: Icons.User,
    slug: 'account',
  },
  {
    page: SettingsPages.NotificationPage,
    name: 'Notifications',
    icon: Icons.Bell,
    slug: 'notifications',
  },
  {
    page: SettingsPages.DevicesPage,
    name: 'Devices',
    icon: Icons.Monitor,
    slug: 'devices',
  },
  {
    page: SettingsPages.EmojisStickersPage,
    name: 'Emojis & Stickers',
    icon: Icons.Smile,
    slug: 'emojis-stickers',
  },
  {
    page: SettingsPages.DeveloperToolsPage,
    name: 'Developer Tools',
    icon: Icons.Terminal,
    slug: 'developer-tools',
  },
  {
    page: SettingsPages.AboutPage,
    name: 'About',
    icon: Icons.Info,
    slug: 'about',
  },
];

export const getSettingsPageSlug = (page: SettingsPages): string =>
  SETTINGS_MENU_ITEMS.find((item) => item.page === page)?.slug ?? '';
