/**
 * What the desktop shell's notification reply sends. Kept free of imports from the app (and of
 * matrix-js-sdk at run time) so it can be unit tested on its own (`npm test`).
 *
 * It sends what the composer (`RoomInput`) sends for a reply: a plain `m.text` with
 * `m.in_reply_to`, a mention of the replied-to sender, and the thread relation when the message
 * being answered is in a thread.
 */

export type ReplyEvent = {
  getSender(): string | null | undefined;
  /** The thread the event belongs to, if any (matrix-js-sdk `MatrixEvent.threadRootId`). */
  threadRootId?: string;
};

export type ReplyRoom = {
  getMyMembership(): string;
  findEventById(eventId: string): ReplyEvent | undefined | null;
};

export type ReplyClient = {
  getUserId(): string | null;
  getRoom(roomId: string): ReplyRoom | null;
  // `object`, not Record<string, unknown>: matrix-js-sdk's content types are interfaces, which have
  // no index signature, so MatrixClient would not fit a Record parameter.
  sendMessage(roomId: string, content: object): Promise<unknown>;
};

/** The longest reply the shell hands over; Matrix events are limited to 64 KiB in all. */
export const MAX_REPLY_LENGTH = 16000;

export const buildReplyContent = (
  text: string,
  eventId: string | undefined,
  event: ReplyEvent | undefined | null,
  ownUserId: string | null
): Record<string, unknown> => {
  const content: Record<string, unknown> = { msgtype: 'm.text', body: text };
  const sender = event?.getSender();
  content['m.mentions'] = { user_ids: sender && sender !== ownUserId ? [sender] : [] };
  if (eventId) {
    const relates: Record<string, unknown> = { 'm.in_reply_to': { event_id: eventId } };
    if (event?.threadRootId) {
      relates.rel_type = 'm.thread';
      relates.event_id = event.threadRootId;
      relates.is_falling_back = false;
    }
    content['m.relates_to'] = relates;
  }
  return content;
};

/**
 * Sends a reply typed into a desktop notification. Resolves true when it was sent; false when it
 * was dropped (empty, too long, a room this account is not in).
 */
export const sendDesktopReply = async (
  mx: ReplyClient,
  { roomId, eventId, text }: { roomId: string; eventId?: string; text: string }
): Promise<boolean> => {
  const body = text.trim();
  if (!body || body.length > MAX_REPLY_LENGTH) return false;
  const room = mx.getRoom(roomId);
  if (!room || room.getMyMembership() !== 'join') return false;
  const event = eventId ? room.findEventById(eventId) : undefined;
  await mx.sendMessage(roomId, buildReplyContent(body, eventId, event, mx.getUserId()));
  return true;
};
