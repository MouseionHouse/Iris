// Drafts of encrypted rooms, sealed before they reach the homeserver.
//
// A room's draft is room account data, which the server stores as it is given. In an encrypted
// room that would put text the user has not sent where whoever runs the server can read it, so
// there the draft is sealed: AES-256-GCM through WebCrypto, with a key derived (HKDF-SHA256) from
// the key backup's private key. Every device that can read the account's encrypted history holds
// that key, so the user's own devices can open each other's drafts and nobody else can.
//
// A device without that key keeps its drafts of encrypted rooms to itself, as Cinny does: it never
// writes one to the server, and clears any draft it finds there still readable.
//
// Type imports only, so `npm test` can load it on its own (test/sealedDrafts.test.ts).
import type { DraftStore, SyncedDraft } from './draftSync';

/** Names the scheme, so a later one can be told apart. */
export const SEALED_DRAFT_ALGORITHM = 'house.mouseion.draft.v1.aes-256-gcm';

/** HKDF's info: the drafts key is for drafts and nothing else. */
const HKDF_INFO = 'house.mouseion.draft.v1 drafts key';

/** What the server holds for an encrypted room's draft. Nothing in it can be read. */
export type SealedDraftContent = {
  algorithm: typeof SEALED_DRAFT_ALGORITHM;
  /** The 12-byte IV, base64. New for every write. */
  iv: string;
  /** The AES-GCM ciphertext and its 16-byte tag, base64. */
  ciphertext: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** Binds a sealed draft to its room: one moved to another room does not open. */
const additionalData = (roomId: string): Uint8Array<ArrayBuffer> =>
  encoder.encode(`${SEALED_DRAFT_ALGORITHM}\n${roomId}`);

/** The drafts key, from the key backup's private key. It can't be read back out. */
export const deriveDraftKey = async (backupPrivateKey: Uint8Array): Promise<CryptoKey> => {
  const material = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(backupPrivateKey),
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: encoder.encode(HKDF_INFO) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const isSealedDraft = (content: unknown): content is SealedDraftContent => {
  if (!content || typeof content !== 'object') return false;
  const { algorithm, iv, ciphertext } = content as Partial<SealedDraftContent>;
  return (
    algorithm === SEALED_DRAFT_ALGORITHM && typeof iv === 'string' && typeof ciphertext === 'string'
  );
};

/** Whether account data in the old, unsealed form carries a draft's text or reply. */
export const hasReadableDraft = (content: unknown): boolean => {
  if (!content || typeof content !== 'object' || isSealedDraft(content)) return false;
  const { msg, reply } = content as { msg?: unknown; reply?: unknown };
  return msg !== undefined || reply !== undefined;
};

/** Seals `value` (a draft) for the room, with a fresh random IV. */
export const sealDraft = async (
  key: CryptoKey,
  roomId: string,
  value: unknown
): Promise<SealedDraftContent> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(roomId), tagLength: 128 },
    key,
    encoder.encode(JSON.stringify(value))
  );
  return {
    algorithm: SEALED_DRAFT_ALGORITHM,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
};

/**
 * Opens a sealed draft. Rejects when it does not open: another key, another room, or changed on
 * the way. The error says no more than that.
 */
export const openDraft = async (
  key: CryptoKey,
  roomId: string,
  content: SealedDraftContent
): Promise<unknown> => {
  let plaintext: ArrayBuffer;
  try {
    const iv = fromBase64(content.iv);
    if (iv.length !== 12) throw new Error();
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(roomId), tagLength: 128 },
      key,
      fromBase64(content.ciphertext)
    );
  } catch {
    throw new Error('sealed draft did not open');
  }
  return JSON.parse(decoder.decode(plaintext));
};

// ---------------------------------------------------------------------------------------------
// The store

/** A draft as the account data holds it, unsealed: `undefined` when it isn't one. */
export const parseDraft = (content: unknown): SyncedDraft | undefined => {
  if (!content || typeof content !== 'object') return undefined;
  const { ts, device, msg, reply } = content as Partial<SyncedDraft>;
  if (typeof ts !== 'number') return undefined;
  return {
    ts,
    device: typeof device === 'string' ? device : '',
    msg: Array.isArray(msg) ? msg : undefined,
    reply: reply && typeof reply.eventId === 'string' ? reply : undefined,
  };
};

/** What the store needs of the account: the Matrix client in the app, a fake in the tests. */
export type DraftAccountData = {
  device: string;
  /** The rooms the account is in. */
  rooms: () => string[];
  isEncrypted: (roomId: string) => boolean;
  /** The room's draft event's content, as the server holds it. */
  read: (roomId: string) => unknown;
  write: (roomId: string, content: SyncedDraft | SealedDraftContent) => Promise<void>;
  /** Every draft event that arrives, this device's own echoes included. */
  onArrive: (listener: (roomId: string, content: unknown) => void) => () => void;
  /** A room that turns encryption on. */
  onEncrypted: (listener: (roomId: string) => void) => () => void;
  /** The key backup's private key, if this device holds it. */
  backupKey: () => Promise<Uint8Array | null>;
  /** This device has been given a backup key. */
  onBackupKey: (listener: () => void) => () => void;
};

export type SealedDraftStore = DraftStore & {
  /** Settles once the drafts found on the server at the start are opened or cleared. */
  ready: Promise<void>;
};

const loadKey = async (account: DraftAccountData): Promise<CryptoKey | undefined> => {
  try {
    const raw = await account.backupKey();
    if (!raw) return undefined;
    try {
      return await deriveDraftKey(raw);
    } finally {
      raw.fill(0);
    }
  } catch {
    return undefined;
  }
};

/**
 * Drafts in the room account data, sealed in encrypted rooms.
 *
 * Unencrypted rooms are as they were: the draft is the event. In an encrypted room the event is
 * sealed with the drafts key, and this device keeps what it opened, so `get` can answer at once;
 * one it can't open (no key, or another one) is no draft. A readable draft found there (from
 * before drafts were sealed, an older Iris, or a room that turned encryption on) is taken in and
 * written back sealed, or, without the key, as an empty draft.
 */
export const createSealedDraftStore = (account: DraftAccountData): SealedDraftStore => {
  let key = loadKey(account);
  /** Encrypted rooms' drafts as this device knows them. */
  const known = new Map<string, SyncedDraft>();
  /** Counts each encrypted room's arrivals, so a slow open can't land over a later one. */
  const arrivals = new Map<string, number>();
  const listeners = new Map<string, Set<(draft: SyncedDraft) => void>>();

  const announce = (roomId: string, draft: SyncedDraft) => {
    listeners.get(roomId)?.forEach((listener) => listener(draft));
  };

  /**
   * Keeps the draft unless this device already knows one as late. Of two with the same time the
   * first stays: an empty draft written over a readable one keeps its time, and is no news.
   */
  const learn = (roomId: string, draft: SyncedDraft) => {
    const had = known.get(roomId);
    if (had && had.ts >= draft.ts) return;
    known.set(roomId, draft);
    announce(roomId, draft);
  };

  const writeSealed = async (roomId: string, draft: SyncedDraft): Promise<boolean> => {
    const k = await key;
    if (!k) return false;
    await account.write(roomId, await sealDraft(k, roomId, draft));
    return true;
  };

  const arriveEncrypted = async (roomId: string, content: unknown) => {
    const arrival = (arrivals.get(roomId) ?? 0) + 1;
    arrivals.set(roomId, arrival);

    if (isSealedDraft(content)) {
      const k = await key;
      if (!k) return;
      let opened: unknown;
      try {
        opened = await openDraft(k, roomId, content);
      } catch {
        // another key's, or changed on the way: not a draft this device can use
        return;
      }
      const draft = parseDraft(opened);
      if (draft && arrivals.get(roomId) === arrival) learn(roomId, draft);
      return;
    }

    const draft = parseDraft(content);
    if (!hasReadableDraft(content)) {
      // empty: a draft cleared, readable or not, says nothing
      if (draft) learn(roomId, draft);
      return;
    }
    // readable text on the server: take it in, then cover it
    if (draft) learn(roomId, draft);
    try {
      const sealed = draft ? await writeSealed(roomId, draft) : false;
      if (!sealed) {
        await account.write(roomId, { ts: draft?.ts ?? 0, device: account.device });
      }
    } catch {
      // not written: the next start, or the next arrival, tries again
    }
  };

  const arrive = (roomId: string, content: unknown): Promise<void> => {
    if (account.isEncrypted(roomId)) return arriveEncrypted(roomId, content);
    const draft = parseDraft(content);
    if (draft) announce(roomId, draft);
    return Promise.resolve();
  };

  const openAll = () =>
    Promise.all(
      account
        .rooms()
        .filter(account.isEncrypted)
        .map((roomId) => arriveEncrypted(roomId, account.read(roomId)))
    ).then(() => undefined);

  account.onArrive((roomId, content) => {
    arrive(roomId, content);
  });
  account.onEncrypted((roomId) => {
    arriveEncrypted(roomId, account.read(roomId));
  });
  account.onBackupKey(() => {
    key = loadKey(account);
    openAll();
  });

  return {
    device: account.device,
    ready: openAll(),
    get: (roomId) =>
      account.isEncrypted(roomId) ? known.get(roomId) : parseDraft(account.read(roomId)),
    put: async (roomId, draft) => {
      if (!account.isEncrypted(roomId)) {
        await account.write(roomId, draft);
        return;
      }
      // without the key it stays on this device
      await writeSealed(roomId, draft);
      learn(roomId, draft);
    },
    subscribe: (roomId, onDraft) => {
      let set = listeners.get(roomId);
      if (!set) {
        set = new Set();
        listeners.set(roomId, set);
      }
      set.add(onDraft);
      return () => {
        set?.delete(onDraft);
      };
    },
  };
};
