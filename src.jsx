import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { demoApi, onConnectionStatus } from "./api-client.js";
import "./style.css";
import QuantDashboard from "./quant-dashboard.jsx";
const fmt = (value) =>
  (Number(value) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
function App() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [mode, setMode] = useState("login");
  const [portfolio, setPortfolio] = useState(null),
    [amount, setAmount] = useState("10"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef(null),
    running = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("");
  useEffect(() => onConnectionStatus(setConnectionStatus), []);
  async function load() {
    setPortfolio(await demoApi.portfolio());
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
      if (e.status === 401) {
        setPortfolio(null);
        setPassword("");
        pending.current = null;
        setUncertain(false);
      }
      setError(e.message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function login(e) {
    e.preventDefault();
    await run(async () => {
      if (mode === "register") {
        await demoApi.register(email, password);
        setMode("login");
      }
      await demoApi.login(email, password);
      setPassword("");
      await load();
    });
  }
  async function change(type) {
    await run(async () => {
      // Keep the same key after an uncertain network response; retry cannot double-credit.
      if (!pending.current)
        pending.current = {
          type,
          amount: amount.trim().replace(",", "."),
          key: crypto.randomUUID(),
        };
      const operation = pending.current;
      let confirmed = false;
      try {
        await demoApi.movement(operation.type, operation.amount, operation.key);
        confirmed = true;
        await load();
        pending.current = null;
        setUncertain(false);
      } catch (e) {
        if (!confirmed && e.status >= 400 && e.status < 500) {
          pending.current = null;
          setUncertain(false);
        } else setUncertain(true);
        throw e;
      }
      setNotice("Movimentação simulada registrada.");
    });
  }
  async function logout() {
    await run(async () => {
      try {
        await demoApi.logout();
      } finally {
        setPortfolio(null);
        setPassword("");
        pending.current = null;
        setUncertain(false);
      }
    });
  }
  const cash = portfolio ? BigInt(portfolio.cashCents) : 0n;
  const contributed = portfolio ? BigInt(portfolio.contributedCents) : 0n;
  const withdrawn = portfolio ? BigInt(portfolio.withdrawnCents) : 0n;
  return (
    <main aria-busy={busy}>
      {connectionStatus && (
        <p className="feedback" role="status">
          {connectionStatus}
        </p>
      )}
      <header>
        <a className="brand" href="/" aria-label="WJ Quant início">
          <span className="mark" aria-hidden="true">
            ◈
          </span>
          <span>
            WJ <b>QUANT</b>
            <small>Carteira demonstrativa</small>
          </span>
        </a>
        <span className="badge">Somente simulação</span>
      </header>
      <p className="warning">
        Valores fictícios. Nenhuma movimentação de dinheiro real ou conexão com
        corretoras.
      </p>
      {!portfolio ? (
        <div className="welcome">
          <div className="intro">
            <p className="eyebrow">SIMPLES. TRANSPARENTE. SIMULADO.</p>
            <h1>
              Conheça sua carteira.
              <br />
              <span>No seu ritmo.</span>
            </h1>
            <p>
              Experimente aportes, retiradas e o controle de pausa em uma conta
              de demonstração. Acompanhe cada movimento pelo computador ou
              celular.
            </p>
            <div className="intro-note">
              <strong>Você está no controle</strong>
              <p>
                Não há execução de investimentos nesta versão. Nenhum retorno é
                prometido.
              </p>
            </div>
          </div>
          <section className="auth">
            <h2>
              {mode === "login"
                ? "Acessar demonstração"
                : "Criar conta demonstrativa"}
            </h2>
            <p>
              {mode === "login"
                ? "Entre para acompanhar seu saldo fictício."
                : "Sua carteira começa com saldo zero e pausada."}
            </p>
            <form onSubmit={login}>
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                required
                maxLength={254}
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
              <label htmlFor="password">Senha</label>
              <input
                id="password"
                type="password"
                required
                minLength={12}
                maxLength={72}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
              <p className="hint">
                Use de 12 a 72 bytes na senha (acentos podem ocupar mais de um
                byte).
              </p>
              <button className="full" disabled={busy} type="submit">
                {busy
                  ? "Aguarde…"
                  : mode === "login"
                    ? "Entrar"
                    : "Cadastrar e entrar"}
              </button>
              <button
                disabled={busy}
                type="button"
                className="text-button full"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
              >
                {mode === "login"
                  ? "Criar conta demonstrativa"
                  : "Já tenho conta"}
              </button>
            </form>
          </section>
        </div>
      ) : (
        <>
          <div className="dashboard-heading">
            <div>
              <p className="eyebrow">VISÃO GERAL</p>
              <h1>Minha carteira</h1>
            </div>
            <div className="actions">
              <button disabled={busy} className="alt" onClick={() => run(load)}>
                Atualizar saldo
              </button>
              <button disabled={busy} className="text-button" onClick={logout}>
                Sair
              </button>
            </div>
          </div>
          <section className="hero">
            <div>
              <p>Patrimônio simulado</p>
              <h2>{fmt(cash)}</h2>
              <p className="result">
                Resultado simulado{" "}
                <strong>{fmt(cash - contributed + withdrawn)}</strong>
              </p>
            </div>
            <div className="state">
              <span className="badge">
                {portfolio.paused ? "Pausado" : "Reativado · sem execução"}
              </span>
              <p>O motor de investimentos não está habilitado.</p>
            </div>
          </section>
          <div className="grid">
            <article>
              <span>Capital aportado</span>
              <strong>{fmt(contributed)}</strong>
            </article>
            <article>
              <span>Disponível</span>
              <strong>{fmt(cash)}</strong>
            </article>
            <article>
              <span>Investido</span>
              <strong>{fmt(0)}</strong>
            </article>
            <article>
              <span>Total retirado</span>
              <strong>{fmt(withdrawn)}</strong>
            </article>
          </div>
          <div className="workspace">
            <section>
              <h2>Movimentar saldo fictício</h2>
              <p>Aporte mínimo de R$ 10. Retiradas até o saldo disponível.</p>
              <label htmlFor="amount">Valor em reais</label>
              <input
                id="amount"
                inputMode="decimal"
                maxLength={16}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy || uncertain}
                aria-describedby="amount-hint"
              />
              <p id="amount-hint" className="hint">
                Exemplo: 10,25. Sem separador de milhares.
              </p>
              <div className="actions">
                <button
                  disabled={busy || uncertain}
                  onClick={() => change("DEPOSIT")}
                >
                  Simular aporte
                </button>
                <button
                  disabled={busy || uncertain}
                  className="alt"
                  onClick={() => change("WITHDRAW")}
                >
                  Simular retirada
                </button>
              </div>
              {uncertain && (
                <div className="retry">
                  <p>
                    A resposta não foi confirmada. Repita a mesma solicitação
                    com segurança para conferir o resultado.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => change(pending.current.type)}
                  >
                    Confirmar operação pendente
                  </button>
                </div>
              )}
            </section>
            <section>
              <p className="eyebrow">CONTROLE DO SISTEMA</p>
              <h2>
                {portfolio.paused ? "Sistema pausado" : "Sistema reativado"}
              </h2>
              <p>
                A pausa é salva na sua conta. Aportes e retiradas simulados
                continuam disponíveis. Reativar não inicia investimentos.
              </p>
              <button
                disabled={busy}
                className="alt"
                onClick={() =>
                  run(async () => {
                    await demoApi.pause(!portfolio.paused);
                    await load();
                    setNotice("Estado do sistema atualizado.");
                  })
                }
              >
                {portfolio.paused ? "Reativar sistema" : "Pausar sistema"}
              </button>
            </section>
          </div>
          <section className="history">
            <div className="section-heading">
              <h2>Histórico de movimentações</h2>
              <span>Últimas 100</span>
            </div>
            {portfolio.movements.length ? (
              <ul>
                {portfolio.movements.map((m) => (
                  <li key={m.id}>
                    <span
                      className={
                        m.type === "DEPOSIT"
                          ? "movement-icon"
                          : "movement-icon out"
                      }
                      aria-hidden="true"
                    >
                      {m.type === "DEPOSIT" ? "+" : "−"}
                    </span>
                    <div>
                      <strong>
                        {m.type === "DEPOSIT"
                          ? "Aporte simulado"
                          : "Retirada simulada"}
                      </strong>
                      <time dateTime={m.createdAt}>
                        {new Date(m.createdAt).toLocaleString("pt-BR")}
                      </time>
                    </div>
                    <strong className="movement-value">
                      {m.type === "DEPOSIT" ? "+" : "−"} {fmt(m.amountCents)}
                    </strong>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">
                <strong>Sua história começa aqui</strong>
                <p>Simule um aporte para ver sua primeira movimentação.</p>
              </div>
            )}
          </section>
          {import.meta.env.VITE_QUANT_ENABLED === "1" && (
            <QuantDashboard
              onExpired={() => setPortfolio(null)}
              globalPaused={portfolio.paused}
            />
          )}
        </>
      )}
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="feedback success" role="status">
          {notice}
        </p>
      )}
      <footer>
        <strong>WJ Quant · Demonstração</strong>
        <span>
          Dados salvos na conta. Sessão de 1 hora; ao recarregar, entre
          novamente.
        </span>
        <span>Não use dinheiro real. Nenhuma promessa de rentabilidade.</span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")).render(<App />);
