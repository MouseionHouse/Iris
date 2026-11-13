// Run with `npm test`. The hub origins come from the build (VITE_HUB_ORIGINS, VITE_HUB_PREVIEW_PATTERN);
// these check the rule with a hub and a preview pattern, with a list, and with none.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isHubOrigin, parseHubConfig, resolveHubOrigin } from '../src/app/hub/hubBridge.ts';

describe('a build that names no hub', () => {
  const config = parseHubConfig(undefined, undefined);

  it('accepts no origin', () => {
    assert.equal(isHubOrigin(config, 'https://hub.example.org'), false);
    assert.equal(isHubOrigin(config, 'https://example.org'), false);
  });

  it('has no hub to talk to, framed or not', () => {
    assert.equal(resolveHubOrigin(config, 'https://hub.example.org'), undefined);
    assert.equal(resolveHubOrigin(config, undefined), undefined);
  });

  it('treats empty and blank settings as none', () => {
    const blank = parseHubConfig('  ', ' ');
    assert.deepEqual(blank.origins, []);
    assert.equal(blank.preview, undefined);
    assert.equal(resolveHubOrigin(blank, 'https://hub.example.org'), undefined);
  });
});

describe('a hub with previews', () => {
  const config = parseHubConfig('https://hub.example.org', 'https://hub-pr-[0-9]+\\.example\\.org');

  it('accepts the hub and its pull-request previews', () => {
    assert.equal(isHubOrigin(config, 'https://hub.example.org'), true);
    assert.equal(isHubOrigin(config, 'https://hub-pr-12.example.org'), true);
  });

  it('refuses anything else', () => {
    [
      'http://hub.example.org',
      'https://hub.example.org:8443',
      'https://hub-pr-.example.org',
      'https://hub-pr-12x.example.org',
      'https://hub-pr-12.example.org.evil.example',
      'https://evil.example/https://hub-pr-12.example.org',
      'https://evilhub.example.org',
      'https://iris.example.org',
      'https://example.org',
      'null',
      '',
    ].forEach((origin) => assert.equal(isHubOrigin(config, origin), false, origin));
  });

  it('talks to the framing page when it is the hub or a preview', () => {
    assert.equal(resolveHubOrigin(config, 'https://hub.example.org'), 'https://hub.example.org');
    assert.equal(
      resolveHubOrigin(config, 'https://hub-pr-12.example.org'),
      'https://hub-pr-12.example.org'
    );
  });

  it('falls back to the hub when the framing page is another or unknown', () => {
    assert.equal(resolveHubOrigin(config, 'https://evil.example'), 'https://hub.example.org');
    assert.equal(resolveHubOrigin(config, undefined), 'https://hub.example.org');
  });
});

describe('a list of hubs', () => {
  it('accepts each, and no preview without a pattern', () => {
    const config = parseHubConfig(' https://hub.example.org  https://other.example.org ', '');
    assert.deepEqual(config.origins, ['https://hub.example.org', 'https://other.example.org']);
    assert.equal(isHubOrigin(config, 'https://other.example.org'), true);
    assert.equal(isHubOrigin(config, 'https://hub-pr-1.example.org'), false);
  });
});
