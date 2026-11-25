/**
 * The Iris desktop shell (`desktop/`, a Qt WebEngine app for KDE) offers the page a small bridge,
 * `window.irisDesktop`, only on the Iris origin. This is its typed wrapper. Outside the shell the
 * object does not exist and everything here does nothing, so the browser, Hub-framed and Android
 * builds behave as before. The contract is in desktop/BRIDGE.md.
 *
 * Kept free of imports from the app so it can be unit tested on its own (`npm test`).
 */

export type DesktopUnread = { total: number; highlight: number };
export type DesktopColorScheme = { dark: boolean };

export type DesktopNotification = {
  /** Notifying again with the same id replaces that notification. */
  id: string;
  roomId: string;
  eventId?: string;
  title: string;
  body: string;
  /** A `data:image/png;base64,…` (or jpeg) the page has already loaded; the shell fetches nothing. */
  icon?: string;
  /** False where a reply makes no sense (an invitation): no inline reply is offered. Default true. */
  canReply?: boolean;
};
export type DesktopOpenRoom = { roomId: string; eventId?: string };
/**
 * A `matrix:` link (Matrix spec, "Matrix URI scheme"), parsed and checked by the shell. `id` carries
 * its sigil: `!room:server` (kind 'room'), `#alias:server` ('alias') or `@user:server` ('user').
 */
export type DesktopLink = {
  kind: 'room' | 'alias' | 'user';
  id: string;
  /** `$event`; rooms and aliases only. */
  eventId?: string;
  /** Servers to try to join through, from `via=`. */
  via?: string[];
  action?: 'join' | 'chat';
};
export type DesktopReply = { roomId: string; eventId?: string; text: string };

type DesktopBridge = {
  version(): Promise<string>;
  setUnread(counts: DesktopUnread): Promise<void>;
  notify(notification: DesktopNotification): Promise<void>;
  closeNotifications(target: { roomId: string }): Promise<void>;
  on(event: string, handler: (payload: unknown) => void): () => void;
};

const noop = (): void => undefined;

const bridge = (): DesktopBridge | undefined => {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { irisDesktop?: DesktopBridge }).irisDesktop;
};

/** True only inside the Iris desktop shell. */
export const isDesktopShell = (): boolean => bridge() !== undefined;

/** Tell the shell the unread counts (the taskbar badge, later the tray icon). */
export const desktopSetUnread = (counts: DesktopUnread): void => {
  // The shell refuses nonsense; a refusal or a gone bridge is not worth interrupting the page for.
  bridge()?.setUnread(counts).catch(noop);
};

/** Signed out: no unread, so no badge. Safe to call as often as needed. */
export const desktopClearUnread = (): void => desktopSetUnread({ total: 0, highlight: 0 });

const isColorScheme = (payload: unknown): payload is DesktopColorScheme =>
  typeof payload === 'object' &&
  payload !== null &&
  typeof (payload as { dark?: unknown }).dark === 'boolean';

/**
 * Follow the Plasma colour scheme: `handler` is called with the current scheme as soon as the
 * shell has it and again when it changes. Returns the unsubscribe function. Does nothing
 * outside the shell.
 */
export const onDesktopColorScheme = (handler: (scheme: DesktopColorScheme) => void): (() => void) =>
  bridge()?.on('colorScheme', (payload) => {
    if (isColorScheme(payload)) handler({ dark: payload.dark });
  }) ?? noop;

// Rooms the shell has been asked to notify about and not yet been told to close.
const notifiedRooms = new Set<string>();

/** The rooms that have a desktop notification which was not closed from here. */
export const desktopNotifiedRooms = (): string[] => [...notifiedRooms];

/**
 * Show a notification through KDE (replacing the web `Notification`). Resolves true when the shell
 * took it; false outside the shell or when the shell refused the arguments.
 */
export const desktopNotify = async (notification: DesktopNotification): Promise<boolean> => {
  const b = bridge();
  if (!b) return false;
  try {
    await b.notify(notification);
    notifiedRooms.add(notification.roomId);
    return true;
  } catch {
    return false;
  }
};

/** The room was read (here or on another device): close its notifications. */
export const desktopCloseNotifications = (roomId: string): void => {
  notifiedRooms.delete(roomId);
  bridge()?.closeNotifications({ roomId }).catch(noop);
};

const isRoomTarget = (p: unknown): p is { roomId: string; eventId?: unknown } =>
  typeof p === 'object' && p !== null && typeof (p as { roomId?: unknown }).roomId === 'string';
const optionalString = (v: unknown): string | undefined =>
  typeof v === 'string' && v ? v : undefined;

/** A notification was clicked: show this room. */
export const onDesktopOpenRoom = (handler: (target: DesktopOpenRoom) => void): (() => void) =>
  bridge()?.on('openRoom', (payload) => {
    if (isRoomTarget(payload))
      handler({ roomId: payload.roomId, eventId: optionalString(payload.eventId) });
  }) ?? noop;

const SIGILS = { room: '!', alias: '#', user: '@' } as const;
const MAX_ID_LENGTH = 255;
const MAX_VIA = 10;

/**
 * The shell has already checked a link; this is the page's own check of what arrived, so a bridge
 * that misbehaves cannot make the app navigate anywhere odd. Returns undefined for anything that is
 * not exactly the shape of `DesktopLink`.
 */
export const parseDesktopLink = (payload: unknown): DesktopLink | undefined => {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const p = payload as Record<string, unknown>;
  if (Object.keys(p).some((k) => !['kind', 'id', 'eventId', 'via', 'action'].includes(k)))
    return undefined;
  const { kind, id, eventId, via, action } = p;
  if (kind !== 'room' && kind !== 'alias' && kind !== 'user') return undefined;
  const validId = (v: unknown, sigil: string): v is string =>
    typeof v === 'string' && v.length > 1 && v.length <= MAX_ID_LENGTH && v.startsWith(sigil);
  if (!validId(id, SIGILS[kind])) return undefined;
  const link: DesktopLink = { kind, id };
  if (eventId !== undefined) {
    if (kind === 'user' || !validId(eventId, '$')) return undefined;
    link.eventId = eventId;
  }
  if (via !== undefined) {
    if (
      kind === 'user' ||
      !Array.isArray(via) ||
      via.length > MAX_VIA ||
      !via.every((v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH)
    )
      return undefined;
    if (via.length > 0) link.via = via as string[];
  }
  if (action !== undefined) {
    if (action !== 'join' && action !== 'chat') return undefined;
    if (kind === 'user' && action !== 'chat') return undefined;
    link.action = action;
  }
  return link;
};

/**
 * A `matrix:` link was opened (`xdg-open matrix:…`, on the command line or from a second launch).
 * The shell holds a link that arrives before the page is ready, and the bridge hands it to the
 * first handler added, once.
 */
export const onDesktopOpenLink = (handler: (link: DesktopLink) => void): (() => void) =>
  bridge()?.on('openLink', (payload) => {
    const link = parseDesktopLink(payload);
    if (link) handler(link);
    else console.warn('Ignored a malformed matrix: link from the desktop shell');
  }) ?? noop;

/** The user typed a reply in a notification. */
export const onDesktopReply = (handler: (reply: DesktopReply) => void): (() => void) =>
  bridge()?.on('reply', (payload) => {
    if (!isRoomTarget(payload)) return;
    const { roomId, eventId, text } = payload as {
      roomId: string;
      eventId?: unknown;
      text?: unknown;
    };
    if (typeof text === 'string') handler({ roomId, eventId: optionalString(eventId), text });
  }) ?? noop;

/**
 * The rooms whose desktop notification should close: shown ones that are no longer unread. Same
 * rule as the Android app (`PushHistory.read`: shown minus unread).
 */
export const roomsToClose = (shown: Iterable<string>, unread: Iterable<string>): string[] => {
  const still = new Set(unread);
  return [...shown].filter((roomId) => !still.has(roomId));
};

/** The most often the badge is updated: at most one call per interval while counts churn. */
export const UNREAD_SEND_INTERVAL_MS = 300;

/**
 * Sends the latest counts at most once per `intervalMs`, and not at all when they equal what was
 * last sent. `flush` sends what is pending now; `cancel` drops it.
 */
export const createUnreadSender = (
  send: (counts: DesktopUnread) => void,
  intervalMs: number = UNREAD_SEND_INTERVAL_MS
) => {
  let sent: DesktopUnread | undefined;
  let pending: DesktopUnread | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const fire = () => {
    timer = undefined;
    const next = pending;
    pending = undefined;
    if (!next || (sent && sent.total === next.total && sent.highlight === next.highlight)) return;
    sent = next;
    send(next);
  };

  return {
    push(counts: DesktopUnread) {
      pending = { total: counts.total, highlight: Math.min(counts.highlight, counts.total) };
      if (timer === undefined) timer = setTimeout(fire, intervalMs);
    },
    flush() {
      if (timer !== undefined) clearTimeout(timer);
      fire();
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      pending = undefined;
    },
  };
};
