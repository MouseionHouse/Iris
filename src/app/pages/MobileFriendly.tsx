import { ReactNode } from 'react';
import { useLocation, useMatch } from 'react-router-dom';
import { ScreenSize, useScreenSizeContext } from '../hooks/useScreenSize';
import { getBottomNavTab } from './mobileNav';

type MobileFriendlyClientNavProps = {
  children: ReactNode;
};
/** The rail. A phone has the bottom bar in its place, so there it is never rendered. */
export function MobileFriendlyClientNav({ children }: MobileFriendlyClientNavProps) {
  const screenSize = useScreenSizeContext();

  if (screenSize === ScreenSize.Mobile) {
    return null;
  }

  return children;
}

type MobileFriendlyBottomNavProps = {
  children: ReactNode;
};
/**
 * The bottom bar: on a phone only, and only on the pages that belong to one of its tabs. A room,
 * a create page or anything else that takes the whole screen is shown without it.
 */
export function MobileFriendlyBottomNav({ children }: MobileFriendlyBottomNavProps) {
  const screenSize = useScreenSizeContext();
  const { pathname } = useLocation();

  if (screenSize !== ScreenSize.Mobile || !getBottomNavTab(pathname)) {
    return null;
  }

  return children;
}

type MobileFriendlyPageNavProps = {
  path: string;
  children: ReactNode;
};
export function MobileFriendlyPageNav({ path, children }: MobileFriendlyPageNavProps) {
  const screenSize = useScreenSizeContext();
  const exactPath = useMatch({
    path,
    caseSensitive: true,
    end: true,
  });

  if (screenSize === ScreenSize.Mobile && !exactPath) {
    return null;
  }

  return children;
}
