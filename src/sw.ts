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

  // A page that loaded without a controller (first visit, or a forced reload) asks to be
  // taken over, so its media requests pass through here and get the access token.
  if (type === 'claim') {
    event.waitUntil(self.clients.claim());
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

/**
 * A session another tab already shared, usable for this media URL. Every tab of this
 * origin signs in to the same account, so a request this worker cannot tie to a tab
 * (no client id, e.g. a notification icon) or whose tab has not answered yet can still
 * be authenticated instead of going out bare and coming back 401.
 */
function sharedSessionFor(url: string): SessionInfo | undefined {
  return Array.from(sessions.values()).find((s) => validMediaRequest(url, s.baseUrl));
}

/**
 * Ask the requesting tab for its session, then any open tab, before giving up.
 */
async function findSession(clientId: string, url: string): Promise<SessionInfo | undefined> {
  if (clientId) {
    const own = await requestSessionWithTimeout(clientId);
    if (own) return own;
  }

  const shared = sharedSessionFor(url);
  if (shared) return shared;

  const windows = await self.clients.matchAll({ type: 'window' });
  const answers = await Promise.all(
    windows.filter((c) => c.id !== clientId).map((c) => requestSessionWithTimeout(c.id))
  );
  return answers.find((s) => s && validMediaRequest(url, s.baseUrl));
}

self.addEventListener('fetch', (event: FetchEvent) => {
  const { url, method } = event.request;

  if (method !== 'GET' || !mediaPath(url)) return;

  const { clientId } = event;

  const ownSession = clientId ? sessions.get(clientId) : undefined;
  if (ownSession) {
    if (validMediaRequest(url, ownSession.baseUrl)) {
      event.respondWith(fetch(url, fetchConfig(ownSession.accessToken)));
    }
    return;
  }

  const sharedSession = sharedSessionFor(url);
  if (sharedSession) {
    event.respondWith(fetch(url, fetchConfig(sharedSession.accessToken)));
    return;
  }

  event.respondWith(
    findSession(clientId, url).then((s) => {
      if (s && validMediaRequest(url, s.baseUrl)) {
        return fetch(url, fetchConfig(s.accessToken));
      }
      return fetch(event.request);
    })
  );
});
