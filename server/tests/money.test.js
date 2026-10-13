import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoney } from "../app.js";

test("parser usa centavos exatos e rejeita entradas inválidas", () => {
  assert.equal(parseMoney("10,25"), 1025n);
  assert.equal(parseMoney("0.01"), 1n);
  assert.equal(parseMoney("1000000000"), 100000000000n);
  for (const value of [
    "",
    "0",
    "-10",
    "NaN",
    "Infinity",
    "1e3",
    "1.234",
    "1,000.00",
    " 10",
    "01",
    "1000000000.01",
    10,
    null,
    "9".repeat(200),
  ]) {
    assert.throws(() => parseMoney(value), String(value));
  }
});
