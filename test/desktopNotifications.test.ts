// Run with `npm test` (Node's own runner; it strips the types, so the files under test import nothing).
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  desktopCloseNotifications,
  desktopNotifiedRooms,
  desktopNotify,
  onDesktopOpenRoom,
  onDesktopReply,
  roomsToClose,
} from '../src/app/native/desktop.ts';
import { buildReplyContent, sendDesktopReply } from '../src/app/native/desktopReply.ts';

const g = globalThis as unknown as { window?: unknown };
afterEach(() => {
  desktopNotifiedRooms().forEach(desktopCloseNotifications);
  delete g.window;
});

type Handler = (p: unknown) => void;
const fakeShell = (opts: { refuseNotify?: boolean } = {}) => {
  const calls: { method: string; arg: unknown }[] = [];
  const handlers: Record<string, Handler> = {};
  g.window = {
    irisDesktop: {
      notify: (arg: unknown) => {
        calls.push({ method: 'notify', arg });
        return opts.refuseNotify ? Promise.reject(new Error('invalid')) : Promise.resolve();
      },
      closeNotifications: (arg: unknown) => {
        calls.push({ method: 'closeNotifications', arg });
        return Promise.resolve();
      },
      on: (event: string, h: Handler) => {
        handlers[event] = h;
        return () => delete handlers[event];
      },
    },
  };
  return { calls, handlers };
};

const note = { id: '$e1', roomId: '!r:example.org', eventId: '$e1', title: 'Room', body: 'Hi' };

describe('delivery', () => {
  it('goes to the bridge in the shell, and records the room', async () => {
    const { calls } = fakeShell();
    assert.equal(await desktopNotify(note), true);
    assert.deepEqual(calls, [{ method: 'notify', arg: note }]);
    assert.deepEqual(desktopNotifiedRooms(), ['!r:example.org']);
  });

  it('does nothing outside the shell, so the caller keeps the web Notification', async () => {
    g.window = {};
    assert.equal(await desktopNotify(note), false);
    assert.deepEqual(desktopNotifiedRooms(), []);
    desktopCloseNotifications('!r:example.org');
  });

  it('a refusal by the shell is a false, not a throw', async () => {
    fakeShell({ refuseNotify: true });
    assert.equal(await desktopNotify(note), false);
    assert.deepEqual(desktopNotifiedRooms(), []);
  });

  it('closing asks the shell for that room and forgets it', async () => {
    const { calls } = fakeShell();
    await desktopNotify(note);
    desktopCloseNotifications('!r:example.org');
    assert.deepEqual(calls[1], { method: 'closeNotifications', arg: { roomId: '!r:example.org' } });
    assert.deepEqual(desktopNotifiedRooms(), []);
  });
});

describe('the read rule', () => {
  it('closes shown rooms that are no longer unread, like Android', () => {
    assert.deepEqual(roomsToClose(['!a', '!b', '!c'], ['!b', '!x']), ['!a', '!c']);
    assert.deepEqual(roomsToClose([], ['!b']), []);
    assert.deepEqual(roomsToClose(['!a'], []), ['!a']);
  });
});

describe('events from the shell', () => {
  it('openRoom reaches the handler with the room and the event', () => {
    const { handlers } = fakeShell();
    const got: unknown[] = [];
    onDesktopOpenRoom((t) => got.push(t));
    handlers.openRoom({ roomId: '!r:x', eventId: '$e' });
    handlers.openRoom({ roomId: '!r:x', eventId: '' });
    handlers.openRoom({ nope: 1 });
    assert.deepEqual(got, [
      { roomId: '!r:x', eventId: '$e' },
      { roomId: '!r:x', eventId: undefined },
    ]);
  });

  it('reply reaches the handler; payloads without text are ignored', () => {
    const { handlers } = fakeShell();
    const got: unknown[] = [];
    onDesktopReply((r) => got.push(r));
    handlers.reply({ roomId: '!r:x', eventId: '$e', text: 'ok' });
    handlers.reply({ roomId: '!r:x' });
    assert.deepEqual(got, [{ roomId: '!r:x', eventId: '$e', text: 'ok' }]);
  });

  it('subscribing outside the shell does nothing', () => {
    g.window = {};
    onDesktopOpenRoom(() => assert.fail('no shell'))();
    onDesktopReply(() => assert.fail('no shell'))();
  });
});

describe('reply', () => {
  const makeClient = (opts: { membership?: string; event?: unknown; noRoom?: boolean } = {}) => {
    const sent: { roomId: string; content: Record<string, unknown> }[] = [];
    const looked: string[] = [];
    const room = {
      getMyMembership: () => opts.membership ?? 'join',
      findEventById: (id: string) => {
        looked.push(id);
        return opts.event as never;
      },
    };
    return {
      sent,
      looked,
      mx: {
        getUserId: () => '@me:x',
        getRoom: (id: string) => (opts.noRoom || id !== '!r:x' ? null : room),
        sendMessage: async (roomId: string, content: Record<string, unknown>) => {
          sent.push({ roomId, content });
        },
      },
    };
  };

  it('answers the event in the right room, mentioning its sender', async () => {
    const { mx, sent } = makeClient({ event: { getSender: () => '@them:x' } });
    assert.equal(
      await sendDesktopReply(mx, { roomId: '!r:x', eventId: '$e', text: ' hello ' }),
      true
    );
    assert.deepEqual(sent, [
      {
        roomId: '!r:x',
        content: {
          msgtype: 'm.text',
          body: 'hello',
          'm.mentions': { user_ids: ['@them:x'] },
          'm.relates_to': { 'm.in_reply_to': { event_id: '$e' } },
        },
      },
    ]);
  });

  it('continues a thread when the event is in one', () => {
    const content = buildReplyContent(
      'hi',
      '$e',
      { getSender: () => '@them:x', threadRootId: '$root' },
      '@me:x'
    );
    assert.deepEqual(content['m.relates_to'], {
      'm.in_reply_to': { event_id: '$e' },
      rel_type: 'm.thread',
      event_id: '$root',
      is_falling_back: false,
    });
  });

  it('does not mention oneself, and sends a plain message without an event', async () => {
    const { mx, sent, looked } = makeClient();
    assert.equal(await sendDesktopReply(mx, { roomId: '!r:x', text: 'yo' }), true);
    assert.deepEqual(sent[0].content, {
      msgtype: 'm.text',
      body: 'yo',
      'm.mentions': { user_ids: [] },
    });
    assert.deepEqual(looked, []);
    const own = buildReplyContent('x', '$e', { getSender: () => '@me:x' }, '@me:x');
    assert.deepEqual(own['m.mentions'], { user_ids: [] });
  });

  it('still replies to an event that is not loaded', async () => {
    const { mx, sent } = makeClient({ event: undefined });
    await sendDesktopReply(mx, { roomId: '!r:x', eventId: '$gone', text: 'x' });
    assert.deepEqual(sent[0].content['m.relates_to'], { 'm.in_reply_to': { event_id: '$gone' } });
  });

  it('drops empty text, huge text, unknown rooms and rooms not joined', async () => {
    const cases = [
      [{}, '   '],
      [{}, 'x'.repeat(16001)],
      [{ noRoom: true }, 'hi'],
      [{ membership: 'invite' }, 'hi'],
      [{ membership: 'leave' }, 'hi'],
    ] as const;
    await Promise.all(
      cases.map(async ([opts, text]) => {
        const { mx, sent } = makeClient(opts);
        assert.equal(await sendDesktopReply(mx, { roomId: '!r:x', text }), false);
        assert.deepEqual(sent, []);
      })
    );
  });
});
