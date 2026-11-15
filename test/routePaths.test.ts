// Run with `npm test`. The path helpers in src/app/pages/pathUtils.ts pass raw Matrix IDs to
// react-router's generatePath and rely on it to encode them. Since react-router 8.3 it encodes a
// param for a path segment (RFC 3986): `/ ? # %`, spaces and non-ASCII are escaped, while
// `: @ $ & + , ; =` stay as they are. Encoding the IDs first as well would escape their `%` again.
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
  it('keeps the colon of a space ID', () => {
    assert.equal(
      generatePath(SPACE_LOBBY_PATH, { spaceIdOrAlias: '!abc:example.org' }),
      '/!abc:example.org/lobby'
    );
  });

  it('escapes what would change the URL: # of an alias, / of an event', () => {
    assert.equal(
      generatePath(SPACE_ROOM_PATH, {
        spaceIdOrAlias: '#space:example.org',
        roomIdOrAlias: '!room:example.org',
        eventId: '$event/with+chars',
      }),
      '/%23space:example.org/!room:example.org/$event%2Fwith+chars'
    );
  });

  it('leaves out an optional param that is absent', () => {
    assert.equal(
      generatePath(HOME_ROOM_PATH, { roomIdOrAlias: '!r:x.org', eventId: null }),
      '/home/!r:x.org'
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

  it('from links made before react-router 8, with `:` as %3A', () => {
    const matches = matchRoutes(routes, '/%23space%3Aexample.org/lobby/');
    assert.equal(matches?.[0].params.spaceIdOrAlias, '#space:example.org');
  });
});
