// Run with `npm test` (Node's own runner; it strips the types, so the files under test import nothing).
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { onDesktopOpenLink, parseDesktopLink } from '../src/app/native/desktop.ts';
import { routeDesktopLink } from '../src/app/native/desktopLink.ts';

const g = globalThis as unknown as { window?: unknown };
afterEach(() => {
  delete g.window;
});

describe('parseDesktopLink', () => {
  it('accepts what the shell sends', () => {
    assert.deepEqual(parseDesktopLink({ kind: 'room', id: '!r:example.org' }), {
      kind: 'room',
      id: '!r:example.org',
    });
    assert.deepEqual(
      parseDesktopLink({
        kind: 'alias',
        id: '#a:example.org',
        eventId: '$e',
        via: ['x.org', 'y.org:8448'],
        action: 'join',
      }),
      {
        kind: 'alias',
        id: '#a:example.org',
        eventId: '$e',
        via: ['x.org', 'y.org:8448'],
        action: 'join',
      }
    );
    assert.deepEqual(parseDesktopLink({ kind: 'user', id: '@u:example.org', action: 'chat' }), {
      kind: 'user',
      id: '@u:example.org',
      action: 'chat',
    });
  });

  it('refuses anything else', () => {
    const bad: unknown[] = [
      undefined,
      null,
      'matrix:u/a:b.org',
      42,
      [],
      {},
      { kind: 'room' },
      { id: '!r:b.org' },
      { kind: 'space', id: '!r:b.org' },
      { kind: 'room', id: '#a:b.org' }, // the sigil must match the kind
      { kind: 'alias', id: '!r:b.org' },
      { kind: 'user', id: '!r:b.org' },
      { kind: 'room', id: '!' },
      { kind: 'room', id: 7 },
      { kind: 'room', id: `!${'a'.repeat(300)}:b.org` },
      { kind: 'room', id: '!r:b.org', extra: 1 },
      { kind: 'room', id: '!r:b.org', eventId: 'e' },
      { kind: 'room', id: '!r:b.org', eventId: 7 },
      { kind: 'user', id: '@u:b.org', eventId: '$e' },
      { kind: 'user', id: '@u:b.org', via: ['b.org'] },
      { kind: 'user', id: '@u:b.org', action: 'join' },
      { kind: 'room', id: '!r:b.org', via: 'b.org' },
      { kind: 'room', id: '!r:b.org', via: [1] },
      { kind: 'room', id: '!r:b.org', via: [''] },
      { kind: 'room', id: '!r:b.org', via: Array.from({ length: 11 }, (_, i) => `s${i}.org`) },
      { kind: 'room', id: '!r:b.org', action: 'delete' },
      { kind: 'room', id: '!r:b.org', action: 7 },
    ];
    bad.forEach((p) => assert.equal(parseDesktopLink(p), undefined, JSON.stringify(p)));
  });
});

describe('onDesktopOpenLink', () => {
  const fakeShell = () => {
    const handlers: Record<string, (p: unknown) => void> = {};
    g.window = {
      irisDesktop: {
        on: (event: string, h: (p: unknown) => void) => {
          handlers[event] = h;
          return () => delete handlers[event];
        },
      },
    };
    return handlers;
  };

  it('does nothing outside the shell', () => {
    g.window = {};
    onDesktopOpenLink(() => assert.fail('no links without the shell'))();
  });

  it('hands over valid links and drops malformed ones', () => {
    const handlers = fakeShell();
    const got: unknown[] = [];
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      onDesktopOpenLink((l) => got.push(l));
      handlers.openLink({ kind: 'user', id: '@u:b.org' });
      handlers.openLink({ kind: 'user', id: 'javascript:alert(1)' });
      handlers.openLink('matrix:u/a:b.org');
    } finally {
      console.warn = warn;
    }
    assert.deepEqual(got, [{ kind: 'user', id: '@u:b.org' }]);
  });
});

describe('routeDesktopLink: lands where a matrix.to link clicked in Iris would', () => {
  const rooms: Record<string, { roomId: string; isSpace: boolean }> = {
    '!known:b.org': { roomId: '!known:b.org', isSpace: false },
    '#known:b.org': { roomId: '!known:b.org', isSpace: false },
    '!space:b.org': { roomId: '!space:b.org', isSpace: true },
  };
  const find = (id: string) => rooms[id];

  it('opens a room we have, with the event', () => {
    assert.deepEqual(routeDesktopLink({ kind: 'room', id: '!known:b.org' }, find), {
      to: 'room',
      roomId: '!known:b.org',
      eventId: undefined,
    });
    assert.deepEqual(routeDesktopLink({ kind: 'alias', id: '#known:b.org', eventId: '$e' }, find), {
      to: 'room',
      roomId: '!known:b.org',
      eventId: '$e',
    });
  });

  it('opens a space we have as a space, unless an event in it is asked for', () => {
    assert.deepEqual(routeDesktopLink({ kind: 'room', id: '!space:b.org' }, find), {
      to: 'space',
      roomId: '!space:b.org',
    });
    assert.equal(
      routeDesktopLink({ kind: 'room', id: '!space:b.org', eventId: '$e' }, find).to,
      'room'
    );
  });

  it('sends a room we do not have to the join page, with via and event; action=join is the same', () => {
    const expected = {
      to: 'join',
      roomIdOrAlias: '#new:c.org',
      eventId: '$e',
      viaServers: ['x.org', 'y.org'],
    };
    assert.deepEqual(
      routeDesktopLink(
        { kind: 'alias', id: '#new:c.org', eventId: '$e', via: ['x.org', 'y.org'] },
        find
      ),
      expected
    );
    assert.deepEqual(
      routeDesktopLink(
        { kind: 'alias', id: '#new:c.org', eventId: '$e', via: ['x.org', 'y.org'], action: 'join' },
        find
      ),
      expected
    );
    assert.deepEqual(routeDesktopLink({ kind: 'room', id: '!new:c.org', via: [] }, find), {
      to: 'join',
      roomIdOrAlias: '!new:c.org',
      eventId: undefined,
      viaServers: undefined,
    });
  });

  it('opens the direct-message page for a user', () => {
    assert.deepEqual(routeDesktopLink({ kind: 'user', id: '@u:b.org', action: 'chat' }, find), {
      to: 'direct',
      userId: '@u:b.org',
    });
  });
});
