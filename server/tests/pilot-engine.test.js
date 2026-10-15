import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  movement,
  reconcile,
  advance,
  selectStrategy,
  guard3,
  DEFAULT_POLICY,
  policyFromEnv,
  summary,
} from "../pilot/engine.js";
const day = (i) =>
  new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const bars = (values) =>
  values.map((p, i) => ({
    date: day(i),
    sourceDate: day(i),
    priceMicros: String(Math.round(p * 1e6)),
    volumeCents: "100000000000",
    source: "SYNTHETIC TEST FIXTURE",
  }));
const now = new Date("2026-07-10T18:00:00Z");
const asset = (series) => ({
  symbol: "TEST-BRL",
  market: "CRYPTO",
  source: "SYNTHETIC TEST FIXTURE",
  executionEligible: true,
  bars: series,
});
test("pilot ledger: P/L, deposits and withdrawals remain distinct, including withdrawing realized profits", () => {
  let s = movement(emptyState(), "DEPOSIT", "10000");
  s = movement(s, "WITHDRAW", "1000");
  assert.equal(s.equityCents, "9000");
  assert.equal(summary(s).netCents, "0");
  assert.throws(() => movement(s, "WITHDRAW", "9001"));
  s.cashCents = "10000";
  s.realizedCents = "1000";
  reconcile(s);
  s = movement(s, "WITHDRAW", "10000");
  assert.equal(s.withdrawnCents, "11000");
  assert.equal(s.equityCents, "0");
  assert.equal(s.realizedCents, "1000");
  assert.throws(() => reconcile({ ...s, cashCents: "1" }));
  assert.throws(() => movement(s, "INVALID", "10"));
  assert.throws(() => movement(s, "DEPOSIT", "999"));
});
test("pilot Guard independently vetoes risk, market, costs, stale/reference data, liquidity and failures", () => {
  const state = movement(emptyState(), "DEPOSIT", "100000");
  state.dayStartPnlCents = "0";
  state.dayRiskCapitalCents = "100000";
  const input = {
    state,
    asset: asset([]),
    bar: {
      date: "2026-07-09",
      sourceDate: "2026-07-09",
      priceMicros: "100000000",
      volumeCents: "100000000000",
    },
    side: "BUY",
    order: { quantity: 100000n, notional: 1000n, total: 1001n },
    policy: DEFAULT_POLICY,
    now,
    volatilityValue: 0.1,
  };
  assert.equal(guard3(input).allowed, true);
  for (const [override, reason] of [
    [{ paused: true }, "PAUSED"],
    [{ failures: 3 }, "FAILURE_CIRCUIT"],
    [
      { asset: { ...input.asset, referenceOnly: true } },
      "DATA_NOT_EXECUTION_ELIGIBLE",
    ],
    [{ bar: { ...input.bar, volumeCents: null } }, "LIQUIDITY"],
    [
      { bar: { ...input.bar, sourceDate: "2026-06-01" } },
      "STALE_OR_UNAVAILABLE",
    ],
    [{ volatilityValue: 4 }, "VOLATILITY"],
    [{ policy: { ...DEFAULT_POLICY, feeBps: 101 } }, "COST"],
    [{ state: { ...state, operations: 4 } }, "OPERATION_LIMIT"],
    [{ state: { ...state, maxDrawdownBps: 1000 } }, "DRAWDOWN"],
  ])
    assert.ok(
      guard3({ ...input, ...override }).reasons.includes(reason),
      reason,
    );
  const exposed = {
    ...state,
    investedCents: "30000",
    positions: {
      other: {
        market: "CRYPTO",
        quantity: "1000000",
        priceMicros: "300000000",
        costCents: "30000",
      },
    },
  };
  assert.ok(
    guard3({
      ...input,
      state: exposed,
      order: { quantity: 1n, total: 20001n, notional: 20000n },
    }).reasons.includes("MARKET_EXPOSURE"),
  );
  assert.ok(
    guard3({
      ...input,
      state: { ...state, unrealizedCents: "-3000" },
    }).reasons.includes("DAILY_LOSS"),
  );
  assert.throws(() => policyFromEnv('{"totalBps":9000}'));
  assert.throws(() => policyFromEnv('{"unknown":1}'));
});
test("selection: bounded candidates, chronological train/validation, reproducible and can retain cash", () => {
  const series = bars(
    Array.from({ length: 150 }, (_, i) => 100 + 0.05 * i + 3 * Math.sin(i / 8)),
  );
  const result = selectStrategy(series);
  assert.equal(result.candidates, 2);
  assert.ok(result.trainEnd < result.validationStart);
  assert.ok(result.through === series.at(-1).date);
  assert.deepEqual(result, selectStrategy(series));
  assert.equal(selectStrategy(series.slice(0, 30)).eligible, false);
  assert.equal(selectStrategy(bars(Array(120).fill(100))).eligible, false);
});
test("paper: causal next observation fill, consolidated cash, checkpoint, pause, and future leakage protection", () => {
  const now = new Date(day(39) + "T18:00:00Z");
  const series = bars([
    ...Array(30).fill(100),
    100,
    99,
    98,
    99,
    100,
    101,
    99,
    98,
    99,
    100,
    101,
  ]);
  let s = movement(emptyState(), "DEPOSIT", "100000");
  s.startedOn = day(34);
  s.selections["TEST-BRL"] = {
    eligible: true,
    strategy: { fast: 2, slow: 3 },
    through: day(34),
    reason: "SYNTHETIC PINNED TEST",
    score: 1,
  };
  const result = advance(s, [asset(series)], DEFAULT_POLICY, { now });
  assert.ok(result.events.some((e) => e.order?.side === "BUY"));
  assert.ok(result.events.some((e) => e.order?.side === "SELL"));
  assert.ok(result.events.some((e) => e.signal?.side === "WAIT"));
  assert.equal(
    result.state.equityCents,
    String(
      BigInt(result.state.contributedCents) -
        BigInt(result.state.withdrawnCents) +
        BigInt(result.state.realizedCents) +
        BigInt(result.state.unrealizedCents),
    ),
  );
  assert.ok(BigInt(result.state.cashCents) >= 0n);
  const again = advance(result.state, [asset(series)], DEFAULT_POLICY, { now });
  assert.equal(again.processedDates, 0);
  assert.equal(again.events.length, 0);
  const reinvest = advance(result.state, [asset(series)], DEFAULT_POLICY, {
    now: new Date(day(42) + "T18:00:00Z"),
  });
  const firstBuy = result.events.find((e) => e.order?.side === "BUY"),
    newBuy = reinvest.events.find((e) => e.order?.side === "BUY");
  assert.ok(newBuy);
  assert.ok(BigInt(newBuy.order.quantity) < BigInt(firstBuy.order.quantity));
  const paused = advance(s, [asset(series)], DEFAULT_POLICY, {
    now,
    paused: true,
  });
  assert.equal(paused.events.filter((e) => e.order).length, 0);
  const prefix = advance(s, [asset(series.slice(0, 38))], DEFAULT_POLICY, {
    now,
  });
  assert.deepEqual(
    prefix.events,
    result.events.filter((e) => e.date <= day(37)),
  );
  const lateAsset = { ...asset(series.slice(0, 38)), symbol: "LATE-BRL" };
  assert.equal(
    advance(result.state, [lateAsset], DEFAULT_POLICY, { now }).events.length,
    0,
    "late data must not trade using a future-valued portfolio",
  );
  assert.equal(
    advance(s, [{ ...asset(series), referenceOnly: true }], DEFAULT_POLICY, {
      now,
    }).events.filter((e) => e.order).length,
    0,
  );
});
test("abnormal discontinuity and corrupt ledger fail closed; funding does not fabricate daily returns", () => {
  const s = movement(emptyState(), "DEPOSIT", "100000");
  s.startedOn = day(33);
  const series = bars([...Array(35).fill(100), 200]);
  assert.equal(
    advance(s, [asset(series)], DEFAULT_POLICY, { now }).protect,
    true,
  );
  assert.throws(() =>
    advance({ ...s, cashCents: "0" }, [asset(series)], DEFAULT_POLICY, { now }),
  );
  assert.equal(summary(movement(s, "DEPOSIT", "10000"), now).dailyCents, "0");
});
test("open position retains its selected strategy after research window expires", () => {
  const series = bars([
    ...Array(30).fill(100),
    100,
    99,
    98,
    99,
    100,
    101,
    99,
    98,
    99,
    100,
    101,
  ]);
  const s = movement(emptyState(), "DEPOSIT", "100000");
  s.startedOn = day(34);
  s.cashCents = "80000";
  s.positions["TEST-BRL"] = {
    quantity: "2000000",
    costCents: "20000",
    priceMicros: "100000000",
    sourceDate: day(34),
    market: "CRYPTO",
    selection: {
      eligible: true,
      strategy: { fast: 2, slow: 3 },
      through: day(0),
      reason: "SYNTHETIC FROZEN STRATEGY",
    },
  };
  const result = advance(reconcile(s), [asset(series)], DEFAULT_POLICY, {
    now: new Date(day(39) + "T18:00:00Z"),
  });
  assert.ok(
    result.events.some((e) => e.order?.side === "SELL"),
    "must use the original exit strategy, not a newly optimized candidate",
  );
});
