export function guard({
  side,
  state,
  equity,
  proposedCents,
  config,
  paused = false,
  stale = false,
  liquidity = null,
}) {
  const reasons = [];
  if (paused || state.status === "PAUSED") reasons.push("PAUSED");
  if (state.status === "EMERGENCY" || state.status === "CLOSED")
    reasons.push(state.status);
  if (stale) reasons.push("STALE_DATA");
  if (side === "BUY") {
    if (liquidity === null && !config.allowUnknownLiquidity)
      reasons.push("UNKNOWN_LIQUIDITY");
    if (liquidity !== null && liquidity < config.minLiquidity)
      reasons.push("LOW_LIQUIDITY");
    const exposure = BigInt(state.investedCents || 0) + BigInt(proposedCents);
    for (const [key, limit] of [
      ["ASSET_EXPOSURE", config.assetBps],
      ["TOTAL_EXPOSURE", config.totalBps],
      ["CONCENTRATION", config.concentrationBps],
    ])
      if (exposure * 10000n > BigInt(equity) * BigInt(limit)) reasons.push(key);
    if (BigInt(proposedCents) > BigInt(state.cashCents))
      reasons.push("INSUFFICIENT_CASH");
    if (state.dailyOperations >= config.maxOperations)
      reasons.push("DAILY_OPERATIONS");
    if (
      (BigInt(state.dayStartEquity) - BigInt(equity)) * 10000n >=
      BigInt(state.dayStartEquity) * BigInt(config.dailyLossBps)
    )
      reasons.push("DAILY_LOSS");
  }
  return { allowed: reasons.length === 0, reasons };
}
