import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signal, fill, sizePosition } from '../quant/strategy.js';
const bars = prices => prices.map(priceMicros => ({ priceMicros }));
test('cruzamento tem motivo verificável e não usa futuro', () => {
  assert.equal(signal(bars([4,3,2,5]), { fast:2, slow:3 }).side, 'BUY');
  assert.equal(signal(bars([1,2,3,1]), { fast:2, slow:3 }).side, 'SELL');
  assert.equal(signal(bars([1,2]), { fast:2, slow:3 }).side, 'WAIT');
});
test('posição, taxas e slippage em inteiros conservadores', () => {
  const quantity = sizePosition(10000, 10000, 5000000, 2000, 100);
  assert.equal(quantity, 3960000n);
  const buy = fill('BUY', 1000000, 5000000, 100, 100);
  assert.deepEqual(buy, { executionPrice:5050000n, notional:505n, fee:6n, total:511n });
  assert.equal(fill('SELL', 1000000, 5000000, 100, 100).total, 490n);
});
