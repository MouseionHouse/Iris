// Run with `npm test` (Node's own runner; it strips the types, so the files under test import nothing).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IRIS_SOURCE_URL } from '../src/app/sourceCode.ts';

describe('IRIS_SOURCE_URL', () => {
  it('names the public repo', () => {
    assert.equal(IRIS_SOURCE_URL, 'https://github.com/MouseionHouse/Iris');
  });
});
