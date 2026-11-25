// Run with `npm test`. Scheduled messages over MSC4140 delayed events.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ScheduleError,
  computeDelayMs,
  isScheduledMessage,
  normaliseDelayedEvent,
  normaliseDelayedEvents,
  parseDelayTooLarge,
  scheduleMessage,
  scheduleTimeProblem,
} from '../src/app/utils/delayedEvents.ts';
import { schedulePresets, sendDay } from '../src/app/features/room/schedule-send/scheduleTime.ts';

const ROOM = '!lounge:example.org';

// as Synapse 1.165 answers GET /_matrix/client/unstable/org.matrix.msc4140/delayed_events
const synapseItem = {
  delay_id: 'syd_a',
  room_id: ROOM,
  type: 'm.room.message',
  delay_ms: 60000,
  delayed_since_ts: 1_000_000,
  content: { msgtype: 'm.text', body: 'bins at 7' },
  delay: 60000,
  running_since: 1_000_000,
};

describe('the delayed events list', () => {
  it('reads Synapse 1.165: { delayed_events } with delay_ms and delayed_since_ts', () => {
    const list = normaliseDelayedEvents({ delayed_events: [synapseItem] });
    assert.deepEqual(list, [
      {
        delayId: 'syd_a',
        roomId: ROOM,
        type: 'm.room.message',
        stateKey: undefined,
        content: { msgtype: 'm.text', body: 'bins at 7' },
        delayMs: 60000,
        delayedSinceTs: 1_000_000,
        sendTs: 1_060_000,
      },
    ]);
  });

  it("reads js-sdk 41.7's type: { scheduled } with delay and running_since", () => {
    const list = normaliseDelayedEvents({
      scheduled: [
        {
          delay_id: 'b',
          room_id: ROOM,
          type: 'm.room.encrypted',
          delay: 5000,
          running_since: 2_000_000,
          content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'AwgA' },
        },
      ],
    });
    assert.equal(list.length, 1);
    assert.equal(list[0].delayId, 'b');
    assert.equal(list[0].sendTs, 2_005_000);
  });

  it('takes the send time from either field set, the current one first', () => {
    const current = { delay_id: 'x', room_id: ROOM, type: 'm.room.message', content: {} };
    assert.equal(
      normaliseDelayedEvent({ ...current, delay_ms: 10, delayed_since_ts: 100 })?.sendTs,
      110
    );
    assert.equal(normaliseDelayedEvent({ ...current, delay: 20, running_since: 100 })?.sendTs, 120);
    assert.equal(
      normaliseDelayedEvent({
        ...current,
        delay_ms: 10,
        delayed_since_ts: 100,
        delay: 999,
        running_since: 999,
      })?.sendTs,
      110
    );
  });

  it('drops malformed items and sorts by send time', () => {
    const later = { ...synapseItem, delay_id: 'later', delay_ms: 90000, delay: 90000 };
    const list = normaliseDelayedEvents({
      delayed_events: [later, { delay_id: 'broken' }, null, synapseItem],
    });
    assert.deepEqual(
      list.map((e) => e.delayId),
      ['syd_a', 'later']
    );
    assert.deepEqual(normaliseDelayedEvents(undefined), []);
    assert.deepEqual(normaliseDelayedEvents({}), []);
  });

  it('lists messages, never delayed state events', () => {
    const [message, encrypted, membership] = normaliseDelayedEvents({
      delayed_events: [
        synapseItem,
        { ...synapseItem, delay_id: 'e', type: 'm.room.encrypted', delay_ms: 60001 },
        {
          ...synapseItem,
          delay_id: 'call',
          type: 'org.matrix.msc3401.call.member',
          state_key: '_@hector:example.org_DEVICE',
          delay_ms: 60002,
        },
      ],
    });
    assert.equal(isScheduledMessage(message), true);
    assert.equal(isScheduledMessage(encrypted), true);
    assert.equal(isScheduledMessage(membership), false);
    assert.equal(isScheduledMessage({ ...message, stateKey: '' }), false);
  });
});

describe('the too-far-ahead error', () => {
  // the MatrixError js-sdk throws for Synapse 1.165's answer
  const synapseError = {
    errcode: 'ORG.MATRIX.MSC4140_DELAY_TOO_LARGE',
    data: {
      errcode: 'ORG.MATRIX.MSC4140_DELAY_TOO_LARGE',
      error: 'The requested delay (691200000ms) exceeds the allowed maximum (604800000ms)',
    },
    message:
      'MatrixError: [400] The requested delay (691200000ms) exceeds the allowed maximum (604800000ms)',
  };

  it("reads Synapse's maximum from the error text", () => {
    assert.deepEqual(parseDelayTooLarge(synapseError), { maxDelayMs: 604800000 });
  });

  it('is still recognised when the text has no maximum', () => {
    assert.deepEqual(
      parseDelayTooLarge({ errcode: 'ORG.MATRIX.MSC4140_DELAY_TOO_LARGE', data: { error: 'no' } }),
      {}
    );
  });

  it("takes MSC4140's errcode and a maximum field", () => {
    assert.deepEqual(
      parseDelayTooLarge({
        errcode: 'M_MAX_DELAY_EXCEEDED',
        data: { 'org.matrix.msc4140.max_delay': 3600000 },
      }),
      { maxDelayMs: 3600000 }
    );
  });

  it('leaves other errors alone', () => {
    assert.equal(parseDelayTooLarge({ errcode: 'M_FORBIDDEN', data: {} }), undefined);
    assert.equal(parseDelayTooLarge(new Error('network')), undefined);
    assert.equal(parseDelayTooLarge(undefined), undefined);
  });
});

describe('the delay', () => {
  const now = 1_000_000;

  it('is the time left until the send time', () => {
    assert.equal(computeDelayMs(now + 10000, undefined, now), 10000);
    assert.equal(computeDelayMs(now + 10000.4, undefined, now), 10000);
  });

  it('rejects a time in the past, or now', () => {
    assert.throws(() => computeDelayMs(now - 1, undefined, now), ScheduleError);
    assert.throws(
      () => computeDelayMs(now, undefined, now),
      (e: ScheduleError) => e.kind === 'past'
    );
    assert.equal(scheduleTimeProblem(now - 60000, now), 'past');
  });

  it("rejects a time beyond the server's limit, once known", () => {
    assert.equal(scheduleTimeProblem(now + 7200000, now), undefined);
    assert.equal(scheduleTimeProblem(now + 7200000, now, 3600000), 'tooFar');
    assert.equal(scheduleTimeProblem(now + 3600000, now, 3600000), undefined);
    assert.throws(
      () => computeDelayMs(now + 7200000, 3600000, now),
      (e: ScheduleError) => e.kind === 'tooFar'
    );
  });
});

describe('scheduling in an encrypted room', () => {
  const content = { msgtype: 'm.text', body: 'the door code is 4321' };

  const fakeClient = (crypto: unknown) => {
    const sent: { type: string; content: Record<string, unknown> }[] = [];
    const mx = {
      getUserId: () => '@hector:example.org',
      getCrypto: () => crypto,
      _unstable_sendDelayedEvent: async (
        _roomId: string,
        _delay: unknown,
        _thread: unknown,
        type: string,
        body: Record<string, unknown>
      ) => {
        sent.push({ type, content: body });
        return { delay_id: `d${sent.length}` };
      },
    };
    return { mx: mx as unknown as Parameters<typeof scheduleMessage>[0], sent };
  };
  const room = (encrypted: boolean) =>
    ({ roomId: ROOM, hasEncryptionStateEvent: () => encrypted } as unknown as Parameters<
      typeof scheduleMessage
    >[1]);

  it('sends plain content in a room without encryption', async () => {
    const { mx, sent } = fakeClient(undefined);
    assert.equal(await scheduleMessage(mx, room(false), content, 1000), 'd1');
    assert.deepEqual(sent, [{ type: 'm.room.message', content }]);
  });

  it('never reaches the plain send without a crypto backend', async () => {
    const { mx, sent } = fakeClient(undefined);
    await assert.rejects(scheduleMessage(mx, room(true), content, 1000), ScheduleError);
    assert.deepEqual(sent, []);
  });

  it('never reaches the plain send when encryption fails', async () => {
    const { mx, sent } = fakeClient({
      encryptEvent: async () => {
        throw new Error('no room encryptor');
      },
    });
    await assert.rejects(scheduleMessage(mx, room(true), content, 1000), ScheduleError);
    assert.deepEqual(sent, []);
  });

  it('never reaches the plain send when encryption leaves the event as it was', async () => {
    const { mx, sent } = fakeClient({ encryptEvent: async () => undefined });
    await assert.rejects(scheduleMessage(mx, room(true), content, 1000), ScheduleError);
    assert.deepEqual(sent, []);
  });

  it('sends the ciphertext as m.room.encrypted', async () => {
    const ciphertext = {
      algorithm: 'm.megolm.v1.aes-sha2',
      ciphertext: 'AwgAEnB...',
      sender_key: 'k',
      device_id: 'D',
      session_id: 's',
    };
    const { mx, sent } = fakeClient({
      encryptEvent: async (event: {
        makeEncrypted: (t: string, c: object, s: string, e: string) => void;
      }) => {
        event.makeEncrypted('m.room.encrypted', ciphertext, 'curve', 'ed');
      },
    });
    await scheduleMessage(mx, room(true), content, 1000);
    assert.deepEqual(sent, [{ type: 'm.room.encrypted', content: ciphertext }]);
    assert.ok(!JSON.stringify(sent).includes('4321'));
  });
});

describe("the picker's presets", () => {
  // Friday 13 November 2026, 15:20:30 local time
  const friday = new Date(2026, 10, 13, 15, 20, 30).getTime();
  const at = (ts: number) => {
    const d = new Date(ts);
    return [d.getDate(), d.getHours(), d.getMinutes()];
  };

  it('in an hour, to the next whole minute', () => {
    assert.deepEqual(at(schedulePresets(friday)[0].sendTs), [13, 16, 21]);
  });

  it('tomorrow at 8:00 and 13:00, and Monday at 8:00', () => {
    const [, morning, afternoon, monday] = schedulePresets(friday);
    assert.deepEqual(at(morning.sendTs), [14, 8, 0]);
    assert.deepEqual(at(afternoon.sendTs), [14, 13, 0]);
    assert.deepEqual(at(monday.sendTs), [16, 8, 0]);
  });

  it('on a Monday, Monday morning is next week', () => {
    const monday = new Date(2026, 10, 16, 9, 0).getTime();
    assert.deepEqual(at(schedulePresets(monday)[3].sendTs), [23, 8, 0]);
  });

  it('names the day: today, tomorrow, this week, later', () => {
    assert.equal(sendDay(friday + 60000, friday), 'today');
    assert.equal(sendDay(new Date(2026, 10, 14, 1).getTime(), friday), 'tomorrow');
    assert.equal(sendDay(new Date(2026, 10, 19, 1).getTime(), friday), 'thisWeek');
    assert.equal(sendDay(new Date(2026, 10, 20, 1).getTime(), friday), 'later');
  });
});
