export const SYMBOLS = [
  "USD-BRL",
  "EUR-BRL",
  "GBP-BRL",
  "JPY-BRL",
  "CHF-BRL",
  "CAD-BRL",
];
export async function fetchRates(symbol, from, to, fetcher = fetch) {
  if (!SYMBOLS.includes(symbol)) throw Error("Ativo não suportado");
  const base = symbol.slice(0, 3);
  const url = new URL("https://api.frankfurter.dev/v2/rates");
  for (const [key, value] of Object.entries({
    base,
    quotes: "BRL",
    from,
    to,
    expand: "providers",
  }))
    url.searchParams.set(key, value);
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (!response.ok) throw Error("Fonte de dados indisponível");
  // Bound untrusted response before parsing; never substitute invented observations.
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2000000) throw Error("Resposta de mercado excede limite");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  const rows = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!Array.isArray(rows) || rows.length > 366)
    throw Error("Dados de mercado inválidos");
  const result = new Map();
  for (const row of rows) {
    if (
      row.base !== base ||
      row.quote !== "BRL" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      row.date < from ||
      row.date > to ||
      typeof row.rate !== "number" ||
      !Number.isFinite(row.rate) ||
      row.rate <= 0 ||
      row.rate > 1e6
    )
      throw Error("Dados de mercado inválidos");
    const priceMicros = BigInt(Math.round(row.rate * 1e6));
    if (!priceMicros) throw Error("Preço abaixo da precisão suportada");
    const providers = Array.isArray(row.providers)
      ? row.providers
          .map((p) => (typeof p === "string" ? p : p?.key))
          .filter((p) => typeof p === "string")
      : [];
    const observedDates = Array.isArray(row.providers)
      ? row.providers
          .map((p) => p?.date)
          .filter(
            (d) =>
              typeof d === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(d) &&
              d <= row.date,
          )
          .sort()
      : [];
    result.set(row.date, {
      date: row.date,
      priceMicros,
      source:
        "Frankfurter v2 blended: " +
        (providers.join(",").slice(0, 1000) ||
          "fontes oficiais; veja frankfurter.dev"),
      sourceDate: observedDates.at(-1) || row.date,
      provenance: Array.isArray(row.providers)
        ? row.providers.slice(0, 150)
        : [],
    });
  }
  if (!result.size) throw Error("Nenhum dado disponível no período");
  return [...result.values()].sort((a, b) => a.date.localeCompare(b.date));
}
