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
 *      aqui é FIXA em pt-BR, no contexto, no `--lang` do Chromium E no `LANG`
 *      do processo;
 *   4. **CONFERE a locale antes da primeira captura** (S-O42/E182), lendo o
 *      placeholder do `<input type=date>` do formulário de noiva nova. O
 *      manifest passa a gravar o que foi MEDIDO, não o que se afirma: `--lang`
 *      sozinho rendia `mm/dd/yyyy` sob um carimbo que dizia pt-BR, e um carimbo
 *      falso é pior que carimbo nenhum. Sem `dd/mm/aaaa`, o script para antes de
 *      gastar 90 s produzindo 81 PNGs em en-US.
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
import { chromium, type BrowserContext, type Page } from "@playwright/test";
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

// ── a conferência da locale (S-O42/E182): o manifest MEDE, não afirma ──────

/** O que o campo de data tem de desenhar quando a interface está em pt-BR. */
const PLACEHOLDER_ESPERADO = "dd/mm/aaaa";

/**
 * A rota do formulário de noiva nova, derivada da loja das rotas do manifest —
 * é o formulário com `<input type=date>` mais estável do app
 * (`noiva-form.tsx:236`, `data-testid="input-casamento-data"`), e ele já
 * responde à mesma sessão que captura as outras 27.
 */
const ROTA_DO_FORMULARIO = ((): string | null => {
  const comLoja = alvos.find((a) => /^\/loja\/[^/]+\//.test(a.rota));
  const loja = comLoja?.rota.split("/")[2];
  return loja ? `/loja/${loja}/noivas/nova` : null;
})();

/** O nó cru do CDP, no mínimo que a leitura do shadow DOM precisa. */
interface NoDoDom {
  nodeType: number;
  nodeValue?: string;
  children?: NoDoDom[];
  shadowRoots?: NoDoDom[];
}

/**
 * O placeholder do `<input type=date>`, lido do shadow DOM que o navegador
 * desenha sozinho.
 *
 * Ele não está no DOM da página: mora na UA shadow root do campo, e nem
 * `getAttribute("placeholder")` nem `innerText` chegam lá. O caminho que
 * funciona é o CDP com `pierce: true`, juntando os nós de texto na ordem —
 * `dd`, `/`, `mm`, `/`, `aaaa`.
 *
 * **E é a única leitura que enxerga o defeito.** Medido em 2026-08-12, no mesmo
 * Chromium, com `--lang=pt-BR` e sem `LANG`/`LANGUAGE`: `navigator.languages`
 * respondia `pt-BR` e `Intl.DateTimeFormat().resolvedOptions().locale`
 * respondia `pt-BR` **enquanto o campo desenhava `mm/dd/yyyy`**. Quem confere a
 * locale pelo `navigator` mede o contexto do Playwright, que é justamente a
 * metade que nunca esteve errada.
 */
async function placeholderDeData(contexto: BrowserContext, page: Page): Promise<string | null> {
  const cdp = await contexto.newCDPSession(page);
  try {
    const documento = await cdp.send("DOM.getDocument", { depth: 0 });
    const alvo = await cdp.send("DOM.querySelector", {
      nodeId: documento.root.nodeId,
      selector: 'input[type="date"]',
    });
    if (!alvo.nodeId) return null;
    const { node } = await cdp.send("DOM.describeNode", { nodeId: alvo.nodeId, depth: -1, pierce: true });
    const partes: string[] = [];
    const anda = (n: NoDoDom): void => {
      if (n.nodeType === 3 && n.nodeValue?.trim()) partes.push(n.nodeValue.trim());
      for (const filho of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) anda(filho);
    };
    anda(node);
    const lido = partes.join("");
    return lido.length > 0 ? lido : null;
  } finally {
    await cdp.detach();
  }
}

interface LocaleMedida {
  declarada: string;
  fixadaEm: string[];
  onde: string;
  placeholder: string | null;
  esperado: string;
  confere: boolean;
}

/**
 * A conferência, ANTES da primeira captura.
 *
 * Ela roda no mesmo navegador que vai capturar — é o navegador, e não a página,
 * que decide o formato — e para o script se o campo não sair em pt-BR: 81 PNGs
 * em en-US sob um manifest que jura pt-BR custam mais que a falha, porque quem
 * os reusar não tem como saber.
 */
async function conferirLocale(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<LocaleMedida> {
  const contexto = await browser.newContext({
    baseURL: BASE_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    storageState: STORAGE_STATE,
  });
  const page = await contexto.newPage();
  try {
    let onde = `${ROTA_DO_FORMULARIO} — "Data do casamento"`;
    let placeholder: string | null = null;
    if (ROTA_DO_FORMULARIO) {
      try {
        await page.goto(ROTA_DO_FORMULARIO, { waitUntil: "networkidle", timeout: 60_000 });
        placeholder = await placeholderDeData(contexto, page);
      } catch {
        placeholder = null;
      }
    }
    if (!placeholder) {
      // O formulário real não respondeu (rota mudou, sessão sem permissão,
      // campo que deixou de ser `type=date`). Mede-se um campo sintético NO
      // MESMO navegador: perde-se a prova sobre o formulário e mantém-se a
      // prova sobre o NAVEGADOR, que é onde este defeito mora. O manifest diz
      // qual das duas foi — conferência que degrada em silêncio não confere.
      onde = "<input type=date> sintético — o formulário real não respondeu";
      await page.setContent('<input type="date">');
      placeholder = await placeholderDeData(contexto, page);
    }
    return {
      declarada: "pt-BR",
      fixadaEm: ["contexto do Playwright", "--lang/--accept-lang do Chromium", "LANG/LANGUAGE no env do launch"],
      onde,
      placeholder,
      esperado: PLACEHOLDER_ESPERADO,
      confere: placeholder === PLACEHOLDER_ESPERADO,
    };
  } finally {
    await contexto.close();
  }
}

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
    //
    // S-O43/S-O42: e `--lang` SOZINHO não bastava. Medido em 2026-08-12 com o
    // Chromium do /nix/store, exatamente esta configuração: o campo "Data do
    // casamento" saiu **`mm/dd/yyyy`** — enquanto o bloco de ambiente abaixo
    // afirmava "pt-BR (fixada no contexto e no --lang)". Um manifest que
    // carimba o que não cumpre é pior que nenhum: é a S-D2 de novo, e desta vez
    // com o carimbo mentindo. Com `LANG`/`LANGUAGE` no ambiente do processo,
    // vira `dd/mm/aaaa`.
    //
    // E o preço não é o placeholder, é a data escrita (E182): o mesmo
    // `value="2026-08-01"` do filtro de "Contas a receber" desenha **08/01/2026**
    // sem as duas envs e **01/08/2026** com elas. `08/31/2026` se denuncia — não
    // há mês 31; `08/01/2026` não se denuncia, lê-se como 8 de janeiro.
    args: ["--lang=pt-BR", "--accept-lang=pt-BR,pt"],
    env: { ...process.env, LANG: "pt_BR.UTF-8", LANGUAGE: "pt_BR:pt" },
  });

  // A conferência vem ANTES da primeira captura, e ela é uma PORTA: sem
  // `dd/mm/aaaa` o script não gasta 90 s produzindo capturas que ninguém pode
  // reusar (S-O42/E182).
  const locale = await conferirLocale(browser);
  if (!locale.confere) {
    console.error(
      `capturar-telas: a interface do navegador NÃO está em pt-BR — o campo de data desenhou ` +
        `"${locale.placeholder ?? "(nada)"}" onde tem de estar "${PLACEHOLDER_ESPERADO}".\n` +
        `  medido em: ${locale.onde}\n` +
        `  A rodada 7 capturou 81 telas em en-US sem saber (S-D2), e o --lang sozinho não basta no Chromium\n` +
        `  do /nix/store: o launch precisa de LANG/LANGUAGE no env. Capturar assim grava um manifest que\n` +
        `  jura pt-BR e entrega mm/dd/yyyy — pior que não capturar.`,
    );
    await browser.close();
    process.exit(1);
  }

  const ambiente = {
    navegador: `chromium ${browser.version()}`,
    executavel: executablePath ?? "chromium empacotado pelo Playwright",
    // MEDIDA, não afirmada (S-O42/E182): o carimbo anterior dizia "pt-BR
    // (fixada no contexto e no --lang)" e o campo de data saía `mm/dd/yyyy`.
    locale,
    timezone: "America/Sao_Paulo",
    viewports: { claro: "1280×800", escuro: "1280×800", "390": "390×844" },
    temas: { claro: "prefers-color-scheme: light", escuro: "prefers-color-scheme: dark", "390": "prefers-color-scheme: light" },
    capturaDePaginaInteira: true,
    baseUrl: BASE_URL,
    data: new Date().toISOString(),
  };
  console.log(`capturar-telas: ${alvos.length} rotas × ${VARIANTES.length} variantes → ${DESTINO}`);
  console.log(`  navegador: ${ambiente.navegador} · ${ambiente.timezone}`);
  console.log(`  locale MEDIDA: campo de data desenhou "${locale.placeholder}" em ${locale.onde}`);

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
