/**
 * The household hub (hub.example.org) embeds this client in an `<iframe>`
 * and talks to it over a versioned `postMessage` protocol.
 *
 * This module is the pure, React-free half of that protocol: origin handling,
 * framing checks and message shaping/parsing. The React wiring (boot,
 * navigation, unread, logout, theme, visibility) lives in `useHubBridge`.
 *
 * The bridge is a complete no-op when the client is not framed (no parent
 * browsing context), so it is safe to run in every deployment.
 */

export const HUB_PROTOCOL_VERSION = 1;

/** Origin the hub lives at. Overridable via the `VITE_HUB_ORIGIN` env var. */
export const DEFAULT_HUB_ORIGIN = 'https://hub.example.org';

export const getHubOrigin = (): string => {
  const configured = (import.meta.env.VITE_HUB_ORIGIN as string | undefined)?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_HUB_ORIGIN;
};

/**
 * Whether this client is running inside an iframe with a parent browsing
 * context. When it is not framed there is no hub to talk to and the bridge
 * must do nothing.
 */
export const isFramed = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    // A cross-origin `window.top` access throwing means we are definitely framed.
    return true;
  }
};

/* ---- chat -> hub (the client emits these) ---- */

export type ChatReadyMessage = { type: 'chat.ready'; version: number };
export type ChatUnreadMessage = {
  type: 'chat.unread';
  rooms: number;
  messages: number;
  highlights: number;
};
export type ChatHighlightMessage = {
  type: 'chat.highlight';
  roomId: string;
  roomName: string;
  sender: string;
  preview: string;
  ts: number;
};
export type ChatRouteMessage = { type: 'chat.route'; path: string };
export type ChatSignedOutMessage = { type: 'chat.signedOut' };

export type ChatToHubMessage =
  | ChatReadyMessage
  | ChatUnreadMessage
  | ChatHighlightMessage
  | ChatRouteMessage
  | ChatSignedOutMessage;

/* ---- hub -> chat (the client accepts these) ---- */

export type HubThemeMessage = { type: 'hub.theme'; mode: 'dark' | 'light' };
export type HubVisibleMessage = { type: 'hub.visible'; visible: boolean };
export type HubNavigateMessage = { type: 'hub.navigate'; path: string };
export type HubSignOutMessage = { type: 'hub.signOut' };

export type HubToChatMessage =
  | HubThemeMessage
  | HubVisibleMessage
  | HubNavigateMessage
  | HubSignOutMessage;

/**
 * Post a message to the framing hub. A no-op when the client is not framed, so
 * callers do not need to gate on `isFramed()` themselves.
 */
export const postToHub = (message: ChatToHubMessage): void => {
  if (!isFramed()) return;
  try {
    window.parent.postMessage(message, getHubOrigin());
  } catch {
    // The parent context is gone (e.g. the top frame navigated away). Nothing to do.
  }
};

/** Convenience wrapper for the sign-out notification. */
export const notifyHubSignedOut = (): void => {
  postToHub({ type: 'chat.signedOut' });
};

/**
 * Validate and shape an inbound `message` event payload into a typed hub
 * message, or return `undefined` if it is not a recognised hub message.
 *
 * The origin check happens in the listener (it needs `event.origin`); this
 * only parses and validates the payload.
 */
export const parseHubMessage = (data: unknown): HubToChatMessage | undefined => {
  if (!data || typeof data !== 'object') return undefined;
  const msg = data as Record<string, unknown>;
  switch (msg.type) {
    case 'hub.theme':
      if (msg.mode === 'dark' || msg.mode === 'light') {
        return { type: 'hub.theme', mode: msg.mode };
      }
      return undefined;
    case 'hub.visible':
      if (typeof msg.visible === 'boolean') {
        return { type: 'hub.visible', visible: msg.visible };
      }
      return undefined;
    case 'hub.navigate':
      if (typeof msg.path === 'string') {
        return { type: 'hub.navigate', path: msg.path };
      }
      return undefined;
    case 'hub.signOut':
      return { type: 'hub.signOut' };
    default:
      return undefined;
  }
};
