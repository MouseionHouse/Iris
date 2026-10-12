import { matchPath } from 'react-router-dom';
import {
  CREATE_PATH,
  DIRECT_PATH,
  EXPLORE_PATH,
  HOME_PATH,
  INBOX_PATH,
  SEARCH_PATH,
  SPACE_PATH,
  YOU_PATH,
} from './paths';
import {
  getDirectPath,
  getExplorePath,
  getHomePath,
  getInboxNotificationsPath,
  getSearchPath,
  getSpacePath,
  getYouPath,
} from './pathUtils';

/*
 * Where a phone is in the app, read from the path alone, so it can be checked without a
 * homeserver: which tab of the bottom bar a page belongs to, and where its back arrow leads.
 */

export type BottomNavTab = 'home' | 'direct' | 'activity' | 'search' | 'you';

const matches = (path: string, pathname: string, end: boolean): boolean =>
  !!matchPath({ path, caseSensitive: true, end }, pathname);

/**
 * The tab of the bottom bar a path belongs to. A path with no tab has no bar: a room, a create
 * page, the lobby, message search and a settings page each take the whole screen, as they did
 * when the rail was what got hidden.
 */
export const getBottomNavTab = (pathname: string): BottomNavTab | undefined => {
  if (matches(HOME_PATH, pathname, true)) return 'home';
  if (matches(DIRECT_PATH, pathname, true)) return 'direct';
  // Both lists of Activity keep the bar; the switch between them is in their header.
  if (matches(INBOX_PATH, pathname, false)) return 'activity';
  if (matches(SEARCH_PATH, pathname, true)) return 'search';
  if (matches(YOU_PATH, pathname, true)) return 'you';
  // Everything else with a static first segment is a full-screen page.
  if (
    [HOME_PATH, DIRECT_PATH, SEARCH_PATH, YOU_PATH, EXPLORE_PATH, CREATE_PATH].some((path) =>
      matches(path, pathname, false)
    )
  ) {
    return undefined;
  }
  // A space is reached from Home's title, so its list is a page of Home.
  if (matches(SPACE_PATH, pathname, true)) return 'home';
  return undefined;
};

/**
 * Where the back arrow of a page leads: up to the list the page was opened from. Undefined for
 * a path that is not the app's.
 */
export const getBackPath = (pathname: string): string | undefined => {
  if (matches(HOME_PATH, pathname, false)) return getHomePath();
  if (matches(DIRECT_PATH, pathname, false)) return getDirectPath();
  if (matches(SEARCH_PATH, pathname, false)) return getSearchPath();
  if (matches(YOU_PATH, pathname, false)) return getYouPath();
  if (matches(INBOX_PATH, pathname, false)) return getInboxNotificationsPath();
  // Explore and Create Space are opened from Home's sheets and have no tab to return by.
  if (matches(EXPLORE_PATH, pathname, true)) return getHomePath();
  if (matches(EXPLORE_PATH, pathname, false)) return getExplorePath();
  if (matches(CREATE_PATH, pathname, false)) return getHomePath();

  if (matches(SPACE_PATH, pathname, true)) return getHomePath();
  const spaceMatch = matchPath({ path: SPACE_PATH, caseSensitive: true, end: false }, pathname);
  const encodedSpaceIdOrAlias = spaceMatch?.params.spaceIdOrAlias;
  if (encodedSpaceIdOrAlias) return getSpacePath(decodeURIComponent(encodedSpaceIdOrAlias));

  return undefined;
};
