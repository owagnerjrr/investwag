import { test } from "node:test";
import assert from "node:assert/strict";
import { INITIAL, parseBRL, transition, validateState } from "./ledger.js";
test("converte reais em centavos sem float na carteira", () => {
  assert.equal(parseBRL("10,25"), 1025);
  assert.throws(() => parseBRL("1.234"));
});
test("bloqueia aporte inferior a dez reais", () =>
  assert.throws(() =>
    transition(INITIAL, { type: "DEPOSIT", amount: "9,99" }),
  ));
test("aporte e saque preservam resultado", () => {
  const a = transition(INITIAL, { type: "DEPOSIT", amount: "10" });
  const b = transition(a, { type: "WITHDRAW", amount: "5" });
  assert.equal(b.cashCents, 20500);
  assert.equal(b.cashCents - b.contributedCents + b.withdrawnCents, 0);
});
test("não permite saque maior que saldo", () =>
  assert.throws(() =>
    transition(INITIAL, { type: "WITHDRAW", amount: "201" }),
  ));
test("pausa preserva patrimônio", () => {
  const s = transition(INITIAL, { type: "TOGGLE" });
  assert.equal(s.paused, true);
  assert.equal(s.cashCents, 20000);
});
test("rejeita overflow acumulado e estado sem reconciliação", () => {
  const full = {
    ...INITIAL,
    cashCents: Number.MAX_SAFE_INTEGER,
    contributedCents: Number.MAX_SAFE_INTEGER,
  };
  assert.throws(() => transition(full, { type: "DEPOSIT", amount: "10" }));
  assert.equal(validateState({ ...INITIAL, cashCents: 1 }), false);
  assert.equal(parseBRL("90071992547409.91"), Number.MAX_SAFE_INTEGER);
  assert.throws(() => parseBRL("90071992547409.92"));
});
