// SYNTHETIC TEST DATA, never used outside an explicitly guarded _test database.
const epoch = Date.parse("2026-04-01"),
  anchor = Date.parse("2026-10-10");
const tail = [100, 99, 98, 99, 100, 101, 99, 98, 99, 100, 101];
export function pilotFixture(
  asset,
  { now = new Date("2026-10-19T17:23:00Z") } = {},
) {
  const end = Date.parse(now.toISOString().slice(0, 10)),
    bars = [];
  for (let t = epoch; t < end; t += 86400000) {
    const n = (t - anchor) / 86400000,
      p =
        n >= 0 && n < tail.length
          ? tail[n]
          : 100 + Math.sin((t - epoch) / 86400000 / 8);
    const date = new Date(t).toISOString().slice(0, 10);
    bars.push({
      date,
      sourceDate: date,
      priceMicros: String(Math.round(p * 1e6)),
      volumeCents: "100000000000",
      volumeKind: "SYNTHETIC_FIXTURE",
    });
  }
  return {
    symbol: asset.symbol,
    market: "CRYPTO",
    source: "SYNTHETIC PILOT FIXTURE — NOT MARKET DATA",
    executionEligible: true,
    referenceOnly: false,
    bars: bars.slice(-180),
    reason: null,
  };
}
