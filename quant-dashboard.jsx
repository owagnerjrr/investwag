import React, { useRef, useState } from "react";
import { quantApi } from "./api-client.js";
const money = (value) =>
  (Number(value || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const defaults = {
  assetBps: 2500,
  totalBps: 5000,
  concentrationBps: 2500,
  dailyLossBps: 500,
  maxOperations: 3,
  minLiquidity: 0,
  allowUnknownLiquidity: false,
};
function EquityCurve({ curve }) {
  if (!curve.length) return <p>Sem observações processadas.</p>;
  const values = curve.map((p) => Number(p.equityCents)),
    min = Math.min(...values),
    max = Math.max(...values);
  const points = values
    .map(
      (v, i) =>
        `${10 + (i * 580) / Math.max(1, values.length - 1)},${150 - ((v - min) * 130) / Math.max(1, max - min)}`,
    )
    .join(" ");
  return (
    <figure>
      <svg
        viewBox="0 0 600 170"
        role="img"
        aria-label="Curva de patrimônio fictício"
      >
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      </svg>
      <figcaption>
        {curve[0].date} — {curve.at(-1).date} · {money(min)} a {money(max)}
      </figcaption>
    </figure>
  );
}
export default function QuantDashboard({ onExpired, globalPaused }) {
  const [open, setOpen] = useState(false),
    [assets, setAssets] = useState([]),
    [supported, setSupported] = useState([]),
    [strategies, setStrategies] = useState([]),
    [runs, setRuns] = useState([]),
    [selectedRunId, setSelectedRunId] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [uncertain, setUncertain] = useState(false),
    [events, setEvents] = useState([]);
  const pending = useRef(null),
    running = useRef(false);
  const today = new Date().toISOString().slice(0, 10);
  const [symbol, setSymbol] = useState("USD-BRL"),
    [assetId, setAssetId] = useState(""),
    [strategyId, setStrategyId] = useState("");
  const [from, setFrom] = useState(
      new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10),
    ),
    [to, setTo] = useState(today);
  const [name, setName] = useState("Cruzamento SMA"),
    [fast, setFast] = useState(5),
    [slow, setSlow] = useState(20),
    [capital, setCapital] = useState("1000"),
    [fee, setFee] = useState(10),
    [slippage, setSlippage] = useState(10),
    [allocation, setAllocation] = useState(2000),
    [risk, setRisk] = useState(defaults);
  async function load() {
    const [market, plans, sessions] = await Promise.all([
      quantApi.get("/assets"),
      quantApi.get("/strategies"),
      quantApi.get("/runs"),
    ]);
    setAssets(market.assets);
    setSupported(market.supported);
    setStrategies(plans);
    setRuns(sessions);
    setAssetId((current) => current || market.assets[0]?.id || "");
    setStrategyId((current) => current || plans[0]?.id || "");
  }
  async function run(action) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e.message);
      if (e.status === 401) {
        pending.current = null;
        setUncertain(false);
        onExpired();
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function mutate(path, body) {
    if (!pending.current)
      pending.current = { path, body, key: crypto.randomUUID() };
    const operation = pending.current;
    let confirmed = false;
    await run(async () => {
      try {
        const result = await quantApi.post(
          operation.path,
          operation.body,
          operation.key,
        );
        confirmed = true;
        await load();
        pending.current = null;
        setUncertain(false);
        setNotice(
          result.type === "BLOCK"
            ? "Guard bloqueou: " + result.reasons.join(", ")
            : result.processed !== undefined
              ? `${result.processed} observações processadas. Checkpoint: ${result.checkpoint || "nenhum"}`
              : "Configuração simulada registrada.",
        );
      } catch (e) {
        if (!confirmed && e.status >= 400 && e.status < 500) {
          pending.current = null;
          setUncertain(false);
        } else setUncertain(true);
        throw e;
      }
    });
  }
  const disabled = busy || uncertain;
  const ranked = [...assets].sort(
    (a, b) =>
      (b.analyses[0]?.result.score ?? -Infinity) -
      (a.analyses[0]?.result.score ?? -Infinity),
  );
  const selected = runs.find((r) => r.id === selectedRunId) || runs[0];
  return (
    <section className="quant-area" aria-busy={busy}>
      <div className="section-heading">
        <h2>WJ Quant 2.0 · Laboratório</h2>
        <button
          className="alt"
          disabled={busy}
          onClick={() =>
            run(async () => {
              if (!open) await load();
              setOpen(!open);
            })
          }
        >
          {open ? "Fechar laboratório" : "Abrir laboratório quantitativo"}
        </button>
      </div>
      {error && (
        <p role="alert" className="feedback error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="feedback success">
          {notice}
        </p>
      )}
      {uncertain && (
        <div className="retry">
          <p>
            Resposta não confirmada. A mesma chave será usada para conferir a
            ação.
          </p>
          <button
            disabled={busy}
            onClick={() => mutate(pending.current.path, pending.current.body)}
          >
            Confirmar ação quantitativa pendente
          </button>
        </div>
      )}
      {open && (
        <>
          <p className="warning">
            Todos os valores são fictícios. Taxas de câmbio de referência
            diárias, sem preço negociável, volume ou liquidez disponíveis. Sem
            corretoras ou promessa de lucro.
          </p>
          <p>
            O capital do laboratório é independente do livro-caixa acima.
            Execução manual em lotes de até 50 observações; a API gratuita pode
            suspender.{" "}
            {globalPaused
              ? "Pausa global ativa: paper trading bloqueado."
              : "Pausa global desativada; iniciar sessão não executa ordens."}
          </p>
          <button className="alt" disabled={disabled} onClick={() => run(load)}>
            Atualizar laboratório
          </button>
          <div className="workspace">
            <section>
              <h3>Scanner de taxas de referência</h3>
              <label htmlFor="q-symbol">Ativo monitorado</label>
              <select
                id="q-symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                disabled={disabled}
              >
                {supported.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <button
                disabled={disabled}
                onClick={() => mutate("/assets", { symbol })}
              >
                Monitorar ativo
              </button>
              <label htmlFor="q-asset">Ativo para análise e simulação</label>
              <select
                id="q-asset"
                value={assetId}
                disabled={disabled}
                onChange={(e) => setAssetId(e.target.value)}
              >
                <option value="">Selecione</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.symbol}
                  </option>
                ))}
              </select>
              <label htmlFor="q-from">Início do período</label>
              <input
                id="q-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={disabled}
              />
              <label htmlFor="q-to">Fim do período</label>
              <input
                id="q-to"
                type="date"
                max={today}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={disabled}
              />
              <button
                disabled={disabled || !assetId}
                onClick={() =>
                  mutate(`/assets/${assetId}/refresh`, { from, to })
                }
              >
                Buscar dados e analisar
              </button>
              <p className="hint">
                Frankfurter · fontes oficiais identificadas. Até 366 dias por
                busca, uma busca por ativo a cada 15 minutos. Sem interpolação;
                a fonte pode agregar taxas em dias não úteis.
              </p>
            </section>
            <section>
              <h3>Estratégia auditável</h3>
              <label htmlFor="q-name">Nome da estratégia</label>
              <input
                id="q-name"
                value={name}
                maxLength={80}
                disabled={disabled}
                onChange={(e) => setName(e.target.value)}
              />
              <label htmlFor="q-fast">SMA rápida (observações)</label>
              <input
                id="q-fast"
                type="number"
                min="2"
                max="50"
                value={fast}
                disabled={disabled}
                onChange={(e) => setFast(Number(e.target.value))}
              />
              <label htmlFor="q-slow">SMA lenta (observações)</label>
              <input
                id="q-slow"
                type="number"
                min="3"
                max="200"
                value={slow}
                disabled={disabled}
                onChange={(e) => setSlow(Number(e.target.value))}
              />
              <button
                disabled={disabled}
                onClick={() => mutate("/strategies", { name, fast, slow })}
              >
                Salvar estratégia
              </button>
              <label htmlFor="q-strategy">Estratégia para simulação</label>
              <select
                id="q-strategy"
                value={strategyId}
                disabled={disabled}
                onChange={(e) => setStrategyId(e.target.value)}
              >
                <option value="">Selecione</option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · SMA {s.config.fast}/{s.config.slow} · {s.version}
                  </option>
                ))}
              </select>
              <p>
                Compra no cruzamento acima; venda abaixo; espera sem cruzamento.
                Sinal anterior, execução na próxima observação disponível.
              </p>
            </section>
          </div>
          <section>
            <h3>Ranking quantitativo · não é recomendação</h3>
            {!ranked.length ? (
              <p>Nenhum ativo monitorado.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Ativo / fonte</th>
                      <th>Último dado</th>
                      <th>SMA 5/20 e EMA 20</th>
                      <th>RSI / volatilidade</th>
                      <th>Classificação / score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((a) => {
                      const r = a.analyses[0]?.result;
                      return (
                        <tr key={a.id}>
                          <td>
                            {a.symbol}
                            <small>{r?.source || "Sem fonte carregada"}</small>
                          </td>
                          <td>
                            {r?.asOf?.slice(0, 10) || "Indisponível"}
                            <small>
                              {r?.stale
                                ? "Desatualizado ou indisponível"
                                : "Referência diária"}{" "}
                              · {a._count.bars} observações
                            </small>
                          </td>
                          <td>
                            {r?.sma5?.toFixed(6) ?? "—"} /{" "}
                            {r?.sma20?.toFixed(6) ?? "—"}
                            <small>EMA {r?.ema20?.toFixed(6) ?? "—"}</small>
                          </td>
                          <td>
                            {r?.rsi14?.toFixed(2) ?? "—"} /{" "}
                            {r?.volatility20 !== null &&
                            r?.volatility20 !== undefined
                              ? (100 * r.volatility20).toFixed(2) + "%"
                              : "—"}
                          </td>
                          <td>
                            {r?.classification || "Sem análise"} /{" "}
                            {r?.score?.toFixed(3) ?? "—"}
                            <small>{a.lastError}</small>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section>
            <h3>Capital virtual, custos e WJ Quant Guard</h3>
            <div className="quant-fields">
              <label>
                Capital virtual BRL
                <input
                  aria-label="Capital virtual BRL"
                  inputMode="decimal"
                  value={capital}
                  disabled={disabled}
                  onChange={(e) => setCapital(e.target.value)}
                />
              </label>
              {[
                ["Taxa (bps)", fee, setFee],
                ["Slippage (bps)", slippage, setSlippage],
                ["Alocação (bps)", allocation, setAllocation],
              ].map(([label, value, setter]) => (
                <label key={label}>
                  {label}
                  <input
                    aria-label={label}
                    type="number"
                    value={value}
                    disabled={disabled}
                    onChange={(e) => setter(Number(e.target.value))}
                  />
                </label>
              ))}
              {[
                ["assetBps", "Exposição por ativo (bps)"],
                ["totalBps", "Exposição total (bps)"],
                ["concentrationBps", "Concentração (bps)"],
                ["dailyLossBps", "Perda diária máxima (bps)"],
                ["maxOperations", "Operações máximas por dia"],
                ["minLiquidity", "Liquidez mínima"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    aria-label={label}
                    type="number"
                    value={risk[key]}
                    disabled={disabled}
                    onChange={(e) =>
                      setRisk({ ...risk, [key]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={risk.allowUnknownLiquidity}
                disabled={disabled}
                onChange={(e) =>
                  setRisk({ ...risk, allowUnknownLiquidity: e.target.checked })
                }
              />
              Aceitar liquidez desconhecida somente nesta simulação de
              referência
            </label>
            <p className="hint">
              100 bps = 1%. Sem autorização acima, Guard bloqueia compras com
              liquidez desconhecida.
            </p>
            <div className="actions">
              {["BACKTEST", "PAPER"].map((kind) => (
                <button
                  key={kind}
                  disabled={disabled || !assetId || !strategyId}
                  onClick={() =>
                    mutate("/runs", {
                      kind,
                      assetId,
                      strategyId,
                      capital: capital.replace(",", "."),
                      allocationBps: allocation,
                      feeBps: fee,
                      slippageBps: slippage,
                      risk,
                      ...(kind === "BACKTEST" ? { from, to } : {}),
                    })
                  }
                >
                  {kind === "BACKTEST"
                    ? "Criar backtest histórico"
                    : "Iniciar paper trading fictício"}
                </button>
              ))}
            </div>
          </section>
          {selected && (
            <section>
              <label htmlFor="q-metrics">Simulação para métricas e curva</label>
              <select
                id="q-metrics"
                value={selected.id}
                onChange={(e) => setSelectedRunId(e.target.value)}
              >
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.kind} · {assets.find((a) => a.id === r.assetId)?.symbol}{" "}
                    · {new Date(r.createdAt).toLocaleString("pt-BR")}
                  </option>
                ))}
              </select>
              <h3>
                Simulação selecionada ·{" "}
                {selected.kind === "BACKTEST" ? "Histórica" : "Paper trading"}
              </h3>
              <div className="grid">
                {[
                  ["Patrimônio fictício", selected.state.equityCents],
                  ["Disponível virtual", selected.state.cashCents],
                  ["Investido fictício", selected.state.investedCents],
                  ["P/L realizado", selected.state.realizedCents],
                  ["P/L não realizado", selected.state.unrealizedCents],
                  ["Resultado diário", selected.metrics.dailyCents],
                  ["Resultado mensal", selected.metrics.monthlyCents],
                  ["Resultado acumulado", selected.metrics.netCents],
                ].map(([label, value]) => (
                  <article key={label}>
                    <span>{label}</span>
                    <strong>{money(value)}</strong>
                  </article>
                ))}
              </div>
              <EquityCurve curve={selected.state.curve} />
            </section>
          )}
          <section>
            <h3>Estratégias ativas · execução manual</h3>
            {runs.filter((r) => r.kind === "PAPER" && r.status === "RUNNING")
              .length ? (
              runs
                .filter((r) => r.kind === "PAPER" && r.status === "RUNNING")
                .map((r) => (
                  <p key={r.id}>
                    {strategies.find((s) => s.id === r.strategyId)?.name ||
                      r.config.strategyVersion}{" "}
                    · SMA {r.config.strategy.fast}/{r.config.strategy.slow} ·{" "}
                    {assets.find((a) => a.id === r.assetId)?.symbol}. Guard:
                    exposição por ativo {r.config.risk.assetBps / 100}%, total{" "}
                    {r.config.risk.totalBps / 100}%, concentração{" "}
                    {r.config.risk.concentrationBps / 100}%, perda diária{" "}
                    {r.config.risk.dailyLossBps / 100}%.
                  </p>
                ))
            ) : (
              <p>Nenhuma sessão paper ativa.</p>
            )}
            <h3>Simulações e posições fictícias</h3>
            {runs.length === 0 ? (
              <p>Nenhuma simulação criada.</p>
            ) : (
              runs.map((r) => (
                <article className="quant-run" key={r.id}>
                  <h4>
                    {r.kind === "BACKTEST"
                      ? "Backtest histórico"
                      : "Paper trading"}{" "}
                    · {assets.find((a) => a.id === r.assetId)?.symbol} ·{" "}
                    {r.status}
                  </h4>
                  <p>
                    Estratégia {r.config.strategyVersion} · SMA{" "}
                    {r.config.strategy.fast}/{r.config.strategy.slow}.
                    Checkpoint: {r.state.checkpoint || "não processado"}.
                  </p>
                  <p>
                    Posição aberta: {Number(r.state.quantity) / 1e6} unidades
                    fictícias · custo {money(r.state.costCents)}.{" "}
                    {r.state.closed} posições encerradas ·{" "}
                    {r.metrics.operations} operações · acerto{" "}
                    {r.metrics.winRate === null
                      ? "indisponível"
                      : (100 * r.metrics.winRate).toFixed(1) + "%"}{" "}
                    · drawdown {(r.metrics.maxDrawdownBps / 100).toFixed(2)}%.
                    Benchmark de referência{" "}
                    {r.metrics.benchmarkReturn === null
                      ? "indisponível"
                      : (100 * r.metrics.benchmarkReturn).toFixed(2) +
                        "% (sem custos)"}
                    .
                  </p>
                  <details>
                    <summary>Versão dos dados e posições encerradas</summary>
                    <code className="hash">{r.datasetHash}</code>
                    {r.state.closedPositions.map((p, i) => (
                      <p key={i}>
                        {p.openedAt} → {p.closedAt}: {money(p.pnlCents)}{" "}
                        fictícios
                      </p>
                    ))}
                  </details>
                  <div className="actions">
                    <button
                      disabled={disabled || r.status !== "RUNNING"}
                      onClick={() =>
                        mutate(`/runs/${r.id}/step`, { limit: 50 })
                      }
                    >
                      Processar próximo lote
                    </button>
                    {[
                      ["PAUSE", "Pausar sessão"],
                      ["RESUME", "Retomar sessão"],
                      ["EMERGENCY", "Interrupção de emergência"],
                      ["CLOSE", "Encerrar sessão"],
                    ].map(([action, label]) => (
                      <button
                        className="alt"
                        key={action}
                        disabled={
                          disabled ||
                          ["COMPLETED", "CLOSED"].includes(r.status) ||
                          (r.status === "EMERGENCY" && action !== "CLOSE")
                        }
                        onClick={() =>
                          mutate(`/runs/${r.id}/control`, { action })
                        }
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      className="text-button"
                      disabled={disabled}
                      onClick={() =>
                        run(async () =>
                          setEvents(await quantApi.get(`/runs/${r.id}/events`)),
                        )
                      }
                    >
                      Consultar auditoria
                    </button>
                  </div>
                  <p className="hint">
                    Encerrar preserva posições e histórico; não liquida
                    automaticamente. Emergência exige nova sessão para voltar a
                    operar.
                  </p>
                </article>
              ))
            )}
          </section>
          <section>
            <h3>Auditoria de sinais, risco e ordens fictícias</h3>
            {events.length ? (
              <ul className="quant-events">
                {events.map((e) => (
                  <li key={e.id}>
                    <strong>
                      {e.result.date ||
                        new Date(e.createdAt).toLocaleString("pt-BR")}{" "}
                      · {e.result.type || e.result.signal?.side}
                    </strong>
                    <p>
                      {e.result.signal?.reason}{" "}
                      {e.result.risk?.reasons?.join(", ")}{" "}
                      {e.result.reasons?.join(", ")} {e.result.action}
                    </p>
                    <p>
                      {e.result.order
                        ? `Ordem fictícia ${e.result.order.side}: ${Number(e.result.order.quantity) / 1e6} unidades; taxa ${money(e.result.order.fee)}`
                        : "Sem ordem executada."}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                Consulte uma sessão para ver as últimas 100 decisões e
                controles.
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
