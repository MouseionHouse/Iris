import React, { ReactNode, useMemo } from 'react';
import { Box, Icon, Icons, Line, MenuItem, Text, as } from 'folds';
import { MatrixEvent, MsgType, Room } from 'matrix-js-sdk';
import { BottomSheet } from '../../../components/bottom-sheet';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useRecentEmoji } from '../../../hooks/useRecentEmoji';
import { IEmoji, emojis } from '../../../plugins/emoji';
import { copyToClipboard } from '../../../utils/dom';
import { getEditedEvent, getMemberDisplayName, trimReplyFromBody } from '../../../utils/room';
import { getMxIdLocalPart } from '../../../utils/matrix';
import * as css from './styles.css';

const SHEET_REACTIONS = 5;
// 👍 ❤️ 😂 😮 😢, by hexcode: the unicode of an emoji may carry a variation selector
const DEFAULT_REACTIONS = ['1F44D', '2764', '1F602', '1F62E', '1F622'];

const getMessageContent = (room: Room, mEvent: MatrixEvent) => {
  const eventId = mEvent.getId();
  const timelineSet = eventId ? room.getTimelineForEvent(eventId)?.getTimelineSet() : undefined;
  const editedEvent =
    eventId && timelineSet ? getEditedEvent(eventId, mEvent, timelineSet) : undefined;

  return editedEvent?.getContent()['m.new_content'] ?? mEvent.getContent();
};

const getMessageText = (room: Room, mEvent: MatrixEvent): string | undefined => {
  if (mEvent.isRedacted()) return undefined;
  const { body } = getMessageContent(room, mEvent);
  if (typeof body !== 'string') return undefined;

  return trimReplyFromBody(body).trim() || undefined;
};

type MessageSheetReactionsProps = {
  onReaction: (keyOrMxc: string, shortcode: string) => void;
  onMore: () => void;
};
export function MessageSheetReactions({ onReaction, onMore }: MessageSheetReactionsProps) {
  const mx = useMatrixClient();
  const recentEmojis = useRecentEmoji(mx, SHEET_REACTIONS);

  // the row is always full: an account which never reacted has no recent emojis
  const reactions = useMemo(() => {
    const list: IEmoji[] = [...recentEmojis];
    DEFAULT_REACTIONS.forEach((hexcode) => {
      if (list.length >= SHEET_REACTIONS || list.some((e) => e.hexcode === hexcode)) return;
      const emoji = emojis.find((e) => e.hexcode === hexcode);
      if (emoji) list.push(emoji);
    });
    return list;
  }, [recentEmojis]);

  return (
    <>
      <Box className={css.MessageSheetReactions} justifyContent="SpaceBetween" alignItems="Center">
        {reactions.map((emoji) => (
          <button
            key={emoji.unicode}
            className={css.MessageSheetReaction}
            type="button"
            aria-label={emoji.shortcode}
            onClick={() => onReaction(emoji.unicode, emoji.shortcode)}
          >
            {emoji.unicode}
          </button>
        ))}
        <button
          className={css.MessageSheetReaction}
          type="button"
          aria-label="Add Reaction"
          onClick={onMore}
        >
          <Icon size="300" src={Icons.SmilePlus} />
        </button>
      </Box>
      <Line size="300" />
    </>
  );
}

export const MessageCopyTextItem = as<
  'button',
  {
    room: Room;
    mEvent: MatrixEvent;
    onClose?: () => void;
  }
>(({ room, mEvent, onClose, ...props }, ref) => {
  const { msgtype } = mEvent.getContent();
  const text =
    msgtype === MsgType.Text || msgtype === MsgType.Notice || msgtype === MsgType.Emote
      ? getMessageText(room, mEvent)
      : undefined;

  if (!text) return null;

  const handleCopy = () => {
    copyToClipboard(text);
    onClose?.();
  };

  return (
    <MenuItem
      size="300"
      after={<Icon size="100" src={Icons.File} />}
      radii="300"
      onClick={handleCopy}
      {...props}
      ref={ref}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        Copy Text
      </Text>
    </MenuItem>
  );
});

type MessageSheetProps = {
  room: Room;
  mEvent: MatrixEvent;
  open: boolean;
  requestClose: () => void;
  reactions?: ReactNode;
  children: ReactNode;
};
export function MessageSheet({
  room,
  mEvent,
  open,
  requestClose,
  reactions,
  children,
}: MessageSheetProps) {
  const senderId = mEvent.getSender() ?? '';
  const senderName = getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId;
  const text = open ? getMessageText(room, mEvent) : undefined;

  return (
    <BottomSheet
      open={open}
      requestClose={requestClose}
      aria-label="Message Options"
      header={
        <Box className={css.MessageSheetPreview} direction="Column">
          <Text size="L400" truncate>
            {senderName}
          </Text>
          {text && (
            <Text className={css.MessageSheetPreviewText} size="T300" priority="300">
              {text}
            </Text>
          )}
        </Box>
      }
    >
      {reactions}
      <div className={css.MessageSheetItems}>{children}</div>
    </BottomSheet>
  );
}
