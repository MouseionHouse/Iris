import React from 'react';
import { useNavigate } from 'react-router';
import { useAtomValue } from 'jotai';
import { Text } from 'folds';
import * as css from '../../../features/room-nav/touch.css';
import { getInboxInvitesPath, getInboxNotificationsPath } from '../../pathUtils';
import { allInvitesAtom } from '../../../state/room-list/inviteList';

export type ActivityList = 'notifications' | 'invites';

type ActivitySwitchProps = {
  value: ActivityList;
  onChange: (list: ActivityList) => void;
  inviteCount: number;
};
/** The two lists of Activity, as the chips of a conversation list. */
export function ActivitySwitch({ value, onChange, inviteCount }: ActivitySwitchProps) {
  const chip = (list: ActivityList, label: string, count?: number) => (
    <button
      type="button"
      className={css.FilterChip}
      aria-pressed={list === value}
      onClick={() => onChange(list)}
    >
      <span className={css.FilterChipPill}>
        <Text as="span" size="T300">
          {label}
        </Text>
        {!!count && (
          <Text as="span" size="T200" className={css.FilterChipCount}>
            {count}
          </Text>
        )}
      </span>
    </button>
  );

  return (
    <div className={css.FilterChips} role="group" aria-label="Activity">
      {chip('notifications', 'Notifications')}
      {chip('invites', 'Invites', inviteCount)}
    </div>
  );
}

/**
 * The top of the inbox on a phone, where it is the Activity tab: no back arrow, since the bar
 * under the page is the way out, and a switch between its two lists, which the rail's inbox
 * kept on a page of their own.
 */
export function ActivityTouchHeader({ list }: { list: ActivityList }) {
  const navigate = useNavigate();
  const inviteCount = useAtomValue(allInvitesAtom).length;

  const handleChange = (next: ActivityList) => {
    if (next === list) return;
    // Replaced, so that back leaves Activity instead of flipping between its lists.
    navigate(next === 'invites' ? getInboxInvitesPath() : getInboxNotificationsPath(), {
      replace: true,
    });
  };

  return (
    <>
      <header className={css.TouchHeader}>
        <Text size="H3" truncate>
          Activity
        </Text>
      </header>
      <ActivitySwitch value={list} onChange={handleChange} inviteCount={inviteCount} />
    </>
  );
}
