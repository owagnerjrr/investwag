// Test-only server: keep auth rate-limit coverage in integration.test.js.
import { PrismaClient } from "@prisma/client";
import { createApp } from "../app.js";
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw Error("Dedicated _test database required");
const db = new PrismaClient();
await db.$connect();
const server = createApp(db, { authLimit: 1000 }).listen(
  Number(process.env.PORT || 4000),
  "0.0.0.0",
);
process.once("SIGTERM", () =>
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  }),
);
