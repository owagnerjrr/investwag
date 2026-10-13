export async function connectWithRetry(
  db,
  {
    attempts = 6,
    delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log = console.warn,
  } = {},
) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await db.$connect();
      return;
    } catch (error) {
      if (
        attempt === attempts ||
        !["P1001", "P1002", "P1017"].includes(error.errorCode)
      )
        throw error;
      log(
        `PostgreSQL indisponível; nova tentativa ${attempt + 1}/${attempts}.`,
      );
      await delay(Math.min(attempt * 2000, 10000));
    }
  }
}
