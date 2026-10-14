import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, rsi, volatility, analyze } from '../quant/indicators.js';
import { fetchRates } from '../quant/market.js';
test('indicadores com sequências conhecidas e warmup', () => {
  assert.equal(sma([1, 2, 3, 4], 3), 3);
  assert.equal(ema([1, 2, 3, 4], 3), 3);
  assert.equal(sma([1], 2), null);
  assert.equal(rsi(Array(16).fill(2)), 50);
  assert.equal(rsi(Array.from({ length: 16 }, (_, i) => i + 1)), 100);
  assert.equal(rsi(Array.from({ length: 16 }, (_, i) => 20 - i)), 0);
  assert.equal(volatility(Array(30).fill(3)), 0);
  assert.equal(analyze([]).stale, true);
});
test('fonte valida origem, ordena e não inventa dados ausentes', async () => {
  const rows = [{ base:'USD', quote:'BRL', date:'2025-01-03', rate:6.2, providers:[{key:'ECB',date:'2025-01-02',rate:6.2}] }, { base:'USD', quote:'BRL', date:'2025-01-02', rate:6.1 }];
  const fetcher = async url => { assert.equal(url.hostname, 'api.frankfurter.dev'); return new Response(JSON.stringify(rows)); };
  const bars = await fetchRates('USD-BRL', '2025-01-01', '2025-01-04', fetcher);
  assert.equal(bars[0].priceMicros, 6100000n);
  assert.equal(bars[1].sourceDate,'2025-01-02');
  assert.match(bars[1].source,/ECB/);
  assert.equal(bars[1].provenance[0].key,'ECB');
  await assert.rejects(fetchRates('USD-BRL', '2025-01-01', '2025-01-04', async () => new Response('[]')));
  await assert.rejects(fetchRates('USD-BRL', '2025-01-01', '2025-01-04', async () => new Response(JSON.stringify([{ ...rows[0], rate:-1 }]))));
});
