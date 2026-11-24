#!/usr/bin/env node
// End-to-end checks of a test build ("Iris Test.app", TEST_HOOKS=1 build.sh) on a Mac with a
// logged-in desktop session (it opens a window; CI's runner user has none, so this is run by hand):
//
//   node desktop-macos/tests/e2e/run.mjs "/path/to/Iris Test.app"
//
// Two local servers stand in for Iris (origin A, the allowed one) and another site (origin B). The
// page on A drives the bridge and reports what it saw to the server; the shell writes IRIS_STATE
// lines to a file (IRIS_SHELL_STATE_LOG) and the URLs it would hand to the browser to another
// (IRIS_SHELL_OPEN_LOG), so nothing is launched. Checks: the bridge on A and its absence in a
// frame from B, setUnread and the badge, notify / closeNotifications and their refusals (an icon
// that does not decode included), colorScheme, links and window.open going to the opener, file:
// not opened, matrix: links on a cold start and while running (and a bad one dropped), one
// instance, localStorage surviving a relaunch, and the offline page clearing by itself.
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const app = process.argv[2];
if (!app || !existsSync(app)) {
  console.error('usage: run.mjs "/path/to/Iris Test.app"');
  process.exit(2);
}
const bundleId = 'house.mouseion.iris.test';
const dir = mkdtempSync(join(tmpdir(), 'iris-e2e-'));
const stateLog = join(dir, 'state.log');
const openLog = join(dir, 'open.log');

let reports = [];
const tinyPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGNoDTv/Hx9mGBkKAJJBqkHcSxIAAAAAAElFTkSuQmCC';

// Whole chunks with good CRCs, but its IDAT is not image data: only the decoder can tell.
const garbledPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVRub3QgemxpYiBkYXRhIGF0IGFsbCK0NhEAAAAASUVORK5CYII=';

const page = (b) => `<!doctype html><meta charset="utf-8"><title>E2E page</title>
<body><script>
const report = (kind, data) => fetch('/report', { method: 'POST', body: JSON.stringify({ kind, data }) });
const outcome = async (p) => { try { await p; return 'ok'; } catch (e) { return 'rejected'; } };
(async () => {
  const d = window.irisDesktop;
  report('bridge', { present: typeof d, frozen: d ? Object.isFrozen(d) : null });
  if (!d) return;
  d.on('colorScheme', (p) => report('colorScheme', p));
  const linkDelay = Number(new URLSearchParams(location.search).get('linkDelay') || 0);
  setTimeout(() => d.on('openLink', (p) => report('openLink', p)), linkDelay);
  report('version', await d.version());
  report('setUnread', {
    good: await outcome(d.setUnread({ total: 3, highlight: 1 })),
    highAboveTotal: await outcome(d.setUnread({ total: 1, highlight: 2 })),
    string: await outcome(d.setUnread({ total: '3', highlight: 0 })),
  });
  const n = { id: '$e1', roomId: '!room:example.org', eventId: '$e1', title: 'E2E', body: 'hello' };
  const good = 'data:image/png;base64,${tinyPng}';
  report('notify', {
    good: await outcome(d.notify({ ...n, canReply: true })),
    icon: await outcome(d.notify({ ...n, id: '$e2', icon: good })),
    iconCutShort: await outcome(d.notify({ ...n, id: '$e3', icon: good.slice(0, 78) + 'AAAAAAAA' })),
    iconThatDoesNotDecode: await outcome(d.notify({ ...n, id: '$e4', icon: 'data:image/png;base64,${garbledPng}' })),
    badRoom: await outcome(d.notify({ ...n, roomId: 'room' })),
    extraKey: await outcome(d.notify({ ...n, path: '/etc/passwd' })),
    close: await outcome(d.closeNotifications({ roomId: '!room:example.org' })),
    closeBad: await outcome(d.closeNotifications({ roomId: 3 })),
  });
  const count = Number(localStorage.getItem('e2e-counter') || 0) + 1;
  localStorage.setItem('e2e-counter', String(count));
  report('counter', count);
  const frame = document.createElement('iframe');
  frame.src = '${b}/frame';
  document.body.appendChild(frame);
  setTimeout(() => {
    window.open('https://example.com/e2e-window-open');
    setTimeout(() => { location.href = 'file:///etc/passwd'; }, 300);
    setTimeout(() => { location.href = 'https://example.com/e2e-navigation'; }, 600);
    setTimeout(() => report('ready', true), 900);
  }, 500);
})();
</script>`;

const framePage = (a) => `<!doctype html><script>
(async () => {
  const r = { irisDesktop: typeof window.irisDesktop };
  const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.irisDesktop;
  if (!h) r.direct = 'no handler';
  else try { await h.postMessage({ method: 'version', args: '[]' }); r.direct = 'answered'; } catch (e) { r.direct = 'refused'; }
  fetch('${a}/report', { method: 'POST', body: JSON.stringify({ kind: 'frame', data: r }) });
})();
</script>`;

function serve(handler) {
  return new Promise((resolve) => {
    const s = createServer(handler);
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

const B = await serve((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(framePage(A_ORIGIN));
});
// Origin B is "localhost", origin A "127.0.0.1": two hosts, two origins.
const B_ORIGIN = `http://localhost:${B.address().port}`;
let A_ORIGIN = '';
function aHandler(req, res) {
  if (req.method === 'POST' && req.url === '/report') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        reports.push(JSON.parse(body));
      } catch {}
      res.writeHead(204, { 'access-control-allow-origin': '*' });
      res.end();
    });
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(page(B_ORIGIN));
}
let A = await serve(aHandler);
A_ORIGIN = `http://127.0.0.1:${A.address().port}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
async function until(what, test, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = test();
    if (v) return v;
    await sleep(200);
  }
  throw new Error(
    `timed out waiting for ${what}\nstate:\n${read(stateLog)}\nreports:\n${JSON.stringify(
      reports,
      null,
      1
    )}`
  );
}
// Key order does not matter.
const sorted = (v) =>
  Array.isArray(v)
    ? v.map(sorted)
    : v && typeof v === 'object'
    ? Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, sorted(v[k])])
      )
    : v;
const sameJSON = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const report = (kind) => reports.filter((r) => r.kind === kind).map((r) => r.data);
const lastReport = (kind) => report(kind).at(-1);

let failures = 0;
let passes = 0;
function check(name, ok, detail = '') {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

function launch(startUrl, args = [], extraEnv = {}, newInstance = false) {
  const env = {
    IRIS_SHELL_START_URL: startUrl,
    IRIS_SHELL_ALLOWED_ORIGIN: A_ORIGIN,
    IRIS_SHELL_STATE_LOG: stateLog,
    IRIS_SHELL_OPEN_LOG: openLog,
    IRIS_SHELL_COLOR_SCHEME: 'dark',
    IRIS_SHELL_RETRY_MS: '1000',
    ...extraEnv,
  };
  const flags = Object.entries(env).flatMap(([k, v]) => ['--env', `${k}=${v}`]);
  execFileSync('open', [...(newInstance ? ['-n'] : []), ...flags, '-a', app, ...args]);
}
function quit() {
  try {
    execFileSync('osascript', ['-e', `tell application id "${bundleId}" to quit`]);
  } catch {}
}
async function waitQuit() {
  await until('the app to quit', () => {
    try {
      execFileSync('pgrep', ['-f', `${app}/Contents/MacOS/Iris`]);
      return false;
    } catch {
      return true;
    }
  });
}

try {
  quit();
  await waitQuit();

  // 1. A cold start with a matrix: link; the page listens for links only after 2 s.
  launch(`${A_ORIGIN}/?linkDelay=2000`, [
    'matrix:r/us:example.org/e/ev1?via=example.org&action=join',
  ]);
  await until('the page to report ready', () => lastReport('ready'));
  const bridge = lastReport('bridge');
  check(
    'bridge present on the allowed origin',
    bridge?.present === 'object' && bridge?.frozen === true,
    JSON.stringify(bridge)
  );
  check(
    'version() answers',
    typeof lastReport('version') === 'string' && lastReport('version').length > 0
  );
  const su = lastReport('setUnread');
  check(
    'setUnread takes good counts, refuses bad',
    su?.good === 'ok' && su?.highAboveTotal === 'rejected' && su?.string === 'rejected',
    JSON.stringify(su)
  );
  check('the Dock badge says 3', read(stateLog).includes('IRIS_STATE badge=3 highlight=1'));
  const nt = lastReport('notify');
  check(
    'notify takes good ones, refuses bad (an icon that does not decode included)',
    nt?.good === 'ok' &&
      nt?.icon === 'ok' &&
      nt?.iconCutShort === 'rejected' &&
      nt?.iconThatDoesNotDecode === 'rejected' &&
      nt?.badRoom === 'rejected' &&
      nt?.extraKey === 'rejected' &&
      nt?.close === 'ok' &&
      nt?.closeBad === 'rejected',
    JSON.stringify(nt)
  );
  check(
    'colorScheme delivered',
    sameJSON(lastReport('colorScheme'), { dark: true }),
    JSON.stringify(report('colorScheme'))
  );
  const link = await until('the cold-start link', () => lastReport('openLink'), 10000).catch(
    () => undefined
  );
  check(
    'a link on a cold start waits for the page and arrives once',
    sameJSON(link, {
      kind: 'alias',
      id: '#us:example.org',
      eventId: '$ev1',
      via: ['example.org'],
      action: 'join',
    }) && report('openLink').length === 1,
    JSON.stringify(report('openLink'))
  );
  const frame = await until('the frame from origin B', () => lastReport('frame'), 10000).catch(
    () => undefined
  );
  check(
    'no bridge in a frame from another origin, and direct calls refused',
    frame?.irisDesktop === 'undefined' && frame?.direct !== 'answered',
    JSON.stringify(frame)
  );
  await until(
    'the navigation to reach the opener',
    () => read(openLog).includes('e2e-navigation'),
    5000
  ).catch(() => {});
  const opened = read(openLog);
  check(
    'window.open goes to the browser',
    opened.includes('https://example.com/e2e-window-open'),
    opened
  );
  check(
    'a navigation to another site goes to the browser',
    opened.includes('https://example.com/e2e-navigation'),
    opened
  );
  check('file: is neither shown nor opened', !opened.includes('file:'), opened);

  // 2. While running: a good link is an event at once, a bad one is dropped.
  const before = report('openLink').length;
  launch(`${A_ORIGIN}/`, ['matrix:u/alice:example.org?action=chat']);
  launch(`${A_ORIGIN}/`, ['matrix://evil/u/a:b.org']);
  await until('the second link', () => report('openLink').length > before, 10000).catch(() => {});
  await sleep(1000);
  const links = report('openLink').slice(before);
  check(
    'a link while running arrives once; a bad one is dropped',
    links.length === 1 && links[0].id === '@alice:example.org' && links[0].action === 'chat',
    JSON.stringify(links)
  );

  // 3. One instance: a second copy hands over and quits.
  launch(`${A_ORIGIN}/`, [], {}, true);
  await until(
    'the second copy to stand down',
    () => read(stateLog).includes('IRIS_STATE already-running'),
    15000
  ).catch(() => {});
  check(
    'a second copy hands over to the first',
    read(stateLog).includes('IRIS_STATE already-running')
  );

  // 4. Relaunch: localStorage survives.
  quit();
  await waitQuit();
  reports = reports.filter((r) => r.kind !== 'counter' && r.kind !== 'ready');
  const firstCount = 1;
  launch(`${A_ORIGIN}/`);
  await until('the page after a relaunch', () => lastReport('ready'));
  check(
    'localStorage survives a relaunch',
    lastReport('counter') > firstCount,
    String(lastReport('counter'))
  );
  quit();
  await waitQuit();

  // 5. Offline: the server is gone at start; the offline page clears by itself once it is back.
  const port = A.address().port;
  await new Promise((r) => A.close(r));
  A.closeAllConnections?.();
  launch(`${A_ORIGIN}/`);
  await until(
    'the offline page',
    () => read(stateLog).includes('IRIS_STATE offline=true'),
    20000
  ).catch(() => {});
  check(
    'the offline page shows when Iris cannot be reached',
    read(stateLog).includes('IRIS_STATE offline=true')
  );
  reports = [];
  A = createServer(aHandler);
  await new Promise((r) => A.listen(port, '127.0.0.1', r));
  await until(
    'the page to come back',
    () => read(stateLog).includes('IRIS_STATE offline=false') && lastReport('ready'),
    20000
  ).catch(() => {});
  check(
    'the offline page clears by itself',
    read(stateLog).includes('IRIS_STATE offline=false') && !!lastReport('ready')
  );
} catch (e) {
  failures++;
  console.log(`FAIL ${e.message}`);
} finally {
  quit();
  A.close();
  B.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  console.log(`state log:\n${read(stateLog)}`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}
