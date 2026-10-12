import React, { MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Icon, IconSrc, Text } from 'folds';
import { UnreadBadge } from '../../components/unread-badge';
import { TypingIndicator } from '../../components/typing-indicator';
import { useLongPress } from '../../hooks/useLongPress';
import { RoomPreview } from '../../utils/roomPreview';
import * as css from './touch.css';

/** What a room without an avatar shows in a row: its icon on a tile. */
export function RoomRowIconTile({ children }: { children: ReactNode }) {
  return <span className={css.TouchRowIconTile}>{children}</span>;
}

export type RoomRowProps = {
  linkPath: string;
  name: string;
  /** Fills the 44 px avatar box. */
  avatar: ReactNode;
  /** A short stamp of the last message. */
  time?: string;
  preview?: RoomPreview;
  /** Shown in place of the preview while someone is typing. */
  typing?: boolean;
  unread?: { total: number; highlight: boolean };
  /** The bell of a room whose notifications are not the default. */
  notificationIcon?: IconSrc;
  notificationLabel?: string;
  /** People in a call in the room. */
  liveCount?: number;
  selected?: boolean;
  /** The row's options are open. */
  pressed?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  /** A long-press, or the context menu. */
  onOptions: () => void;
};

/**
 * A conversation on a phone: the avatar, the name and the time, and under them the last message
 * with the unread count. Knows nothing of Matrix; `RoomNavItemTouch` reads the room for it.
 */
export function RoomRow({
  linkPath,
  name,
  avatar,
  time,
  preview,
  typing,
  unread,
  notificationIcon,
  notificationLabel,
  liveCount,
  selected,
  pressed,
  onClick,
  onOptions,
}: RoomRowProps) {
  const longPressProps = useLongPress<HTMLAnchorElement>(onOptions);

  const handleContextMenu: MouseEventHandler<HTMLAnchorElement> = (evt) => {
    // Android reports a long-press as context menu
    evt.preventDefault();
    onOptions();
  };

  return (
    <Link
      className={css.TouchRow}
      to={linkPath}
      draggable={false}
      aria-selected={selected}
      data-highlight={!!unread}
      data-pressed={pressed}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      {...longPressProps}
    >
      <span className={css.TouchRowAvatar}>{avatar}</span>
      <span className={css.TouchRowBody}>
        <span className={css.TouchRowLine}>
          <span className={css.TouchRowGrow}>
            <Text as="span" size="T400" className={css.TouchRowName} truncate>
              {name}
            </Text>
          </span>
          {!!liveCount && (
            <Badge variant="Critical" fill="Solid" size="400">
              <Text as="span" size="L400" truncate>
                {liveCount} Live
              </Text>
            </Badge>
          )}
          {time && (
            <Text
              as="span"
              size="T200"
              priority={unread ? '500' : '300'}
              className={css.TouchRowTime}
            >
              {time}
            </Text>
          )}
        </span>
        <span className={css.TouchRowLine}>
          <span className={css.TouchRowGrow}>
            {typing ? (
              <>
                <TypingIndicator size="300" className={css.TouchRowTyping} />
                <Text as="span" size="T300" className={css.TouchRowTyping} truncate>
                  typing…
                </Text>
              </>
            ) : (
              <Text as="span" size="T300" priority={unread ? '400' : '300'} truncate>
                {preview?.sender && `${preview.sender}: `}
                {/* a space keeps the row two lines tall when there is nothing to say */}
                {preview?.text ?? ' '}
              </Text>
            )}
          </span>
          {notificationIcon && (
            <Icon
              className={css.TouchRowMuted}
              size="50"
              src={notificationIcon}
              aria-label={notificationLabel}
            />
          )}
          {unread && <UnreadBadge highlight={unread.highlight} count={unread.total} />}
        </span>
      </span>
    </Link>
  );
}
