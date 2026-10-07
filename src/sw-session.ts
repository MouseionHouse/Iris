export function pushSessionToSW(baseUrl?: string, accessToken?: string) {
  if (!('serviceWorker' in navigator)) return;
  if (!navigator.serviceWorker.controller) return;

  navigator.serviceWorker.controller.postMessage({
    type: 'setSession',
    accessToken,
    baseUrl,
  });
}

/**
 * Resolves once this page is controlled by the service worker, which is what adds the
 * access token to media requests. A first visit or a forced reload starts uncontrolled,
 * and every image requested in that state is sent without a token and fails with 401.
 * Resolves at once when registration failed, and after `timeoutMs` at the latest, so a
 * browser without a working service worker still loads.
 */
export async function waitForSWControl(
  registration: Promise<ServiceWorkerRegistration> | undefined,
  timeoutMs = 3000
): Promise<void> {
  if (!registration || navigator.serviceWorker.controller) return;

  const controlled = new Promise<void>((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
  });
  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutMs);
  });

  const claimed = registration
    .then(() => navigator.serviceWorker.ready)
    .then((ready) => {
      if (navigator.serviceWorker.controller) return undefined;
      ready.active?.postMessage({ type: 'claim' });
      return controlled;
    });

  await Promise.race([claimed, timeout]).catch(() => undefined);
}
