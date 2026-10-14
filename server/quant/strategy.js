import { sma } from './indicators.js';
export const STRATEGY_VERSION = 'sma-cross-v1';
export function signal(bars, config) {
  const values = bars.map(b => Number(b.priceMicros));
  if (values.length <= config.slow) return { side:'WAIT', reason:'Histórico insuficiente para cruzamento' };
  const before = sma(values.slice(0, -1), config.fast) - sma(values.slice(0, -1), config.slow);
  const current = sma(values, config.fast) - sma(values, config.slow);
  return before <= 0 && current > 0 ? { side:'BUY', reason:'SMA rápida cruzou acima da lenta' }
    : before >= 0 && current < 0 ? { side:'SELL', reason:'SMA rápida cruzou abaixo da lenta' }
    : { side:'WAIT', reason:'Sem novo cruzamento' };
}
export const ceilDiv = (a, b) => (a + b - 1n) / b;
export const valueCents = (quantity, price) => BigInt(quantity) * BigInt(price) / 10000000000n;
export function sizePosition(cash, equity, price, allocationBps, feeBps) {
  const budget = [BigInt(cash), BigInt(equity) * BigInt(allocationBps) / 10000n].reduce((a, b) => a < b ? a : b);
  const netBudget = budget * 10000n / (10000n + BigInt(feeBps));
  return netBudget * 10000000000n / BigInt(price);
}
export function fill(side, quantity, price, feeBps, slippageBps) {
  const executionPrice = side === 'BUY'
    ? ceilDiv(BigInt(price) * (10000n + BigInt(slippageBps)), 10000n)
    : BigInt(price) * (10000n - BigInt(slippageBps)) / 10000n;
  const raw = BigInt(quantity) * executionPrice;
  const notional = side === 'BUY' ? ceilDiv(raw, 10000000000n) : raw / 10000000000n;
  const fee = ceilDiv(notional * BigInt(feeBps), 10000n);
  return { executionPrice, notional, fee, total: side === 'BUY' ? notional + fee : notional - fee };
}
