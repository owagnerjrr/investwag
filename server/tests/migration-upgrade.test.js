import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

test("baseline de banco legado preserva contas e movimentações", async () => {
  const url = new URL(
    process.env.DATABASE_URL || "postgresql://invalid/invalid",
  );
  if (!url.pathname.endsWith("_test"))
    throw Error("Dedicated _test database required");
  const schema = "upgrade_" + crypto.randomBytes(8).toString("hex");
  const admin = new PrismaClient();
  url.searchParams.set("schema", schema);
  const legacy = new PrismaClient({ datasourceUrl: url.href });
  const run = (args) =>
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", ...args],
      {
        cwd: new URL("../", import.meta.url),
        env: { ...process.env, DATABASE_URL: url.href },
        stdio: "pipe",
      },
    );
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const sql = await readFile(
      new URL(
        "../prisma/migrations/202610130001_initial/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const statement of sql.split(";").filter((s) => s.trim()))
      await legacy.$executeRawUnsafe(statement);
    // Bring this disposable schema to the published v1 before testing v2.
    const stability = await readFile(
      new URL(
        "../prisma/migrations/202610130002_demo_stability/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await legacy.$executeRaw`INSERT INTO "User" (id, email, "passwordHash") VALUES ('legacy-user', 'legacy@example.test', 'existing-hash')`;
    await legacy.$executeRaw`INSERT INTO "Portfolio" (id, "userId", "cashCents", "contributedCents", "updatedAt") VALUES ('legacy-wallet', 'legacy-user', 1000, 1000, CURRENT_TIMESTAMP)`;
    await legacy.$executeRaw`INSERT INTO "CashMovement" (id, "portfolioId", type, "amountCents") VALUES ('legacy-movement', 'legacy-wallet', 'DEPOSIT', 1000)`;
    for (const statement of stability.split(";").filter((s) => s.trim()))
      await legacy.$executeRawUnsafe(statement);
    await legacy.$executeRaw`INSERT INTO "Session" ("tokenHash", "userId", "expiresAt") VALUES ('existing-session-hash', 'legacy-user', CURRENT_TIMESTAMP + INTERVAL '1 hour')`;
    const sessionBefore = await legacy.session.findUniqueOrThrow({
      where: { tokenHash: "existing-session-hash" },
    });
    run(["migrate", "resolve", "--applied", "202610130001_initial"]);
    run(["migrate", "resolve", "--applied", "202610130002_demo_stability"]);
    run(["migrate", "deploy"]);
    const p = await legacy.portfolio.findUniqueOrThrow({
      where: { id: "legacy-wallet" },
      include: { movements: true, user: true },
    });
    assert.equal(p.cashCents, 1000n);
    assert.equal(p.paused, true);
    assert.equal(p.user.passwordHash, "existing-hash");
    assert.equal(p.movements[0].idempotencyKey, "legacy_legacy-movement");
    assert.deepEqual(
      await legacy.session.findUniqueOrThrow({
        where: { tokenHash: "existing-session-hash" },
      }),
      sessionBefore,
    );
    assert.match(
      String(
        run([
          "migrate",
          "diff",
          "--from-url",
          url.href,
          "--to-schema-datamodel",
          "prisma/schema.prisma",
          "--exit-code",
        ]),
      ),
      /No difference detected/,
    );
  } finally {
    await legacy.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  }
});
