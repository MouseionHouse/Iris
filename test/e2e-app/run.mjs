// Drives a built Iris in Chrome against the Synapse of test/e2e-schedule/synapse.sh, seeded by
// ./seed.mjs, on a wide screen and a phone. See ./README.md.
//
//   node test/e2e-app/run.mjs <playwright-core dir> <screenshot dir> <app url> [homeserver]
//
// Two parts:
// - routes: where each path ends up, signed out and signed in (the loaders' redirects, and that
//   each page renders without an error);
// - walk: alice signed in, through the timeline, the composer, menus, rooms, spaces, DMs, the
//   inbox, explore and settings.
// A step fails on a wrong page or URL, and on any page error or console error but the few known
// below. Prints PASS or FAIL per step; exits 1 if any failed. CHROME, if set, is the browser to run.
import fs from 'node:fs';
import path from 'node:path';

const [, , pwDir, shots, appUrl, hs = 'http://localhost:8448'] = process.argv;
if (!pwDir || !shots || !appUrl) {
  console.error(
    'usage: node test/e2e-app/run.mjs <playwright-core dir> <screenshot dir> <app url> [homeserver]'
  );
  process.exit(2);
}
const base = appUrl.replace(/\/$/, '');
const { chromium } = await import(path.join(path.resolve(pwDir), 'index.mjs'));
fs.mkdirSync(shots, { recursive: true });

// Console errors that are not the app's fault, or are known and harmless.
const KNOWN = [
  // the signed-out pages ask matrix.org, the default homeserver, about itself; offline, that fails
  /Failed to load resource|net::ERR_|Failed to fetch|\.well-known/,
  // a request superseded by a newer one rejects so (useAsyncCallback); seen on the inbox
  /AsyncCallbackHook: Request replaced!/,
];
const unexpected = (msgs) => msgs.filter((m) => !KNOWN.some((re) => re.test(m)));

const login = async () => {
  const res = await fetch(`${hs}/_matrix/client/v3/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: 'alice' },
      password: 'alice-password',
      initial_device_display_name: 'e2e-app',
    }),
  });
  if (!res.ok) throw new Error(`login: ${res.status} ${await res.text()}`);
  return res.json();
};

const browser = await chromium.launch(
  process.env.CHROME ? { executablePath: process.env.CHROME } : {}
);

const viewports = {
  desktop: { viewport: { width: 1400, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
};

/** A browser context, signed in as alice when given her session. Messages go into `msgs`. */
const open = async (form, session) => {
  const ctx = await browser.newContext(viewports[form]);
  if (session) {
    await ctx.addInitScript(
      (s) => {
        localStorage.setItem('cinny_hs_base_url', s.hs);
        localStorage.setItem('cinny_user_id', s.user_id);
        localStorage.setItem('cinny_device_id', s.device_id);
        localStorage.setItem('cinny_access_token', s.access_token);
      },
      { hs, ...session }
    );
  }
  const page = await ctx.newPage();
  const msgs = [];
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => {
    if (m.type() === 'error') msgs.push(`console.error: ${m.text().replace(/\s+/g, ' ')}`);
  });
  return { ctx, page, msgs };
};

let failed = 0;
const report = (name, error, msgs) => {
  const bad = unexpected(msgs);
  const ok = !error && bad.length === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (error)
    console.log(
      `     ${String(error.message ?? error)
        .split('\n')[0]
        .slice(0, 300)}`
    );
  [...new Set(bad)].forEach((m) => console.log(`     ${m.slice(0, 300)}`));
};
const shotName = (name) => `${name.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}.png`;

// ---- routes -------------------------------------------------------------------------------
const LOGIN = '/login/matrix.org'; // config.json's default homeserver
// path: [signed out, signed in on a wide screen, signed in on a phone]
const ROUTES = {
  '/': [LOGIN, '/home/', '/home/'],
  '/login/': [LOGIN, '/home/', '/home/'],
  '/register/': ['/register/matrix.org', '/home/', '/home/'],
  '/reset-password/': ['/reset-password/matrix.org', '/home/', '/home/'],
  '/home/': [LOGIN, '/home/', '/home/'],
  '/direct/': [LOGIN, '/direct/', '/direct/'],
  '/explore/': [LOGIN, '/explore/featured/', '/explore/'],
  '/inbox/': [LOGIN, '/inbox/notifications/', '/inbox/notifications/'],
  // Search and You are tabs of a phone; a wide screen has them in the rail.
  '/search/': [LOGIN, '/home/', '/search/'],
  '/search/messages/?term=hi': [LOGIN, '/home/search/?term=hi', '/search/messages/?term=hi'],
  '/you/': [LOGIN, '/home/', '/you/'],
  '/create': [LOGIN, '/create', '/create'],
  // a space's index is its lobby on a wide screen, its room list on a phone
  '/%23testspace:localhost/': [LOGIN, '/%23testspace:localhost/lobby', '/%23testspace:localhost/'],
  '/a/b/c/d/e/': ['/a/b/c/d/e/', '/a/b/c/d/e/', '/a/b/c/d/e/'],
};

for (const form of ['desktop', 'mobile']) {
  for (const signedIn of [false, true]) {
    for (const [route, expected] of Object.entries(ROUTES)) {
      const want = expected[signedIn ? (form === 'desktop' ? 1 : 2) : 0];
      const name = `route ${form} ${signedIn ? 'signed in' : 'signed out'} ${route}`;
      // a login of its own each time: a fresh browser makes new keys, which a device already
      // signed in elsewhere could not upload
      const { ctx, page, msgs } = await open(form, signedIn && (await login()));
      let error;
      try {
        await page.goto(base + route);
        await page.waitForURL((u) => u.href.slice(base.length) === want, { timeout: 15000 });
        // the page under it renders: the sign-in form, the client, or the not-found text
        await page
          .getByText(signedIn || route === '/a/b/c/d/e/' ? /\S/ : 'Homeserver')
          .first()
          .waitFor({ timeout: 15000 });
        await page.waitForTimeout(1000);
      } catch (e) {
        error = new Error(`${e.message.split('\n')[0]} (at ${page.url().slice(base.length)})`);
      }
      report(name, error, msgs);
      await ctx.close();
    }
  }
}

// ---- walk ---------------------------------------------------------------------------------
const T = 15000;
const SPACE = `${base}/%23testspace:localhost`;
const GENERAL = /%23general(%3A|:)localhost/;
const RANDOM = /%23random(%3A|:)localhost/;

const walk = async (form) => {
  const mobile = form === 'mobile';
  const { ctx, page, msgs } = await open(form, await login());
  const composer = () => page.locator('div[role=textbox][contenteditable=true]').last();
  const sent = `e2e message ${Date.now().toString(36)}`;

  const steps = [
    [
      'home lists the DM',
      async () => {
        await page.goto(`${base}/home/`);
        await page.getByText('bob', { exact: true }).first().waitFor({ timeout: 30000 });
      },
    ],
    [
      'a space link opens the space',
      async () => {
        await page.goto(`${SPACE}/`);
        await page
          .getByRole('link', { name: /General/ })
          .first()
          .waitFor({ timeout: T });
      },
    ],
    [
      'a room opens from the list',
      async () => {
        await page
          .getByRole('link', { name: /General/ })
          .first()
          .click();
        await page.waitForURL(GENERAL, { timeout: T });
        await page.getByText('Message number 40', { exact: true }).waitFor({ timeout: T });
        await page
          .getByText(/^fixed message/)
          .first()
          .waitFor({ timeout: T });
      },
    ],
    [
      'the timeline loads older messages',
      async () => {
        const box = await page.getByText('Message number 40', { exact: true }).boundingBox();
        await page.mouse.move(box.x + 50, box.y);
        for (let i = 0; i < 40; i += 1) {
          if (await page.getByText('Message number 1', { exact: true }).isVisible()) break;
          await page.mouse.wheel(0, -1500);
          await page.waitForTimeout(150);
        }
        await page.getByText('Message number 1', { exact: true }).waitFor({ timeout: T });
      },
    ],
    [
      'a message sends',
      async () => {
        await composer().click();
        // empty it first: drafts follow alice between devices, so an earlier run's may be there
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('Backspace');
        await page.keyboard.type(sent);
        await page.keyboard.press('Enter');
        await page.getByText(sent, { exact: true }).last().waitFor({ timeout: T });
        const left = (await composer().innerText()).trim();
        if (left.includes(sent)) throw new Error(`the composer still holds: ${left}`);
      },
    ],
    [
      'emoji autocomplete',
      async () => {
        await composer().click();
        await page.keyboard.type(':thumbs');
        await page
          .getByText(/thumbsup|thumbs_up|:\+1:/i)
          .first()
          .waitFor({ timeout: T });
        await page.keyboard.press('Escape');
        for (let i = 0; i < 10; i += 1) await page.keyboard.press('Backspace');
      },
    ],
    [
      'a message menu',
      async () => {
        const msg = page.getByText('Message number 40', { exact: true });
        await msg.scrollIntoViewIfNeeded();
        // a right click; on a phone the browser turns a long press into the same contextmenu event
        await msg.click({ button: 'right' });
        await page
          .getByText(/^(Reply|Copy Link|View Source|React)$/)
          .first()
          .waitFor({ timeout: T });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      },
    ],
    [
      "a sender's profile",
      async () => {
        // from the avatar: a click on the name mentions them in the composer
        await page
          .locator('[data-message-id] button[data-user-id="@bob:localhost"]')
          .filter({ hasNotText: 'bob' })
          .last()
          .click();
        await page
          .getByText(/Mutual Rooms/)
          .first()
          .waitFor({ timeout: T });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        if (
          await page
            .getByText(/Mutual Rooms/)
            .first()
            .isVisible()
        ) {
          throw new Error('Escape did not close the profile');
        }
      },
    ],
    [
      'another room',
      async () => {
        if (mobile) {
          // back to the space's room list, as the header's back arrow does
          await page.locator('header button').first().click();
        }
        await page
          .getByRole('link', { name: /Random/ })
          .first()
          .click();
        await page.waitForURL(RANDOM, { timeout: T });
        await page.getByText('Random chatter', { exact: true }).waitFor({ timeout: T });
      },
    ],
    [
      'back and forward',
      async () => {
        await page.goBack();
        if (mobile) await page.goBack();
        await page.waitForURL(GENERAL, { timeout: T });
        await page.getByText(sent, { exact: true }).last().waitFor({ timeout: T });
        await page.goForward();
        if (mobile) await page.goForward();
        await page.waitForURL(RANDOM, { timeout: T });
        await page.getByText('Random chatter', { exact: true }).waitFor({ timeout: T });
      },
    ],
    [
      "the space's tab reopens its last room",
      async () => {
        if (mobile) return; // a phone has no rail
        await page.goto(`${base}/home/`);
        await page.getByText('bob', { exact: true }).first().waitFor({ timeout: 30000 });
        await page.locator('button', { hasText: /^Te$/ }).first().click();
        await page.waitForURL(RANDOM, { timeout: T });
        await page.getByText('Random chatter', { exact: true }).waitFor({ timeout: T });
      },
    ],
    [
      "the space's lobby",
      async () => {
        await page.goto(`${SPACE}/lobby/`);
        await page.getByText('General topic').first().waitFor({ timeout: T });
      },
    ],
    [
      'a DM',
      async () => {
        await page.goto(`${base}/direct/`);
        await page.getByRole('link', { name: /bob/ }).first().click();
        await page
          .getByText('Hey Alice, a direct message', { exact: true })
          .waitFor({ timeout: T });
      },
    ],
    [
      'the inbox has the mention',
      async () => {
        await page.goto(`${base}/inbox/notifications/`);
        await page.getByText(/^hi /).first().waitFor({ timeout: T });
      },
    ],
    [
      'explore',
      async () => {
        await page.goto(`${base}/explore/`);
        await page.waitForURL(/\/explore\//, { timeout: T });
        await page.waitForTimeout(1500);
      },
    ],
    [
      'settings',
      async () => {
        await page.goto(`${base}/home/`);
        await page.getByText('bob', { exact: true }).first().waitFor({ timeout: 30000 });
        if (mobile) await page.goto(`${base}/you/`);
        // alice's avatar at the foot of the rail; CSS shows the lowercase `a` as `A`
        else await page.locator('button', { hasText: /^a$/i }).last().click();
        await page
          .getByText(/Settings|Account|Profile/)
          .first()
          .waitFor({ timeout: T });
      },
    ],
  ];

  for (const [name, fn] of steps) {
    msgs.length = 0;
    let error;
    try {
      await fn();
    } catch (e) {
      error = e;
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(shots, `${form}-${shotName(name)}`) });
    report(`walk ${form} ${name}`, error, msgs);
  }
  await ctx.close();
};

await walk('desktop');
await walk('mobile');
await browser.close();

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
