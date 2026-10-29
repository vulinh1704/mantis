/**
 * QR encoder. The expected hashes are of matrices made by the Python `qrcode` library (8.2) with
 * the same text, version, level M and mask; src/qr.js matched it on 64 of 64 cases (8 texts x 8
 * masks, versions 1-10) when it was written.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import { qrEncode, qrSvg } from '../src/qr.js';

const hash = (q) => createHash('sha1').update(q.modules.map((row) => row.map((d) => (d ? '1' : '0')).join('')).join('\n')).digest('hex');

describe('qr', () => {
  test('matches the reference encoder', () => {
    const repo = qrEncode('https://github.com/vulinh1704/mantis');
    assert.deepEqual([repo.version, repo.mask, repo.size], [3, 2, 29]);
    assert.equal(hash(repo), '58ab53ded2c2974bd9b9dc4d852a544cc51e1a85');
    assert.equal(hash(qrEncode('Đăng ký nhận bản tin', { mask: 5 })), '3bedcd45298bacaa205e2dec46062cca14bc0620');
    const long = qrEncode('z'.repeat(150), { mask: 6 });
    assert.deepEqual([long.version, long.size], [8, 49]);
    assert.equal(hash(long), '0009391c945fc38869f73451f93e50fe929ce7e3');
  });

  test('picks the smallest version that fits and refuses text that does not', () => {
    assert.equal(qrEncode('x'.repeat(14)).version, 1);
    assert.equal(qrEncode('x'.repeat(15)).version, 2);
    assert.equal(qrEncode('x'.repeat(213)).version, 10);
    assert.throws(() => qrEncode('x'.repeat(214)), /too long/);
  });

  test('renders an SVG with a quiet zone', () => {
    const svg = qrSvg('https://github.com/vulinh1704/mantis', { size: 80 });
    assert.match(svg, /^<svg [^>]*width="80" height="80" viewBox="0 0 37 37"/);
    assert.match(svg, /<path d="M4 4h1v1h-1z/);
  });
});
