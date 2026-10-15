import React, { useEffect, useRef, useState } from "react";
import { pilotApi } from "./api-client.js";
const money = (c) => {
  const n = BigInt(c),
    absolute = n < 0n ? -n : n;
  return `${n < 0n ? "- " : ""}R$ ${(absolute / 100n).toLocaleString("pt-BR")},${String(absolute % 100n).padStart(2, "0")}`;
};
const when = (t) =>
  t ? new Date(t).toLocaleString("pt-BR") : "Ainda não executado";
const labels = {
  ACTIVE: "Aguardando execução agendada",
  PAUSED: "Pausado",
  PROTECTED: "Proteção automática",
  EMERGENCY: "Interrompido por emergência",
};
export default function PilotDashboard({ onSessionExpired, onGlobalChange }) {
  const [account, setAccount] = useState(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [consent, setConsent] = useState(false),
    [amount, setAmount] = useState("10");
  const operation = useRef(null),
    running = useRef(false),
    stopKey = useRef(null);
  const [stopping, setStopping] = useState(false);
  const handle = (e) => {
    setError(e.message);
    if (e.status === 401) onSessionExpired();
  };
  async function load() {
    const a = await pilotApi.get();
    setAccount((previous) =>
      previous?.status === "EMERGENCY" && a?.status !== "EMERGENCY"
        ? previous
        : a,
    );
  }
  async function stop() {
    if (stopping) return;
    setStopping(true);
    setError("");
    if (!stopKey.current) stopKey.current = crypto.randomUUID();
    try {
      await pilotApi.post({ action: "EMERGENCY" }, stopKey.current);
      await load();
    } catch (e) {
      handle(e);
    } finally {
      setStopping(false);
    }
  }
  useEffect(() => {
    let alive = true;
    pilotApi
      .get()
      .then((a) => {
        if (alive) setAccount(a);
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          if (e.status === 401) onSessionExpired();
        }
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [onSessionExpired]);
  async function change(body) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      if (!operation.current)
        operation.current = { body, key: crypto.randomUUID() };
      const action = operation.current.body.action;
      await pilotApi.post(operation.current.body, operation.current.key);
      await load();
      if (["ACTIVATE", "RESUME"].includes(action)) await onGlobalChange();
      operation.current = null;
      setPending(false);
    } catch (e) {
      if (e.status >= 400 && e.status < 500) {
        operation.current = null;
        setPending(false);
      } else setPending(true);
      handle(e);
    } finally {
      setBusy(false);
      running.current = false;
    }
  }
  async function deposit(action) {
    const text = amount.trim().replace(",", ".");
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) {
      setError("Informe um valor com até duas casas decimais.");
      return;
    }
    const [whole, fraction = ""] = text.split(".");
    await change({
      action,
      amountCents: String(
        BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")),
      ),
    });
  }
  const locked = busy || pending || stopping,
    s = account?.state;
  return (
    <section className="pilot-area" aria-busy={busy}>
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">WJ QUANT 3.0 · SOMENTE SIMULAÇÃO</p>
          <h1>Piloto automático fictício</h1>
        </div>
        <span className="badge">
          {account ? labels[account.status] : "Aguardando autorização"}
        </span>
      </div>
      <p className="warning">
        Capital virtual próprio do piloto. As carteiras 1.0/2.0 abaixo são
        preservadas e não são somadas ou transferidas automaticamente. Sem
        corretoras, dinheiro real ou promessa de lucro.
      </p>
      {error && (
        <p role="alert" className="feedback error">
          {error}
        </p>
      )}
      {pending && (
        <div className="retry">
          <p>
            A resposta não foi confirmada. Repita a mesma ação para verificar o
            registro sem duplicar valores.
          </p>
          <button
            disabled={busy}
            onClick={() => change(operation.current.body)}
          >
            Confirmar ação do piloto pendente
          </button>
        </div>
      )}
      {pending && !account && (
        <button disabled={stopping} onClick={stop}>
          Emergência do piloto
        </button>
      )}
      {!account ? (
        <div className="pilot-consent">
          <h2>Uma autorização. Decisões auditáveis.</h2>
          <p>
            O piloto pesquisa o catálogo disponível, compara duas estratégias
            SMA e mantém o capital disponível quando não há oportunidade
            aceitável. O proprietário precisa configurar o agendador externo
            para executar sem navegador; não há garantia de operação 24h.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={consent}
              disabled={locked}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Autorizo somente a automação fictícia e a reativação da pausa global
            da minha conta, com os limites conservadores informados.
          </label>
          <p>
            Exposição por ativo até 20%, por mercado 30%, total 40%; perda
            diária até 2%, drawdown 10%, até 4 operações/dia. O Guard pode
            bloquear toda operação.
          </p>
          <button
            disabled={locked || !consent}
            onClick={() => change({ action: "ACTIVATE", consent: true })}
          >
            Autorizar piloto fictício
          </button>
        </div>
      ) : (
        <>
          {!account.integrityValid ? (
            <div>
              <p role="alert">
                Não foi possível reconciliar os valores. Consulte a auditoria e
                mantenha o piloto interrompido.
              </p>
              <button
                disabled={stopping || account.status === "EMERGENCY"}
                onClick={stop}
              >
                Emergência do piloto
              </button>
            </div>
          ) : (
            <>
              <section className="hero">
                <div>
                  <p>Patrimônio fictício do piloto</p>
                  <h2>{money(s.equityCents)}</h2>
                  <p>
                    Resultado acumulado simulado{" "}
                    <strong>{money(s.netCents)}</strong>
                  </p>
                </div>
                <div>
                  <p>{s.openPositions} posições fictícias abertas</p>
                  <p>Marcação: {s.valuationAt || "sem posições processadas"}</p>
                </div>
              </section>
              <div className="grid pilot-metrics">
                {[
                  ["Disponível virtual", s.cashCents],
                  ["Investido fictício", s.investedCents],
                  ["P/L realizado", s.realizedCents],
                  ["P/L não realizado", s.unrealizedCents],
                  ["Resultado diário", s.dailyCents],
                  ["Resultado mensal", s.monthlyCents],
                  ["Aportes ao piloto", s.contributedCents],
                  ["Retiradas do piloto", s.withdrawnCents],
                ].map(([label, value]) => (
                  <article key={label}>
                    <span>{label}</span>
                    <strong>{money(value)}</strong>
                  </article>
                ))}
              </div>
              <div className="workspace">
                <section>
                  <h2>Capital fictício</h2>
                  <label htmlFor="pilot-amount">
                    Valor para o piloto em reais
                  </label>
                  <input
                    id="pilot-amount"
                    inputMode="decimal"
                    maxLength={16}
                    value={amount}
                    disabled={locked}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <p className="hint">
                    Aporte mínimo R$ 10. Retirada somente do disponível, sem
                    venda forçada. Aporte não é lucro.
                  </p>
                  <div className="actions">
                    <button
                      disabled={locked}
                      onClick={() => deposit("DEPOSIT")}
                    >
                      Adicionar ao piloto
                    </button>
                    <button
                      className="alt"
                      disabled={locked}
                      onClick={() => deposit("WITHDRAW")}
                    >
                      Retirar do piloto
                    </button>
                  </div>
                </section>
                <section>
                  <h2>Controle da automação</h2>
                  <p>Última análise: {when(s.lastAnalysis)}</p>
                  <p>Último ciclo: {when(account.lastRun)}</p>
                  <p>
                    Próxima tentativa prevista:{" "}
                    {account.nextRun ? when(account.nextRun) : "não agendada"}
                  </p>
                  <p className="hint">
                    Previsão diária; depende do agendador externo. API gratuita
                    pode suspender. Atualizar esta tela não executa lotes.
                  </p>
                  <div className="actions">
                    <button
                      disabled={locked || account.status !== "ACTIVE"}
                      onClick={() => change({ action: "PAUSE" })}
                    >
                      Pausar piloto
                    </button>
                    <button
                      className="alt"
                      disabled={locked || account.status !== "PAUSED"}
                      onClick={() => change({ action: "RESUME" })}
                    >
                      Retomar piloto
                    </button>
                    <button
                      className="danger"
                      disabled={stopping || account.status === "EMERGENCY"}
                      onClick={stop}
                    >
                      Emergência do piloto
                    </button>
                  </div>
                  <p className="hint">
                    Retomar também reativa a pausa global. Emergência impede
                    nova retomada; preserva posições e histórico.
                  </p>
                </section>
              </div>
            </>
          )}
          <section className="pilot-alerts">
            <h2>Alertas e proteção</h2>
            {account.schedule?.lastError && (
              <p role="alert">
                Falha registrada pelo agendador: {account.schedule.lastError}
              </p>
            )}
            {!account.schedule?.lastSuccess && (
              <p>
                Agendamento ainda não comprovado nesta instalação. Aguarde a
                configuração e validação pelo proprietário.
              </p>
            )}
            {account.scheduleOverdue && (
              <p role="alert">
                Execução prevista está atrasada. Verifique o agendador; não há
                garantia 24/7.
              </p>
            )}
            {s.alerts?.length ? (
              <ul>
                {s.alerts.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            ) : (
              <p>
                Nenhum alerta registrado. Isso não garante disponibilidade ou
                ausência de risco.
              </p>
            )}
          </section>
          <details>
            <summary>
              Pesquisa, estratégias, risco e auditoria do piloto
            </summary>
            <p>
              Seleção limitada, treino e validação separados; custo/slippage
              estimados. Fonte de câmbio é somente pesquisa, nunca preço
              executável.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ativo / mercado</th>
                    <th>Fonte e data</th>
                    <th>Classificação e motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {s.scanner?.map((a) => (
                    <tr key={a.symbol}>
                      <td>
                        {a.symbol} · {a.market}
                      </td>
                      <td>
                        {a.source || "Indisponível"}
                        <br />
                        {a.sourceDate || "sem dados"}
                        {a.stale ? " · desatualizado" : ""}
                      </td>
                      <td>
                        {a.reason}{" "}
                        {a.referenceOnly ? "· somente referência" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Posições fictícias</h3>
            {Object.entries(s.positions || {}).map(([symbol, p]) => (
              <p key={symbol}>
                {symbol}: {Number(p.quantity) / 1e6} unidades fictícias, custo{" "}
                {money(p.costCents)}.
              </p>
            ))}
            <h3>Últimos 30 registros</h3>
            <ul className="quant-events">
              {account.events.map((e) => (
                <li key={e.id}>
                  <strong>
                    {when(e.createdAt)} · {e.kind}
                  </strong>
                  <p>
                    {e.result.reason || e.result.status}{" "}
                    {e.result.orders !== undefined
                      ? `· ${e.result.orders} ordens fictícias`
                      : ""}
                  </p>
                  {e.result.decisions?.map((d, i) => (
                    <p key={i}>
                      {d.date} · {d.symbol} · {d.signal?.side || "WAIT"}:{" "}
                      {d.reason || d.signal?.reason}.{" "}
                      {d.risk?.reasons.join(", ")}{" "}
                      {d.order
                        ? `Ordem fictícia ${d.order.side}, taxa ${money(d.order.fee)}.`
                        : "Sem ordem."}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </details>
          <button
            className="alt"
            disabled={locked}
            onClick={async () => {
              setBusy(true);
              try {
                await load();
              } catch (e) {
                handle(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Atualizar painel do piloto
          </button>
        </>
      )}
    </section>
  );
}
