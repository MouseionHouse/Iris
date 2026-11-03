// Run with `npm test` (Node's own runner; it strips the types, so the files under test import nothing).
import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  createUnreadSender,
  desktopSetUnread,
  isDesktopShell,
  onDesktopColorScheme,
} from '../src/app/native/desktop.ts';
import { pickTheme, systemIsDark } from '../src/app/hooks/themeChoice.ts';

const g = globalThis as unknown as { window?: unknown };
afterEach(() => {
  delete g.window;
});

describe('outside the desktop shell', () => {
  it('does nothing without window.irisDesktop', () => {
    g.window = {};
    assert.equal(isDesktopShell(), false);
    desktopSetUnread({ total: 3, highlight: 1 });
    const off = onDesktopColorScheme(() => assert.fail('no scheme without the shell'));
    off();
  });

  it('does nothing without a window at all', () => {
    assert.equal(isDesktopShell(), false);
    desktopSetUnread({ total: 3, highlight: 1 });
    onDesktopColorScheme(() => {})();
  });
});

describe('inside the desktop shell', () => {
  const fakeBridge = () => {
    const calls: unknown[] = [];
    const handlers: Record<string, (p: unknown) => void> = {};
    g.window = {
      irisDesktop: {
        version: async () => '0.1.0',
        setUnread: (c: unknown) => {
          calls.push(c);
          return Promise.resolve();
        },
        on: (event: string, h: (p: unknown) => void) => {
          handlers[event] = h;
          return () => delete handlers[event];
        },
      },
    };
    return { calls, handlers };
  };

  it('is detected and passes the counts through', () => {
    const { calls } = fakeBridge();
    assert.equal(isDesktopShell(), true);
    desktopSetUnread({ total: 5, highlight: 2 });
    assert.deepEqual(calls, [{ total: 5, highlight: 2 }]);
  });

  it('ignores a refused setUnread', async () => {
    g.window = { irisDesktop: { setUnread: () => Promise.reject(new Error('no')) } };
    desktopSetUnread({ total: 1, highlight: 0 });
    await new Promise((r) => setTimeout(r, 0)); // no unhandled rejection
  });

  it('hands over valid colour schemes only, and unsubscribes', () => {
    const { handlers } = fakeBridge();
    const seen: boolean[] = [];
    const off = onDesktopColorScheme((s) => seen.push(s.dark));
    handlers.colorScheme({ dark: true });
    handlers.colorScheme({ dark: 'yes' });
    handlers.colorScheme(null);
    handlers.colorScheme({ dark: false });
    assert.deepEqual(seen, [true, false]);
    off();
    assert.equal(handlers.colorScheme, undefined);
  });
});

describe('createUnreadSender', () => {
  it('sends the hub-bridge counts, at most once per interval, the latest', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const sent: unknown[] = [];
    const sender = createUnreadSender((c) => sent.push(c), 300);
    sender.push({ total: 1, highlight: 0 });
    sender.push({ total: 2, highlight: 1 });
    sender.push({ total: 4, highlight: 1 });
    assert.deepEqual(sent, []);
    mock.timers.tick(299);
    assert.deepEqual(sent, []);
    mock.timers.tick(1);
    assert.deepEqual(sent, [{ total: 4, highlight: 1 }]);
    // A burst in the next interval is one call again.
    sender.push({ total: 5, highlight: 1 });
    sender.push({ total: 6, highlight: 1 });
    mock.timers.tick(300);
    assert.deepEqual(sent, [
      { total: 4, highlight: 1 },
      { total: 6, highlight: 1 },
    ]);
    mock.timers.reset();
  });

  it('skips counts equal to the last ones sent', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const sent: unknown[] = [];
    const sender = createUnreadSender((c) => sent.push(c), 300);
    sender.push({ total: 3, highlight: 0 });
    mock.timers.tick(300);
    sender.push({ total: 3, highlight: 0 });
    mock.timers.tick(300);
    assert.equal(sent.length, 1);
    mock.timers.reset();
  });

  it('flush sends now and cancel drops what is pending', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const sent: unknown[] = [];
    const sender = createUnreadSender((c) => sent.push(c), 300);
    sender.push({ total: 3, highlight: 3 });
    sender.flush();
    assert.deepEqual(sent, [{ total: 3, highlight: 3 }]);
    sender.push({ total: 9, highlight: 0 });
    sender.cancel();
    mock.timers.tick(1000);
    assert.equal(sent.length, 1);
    mock.timers.reset();
  });

  it('never reports more highlights than messages', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const sent: unknown[] = [];
    const sender = createUnreadSender((c) => sent.push(c), 300);
    sender.push({ total: 1, highlight: 4 });
    mock.timers.tick(300);
    assert.deepEqual(sent, [{ total: 1, highlight: 1 }]);
    mock.timers.reset();
  });
});

describe('theme rule', () => {
  const themes = [
    { id: 'iris-light-theme' },
    { id: 'iris-dark-theme' },
    { id: 'butter-theme' },
    { id: 'silver-theme' },
  ];
  const base = {
    hubTheme: null,
    themes,
    defaultLight: themes[0],
    defaultDark: themes[1],
  };

  it('the Plasma scheme replaces the browser one, and is optional', () => {
    assert.equal(systemIsDark(true, false), true);
    assert.equal(systemIsDark(false, true), false);
    assert.equal(systemIsDark(null, true), true);
    assert.equal(systemIsDark(null, false), false);
  });

  it('follow-the-system follows Plasma', () => {
    const follow = { ...base, useSystemTheme: true };
    assert.equal(pickTheme({ ...follow, systemDark: true }).id, 'iris-dark-theme');
    assert.equal(pickTheme({ ...follow, systemDark: false }).id, 'iris-light-theme');
    assert.equal(
      pickTheme({ ...follow, systemDark: true, darkThemeId: 'butter-theme' }).id,
      'butter-theme'
    );
    assert.equal(
      pickTheme({ ...follow, systemDark: false, lightThemeId: 'silver-theme' }).id,
      'silver-theme'
    );
  });

  it('an explicit theme choice wins over Plasma', () => {
    const chosen = { ...base, useSystemTheme: false, themeId: 'butter-theme' };
    assert.equal(pickTheme({ ...chosen, systemDark: true }).id, 'butter-theme');
    assert.equal(pickTheme({ ...chosen, systemDark: false }).id, 'butter-theme');
    // No theme picked yet and not following the system: Iris light, whatever Plasma says.
    assert.equal(
      pickTheme({ ...base, useSystemTheme: false, systemDark: true }).id,
      'iris-light-theme'
    );
  });

  it('a hub-forced theme wins over everything', () => {
    const hub = { id: 'mouseion-theme' };
    assert.equal(
      pickTheme({ ...base, hubTheme: hub, useSystemTheme: true, systemDark: false }),
      hub
    );
  });
});
