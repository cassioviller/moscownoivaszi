/**
 * A ferramenta de captura de telas da revisão de design (S-D1) — versionada,
 * porque a original viveu num scratchpad e se perdeu junto com o ambiente que
 * a explicava (S-D2).
 *
 *   BASE_URL=http://localhost:5173 CAPTURAS_DIR=/caminho/absoluto \
 *     pnpm --filter @workspace/api-server exec tsx ../../scripts/capturar-telas.ts
 *
 * Ela NÃO sobe o app: espera um app de pé em BASE_URL (os dois servidores que
 * o `playwright.config.ts` descreve, ou o dev de sempre). O que ela faz:
 *
 *   1. lê a lista de rotas do manifest de referência (por padrão, o das 81
 *      capturas de 2026-07-30) — a rota E o nome-base de cada arquivo;
 *   2. captura cada rota em três variantes: `--claro` e `--escuro` em
 *      1280×800, `--390` (claro) em 390×844 — página inteira, como as 81;
 *   3. grava um `manifest.json` no destino que DECLARA o ambiente (S-D2):
 *      navegador+versão, locale, timezone, viewport, tema, data. A rodada 7
 *      capturou em en-US sem saber, e o E92 provou que `<input type=date>`
 *      renderiza pela locale da INTERFACE do navegador — por isso a locale
 *      aqui é FIXA em pt-BR, no contexto E no `--lang` do Chromium.
 *
 * As env vars obrigatórias FALHAM ALTO se faltarem: o diretório das 81
 * nasceu literalmente `undefined/` porque o script antigo interpolava uma
 * env que não existia. Nunca de novo.
 *
 *   BASE_URL        (obrigatória) — onde o app está de pé.
 *   CAPTURAS_DIR    (obrigatória) — para onde vão os PNGs e o manifest.
 *   MANIFEST_ROTAS  (opcional) — manifest de referência com as rotas;
 *                   padrão: docs/revisao/2026-07-30-rodada-7-design/capturas/manifest.json.
 *   STORAGE_STATE   (opcional) — sessão autenticada do Playwright;
 *                   padrão: e2e/.auth/admin.json (o do E2E). 26 das 27 rotas
 *                   exigem sessão — sem o arquivo, o script para antes de abrir
 *                   o navegador.
 *   LOJA_ID         (opcional) — substitui o UUID de loja embutido nas rotas
 *                   do manifest de referência (elas carregam a loja do banco
 *                   em que foram capturadas).
 *   NOIVA_TOKEN     (opcional) — preenche o `<token>` da rota do portal da
 *                   noiva; sem ele a rota entra em `falharam`, não some.
 *   PLAYWRIGHT_CHROMIUM_PATH (opcional) — o mesmo do playwright.config.ts:
 *                   neste ambiente o Chromium empacotado não roda (NixOS),
 *                   e o executável vem do /nix/store.
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");

// ── env: as obrigatórias falham alto, juntas, com o motivo ─────────────────
const faltando: string[] = [];
if (!process.env.BASE_URL) faltando.push("BASE_URL (onde o app está de pé, ex.: http://localhost:5173)");
if (!process.env.CAPTURAS_DIR) faltando.push("CAPTURAS_DIR (destino dos PNGs e do manifest)");
if (faltando.length > 0) {
  console.error(
    "capturar-telas: env obrigatória ausente — o script antigo interpolou uma dessas sem conferir e o destino virou `undefined/` (S-D1).\n" +
      faltando.map((f) => `  · ${f}`).join("\n"),
  );
  process.exit(1);
}
const BASE_URL = process.env.BASE_URL!;
const DESTINO = path.resolve(process.env.CAPTURAS_DIR!);

const MANIFEST_ROTAS = path.resolve(
  process.env.MANIFEST_ROTAS ?? path.join(RAIZ, "docs/revisao/2026-07-30-rodada-7-design/capturas/manifest.json"),
);
const STORAGE_STATE = path.resolve(process.env.STORAGE_STATE ?? path.join(RAIZ, "e2e/.auth/admin.json"));
if (!existsSync(MANIFEST_ROTAS)) {
  console.error(`capturar-telas: manifest de rotas não existe: ${MANIFEST_ROTAS}`);
  process.exit(1);
}
if (!existsSync(STORAGE_STATE)) {
  console.error(
    `capturar-telas: sessão autenticada não existe: ${STORAGE_STATE}\n` +
      "  26 das 27 rotas exigem login. Rode o projeto `setup` do E2E (ou um run qualquer da suíte) para gravá-la, ou aponte STORAGE_STATE para outra.",
  );
  process.exit(1);
}

// ── as rotas vêm do manifest de referência, com o nome-base de cada uma ────
interface Manifest {
  capturadas: Record<string, string[]>;
}
const referencia = JSON.parse(readFileSync(MANIFEST_ROTAS, "utf8")) as Manifest;

interface Alvo {
  rota: string;
  nomeBase: string;
}
const alvos: Alvo[] = [];
const falharam: string[] = [];
for (const [rotaCrua, arquivos] of Object.entries(referencia.capturadas)) {
  // "dashboard--claro.png" → "dashboard"; o nome-base é escolha humana do
  // manifest (ex.: /noivas/e2e-lead-1 → "noivas-ficha"), por isso se LÊ, não
  // se deriva da rota.
  const nomeBase = (arquivos[0] ?? "").replace(/--[^-.]+\.png$/, "");
  if (!nomeBase) {
    falharam.push(`${rotaCrua}: sem arquivo no manifest de referência para extrair o nome-base`);
    continue;
  }
  let rota = rotaCrua;
  if (process.env.LOJA_ID) {
    rota = rota.replace(/\/loja\/[0-9a-f-]{36}(\/|$)/, `/loja/${process.env.LOJA_ID}$1`);
  }
  if (rota.includes("<token>")) {
    if (!process.env.NOIVA_TOKEN) {
      falharam.push(`${rotaCrua}: NOIVA_TOKEN não definido — o portal da noiva não foi capturado`);
      continue;
    }
    rota = rota.replace("<token>", process.env.NOIVA_TOKEN);
  }
  alvos.push({ rota, nomeBase });
}

// ── as três variantes das 81 capturas: claro/escuro 1280×800, 390×844 ──────
const VARIANTES = [
  { sufixo: "claro", viewport: { width: 1280, height: 800 }, colorScheme: "light" },
  { sufixo: "escuro", viewport: { width: 1280, height: 800 }, colorScheme: "dark" },
  { sufixo: "390", viewport: { width: 390, height: 844 }, colorScheme: "light" },
] as const;

// O tema vem de `prefers-color-scheme`: o App monta o ThemeProvider com
// `defaultTheme="system" enableSystem` (moscow-noivas/src/App.tsx:358), e o
// contexto novo não tem localStorage — o `colorScheme` do Playwright decide.

async function main(): Promise<void> {
  mkdirSync(DESTINO, { recursive: true });

  // O mesmo executável do playwright.config.ts: o Chromium que o Playwright
  // baixa não roda em NixOS. Fora daqui, sem a env e sem o /nix/store, cai no
  // empacotado.
  const nixChromium =
    process.env.PLAYWRIGHT_CHROMIUM_PATH ??
    "/nix/store/5afrhwm7zqn1vb7p5z1mc2rkh2grsfgz-ungoogled-chromium-138.0.7204.100/bin/chromium";
  const executablePath = existsSync(nixChromium) ? nixChromium : undefined;

  const browser = await chromium.launch({
    executablePath,
    // `--lang` fixa a locale da INTERFACE do Chromium — é ela que formata o
    // `<input type=date>` (E92), não o `lang` do documento nem o `locale` do
    // contexto sozinho.
    args: ["--lang=pt-BR"],
  });

  const ambiente = {
    navegador: `chromium ${browser.version()}`,
    executavel: executablePath ?? "chromium empacotado pelo Playwright",
    locale: "pt-BR (fixada no contexto e no --lang do Chromium)",
    timezone: "America/Sao_Paulo",
    viewports: { claro: "1280×800", escuro: "1280×800", "390": "390×844" },
    temas: { claro: "prefers-color-scheme: light", escuro: "prefers-color-scheme: dark", "390": "prefers-color-scheme: light" },
    capturaDePaginaInteira: true,
    baseUrl: BASE_URL,
    data: new Date().toISOString(),
  };
  console.log(`capturar-telas: ${alvos.length} rotas × ${VARIANTES.length} variantes → ${DESTINO}`);
  console.log(`  navegador: ${ambiente.navegador} · locale pt-BR · ${ambiente.timezone}`);

  const capturadas: Record<string, string[]> = {};
  try {
    for (const variante of VARIANTES) {
      const contexto = await browser.newContext({
        baseURL: BASE_URL,
        viewport: variante.viewport,
        colorScheme: variante.colorScheme,
        locale: "pt-BR",
        timezoneId: "America/Sao_Paulo",
        storageState: STORAGE_STATE,
      });
      const page = await contexto.newPage();
      for (const { rota, nomeBase } of alvos) {
        const arquivo = `${nomeBase}--${variante.sufixo}.png`;
        try {
          // O vite dev compila a rota na primeira visita — o orçamento é o
          // mesmo 60s do playwright.config.ts.
          await page.goto(rota, { waitUntil: "networkidle", timeout: 60_000 });
          await page.screenshot({ path: path.join(DESTINO, arquivo), fullPage: true });
          (capturadas[rota] ??= []).push(arquivo);
          console.log(`  ✓ ${arquivo}`);
        } catch (e) {
          falharam.push(`${rota} [${variante.sufixo}]: ${(e as Error).message.split("\n")[0]}`);
          console.log(`  ✗ ${arquivo}`);
        }
      }
      await contexto.close();
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    ambiente,
    dir: DESTINO,
    capturadas,
    falharam,
    notas: [],
  };
  writeFileSync(path.join(DESTINO, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const total = Object.values(capturadas).reduce((n, a) => n + a.length, 0);
  console.log(`\n${total} capturas em ${DESTINO} — manifest com bloco de ambiente gravado.`);
  if (falharam.length > 0) {
    console.error(`${falharam.length} falharam (estão no manifest):\n${falharam.map((f) => `  ✗ ${f}`).join("\n")}`);
  }
  process.exit(falharam.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("capturar-telas estourou fora das capturas:", e);
  process.exit(1);
});
