/**
 * A hub (a page that frames other apps, such as the household's) embeds this
 * client in an `<iframe>` and talks to it over a versioned `postMessage`
 * protocol.
 *
 * This module is the pure, React-free half of that protocol: origin handling,
 * framing checks and message shaping/parsing. The React wiring (boot,
 * navigation, unread, logout, theme, visibility) lives in `useHubBridge`.
 *
 * The bridge is a complete no-op when the client is not framed (no parent
 * browsing context) or when the build names no hub, so it is safe to run in
 * every deployment.
 */

export const HUB_PROTOCOL_VERSION = 1;

/**
 * Which origins may be the hub, set at build time: `VITE_HUB_ORIGINS`, a
 * space-separated list of origins, and `VITE_HUB_PREVIEW_PATTERN`, one
 * optional regular expression for the hub's pull-request previews (matched
 * against the whole origin). The Dockerfile sets both from its `HUB_ORIGINS`
 * and `HUB_PREVIEW_PATTERN` build args, and renders the same two into
 * `docker-nginx.conf`'s `frame-ancestors`, so the two stay in step. Neither
 * set: no hub, and the bridge stays off.
 */
export type HubConfig = { origins: string[]; preview?: RegExp };

export const parseHubConfig = (origins?: string, previewPattern?: string): HubConfig => {
  const pattern = previewPattern?.trim();
  return {
    origins: (origins ?? '').split(/\s+/).filter((origin) => origin.length > 0),
    preview: pattern ? new RegExp(`^(?:${pattern})$`) : undefined,
  };
};

export const isHubOrigin = (config: HubConfig, origin: string): boolean =>
  config.origins.includes(origin) || (config.preview?.test(origin) ?? false);

const hubConfig = parseHubConfig(
  import.meta.env?.VITE_HUB_ORIGINS as string | undefined,
  import.meta.env?.VITE_HUB_PREVIEW_PATTERN as string | undefined
);

/**
 * The framing page's origin as the browser reports it: `ancestorOrigins`
 * where it exists (not Firefox), else the origin of the referrer, which for a
 * framed document is the parent. The browser sets both, so a page cannot
 * claim to be the hub; one that hides its referrer just falls back.
 */
const parentOrigin = (): string | undefined => {
  const ancestor = window.location.ancestorOrigins?.[0];
  if (ancestor) return ancestor;
  try {
    return new URL(document.referrer).origin;
  } catch {
    return undefined;
  }
};

/**
 * The hub this client talks to: the framing page when it is one of the hub's
 * origins, else the first listed origin (the browser then drops what is posted
 * to a parent that is not it). `undefined` when the build names no hub.
 */
export const resolveHubOrigin = (
  config: HubConfig,
  parent: string | undefined
): string | undefined => {
  if (parent && isHubOrigin(config, parent)) return parent;
  return config.origins[0];
};

export const getHubOrigin = (): string | undefined => resolveHubOrigin(hubConfig, parentOrigin());

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
  /** Unread messages in direct messages; a v1 hub that predates it ignores it. */
  direct: number;
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
 * Post a message to the framing hub. A no-op when the client is not framed or
 * the build names no hub, so callers do not need to gate on `isFramed()`
 * themselves.
 */
export const postToHub = (message: ChatToHubMessage): void => {
  if (!isFramed()) return;
  const hubOrigin = getHubOrigin();
  if (!hubOrigin) return;
  try {
    window.parent.postMessage(message, hubOrigin);
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
