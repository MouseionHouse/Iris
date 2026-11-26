// Drafts between two devices of one account, against the Synapse of test/e2e-schedule/synapse.sh:
// an encrypted room's draft follows the account sealed, and the server can't read it. See
// ./README.md, "Drafts".
//
//   node test/e2e-app/drafts.mjs <playwright-core dir> <screenshot dir> <app url> [homeserver]
//
// Hector signs in on two devices, each a browser of its own. The first sets up device
// verification (which makes the key backup), the second verifies with the recovery key, as a user
// would; so both hold the backup key. Then:
// - a readable draft left in the encrypted room from before (as an older Iris wrote it) is gone
//   from the server once the first device has started;
// - a draft typed on the first device appears on the second, in the encrypted room and in the
//   unencrypted one;
// - the server's copy of the encrypted room's draft holds no word of it, and the unencrypted
//   room's is the draft as it was;
// - a readable draft written into the encrypted room while both run is sealed again.
// Prints PASS or FAIL per step; exits 1 if any failed. CHROME, if set, is the browser to run.
// Each run registers a new hector-<time> and makes two rooms.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [, , pwDir, shots, appUrl, hs = 'http://localhost:8448'] = process.argv;
if (!pwDir || !shots || !appUrl) {
  console.error(
    'usage: node test/e2e-app/drafts.mjs <playwright-core dir> <screenshot dir> <app url> [homeserver]'
  );
  process.exit(2);
}
const base = appUrl.replace(/\/$/, '');
const { chromium } = await import(path.join(path.resolve(pwDir), 'index.mjs'));
fs.mkdirSync(shots, { recursive: true });

// a new account each run: device verification is set up once per account
const stamp = Date.now().toString(36);
const USER = `hector-${stamp}`;
const PASSWORD = 'hector-password';
const SHARED_SECRET = 'iris-e2e-schedule'; // synapse.sh's
const DRAFT = 'house.mouseion.draft';
const T = 30000;
const enc = encodeURIComponent;

// ---- the server, as hector ------------------------------------------------------------------
const register = async () => {
  const { nonce } = await (await fetch(`${hs}/_synapse/admin/v1/register`)).json();
  const mac = crypto
    .createHmac('sha1', SHARED_SECRET)
    .update([nonce, USER, PASSWORD, 'notadmin'].join('\0'))
    .digest('hex');
  const res = await fetch(`${hs}/_synapse/admin/v1/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce, username: USER, password: PASSWORD, admin: false, mac }),
  });
  const json = await res.json();
  if (!res.ok && json.errcode !== 'M_USER_IN_USE') {
    throw new Error(`register: ${res.status} ${JSON.stringify(json)}`);
  }
};

const login = async (name) => {
  const res = await fetch(`${hs}/_matrix/client/v3/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: USER },
      password: PASSWORD,
      initial_device_display_name: name,
    }),
  });
  if (!res.ok) throw new Error(`login: ${res.status} ${await res.text()}`);
  return res.json();
};

const api = async (session, method, url, body) => {
  const res = await fetch(`${hs}/_matrix/client/v3${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${JSON.stringify(json)}`);
  return json;
};

/** The room's draft as the server holds it. */
const rawDraft = (session, roomId) =>
  api(session, 'GET', `/user/${enc(session.user_id)}/rooms/${enc(roomId)}/account_data/${DRAFT}`);

const draftOf = (text, ts, device) => ({
  ts,
  device,
  msg: [{ type: 'paragraph', children: [{ text }] }],
});

await register();
const admin = await login('drafts-setup');
const troy = (
  await api(admin, 'POST', '/createRoom', {
    name: `Troy ${stamp}`,
    preset: 'private_chat',
    initial_state: [
      { type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } },
    ],
  })
).room_id;
const agora = (
  await api(admin, 'POST', '/createRoom', { name: `Agora ${stamp}`, preset: 'private_chat' })
).room_id;

// as an Iris from before drafts were sealed left it
const OLD = 'old plaintext from before the update';
await api(
  admin,
  'PUT',
  `/user/${enc(admin.user_id)}/rooms/${enc(troy)}/account_data/${DRAFT}`,
  draftOf(OLD, Date.now() - 60000, 'OLDIRIS')
);

// ---- the browsers ---------------------------------------------------------------------------
const browser = await chromium.launch(
  process.env.CHROME ? { executablePath: process.env.CHROME } : {}
);

const open = async (session) => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(
    (s) => {
      localStorage.setItem('cinny_hs_base_url', s.hs);
      localStorage.setItem('cinny_user_id', s.user_id);
      localStorage.setItem('cinny_device_id', s.device_id);
      localStorage.setItem('cinny_access_token', s.access_token);
    },
    { hs, ...session }
  );
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const page = await ctx.newPage();
  return { ctx, page };
};

const results = [];
const step = async (name, page, fn) => {
  try {
    await fn();
    results.push(true);
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push(false);
    console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`);
    if (page) await page.screenshot({ path: path.join(shots, `${name}.failed.png`) });
  }
};

const composer = (page) => page.locator('div[role=textbox][contenteditable=true]').last();

const openRoom = async (page, roomId) => {
  await page.goto(`${base}/home/${enc(roomId)}/`);
  await composer(page).waitFor({ timeout: T });
};

const openDevices = async (page) => {
  await page.goto(`${base}/home/`);
  await page.getByText(`Troy ${stamp}`).first().waitFor({ timeout: T });
  // hector's avatar at the foot of the rail
  await page.locator('button', { hasText: /^h$/i }).last().click();
  await page.getByText('Devices', { exact: true }).first().click();
  await page.getByText('Device Verification').first().waitFor({ timeout: T });
};

const one = await login('drafts-one');
const two = await login('drafts-two');
const first = await open(one);
let recoveryKey = '';

await step('the readable draft left from before is gone from the server', first.page, async () => {
  await first.page.goto(`${base}/home/`);
  await first.page.getByText(`Troy ${stamp}`).first().waitFor({ timeout: T });
  await first.page.waitForTimeout(3000);
  const raw = JSON.stringify(await rawDraft(admin, troy));
  if (raw.includes('plaintext')) throw new Error('the server still holds the old text');
  console.log(`  troy on the server: ${raw.length} bytes, no text`);
});

await step('the first device sets up verification', first.page, async () => {
  const { page } = first;
  await openDevices(page);
  await page.getByRole('button', { name: 'Enable' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Store the Recovery Key').waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Show' }).click();
  recoveryKey = (
    await page
      .locator('[style*="monospace"]')
      .filter({ hasText: /\w{4} \w{4}/ })
      .first()
      .innerText()
  ).trim();
  if (!/^(\w{4} ){11}\w{4}$/.test(recoveryKey)) throw new Error('no recovery key shown');
  await page.keyboard.press('Escape');
});

const second = await open(two);

await step('the second device verifies with the recovery key', second.page, async () => {
  const { page } = second;
  await openDevices(page);
  await page.getByRole('button', { name: 'Verify Manually' }).click();
  await page.locator('input[name=recoveryKeyInput]').fill(recoveryKey);
  await page.getByRole('button', { name: 'Verify' }).click();
  // the tile gives way to the badge, and the backup connects with the key
  await page.getByText('Verified', { exact: true }).waitFor({ timeout: 60000 });
  await page.getByText('Connected', { exact: true }).waitFor({ timeout: 60000 });
});

const TROY_TEXT = 'Andromache waits at the Scaean gate';
const AGORA_TEXT = 'Priam calls the elders to the agora';

await step('a draft typed on the first device is saved', first.page, async () => {
  const { page } = first;
  for (const [roomId, text] of [
    [troy, TROY_TEXT],
    [agora, AGORA_TEXT],
  ]) {
    await openRoom(page, roomId);
    await composer(page).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(text);
    await page.waitForTimeout(2500);
  }
  await page.goto(`${base}/home/`);
  await page.waitForTimeout(1000);
});

await step(
  'the server holds the encrypted room draft sealed, with no word of it',
  null,
  async () => {
    const raw = await rawDraft(admin, troy);
    const json = JSON.stringify(raw);
    if (raw.algorithm !== 'house.mouseion.draft.v1.aes-256-gcm') {
      throw new Error(`not sealed: keys ${Object.keys(raw).join(',')}`);
    }
    const bytes = Buffer.from(raw.ciphertext, 'base64').toString('latin1');
    const words = TROY_TEXT.split(' ').filter((w) => w.length > 2);
    const found = words.filter((w) => json.includes(w) || bytes.includes(w));
    if (found.length) throw new Error(`the server can read: ${found.join(', ')}`);
    console.log(
      `  troy on the server: keys ${Object.keys(raw).join(',')}; ${json.length} bytes; ` +
        `0 of ${words.length} words found`
    );
  }
);

await step('the server holds the unencrypted room draft as before', null, async () => {
  const raw = await rawDraft(admin, agora);
  if (!JSON.stringify(raw.msg).includes(AGORA_TEXT)) throw new Error('not the draft');
});

await step('the second device shows both drafts', second.page, async () => {
  const { page } = second;
  for (const [roomId, text] of [
    [troy, TROY_TEXT],
    [agora, AGORA_TEXT],
  ]) {
    await openRoom(page, roomId);
    await page.waitForFunction(
      ([t]) =>
        [...document.querySelectorAll('div[role=textbox][contenteditable=true]')].some((el) =>
          el.innerText.includes(t)
        ),
      [text],
      { timeout: T }
    );
  }
});

await step('a readable draft written while they run is sealed again', second.page, async () => {
  const LATE = 'Paris left this unsealed';
  await api(
    admin,
    'PUT',
    `/user/${enc(admin.user_id)}/rooms/${enc(troy)}/account_data/${DRAFT}`,
    draftOf(LATE, Date.now(), 'OLDIRIS')
  );
  const until = Date.now() + 15000;
  for (;;) {
    const raw = await rawDraft(admin, troy);
    if (raw.algorithm && !JSON.stringify(raw).includes('unsealed')) break;
    if (Date.now() > until) throw new Error('still readable after 15 s');
    await new Promise((r) => setTimeout(r, 250));
  }
  await openRoom(second.page, troy);
  await second.page.waitForFunction(
    () =>
      [...document.querySelectorAll('div[role=textbox][contenteditable=true]')].some((el) =>
        el.innerText.includes('Paris left')
      ),
    undefined,
    { timeout: T }
  );
});

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
