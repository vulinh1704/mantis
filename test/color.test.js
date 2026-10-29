import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { deltaE2000, hexDistance, parseHex, toLab } from '../src/color.js';

describe('CIEDE2000', () => {
  // Pairs from Sharma, Wu and Dalal, "The CIEDE2000 color-difference formula" (2005), table 1.
  const pairs = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ];
  for (const [a, b, expected] of pairs) {
    test(`${a.join(', ')} vs ${b.join(', ')} = ${expected}`, () => {
      assert.ok(Math.abs(deltaE2000(a, b) - expected) < 1e-4, String(deltaE2000(a, b)));
      assert.ok(Math.abs(deltaE2000(b, a) - expected) < 1e-4, 'symmetric');
    });
  }
});

describe('hex helpers', () => {
  test('parseHex', () => {
    assert.deepEqual(parseHex('#4f46e5'), [79, 70, 229, 1]);
    assert.deepEqual(parseHex('#fff'), [255, 255, 255, 1]);
    assert.deepEqual(parseHex('#00000080'), [0, 0, 0, 0.5]);
    assert.equal(parseHex('rgb(0,0,0)'), null);
  });

  test('toLab: white and black', () => {
    const [L, a, b] = toLab([255, 255, 255]);
    assert.ok(Math.abs(L - 100) < 0.01 && Math.abs(a) < 0.01 && Math.abs(b) < 0.01);
    assert.ok(Math.abs(toLab([0, 0, 0])[0]) < 1e-9);
  });

  test('hexDistance: near copies are small, other colors and other alphas are not', () => {
    assert.ok(hexDistance('#4f46e5', '#4f46e6') < 0.5);
    assert.ok(hexDistance('#4f46e5', '#4338ca') > 5);
    assert.equal(hexDistance('#000000', '#00000080'), Infinity);
    assert.equal(hexDistance('#4f46e5', '#4f46e5'), 0);
  });
});
