import { test } from "node:test";
import assert from "node:assert/strict";
import { connectWithRetry } from "../db-connection.js";
test("retoma conexão após PostgreSQL despertar sem executar operações", async () => {
  let calls = 0;
  const delays = [];
  await connectWithRetry(
    {
      $connect: async () => {
        if (++calls < 3) throw { errorCode: "P1001" };
      },
    },
    { delay: async (ms) => delays.push(ms), log: () => {} },
  );
  assert.equal(calls, 3);
  assert.deepEqual(delays, [2000, 4000]);
});
test("falha de credencial não é repetida e tentativas transitórias são limitadas", async () => {
  let calls = 0;
  await assert.rejects(
    connectWithRetry(
      {
        $connect: async () => {
          calls++;
          throw Error("credentials invalid");
        },
      },
      { delay: async () => {}, log: () => {} },
    ),
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    connectWithRetry(
      {
        $connect: async () => {
          calls++;
          throw { errorCode: "P1001" };
        },
      },
      { attempts: 3, delay: async () => {}, log: () => {} },
    ),
  );
  assert.equal(calls, 3);
});
