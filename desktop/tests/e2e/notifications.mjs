// End-to-end checks for notifications (mouseion/iris#68): the shell offscreen, a fake
// org.freedesktop.Notifications (tests/fakenotifyd) on the private session bus, a page driving
// irisDesktop over the Chrome DevTools Protocol. Nothing reaches the real desktop.
//   run by run.sh, inside dbus-run-session:  IRIS_BIN=<build>/iris node notifications.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const A = 18111, CDP = 19334;
const tmp = mkdtempSync(join(tmpdir(), 'iris-e2e-notify-'));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* retry */ } await sleep(100); } return null; };

// The notifyrc as the package installs it: <XDG_DATA_DIRS>/knotifications6/house.mouseion.iris.notifyrc
const dataDirs = join(tmp, 'share');
mkdirSync(join(dataDirs, 'knotifications6'), { recursive: true });
copyFileSync(join(here, '..', '..', 'house.mouseion.iris.notifyrc'), join(dataDirs, 'knotifications6', 'house.mouseion.iris.notifyrc'));

const fakeBin = process.env.IRIS_FAKE_NOTIFYD || join(dirname(process.env.IRIS_BIN), 'tests', 'fakenotifyd');
const page_ = `<title>Iris test page</title><script>
  window.__ev = [];
  irisDesktop.on('openRoom', (e) => __ev.push(['openRoom', e]));
  irisDesktop.on('reply', (e) => __ev.push(['reply', e]));
</script>`;
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page_); });
server.listen(A, '127.0.0.1');

const apps = new Set();
let out = '';
function launch() {
  const p = spawn(process.env.IRIS_BIN, [], {
    env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_FORCE_STDERR_LOGGING: '1', QTWEBENGINE_REMOTE_DEBUGGING: String(CDP), QTWEBENGINE_CHROMIUM_FLAGS: '--no-sandbox',
      XDG_DATA_HOME: join(tmp, 'data'), XDG_CACHE_HOME: join(tmp, 'cache'), XDG_CONFIG_HOME: join(tmp, 'config'), XDG_DATA_DIRS: dataDirs,
      IRIS_SHELL_ALLOWED_ORIGIN: `http://127.0.0.1:${A}`, IRIS_SHELL_START_URL: `http://127.0.0.1:${A}/`, IRIS_SHELL_COLOR_SCHEME: 'dark' },
  });
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  apps.add(p);
  return p;
}
const exited = (p) => new Promise((r) => (p.exitCode !== null ? r(p.exitCode) : p.on('exit', r)));

let fakeSeq = 0;
function startFake(...flags) {
  const log = join(tmp, `fake-${++fakeSeq}.log`);
  writeFileSync(log, '');
  const p = spawn(fakeBin, ['--log', log, ...flags], { stdio: ['pipe', 'inherit', 'inherit'] });
  apps.add(p);
  const lines = () => readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { p, lines, notifies: () => lines().filter((l) => l.event === 'Notify'), closes: () => lines().filter((l) => l.event === 'CloseNotification'), say: (cmd) => p.stdin.write(cmd + '\n') };
}

// A minimal CDP client (Playwright's connectOverCDP needs browser-context calls QtWebEngine lacks).
async function connect() {
  const target = await until(async () => (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${A}/`)));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return {
    close: () => ws.close(),
    evaluate: async (fn, arg) => {
      const r = await send('Runtime.evaluate', { expression: `(${fn})(${JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate failed');
      return r.result?.result?.value;
    },
  };
}

const note = (extra = {}) => ({ id: '$e1', roomId: '!kitchen:example.org', eventId: '$e1', title: 'Kitchen', body: 'New inbox notification from Sam', ...extra });
const notify = (page, n) => page.evaluate((x) => window.irisDesktop.notify(x).then(() => 'ok', (e) => 'rejected: ' + e.message), n);
const events = (page) => page.evaluate(() => window.__ev);
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

try {
  // 1. A server with inline reply.
  let fake = startFake();
  await until(() => fake.lines().some((l) => l.event === 'ready'));
  let app = launch();
  let page = await connect();
  await until(() => page.evaluate(() => typeof window.irisDesktop?.notify === 'function'));
  await sleep(1000); // KNotification learns the server's capabilities

  check('notify resolves', (await notify(page, note())) === 'ok');
  const first = await until(() => fake.notifies()[0]);
  check('a Notify call arrives with the title and the (escaped) body', first?.summary === 'Kitchen' && first.body === 'New inbox notification from Sam', JSON.stringify(first));
  check('it belongs to the house.mouseion.iris component and its message event', first?.hints['x-kde-appname'] === 'house.mouseion.iris' && first.hints['x-kde-eventId'] === 'message', JSON.stringify(first?.hints));
  check('it has the default action and the inline reply', first?.actions.includes('default') && first.actions.includes('inline-reply'), JSON.stringify(first?.actions));
  check('the reply placeholder names the room', first?.hints['x-kde-reply-placeholder-text'] === 'Reply to Kitchen', first?.hints['x-kde-reply-placeholder-text']);

  await notify(page, note({ id: '$e2', eventId: '$e2', body: '<b>x</b> & y', icon: tinyPng }));
  const second = await until(() => fake.notifies()[1]);
  check('the avatar becomes the notification image, and markup in a body is escaped', second && 'image_data' in second.hints && second.body === '&lt;b&gt;x&lt;/b&gt; &amp; y', JSON.stringify(second && Object.keys(second.hints)));
  await notify(page, note({ id: 'b1', roomId: '!other:example.org', eventId: '$b1', title: 'Garage' }));
  await until(() => fake.notifies().length === 3);

  // Bad arguments are refused and show nothing.
  const refusals = [
    await notify(page, note({ roomId: 'not-a-room' })),
    await notify(page, note({ icon: 'https://example.org/a.png' })),
    await notify(page, note({ title: '' })),
    await notify(page, { ...note(), path: '/etc/passwd' }),
  ];
  await sleep(500);
  check('bad notify arguments are rejected and show nothing', refusals.every((r) => r.startsWith('rejected')) && fake.notifies().length === 3, JSON.stringify(refusals));

  // A click: the window is raised and the page learns of it.
  const id1 = first.id;
  fake.say(`action ${id1} default`);
  const ev1 = await until(async () => (await events(page)).length > 0 && (await events(page)));
  check('clicking the popup gives the page openRoom { roomId, eventId }', isDeepStrictEqual(ev1, [['openRoom', { roomId: '!kitchen:example.org', eventId: '$e1' }]]), JSON.stringify(ev1));
  check('and the shell brought the window forward', out.includes('IRIS_STATE notification-activated'));

  // A reply typed in the popup.
  fake.say(`reply ${second.id} on my way, 5 minutes`);
  const ev2 = await until(async () => (await events(page)).length > 1 && (await events(page)));
  check('replying in the popup gives the page reply { roomId, eventId, text }', isDeepStrictEqual(ev2?.[1], ['reply', { roomId: '!kitchen:example.org', eventId: '$e2', text: 'on my way, 5 minutes' }]), JSON.stringify(ev2));

  // Events are one-shot: a handler added later is not told about old clicks.
  const late = await page.evaluate(() => new Promise((resolve) => { const got = []; irisDesktop.on('openRoom', (e) => got.push(e)); setTimeout(() => resolve(got), 500); }));
  check('a handler added later does not get old openRoom events replayed', late.length === 0, JSON.stringify(late));

  // Reading the room closes its notifications, not other rooms'.
  await sleep(500);
  const closeResult = await page.evaluate(() => window.irisDesktop.closeNotifications({ roomId: '!kitchen:example.org' }).then(() => 'ok', (e) => 'rejected'));
  const closed = await until(() => fake.closes().length >= 1 && fake.closes());
  await sleep(500);
  const closedIds = fake.closes().map((c) => c.id);
  check('closeNotifications closes the ids of that room only', closeResult === 'ok' && closedIds.includes(second.id) && !closedIds.includes(fake.notifies()[2].id), JSON.stringify(closedIds));
  const badClose = await page.evaluate(() => window.irisDesktop.closeNotifications({ roomId: 'x' }).then(() => 'ok', () => 'rejected'));
  check('closeNotifications with a bad room is rejected', badClose === 'rejected');

  page.close(); app.kill(); await exited(app);
  fake.p.kill(); await exited(fake.p);

  // 2. A server without inline reply: a plain notification that still opens the room.
  fake = startFake('--no-inline-reply');
  await until(() => fake.lines().some((l) => l.event === 'ready'));
  app = launch();
  page = await connect();
  await until(() => page.evaluate(() => typeof window.irisDesktop?.notify === 'function'));
  await sleep(1000);
  await notify(page, note());
  const plain = await until(() => fake.notifies()[0]);
  check('without server support there is no inline reply, only the default action', plain && plain.actions.includes('default') && !plain.actions.includes('inline-reply'), JSON.stringify(plain?.actions));
  fake.say(`action ${plain.id} default`);
  check('and a click still opens the room', !!(await until(async () => (await events(page)).length === 1)));
  page.close();
} catch (e) {
  console.log('FAIL  e2e crashed', e);
  results.push(false);
} finally {
  for (const p of apps) p.kill();
  server.closeAllConnections(); server.close();
}
if (process.env.E2E_VERBOSE) console.log(out);
console.log(`${results.filter(Boolean).length}/${results.length} notification checks passed`);
process.exit(results.every(Boolean) && results.length ? 0 : 1);
