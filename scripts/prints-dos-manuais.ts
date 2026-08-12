/**
 * Os PRINTS dos manuais, e o PDF que sai deles.
 *
 *   # 1. a loja de demonstração (idempotente)
 *   pnpm --filter @workspace/api-server exec tsx ../../scripts/loja-de-demonstracao.ts
 *   # 2. com o app de pé em BASE_URL:
 *   BASE_URL=http://localhost:5173 \
 *     pnpm --filter @workspace/api-server exec tsx ../../scripts/prints-dos-manuais.ts vendedora
 *
 * Ela NÃO sobe o app — como a `capturar-telas.ts`, espera os dois servidores
 * que o `playwright.config.ts` descreve.
 *
 * ## Por que não é a `capturar-telas.ts`
 *
 * A irmã existe para a REVISÃO DE DESIGN: três variantes por rota (claro,
 * escuro, 390px), manifest de ambiente, sessão única de admin. Esta existe para
 * o MANUAL, e três coisas que o manual precisa ela não faz:
 *
 * 1. **A sessão é a do PERFIL do manual.** O admin do banco é superadmin, e o
 *    menu dele mostra Financeiro e Permissões — pôr isso no manual da vendedora
 *    seria a mentira que a `varredura-manuais.test.ts` existe para impedir. Aqui
 *    cada manual declara o e-mail de quem o protagoniza, e a sessão nasce de um
 *    login de verdade.
 * 2. **O tour some.** `tour-acesso.tsx` abre um diálogo modal na PRIMEIRA visita
 *    de cada usuário × loja (flag `moscow.tour.<usuarioId>.<lojaId>` em
 *    localStorage) — e ele cobre a tela inteira. A primeira captura da loja de
 *    demonstração saiu com o diálogo por cima da lista de noivas.
 * 3. **Uma variante só.** O manual imprime em papel claro; escuro e 390px são
 *    perguntas de design, não de uso.
 *
 * ## O que ela garante sobre a imagem
 *
 * - **Locale e fuso fixos** (pt-BR, America/Sao_Paulo), pela mesma razão da
 *   irmã: o E92 provou que `<input type=date>` renderiza pela locale da
 *   INTERFACE, e as 81 capturas de 2026-07-30 saíram em en-US sem ninguém saber.
 * - **`deviceScaleFactor: 2`** — print de manual é lido ampliado, e 1× fica
 *   borrado no PDF.
 * - **Recorte declarado por captura**: `pagina` (a tela inteira) ou `alvo` (um
 *   seletor). Um print de página inteira de uma tela que rola 3.000px não ensina
 *   nada — o que ensina é o pedaço que a seção do manual descreve.
 */
import { chromium, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const DESTINO_IMAGENS = path.join(RAIZ, "docs/manuais/capturas");
const DESTINO_PDF = path.join(RAIZ, "docs/manuais/pdf");
const LOJA = "demo-manuais-loja";

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
  console.error(
    "prints-dos-manuais: BASE_URL é obrigatória (onde o app está de pé, ex.: http://localhost:5173).\n" +
      "  Sem ela o script antigo do repositório gravou em `undefined/` — a S-D1 não se repete.",
  );
  process.exit(1);
}

type Captura = {
  /** Nome-base do arquivo, e a chave que o HTML do manual cita no `data-print`. */
  nome: string;
  rota: string;
  /** Seletor a recortar; ausente = a página visível inteira. */
  alvo?: string;
  /** Legenda impressa sob a imagem. */
  legenda: string;
  /** Espera extra depois do networkidle, para animação de entrada. */
  esperaMs?: number;
  /** Rota pública — sem sessão. */
  publica?: boolean;
};

type Manual = {
  arquivo: string;
  /** Quem protagoniza — a sessão dos prints. `null` = o admin do banco. */
  email: string | null;
  senha: string;
  capturas: Captura[];
};

const MANUAIS: Record<string, Manual> = {
  vendedora: {
    arquivo: "vendedora.html",
    email: "camila@moscownoivas.com",
    senha: "demo-dos-manuais",
    capturas: [
      {
        nome: "menu",
        rota: `/loja/${LOJA}/dashboard`,
        // O recorte `aside` foi tentado e descartado: a barra é estreita e
        // altíssima, e esticada à largura da folha ocupava DUAS páginas do PDF.
        // A tela inteira mostra o menu no contexto em que ela o vê.
        legenda: "A tela de entrada, com o menu à esquerda — quatorze linhas, e as cinco do dinheiro não aparecem.",
      },
      {
        nome: "noivas",
        rota: `/loja/${LOJA}/noivas`,
        legenda: "A lista de noivas: cada card traz a etapa, a data do casamento e a contagem regressiva.",
      },
      {
        nome: "nova-noiva",
        rota: `/loja/${LOJA}/noivas/nova`,
        legenda: "Adicionar noiva — só “Nome da noiva” e “Origem” são obrigatórios.",
      },
      {
        nome: "ficha",
        rota: `/loja/${LOJA}/noivas/demo-lead-ana`,
        legenda: "A ficha da Ana Paula, com a faixa “próximo passo” no topo dizendo o que fazer agora.",
      },
      {
        nome: "funil",
        rota: `/loja/${LOJA}/noivas?vista=funil`,
        legenda: "O funil: onze colunas, do “Novo” ao “Devolvido”. O card se arrasta entre elas.",
      },
      {
        nome: "agendar",
        rota: `/loja/${LOJA}/atendimentos/novo`,
        legenda: "Agendar: escolhida a cabine, a vendedora e a data, o sistema acende só os horários que existem.",
      },
      {
        nome: "orcamento",
        rota: `/loja/${LOJA}/orcamentos/demo-orcamento-ana`,
        legenda: "A tela do orçamento — os itens, o desconto aplicado e o total que a noiva vai ler.",
      },
      {
        nome: "proposta-da-noiva",
        rota: "/orcamento/demo-proposta-ana-paula",
        publica: true,
        legenda: "O que a noiva abre pelo link do WhatsApp — a mesma conta, com o botão de aceitar.",
      },
      {
        nome: "contrato",
        rota: `/loja/${LOJA}/contratos/demo-contrato-beatriz`,
        legenda: "A tela do contrato: valor total, falta receber, e o carnê parcela por parcela.",
      },
      {
        nome: "mensagens",
        rota: `/loja/${LOJA}/mensagens`,
        legenda: "Mensagens de hoje — com quem falar, e por quê.",
      },
    ],
  },
};

const qual = process.argv[2] ?? "vendedora";
const manual = MANUAIS[qual];
if (!manual) {
  console.error(
    `prints-dos-manuais: manual desconhecido "${qual}". Conhecidos: ${Object.keys(MANUAIS).join(", ")}`,
  );
  process.exit(1);
}

/**
 * O mesmo Chromium do `playwright.config.ts` e da `capturar-telas.ts`: o que o
 * Playwright baixa não roda em NixOS (`libglib-2.0.so.0`), e o do /nix/store é
 * quem imprime. Sobreponível por `PLAYWRIGHT_CHROMIUM_PATH`.
 */
const EXECUTAVEL =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  "/nix/store/5afrhwm7zqn1vb7p5z1mc2rkh2grsfgz-ungoogled-chromium-138.0.7204.100/bin/chromium";
mkdirSync(DESTINO_IMAGENS, { recursive: true });
mkdirSync(DESTINO_PDF, { recursive: true });

/** Login de verdade pela API — o cookie de sessão sai daqui. */
async function sessaoDe(email: string, senha: string): Promise<{ cookies: unknown[]; usuarioId: string }> {
  const navegador = await chromium.launch({ executablePath: EXECUTAVEL });
  const ctx = await navegador.newContext({ baseURL: BASE_URL });
  const login = await ctx.request.post("/api/auth/login", { data: { email, senha } });
  if (!login.ok()) {
    await navegador.close();
    throw new Error(`prints-dos-manuais: login de ${email} falhou (${login.status()}) — a loja de demonstração foi semeada?`);
  }
  const me = await ctx.request.get("/api/auth/me");
  const dados = (await me.json()) as { usuario?: { id?: string }; id?: string };
  const usuarioId = dados.usuario?.id ?? dados.id ?? "";
  const { cookies } = await ctx.storageState();
  await navegador.close();
  return { cookies, usuarioId };
}

async function capturar(): Promise<void> {
  const precisaSessao = manual.capturas.some((c) => !c.publica);
  const sessao = precisaSessao && manual.email
    ? await sessaoDe(manual.email, manual.senha)
    : { cookies: [], usuarioId: "" };

  /**
   * A locale da INTERFACE do Chromium, e por que ela precisa das três coisas.
   *
   * `<input type=date>` renderiza o placeholder pela locale da interface (E92),
   * não pelo `lang` do documento nem pelo `locale` do contexto — e a primeira
   * rodada destes prints saiu com **`mm/dd/yyyy`** no campo "Data do casamento"
   * do formulário de noiva nova, que é exatamente o defeito que fez as 81
   * capturas de 2026-07-30 saírem em en-US sem ninguém perceber (S-D2). O
   * `--lang` sozinho não bastou no Chromium do /nix/store: ele lê o ambiente.
   */
  const navegador = await chromium.launch({
    executablePath: EXECUTAVEL,
    args: ["--lang=pt-BR", "--accept-lang=pt-BR,pt"],
    env: { ...process.env, LANG: "pt_BR.UTF-8", LANGUAGE: "pt_BR:pt" },
  });
  const ctx = await navegador.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 2,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    storageState: {
      cookies: sessao.cookies as never,
      // O tour modal, apagado antes de existir: ele abre na PRIMEIRA visita de
      // cada usuário × loja e cobre a tela inteira.
      origins: sessao.usuarioId
        ? [
            {
              origin: BASE_URL!,
              localStorage: [
                { name: `moscow.tour.${sessao.usuarioId}.${LOJA}`, value: new Date().toISOString() },
              ],
            },
          ]
        : [],
    },
  });
  const pagina = await ctx.newPage();

  const feitas: string[] = [];
  for (const c of manual.capturas) {
    const destino = path.join(DESTINO_IMAGENS, `${qual}-${c.nome}.png`);
    try {
      await pagina.goto(c.rota, { waitUntil: "networkidle", timeout: 45_000 });
      await pagina.waitForTimeout(c.esperaMs ?? 1_200);
      const alvo = c.alvo ? pagina.locator(c.alvo).first() : null;
      if (alvo) await alvo.screenshot({ path: destino });
      else await pagina.screenshot({ path: destino });
      feitas.push(`${qual}-${c.nome}.png`);
      console.log(`  ✓ ${qual}-${c.nome}.png`);
    } catch (erro) {
      console.error(`  ✗ ${qual}-${c.nome}.png — ${(erro as Error).message.split("\n")[0]}`);
    }
  }

  await gerarPdf(pagina);
  await navegador.close();

  writeFileSync(
    path.join(DESTINO_IMAGENS, `${qual}.json`),
    JSON.stringify(
      {
        manual: qual,
        gerado: new Date().toISOString(),
        loja: LOJA,
        sessao: manual.email ?? "admin do banco",
        ambiente: { locale: "pt-BR", timezone: "America/Sao_Paulo", viewport: "1280×860 @2×", tema: "claro" },
        capturas: feitas,
      },
      null,
      2,
    ) + "\n",
  );
}

/**
 * O PDF sai do MESMO HTML da página publicada — o manual não tem duas versões.
 * O que muda é o que se injeta antes de imprimir: as imagens nos lugares que o
 * HTML declara (`<figure data-print="…">`) e a folha de estilo de impressão.
 */
async function gerarPdf(pagina: Page): Promise<void> {
  const fonte = path.join(RAIZ, "docs/manuais", manual.arquivo);
  const html = readFileSync(fonte, "utf8");

  const comImagens = html.replace(
    /<figure class="print" data-print="([^"]+)"><\/figure>/g,
    (inteiro, nome: string) => {
      const arquivo = path.join(DESTINO_IMAGENS, `${qual}-${nome}.png`);
      if (!existsSync(arquivo)) {
        console.error(`  ! print declarado e não capturado: ${qual}-${nome}.png — a figura sai vazia`);
        return "";
      }
      const captura = manual.capturas.find((c) => c.nome === nome);
      const b64 = readFileSync(arquivo).toString("base64");
      return (
        `<figure class="print">` +
        `<img src="data:image/png;base64,${b64}" alt="${captura?.legenda ?? nome}">` +
        (captura?.legenda ? `<figcaption>${captura.legenda}</figcaption>` : "") +
        `</figure>`
      );
    },
  );

  const paraImprimir = comImagens.replace("</style>", `${CSS_DE_IMPRESSAO}\n</style>`);
  await pagina.setContent(paraImprimir, { waitUntil: "load" });
  await pagina.emulateMedia({ media: "print" });
  const destino = path.join(DESTINO_PDF, `${qual}.pdf`);
  await pagina.pdf({
    path: destino,
    format: "A4",
    printBackground: true,
    margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    displayHeaderFooter: true,
    headerTemplate: `<span></span>`,
    footerTemplate:
      `<div style="width:100%;font-size:8pt;color:#5c6170;padding:0 16mm;` +
      `font-family:Georgia,serif;display:flex;justify-content:space-between">` +
      `<span>Moscow Noivas · Manual</span>` +
      `<span class="pageNumber"></span></div>`,
  });
  console.log(`\n  PDF → ${path.relative(RAIZ, destino)}`);
}

/**
 * A folha de impressão. Três decisões, e as três vêm de o papel não ser tela:
 *
 * 1. **A barra lateral do índice some.** Um sumário fixo que rola é gesto de
 *    tela; no papel ele viraria uma coluna repetida em todas as páginas.
 * 2. **A seção não quebra no meio do título.** `break-after: avoid` no h2/h3 e
 *    `break-inside: avoid` na figura e nos blocos de fala.
 * 3. **Tema claro fixo.** O PDF não tem "preferência do sistema", e um manual
 *    impresso em fundo escuro gasta a tinta da loja.
 */
const CSS_DE_IMPRESSAO = `
  /* ── Impressão (scripts/prints-dos-manuais.ts) ─────────────────────────── */
  figure.print {
    margin: 22px 0; padding: 0; break-inside: avoid;
  }
  /* O teto de altura é o que impede a imagem alta de virar duas páginas: sem
     ele, a largura de 100% multiplica a altura e a figura estoura a folha. */
  figure.print img {
    display: block; margin: 0 auto;
    max-width: 100%; width: auto; height: auto; max-height: 150mm;
    border: 1px solid var(--linha); border-radius: 8px;
    box-shadow: var(--sombra);
  }
  figure.print figcaption {
    margin-top: 8px; font-size: 13.5px; line-height: 1.45;
    color: var(--tinta-fraca); text-wrap: pretty; text-align: center;
  }
  @media print {
    :root { --papel: #ffffff; }
    body { font-size: 11.5pt; background: #fff; }
    .pagina { display: block; max-width: none; padding: 0; }
    .indice { display: none; }
    .capa { padding-top: 0; break-after: page; }
    section { padding: 22px 0; max-width: none; break-inside: auto; }
    h1, h2, h3 { break-after: avoid; }
    h2 { margin-top: 6px; }
    .fala, .trilha, .caixa, .rolagem, figure.print { break-inside: avoid; }
    footer { break-before: page; }
    a { color: inherit; text-decoration: none; }
  }
`;

console.log(`prints-dos-manuais: ${qual} · ${manual.capturas.length} capturas · sessão ${manual.email ?? "admin"}`);
await capturar();
