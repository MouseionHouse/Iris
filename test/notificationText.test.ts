// Run with `npm test`. Mirrors mobile/android/.../PushSummaryTest.java, plus what the desktop adds.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BODY_LENGTH,
  desktopNotificationText,
  stripHtml,
  summarizeEvent,
  toNotificationLine,
  trimReplyFallback,
} from '../src/app/native/notificationText.ts';

const message = (msgtype: string, body: string, extra: Record<string, unknown> = {}) => ({
  type: 'm.room.message',
  content: { msgtype, body, ...extra },
});
const bodyOf = (e: { type: string; content: Record<string, unknown> }, myUserId?: string) =>
  summarizeEvent(e.type, e.content, { myUserId }).text;

describe('what a message says (PushSummaryTest)', () => {
  it('text is its body without the reply fallback', () => {
    const e = message('m.text', '> <@hector:example.org> dinner?\n> second\n\nyes please\nat 7');
    // Android keeps the first line; the desktop keeps the lines, joined.
    assert.equal(bodyOf(e), 'yes please at 7');
    assert.equal(trimReplyFallback('> a\n> b\n\nhi'), 'hi');
    assert.equal(trimReplyFallback('no fallback'), 'no fallback');
  });

  it('media and empty content get short descriptions', () => {
    assert.equal(bodyOf(message('m.image', 'IMG_1.jpg')), '🖼 image');
    assert.equal(bodyOf(message('m.video', 'a.mp4')), '🎞 video');
    assert.equal(bodyOf(message('m.audio', 'a.ogg')), '🔊 audio');
    assert.equal(bodyOf(message('m.file', 'report.pdf')), '📎 report.pdf');
    assert.equal(bodyOf(message('m.file', '')), '📎 file');
    assert.equal(summarizeEvent('m.sticker', { body: 'wave' }).text, 'Sticker: wave');
    assert.equal(bodyOf({ type: 'm.room.message', content: {} }), 'Message deleted');
    assert.equal(summarizeEvent('m.room.message', undefined).text, 'Message deleted');
  });

  it('an emote is "* line"', () => {
    const s = summarizeEvent('m.room.message', { msgtype: 'm.emote', body: 'waves' });
    assert.deepEqual(s, { text: 'waves', emote: true });
  });

  it('an invite to me says so, anything else unknown is "New message"', () => {
    const invite = { membership: 'invite' };
    assert.equal(
      summarizeEvent('m.room.member', invite, { myUserId: '@john:x', stateKey: '@john:x' }).text,
      'Invited you'
    );
    assert.equal(
      summarizeEvent('m.room.member', invite, { myUserId: '@john:x', stateKey: '@other:x' }).text,
      'New message'
    );
    assert.equal(summarizeEvent('m.room.encrypted', { algorithm: 'x' }).text, 'New message');
    assert.equal(bodyOf(message('m.text', '')), 'New message');
  });
});

describe('what the desktop adds', () => {
  it('voice messages, polls and locations', () => {
    assert.equal(
      bodyOf(message('m.audio', 'v.ogg', { 'org.matrix.msc3245.voice': {} })),
      '🎤 voice message'
    );
    assert.equal(bodyOf(message('m.location', 'geo')), '📍 location');
    assert.equal(
      summarizeEvent('m.poll.start', { 'm.poll': { question: { 'm.text': 'Pizza?' } } }).text,
      '📊 poll: Pizza?'
    );
    assert.equal(
      summarizeEvent('org.matrix.msc3381.poll.start', {
        'org.matrix.msc3381.poll.start': { question: { body: 'Tea?' } },
      }).text,
      '📊 poll: Tea?'
    );
    assert.equal(summarizeEvent('m.poll.start', { 'm.poll': {} }).text, '📊 poll');
  });

  it('collapses whitespace and caps the text with an ellipsis', () => {
    assert.equal(toNotificationLine('  a \n\n b\t c  '), 'a b c');
    const long = toNotificationLine('x'.repeat(1000));
    assert.equal(Array.from(long).length, MAX_BODY_LENGTH);
    assert.ok(long.endsWith('…'));
    assert.equal(toNotificationLine('y'.repeat(MAX_BODY_LENGTH)), 'y'.repeat(MAX_BODY_LENGTH));
    // Never splits an emoji.
    assert.equal(Array.from(toNotificationLine('😀'.repeat(400))).length, MAX_BODY_LENGTH);
  });

  it('strips HTML when only a formatted body exists', () => {
    assert.equal(
      stripHtml(
        '<mx-reply><blockquote>old</blockquote></mx-reply><b>hi</b> &amp; <i>bye</i><br>x &lt;3 &#33; &#x41;'
      ),
      'hi & bye x <3 ! A'
    );
    assert.equal(
      bodyOf({
        type: 'm.room.message',
        content: {
          msgtype: 'm.text',
          body: '',
          formatted_body: '<p>hello <a href="x">there</a></p>',
        },
      }),
      'hello there'
    );
  });

  it('keeps markup of a message as text for the shell to escape', () => {
    assert.equal(bodyOf(message('m.text', '<b>x</b> & y')), '<b>x</b> & y');
  });

  it('group room: title is the room, body starts with the sender', () => {
    const e = message('m.text', 'dinner at 7?');
    assert.deepEqual(
      desktopNotificationText({ roomName: 'Kitchen', senderName: 'Alice', isDirect: false, ...e }),
      {
        title: 'Kitchen',
        body: 'Alice: dinner at 7?',
      }
    );
    assert.equal(
      desktopNotificationText({
        roomName: 'Kitchen',
        senderName: 'Alice',
        isDirect: false,
        ...message('m.image', 'a.png'),
      }).body,
      'Alice: 🖼 image'
    );
  });

  it('direct chat: title is the sender, body is the message alone', () => {
    assert.deepEqual(
      desktopNotificationText({
        roomName: 'Alice A.',
        senderName: 'Alice',
        isDirect: true,
        ...message('m.text', 'hi'),
      }),
      {
        title: 'Alice',
        body: 'hi',
      }
    );
  });

  it('emotes read "* Alice waves" in both', () => {
    const e = message('m.emote', 'waves');
    assert.equal(
      desktopNotificationText({ roomName: 'Kitchen', senderName: 'Alice', isDirect: false, ...e })
        .body,
      '* Alice waves'
    );
    assert.equal(
      desktopNotificationText({ roomName: 'x', senderName: 'Alice', isDirect: true, ...e }).body,
      '* Alice waves'
    );
  });

  it('the whole body, sender included, stays within the cap', () => {
    const { body } = desktopNotificationText({
      roomName: 'K',
      senderName: 'Alice',
      isDirect: false,
      ...message('m.text', 'z'.repeat(2000)),
    });
    assert.equal(Array.from(body).length, MAX_BODY_LENGTH);
    assert.ok(body.startsWith('Alice: z') && body.endsWith('…'));
  });
});
