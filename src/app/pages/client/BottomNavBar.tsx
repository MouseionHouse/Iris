import React, { ReactNode } from 'react';
import { Icon, IconSrc, Text, as } from 'folds';
import classNames from 'classnames';
import { UnreadBadge } from '../../components/unread-badge';
import * as css from './BottomNav.css';

/*
 * The look of the bottom bar. Nothing here reads Matrix or the router: `BottomNav` does that
 * and the mock page renders these on fake numbers.
 */

/**
 * A tap on the open tab scrolls its list back to the top. The list says which element that is
 * with a `data-scroll-top-target` attribute, so the bar needs no ref into every page.
 */
export const scrollTabToTop = () => {
  document.querySelector('[data-scroll-top-target]')?.scrollTo({ top: 0, behavior: 'smooth' });
};

type BottomNavItemProps = {
  label: string;
  /** Left out when the tab shows something of its own, like the avatar of You. */
  icon?: IconSrc;
  active?: boolean;
  badge?: { count: number; highlight: boolean };
  /** A warning without a number. */
  dot?: 'warning' | 'critical';
  children?: ReactNode;
};
export const BottomNavItem = as<'button', BottomNavItemProps>(
  ({ className, label, icon, active, badge, dot, children, ...props }, ref) => (
    <button
      type="button"
      className={classNames(css.BottomNavItem, className)}
      aria-current={active ? 'page' : undefined}
      {...props}
      ref={ref}
    >
      <span className={css.BottomNavPill}>
        {children ?? (icon && <Icon src={icon} size="200" filled={active} />)}
        {badge && (
          <span className={css.BottomNavBadge}>
            <UnreadBadge highlight={badge.highlight} count={badge.count} />
          </span>
        )}
        {dot && !badge && <span className={css.BottomNavDot} data-critical={dot === 'critical'} />}
      </span>
      <Text as="span" size="T200" className={css.BottomNavLabel} truncate>
        {label}
      </Text>
    </button>
  )
);

/** What the You tab shows in place of an icon. Fills with a user avatar or initials. */
export function BottomNavAvatar({ children }: { children: ReactNode }) {
  return <span className={css.BottomNavAvatar}>{children}</span>;
}

export const BottomNavBar = as<'nav'>(({ className, ...props }, ref) => (
  <nav className={classNames(css.BottomNav, className)} aria-label="Main" {...props} ref={ref} />
));
