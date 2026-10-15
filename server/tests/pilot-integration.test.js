import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app.js";
import { signature } from "../pilot/routes.js";
import { tick, runAccount } from "../pilot/service.js";
import { pilotFixture } from "./pilot-fixtures.js";
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw Error("Dedicated _test database required");
const db = new PrismaClient(),
  prefix = "pilot-" + crypto.randomUUID(),
  secret = "test-only-scheduler-secret-".repeat(3),
  exec = promisify(execFile);
test("pilot PostgreSQL: autonomous signed job, ledger, isolation, concurrency, recovery and controls", async (t) => {
  let server,
    base,
    users = [],
    tokens = [],
    calls = 0;
  const symbol = "FIXTURE-" + prefix;
  const options = {
    pilotEnabled: true,
    authLimit: 1000,
    globalLimit: 2000,
    schedulerSecret: secret,
    now: new Date("2026-10-14T17:23:00Z"),
    provider: async (a, o) => {
      calls++;
      return pilotFixture(a, o);
    },
    catalog: [{ symbol, market: "CRYPTO", source: "SYNTHETIC PILOT FIXTURE" }],
  };
  const start = async () => {
    server = createApp(db, options).listen(0, "127.0.0.1");
    await once(server, "listening");
    base = "http://127.0.0.1:" + server.address().port;
  };
  const stop = () => new Promise((r) => server.close(r));
  const call = async (
    path,
    body,
    who = 0,
    key = crypto.randomUUID(),
    headers = {},
  ) => {
    const r = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + tokens[who],
        "Idempotency-Key": key,
        ...headers,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { status: r.status, data: r.status === 204 ? null : await r.json() };
  };
  const job = async () => {
    const timestamp = String(+options.now);
    return call("/internal/pilot/tick", {}, 0, crypto.randomUUID(), {
      "X-Pilot-Timestamp": timestamp,
      "X-Pilot-Signature": signature(secret, timestamp),
    });
  };
  try {
    await start();
    for (let i = 0; i < 2; i++) {
      const email = `${prefix}-${i}@example.test`,
        password = "Pilot-Test-Password-2026";
      assert.equal(
        (await call("/auth/register", { email, password })).status,
        201,
      );
      const login = await call("/auth/login", { email, password });
      tokens.push(login.data.token);
      users.push(await db.user.findUniqueOrThrow({ where: { email } }));
    }
    await t.test(
      "auth, one-time consent, old wallet untouched except explicit global resume",
      async () => {
        options.pilotEnabled = false;
        assert.equal((await call("/pilot")).status, 404);
        options.pilotEnabled = true;
        assert.equal((await call("/pilot", undefined, 99)).status, 401);
        assert.equal((await jobWithoutSignature()).status, 401);
        assert.equal(
          (await call("/pilot", { action: "ACTIVATE", consent: false })).status,
          400,
        );
        const key = crypto.randomUUID(),
          a = await call(
            "/pilot",
            { action: "ACTIVATE", consent: true },
            0,
            key,
          );
        assert.equal(a.status, 200);
        assert.deepEqual(
          await call("/pilot", { action: "ACTIVATE", consent: true }, 0, key),
          a,
        );
        assert.equal(
          (await call("/pilot", { action: "PAUSE" }, 0, key)).status,
          409,
        );
        const old = await call("/portfolio");
        assert.equal(old.data.cashCents, "0");
        assert.equal(old.data.paused, false);
        assert.equal((await call("/pilot", undefined, 1)).data, null);
        assert.equal(
          (
            await call("/pilot", {
              action: "DEPOSIT",
              amountCents: "10000",
              userId: users[1].id,
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "concurrent money, same-key replay, insufficient funds, and audit reconciliation",
      async () => {
        const key = crypto.randomUUID(),
          results = await Promise.all(
            Array.from({ length: 8 }, () =>
              call(
                "/pilot",
                { action: "DEPOSIT", amountCents: "100000" },
                0,
                key,
              ),
            ),
          );
        assert.ok(results.every((r) => r.status === 200));
        assert.equal(
          await db.pilotEvent.count({
            where: { account: { userId: users[0].id }, kind: "DEPOSIT" },
          }),
          1,
        );
        assert.equal(
          (
            await call(
              "/pilot",
              { action: "DEPOSIT", amountCents: "100001" },
              0,
              key,
            )
          ).status,
          409,
        );
        const withdrawals = await Promise.all(
          Array.from({ length: 10 }, () =>
            call("/pilot", { action: "WITHDRAW", amountCents: "30000" }),
          ),
        );
        assert.equal(withdrawals.filter((r) => r.status === 200).length, 3);
        const a = (await call("/pilot")).data;
        assert.equal(a.state.cashCents, "10000");
        assert.equal(a.state.netCents, "0");
        assert.equal((await call("/portfolio")).data.cashCents, "0");
        const entries = await db.pilotEvent.findMany({
          where: { accountId: a.id, kind: { in: ["DEPOSIT", "WITHDRAW"] } },
        });
        const net = entries.reduce(
          (v, e) =>
            v +
            (e.kind === "DEPOSIT" ? 1n : -1n) * BigInt(e.result.amountCents),
          0n,
        );
        assert.equal(net, 10000n);
      },
    );
    await t.test(
      "concurrent signed daily cycles execute once, causally buy/sell and keep original wallet",
      async () => {
        const a = await db.pilotAccount.findUniqueOrThrow({
          where: { userId: users[0].id },
        });
        const state = {
          ...a.state,
          startedOn: "2026-10-10",
          checkpoints: { [symbol]: "2026-10-14" },
          selections: {
            [symbol]: {
              eligible: true,
              strategy: { fast: 2, slow: 3 },
              through: "2026-10-14",
              reason: "SYNTHETIC PINNED TEST STRATEGY",
              score: 1,
            },
          },
        };
        await db.pilotAccount.update({
          where: { id: a.id },
          data: { state, authorizedAt: new Date("2026-10-10") },
        });
        options.now = new Date("2026-10-19T17:23:00Z");
        const results = await Promise.all([job(), job()]);
        assert.ok(results.every((r) => r.status === 200));
        assert.equal(
          await db.pilotEvent.count({
            where: { accountId: a.id, kind: "CYCLE" },
          }),
          1,
        );
        assert.equal(calls, 1);
        const cycle = await db.pilotEvent.findFirstOrThrow({
          where: { accountId: a.id, kind: "CYCLE" },
        });
        assert.ok(cycle.result.decisions.some((e) => e.order?.side === "BUY"));
        assert.ok(cycle.result.decisions.some((e) => e.order?.side === "SELL"));
        assert.ok(
          cycle.result.decisions.every((e) => e.order?.fictitious !== false),
        );
        const result = (await call("/pilot")).data;
        assert.equal(result.state.checkpoints[symbol], "2026-10-18");
        assert.ok(BigInt(result.state.cashCents) > 0n);
        assert.equal((await call("/portfolio")).data.cashCents, "0");
        const snap = await db.pilotMarket.findUniqueOrThrow({
          where: { symbol },
        });
        assert.match(snap.snapshot.source, /SYNTHETIC/);
      },
    );
    await t.test(
      "new process without any browser resumes the persisted checkpoint and session survives API restart",
      async () => {
        await stop();
        const child = await exec(
          process.execPath,
          ["tests/pilot-worker-fixture.js"],
          {
            cwd: new URL("../", import.meta.url),
            env: {
              ...process.env,
              PILOT_FIXTURE_NOW: "2026-10-20T17:23:00Z",
              PILOT_FIXTURE_SYMBOL: symbol,
            },
            windowsHide: true,
            timeout: 60000,
          },
        );
        assert.match(child.stdout, /"accounts":1/);
        options.now = new Date("2026-10-20T17:23:00Z");
        await start();
        assert.equal((await call("/portfolio")).status, 200);
        assert.equal(
          (await call("/pilot")).data.state.checkpoints[symbol],
          "2026-10-19",
        );
      },
    );
    await t.test(
      "pause, resume, global pause, emergency, source failures and expired signatures",
      async () => {
        assert.equal(
          (await call("/pilot", { action: "PAUSE" })).data.status,
          "PAUSED",
        );
        options.now = new Date("2026-10-21T17:23:00Z");
        assert.equal((await job()).data.accounts, 0);
        assert.equal(
          (await call("/pilot", { action: "RESUME" })).data.status,
          "ACTIVE",
        );
        await call("/portfolio/pause", { paused: true });
        await job();
        const current = (await call("/pilot")).data;
        assert.ok(current.state.alerts.includes("GLOBAL_PAUSED"));
        assert.equal(
          (await call("/pilot", { action: "EMERGENCY" })).data.status,
          "EMERGENCY",
        );
        assert.equal((await call("/pilot", { action: "RESUME" })).status, 409);
        options.now = new Date("2026-10-22T17:23:00Z");
        assert.equal((await job()).data.accounts, 0);
        const expired = String(+options.now - 600000);
        assert.equal(
          (
            await call("/internal/pilot/tick", {}, 0, crypto.randomUUID(), {
              "X-Pilot-Timestamp": expired,
              "X-Pilot-Signature": signature(secret, expired),
            })
          ).status,
          401,
        );
        await call("/pilot", { action: "ACTIVATE", consent: true }, 1);
        const badOptions = {
          ...options,
          provider: async () => {
            throw Error("secret must never be logged");
          },
          catalog: [
            {
              symbol: "FAIL-" + prefix,
              market: "CRYPTO",
              source: "SYNTHETIC FAILURE",
            },
          ],
        };
        for (let i = 0; i < 3; i++)
          await tick(db, {
            ...badOptions,
            now: new Date(+options.now + i * 86400000),
          });
        const failed = (await call("/pilot", undefined, 1)).data;
        assert.equal(failed.status, "PROTECTED");
        assert.equal(failed.state.equityCents, "0");
        assert.ok(
          failed.state.alerts.some((a) => a.includes("SOURCE_UNAVAILABLE")),
        );
        assert.equal(
          (await call("/pilot", { action: "PAUSE" }, 1)).data.status,
          "PROTECTED",
        );
        assert.equal(
          (await call("/pilot", { action: "RESUME" }, 1)).status,
          409,
        );
      },
    );
    await t.test(
      "crashed lease is recoverable and superseded workers cannot commit",
      async () => {
        await db.pilotClock.update({
          where: { id: "daily" },
          data: {
            leaseToken: "crashed-test-worker",
            leaseUntil: new Date(+options.now - 1000),
          },
        });
        const r = await job();
        assert.equal(r.status, 200);
        const clock = await db.pilotClock.findUniqueOrThrow({
          where: { id: "daily" },
        });
        assert.equal(clock.leaseToken, null);
        assert.ok(clock.lastSuccess);
        await assert.rejects(() =>
          runAccount(db, users[0].id, "superseded", [], {
            ...options,
            leaseToken: "crashed-test-worker",
          }),
        );
      },
    );
  } finally {
    if (server?.listening) await stop();
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.pilotMarket.deleteMany({
      where: { symbol: { in: [symbol, "FAIL-" + prefix] } },
    });
    await db.$disconnect();
  }
  async function jobWithoutSignature() {
    return call("/internal/pilot/tick", {});
  }
});
