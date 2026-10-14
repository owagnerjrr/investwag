import { test } from "node:test";
import assert from "node:assert/strict";
import { guard } from "../quant/guard.js";
const config = {
  assetBps: 2500,
  totalBps: 5000,
  concentrationBps: 3000,
  dailyLossBps: 500,
  maxOperations: 3,
  minLiquidity: 10,
  allowUnknownLiquidity: false,
};
const state = {
  status: "RUNNING",
  cashCents: "10000",
  investedCents: "0",
  dailyOperations: 0,
  dayStartEquity: "10000",
};
const run = (extra) =>
  guard({
    side: "BUY",
    state,
    equity: 10000n,
    proposedCents: 2000n,
    config,
    liquidity: 100,
    ...extra,
  });
test("Guard verifica risco, liquidez, saldo, perda e pausa independentemente", () => {
  assert.equal(run({}).allowed, true);
  assert.ok(run({ paused: true }).reasons.includes("PAUSED"));
  assert.ok(run({ stale: true }).reasons.includes("STALE_DATA"));
  assert.ok(run({ liquidity: null }).reasons.includes("UNKNOWN_LIQUIDITY"));
  assert.ok(run({ proposedCents: 6000n }).reasons.includes("TOTAL_EXPOSURE"));
  assert.ok(run({ equity: 9000n }).reasons.includes("DAILY_LOSS"));
  assert.ok(
    run({ state: { ...state, dailyOperations: 3 } }).reasons.includes(
      "DAILY_OPERATIONS",
    ),
  );
  assert.equal(run({ side: "SELL", proposedCents: 99999n }).allowed, true);
  assert.equal(run({ side: "SELL", paused: true }).allowed, false);
});
