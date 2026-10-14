import crypto from "node:crypto";
import { signal, sizePosition, fill, valueCents } from "./strategy.js";
import { guard } from "./guard.js";
export const serialize = (value) =>
  JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  );
export const datasetHash = (bars) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(serialize(bars)))
    .digest("hex");
export function initialState(capital, checkpoint = null) {
  return {
    status: "RUNNING",
    initialCents: String(capital),
    cashCents: String(capital),
    quantity: "0",
    costCents: "0",
    realizedCents: "0",
    investedCents: "0",
    equityCents: String(capital),
    unrealizedCents: "0",
    checkpoint,
    dailyOperations: 0,
    day: null,
    dayStartEquity: String(capital),
    lastPrice: null,
    trades: 0,
    closed: 0,
    wins: 0,
    peakCents: String(capital),
    maxDrawdownBps: 0,
    closedPositions: [],
    curve: [],
    dataCount: 0,
  };
}
export function step(
  previous,
  history,
  bar,
  config,
  { paused = false, stale = false } = {},
) {
  const state = structuredClone(previous);
  if (state.checkpoint && bar.date <= state.checkpoint)
    throw Error("Checkpoint duplicado");
  if (state.status !== "RUNNING" || paused)
    throw Error("Simulação pausada ou encerrada");
  const price = BigInt(bar.priceMicros);
  const marked = valueCents(state.quantity, price);
  const beforeEquity = BigInt(state.cashCents) + marked;
  if (state.day !== bar.date) {
    state.day = bar.date;
    state.dailyOperations = 0;
    // Previous close equity is the baseline, including overnight changes.
    state.dayStartEquity = state.equityCents;
  }
  state.investedCents = String(marked);
  const intention = signal(history, config.strategy);
  let order = null,
    risk = { allowed: true, reasons: [] };
  const hasPosition = BigInt(state.quantity) > 0n;
  if (
    (intention.side === "BUY" && !hasPosition) ||
    (intention.side === "SELL" && hasPosition)
  ) {
    const adjustedPrice = fill(
      "BUY",
      0n,
      price,
      config.feeBps,
      config.slippageBps,
    ).executionPrice;
    const quantity =
      intention.side === "BUY"
        ? sizePosition(
            state.cashCents,
            beforeEquity,
            adjustedPrice,
            config.allocationBps,
            config.feeBps,
          )
        : BigInt(state.quantity);
    const execution = fill(
      intention.side,
      quantity,
      price,
      config.feeBps,
      config.slippageBps,
    );
    risk = guard({
      side: intention.side,
      state,
      equity: beforeEquity,
      proposedCents: execution.total,
      config: config.risk,
      paused,
      stale,
      liquidity: null,
    });
    if (quantity <= 0n || execution.notional <= 0n) {
      risk.allowed = false;
      risk.reasons.push("POSITION_TOO_SMALL");
    }
    if (risk.allowed) {
      if (intention.side === "BUY") {
        state.cashCents = String(BigInt(state.cashCents) - execution.total);
        state.quantity = String(quantity);
        state.costCents = String(execution.total);
        state.openedAt = bar.date;
      } else {
        const pnl = execution.total - BigInt(state.costCents);
        state.cashCents = String(BigInt(state.cashCents) + execution.total);
        state.realizedCents = String(BigInt(state.realizedCents) + pnl);
        state.closed++;
        if (pnl > 0n) state.wins++;
        state.closedPositions.push({
          openedAt: state.openedAt,
          closedAt: bar.date,
          pnlCents: String(pnl),
        });
        state.quantity = "0";
        state.costCents = "0";
        state.openedAt = null;
      }
      state.trades++;
      state.dailyOperations++;
      order = serialize({
        side: intention.side,
        quantity,
        ...execution,
        fictitious: true,
      });
    }
  }
  state.investedCents = String(valueCents(state.quantity, price));
  state.equityCents = String(
    BigInt(state.cashCents) + BigInt(state.investedCents),
  );
  state.unrealizedCents = String(
    BigInt(state.investedCents) - BigInt(state.costCents),
  );
  const equity = BigInt(state.equityCents);
  if (equity > BigInt(state.peakCents)) state.peakCents = String(equity);
  state.maxDrawdownBps = Math.max(
    state.maxDrawdownBps,
    Number(
      ((BigInt(state.peakCents) - equity) * 10000n) / BigInt(state.peakCents),
    ),
  );
  state.checkpoint = bar.date;
  state.lastPrice = String(price);
  state.dataCount++;
  state.curve.push({ date: bar.date, equityCents: state.equityCents });
  return {
    state,
    event: {
      date: bar.date,
      priceMicros: String(price),
      source: bar.source,
      signal: intention,
      risk,
      order,
      equityCents: state.equityCents,
    },
  };
}
export function metrics(state, bars = []) {
  const last = BigInt(state.equityCents),
    initial = BigInt(state.initialCents);
  const latest = state.curve.at(-1)?.date;
  const baseline = (predicate) => {
    const first = state.curve.findIndex((p) => predicate(p.date));
    return first > 0 ? BigInt(state.curve[first - 1].equityCents) : initial;
  };
  const dayBase = latest ? baseline((d) => d === latest) : initial;
  const monthBase = latest
    ? baseline((d) => d.slice(0, 7) === latest.slice(0, 7))
    : initial;
  return {
    netCents: String(last - initial),
    dailyCents: String(last - dayBase),
    monthlyCents: String(last - monthBase),
    maxDrawdownBps: state.maxDrawdownBps,
    operations: state.trades,
    closedTrades: state.closed,
    winRate: state.closed ? state.wins / state.closed : null,
    benchmarkReturn:
      bars.length > 1
        ? Number(bars.at(-1).priceMicros) / Number(bars[0].priceMicros) - 1
        : null,
  };
}
