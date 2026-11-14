// Run with `npm test`. The path helpers in src/app/pages/pathUtils.ts pass raw Matrix IDs to
// react-router's generatePath and rely on it to encode them: since react-router 7 it runs
// encodeURIComponent on every param, so encoding them first as well gives `%253A` for `:`.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePath, matchRoutes } from 'react-router';
import {
  HOME_ROOM_PATH,
  LOGIN_PATH,
  SPACE_LOBBY_PATH,
  SPACE_PATH,
  SPACE_ROOM_PATH,
} from '../src/app/pages/paths.ts';

describe('generatePath encodes route params once', () => {
  it('encodes a space ID the way the app has always linked it', () => {
    assert.equal(
      generatePath(SPACE_LOBBY_PATH, { spaceIdOrAlias: '!abc:example.org' }),
      '/!abc%3Aexample.org/lobby'
    );
  });

  it('encodes an alias, a room and an event', () => {
    assert.equal(
      generatePath(SPACE_ROOM_PATH, {
        spaceIdOrAlias: '#space:example.org',
        roomIdOrAlias: '!room:example.org',
        eventId: '$event/with+chars',
      }),
      '/%23space%3Aexample.org/!room%3Aexample.org/%24event%2Fwith%2Bchars'
    );
  });

  it('leaves out an optional param that is absent', () => {
    assert.equal(
      generatePath(HOME_ROOM_PATH, { roomIdOrAlias: '!r:x.org', eventId: null }),
      '/home/!r%3Ax.org'
    );
    assert.equal(generatePath(LOGIN_PATH, { server: 'matrix.org' }), '/login/matrix.org');
  });
});

describe('route params decode back to the IDs', () => {
  const routes = [{ path: SPACE_PATH, children: [{ path: 'lobby/' }] }];
  for (const id of ['!abc:example.org', '#space:example.org', '#a/b?c:example.org']) {
    it(id, () => {
      const url = generatePath(SPACE_LOBBY_PATH, { spaceIdOrAlias: id });
      const matches = matchRoutes(routes, url);
      assert.equal(matches?.[0].params.spaceIdOrAlias, id);
    });
  }
});
