export const VERSION = 'indicators-v1';
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
export function sma(values, period) {
  return values.length < period ? null : mean(values.slice(-period));
}
export function ema(values, period) {
  if (values.length < period) return null;
  let value = mean(values.slice(0, period));
  const weight = 2 / (period + 1);
  for (const v of values.slice(period)) value += weight * (v - value);
  return value;
}
export function rsi(values, period = 14) {
  if (values.length <= period) return null;
  const changes = values.slice(1).map((v, i) => v - values[i]);
  let gain = mean(changes.slice(0, period).map(v => Math.max(0, v)));
  let loss = mean(changes.slice(0, period).map(v => Math.max(0, -v)));
  for (const v of changes.slice(period)) {
    gain = (gain * (period - 1) + Math.max(0, v)) / period;
    loss = (loss * (period - 1) + Math.max(0, -v)) / period;
  }
  return loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
}
export function volatility(values, period = 20) {
  if (values.length <= period) return null;
  const prices = values.slice(-period - 1);
  const returns = prices.slice(1).map((v, i) => Math.log(v / prices[i]));
  const avg = mean(returns);
  return Math.sqrt(returns.reduce((sum, r) => sum + (r - avg) ** 2, 0) / (period - 1)) * Math.sqrt(252);
}
export function analyze(bars, now = new Date()) {
  const values = bars.map(b => Number(b.priceMicros) / 1e6);
  const short = sma(values, 5), long = sma(values, 20);
  const last = bars.at(-1);
  const stale = !last || +now - +new Date(last.date) > 5 * 86400000;
  return { version: VERSION, asOf: last?.date ?? null, count: bars.length,
    source: last?.source ?? null, price: values.at(-1) ?? null,
    sma5: short, sma20: long, ema20: ema(values, 20), rsi14: rsi(values),
    volatility20: volatility(values), volume: null, liquidity: null, stale,
    score: !stale && short !== null && long !== null ? (short / long - 1) * 100 : null,
    classification: stale ? 'DATA_UNAVAILABLE' : long === null ? 'WARMUP' : short > long ? 'ABOVE_SMA' : 'BELOW_SMA',
    reason: 'Taxas de referência diárias; ranking descritivo, sem recomendação ou execução.' };
}
