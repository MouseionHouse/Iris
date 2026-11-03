/**
 * What a message notification says. The wording and rules are the Android app's
 * (`mobile/.../PushSummary.java`, `PushSummaryTest`), so the phone and the desktop shell read the
 * same; the desktop shows more of the text (300 characters, whitespace collapsed rather than the
 * first 120 characters of the first line) and adds the sender, since the popup takes a reply.
 *
 * Pure, with no imports from the app, so it can be unit tested on its own (`npm test`).
 */

export type NotificationContent = Record<string, unknown>;

/** The most characters of a message a notification shows (KDE lets the user expand it). */
export const MAX_BODY_LENGTH = 300;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Matrix reply fallback: leading "> " lines and the blank line after them (PushSummary.trimReplyFallback). */
export const trimReplyFallback = (body: string): string => {
  if (!body.startsWith('> ')) return body;
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].startsWith('>')) i += 1;
  while (i < lines.length && lines[i] === '') i += 1;
  return lines.slice(i).join('\n');
};

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** HTML to plain text: for the rare message that has a formatted body and no plain one. */
export const stripHtml = (html: string): string =>
  html
    .replace(/<mx-reply>[\s\S]*?<\/mx-reply>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code =
          e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });

/** Collapses whitespace and cuts to `max` characters (code points) with an ellipsis. */
export const toNotificationLine = (text: string, max: number = MAX_BODY_LENGTH): string => {
  const line = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(line);
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
    : line;
};

const POLL_START = ['m.poll.start', 'org.matrix.msc3381.poll.start'];

/** The text of a text-like event: its plain body without the reply fallback, else its formatted body. */
const textOf = (content: NotificationContent): string => {
  const plain = trimReplyFallback(str(content.body));
  if (plain.trim()) return plain;
  return stripHtml(str(content.formatted_body));
};

export type EventSummary = {
  text: string;
  /** An emote (`/me`): shown as `* name does x`, so the sender goes inside the text. */
  emote: boolean;
};

/**
 * One line for an event (PushSummary.bodyOf): the message, or a short description of what it is.
 * `content` is empty for a deleted message.
 */
export const summarizeEvent = (
  type: string,
  content: NotificationContent | undefined,
  opts: { myUserId?: string; stateKey?: string } = {}
): EventSummary => {
  const plain = (text: string): EventSummary => ({ text, emote: false });
  if (!content || Object.keys(content).length === 0) return plain('Message deleted');
  if (type === 'm.sticker') return plain(`Sticker: ${str(content.body)}`);
  if (POLL_START.includes(type)) {
    const poll = (content['m.poll'] ?? content['org.matrix.msc3381.poll.start']) as
      | { question?: Record<string, unknown> }
      | undefined;
    const question = str(poll?.question?.['m.text'] ?? poll?.question?.body);
    return plain(question ? `📊 poll: ${question}` : '📊 poll');
  }
  if (type === 'm.room.member') {
    return plain(
      str(content.membership) === 'invite' && opts.myUserId && opts.myUserId === opts.stateKey
        ? 'Invited you'
        : 'New message'
    );
  }
  if (type !== 'm.room.message') return plain('New message');

  const msgtype = str(content.msgtype);
  const voice = 'org.matrix.msc3245.voice' in content || 'm.voice' in content;
  if (msgtype === 'm.image') return plain('🖼 image');
  if (msgtype === 'm.video') return plain('🎞 video');
  if (msgtype === 'm.audio') return plain(voice ? '🎤 voice message' : '🔊 audio');
  if (msgtype === 'm.file') return plain(`📎 ${str(content.body) || 'file'}`);
  if (msgtype === 'm.location') return plain('📍 location');
  const line = toNotificationLine(textOf(content));
  return { text: line || 'New message', emote: msgtype === 'm.emote' };
};

export type DesktopNotificationText = { title: string; body: string };

/**
 * Title and body of a message notification on the desktop.
 *
 * - A group room: the title is the room name and the body starts with the sender, `Alice: hi`.
 * - A direct chat: the title is the sender's name (the room name is usually that person anyway,
 *   and Android titles a direct chat by the sender too) and the body is the message alone.
 * - An emote reads `* Alice waves`, in both.
 * The body is plain text capped at MAX_BODY_LENGTH characters; the shell escapes it for display.
 */
export const desktopNotificationText = (args: {
  roomName: string;
  senderName: string;
  isDirect: boolean;
  type: string;
  content: NotificationContent | undefined;
  myUserId?: string;
  stateKey?: string;
}): DesktopNotificationText => {
  const { roomName, senderName, isDirect } = args;
  const { text, emote } = summarizeEvent(args.type, args.content, args);
  let body: string;
  if (emote) body = toNotificationLine(`* ${senderName} ${text.replace(/^\* /, '')}`);
  else if (isDirect) body = text;
  else body = toNotificationLine(`${senderName}: ${text}`);
  return { title: isDirect ? senderName : roomName, body };
};
