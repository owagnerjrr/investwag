// Tokens stay in memory; reload requires login. Never expose secrets via VITE_*.
const base = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(
  /\/$/,
  "",
);
let token = null;
const listeners = new Set();
export function onConnectionStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const publish = (message) => listeners.forEach((listener) => listener(message));
async function waitForApi() {
  const deadline = Date.now() + 120000;
  let attempt = 0;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(base + "/health", {
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
      const data = await response.json();
      if (response.ok && data.mode === "simulation" && data.status === "ok")
        return;
    } catch {
      /* A suspended Render service may return HTML or no CORS headers. */
    }
    publish(
      "A API gratuita pode estar despertando. Aguarde até dois minutos; nenhuma movimentação é enviada durante essa espera.",
    );
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(1000 * ++attempt, 5000)),
    );
  }
  throw new ApiError(
    "A API está indisponível ou ainda despertando. Aguarde e tente novamente; sua operação pendente pode ser confirmada com segurança.",
  );
}
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}
async function request(path, options = {}) {
  let response;
  let slowTimer;
  try {
    // Probe only GET /health. Never replay a POST implicitly.
    await waitForApi();
    slowTimer = setTimeout(
      () =>
        publish(
          "Conectando à API demonstrativa… Aguarde a confirmação antes de repetir uma operação.",
        ),
      5000,
    );
    response = await fetch(base + path, {
      ...options,
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: "Bearer " + token }),
        ...options.headers,
      },
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      "Não foi possível confirmar a resposta da API. Verifique a conexão e tente novamente.",
    );
  } finally {
    clearTimeout(slowTimer);
    publish("");
  }
  if (response.status === 204) return null;
  let data;
  try {
    data = await response.json();
  } catch {
    if (response.status === 401) token = null;
    throw new ApiError(
      "A API retornou uma resposta temporária. Aguarde e confirme a operação pendente com segurança.",
      response.ok ? 0 : response.status,
    );
  }
  if (!response.ok) {
    if (response.status === 401) token = null;
    throw new ApiError(data.error || "Falha na solicitação", response.status);
  }
  return data;
}
export const demoApi = {
  register: (email, password) =>
    request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  async login(email, password) {
    const data = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    token = data.token;
    return data;
  },
  async logout() {
    try {
      if (token) await request("/auth/logout", { method: "POST", body: "{}" });
    } finally {
      token = null;
    }
  },
  get authenticated() {
    return Boolean(token);
  },
  portfolio: () => request("/portfolio"),
  movement: (type, amount, key) =>
    request("/portfolio/movements", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ type, amount }),
    }),
  pause: (paused) =>
    request("/portfolio/pause", {
      method: "POST",
      body: JSON.stringify({ paused }),
    }),
};

export const quantApi = {
  get: (path) => request("/quant" + path),
  post: (path, body, key) =>
    request("/quant" + path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Idempotency-Key": key },
    }),
};
export const pilotApi = {
  get: () => request("/pilot"),
  post: (body, key) =>
    request("/pilot", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Idempotency-Key": key },
    }),
};
