import React, { ReactNode } from 'react';
import { Icon, Icons, IconSrc, Text } from 'folds';
import { SheetAction } from '../../../features/room-nav/TouchList';
import { UnverifiedDevices } from '../../../hooks/useUnverifiedDevices';
import * as css from './You.css';

/*
 * The look of the You tab of a phone. Nothing here reads Matrix: `You` does, and the mock page
 * renders these on a fake user.
 */

type YouProfileProps = {
  /** Fills the 64 px avatar box. */
  avatar: ReactNode;
  displayName: string;
  userId: string;
};
export function YouProfile({ avatar, displayName, userId }: YouProfileProps) {
  return (
    <div className={css.Profile}>
      <span className={css.ProfileAvatar}>{avatar}</span>
      <span className={css.ProfileNames}>
        <Text as="h1" size="H3" truncate>
          {displayName}
        </Text>
        <Text as="span" size="T300" priority="300" truncate>
          {userId}
        </Text>
      </span>
    </div>
  );
}

export function YouRows({ children }: { children: ReactNode }) {
  return <div className={css.Rows}>{children}</div>;
}

type YouRowProps = {
  icon: IconSrc;
  /** An action of its own, like logging out, instead of a page to open. */
  critical?: boolean;
  onClick: () => void;
  children: ReactNode;
};
/** A row of the menu, 56 px tall: an icon, a name, and a chevron when it opens a page. */
export function YouRow({ icon, critical, onClick, children }: YouRowProps) {
  return (
    <SheetAction
      className={critical ? css.CriticalRow : undefined}
      before={<Icon size="200" src={icon} />}
      after={
        critical ? undefined : <Icon className={css.RowAfter} size="100" src={Icons.ChevronRight} />
      }
      onClick={onClick}
    >
      {children}
    </SheetAction>
  );
}

type YouWarningRowProps = {
  unverifiedDevices: UnverifiedDevices;
  onClick: () => void;
};
/** What the shield of the rail says on a wide screen: a device of the user is not verified. */
export function YouWarningRow({ unverifiedDevices, onClick }: YouWarningRowProps) {
  const { current, others } = unverifiedDevices;
  let label = 'Verify this device';
  if (!current) label = others === 1 ? '1 unverified device' : `${others} unverified devices`;

  return (
    <SheetAction
      className={css.WarningRow}
      data-critical={current}
      before={<Icon size="200" src={Icons.ShieldUser} />}
      after={<Icon className={css.RowAfter} size="100" src={Icons.ChevronRight} />}
      onClick={onClick}
    >
      {label}
    </SheetAction>
  );
}
