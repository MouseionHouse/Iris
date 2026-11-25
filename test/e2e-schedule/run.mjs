// End to end check of scheduled messages against a local Synapse with MSC4140
// switched on (./synapse.sh up). Two users, alice and bob, each a matrix-js-sdk client with rust
// crypto, drive the same functions Iris uses (src/app/utils/delayedEvents.ts).
//
//   node test/e2e-schedule/run.mjs [http://localhost:8448]
//
// Prints one line per check and a JSON summary at the end; exits 1 if any check failed.
import { createClient, ClientEvent, RoomEvent, MatrixEventEvent } from 'matrix-js-sdk';
import { logger } from 'matrix-js-sdk/lib/logger.js';
import {
  cancelDelayedEvent,
  decryptDelayedEvent,
  isScheduledMessage,
  listDelayedEvents,
  parseDelayTooLarge,
  scheduleMessage,
  sendDelayedEventNow,
} from '../../src/app/utils/delayedEvents.ts';

logger.setLevel('error');
const BASE = process.argv[2] ?? 'http://localhost:8448';
const results = [];
let failed = 0;
const check = (name, ok, detail = {}) => {
  results.push({ name, ok, ...detail });
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const marker = (label) =>
  `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function login(user) {
  const tmp = createClient({ baseUrl: BASE });
  const res = await tmp.loginRequest({
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user },
    password: `${user}-password`,
    initial_device_display_name: `e2e-schedule ${user}`,
  });
  const mx = createClient({
    baseUrl: BASE,
    userId: res.user_id,
    accessToken: res.access_token,
    deviceId: res.device_id,
  });
  await mx.initRustCrypto({ useIndexedDB: false });
  await new Promise((resolve) => {
    mx.once(ClientEvent.Sync, (state) => state === 'PREPARED' && resolve());
    mx.startClient({ initialSyncLimit: 1 });
  });
  return mx;
}

/** Resolves with the first event in `roomId` whose clear body is `body`, and when it came. */
function waitForBody(mx, roomId, body, timeoutMs) {
  return new Promise((resolve) => {
    const done = (value) => {
      clearTimeout(timer);
      mx.removeListener(RoomEvent.Timeline, onTimeline);
      resolve(value);
    };
    const timer = setTimeout(() => done(undefined), timeoutMs);
    const look = (event) => {
      if (event.getContent()?.body === body) {
        done({ at: Date.now(), event });
        return true;
      }
      return false;
    };
    const onTimeline = (event, room) => {
      if (room?.roomId !== roomId) return;
      if (look(event)) return;
      if (event.isBeingDecrypted() || event.isEncrypted()) {
        event.once(MatrixEventEvent.Decrypted, () => look(event));
      }
    };
    mx.on(RoomEvent.Timeline, onTimeline);
  });
}

async function waitForJoin(mx, roomId, userId) {
  for (let i = 0; i < 100; i += 1) {
    if (mx.getRoom(roomId)?.getMember(userId)?.membership === 'join') return;
    await sleep(100);
  }
  throw new Error(`${userId} never joined ${roomId}`);
}

async function makeRoom(alice, bob, encrypted) {
  const { room_id: roomId } = await alice.createRoom({
    invite: [bob.getUserId()],
    initial_state: encrypted
      ? [
          {
            type: 'm.room.encryption',
            state_key: '',
            content: { algorithm: 'm.megolm.v1.aes-sha2' },
          },
        ]
      : [],
  });
  for (let i = 0; i < 100 && !bob.getRoom(roomId); i += 1) await sleep(100);
  await bob.joinRoom(roomId);
  await waitForJoin(alice, roomId, bob.getUserId());
  for (
    let i = 0;
    i < 100 && !bob.getRoom(roomId)?.hasEncryptionStateEvent?.() && encrypted;
    i += 1
  ) {
    await sleep(100);
  }
  return roomId;
}

const text = (body) => ({ msgtype: 'm.text', body });

const alice = await login('alice');
const bob = await login('bob');
const summary = {};

try {
  // ---- unencrypted room
  const plainRoomId = await makeRoom(alice, bob, false);
  const plainRoom = alice.getRoom(plainRoomId);

  {
    const body = marker('in ten seconds');
    const t0 = Date.now();
    const arrival = waitForBody(bob, plainRoomId, body, 30000);
    await scheduleMessage(alice, plainRoom, text(body), 10000);
    const got = await arrival;
    const delay = got ? got.at - t0 : undefined;
    summary.plainDelayMs = delay;
    check(
      'unencrypted: arrives after ~10 s, not before',
      !!got && delay >= 10000 && delay < 13000,
      {
        deliveredAfterMs: delay,
      }
    );
  }

  {
    const body = marker('cancelled');
    const arrival = waitForBody(bob, plainRoomId, body, 9000);
    const delayId = await scheduleMessage(alice, plainRoom, text(body), 4000);
    await cancelDelayedEvent(alice, delayId);
    const listed = (await listDelayedEvents(alice)).some((e) => e.delayId === delayId);
    const got = await arrival;
    check('unencrypted: cancel stops it', !got && !listed, { arrived: !!got, stillListed: listed });
  }

  {
    const body = marker('send now');
    const arrival = waitForBody(bob, plainRoomId, body, 15000);
    const delayId = await scheduleMessage(alice, plainRoom, text(body), 600000);
    const t0 = Date.now();
    await sendDelayedEventNow(alice, delayId);
    const got = await arrival;
    const delay = got ? got.at - t0 : undefined;
    summary.sendNowMs = delay;
    check('unencrypted: send now sends at once', !!got && delay < 3000, {
      deliveredAfterMs: delay,
    });
  }

  {
    const body = marker('stored plain');
    const delayId = await scheduleMessage(alice, plainRoom, text(body), 600000);
    const listed = (await listDelayedEvents(alice)).find((e) => e.delayId === delayId);
    check(
      'unencrypted: listed with its send time',
      !!listed &&
        listed.type === 'm.room.message' &&
        listed.content.body === body &&
        Math.abs(listed.sendTs - (Date.now() + 600000)) < 5000,
      { sendTsInMs: listed && listed.sendTs - Date.now() }
    );
    await cancelDelayedEvent(alice, delayId);
  }

  // ---- encrypted room
  const e2eRoomId = await makeRoom(alice, bob, true);
  const e2eRoom = alice.getRoom(e2eRoomId);

  {
    const body = marker('encrypted in ten seconds');
    const t0 = Date.now();
    const arrival = waitForBody(bob, e2eRoomId, body, 30000);
    const ownArrival = waitForBody(alice, e2eRoomId, body, 30000);
    const delayId = await scheduleMessage(alice, e2eRoom, text(body), 10000);

    const listed = (await listDelayedEvents(alice)).find((e) => e.delayId === delayId);
    const stored = JSON.stringify(listed?.content ?? {});
    check(
      'encrypted: the server holds only ciphertext',
      !!listed &&
        isScheduledMessage(listed) &&
        listed.type === 'm.room.encrypted' &&
        typeof listed.content.ciphertext === 'string' &&
        !stored.includes(body) &&
        !stored.includes('"body"'),
      { type: listed?.type, algorithm: listed?.content.algorithm }
    );

    // the preview: decrypt the held ciphertext on the sending device, twice (list refetches)
    const preview1 = await decryptDelayedEvent(alice, listed);
    const preview2 = await decryptDelayedEvent(alice, listed);
    summary.previewDecrypt = preview1?.body === body && preview2?.body === body;
    check('encrypted: the preview decrypts on the sending device', summary.previewDecrypt, {
      first: preview1?.body === body,
      second: preview2?.body === body,
    });

    const got = await arrival;
    const own = await ownArrival;
    const delay = got ? got.at - t0 : undefined;
    summary.encryptedDelayMs = delay;
    check(
      'encrypted: arrives as m.room.encrypted after ~10 s',
      !!got && got.event.getWireType() === 'm.room.encrypted' && delay >= 10000 && delay < 14000,
      {
        deliveredAfterMs: delay,
        wireType: got?.event.getWireType(),
      }
    );
    check(
      'encrypted: the second user decrypts it to the original text',
      got?.event.getContent().body === body,
      {
        decryptionFailure: got?.event.isDecryptionFailure(),
      }
    );
    // the delivered event on the device that decrypted the preview: no replay or duplicate index
    const ownFailure = own?.event.isDecryptionFailure();
    summary.ownDecryptAfterPreview = !!own && !ownFailure;
    check(
      'encrypted: after the preview, the sender still decrypts the delivered event',
      !!own && !ownFailure && own.event.getContent().body === body,
      { arrived: !!own, failure: ownFailure, reason: own?.event.decryptionFailureReason }
    );
  }

  {
    // a preview decrypted after delivery too, then the timeline event decrypted again
    const body = marker('send now encrypted');
    const ownArrival = waitForBody(alice, e2eRoomId, body, 15000);
    const bobArrival = waitForBody(bob, e2eRoomId, body, 15000);
    const delayId = await scheduleMessage(alice, e2eRoom, text(body), 600000);
    const listed = (await listDelayedEvents(alice)).find((e) => e.delayId === delayId);
    const preview = await decryptDelayedEvent(alice, listed);
    await sendDelayedEventNow(alice, delayId);
    const own = await ownArrival;
    const theirs = await bobArrival;
    check(
      'encrypted: send now, previewed first, decrypts on both sides',
      preview?.body === body &&
        !!own &&
        !own.event.isDecryptionFailure() &&
        theirs?.event.getContent().body === body,
      {
        preview: preview?.body === body,
        own: own && !own.event.isDecryptionFailure(),
        bob: theirs?.event.getContent().body === body,
      }
    );
  }

  {
    // the other device's view: bob can't read alice's held ciphertext through the list (it is
    // alice's list), but a preview on a device without the key fails cleanly, not with plain text
    const body = marker('no key');
    const delayId = await scheduleMessage(alice, e2eRoom, text(body), 600000);
    const listed = (await listDelayedEvents(alice)).find((e) => e.delayId === delayId);
    const carol = await login('bob'); // a fresh device of bob's, with no room keys
    const preview = await decryptDelayedEvent(carol, listed);
    check('encrypted: a device without the key gets no preview', preview === undefined, {
      preview: preview === undefined ? 'none' : 'decrypted',
    });
    carol.stopClient();
    await cancelDelayedEvent(alice, delayId);
  }

  // ---- the server's limit
  {
    let parsed;
    let errcode;
    try {
      await scheduleMessage(alice, plainRoom, text('too far'), 8 * 24 * 3600 * 1000);
    } catch (e) {
      errcode = e.errcode;
      parsed = parseDelayTooLarge(e);
    }
    summary.maxDelayMs = parsed?.maxDelayMs;
    check(
      'a delay over the limit gives the parsed maximum',
      parsed?.maxDelayMs === 7 * 24 * 3600 * 1000,
      {
        errcode,
        maxDelayMs: parsed?.maxDelayMs,
      }
    );
  }
} finally {
  alice.stopClient();
  bob.stopClient();
}

console.log(JSON.stringify({ summary, failed, checks: results.length }, null, 2));
process.exit(failed ? 1 : 0);
