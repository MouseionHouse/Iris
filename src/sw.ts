/// <reference lib="WebWorker" />

export type {};
declare const self: ServiceWorkerGlobalScope;

type SessionInfo = {
  accessToken: string;
  baseUrl: string;
};

/**
 * Store session per client (tab)
 */
const sessions = new Map<string, SessionInfo>();

const clientToResolve = new Map<string, (value: SessionInfo | undefined) => void>();
const clientToSessionPromise = new Map<string, Promise<SessionInfo | undefined>>();

async function cleanupDeadClients() {
  const activeClients = await self.clients.matchAll();
  const activeIds = new Set(activeClients.map((c) => c.id));

  Array.from(sessions.keys()).forEach((id) => {
    if (!activeIds.has(id)) {
      sessions.delete(id);
      clientToResolve.delete(id);
      clientToSessionPromise.delete(id);
    }
  });
}

function setSession(clientId: string, accessToken: any, baseUrl: any) {
  if (typeof accessToken === 'string' && typeof baseUrl === 'string') {
    sessions.set(clientId, { accessToken, baseUrl });
  } else {
    // Logout or invalid session
    sessions.delete(clientId);
  }

  const resolveSession = clientToResolve.get(clientId);
  if (resolveSession) {
    resolveSession(sessions.get(clientId));
    clientToResolve.delete(clientId);
    clientToSessionPromise.delete(clientId);
  }
}

function requestSession(client: Client): Promise<SessionInfo | undefined> {
  const promise =
    clientToSessionPromise.get(client.id) ??
    new Promise((resolve) => {
      clientToResolve.set(client.id, resolve);
      client.postMessage({ type: 'requestSession' });
    });

  if (!clientToSessionPromise.has(client.id)) {
    clientToSessionPromise.set(client.id, promise);
  }

  return promise;
}

async function requestSessionWithTimeout(
  clientId: string,
  timeoutMs = 3000
): Promise<SessionInfo | undefined> {
  const client = await self.clients.get(clientId);
  if (!client) return undefined;

  const sessionPromise = requestSession(client);

  const timeout = new Promise<undefined>((resolve) => {
    setTimeout(() => resolve(undefined), timeoutMs);
  });

  return Promise.race([sessionPromise, timeout]);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await cleanupDeadClients();
    })()
  );
});

/**
 * Receive session updates from clients
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const client = event.source as Client | null;
  if (!client) return;

  const { type, accessToken, baseUrl } = event.data || {};

  if (type === 'setSession') {
    setSession(client.id, accessToken, baseUrl);
    cleanupDeadClients();
  }
});

const MEDIA_PATHS = ['/_matrix/client/v1/media/download', '/_matrix/client/v1/media/thumbnail'];

function mediaPath(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return MEDIA_PATHS.some((p) => pathname.startsWith(p));
  } catch {
    return false;
  }
}

function validMediaRequest(url: string, baseUrl: string): boolean {
  return MEDIA_PATHS.some((p) => {
    const validUrl = new URL(p, baseUrl);
    return url.startsWith(validUrl.href);
  });
}

function fetchConfig(token: string): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'default',
  };
}

// A picture that failed to arrive is asked for again after these waits. Returning to the app
// drops its connections, and a transfer cut then left the picture broken until a manual retry.
const IMAGE_RETRY_DELAYS_MS = [500, 1500, 4000];
// How long the server may take to start answering before the attempt is given up.
const IMAGE_RESPONSE_TIMEOUT_MS = 20000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** One attempt at a picture, read to the end so that a transfer cut short fails here. */
async function fetchImage(request: Request, token: string): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort);
  const timeout = setTimeout(abort, IMAGE_RESPONSE_TIMEOUT_MS);
  try {
    const response = await fetch(request.url, { ...fetchConfig(token), signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return response;
    const body = await response.blob();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? body.type },
    });
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener('abort', abort);
  }
}

const retriable = (status: number): boolean => status >= 500 || status === 429;

/**
 * Fetches media with the session's token. Pictures are retried when the network fails them;
 * anything else (video and audio stream in ranges, downloads can be large) passes through.
 */
async function fetchMedia(request: Request, token: string): Promise<Response> {
  if (request.destination !== 'image') return fetch(request.url, fetchConfig(token));

  for (let attempt = 0; ; attempt += 1) {
    const last = attempt === IMAGE_RETRY_DELAYS_MS.length;
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetchImage(request, token);
      if (last || !retriable(response.status)) return response;
    } catch (error) {
      if (last || request.signal.aborted) throw error;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(IMAGE_RETRY_DELAYS_MS[attempt]);
  }
}

self.addEventListener('fetch', (event: FetchEvent) => {
  const { url, method } = event.request;

  if (method !== 'GET' || !mediaPath(url)) return;

  const { clientId } = event;
  if (!clientId) return;

  const session = sessions.get(clientId);
  if (session) {
    if (validMediaRequest(url, session.baseUrl)) {
      event.respondWith(fetchMedia(event.request, session.accessToken));
    }
    return;
  }

  event.respondWith(
    requestSessionWithTimeout(clientId).then((s) => {
      if (s && validMediaRequest(url, s.baseUrl)) {
        return fetchMedia(event.request, s.accessToken);
      }
      return fetch(event.request);
    })
  );
});
