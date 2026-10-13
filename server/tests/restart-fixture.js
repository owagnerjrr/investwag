import { PrismaClient } from "@prisma/client";
import { createApp } from "../app.js";
const db = new PrismaClient();
await db.$connect();
const server = createApp(db).listen(0, "127.0.0.1", () =>
  console.log(`http://127.0.0.1:${server.address().port}`),
);
process.once("SIGTERM", () =>
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  }),
);
