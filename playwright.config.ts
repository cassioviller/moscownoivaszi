import { defineConfig, devices } from "@playwright/test";

/**
 * E2E da loja de noivas (Moscow Noivas).
 *
 * Sobe dois servidores (portas sobreponíveis com E2E_API_PORT/E2E_WEB_PORT):
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

/**
 * As portas são as de sempre, e o env existe por UM motivo (S-O73/E188): a
 * régua do banco virgem sobe servidores PRÓPRIOS contra o banco descartável.
 * Sem porta própria ela cairia no `reuseExistingServer` abaixo e mediria o
 * banco do vizinho — que é a S-M15 outra vez, a régua declarando sucesso sobre
 * um banco que nunca tocou.
 */
const API_PORT = Number(process.env.E2E_API_PORT ?? 5099);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5173);
/** Quem pede porta própria não quer reusar nada de ninguém. */
const REUSAR_SERVIDOR = process.env.E2E_API_PORT === undefined && process.env.E2E_WEB_PORT === undefined;

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
    /**
     * A loja fala português e mora em São Paulo — e o navegador da suíte não
     * falava (S-O70/E188).
     *
     * Medido em 2026-08-12 com a configuração literal de antes (só
     * `executablePath`): `navigator.languages` = `en-US`, e o filtro de
     * `/financeiro/receber` desenhava `08/01/2026 · 08/31/2026` onde a loja lê
     * `01/08/2026 · 31/08/2026` — o MESMO `value="2026-08-01"` no DOM. Quem
     * desenha o `<input type=date>` é a locale da INTERFACE do navegador, não
     * o `lang` do documento. Todo screenshot e todo trace de falha dos 171
     * specs saía nessa interface.
     *
     * As três fixações são a linha que o E182 mediu em `capturar-telas.ts`, e
     * as três são necessárias: `locale` fixa o contexto do Playwright, `--lang`
     * fixa a interface do Chromium, e `LANG`/`LANGUAGE` no ambiente do launch
     * fecham o que o `--lang` sozinho não fecha no Chromium do `/nix/store`.
     *
     * `timezoneId` entra junto porque o resto da suíte já fala São Paulo: o
     * `diaLocalSP` de `e2e/helpers.ts:300` é quem monta as datas das fixtures
     * (7 specs) e o `global-setup` grava o dia da loja. O navegador em UTC era
     * a única ponta fora — e o app nunca dependeu do relógio dele para
     * decidir nada (`datas-varredura.test.ts` cobra `timeZone` explícito em
     * todo `Intl.DateTimeFormat` da tela).
     */
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    launchOptions: {
      executablePath: CHROMIUM_NIX,
      args: ["--lang=pt-BR", "--accept-lang=pt-BR,pt"],
      env: { ...process.env, LANG: "pt_BR.UTF-8", LANGUAGE: "pt_BR:pt" },
    },
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
      // E242: SEED_IPCA_EXEMPLO — o E2E É a instalação de teste que a P4 pediu com
      // a correção da 9ª funcionando; a instalação real nasce sem índice.
      command: `PORT=${API_PORT} E2E_SUITE=1 SEED_IPCA_EXEMPLO=true APP_DATABASE_NAME= pnpm --filter @workspace/api-server run dev`,
      url: `http://localhost:${API_PORT}/api/healthz`,
      reuseExistingServer: REUSAR_SERVIDOR,
      timeout: 120_000,
    },
    {
      command: `PORT=${WEB_PORT} BASE_PATH=/ E2E_API_PROXY=http://localhost:${API_PORT} pnpm --filter @workspace/moscow-noivas run dev`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: REUSAR_SERVIDOR,
      timeout: 120_000,
    },
  ],
});
