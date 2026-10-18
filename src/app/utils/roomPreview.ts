import { MatrixEvent, MsgType } from 'matrix-js-sdk';
import { MessageEvent, StateEvent } from '../../types/matrix/room';
import { trimReplyFromBody } from './room';

export type RoomPreview = {
  /** Who said it, when the list row should name them. */
  sender?: string;
  text: string;
};

export type RoomPreviewOptions = {
  myUserId: string;
  /** A direct chat has one other person, so only the user's own messages are named. */
  direct: boolean;
  getName: (userId: string) => string;
};

const VOICE_MESSAGE_KEY = 'org.matrix.msc3245.voice';

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

const messageText = (mEvent: MatrixEvent): string | undefined => {
  const content = mEvent.getContent();
  switch (content.msgtype) {
    case MsgType.Image:
      return 'Photo';
    case MsgType.Video:
      return 'Video';
    case MsgType.Audio:
      return VOICE_MESSAGE_KEY in content ? 'Voice message' : 'Audio';
    case MsgType.File:
      return 'File';
    case MsgType.Location:
      return 'Location';
    default: {
      if (typeof content.body !== 'string') return undefined;
      return oneLine(trimReplyFromBody(content.body)) || undefined;
    }
  }
};

const memberText = (mEvent: MatrixEvent, options: RoomPreviewOptions): string | undefined => {
  const userId = mEvent.getStateKey();
  if (!userId) return undefined;
  const mine = userId === options.myUserId;
  const who = mine ? 'You' : options.getName(userId);
  const was = mine ? 'were' : 'was';
  const content = mEvent.getContent();
  const prev = mEvent.getPrevContent();

  if (content.membership !== prev.membership) {
    switch (content.membership) {
      case 'join':
        return `${who} joined`;
      case 'invite':
        return `${who} ${was} invited`;
      case 'knock':
        return `${who} asked to join`;
      case 'ban':
        return `${who} ${was} banned`;
      case 'leave': {
        if (mEvent.getSender() === userId) return `${who} left`;
        return prev.membership === 'ban' ? `${who} ${was} unbanned` : `${who} ${was} removed`;
      }
      default:
        return undefined;
    }
  }
  if (content.displayname !== prev.displayname) {
    return mine ? 'You changed your name' : `${who} changed their name`;
  }
  if (content.avatar_url !== prev.avatar_url) {
    return mine ? 'You changed your avatar' : `${who} changed their avatar`;
  }
  return undefined;
};

/**
 * The one line a conversation list shows under a room's name, from the room's latest event.
 * Undefined when the event has nothing worth a line.
 */
export const getRoomPreview = (
  mEvent: MatrixEvent,
  options: RoomPreviewOptions
): RoomPreview | undefined => {
  const senderId = mEvent.getSender() ?? '';
  const mine = senderId === options.myUserId;
  const senderName = mine ? 'You' : options.getName(senderId);
  let sender: string | undefined;
  if (mine) sender = 'You';
  else if (!options.direct) sender = senderName;

  const type = mEvent.getType();

  if (type === StateEvent.RoomMember) {
    const text = memberText(mEvent, options);
    return text ? { text } : undefined;
  }
  if (type === StateEvent.RoomName) return { text: `${senderName} changed the room name` };
  if (type === StateEvent.RoomTopic) return { text: `${senderName} changed the topic` };
  if (type === StateEvent.RoomAvatar) return { text: `${senderName} changed the room avatar` };

  if (mEvent.isRedacted()) return { sender, text: 'Message deleted' };
  if (
    type === MessageEvent.RoomMessageEncrypted ||
    mEvent.isBeingDecrypted() ||
    mEvent.isDecryptionFailure()
  ) {
    return { sender, text: 'Encrypted message' };
  }
  if (type === MessageEvent.Sticker) return { sender, text: 'Sticker' };
  if (type === MessageEvent.RoomMessage) {
    const text = messageText(mEvent);
    if (!text) return undefined;
    // an emote reads as a sentence about its sender, so it carries the name itself
    if (mEvent.getContent().msgtype === MsgType.Emote) return { text: `* ${senderName} ${text}` };
    return { sender, text };
  }
  return undefined;
};
