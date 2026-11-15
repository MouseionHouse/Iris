import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const A = 18101,
  B = 18102,
  CDP = 19333;
const tmp = mkdtempSync(join(tmpdir(), 'iris-e2e-'));
const openLog = join(tmp, 'opened.log');
writeFileSync(openLog, '');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastError;
const until = async (fn, ms = 20000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      lastError = e;
    }
    await sleep(150);
  }
  if (lastError) console.log('until: last error', String(lastError).split('\n')[0]);
  return null;
};

function serve(port, body) {
  const server = http.createServer((req, res) => {
    // A page of a signed-out Iris: reports no unread as soon as it loads.
    if (req.url === '/signedout') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(
        '<title>Signed out</title><script>window.irisDesktop.setUnread({ total: 0, highlight: 0 })</script>'
      );
    }
    if (req.url === '/redirect') {
      res.writeHead(302, { location: `http://127.0.0.1:${B}/landed` });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(body);
  });
  server.listen(port, '127.0.0.1');
  return {
    stop: () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
    start: () => server.listen(port, '127.0.0.1'),
  };
}
const pageA = `<title>Iris test page</title><a id=ext href="http://127.0.0.1:${B}/ext">ext</a>
<a id=blank target=_blank href="http://127.0.0.1:${B}/blank">blank</a>`;
const srvA = serve(A, pageA);
const srvB = serve(B, '<title>Other page</title><p>other</p>');

let out = '';
const apps = new Set();
function launch(startUrl, scheme = 'dark', args = []) {
  const p = spawn(process.env.IRIS_BIN, args, {
    env: {
      ...process.env,
      QT_QPA_PLATFORM: 'offscreen',
      QT_FORCE_STDERR_LOGGING: '1',
      QTWEBENGINE_REMOTE_DEBUGGING: String(CDP),
      QTWEBENGINE_CHROMIUM_FLAGS: '--no-sandbox',
      XDG_DATA_HOME: join(tmp, 'data'),
      XDG_CACHE_HOME: join(tmp, 'cache'),
      XDG_CONFIG_HOME: join(tmp, 'config'),
      IRIS_SHELL_ALLOWED_ORIGIN: `http://127.0.0.1:${A}`,
      IRIS_SHELL_START_URL: startUrl,
      IRIS_SHELL_OPEN_LOG: openLog,
      IRIS_SHELL_RETRY_MS: '1000',
      IRIS_SHELL_COLOR_SCHEME: scheme,
    },
  });
  p.stdout.on('data', (d) => {
    out += d;
  });
  p.stderr.on('data', (d) => {
    out += d;
  });
  apps.add(p);
  return p;
}
const exited = (p) => new Promise((r) => (p.exitCode !== null ? r(p.exitCode) : p.on('exit', r)));
// A minimal CDP client: Playwright's connectOverCDP needs browser-context calls QtWebEngine lacks.
async function connect(match) {
  const target = await until(async () =>
    (
      await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()
    ).find((t) => t.type === 'page' && t.url.startsWith(match))
  );
  if (!target) return { page: null };
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const page = {
    // Runs a function in the page (with a user gesture) and returns its value; a page that goes away mid-call returns undefined.
    evaluate: async (fn, arg) => {
      const r = await send('Runtime.evaluate', {
        expression: `(${fn})(${JSON.stringify(arg)})`,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (r.result?.exceptionDetails)
        throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate failed');
      return r.result?.result?.value;
    },
    click: (sel) => page.evaluate((s) => document.querySelector(s).click(), sel),
    url: async () =>
      (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.id === target.id)
        ?.url,
    count: async () =>
      (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).filter((t) => t.type === 'page')
        .length,
  };
  return { page, browser: { close: async () => ws.close() } };
}
// The launcher entry signals on the private bus, as Plasma would see them.
const monitor = spawn('dbus-monitor', [
  '--session',
  "type='signal',interface='com.canonical.Unity.LauncherEntry'",
]);
let bus = '';
monitor.stdout.on('data', (d) => {
  bus += d;
});
const signals = () => bus.split(/(?=^signal )/m).filter((s) => s.startsWith('signal'));
const opened = () => readFileSync(openLog, 'utf8').split('\n').filter(Boolean);

try {
  // 1. Iris origin: the bridge answers; external links go to the browser; the view stays put.
  let app = launch(`http://127.0.0.1:${A}/`);
  let { browser, page } = await connect(`http://127.0.0.1:${A}/`);
  check('app loads the start page', !!page);
  check(
    'irisDesktop.version() resolves on the allowed origin',
    await until(async () => (await page.evaluate(() => window.irisDesktop.version())) === '0.1.0')
  );
  check(
    'irisDesktop is frozen and has only the bridge methods',
    await page.evaluate(
      () =>
        JSON.stringify(Object.keys(window.irisDesktop).sort()) ===
          '["closeNotifications","notify","on","setUnread","version"]' &&
        Object.isFrozen(window.irisDesktop)
    )
  );

  // The colour scheme arrives although the handler is added after the shell emitted it.
  const schemes = await page.evaluate(() => {
    window.__schemes = [];
    window.irisDesktop.on('colorScheme', (v) => window.__schemes.push(v));
    return true;
  });
  check(
    'colorScheme { dark } is delivered on start',
    !!(await until(
      async () => JSON.stringify(await page.evaluate(() => window.__schemes)) === '[{"dark":true}]'
    )),
    JSON.stringify(await page.evaluate(() => window.__schemes))
  );

  // 1b. setUnread -> the LauncherEntry signal.
  const sentTo = (n, visible) =>
    signals().some(
      (s) =>
        /destination=\(null destination\)/.test(s) &&
        s.includes(
          'path=/house/mouseion/iris; interface=com.canonical.Unity.LauncherEntry; member=Update'
        ) &&
        s.includes('string "application://house.mouseion.iris.desktop"') &&
        new RegExp(`string "count"\\s+variant\\s+int64 ${n}\\b`).test(s) &&
        new RegExp(`string "count-visible"\\s+variant\\s+boolean ${visible}\\b`).test(s)
    );
  await sleep(500);
  check(
    'setUnread resolves',
    (await page.evaluate(() =>
      window.irisDesktop.setUnread({ total: 3, highlight: 1 }).then(() => 'ok')
    )) === 'ok'
  );
  check('Update signal with count 3, visible', !!(await until(() => sentTo(3, 'true'))));
  await page.evaluate(() => window.irisDesktop.setUnread({ total: 0, highlight: 0 }));
  check(
    'Update signal with count 0, count-visible false',
    !!(await until(() => sentTo(0, 'false')))
  );
  const before = signals().length;
  const rejected = await page.evaluate(() =>
    window.irisDesktop.setUnread({ total: -1, highlight: 0 }).then(
      () => 'accepted',
      () => 'rejected'
    )
  );
  const rejected2 = await page.evaluate(() =>
    window.irisDesktop.setUnread('3').then(
      () => 'accepted',
      () => 'rejected'
    )
  );
  await sleep(500);
  check(
    'bad setUnread arguments are rejected and send nothing',
    rejected === 'rejected' && rejected2 === 'rejected' && signals().length === before
  );
  await page.evaluate(() => window.irisDesktop.setUnread({ total: 7, highlight: 2 }));
  check('count 7 is shown', !!(await until(() => sentTo(7, 'true'))));
  // A reload reconnects the page; the shell says the badge again.
  const n7 = signals().filter((s) => /int64 7\b/.test(s)).length;
  page.evaluate(() => location.reload()).catch(() => {});
  check(
    'badge is sent again when the page reloads',
    !!(await until(() => signals().filter((s) => /int64 7\b/.test(s)).length > n7))
  );
  await sleep(500);
  check(
    'colorScheme is replayed to a handler added after the reload',
    !!(await until(async () => {
      await page.evaluate(() => {
        window.__s2 = [];
        window.irisDesktop.on('colorScheme', (v) => window.__s2.push(v));
      });
      return JSON.stringify(await page.evaluate(() => window.__s2)) === '[{"dark":true}]';
    }))
  );

  // Signed out: the shell re-sends 7 on load, the sign-in page reports 0, and the badge ends hidden.
  const n7b = signals().filter((s) => /int64 7\b/.test(s)).length;
  const total = signals().length;
  page
    .evaluate(() => {
      location.href = '/signedout';
    })
    .catch(() => {});
  check(
    'signed-out page load: the badge is resent, then cleared',
    !!(await until(() =>
      signals()
        .slice(total)
        .some((s) => /int64 0\b/.test(s))
    ))
  );
  const last = signals().slice(-1)[0] || '';
  check(
    'the last signal after the signed-out page is count 0, count-visible false',
    /int64 0\b/.test(last) &&
      /boolean false\b/.test(last) &&
      signals().filter((s) => /int64 7\b/.test(s)).length >= n7b
  );
  page
    .evaluate(() => {
      location.href = '/';
    })
    .catch(() => {});
  await sleep(1000);

  await page.click('#ext');
  check(
    'clicked external link opens in the browser',
    !!(await until(() => opened().includes(`http://127.0.0.1:${B}/ext`))),
    JSON.stringify(opened())
  );
  await page.click('#blank');
  check(
    'target=_blank link opens in the browser',
    !!(await until(() => opened().includes(`http://127.0.0.1:${B}/blank`)))
  );
  await page.evaluate((b) => {
    window.open(`http://127.0.0.1:${b}/popup`);
  }, B);
  check(
    'window.open opens in the browser',
    !!(await until(() => opened().includes(`http://127.0.0.1:${B}/popup`)))
  );
  page
    .evaluate(() => {
      location.href = '/redirect';
    })
    .catch(() => {});
  check(
    'redirect to another origin opens in the browser',
    !!(await until(() => opened().includes(`http://127.0.0.1:${B}/landed`)))
  );
  await sleep(500);
  check(
    'the view stayed on the allowed origin',
    (await page.url()).startsWith(`http://127.0.0.1:${A}/`),
    await page.url()
  );

  // 2. Profile persists across restarts.
  await page.evaluate(() => {
    localStorage.setItem('probe', 'kept');
    document.cookie = 'probe=kept; max-age=86400; path=/';
  });
  const profileDir = join(tmp, 'data', 'iris', 'webengine');
  check(
    'profile directory exists on disk',
    existsSync(profileDir),
    existsSync(profileDir) ? readdirSync(profileDir).join(',') : ''
  );

  // 3. Second launch raises the first and exits.
  const second = launch(`http://127.0.0.1:${A}/`);
  const code = await Promise.race([exited(second), sleep(15000).then(() => 'timeout')]);
  if (code === 'timeout') second.kill();
  check('second launch exits at once', code === 0, `exit ${code}`);
  check(
    'first instance was asked to raise its window',
    out.includes('IRIS_STATE activate-requested')
  );
  check('only one app window target exists', (await page.count()) === 1);

  // 4. Offline page, then recovery by itself.
  await srvA.stop();
  page.evaluate(() => location.reload()).catch(() => {});
  check(
    'offline page shows when the server is unreachable',
    !!(await until(() => out.includes('IRIS_STATE offline=true')))
  );
  srvA.start();
  check(
    'offline page goes away by itself when the server is back',
    !!(await until(
      () =>
        out.lastIndexOf('IRIS_STATE offline=false') > out.lastIndexOf('IRIS_STATE offline=true'),
      15000
    ))
  );
  await browser.close().catch(() => {});

  // 5. Restart: localStorage and cookie survived.
  app.kill();
  await exited(app);
  await sleep(1000);
  app = launch(`http://127.0.0.1:${A}/`);
  ({ browser, page } = await connect(`http://127.0.0.1:${A}/`));
  const kept = await until(() =>
    page.evaluate(() => [localStorage.getItem('probe'), document.cookie])
  );
  check(
    'localStorage and cookie survive a restart',
    kept && kept[0] === 'kept' && kept[1].includes('probe=kept'),
    JSON.stringify(kept)
  );
  await browser.close().catch(() => {});
  app.kill();
  await exited(app);
  await sleep(1000);

  // 6. Any other origin loaded into the view gets no bridge.
  app = launch(`http://127.0.0.1:${B}/`);
  ({ browser, page } = await connect(`http://127.0.0.1:${B}/`));
  await sleep(1500);
  const probe = await page.evaluate(() => [typeof window.irisDesktop, typeof window.QWebChannel]);
  check(
    'irisDesktop and QWebChannel are undefined on another origin',
    probe[0] === 'undefined' && probe[1] === 'undefined',
    JSON.stringify(probe)
  );
  await browser.close().catch(() => {});
  app.kill();
  await exited(app);
  await sleep(1000);

  // 7. Tray, close-to-tray, --hidden (a stand-in StatusNotifierWatcher plays Plasma's tray).
  const watcher = spawn(join(dirname(process.env.IRIS_BIN), 'tests', 'iris-fake-watcher'));
  apps.add(watcher);
  let wout = '';
  watcher.stdout.on('data', (d) => {
    wout += d;
  });
  check('stand-in StatusNotifierWatcher is up', !!(await until(() => wout.includes('ready'))));
  // Notifications and KGlobalAccel calls on the private bus (nobody answers them; the calls are what we look at).
  const mon2 = spawn('dbus-monitor', [
    '--session',
    "type='method_call',interface='org.freedesktop.Notifications'",
    "destination='org.kde.kglobalaccel'",
  ]);
  let calls = '';
  mon2.stdout.on('data', (d) => {
    calls += d;
  });
  await sleep(500);
  const busctl = (...a) => spawnSync('busctl', ['--user', ...a], { encoding: 'utf8' }).stdout || '';
  const mark = out.length;
  const visible = () => {
    const m = [...out.slice(mark).matchAll(/IRIS_STATE visible=(true|false)/g)];
    return m.length ? m.at(-1)[1] === 'true' : null;
  };
  const notices = () =>
    calls
      .split(/(?=^method call )/m)
      .filter((c) => /member=Notify/.test(c) && c.includes('Iris is still running in the tray'))
      .length;

  app = launch(`http://127.0.0.1:${A}/`, 'dark', ['--hidden']);
  ({ browser, page } = await connect(`http://127.0.0.1:${A}/`));
  check(
    '--hidden: the page loads in the background',
    !!(page && (await until(() => page.evaluate(() => window.irisDesktop.version()))))
  );
  await sleep(1500);
  check('--hidden: no window is shown', visible() !== true, String(visible()));
  const svc = await until(() => /registered (\S+)/.exec(wout)?.[1]);
  check('the tray item registered with the watcher', !!svc, String(svc));
  const item = (prop) =>
    busctl('get-property', svc, '/StatusNotifierItem', 'org.kde.StatusNotifierItem', prop).trim();
  check(
    'tray item id and icon',
    /^s "[^"]*house\.mouseion\.iris"$/.test(item('Id')) &&
      item('IconName') === 's "house.mouseion.iris"',
    item('Id') + ' ' + item('IconName')
  );
  check('tray tooltip starts as plain Iris', /"Iris" ""$/.test(item('ToolTip')), item('ToolTip'));
  await page.evaluate(() => window.irisDesktop.setUnread({ total: 3, highlight: 0 }));
  // A mention is marked the KDE way (#83): Status NeedsAttention and a theme emblem as the overlay,
  // over the unchanged app icon, which is also the attention icon.
  const unmarked = () =>
    item('Status') === 's "Active"' &&
    item('OverlayIconName') === 's ""' &&
    item('IconName') === 's "house.mouseion.iris"';
  const marked = () =>
    item('Status') === 's "NeedsAttention"' &&
    item('OverlayIconName') === 's "emblem-important"' &&
    item('IconName') === 's "house.mouseion.iris"';
  const marks = () =>
    ['Status', 'OverlayIconName', 'IconName', 'AttentionIconName'].map(item).join(' ');
  check(
    'tray item starts Active with no overlay; the attention icon is the app icon',
    unmarked() && item('AttentionIconName') === 's "house.mouseion.iris"',
    marks()
  );
  check(
    'tooltip says "Iris: 3 unread", icon unchanged',
    !!(await until(() => /"Iris: 3 unread" ""$/.test(item('ToolTip')))) &&
      item('IconName') === 's "house.mouseion.iris"',
    item('ToolTip')
  );
  check('unread without a highlight leaves the item unmarked', unmarked(), marks());
  await page.evaluate(() => window.irisDesktop.setUnread({ total: 5, highlight: 2 }));
  check(
    'a highlight sets NeedsAttention and the emblem-important overlay; icon and tooltip icon stay the app icon',
    !!(await until(marked)) &&
      /^\S+ "house\.mouseion\.iris" .*"Iris: 5 unread" ""$/.test(item('ToolTip')),
    marks() + ' ' + item('ToolTip')
  );
  await page.evaluate(() => window.irisDesktop.setUnread({ total: 0, highlight: 0 }));
  check(
    'reading everything clears the mark (Active, no overlay) and restores the tooltip',
    !!(await until(() => unmarked() && /"Iris" ""$/.test(item('ToolTip')))),
    marks() + ' ' + item('ToolTip')
  );

  const activate = () =>
    busctl(
      'call',
      svc,
      '/StatusNotifierItem',
      'org.kde.StatusNotifierItem',
      'Activate',
      'ii',
      '0',
      '0'
    );
  activate();
  check('Activate on the tray item shows the window', !!(await until(() => visible() === true)));
  activate();
  check('Activate again hides it', !!(await until(() => visible() === false)));

  // The tray menu: Show Iris and Quit.
  const layout = busctl(
    'call',
    svc,
    '/MenuBar',
    'com.canonical.dbusmenu',
    'GetLayout',
    'iias',
    '--',
    '0',
    '-1',
    '0'
  );
  check(
    'menu has Show Iris and Quit',
    /"label" s "Show Iris"/.test(layout) && /"label" s "Quit"/.test(layout),
    layout.slice(0, 400)
  );
  const click = (id) =>
    busctl(
      'call',
      svc,
      '/MenuBar',
      'com.canonical.dbusmenu',
      'Event',
      'isvu',
      String(id),
      'clicked',
      's',
      '',
      '0'
    );
  const ids = [...layout.matchAll(/\(ia\{sv\}av\) (\d+) \d+ "label" s "([^"]+)"/g)];
  const idShow = ids.find((m) => m[2] === 'Show Iris')?.[1],
    idQuit = ids.find((m) => m[2] === 'Quit')?.[1];
  if (idShow) click(idShow);
  check('Show Iris in the menu shows the window', !!(await until(() => visible() === true)));

  // Close hides rather than quits; the first time, one notice; the app keeps syncing.
  const alive = () => app.exitCode === null;
  app.kill('SIGUSR1');
  check(
    'closing the window hides it and the app keeps running',
    !!(await until(() => visible() === false)) && alive()
  );
  check(
    'the first hide says "Iris is still running in the tray" through the notification service',
    !!(await until(() => notices() === 1)),
    String(notices())
  );
  const n9 = signals().length;
  await page.evaluate(() => window.irisDesktop.setUnread({ total: 9, highlight: 1 }));
  check(
    'while hidden, a new unread still reaches the badge and the tray',
    !!(await until(() =>
      signals()
        .slice(n9)
        .some((x) => /int64 9\b/.test(x))
    )) && !!(await until(marked)),
    marks()
  );
  activate();
  await until(() => visible() === true);
  app.kill('SIGUSR1');
  check(
    'a second close hides again, and the notice is not repeated',
    !!(await until(() => visible() === false)) && alive()
  );
  await sleep(500);
  check('the notice was sent exactly once', notices() === 1, String(notices()));
  check(
    'the global shortcut "Show or hide Iris" is registered with KGlobalAccel',
    calls.includes('member=doRegister') &&
      calls.includes('house.mouseion.iris') &&
      calls.includes('show-or-hide') &&
      calls.includes('Show or hide Iris'),
    calls.split('\n').filter((l) => l.includes('kglobalaccel')).length + ' calls'
  );

  // Restart: the notice is remembered across runs, so a close on the new run sends none.
  app.kill();
  await exited(app);
  await sleep(1000);
  const noticesBefore = notices();
  const mark2 = out.length;
  app = launch(`http://127.0.0.1:${A}/`, 'dark', ['--hidden']);
  await until(() => (wout.match(/registered/g) || []).length >= 2);
  let svc2;
  for (const m of wout.matchAll(/registered (\S+)/g)) svc2 = m[1];
  busctl(
    'call',
    svc2,
    '/StatusNotifierItem',
    'org.kde.StatusNotifierItem',
    'Activate',
    'ii',
    '0',
    '0'
  );
  await until(() => out.slice(mark2).includes('IRIS_STATE visible=true'));
  app.kill('SIGUSR1');
  await until(() => out.slice(mark2).includes('IRIS_STATE visible=false'));
  await sleep(500);
  check(
    'the notice is remembered across restarts',
    notices() === noticesBefore,
    `${noticesBefore} -> ${notices()}`
  );

  // Quit in the tray menu exits.
  if (idQuit)
    busctl(
      'call',
      svc2,
      '/MenuBar',
      'com.canonical.dbusmenu',
      'Event',
      'isvu',
      String(idQuit),
      'clicked',
      's',
      '',
      '0'
    );
  const quitCode = await Promise.race([exited(app), sleep(15000).then(() => 'timeout')]);
  check('Quit in the tray menu exits the app', quitCode === 0, `exit ${quitCode}`);
  await browser.close().catch(() => {});
  mon2.kill();
} catch (e) {
  console.log('FAIL  e2e crashed', e);
  results.push(false);
} finally {
  for (const p of apps) p.kill();
  monitor.kill();
  await srvA.stop();
  await srvB.stop();
}
if (process.env.E2E_VERBOSE) console.log(out);
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) && results.length ? 0 : 1);
