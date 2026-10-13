import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { connectWithRetry } from "./db-connection.js";
const db = new PrismaClient();
await connectWithRetry(db);
const server = createApp(db).listen(
  Number(process.env.PORT || 4000),
  "0.0.0.0",
  () => console.log("WJ Quant simulation API listening"),
);
function shutdown() {
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
