export const INITIAL = {
  cashCents: 20000,
  contributedCents: 20000,
  withdrawnCents: 0,
  paused: false,
  events: [],
};
export function parseBRL(input) {
  const s = String(input).trim().replace(",", ".");
  if (s.length > 20 || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(s))
    throw Error("Valor inválido: use até duas casas decimais.");
  const [whole, part = ""] = s.split(".");
  const cents = BigInt(whole) * 100n + BigInt(part.padEnd(2, "0"));
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error("Valor inválido.");
  return Number(cents);
}
export function transition(state, action) {
  if (!validateState(state)) throw Error("Carteira inválida.");
  if (action.type === "DEPOSIT" || action.type === "WITHDRAW") {
    const cents = parseBRL(action.amount);
    if (action.type === "DEPOSIT" && cents < 1000)
      throw Error("O aporte mínimo é R$ 10.");
    if (action.type === "WITHDRAW" && cents > state.cashCents)
      throw Error("Saldo disponível insuficiente.");
    const next = {
      ...state,
      cashCents: state.cashCents + (action.type === "DEPOSIT" ? cents : -cents),
      contributedCents:
        state.contributedCents + (action.type === "DEPOSIT" ? cents : 0),
      withdrawnCents:
        state.withdrawnCents + (action.type === "WITHDRAW" ? cents : 0),
      events: [
        { type: action.type, amountCents: cents, at: new Date().toISOString() },
        ...state.events,
      ].slice(0, 100),
    };
    if (!validateState(next)) throw Error("Limite da carteira excedido.");
    return next;
  }
  if (action.type === "TOGGLE")
    return {
      ...state,
      paused: !state.paused,
      events: [
        {
          type: state.paused ? "RESUMED" : "PAUSED",
          at: new Date().toISOString(),
        },
        ...state.events,
      ].slice(0, 100),
    };
  throw Error("Ação desconhecida");
}
export function validateState(v) {
  return Boolean(
    v &&
    ["cashCents", "contributedCents", "withdrawnCents"].every(
      (k) => Number.isSafeInteger(v[k]) && v[k] >= 0,
    ) &&
    BigInt(v.cashCents) ===
      BigInt(v.contributedCents) - BigInt(v.withdrawnCents) &&
    typeof v.paused === "boolean" &&
    Array.isArray(v.events),
  );
}
