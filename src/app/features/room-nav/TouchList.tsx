import React, { MouseEventHandler, ReactNode } from 'react';
import { Icon, IconSrc, Icons, Text, as } from 'folds';
import classNames from 'classnames';
import { ListFilter } from '../../state/listFilter';
import { UnreadBadge } from '../../components/unread-badge';
import * as css from './touch.css';

/** A 48 px touch target around a 24 px icon. */
export const TouchIconButton = as<'button', { src: IconSrc; filled?: boolean }>(
  ({ className, src, filled, ...props }, ref) => (
    <button
      type="button"
      className={classNames(css.TouchIconButton, className)}
      {...props}
      ref={ref}
    >
      <Icon src={src} size="200" filled={filled} />
    </button>
  )
);

const FILTERS: [ListFilter, string][] = [
  ['all', 'All'],
  ['unreads', 'Unread'],
  ['mentions', 'Mentions'],
];

type ListFilterChipsProps = {
  value: ListFilter;
  onChange: (filter: ListFilter) => void;
  /** How many conversations are unread. */
  unreadCount: number;
};
export function ListFilterChips({ value, onChange, unreadCount }: ListFilterChipsProps) {
  return (
    <div className={css.FilterChips} role="group" aria-label="Filter conversations">
      {FILTERS.map(([filter, label]) => (
        <button
          key={filter}
          type="button"
          className={css.FilterChip}
          aria-pressed={filter === value}
          onClick={() => onChange(filter)}
        >
          <span className={css.FilterChipPill}>
            <Text as="span" size="T300">
              {label}
            </Text>
            {filter === 'unreads' && unreadCount > 0 && (
              <Text as="span" size="T200" className={css.FilterChipCount}>
                {unreadCount}
              </Text>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

/** The + button over the bottom corner of a list. Its parent is a `TouchListArea`. */
export const ListFab = as<'button'>(({ className, ...props }, ref) => (
  <button type="button" className={classNames(css.Fab, className)} {...props} ref={ref}>
    <Icon src={Icons.Plus} size="300" />
  </button>
));

export function TouchListEmpty({ children }: { children: ReactNode }) {
  return (
    <div className={css.TouchListEmpty}>
      <Text priority="300">{children}</Text>
    </div>
  );
}

type SheetActionProps = {
  /** An icon, or a small avatar. */
  before: ReactNode;
  after?: ReactNode;
  /** The place the user is at already. */
  current?: boolean;
  children: ReactNode;
};
export const SheetAction = as<'button', SheetActionProps>(
  ({ className, before, after, current, children, ...props }, ref) => (
    <button
      type="button"
      className={classNames(css.SheetAction, className)}
      aria-current={current || undefined}
      {...props}
      ref={ref}
    >
      <span className={css.SheetActionBefore}>{before}</span>
      <Text as="span" size="T400" className={css.SheetActionLabel} truncate>
        {children}
      </Text>
      {after}
    </button>
  )
);

export function SheetActions({ children }: { children: ReactNode }) {
  return <div className={css.SheetActions}>{children}</div>;
}

type SectionHeaderTouchProps = {
  label: string;
  closed: boolean;
  /** What is waiting in the section, shown while it is folded. */
  unread?: { total: number; highlight: boolean };
  onToggle: () => void;
  optionsLabel: string;
  optionsOpen?: boolean;
  onOptions: MouseEventHandler<HTMLButtonElement>;
};
/** A section header on a phone: the whole width folds the section, the dots open its options. */
export function SectionHeaderTouch({
  label,
  closed,
  unread,
  onToggle,
  optionsLabel,
  optionsOpen,
  onOptions,
}: SectionHeaderTouchProps) {
  return (
    <div className={css.TouchSectionHeader}>
      <button
        type="button"
        className={css.TouchSectionButton}
        aria-expanded={!closed}
        onClick={onToggle}
      >
        <Icon
          className={css.TouchSectionIcon}
          size="50"
          src={closed ? Icons.ChevronRight : Icons.ChevronBottom}
        />
        <Text as="span" size="O400" priority="300" truncate>
          {label}
        </Text>
        {closed && unread && <UnreadBadge highlight={unread.highlight} count={unread.total} />}
      </button>
      <TouchIconButton
        src={Icons.VerticalDots}
        aria-label={optionsLabel}
        aria-pressed={optionsOpen}
        onClick={onOptions}
      />
    </div>
  );
}
