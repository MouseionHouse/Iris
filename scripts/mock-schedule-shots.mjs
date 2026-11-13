// Screenshots of /mock-schedule.html (mouseion/iris#87), and a few checks on the way.
//
//   npx vite --port 5187 &
//   node scripts/mock-schedule-shots.mjs <dir with playwright-core> <out dir> [http://localhost:5187]
//
// playwright-core is not a dependency of Iris: point the first argument at any install of it.
import path from 'node:path';
import { createRequire } from 'node:module';

const [pwDir, outDir, base = 'http://localhost:5187'] = process.argv.slice(2);
if (!pwDir || !outDir) {
  console.error('usage: mock-schedule-shots.mjs <playwright-core dir> <out dir> [base url]');
  process.exit(2);
}
const { chromium } = createRequire(path.join(path.resolve(pwDir), 'x.js'))('playwright-core');

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`
  );
};

const browser = await chromium.launch();

const open = async (query, { phone = false } = {}) => {
  const context = await browser.newContext(
    phone
      ? {
          viewport: { width: 390, height: 780 },
          deviceScaleFactor: 2,
          hasTouch: true,
          isMobile: true,
        }
      : { viewport: { width: 900, height: 640 }, deviceScaleFactor: 2 }
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(`${base}/mock-schedule.html?${query}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return page;
};
const composerText = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-slate-editor] [data-slate-string]')]
      .map((n) => n.textContent)
      .join('')
      .trim()
  );
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });

const longPress = async (page, selector) => {
  const box = await page.locator(selector).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
};

for (const theme of ['light', 'dark']) {
  // desktop: the split button's menu, the picker, the composer with a time set, the list
  const page = await open(theme);
  await page.click('[data-action="send-options"]');
  await page.waitForTimeout(300);
  await shot(page, `desktop-${theme}-split-menu`);
  await page.click('[data-action="schedule"]');
  await page.waitForTimeout(400);
  await shot(page, `desktop-${theme}-picker`);
  check(
    `${theme}: picker says who can't read it in an encrypted room`,
    await page.isVisible('[data-schedule-note="encrypted"]')
  );
  await page.getByText('Tomorrow morning').click();
  await page.click('[data-action="confirm-schedule"]');
  await page.waitForTimeout(300);
  await page.locator('[data-slate-editor]').click();
  await page.keyboard.type('Remind everyone about the bins at 7');
  await shot(page, `desktop-${theme}-composer-time-set`);
  check(`${theme}: time bar shows`, await page.isVisible('[data-bar="scheduled-time"]'));
  // a second Enter while the first schedule is out schedules nothing more
  const before = await page.evaluate(() => window.__schedule.requests.schedule ?? 0);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => window.__schedule.requests.schedule ?? 0);
  check(`${theme}: double Enter schedules once`, after - before === 1, {
    requests: after - before,
  });
  check(`${theme}: composer clears after scheduling`, (await composerText(page)) === '');
  await page.click('[data-action="scheduled-chip"]');
  await page.waitForTimeout(500);
  await shot(page, `desktop-${theme}-list`);
  const rows = await page.locator('[data-scheduled-row]').count();
  const encryptedRows = await page.locator('[data-scheduled-row][data-encrypted]').count();
  check(`${theme}: list has plain and encrypted rows`, rows === 4 && encryptedRows === 3, {
    rows,
    encryptedRows,
  });
  // edit puts the formatted text and its time back; the old one stays until the new one is out
  if (theme === 'light') {
    const row = page.locator('[data-scheduled-row]').filter({ hasText: 'door code' });
    await row.locator('[data-action="edit"]').click();
    await page.waitForTimeout(400);
    const html = await page.locator('[data-slate-editor]').innerHTML();
    check('edit keeps the formatting', /<strong|font-weight|<b/.test(html));
    await shot(page, `desktop-${theme}-editing`);
    const ids = await page.evaluate(() => window.__schedule.events.map((e) => e.delayId));
    await page.locator('[data-slate-editor]').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' (from Friday)');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    const idsAfter = await page.evaluate(() => window.__schedule.events.map((e) => e.delayId));
    check(
      'edit: new one scheduled, old one cancelled',
      idsAfter.length === ids.length && idsAfter.some((id) => !ids.includes(id)),
      { before: ids.length, after: idsAfter.length }
    );
    // cancel asks first
    await page.locator('[data-scheduled-row]').first().locator('[data-action="cancel"]').click();
    await page.waitForTimeout(300);
    await shot(page, `desktop-${theme}-cancel-confirm`);
    await page.click('[data-action="confirm-cancel"]');
    await page.waitForTimeout(800);
    const n = await page.evaluate(() => window.__schedule.events.length);
    check('cancel removes one', n === idsAfter.length - 1, { left: n });
  }
  await page.context().close();
}

// the too-far-ahead error: a server whose limit is an hour
{
  const page = await open('light&limit=1&empty');
  await page.click('[data-action="send-options"]');
  await page.click('[data-action="schedule"]');
  await page.getByText('Tomorrow morning').click();
  await page.click('[data-action="confirm-schedule"]');
  await page.locator('[data-slate-editor]').click();
  await page.keyboard.type('Bins at 7');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await shot(page, 'desktop-light-too-far-error');
  const text = await page
    .locator('[data-bar="schedule-error"]')
    .innerText()
    .catch(() => '');
  check('too far: the error names the limit', text.includes('up to 1 hour ahead'), { text });
  await page.getByText('Pick another time').click();
  await page.waitForTimeout(400);
  await shot(page, 'desktop-light-picker-limit');
  check(
    'too far: confirm disabled with the reason',
    await page.locator('[data-action="confirm-schedule"]').isDisabled()
  );
  await page.context().close();
}

// phone: long-press on send opens the action sheet; the picker is a bottom sheet
for (const theme of ['light', 'dark']) {
  const page = await open(`${theme}&phone`, { phone: true });
  check(
    `phone ${theme}: no chevron`,
    (await page.locator('[data-action="send-options"]').count()) === 0
  );
  await longPress(page, '[data-action="send"]');
  await shot(page, `phone-${theme}-send-sheet`);
  await page.locator('[data-action="schedule"]').tap();
  await page.waitForTimeout(500);
  await shot(page, `phone-${theme}-picker`);
  await page.getByText('Tomorrow afternoon').tap();
  await page.locator('[data-action="confirm-schedule"]').tap();
  await page.waitForTimeout(400);
  await page.locator('[data-action="scheduled-chip"]').tap();
  await page.waitForTimeout(500);
  await shot(page, `phone-${theme}-list`);
  await page.context().close();
}

// a server without MSC4140: the send button as it was, no chip, no request
{
  const page = await open('light&unsupported');
  await page.locator('[data-slate-editor]').click();
  await page.keyboard.type('hello');
  await page.waitForTimeout(1500);
  const requests = await page.evaluate(() => window.__schedule.requests);
  check(
    'no MSC4140: no chevron, no split send, no chip, no requests',
    (await page.locator('[data-action="send-options"]').count()) === 0 &&
      (await page.locator('[data-send="split"]').count()) === 0 &&
      (await page.locator('[data-action="scheduled-chip"]').count()) === 0 &&
      Object.keys(requests).length === 0,
    { requests }
  );
  await shot(page, 'desktop-light-unsupported');
  await page.context().close();
}

// power levels (mouseion/iris#94): an encrypted room's composer needs m.room.encrypted, a plain
// room's m.room.message; without it there is no composer, so nothing to send or schedule with
for (const [query, allowed] of [
  ['no-encrypted', false],
  ['no-encrypted&plain', true],
  ['no-message', true],
  ['no-message&plain', false],
]) {
  const page = await open(`light&${query}`);
  const composer = {
    editor: await page.locator('[data-slate-editor]').count(),
    send: await page.locator('[data-action="send"]').count(),
    schedule: await page.locator('[data-action="send-options"]').count(),
    chip: await page.locator('[data-action="scheduled-chip"]').count(),
    note: await page.locator('[data-composer="no-permission"]').count(),
  };
  const requests = await page.evaluate(() => window.__schedule.requests);
  check(
    `${query}: ${
      allowed ? 'composer with send and schedule' : 'no composer, no send, no schedule'
    }`,
    allowed
      ? composer.editor === 1 && composer.send === 1 && composer.schedule === 1 && !composer.note
      : !composer.editor &&
          !composer.send &&
          !composer.schedule &&
          !composer.chip &&
          composer.note === 1 &&
          Object.keys(requests).length === 0,
    { ...composer, requests }
  );
  if (!allowed) await shot(page, `desktop-light-${query.replace('&', '-')}`);
  await page.context().close();
}

await browser.close();
const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
