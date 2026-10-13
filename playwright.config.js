import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5173", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "node server/tests/e2e-server.js",
      url: "http://127.0.0.1:4000/health",
      reuseExistingServer: process.env.E2E_REUSE_SERVERS === "1",
      env: {
        ...process.env,
        PORT: "4000",
        CORS_ORIGIN: "http://127.0.0.1:5173",
      },
    },
    {
      command:
        "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5173 --strictPort",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: process.env.E2E_REUSE_SERVERS === "1",
    },
  ],
});
