// Takes the README pictures: a built Iris in Chrome, signed in as Hector on the Synapse of
// test/e2e-schedule/synapse.sh seeded by ./showcase-seed.mjs. Each picture is taken in Iris light
// and Iris dark, at a device scale factor of 2, with the clock fixed at showcase.mjs's NOW and
// animations off. See ./README.md.
//
//   node test/e2e-app/showcase-capture.mjs <playwright-core dir> <out dir> <app url> [homeserver]
//
// Writes <out dir>/<picture>-<light|dark>.png. CHROME, if set, is the browser to run.
//
// The scheduled messages' delays run on the server's real clock, from when the seed ran; the
// capture answers the list with each message's delay counted from NOW instead, so the list shows
// the send times showcase.mjs gives.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NOW, TZ, ME, PASSWORD_SUFFIX } from './showcase.mjs';
import { picnicPhoto } from './showcase-art.mjs';

const [, , pwDir, outDir, appUrl, hs = 'http://localhost:8448'] = process.argv;
if (!pwDir || !outDir || !appUrl) {
  console.error(
    'usage: node test/e2e-app/showcase-capture.mjs <playwright-core dir> <out dir> <app url> [homeserver]'
  );
  process.exit(2);
}
const base = appUrl.replace(/\/$/, '');
const { chromium } = await import(path.join(path.resolve(pwDir), 'index.mjs'));
fs.mkdirSync(outDir, { recursive: true });
const attachment = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'iris-showcase-')),
  'picnic.png'
);
fs.writeFileSync(attachment, picnicPhoto());

const THEMES = { light: 'iris-light-theme', dark: 'iris-dark-theme' };
const FORMS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
};
const T = 20000;

const login = async () => {
  const res = await fetch(`${hs}/_matrix/client/v3/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: ME },
      password: ME + PASSWORD_SUFFIX,
      initial_device_display_name: 'Iris (README pictures)',
    }),
  });
  if (!res.ok) throw new Error(`login: ${res.status} ${await res.text()}`);
  return res.json();
};
const logout = (session) =>
  fetch(`${hs}/_matrix/client/v3/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

const browser = await chromium.launch(
  process.env.CHROME ? { executablePath: process.env.CHROME } : {}
);

/** A fresh browser signed in as Hector (a login each: a new browser makes new keys). */
const open = async (form, theme) => {
  const session = await login();
  const ctx = await browser.newContext({
    ...FORMS[form],
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: 'reduce',
    timezoneId: TZ,
    locale: 'en-US',
  });
  await ctx.addInitScript(
    (s) => {
      localStorage.setItem('cinny_hs_base_url', s.hs);
      localStorage.setItem('cinny_user_id', s.user_id);
      localStorage.setItem('cinny_device_id', s.device_id);
      localStorage.setItem('cinny_access_token', s.access_token);
      localStorage.setItem(
        'settings',
        JSON.stringify({ themeId: s.themeId, useSystemTheme: false })
      );
    },
    { hs, themeId: THEMES[theme], ...session }
  );
  await ctx.route(/\/delayed_events(\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch();
    const body = await res.json();
    for (const e of body.delayed_events ?? []) {
      e.delayed_since_ts = NOW;
      e.running_since = NOW;
    }
    return route.fulfill({ response: res, json: body });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`     pageerror: ${e.message.split('\n')[0]}`));
  await page.clock.setFixedTime(NOW);
  await page.goto(`${base}/home/`);
  await page.getByRole('link', { name: /^Saturday picnic/ }).waitFor({ timeout: T });
  return { session, ctx, page };
};

/** Every image drawn and every font loaded, then a moment for the layout to settle. */
const settle = async (page) => {
  await page.waitForFunction(
    () =>
      document.fonts.status === 'loaded' &&
      Array.from(document.images).every((img) => img.complete),
    undefined,
    { timeout: T }
  );
  // the timeline at its newest message, should an image have grown it after it scrolled: scroll
  // to the end until the last message sits wholly in view and stays there
  let last = '';
  for (let i = 0; i < 20; i += 1) {
    const state = await page.evaluate(() => {
      const box = Array.from(document.querySelectorAll('*')).find((el) => {
        const { overflowY } = getComputedStyle(el);
        return (
          (overflowY === 'auto' || overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight &&
          el.querySelector('[data-message-id]')
        );
      });
      if (!box) return 'none';
      box.scrollTop = box.scrollHeight;
      const messages = box.querySelectorAll('[data-message-id]');
      const end = messages[messages.length - 1].getBoundingClientRect().bottom;
      return `${box.scrollTop}:${box.scrollHeight}:${end <= box.getBoundingClientRect().bottom}`;
    });
    if (state === 'none' || (state === last && state.endsWith('true'))) break;
    last = state;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
};

/** A tap on a phone, a click elsewhere; then the pointer leaves, so nothing shows its hover. */
const press = async (page, locator) => {
  if (page.viewportSize().width < 600) await locator.tap();
  else await locator.click();
  await page.mouse.move(page.viewportSize().width - 1, page.viewportSize().height - 1);
};
const openRoom = async (page, name) => {
  await press(page, page.getByRole('link', { name: new RegExp(`^${name}`) }).first());
  await page.locator('[data-slate-editor]').waitFor({ timeout: T });
};
/** Closes the members panel with its own Close button, as a user would, on a wide screen. */
const closeMembers = async (page) => {
  const heading = page.getByText(/^\d+ Members$/);
  await heading.waitFor({ timeout: T });
  await press(page, heading.locator('xpath=ancestor::*[.//button][1]').locator('button').last());
  await heading.waitFor({ state: 'detached', timeout: T });
};
/** Opens a room on a wide screen, with the members panel closed so the conversation is wide. */
const openRoomWide = async (page, name) => {
  await openRoom(page, name);
  await closeMembers(page);
};
/** The composer: the box holding the text field and its buttons (attach first). */
const composer = (page) =>
  page.locator('[data-slate-editor]').locator('xpath=ancestor::*[.//button[@aria-pressed]][1]');
const openScheduled = async (page) => {
  await press(page, page.locator('[data-action=scheduled-chip]'));
  await page.getByRole('list', { name: 'Scheduled messages' }).waitFor({ timeout: T });
};

// name: [form, what to do before the picture, what the picture shows]
const SHOTS = {
  'desktop-overview': [
    'desktop',
    (page) => openRoomWide(page, 'Saturday picnic'),
    'The room list with its sections, the picnic conversation and the composer',
  ],
  'desktop-scheduled': [
    'desktop',
    async (page) => {
      await openRoomWide(page, 'Saturday picnic');
      await openScheduled(page);
    },
    'Three scheduled messages, listed above the composer',
  ],
  'desktop-stickers': [
    'desktop',
    async (page) => {
      await openRoomWide(page, 'Saturday picnic');
      await press(page, composer(page).locator('button[aria-pressed]').first());
      await page.getByText('Doodles', { exact: true }).waitFor({ timeout: T });
    },
    'The sticker board open on the Doodles pack',
  ],
  'desktop-image-editor': [
    'desktop',
    async (page) => {
      await openRoomWide(page, 'Saturday picnic');
      const chooser = page.waitForEvent('filechooser');
      await composer(page).locator('button').first().click();
      await (await chooser).setFiles(attachment);
      const tile = page.getByRole('button', { name: /^picnic\.png, uploaded/i });
      await tile.waitFor({ timeout: T });
      await press(page, tile);
      await press(page, page.getByLabel('picnic.png options').getByText('Edit', { exact: true }));
      await page.getByText('Edit image', { exact: true }).waitFor({ timeout: T });
    },
    'The image editor open on an attachment, cropping',
  ],
  'desktop-draft': [
    'desktop',
    async (page) => {
      await openRoomWide(page, 'Patroclus');
      await page.locator('[data-slate-editor]').getByText('spare pump').waitFor({ timeout: T });
    },
    "A draft waiting in Patroclus's composer (its pencil in the room list is in desktop-overview)",
  ],
  'phone-home': [
    'phone',
    async (page) => {
      // to the end of the list, with a swipe of the wheel: the round + button then sits in the
      // space the list leaves below its last row, where it covers no text
      await page.mouse.move(195, 400);
      await page.mouse.wheel(0, 2000);
      await page.waitForFunction(
        () => {
          const list = Array.from(document.querySelectorAll('*')).find((el) => {
            const { overflowY } = getComputedStyle(el);
            return (
              (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight
            );
          });
          return list && list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
        },
        undefined,
        { timeout: T }
      );
      await page.mouse.move(page.viewportSize().width - 1, page.viewportSize().height - 1);
    },
    'Home on a phone, scrolled to the end: sections, unread counts, the draft, the tab bar',
  ],
  'phone-conversation': [
    'phone',
    (page) => openRoom(page, 'Andromache'),
    'A direct chat on a phone',
  ],
  'phone-scheduled': [
    'phone',
    async (page) => {
      await openRoom(page, 'Saturday picnic');
      await openScheduled(page);
    },
    'The scheduled messages on a phone',
  ],
};

const only = process.env.ONLY ? process.env.ONLY.split(',') : undefined;
let failed = 0;
for (const [name, [form, act, what]] of Object.entries(SHOTS)) {
  if (only && !only.includes(name)) continue;
  for (const theme of Object.keys(THEMES)) {
    const file = path.join(outDir, `${name}-${theme}.png`);
    const { session, ctx, page } = await open(form, theme);
    try {
      await act(page);
      await settle(page);
      await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' });
      console.log(`${file}  ${what}`);
    } catch (e) {
      failed += 1;
      console.log(`FAIL ${name}-${theme}: ${e.message.split('\n')[0]}`);
      await page.screenshot({ path: file.replace(/\.png$/, '.failed.png') }).catch(() => {});
    }
    await ctx.close();
    await logout(session);
  }
}
await browser.close();
fs.rmSync(path.dirname(attachment), { recursive: true, force: true });
process.exit(failed ? 1 : 0);
