import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { containerHint } from '../src/look.js';

describe('containerHint', () => {
  test('inside a container, a localhost URL gets the host.docker.internal and --network host advice', () => {
    const hint = containerHint('http://localhost:3000/settings?tab=2', true);
    assert.match(hint, /localhost is the container itself/);
    assert.match(hint, /http:\/\/host\.docker\.internal:3000\/settings\?tab=2/);
    assert.match(hint, /--network host/);
    assert.match(containerHint('http://127.0.0.1:5173/', true), /host\.docker\.internal:5173/);
  });

  test('no hint outside a container or for other hosts', () => {
    assert.equal(containerHint('http://localhost:3000/', false), '');
    assert.equal(containerHint('https://example.com/', true), '');
    assert.equal(containerHint('http://host.docker.internal:3000/', true), '');
  });
});
