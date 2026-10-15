import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import { initialState, serialize } from "../quant/simulation.js";
const exec = promisify(execFile);
test("additive v3 migration preserves preexisting v1/v2 rows and schema", async () => {
  const url = new URL(
    process.env.DATABASE_URL || "postgresql://invalid/invalid",
  );
  if (!url.pathname.endsWith("_test"))
    throw Error("Dedicated _test DB required");
  const schema = "pilot_upgrade_" + crypto.randomBytes(8).toString("hex"),
    admin = new PrismaClient();
  url.searchParams.set("schema", schema);
  const old = new PrismaClient({ datasourceUrl: url.href });
  const cli = (args) =>
    exec(process.execPath, ["node_modules/prisma/build/index.js", ...args], {
      cwd: new URL("../", import.meta.url),
      env: { ...process.env, DATABASE_URL: url.href },
      windowsHide: true,
      timeout: 60000,
    });
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const migrations = (
      await readdir(new URL("../prisma/migrations/", import.meta.url))
    )
      .filter((n) => /^2026/.test(n) && n < "202610150001_pilot")
      .sort();
    for (const name of migrations) {
      const sql = await readFile(
        new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url),
        "utf8",
      );
      for (const statement of sql
        .replace(/^\s*--.*$/gm, "")
        .split(";")
        .filter((s) => s.trim()))
        await old.$executeRawUnsafe(statement);
      await cli(["migrate", "resolve", "--applied", name]);
    }
    await old.user.create({
      data: {
        id: "old-user",
        email: "unchanged@example.test",
        passwordHash: "old-hash",
      },
    });
    await old.session.create({
      data: {
        userId: "old-user",
        tokenHash: "old-token-hash",
        expiresAt: new Date("2030-01-01"),
      },
    });
    await old.portfolio.create({
      data: {
        id: "old-wallet",
        userId: "old-user",
        cashCents: 10000n,
        contributedCents: 10000n,
        movements: {
          create: {
            type: "DEPOSIT",
            amountCents: 10000n,
            idempotencyKey: "old-movement-key",
          },
        },
      },
    });
    await old.quantAsset.create({
      data: {
        id: "old-asset",
        userId: "old-user",
        symbol: "USD-BRL",
        bars: {
          create: {
            date: new Date("2026-10-14"),
            priceMicros: 5000000n,
            source: "SYNTHETIC UPGRADE FIXTURE",
          },
        },
        analyses: { create: { result: { reason: "old-analysis" } } },
      },
    });
    await old.quantStrategy.create({
      data: {
        id: "old-strategy",
        userId: "old-user",
        name: "old SMA",
        config: { fast: 5, slow: 20 },
        idempotencyKey: "old-strategy-key",
      },
    });
    await old.quantRun.create({
      data: {
        userId: "old-user",
        assetId: "old-asset",
        strategyId: "old-strategy",
        kind: "PAPER",
        status: "PAUSED",
        config: { preserve: true },
        state: initialState(10000n, "2026-10-14"),
        datasetHash: "old-hash",
        idempotencyKey: "old-run-key",
        events: { create: { key: "old-event", result: { preserve: true } } },
      },
    });
    const snapshot = async () =>
      serialize({
        user: await old.user.findMany(),
        sessions: await old.session.findMany(),
        portfolio: await old.portfolio.findMany({
          include: { movements: true },
        }),
        assets: await old.quantAsset.findMany({
          include: { bars: true, analyses: true },
        }),
        strategies: await old.quantStrategy.findMany(),
        runs: await old.quantRun.findMany({ include: { events: true } }),
      });
    const before = await snapshot();
    await cli(["migrate", "deploy"]);
    assert.deepEqual(await snapshot(), before);
    assert.equal(await old.pilotAccount.count(), 0);
    const diff = await cli([
      "migrate",
      "diff",
      "--from-schema-datasource",
      "prisma/schema.prisma",
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--exit-code",
    ]);
    assert.match(diff.stdout, /No difference detected/);
  } finally {
    await old.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  }
});
