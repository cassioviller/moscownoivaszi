import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, API_HEALTH_URL, API_PORT, VITE_PORT, TEST_DATABASE_URL } from "./tests/setup/constants";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
  ],
  webServer: [
    {
      // api-server de teste apontando para heliumdb_e2e
      command: "pnpm --dir ../api-server run build && node ../api-server/dist/index.mjs",
      url: API_HEALTH_URL,
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      env: { PORT: String(API_PORT), DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: "test" },
    },
    {
      // Vite servindo a SPA, proxy /api -> api-server de teste
      command: "vite --config vite.config.ts --port " + VITE_PORT,
      url: BASE_URL,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      env: { PORT: String(VITE_PORT), BASE_PATH: "/", API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
