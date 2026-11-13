// The app itself against the local Synapse (./synapse.sh up): alice in Iris in a browser, on the
// vite dev server, schedules a message in an encrypted room through the composer; bob, a
// matrix-js-sdk client with rust crypto, receives it.
//
//   npx vite --port 5187 &
//   node test/e2e-schedule/app.mjs <playwright-core dir> <screenshot dir> [http://localhost:5187]
//
// Checks: the server holds only ciphertext, the list in the app previews it (decrypted in the
// browser), Send now in the list delivers it, bob and alice's browser both decrypt it.
import path from 'node:path';
import { createRequire } from 'node:module';
import { createClient, ClientEvent, RoomEvent, MatrixEventEvent } from 'matrix-js-sdk';
import { logger } from 'matrix-js-sdk/lib/logger.js';
import { listDelayedEvents } from '../../src/app/utils/delayedEvents.ts';

logger.setLevel('error');
const [pwDir, outDir, appBase = 'http://localhost:5187'] = process.argv.slice(2);
const HS = 'http://localhost:8448';
const { chromium } = createRequire(path.join(path.resolve(pwDir), 'x.js'))('playwright-core');

let failed = 0;
const check = (name, ok, detail = {}) => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = async (user, name) =>
  createClient({ baseUrl: HS }).loginRequest({
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user },
    password: `${user}-password`,
    initial_device_display_name: name,
  });

// bob, listening
const bobLogin = await login('bob', 'e2e-schedule app bob');
const bob = createClient({
  baseUrl: HS,
  userId: bobLogin.user_id,
  accessToken: bobLogin.access_token,
  deviceId: bobLogin.device_id,
});
await bob.initRustCrypto({ useIndexedDB: false });
await new Promise((resolve) => {
  bob.once(ClientEvent.Sync, (s) => s === 'PREPARED' && resolve());
  bob.startClient({ initialSyncLimit: 1 });
});

// alice: a session for the browser, and a plain client for setting up and reading the list
const aliceLogin = await login('alice', 'Iris (e2e-schedule)');
const alice = createClient({
  baseUrl: HS,
  userId: aliceLogin.user_id,
  accessToken: aliceLogin.access_token,
  deviceId: aliceLogin.device_id,
});
const { room_id: roomId } = await alice.createRoom({
  name: `Scheduled ${Date.now().toString(36)}`,
  invite: [bob.getUserId()],
  initial_state: [
    { type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } },
  ],
});
for (let i = 0; i < 100 && !bob.getRoom(roomId); i += 1) await sleep(100);
await bob.joinRoom(roomId);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 300)));
page.on('pageerror', (e) =>
  console.log('PAGEERROR', e.message, (e.stack ?? '').split('\n').slice(0, 8).join(' | '))
);
await page.goto(appBase, { waitUntil: 'domcontentloaded' });
await page.evaluate(
  (s) => {
    localStorage.setItem('cinny_access_token', s.access_token);
    localStorage.setItem('cinny_device_id', s.device_id);
    localStorage.setItem('cinny_user_id', s.user_id);
    localStorage.setItem('cinny_hs_base_url', s.hs);
  },
  { ...aliceLogin, hs: HS }
);
await page.goto(`${appBase}/home/${encodeURIComponent(roomId)}/`, {
  waitUntil: 'domcontentloaded',
});
await page.locator('[data-slate-editor]').waitFor({ timeout: 90000 });
await sleep(3000);

const body = `Bins at 7 ${Date.now().toString(36)}`;
await page.locator('[data-slate-editor]').click();
await page.keyboard.type(body);
check('the split send button shows', await page.isVisible('[data-action="send-options"]'));
await page.click('[data-action="send-options"]');
await page.click('[data-action="schedule"]');
await page.click('[data-action="confirm-schedule"]');
await sleep(500);
await page.keyboard.press('Enter');
await sleep(4000);
await page.screenshot({ path: path.join(outDir, 'app-after-schedule.png') });

const held = (await listDelayedEvents(alice)).filter((e) => e.roomId === roomId);
const stored = JSON.stringify(held[0]?.content ?? {});
check(
  'the server holds the browser’s message as ciphertext only',
  held.length === 1 &&
    held[0].type === 'm.room.encrypted' &&
    !stored.includes(body) &&
    !stored.includes('"body"'),
  {
    held: held.length,
    type: held[0]?.type,
    inMinutes: held[0] && Math.round((held[0].sendTs - Date.now()) / 60000),
  }
);

await page.click('[data-action="scheduled-chip"]');
await sleep(1500);
const rowText = await page.locator('[data-scheduled-row]').first().innerText();
check('the list in the app previews it, decrypted in the browser', rowText.includes(body), {
  rowText,
});
await page.screenshot({ path: path.join(outDir, 'app-encrypted-list.png') });

const arrival = new Promise((resolve) => {
  const timer = setTimeout(() => resolve(undefined), 20000);
  const look = (ev) => {
    if (ev.getContent()?.body === body) {
      clearTimeout(timer);
      resolve({ at: Date.now(), ev });
    }
  };
  bob.on(RoomEvent.Timeline, (ev, room) => {
    if (room?.roomId !== roomId) return;
    look(ev);
    ev.once(MatrixEventEvent.Decrypted, () => look(ev));
  });
});
const t0 = Date.now();
await page.locator('[data-scheduled-row]').first().locator('[data-action="send-now"]').click();
const got = await arrival;
check(
  'Send now in the list delivers it, and bob decrypts it',
  !!got && got.ev.getWireType() === 'm.room.encrypted',
  {
    afterMs: got && got.at - t0,
  }
);
await sleep(3000);
const timeline = await page
  .locator('[data-message-id], [data-event-id]')
  .allInnerTexts()
  .catch(() => []);
const pageText = await page.locator('body').innerText();
check(
  'alice’s browser decrypts the delivered message after previewing it',
  pageText.includes(body) && !pageText.includes('Unable to decrypt'),
  {
    timelineItems: timeline.length,
  }
);
await page.screenshot({ path: path.join(outDir, 'app-encrypted-delivered.png') });

await browser.close();
bob.stopClient();
process.exit(failed ? 1 : 0);
