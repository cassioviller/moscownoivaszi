import { defineConfig } from "@playwright/test";

// Suíte E2E (Playwright). O Next 16 dev tem trava de instância única (recusa um 2º
// `next dev` mesmo em outra porta), então: `reuseExistingServer` reaproveita o server
// que já estiver no ar nesta porta; num CI limpo, o Playwright sobe o seu. Default 5000
// (porta que o Replit já mantém viva localmente); sobrescreva com E2E_PORT no CI.
// O Chromium vem do nix via REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE (não baixamos browser).
// globalSetup cria a loja efêmera `loja-e2e` + admin + cabine/horário; globalTeardown
// apaga tudo (cascade). Specs de mutação escrevem só dentro da `loja-e2e`.

const PORT = Number(process.env.E2E_PORT ?? 5000);
const BASE_URL = `http://localhost:${PORT}`;
const chromiumPath = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "retain-on-failure",
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
  },
  webServer: {
    command: `node node_modules/next/dist/bin/next dev -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
