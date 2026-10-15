import { PrismaClient } from "@prisma/client";
import { tick } from "../pilot/service.js";
import { pilotFixture } from "./pilot-fixtures.js";
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw Error("Dedicated _test database required");
const db = new PrismaClient();
try {
  console.log(
    JSON.stringify(
      await tick(db, {
        now: new Date(process.env.PILOT_FIXTURE_NOW),
        provider: pilotFixture,
        catalog: [
          {
            symbol: process.env.PILOT_FIXTURE_SYMBOL,
            market: "CRYPTO",
            source: "SYNTHETIC PILOT FIXTURE",
          },
        ],
      }),
    ),
  );
} finally {
  await db.$disconnect();
}
