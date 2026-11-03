// End-to-end checks for matrix: links (mouseion/iris#69): the shell offscreen with a throwaway
// profile on a private session bus, a page that subscribes to openLink late (as the app does after
// it has signed in), driven over the Chrome DevTools Protocol. Nothing reaches the real desktop.
//   run by run.sh, inside dbus-run-session:  IRIS_BIN=<build>/iris node links.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const A = 18121, CDP = 19335;
const tmp = mkdtempSync(join(tmpdir(), 'iris-e2e-links-'));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* retry */ } await sleep(100); } return null; };

// The page subscribes to openLink only after a delay (the app does so once signed in); ?now subscribes at once.
const page_ = `<title>Iris test page</title><script>
  window.__ev = []; window.__other = [];
  const subscribe = () => { irisDesktop.on('openLink', (e) => __ev.push(e)); irisDesktop.on('openRoom', (e) => __other.push(e)); };
  if (location.search === '?now') subscribe(); else setTimeout(subscribe, Number(localStorage.getItem('delay') || 2500));
</script>`;
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page_); });
server.listen(A, '127.0.0.1');

const apps = new Set();
let out = '';
function launch(args = [], startPath = '/') {
  const p = spawn(process.env.IRIS_BIN, args, {
    env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_FORCE_STDERR_LOGGING: '1', QTWEBENGINE_REMOTE_DEBUGGING: String(CDP), QTWEBENGINE_CHROMIUM_FLAGS: '--no-sandbox',
      XDG_DATA_HOME: join(tmp, 'data'), XDG_CACHE_HOME: join(tmp, 'cache'), XDG_CONFIG_HOME: join(tmp, 'config'),
      IRIS_SHELL_ALLOWED_ORIGIN: `http://127.0.0.1:${A}`, IRIS_SHELL_START_URL: `http://127.0.0.1:${A}${startPath}`, IRIS_SHELL_COLOR_SCHEME: 'dark' },
  });
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  apps.add(p);
  return p;
}
const exited = (p) => new Promise((r) => (p.exitCode !== null ? r(p.exitCode) : p.on('exit', r)));

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
const links = (page) => page.evaluate(() => window.__ev);
const count = (needle) => out.split(needle).length - 1;

const roomLink = 'matrix:r/kitchen:example.org/e/ev1?via=example.org&via=alt.example.org&action=join';
const roomPayload = { kind: 'alias', id: '#kitchen:example.org', eventId: '$ev1', via: ['example.org', 'alt.example.org'], action: 'join' };
const userPayload = { kind: 'user', id: '@sam:example.org', action: 'chat' };

try {
  // 1. Cold start with a link: held until the page is up and listening, then delivered once.
  let app = launch([roomLink]);
  let page = await connect();
  await until(() => page.evaluate(() => typeof window.irisDesktop?.on === 'function'));
  check('a link on the command line shows the window', !!(await until(() => out.includes('IRIS_STATE links-opened=1'))));
  await sleep(500);
  check('before the page listens, nothing is delivered', (await links(page)).length === 0);
  const first = await until(async () => (await links(page)).length > 0 && (await links(page)));
  check('cold start: the page gets openLink once it listens', isDeepStrictEqual(first, [roomPayload]), JSON.stringify(first));
  await sleep(1500);
  check('and only once', (await links(page)).length === 1);
  check('openRoom is not used for links', (await page.evaluate(() => window.__other)).length === 0);

  // 2. A second launch with a link: handed to the first instance and delivered.
  const second = launch(['matrix:u/sam:example.org?action=chat']);
  check('second launch exits at once', (await Promise.race([exited(second), sleep(15000).then(() => 'timeout')])) === 0);
  const got = await until(async () => (await links(page)).length > 1 && (await links(page)));
  check('second launch: the first instance delivers the user link', isDeepStrictEqual(got?.[1], userPayload), JSON.stringify(got));
  check('the window was shown for it', count('IRIS_STATE links-opened=1') === 2);

  // 3. Invalid links are dropped: logged, nothing sent, nothing shown.
  const before = count('IRIS_STATE links-opened');
  for (const bad of ['matrix://evil.example/u/sam:example.org', 'https://matrix.to/#/@sam:example.org', 'matrix:u/sam:example.org?action=join', 'matrix:r/a%00b:example.org', 'javascript:alert(1)']) {
    const p = launch([bad]);
    await Promise.race([exited(p), sleep(15000)]);
  }
  await sleep(1000);
  check('five invalid links: each logged as dropped', count('Dropped matrix: link') === 5, String(count('Dropped matrix: link')));
  check('and none shown, none sent', count('IRIS_STATE links-opened') === before && (await links(page)).length === 2, JSON.stringify(await links(page)));
  // Valid and invalid together: the valid one goes through.
  const mixed = launch(['matrix:u/x%zz:example.org', 'matrix:u/kim:example.org']);
  await Promise.race([exited(mixed), sleep(15000)]);
  const afterMixed = await until(async () => (await links(page)).length > 2 && (await links(page)));
  check('a valid link beside an invalid one is delivered, the invalid one is not', afterMixed?.length === 3 && afterMixed[2].id === '@kim:example.org', JSON.stringify(afterMixed?.slice(2)));
  page.close(); app.kill(); await exited(app); await sleep(1000);

  // 4. A link that arrives while the page is up but nobody listens yet is held for the first listener.
  app = launch([]);
  page = await connect();
  await until(() => page.evaluate(() => typeof window.irisDesktop?.on === 'function'));
  await page.evaluate(() => localStorage.setItem('delay', '4000'));
  page.evaluate(() => location.reload()).catch(() => {});
  await sleep(1000);
  const late = launch(['matrix:u/sam:example.org']);
  await Promise.race([exited(late), sleep(15000)]);
  await sleep(500);
  page = await connect();
  check('page up, nobody listening: nothing yet', (await links(page)).length === 0);
  const heldGot = await until(async () => (await links(page)).length > 0 && (await links(page)), 20000);
  check('page up, nobody listening: the first listener gets it, once', isDeepStrictEqual(heldGot, [{ kind: 'user', id: '@sam:example.org' }]), JSON.stringify(heldGot));
  page.close(); app.kill(); await exited(app); await sleep(1000);

  // 5. Cold start with an invalid link: dropped, nothing sent.
  const dropsBefore = count('Dropped matrix: link');
  app = launch(['matrix://evil.example/u/sam:example.org'], '/?now');
  page = await connect();
  await sleep(2500);
  check('cold start with an invalid link: logged, nothing sent to the page', count('Dropped matrix: link') === dropsBefore + 1 && (await links(page)).length === 0);
  page.close(); app.kill(); await exited(app);
  // 6. --hidden (autostart) with a link on the same command line: the link shows the window, once.
  const visibleSince = (mark) => { const m = [...out.slice(mark).matchAll(/IRIS_STATE visible=(true|false)/g)]; return m.length ? m.at(-1)[1] === 'true' : null; };
  let mark = out.length;
  app = launch(['--hidden'], '/?now');
  page = await connect();
  await sleep(2500);
  check('--hidden alone stays in the tray: the window is not shown', visibleSince(mark) !== true, String(visibleSince(mark)));
  app.kill(); await exited(app); await sleep(1000);

  mark = out.length;
  app = launch(['--hidden', 'matrix:u/sam:example.org'], '/?now');
  page = await connect();
  check('--hidden plus a link: the window is shown', !!(await until(() => visibleSince(mark) === true)), String(visibleSince(mark)));
  const hiddenGot = await until(async () => (await links(page)).length > 0 && (await links(page)));
  await sleep(1500);
  check('--hidden plus a link: the link is delivered once', isDeepStrictEqual(hiddenGot, [{ kind: 'user', id: '@sam:example.org' }]) && (await links(page)).length === 1, JSON.stringify(await links(page)));
  page.close(); app.kill(); await exited(app); await sleep(1000);

  // 7. Running hidden in the tray: a second launch with a link shows the window and delivers it.
  mark = out.length;
  app = launch(['--hidden'], '/?now');
  page = await connect();
  await until(() => page.evaluate(() => typeof window.irisDesktop?.on === 'function'));
  await sleep(1500);
  check('running hidden: the window is not shown', visibleSince(mark) !== true, String(visibleSince(mark)));
  const viaTray = launch([roomLink]);
  check('second launch with a link exits at once', (await Promise.race([exited(viaTray), sleep(15000).then(() => 'timeout')])) === 0);
  check('running hidden: the link shows the window', !!(await until(() => visibleSince(mark) === true)), String(visibleSince(mark)));
  const trayGot = await until(async () => (await links(page)).length > 0 && (await links(page)));
  await sleep(1000);
  check('running hidden: the link is delivered once', isDeepStrictEqual(trayGot, [roomPayload]) && (await links(page)).length === 1, JSON.stringify(await links(page)));
  // Closed to the tray from a shown window (SIGUSR1 stands in for the close button): same again.
  app.kill('SIGUSR1');
  check('the window closes to the tray', !!(await until(() => visibleSince(mark) === false)));
  const again = launch(['matrix:u/kim:example.org']);
  await Promise.race([exited(again), sleep(15000)]);
  check('closed to the tray: a link shows the window again and is delivered', !!(await until(() => visibleSince(mark) === true)) && !!(await until(async () => (await links(page)).length === 2)) && (await links(page))[1].id === '@kim:example.org', JSON.stringify(await links(page)));
  // A second launch without a link, or with an invalid one, while hidden: invalid sends nothing.
  app.kill('SIGUSR1');
  await until(() => visibleSince(mark) === false);
  const bad = launch(['--', 'matrix://evil.example/u/sam:example.org']);
  await Promise.race([exited(bad), sleep(15000)]);
  await sleep(1000);
  check('an invalid link sends nothing to the page', (await links(page)).length === 2);
  page.close(); app.kill(); await exited(app);
} catch (e) {
  console.log('FAIL  e2e crashed', e);
  results.push(false);
} finally {
  for (const p of apps) p.kill();
  server.closeAllConnections(); server.close();
}
if (process.env.E2E_VERBOSE) console.log(out);
console.log(`${results.filter(Boolean).length}/${results.length} link checks passed`);
process.exit(results.every(Boolean) && results.length ? 0 : 1);
