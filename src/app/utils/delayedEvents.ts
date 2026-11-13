// Scheduled messages over MSC4140 delayed events: the server holds the message and sends it when
// its delay runs out, so it goes with every device off.
// Based on cinnyapp/cinny#2671 by jasonlaguidice.
//
// No imports from the app, so `npm test` can load it on its own (test/delayedEvents.test.ts).
import { MatrixEvent } from 'matrix-js-sdk';
import type { IContent, MatrixClient, Room } from 'matrix-js-sdk';

export const DELAYED_EVENTS_FEATURE = 'org.matrix.msc4140';

/** Whether the server's /versions `unstable_features` has delayed events switched on. */
export const supportsDelayedEvents = (unstableFeatures?: Record<string, boolean>): boolean =>
  unstableFeatures?.[DELAYED_EVENTS_FEATURE] === true;

/** One of the account's delayed events, whichever shape the server sent it in. */
export type DelayedEvent = {
  delayId: string;
  roomId: string;
  type: string;
  stateKey?: string;
  content: IContent;
  delayMs: number;
  /** when the delay started running */
  delayedSinceTs: number;
  /** when the server sends it */
  sendTs: number;
};

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * One delayed event from either field set: MSC4140 now (`delay_ms`, `delayed_since_ts`, which
 * Synapse 1.165 sends), or its earlier draft (`delay`, `running_since`, js-sdk's type).
 */
export const normaliseDelayedEvent = (raw: unknown): DelayedEvent | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const item = raw as Record<string, unknown>;
  const delayId = str(item.delay_id);
  const roomId = str(item.room_id);
  const type = str(item.type);
  const delayMs = num(item.delay_ms) ?? num(item.delay);
  const delayedSinceTs = num(item.delayed_since_ts) ?? num(item.running_since);
  if (!delayId || !roomId || !type || delayMs === undefined || delayedSinceTs === undefined) {
    return undefined;
  }
  const content =
    item.content && typeof item.content === 'object' ? (item.content as IContent) : {};
  return {
    delayId,
    roomId,
    type,
    stateKey: str(item.state_key),
    content,
    delayMs,
    delayedSinceTs,
    sendTs: delayedSinceTs + delayMs,
  };
};

/**
 * The scheduled delayed events in a GET /delayed_events response: `{ delayed_events: [...] }`
 * from Synapse 1.165, or `{ scheduled: [...] }` as js-sdk 41.7 types it. Sorted by send time.
 */
export const normaliseDelayedEvents = (response: unknown): DelayedEvent[] => {
  if (!response || typeof response !== 'object') return [];
  const body = response as Record<string, unknown>;
  let list: unknown[] = [];
  if (Array.isArray(body.delayed_events)) list = body.delayed_events;
  else if (Array.isArray(body.scheduled)) list = body.scheduled;
  return list
    .map(normaliseDelayedEvent)
    .filter((e): e is DelayedEvent => e !== undefined)
    .sort((a, b) => a.sendTs - b.sendTs);
};

/** A message (plain or encrypted), not a delayed state event such as a call membership. */
export const isScheduledMessage = (event: DelayedEvent): boolean =>
  event.stateKey === undefined &&
  (event.type === 'm.room.message' || event.type === 'm.room.encrypted');

export const DELAY_TOO_LARGE_ERRCODES = [
  // Synapse 1.165
  'ORG.MATRIX.MSC4140_DELAY_TOO_LARGE',
  // MSC4140's text
  'M_MAX_DELAY_EXCEEDED',
];

/** Synapse puts its limit only in the error text. */
const MAX_IN_TEXT = /allowed maximum \((\d+)\s*ms\)/i;

/**
 * Whether `error` is the server refusing a delay as too long, and the longest it allows when it
 * says: `{ maxDelayMs }`, `{}` when it doesn't, undefined for any other error.
 */
export const parseDelayTooLarge = (error: unknown): { maxDelayMs?: number } | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as { errcode?: unknown; data?: Record<string, unknown>; message?: unknown };
  const errcode = str(e.errcode) ?? str(e.data?.errcode);
  if (!errcode || !DELAY_TOO_LARGE_ERRCODES.includes(errcode)) return undefined;
  const fromField = num(e.data?.['org.matrix.msc4140.max_delay']) ?? num(e.data?.max_delay);
  if (fromField !== undefined) return { maxDelayMs: fromField };
  const text = str(e.data?.error) ?? str(e.message) ?? '';
  const match = MAX_IN_TEXT.exec(text);
  return match ? { maxDelayMs: Number(match[1]) } : {};
};

export type ScheduleTimeProblem = 'past' | 'tooFar';

/** Why a send time can't be scheduled, or undefined when it can. */
export const scheduleTimeProblem = (
  sendTs: number,
  now: number,
  maxDelayMs?: number
): ScheduleTimeProblem | undefined => {
  const delay = sendTs - now;
  if (delay <= 0) return 'past';
  if (maxDelayMs !== undefined && delay > maxDelayMs) return 'tooFar';
  return undefined;
};

export type ScheduleErrorKind = ScheduleTimeProblem | 'encryption';

/**
 * A schedule refused before anything was sent: a time in the past or too far ahead, or an
 * encrypted room's message that couldn't be encrypted (it is never sent as plain text instead).
 */
export class ScheduleError extends Error {
  readonly kind: ScheduleErrorKind;

  constructor(kind: ScheduleErrorKind, message: string) {
    super(message);
    this.name = 'ScheduleError';
    this.kind = kind;
  }
}

/** The delay to ask for, in whole milliseconds; throws a ScheduleError for a time it can't take. */
export const computeDelayMs = (sendTs: number, maxDelayMs?: number, now = Date.now()): number => {
  const problem = scheduleTimeProblem(sendTs, now, maxDelayMs);
  if (problem) {
    throw new ScheduleError(
      problem,
      problem === 'past' ? 'The send time has passed' : 'The send time is too far ahead'
    );
  }
  return Math.round(sendTs - now);
};

/** The parts of the crypto backend used here: js-sdk's CryptoBackend, not its public CryptoApi. */
type CryptoBackendPart = {
  encryptEvent?: (event: MatrixEvent, room: Room) => Promise<void>;
  decryptEvent?: (
    event: MatrixEvent
  ) => Promise<{ clearEvent: { type?: string; content?: IContent } }>;
};

export type DelayedEventsClient = Pick<
  MatrixClient,
  | 'getCrypto'
  | 'getUserId'
  | '_unstable_sendDelayedEvent'
  | '_unstable_getDelayedEvents'
  | '_unstable_cancelScheduledDelayedEvent'
  | '_unstable_sendScheduledDelayedEvent'
>;

const cryptoBackend = (mx: DelayedEventsClient): CryptoBackendPart | undefined =>
  (mx.getCrypto() as unknown as CryptoBackendPart | undefined) ?? undefined;

/** A room the message has to be encrypted for. */
export const isEncryptedRoom = (room: Pick<Room, 'hasEncryptionStateEvent'>): boolean =>
  room.hasEncryptionStateEvent();

/**
 * Encrypts `content` for `room` now, sharing the room key with the members it has now: someone
 * who joins before the server sends it can't read it. Throws a ScheduleError when it
 * can't: never returns plain content.
 */
export const encryptForRoom = async (
  mx: DelayedEventsClient,
  room: Room,
  content: IContent
): Promise<{ type: string; content: IContent }> => {
  const crypto = cryptoBackend(mx);
  if (!crypto || typeof crypto.encryptEvent !== 'function') {
    throw new ScheduleError('encryption', 'Encryption is not available on this device');
  }
  // standalone: made up here and never added to a room, so the timeline never shows it
  const event = new MatrixEvent({
    type: 'm.room.message',
    content,
    room_id: room.roomId,
    sender: mx.getUserId() ?? undefined,
    event_id: `~iris-schedule:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    origin_server_ts: Date.now(),
  });
  try {
    await crypto.encryptEvent(event, room);
  } catch (e) {
    throw new ScheduleError('encryption', e instanceof Error ? e.message : String(e));
  }
  const wireContent = event.getWireContent();
  if (
    !event.isEncrypted() ||
    event.getWireType() !== 'm.room.encrypted' ||
    typeof wireContent.ciphertext !== 'string'
  ) {
    throw new ScheduleError('encryption', 'The message did not encrypt');
  }
  return { type: 'm.room.encrypted', content: wireContent };
};

/**
 * Hands the server `content` to send to `room` in `delayMs`; returns its delay id. In a room with
 * encryption the content is encrypted here first (js-sdk 41.7 sends delayed events unencrypted),
 * and a failure to encrypt fails the schedule.
 */
export const scheduleMessage = async (
  mx: DelayedEventsClient,
  room: Room,
  content: IContent,
  delayMs: number
): Promise<string> => {
  const event = isEncryptedRoom(room)
    ? await encryptForRoom(mx, room, content)
    : { type: 'm.room.message', content };
  // the relation is already in the content; js-sdk's thread handling needs nothing more
  const send = mx._unstable_sendDelayedEvent as unknown as (
    roomId: string,
    delayOpts: { delay: number },
    threadId: string | null,
    eventType: string,
    content: IContent
  ) => Promise<{ delay_id: string }>;
  const res = await send.call(mx, room.roomId, { delay: delayMs }, null, event.type, event.content);
  return res.delay_id;
};

/** The account's scheduled delayed events, every room, following `next_batch` when given. */
export const listDelayedEvents = async (mx: DelayedEventsClient): Promise<DelayedEvent[]> => {
  const all: DelayedEvent[] = [];
  let from: string | undefined;
  // Synapse 1.165 sends them all in one page; a later server may page
  for (let page = 0; page < 20; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res: unknown = await mx._unstable_getDelayedEvents(undefined, undefined, from);
    all.push(...normaliseDelayedEvents(res));
    from = str((res as { next_batch?: unknown } | undefined)?.next_batch);
    if (!from) break;
  }
  return all.sort((a, b) => a.sendTs - b.sendTs);
};

export const cancelDelayedEvent = async (mx: DelayedEventsClient, delayId: string) => {
  await mx._unstable_cancelScheduledDelayedEvent(delayId);
};

export const sendDelayedEventNow = async (mx: DelayedEventsClient, delayId: string) => {
  await mx._unstable_sendScheduledDelayedEvent(delayId);
};

/**
 * The clear content of an encrypted scheduled message, decrypted on this device, which holds the
 * room key it was encrypted with. The event is made up here and never added to a room. Undefined
 * when it can't be read here.
 */
export const decryptDelayedEvent = async (
  mx: DelayedEventsClient,
  event: DelayedEvent
): Promise<IContent | undefined> => {
  if (event.type !== 'm.room.encrypted') return event.content;
  const crypto = cryptoBackend(mx);
  if (!crypto || typeof crypto.decryptEvent !== 'function') return undefined;
  const standalone = new MatrixEvent({
    type: event.type,
    content: event.content,
    room_id: event.roomId,
    sender: mx.getUserId() ?? undefined,
    // no colon: rust crypto parses one as the start of a server name and fails
    event_id: `$scheduled-preview-${event.delayId.replace(/[^A-Za-z0-9_-]/g, '_')}`,
    origin_server_ts: event.delayedSinceTs,
  });
  try {
    const { clearEvent } = await crypto.decryptEvent(standalone);
    if (clearEvent.type !== 'm.room.message' || !clearEvent.content) return undefined;
    return clearEvent.content;
  } catch {
    return undefined;
  }
};
