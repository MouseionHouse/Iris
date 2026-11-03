import { loadShareAvatar } from './shareAvatar';

/** How long a notification waits for its avatar before it goes out without one. */
export const ICON_WAIT_MS = 1500;

/**
 * An avatar as the data URL the shell takes (a PNG). The page loads it, with the session the
 * service worker adds to media requests; the shell never fetches a URL. Resolves undefined when
 * the avatar does not load in time, so a slow media server cannot hold back a notification (the
 * load carries on and is cached for the next one).
 */
export const loadDesktopNotificationIcon = async (url: string): Promise<string | undefined> => {
  const png = await Promise.race([
    loadShareAvatar(url),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ICON_WAIT_MS);
    }),
  ]);
  return png ? `data:image/png;base64,${png}` : undefined;
};
