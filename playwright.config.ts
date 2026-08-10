import { defineConfig, devices } from "@playwright/test";

/**
 * E2E da loja de noivas (Moscow Noivas).
 *
 * Sobe dois servidores:
 *  - api-server em :5099 (esbuild + node, usa o DATABASE_URL do ambiente)
 *  - vite dev em :5173 com proxy /api → :5099 (E2E_API_PROXY)
 *
 * Browser: o chromium baixado pelo Playwright não roda em NixOS (libs glibc);
 * usamos o ungoogled-chromium do /nix/store via executablePath — sobreponível
 * com PLAYWRIGHT_CHROMIUM_PATH.
 */

const CHROMIUM_NIX =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  "/nix/store/5afrhwm7zqn1vb7p5z1mc2rkh2grsfgz-ungoogled-chromium-138.0.7204.100/bin/chromium";

const API_PORT = 5099;
const WEB_PORT = 5173;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  globalSetup: "./e2e/global-setup.ts",
  // Auditoria: sem retries — cada falha é um achado, não um flake a mascarar.
  retries: 0,
  workers: 1,
  // O vite dev compila cada rota na primeira visita (plugins Replit tornam
  // isso lento) — o orçamento precisa acomodar a navegação fria.
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [["list"], ["json", { outputFile: "e2e/.results/report.json" }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    launchOptions: { executablePath: CHROMIUM_NIX },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      // E2E_SUITE=1: a suíte inteira loga ~100× do mesmo IP em minutos — o
      // rate limit de login (20/5min) derrubava os ÚLTIMOS specs da ordem
      // alfabética (41–43) com 429, só na suíte completa. Mesmo skip do vitest.
      // APP_DATABASE_NAME vazio DE PROPÓSITO: o `run dev` deriva DATABASE_URL
      // dele quando presente (é como o preview aponta para o banco da LOJA), e
      // o userenv do workspace o define para todo shell — sem o vazio, a suíte
      // E2E inteira rodaria no banco da loja em vez do de DATABASE_URL.
      command: `PORT=${API_PORT} E2E_SUITE=1 APP_DATABASE_NAME= pnpm --filter @workspace/api-server run dev`,
      url: `http://localhost:${API_PORT}/api/healthz`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `PORT=${WEB_PORT} BASE_PATH=/ E2E_API_PROXY=http://localhost:${API_PORT} pnpm --filter @workspace/moscow-noivas run dev`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
