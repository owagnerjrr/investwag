// Tokens stay in memory; reload requires login. Never expose secrets via VITE_*.
const base = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(
  /\/$/,
  "",
);
let token = null;
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(base + path, {
      ...options,
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: "Bearer " + token }),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      "Não foi possível confirmar a resposta da API. Verifique a conexão e tente novamente.",
    );
  }
  if (response.status === 204) return null;
  const data = await response
    .json()
    .catch(() => ({ error: "Resposta inválida do servidor" }));
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
