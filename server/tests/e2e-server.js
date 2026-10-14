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
const marketFetcher = async (url) => {
  const from = url.searchParams.get("from"),
    to = url.searchParams.get("to");
  const rows = [];
  for (
    let timestamp = +new Date(from), i = 0;
    timestamp <= +new Date(to);
    timestamp += 86400000, i++
  ) {
    rows.push({
      base: url.searchParams.get("base"),
      quote: "BRL",
      date: new Date(timestamp).toISOString().slice(0, 10),
      rate: 5 + Math.sin(i / 3),
      providers: ["SYNTHETIC E2E FIXTURE — NOT MARKET DATA"],
    });
  }
  return new Response(JSON.stringify(rows));
};
const server = createApp(db, {
  authLimit: 1000,
  quantEnabled: true,
  marketFetcher,
}).listen(Number(process.env.PORT || 4000), "0.0.0.0");
process.once("SIGTERM", () =>
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  }),
);
