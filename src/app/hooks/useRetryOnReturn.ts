import { useEffect } from 'react';

/**
 * Calls `retry` when the network or the app comes back while `failed` holds: what failed for
 * want of a connection should not wait for the user to press Retry.
 */
export const useRetryOnReturn = (failed: boolean, retry: () => void): void => {
  useEffect(() => {
    if (!failed) return undefined;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') retry();
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [failed, retry]);
};
