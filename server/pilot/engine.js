import { signal, fill, sizePosition, valueCents } from "../quant/strategy.js";
import {
  initialState,
  step,
  datasetHash,
  serialize,
} from "../quant/simulation.js";
import { volatility, analyze } from "../quant/indicators.js";

export const VERSION = "pilot-v3.0.0";
export const DEFAULT_POLICY = Object.freeze({
  assetBps: 2000,
  marketBps: 3000,
  totalBps: 4000,
  concentrationBps: 2500,
  dailyLossBps: 200,
  drawdownBps: 1000,
  maxOperations: 4,
  minVolumeCents: "100000000",
  maxVolatility: 1.5,
  feeBps: 10,
  slippageBps: 20,
  maxCostBps: 100,
  maxPositions: 3,
});
export function policyFromEnv(value) {
  if (!value) return { ...DEFAULT_POLICY };
  const policy = { ...DEFAULT_POLICY, ...JSON.parse(value) };
  if (Object.keys(policy).some((k) => !(k in DEFAULT_POLICY)))
    throw Error("INVALID_POLICY");
  for (const k of [
    "assetBps",
    "marketBps",
    "totalBps",
    "concentrationBps",
    "dailyLossBps",
    "drawdownBps",
    "maxCostBps",
  ])
    if (
      !Number.isInteger(policy[k]) ||
      policy[k] < 1 ||
      policy[k] > DEFAULT_POLICY[k]
    )
      throw Error("POLICY_MUST_BE_CONSERVATIVE");
  for (const k of ["feeBps", "slippageBps"])
    if (!Number.isInteger(policy[k]) || policy[k] < 0 || policy[k] > 100)
      throw Error("INVALID_COST");
  for (const k of ["maxOperations", "maxPositions"])
    if (
      !Number.isInteger(policy[k]) ||
      policy[k] < 1 ||
      policy[k] > DEFAULT_POLICY[k]
    )
      throw Error("INVALID_POLICY");
  if (
    typeof policy.minVolumeCents !== "string" ||
    !/^\d{1,20}$/.test(policy.minVolumeCents) ||
    BigInt(policy.minVolumeCents) < BigInt(DEFAULT_POLICY.minVolumeCents) ||
    !Number.isFinite(policy.maxVolatility) ||
    policy.maxVolatility <= 0 ||
    policy.maxVolatility > DEFAULT_POLICY.maxVolatility
  )
    throw Error("INVALID_POLICY");
  return policy;
}
export function emptyState() {
  return {
    version: VERSION,
    cashCents: "0",
    contributedCents: "0",
    withdrawnCents: "0",
    realizedCents: "0",
    unrealizedCents: "0",
    investedCents: "0",
    equityCents: "0",
    positions: {},
    checkpoints: {},
    selections: {},
    curve: [],
    peakPnlCents: "0",
    maxDrawdownBps: 0,
    day: null,
    dayStartPnlCents: "0",
    operations: 0,
    alerts: [],
    scanner: [],
    lastAnalysis: null,
  };
}
const sum = (values) => values.reduce((a, b) => a + BigInt(b), 0n);
const pnl = (s) => BigInt(s.realizedCents) + BigInt(s.unrealizedCents);
export function reconcile(s) {
  if (
    !s.positions ||
    Array.isArray(s.positions) ||
    Object.keys(s.positions).length > DEFAULT_POLICY.maxPositions ||
    ["cashCents", "contributedCents", "withdrawnCents"].some(
      (k) => typeof s[k] !== "string" || !/^(0|[1-9]\d*)$/.test(s[k]),
    ) ||
    typeof s.realizedCents !== "string" ||
    !/^-?(0|[1-9]\d*)$/.test(s.realizedCents) ||
    Object.values(s.positions).some((p) =>
      ["quantity", "costCents", "priceMicros"].some(
        (k) => typeof p[k] !== "string" || !/^[1-9]\d*$/.test(p[k]),
      ),
    )
  )
    throw Error("PILOT_RECONCILIATION");
  const cost = sum(Object.values(s.positions).map((p) => p.costCents));
  const marked = sum(
    Object.values(s.positions).map((p) =>
      valueCents(p.quantity, p.priceMicros),
    ),
  );
  s.investedCents = String(marked);
  s.unrealizedCents = String(marked - cost);
  s.equityCents = String(BigInt(s.cashCents) + marked);
  if (
    BigInt(s.cashCents) < 0n ||
    BigInt(s.contributedCents) <
      BigInt(s.withdrawnCents) - BigInt(s.realizedCents) ||
    BigInt(s.equityCents) !==
      BigInt(s.contributedCents) - BigInt(s.withdrawnCents) + pnl(s) ||
    BigInt(s.cashCents) !==
      BigInt(s.contributedCents) -
        BigInt(s.withdrawnCents) +
        BigInt(s.realizedCents) -
        cost
  )
    throw Error("PILOT_RECONCILIATION");
  return s;
}
export function movement(previous, type, amount) {
  const s = structuredClone(previous),
    c = BigInt(amount);
  if (!["DEPOSIT", "WITHDRAW"].includes(type) || c <= 0n || c > 100000000000n)
    throw Error("INVALID_MOVEMENT");
  if (type === "DEPOSIT") {
    if (c < 1000n || BigInt(s.contributedCents) + c > 100000000000n)
      throw Error("MINIMUM_OR_LIMIT");
    s.cashCents = String(BigInt(s.cashCents) + c);
    s.contributedCents = String(BigInt(s.contributedCents) + c);
  } else {
    if (c > BigInt(s.cashCents)) throw Error("INSUFFICIENT_AVAILABLE");
    s.cashCents = String(BigInt(s.cashCents) - c);
    s.withdrawnCents = String(BigInt(s.withdrawnCents) + c);
  }
  return reconcile(s);
}
function researchReplay(bars, strategy, policy) {
  let s = initialState(1000000n);
  const config = {
    strategy,
    allocationBps: 2000,
    feeBps: policy.feeBps,
    slippageBps: policy.slippageBps,
    risk: {
      assetBps: 10000,
      totalBps: 10000,
      concentrationBps: 10000,
      dailyLossBps: 10000,
      maxOperations: 100,
      minLiquidity: 0,
      allowUnknownLiquidity: true,
    },
  };
  for (let i = 0; i < bars.length; i++)
    s = step(s, bars.slice(0, i), bars[i], config).state;
  return {
    netBps: Number(((BigInt(s.equityCents) - 1000000n) * 10000n) / 1000000n),
    drawdownBps: s.maxDrawdownBps,
    trades: s.trades,
  };
}
export function selectStrategy(history, policy = DEFAULT_POLICY) {
  if (history.length < 90)
    return {
      eligible: false,
      reason: "INSUFFICIENT_TRAIN_VALIDATION",
      version: VERSION,
    };
  // Fixed candidate budget. Train selects; a disjoint validation set can only veto that winner.
  const split = Math.floor(history.length * 0.7),
    train = history.slice(0, split),
    validation = history.slice(split);
  const candidates = [
    { fast: 5, slow: 20 },
    { fast: 10, slow: 30 },
  ].map((strategy) => ({
    strategy,
    train: researchReplay(train, strategy, policy),
  }));
  candidates.sort(
    (a, b) =>
      b.train.netBps -
        b.train.drawdownBps -
        (a.train.netBps - a.train.drawdownBps) ||
      a.strategy.fast - b.strategy.fast,
  );
  const winner = candidates[0],
    test = researchReplay(validation, winner.strategy, policy);
  const eligible =
    winner.train.netBps > 0 &&
    test.netBps >= 0 &&
    winner.train.trades > 0 &&
    test.trades > 0 &&
    test.drawdownBps <= policy.drawdownBps;
  return {
    version: VERSION,
    eligible,
    reason: eligible
      ? "TRAIN_WINNER_VALIDATION_ACCEPTED"
      : "NO_ROBUST_OPPORTUNITY",
    strategy: winner.strategy,
    train: winner.train,
    validation: test,
    trainHash: datasetHash(train),
    validationHash: datasetHash(validation),
    trainEnd: train.at(-1).date,
    validationStart: validation[0].date,
    through: history.at(-1).date,
    policyHash: datasetHash(policy),
    candidates: 2,
    score: winner.train.netBps - winner.train.drawdownBps,
  };
}
export function guard3({
  state,
  asset,
  bar,
  side,
  order,
  policy,
  paused = false,
  failures = 0,
  now = new Date(),
  volatilityValue,
}) {
  const reasons = [],
    equity = BigInt(state.equityCents),
    capital = BigInt(state.dayRiskCapitalCents || state.equityCents);
  if (paused) reasons.push("PAUSED");
  if (failures >= 3 || asset.failures >= 3) reasons.push("FAILURE_CIRCUIT");
  if (asset.referenceOnly || !asset.executionEligible)
    reasons.push("DATA_NOT_EXECUTION_ELIGIBLE");
  if (
    asset.error ||
    +now - +new Date(bar.sourceDate) > 5 * 86400000 ||
    bar.date >= now.toISOString().slice(0, 10)
  )
    reasons.push("STALE_OR_UNAVAILABLE");
  if (
    Object.values(state.positions).some(
      (p) => !p.sourceDate || +now - +new Date(p.sourceDate) > 5 * 86400000,
    )
  )
    reasons.push("STALE_POSITION_VALUE");
  if (
    !Number.isFinite(volatilityValue) ||
    volatilityValue > policy.maxVolatility
  )
    reasons.push("VOLATILITY");
  if (policy.feeBps + policy.slippageBps > policy.maxCostBps)
    reasons.push("COST");
  if (state.operations >= policy.maxOperations) reasons.push("OPERATION_LIMIT");
  if (state.maxDrawdownBps >= policy.drawdownBps) reasons.push("DRAWDOWN");
  if (
    capital > 0n &&
    (BigInt(state.dayStartPnlCents) - pnl(state)) * 10000n >=
      capital * BigInt(policy.dailyLossBps)
  )
    reasons.push("DAILY_LOSS");
  const markedOrder = valueCents(order.quantity, bar.priceMicros || "1");
  const cost =
    side === "BUY" ? order.total - markedOrder : markedOrder - order.total;
  if (
    markedOrder > 0n &&
    cost * 10000n > markedOrder * BigInt(policy.maxCostBps) &&
    !reasons.includes("COST")
  )
    reasons.push("COST");
  if (
    capital > 0n &&
    (BigInt(state.dayStartPnlCents) - pnl(state) + (cost > 0n ? cost : 0n)) *
      10000n >=
      capital * BigInt(policy.dailyLossBps) &&
    !reasons.includes("DAILY_LOSS")
  )
    reasons.push("DAILY_LOSS");
  if (side === "BUY") {
    if (
      bar.volumeCents === null ||
      BigInt(bar.volumeCents) < BigInt(policy.minVolumeCents)
    )
      reasons.push("LIQUIDITY");
    if (order.total > BigInt(state.cashCents)) reasons.push("CASH");
    if (order.quantity <= 0n || order.notional <= 0n)
      reasons.push("POSITION_TOO_SMALL");
    const positions = Object.values(state.positions),
      total = BigInt(state.investedCents) + order.notional;
    const market =
      sum(
        positions
          .filter((p) => p.market === asset.market)
          .map((p) => valueCents(p.quantity, p.priceMicros)),
      ) + order.notional;
    if (
      equity <= 0n ||
      order.notional * 10000n >
        equity * BigInt(Math.min(policy.assetBps, policy.concentrationBps))
    )
      reasons.push("ASSET_CONCENTRATION");
    if (total * 10000n > equity * BigInt(policy.totalBps))
      reasons.push("TOTAL_EXPOSURE");
    if (market * 10000n > equity * BigInt(policy.marketBps))
      reasons.push("MARKET_EXPOSURE");
    if (positions.length >= policy.maxPositions) reasons.push("POSITION_LIMIT");
  }
  return { allowed: reasons.length === 0, reasons };
}
export function advance(
  previous,
  assets,
  policy = DEFAULT_POLICY,
  { now = new Date(), paused = false, failures = 0, limit = 50 } = {},
) {
  const s = reconcile(structuredClone(previous)),
    events = [];
  let protect = false;
  const today = now.toISOString().slice(0, 10);
  // Shared chronological calendar: never rank today's opportunity with tomorrow's observations.
  const afterFor = (asset) =>
    [
      s.checkpoints[asset.symbol] || s.startedOn || today,
      s.calendarCheckpoint || s.startedOn || today,
    ]
      .sort()
      .at(-1);
  const dates = [
    ...new Set(
      assets.flatMap((a) =>
        a.bars
          .filter((b) => b.date > afterFor(a) && b.date < today)
          .map((b) => b.date),
      ),
    ),
  ]
    .sort()
    .slice(0, limit);
  for (const day of dates) {
    if (s.day !== day) {
      s.day = day;
      s.operations = 0;
      s.dayStartPnlCents = String(pnl(s));
      s.dayRiskCapitalCents = s.equityCents;
    }
    for (const a of assets) {
      const bar = a.bars.find((b) => b.date === day);
      if (!bar || day <= afterFor(a)) continue;
      if (s.positions[a.symbol]) {
        s.positions[a.symbol].priceMicros = bar.priceMicros;
        s.positions[a.symbol].sourceDate = bar.sourceDate;
      }
    }
    reconcile(s);
    const dayCapital = BigInt(s.dayRiskCapitalCents || "0");
    if (
      dayCapital > 0n &&
      (BigInt(s.dayStartPnlCents) - pnl(s)) * 10000n >=
        dayCapital * BigInt(policy.dailyLossBps)
    )
      protect = true;
    const candidates = [];
    for (const asset of assets) {
      const bar = asset.bars.find((b) => b.date === day);
      if (!bar || day <= afterFor(asset)) continue;
      const history = asset.bars.filter((b) => b.date < day),
        last = history.at(-1),
        position = s.positions[asset.symbol];
      // Missing dates do not get interpolated. An extreme discontinuity protects the whole account.
      if (
        last &&
        Math.abs(Number(bar.priceMicros) / Number(last.priceMicros) - 1) > 0.25
      ) {
        events.push({
          date: day,
          symbol: asset.symbol,
          reason: "PRICE_DISCONTINUITY",
        });
        protect = true;
        s.checkpoints[asset.symbol] = day;
        continue;
      }
      let selection = position?.selection || s.selections[asset.symbol];
      if (
        !position &&
        (!selection ||
          +new Date(day) - +new Date(selection.through) > 30 * 86400000 ||
          (selection.policyHash &&
            selection.policyHash !== datasetHash(policy)))
      ) {
        selection = selectStrategy(history, policy);
        if (selection.through) s.selections[asset.symbol] = selection;
      }
      const intention = selection.eligible
        ? signal(history, selection.strategy)
        : { side: "WAIT", reason: selection.reason };
      candidates.push({ asset, bar, history, selection, intention });
    }
    candidates.sort(
      (a, b) =>
        (a.intention.side === "SELL" ? -1 : 0) -
          (b.intention.side === "SELL" ? -1 : 0) ||
        (b.selection.score || 0) - (a.selection.score || 0) ||
        a.asset.symbol.localeCompare(b.asset.symbol),
    );
    for (const { asset, bar, history, selection, intention } of candidates) {
      const position = s.positions[asset.symbol];
      let order = null,
        risk = { allowed: true, reasons: [] };
      if (
        (intention.side === "BUY" && !position) ||
        (intention.side === "SELL" && position)
      ) {
        const adjusted = fill(
          "BUY",
          0n,
          bar.priceMicros,
          policy.feeBps,
          policy.slippageBps,
        ).executionPrice;
        const quantity =
          intention.side === "BUY"
            ? sizePosition(
                s.cashCents,
                s.equityCents,
                adjusted,
                Math.min(policy.assetBps, policy.concentrationBps),
                policy.feeBps,
              )
            : BigInt(position.quantity);
        const proposed = {
          quantity,
          ...fill(
            intention.side,
            quantity,
            bar.priceMicros,
            policy.feeBps,
            policy.slippageBps,
          ),
        };
        risk = guard3({
          state: s,
          asset,
          bar,
          side: intention.side,
          order: proposed,
          policy,
          paused: paused || protect,
          failures,
          now,
          volatilityValue: volatility(
            history.map((b) => Number(b.priceMicros) / 1e6),
          ),
        });
        if (risk.allowed) {
          order = serialize({
            side: intention.side,
            ...proposed,
            fictitious: true,
            fillModel: "NEXT_DAILY_REFERENCE_PLUS_COSTS",
          });
          if (intention.side === "BUY") {
            s.cashCents = String(BigInt(s.cashCents) - proposed.total);
            s.positions[asset.symbol] = {
              quantity: String(quantity),
              costCents: String(proposed.total),
              priceMicros: bar.priceMicros,
              sourceDate: bar.sourceDate,
              market: asset.market,
              openedAt: bar.date,
              selection,
            };
          } else {
            order.realizedDeltaCents = String(
              proposed.total - BigInt(position.costCents),
            );
            order.costBasisCents = position.costCents;
            s.cashCents = String(BigInt(s.cashCents) + proposed.total);
            s.realizedCents = String(
              BigInt(s.realizedCents) + BigInt(order.realizedDeltaCents),
            );
            delete s.positions[asset.symbol];
          }
          s.operations++;
          reconcile(s);
        }
      }
      events.push({
        date: day,
        symbol: asset.symbol,
        source: asset.source,
        sourceDate: bar.sourceDate,
        signal: intention,
        risk,
        order,
        selection: {
          reason: selection.reason,
          trainHash: selection.trainHash,
          validationHash: selection.validationHash,
          through: selection.through,
        },
      });
      s.checkpoints[asset.symbol] = day;
    }
    const capital = BigInt(s.contributedCents) - BigInt(s.withdrawnCents);
    if (pnl(s) > BigInt(s.peakPnlCents)) s.peakPnlCents = String(pnl(s));
    const riskCapital = BigInt(s.dayRiskCapitalCents || s.equityCents);
    if (riskCapital > 0n)
      s.maxDrawdownBps = Math.max(
        s.maxDrawdownBps,
        Number(((BigInt(s.peakPnlCents) - pnl(s)) * 10000n) / riskCapital),
      );
    if (
      s.maxDrawdownBps >= policy.drawdownBps ||
      events.some((e) =>
        e.risk?.reasons.some((r) =>
          ["DAILY_LOSS", "FAILURE_CIRCUIT"].includes(r),
        ),
      )
    )
      protect = true;
    s.curve.push({
      date: day,
      equityCents: s.equityCents,
      netContributionsCents: String(capital),
      pnlCents: String(pnl(s)),
    });
    s.curve = s.curve.slice(-120);
    s.calendarCheckpoint = day;
  }
  s.scanner = assets.map((a) => {
    const known = a.bars.filter((b) => b.date < today),
      analysis = analyze(known, now);
    return {
      symbol: a.symbol,
      market: a.market,
      source: a.source,
      asOf: analysis.asOf,
      sourceDate: analysis.sourceDate,
      stale: analysis.stale,
      indicators: {
        sma5: analysis.sma5,
        sma20: analysis.sma20,
        ema20: analysis.ema20,
        rsi14: analysis.rsi14,
        volatility20: analysis.volatility20,
      },
      reason:
        a.error ||
        a.reason ||
        (analysis.stale
          ? "STALE"
          : s.selections[a.symbol]?.reason || "WAITING_NEXT_OBSERVATION"),
      executionEligible: !!a.executionEligible,
      referenceOnly: !!a.referenceOnly,
    };
  });
  s.alerts = [
    ...new Set([
      ...assets
        .filter((a) => a.error || a.reason || !a.bars.length)
        .map(
          (a) => `${a.symbol}: ${a.error || a.reason || "DATA_UNAVAILABLE"}`,
        ),
      ...events.flatMap((e) => e.risk?.reasons || []),
      ...(protect ? ["AUTOMATIC_PROTECTION"] : []),
    ]),
  ].slice(0, 20);
  s.lastAnalysis = now.toISOString();
  return {
    state: reconcile(s),
    events: serialize(events),
    protect,
    processedDates: dates.length,
  };
}
export function summary(state, now = new Date()) {
  const s = reconcile(structuredClone(state)),
    latest = s.curve.at(-1),
    day = now.toISOString().slice(0, 10),
    month = day.slice(0, 7);
  const current = pnl(s),
    priorDay = s.curve.filter((p) => p.date < day).at(-1),
    priorMonth = s.curve.filter((p) => p.date.slice(0, 7) < month).at(-1);
  return {
    ...s,
    dailyCents: String(current - BigInt(priorDay?.pnlCents || "0")),
    monthlyCents: String(current - BigInt(priorMonth?.pnlCents || "0")),
    netCents: String(current),
    openPositions: Object.keys(s.positions).length,
    valuationAt: latest?.date || null,
  };
}
