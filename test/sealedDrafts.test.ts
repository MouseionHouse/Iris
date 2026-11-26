// Run with `npm test`. Drafts of encrypted rooms, sealed before they reach the homeserver.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEALED_DRAFT_ALGORITHM,
  createSealedDraftStore,
  deriveDraftKey,
  hasReadableDraft,
  isSealedDraft,
  openDraft,
  parseDraft,
  sealDraft,
} from '../src/app/state/room/sealedDrafts.ts';
import type { DraftAccountData } from '../src/app/state/room/sealedDrafts.ts';

const TROY = '!troy:localhost';
const AGORA = '!agora:localhost';
const TEXT = 'Hector, the ships are burning';

const draftOf = (text: string, ts = 1000, device = 'HECTORPHONE') => ({
  ts,
  device,
  msg: [{ type: 'paragraph', children: [{ text }] }],
});

/** As JSON would carry it: a key that is `undefined` is no key. */
const plain = (value: unknown) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

const backupKey = (seed: number) => new Uint8Array(32).map((_, i) => (i * 7 + seed) % 256);

/** Every form the text could take in what the server holds. */
const assertUnreadable = (content: unknown, text: string) => {
  const raw = JSON.stringify(content);
  for (const word of text.split(/\W+/).filter((w) => w.length > 2)) {
    assert.ok(!raw.includes(word), `raw holds "${word}"`);
    if (isSealedDraft(content)) {
      const bytes = Buffer.from(content.ciphertext, 'base64').toString('latin1');
      assert.ok(!bytes.includes(word), `ciphertext holds "${word}"`);
    }
  }
};

describe('sealing a draft', () => {
  it('opens again with the same key and room', async () => {
    const key = await deriveDraftKey(backupKey(1));
    const sealed = await sealDraft(key, TROY, draftOf(TEXT));
    assert.equal(sealed.algorithm, SEALED_DRAFT_ALGORITHM);
    assert.ok(isSealedDraft(sealed));
    assertUnreadable(sealed, TEXT);
    assert.deepEqual(await openDraft(key, TROY, sealed), draftOf(TEXT));
  });

  it('derives the same key on every device from the same backup key', async () => {
    const sealed = await sealDraft(await deriveDraftKey(backupKey(1)), TROY, draftOf(TEXT));
    const other = await deriveDraftKey(backupKey(1));
    assert.deepEqual(await openDraft(other, TROY, sealed), draftOf(TEXT));
  });

  it('takes a fresh IV every time', async () => {
    const key = await deriveDraftKey(backupKey(1));
    const a = await sealDraft(key, TROY, draftOf(TEXT));
    const b = await sealDraft(key, TROY, draftOf(TEXT));
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.ciphertext, b.ciphertext);
    assert.equal(Buffer.from(a.iv, 'base64').length, 12);
  });

  it('does not open with another key', async () => {
    const sealed = await sealDraft(await deriveDraftKey(backupKey(1)), TROY, draftOf(TEXT));
    const wrong = await deriveDraftKey(backupKey(2));
    await assert.rejects(openDraft(wrong, TROY, sealed), /did not open/);
  });

  it('does not open once changed', async () => {
    const key = await deriveDraftKey(backupKey(1));
    const sealed = await sealDraft(key, TROY, draftOf(TEXT));
    const bytes = Buffer.from(sealed.ciphertext, 'base64');
    bytes[3] ^= 0x01;
    const tampered = { ...sealed, ciphertext: bytes.toString('base64') };
    await assert.rejects(openDraft(key, TROY, tampered), /did not open/);

    const iv = Buffer.from(sealed.iv, 'base64');
    iv[0] ^= 0x80;
    await assert.rejects(openDraft(key, TROY, { ...sealed, iv: iv.toString('base64') }));
    await assert.rejects(openDraft(key, TROY, { ...sealed, iv: 'AAAA' }));
    await assert.rejects(openDraft(key, TROY, { ...sealed, ciphertext: 'not base64!' }));
  });

  it('does not open in another room', async () => {
    const key = await deriveDraftKey(backupKey(1));
    const sealed = await sealDraft(key, TROY, draftOf(TEXT));
    await assert.rejects(openDraft(key, AGORA, sealed), /did not open/);
  });
});

describe('an event in the old, readable form', () => {
  it('is told apart from a sealed one', async () => {
    const old = draftOf(TEXT);
    assert.equal(isSealedDraft(old), false);
    assert.equal(hasReadableDraft(old), true);
    assert.deepEqual(plain(parseDraft(old)), old);
    assert.equal(hasReadableDraft({ ts: 5, device: 'X' }), false);
    assert.equal(hasReadableDraft({ ts: 5, reply: { eventId: '$e' } }), true);
    const sealed = await sealDraft(await deriveDraftKey(backupKey(1)), TROY, old);
    assert.equal(hasReadableDraft(sealed), false);
    assert.equal(parseDraft(sealed), undefined);
  });
});

// ---------------------------------------------------------------------------------------------
// The store, over a fake homeserver

type Server = {
  data: Map<string, unknown>;
  encrypted: Set<string>;
  arrive: Set<(roomId: string, content: unknown) => void>;
  writes: { roomId: string; content: unknown }[];
};

const makeServer = (encrypted: string[], data: Record<string, unknown> = {}): Server => ({
  data: new Map(Object.entries(data)),
  encrypted: new Set(encrypted),
  arrive: new Set(),
  writes: [],
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const device = (server: Server, name: string, key: Uint8Array | null) => {
  const keyed = { key, onKey: new Set<() => void>() };
  const account: DraftAccountData = {
    device: name,
    rooms: () => [TROY, AGORA],
    isEncrypted: (roomId) => server.encrypted.has(roomId),
    read: (roomId) => server.data.get(roomId),
    write: async (roomId, content) => {
      const copy = JSON.parse(JSON.stringify(content));
      server.data.set(roomId, copy);
      server.writes.push({ roomId, content: copy });
      setTimeout(() => server.arrive.forEach((listener) => listener(roomId, copy)), 1);
    },
    onArrive: (listener) => {
      server.arrive.add(listener);
      return () => server.arrive.delete(listener);
    },
    onEncrypted: () => () => undefined,
    backupKey: async () => (keyed.key ? new Uint8Array(keyed.key) : null),
    onBackupKey: (listener) => {
      keyed.onKey.add(listener);
      return () => keyed.onKey.delete(listener);
    },
  };
  const store = createSealedDraftStore(account);
  const giveKey = (k: Uint8Array) => {
    keyed.key = k;
    keyed.onKey.forEach((listener) => listener());
  };
  return { store, giveKey };
};

describe('the drafts store', () => {
  it('leaves an unencrypted room as it was', async () => {
    const server = makeServer([TROY]);
    const { store } = device(server, 'HECTORPHONE', backupKey(1));
    await store.put(AGORA, draftOf(TEXT));
    assert.deepEqual(server.data.get(AGORA), draftOf(TEXT));
    assert.deepEqual(plain(store.get(AGORA)), draftOf(TEXT));
  });

  it('seals an encrypted room, and the other device opens it', async () => {
    const server = makeServer([TROY]);
    const phone = device(server, 'HECTORPHONE', backupKey(1));
    const desk = device(server, 'HECTORDESK', backupKey(1));
    const seen: unknown[] = [];
    desk.store.subscribe(TROY, (draft) => seen.push(draft));
    await phone.store.put(TROY, draftOf(TEXT));
    assert.ok(isSealedDraft(server.data.get(TROY)));
    assertUnreadable(server.data.get(TROY), TEXT);
    await settle();
    assert.deepEqual(plain(desk.store.get(TROY)), draftOf(TEXT));
    assert.deepEqual(plain(seen), [draftOf(TEXT)]);
  });

  it('keeps an encrypted room on the device without the key', async () => {
    const server = makeServer([TROY]);
    const { store } = device(server, 'HECTORPHONE', null);
    await store.put(TROY, draftOf(TEXT));
    assert.equal(server.writes.length, 0);
    assert.deepEqual(plain(store.get(TROY)), draftOf(TEXT));
  });

  it('ignores a draft sealed with another key', async () => {
    const server = makeServer([TROY]);
    const phone = device(server, 'HECTORPHONE', backupKey(1));
    const stranger = device(server, 'PARIS', backupKey(2));
    await phone.store.put(TROY, draftOf(TEXT));
    await settle();
    assert.equal(stranger.store.get(TROY), undefined);
  });

  it('seals a readable draft it finds, with the key', async () => {
    const server = makeServer([TROY], { [TROY]: draftOf(TEXT), [AGORA]: draftOf('the agora') });
    const { store } = device(server, 'HECTORDESK', backupKey(1));
    await store.ready;
    assert.ok(isSealedDraft(server.data.get(TROY)));
    assertUnreadable(server.data.get(TROY), TEXT);
    assert.deepEqual(plain(store.get(TROY)), draftOf(TEXT));
    // the unencrypted room's draft stays as it is
    assert.deepEqual(server.data.get(AGORA), draftOf('the agora'));
    await settle();
    const other = device(server, 'HECTORPHONE', backupKey(1));
    await other.store.ready;
    assert.deepEqual(plain(other.store.get(TROY)), draftOf(TEXT));
  });

  it('empties a readable draft it finds, without the key, and keeps it here', async () => {
    const server = makeServer([TROY], { [TROY]: draftOf(TEXT) });
    const { store } = device(server, 'HECTORPHONE', null);
    await store.ready;
    assert.deepEqual(server.data.get(TROY), { ts: 1000, device: 'HECTORPHONE' });
    await settle();
    assert.deepEqual(plain(store.get(TROY)), draftOf(TEXT));
  });

  it('seals a readable draft that arrives later, as from an older Iris', async () => {
    const server = makeServer([TROY]);
    const { store } = device(server, 'HECTORDESK', backupKey(1));
    await store.ready;
    server.data.set(TROY, draftOf(TEXT, 2000, 'OLDIRIS'));
    server.arrive.forEach((listener) => listener(TROY, draftOf(TEXT, 2000, 'OLDIRIS')));
    await settle();
    assert.ok(isSealedDraft(server.data.get(TROY)));
    assert.deepEqual(plain(store.get(TROY)), draftOf(TEXT, 2000, 'OLDIRIS'));
  });

  it('opens what it could not once the backup key comes', async () => {
    const server = makeServer([TROY]);
    const phone = device(server, 'HECTORPHONE', backupKey(1));
    const desk = device(server, 'HECTORDESK', null);
    await phone.store.put(TROY, draftOf(TEXT));
    await settle();
    assert.equal(desk.store.get(TROY), undefined);
    desk.giveKey(backupKey(1));
    await settle();
    assert.deepEqual(plain(desk.store.get(TROY)), draftOf(TEXT));
  });

  it('keeps the later of two drafts', async () => {
    const server = makeServer([TROY]);
    const phone = device(server, 'HECTORPHONE', backupKey(1));
    const desk = device(server, 'HECTORDESK', backupKey(1));
    await desk.store.put(TROY, draftOf('later', 3000, 'HECTORDESK'));
    await phone.store.put(TROY, draftOf('earlier', 2000));
    await settle();
    assert.deepEqual(plain(desk.store.get(TROY)), draftOf('later', 3000, 'HECTORDESK'));
  });
});
