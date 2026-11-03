/**
 * The Iris desktop shell (`desktop/`, a Qt WebEngine app for KDE) offers the page a small bridge,
 * `window.irisDesktop`, only on the Iris origin. This is its typed wrapper. Outside the shell the
 * object does not exist and everything here does nothing, so the browser, Hub-framed and Android
 * builds behave as before. The contract is in mouseion/iris#63.
 *
 * Kept free of imports from the app so it can be unit tested on its own (`npm test`).
 */

export type DesktopUnread = { total: number; highlight: number };
export type DesktopColorScheme = { dark: boolean };

type DesktopBridge = {
  version(): Promise<string>;
  setUnread(counts: DesktopUnread): Promise<void>;
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
