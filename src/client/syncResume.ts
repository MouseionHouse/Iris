import { ClientEvent, MatrixClient, SyncState } from 'matrix-js-sdk';

// How long after the page returns to the foreground a lost connection is put down to the pause
// rather than to the network.
const RESUME_WINDOW_MS = 15_000;

type VisibilitySource = Pick<
  Document,
  'visibilityState' | 'addEventListener' | 'removeEventListener'
>;

/**
 * Resumes /sync at once when the page returns to the foreground.
 *
 * A backgrounded page is frozen (always in the Android wrapper, often in a browser), which kills
 * the /sync long poll. The SDK only notices when the page runs again, and then waits 2–7 s before
 * its first retry: every return to the app opened on stale messages under a "Reconnecting" bar
 * for that long. Here the retry is immediate, both when the failure was already noticed and when
 * it is noticed shortly after the return.
 */
export const resumeSyncOnForeground = (
  mx: MatrixClient,
  source: VisibilitySource = document
): (() => void) => {
  let resumedAt = 0;

  const onVisibilityChange = () => {
    if (source.visibilityState !== 'visible') return;
    resumedAt = Date.now();
    mx.retryImmediately();
  };

  const onSync = (state: SyncState) => {
    if (state !== SyncState.Reconnecting) return;
    if (Date.now() - resumedAt < RESUME_WINDOW_MS) mx.retryImmediately();
  };

  source.addEventListener('visibilitychange', onVisibilityChange);
  mx.on(ClientEvent.Sync, onSync);
  return () => {
    source.removeEventListener('visibilitychange', onVisibilityChange);
    mx.removeListener(ClientEvent.Sync, onSync);
  };
};

/**
 * Saves the sync store when the page goes to the background.
 *
 * The SDK writes what it has synced to IndexedDB once every 5 minutes. Android kills a
 * backgrounded app sooner or later, and the next start then opens on the last write: a short
 * visit to the app left nothing behind, so the following cold start showed the room as it was
 * before that visit (without the message just sent) until the first /sync came back. Saving on
 * the way out makes a cold start open on what was last on screen.
 */
export const saveSyncOnBackground = (
  mx: MatrixClient,
  source: VisibilitySource = document
): (() => void) => {
  const onVisibilityChange = () => {
    if (source.visibilityState !== 'hidden') return;
    mx.store.save(true).catch(() => undefined);
  };

  source.addEventListener('visibilitychange', onVisibilityChange);
  return () => source.removeEventListener('visibilitychange', onVisibilityChange);
};
