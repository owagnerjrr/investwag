import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app.js";
import { spawn } from "node:child_process";
import { once } from "node:events";

// Never silently skip these tests or clean an arbitrary database.
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
) {
  throw Error(
    "Integration requires a dedicated DATABASE_URL with database name ending in _test",
  );
}
const db = new PrismaClient();
const password = "Demo-Test-Password-2026";
const prefix = `test-${crypto.randomUUID()}`;
let server, base, tokenA, tokenB, userA;
async function call(path, body, token, extra = {}) {
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...extra,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    data: response.status === 204 ? null : await response.json(),
    headers: response.headers,
  };
}
async function wallet(token = tokenA) {
  const response = await call("/portfolio", undefined, token);
  assert.equal(response.status, 200);
  return response.data;
}
const move = (type, amount, token = tokenA, key = crypto.randomUUID()) =>
  call("/portfolio/movements", { type, amount }, token, {
    "Idempotency-Key": key,
  });

test("API e PostgreSQL: fluxos completos", async (t) => {
  await db.$connect();
  server = createApp(db, { authLimit: 1000, globalLimit: 2000 }).listen(
    0,
    "127.0.0.1",
  );
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
  try {
    await t.test(
      "saúde e autenticação obrigatória em todas as rotas protegidas",
      async () => {
        assert.deepEqual((await call("/health")).data, {
          status: "ok",
          mode: "simulation",
        });
        for (const [path, body] of [
          ["/portfolio"],
          ["/portfolio/pause", { paused: false }],
          ["/portfolio/movements", { type: "DEPOSIT", amount: "10" }],
          ["/auth/logout", {}],
        ]) {
          assert.equal((await call(path, body)).status, 401);
          assert.equal((await call(path, body, "a".repeat(64))).status, 401);
        }
      },
    );
    await t.test(
      "cadastro, validação, senha hash, e-mail normalizado e login",
      async () => {
        const email = `${prefix}-a@example.test`;
        assert.equal(
          (await call("/auth/register", { email, password: "short" })).status,
          400,
        );
        assert.equal(
          (await call("/auth/register", { email, password: "é".repeat(40) }))
            .status,
          400,
        );
        assert.equal(
          (await call("/auth/register", { email: "bad", password })).status,
          400,
        );
        assert.equal(
          (
            await call("/auth/register", {
              email: email.toUpperCase(),
              password,
            })
          ).status,
          201,
        );
        assert.equal(
          (await call("/auth/register", { email, password })).status,
          409,
        );
        userA = await db.user.findUniqueOrThrow({ where: { email } });
        assert.notEqual(userA.passwordHash, password);
        assert.match(userA.passwordHash, /^\$2/);
        assert.equal(
          (
            await call("/auth/login", {
              email,
              password: "wrong-password-2026",
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await call("/auth/login", {
              email: `${prefix}-unknown@example.test`,
              password,
            })
          ).status,
          401,
        );
        const login = await call("/auth/login", {
          email: email.toUpperCase(),
          password,
        });
        assert.equal(login.status, 200);
        tokenA = login.data.token;
        assert.equal(login.data.expiresIn, 3600);
        assert.equal(
          await db.session.findUnique({ where: { tokenHash: tokenA } }),
          null,
        );
        const emailB = `${prefix}-b@example.test`;
        assert.equal(
          (await call("/auth/register", { email: emailB, password })).status,
          201,
        );
        tokenB = (await call("/auth/login", { email: emailB, password })).data
          .token;
      },
    );
    await t.test(
      "carteira inicial, mínimo, limites, centavos, saldo insuficiente e rollback",
      async () => {
        assert.equal((await wallet()).cashCents, "0");
        assert.equal((await wallet()).paused, true);
        for (const amount of [
          "0",
          "-1",
          "9.99",
          "NaN",
          "1e3",
          "10.001",
          "1000000000.01",
        ])
          assert.equal((await move("DEPOSIT", amount)).status, 400);
        assert.equal((await move("WITHDRAW", "1")).status, 409);
        assert.equal((await move("DEPOSIT", "100,25")).status, 201);
        assert.equal((await move("WITHDRAW", "0.25")).status, 201);
        const p = await wallet();
        assert.equal(p.cashCents, "10000");
        assert.equal(p.contributedCents, "10025");
        assert.equal(p.withdrawnCents, "25");
        assert.equal(p.movements.length, 2);
        assert.equal((await move("WITHDRAW", "100.01")).status, 409);
        assert.equal((await wallet()).movements.length, 2);
        assert.equal((await move("DEPOSIT", "1000000000")).status, 409);
      },
    );
    await t.test(
      "isolamento entre usuários inclusive tentativa de indicar outra carteira",
      async () => {
        assert.equal((await wallet(tokenB)).cashCents, "0");
        assert.equal((await wallet(tokenB)).movements.length, 0);
        assert.equal(
          (
            await call(
              "/portfolio/movements",
              { type: "DEPOSIT", amount: "10", userId: userA.id },
              tokenB,
            )
          ).status,
          400,
        );
        assert.equal(
          (await call("/portfolio?userId=" + userA.id, undefined, tokenB)).data
            .cashCents,
          "0",
        );
        assert.equal(
          (await call("/portfolio/pause", { paused: false }, tokenB)).status,
          200,
        );
        assert.equal((await wallet()).paused, true);
      },
    );
    await t.test(
      "pausar e reativar preservam saldo; controle não impede aportes/retiradas",
      async () => {
        assert.equal(
          (await call("/portfolio/pause", { paused: "false" }, tokenA)).status,
          400,
        );
        for (const paused of [false, true, false]) {
          assert.equal(
            (await call("/portfolio/pause", { paused }, tokenA)).data.paused,
            paused,
          );
          assert.equal((await wallet()).cashCents, "10000");
        }
      },
    );
    await t.test(
      "retiradas concorrentes nunca produzem saldo negativo",
      async () => {
        const results = await Promise.all(
          Array.from({ length: 10 }, () => move("WITHDRAW", "30")),
        );
        assert.equal(results.filter((r) => r.status === 201).length, 3);
        assert.equal(results.filter((r) => r.status === 409).length, 7);
        const p = await wallet();
        assert.equal(p.cashCents, "1000");
        assert.equal(p.withdrawnCents, "9025");
        assert.equal(p.movements.length, 5);
      },
    );
    await t.test(
      "repetição concorrente é idempotente; conflito da chave é rejeitado",
      async () => {
        const key = crypto.randomUUID();
        const results = await Promise.all(
          Array.from({ length: 8 }, () => move("DEPOSIT", "10", tokenA, key)),
        );
        assert.equal(results.filter((r) => r.status === 201).length, 1);
        assert.equal(results.filter((r) => r.status === 200).length, 7);
        assert.equal(new Set(results.map((r) => r.data.id)).size, 1);
        assert.equal((await move("DEPOSIT", "11", tokenA, key)).status, 409);
        assert.equal((await wallet()).cashCents, "2000");
        assert.equal((await move("DEPOSIT", "10", tokenB, key)).status, 201);
      },
    );
    await t.test(
      "aportes e retiradas concorrentes reconciliam livro-caixa",
      async () => {
        const results = await Promise.all([
          ...Array.from({ length: 6 }, () => move("DEPOSIT", "10")),
          ...Array.from({ length: 6 }, () => move("WITHDRAW", "1")),
        ]);
        assert.ok(results.every((r) => r.status === 201));
        const p = await wallet();
        assert.equal(p.cashCents, "7400");
        assert.equal(
          BigInt(p.cashCents),
          BigInt(p.contributedCents) - BigInt(p.withdrawnCents),
        );
        const rows = await db.cashMovement.findMany({
          where: { portfolio: { userId: userA.id } },
        });
        assert.equal(
          rows.reduce(
            (sum, m) =>
              sum + (m.type === "DEPOSIT" ? m.amountCents : -m.amountCents),
            0n,
          ),
          7400n,
        );
      },
    );
    await t.test(
      "persistência de saldo, histórico, pausa e sessão após novo processo",
      async () => {
        const before = await wallet();
        await new Promise((resolve) => server.close(resolve));
        await db.$disconnect();
        // Stop the original app; restart in a new OS process and Prisma connection.
        const fixture = spawn(process.execPath, ["tests/restart-fixture.js"], {
          cwd: new URL("../", import.meta.url),
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        const address = await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(Error("restart fixture timeout")),
            15000,
          );
          fixture.once("error", reject);
          fixture.stdout.once("data", (data) => {
            clearTimeout(timer);
            resolve(String(data).trim());
          });
          fixture.once("exit", (code) => {
            clearTimeout(timer);
            reject(Error(`fixture exited: ${code}`));
          });
        });
        try {
          const r = await fetch(address + "/portfolio", {
            headers: { Authorization: `Bearer ${tokenA}` },
          });
          assert.equal(r.status, 200);
          assert.deepEqual(await r.json(), before);
        } finally {
          fixture.kill();
          await new Promise((resolve) => fixture.once("exit", resolve));
          await db.$connect();
          server = createApp(db, { authLimit: 1000, globalLimit: 2000 }).listen(
            0,
            "127.0.0.1",
          );
          await once(server, "listening");
          base = `http://127.0.0.1:${server.address().port}`;
        }
      },
    );
    await t.test("expiração e logout revogam a sessão", async () => {
      const token = (
        await call("/auth/login", { email: userA.email, password })
      ).data.token;
      await db.session.update({
        where: {
          tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
        },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      assert.equal((await call("/portfolio", undefined, token)).status, 401);
      assert.equal((await call("/auth/logout", {}, tokenA)).status, 204);
      assert.equal((await call("/portfolio", undefined, tokenA)).status, 401);
    });
    await t.test(
      "CORS, JSON inválido, limite do corpo e erros sem segredos",
      async () => {
        const allowed = await call("/health", undefined, undefined, {
          Origin: "http://localhost:5173",
        });
        assert.equal(
          allowed.headers.get("access-control-allow-origin"),
          "http://localhost:5173",
        );
        const blocked = await call("/health", undefined, undefined, {
          Origin: "https://evil.example",
        });
        assert.equal(blocked.headers.get("access-control-allow-origin"), null);
        const r = await fetch(base + "/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        });
        assert.equal(r.status, 400);
        assert.equal(
          (await call("/auth/login", { large: "x".repeat(20000) })).status,
          413,
        );
        assert.equal((await call("/unknown")).status, 404);
      },
    );
    await t.test("limite de tentativas de autenticação", async () => {
      const limited = createApp(db, { authLimit: 2 }).listen(0, "127.0.0.1");
      await once(limited, "listening");
      const old = base;
      base = `http://127.0.0.1:${limited.address().port}`;
      try {
        assert.equal((await call("/auth/login", {})).status, 400);
        assert.equal((await call("/auth/login", {})).status, 400);
        assert.equal((await call("/auth/login", {})).status, 429);
      } finally {
        base = old;
        await new Promise((resolve) => limited.close(resolve));
      }
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.$disconnect();
  }
});
