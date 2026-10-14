import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, step, metrics, datasetHash } from '../quant/simulation.js';
export const testConfig = { strategy:{fast:2,slow:3}, feeBps:0,slippageBps:0,allocationBps:2000,
  risk:{assetBps:3000,totalBps:5000,concentrationBps:3000,dailyLossBps:1000,maxOperations:2,minLiquidity:0,allowUnknownLiquidity:true} };
const bars = [4,3,2,5,6,1,1,1].map((p,i) => ({date:`2025-01-${String(i+1).padStart(2,'0')}`,priceMicros:String(p*1e6),source:'TEST FIXTURE — not market data'}));
const run = input => {
  let state = initialState(10000); const events = [];
  input.forEach((b,i) => { const result = step(state,input.slice(0,i),b,testConfig); state = result.state; events.push(result.event); });
  return {state,events};
};
test('backtest reproduzível, execução na próxima observação e resultado conhecido', () => {
  const a = run(bars), b = run(bars);
  assert.deepEqual(a,b);
  assert.equal(a.events[3].order,null);
  assert.equal(a.events[4].order.side,'BUY');
  assert.equal(a.events[4].order.executionPrice,'6000000');
  assert.equal(a.state.trades,2);
  assert.equal(a.state.quantity,'0');
  assert.equal(a.state.equityCents,'8333');
  assert.equal(metrics(a.state,bars).netCents,'-1667');
  assert.equal(metrics(a.state).winRate,0);
  assert.ok(metrics(a.state).maxDrawdownBps > 0);
});
test('prefixo não muda ao anexar preços futuros; pausa e checkpoint bloqueiam', () => {
  assert.deepEqual(run(bars).events.slice(0,5),run(bars.slice(0,5)).events);
  const state = run(bars.slice(0,2)).state;
  assert.throws(() => step(state,[],bars[1],testConfig),/duplicado/);
  assert.throws(() => step(state,[],bars[2],testConfig,{paused:true}),/pausada/);
  assert.notEqual(datasetHash(bars),datasetHash(bars.slice(0,2)));
});
