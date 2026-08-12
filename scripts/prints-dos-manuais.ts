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
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
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

/** Um passo a executar na tela ANTES do print — é o que abre diálogo e menu. */
type Gesto =
  | { clicar: string }
  | { preencher: string; com: string }
  /** Digita tecla a tecla — é o que faz a MÁSCARA do campo rodar. */
  | { digitar: string; com: string }
  | { escolher: string; opcao: string }
  | { rolarAte: string }
  | { esperar: number };

/**
 * O REALCE — a caixa numerada que aponta o campo.
 *
 * Ele é desenhado NA PÁGINA, antes do print, e não por cima do PNG depois: o
 * traço sai nítido na resolução da captura, acompanha o elemento onde quer que
 * ele esteja, e não precisa de coordenada escrita à mão que envelhece na
 * primeira mudança de layout.
 */
type Realce = {
  /** Seletor do que a caixa cerca. */
  alvo: string;
  /** O que a legenda numerada diz sobre ele. */
  nota: string;
  /** Canto do número — o padrão evita cobrir o rótulo do campo. */
  numeroEm?: "topo-esquerda" | "topo-direita" | "esquerda";
};

type Captura = {
  /** Nome-base do arquivo, e a chave que o HTML do manual cita no `data-print`. */
  nome: string;
  rota: string;
  /** Seletor a recortar; ausente = a página visível inteira. */
  alvo?: string;
  /** Folga em volta do recorte, para o corte não encostar no conteúdo. */
  folga?: number;
  /** Legenda impressa sob a imagem. */
  legenda: string;
  /** Gestos antes do print: abrir o diálogo, preencher o campo, rolar até. */
  preparar?: Gesto[];
  /** As caixas numeradas, na ordem em que a legenda as conta. */
  realces?: Realce[];
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
      // ── O que ela vê ────────────────────────────────────────────────────
      {
        nome: "menu",
        rota: `/loja/${LOJA}/dashboard`,
        // O recorte `aside` foi tentado e descartado: a barra é estreita e
        // altíssima, e esticada à largura da folha ocupava DUAS páginas do PDF.
        legenda: "A tela de entrada. O menu à esquerda é o mesmo em todas as telas.",
        realces: [
          { alvo: "aside >> text=Noivas", nota: "As noivas — é por aqui que o seu dia começa.", numeroEm: "esquerda" },
          { alvo: "aside >> text=Orçamentos", nota: "Orçamentos e Contratos, a parte comercial do seu perfil.", numeroEm: "esquerda" },
          { alvo: "aside >> text=Minha comissão", nota: "O seu próprio extrato — só o seu, não o da loja.", numeroEm: "esquerda" },
        ],
      },

      // ── 1. A noiva chega ────────────────────────────────────────────────
      {
        nome: "noivas",
        rota: `/loja/${LOJA}/noivas`,
        alvo: "main",
        legenda: "A lista de noivas — cada card responde em que ponto ela está.",
        realces: [
          { alvo: "[data-testid='button-adicionar-noiva']", nota: "“Adicionar noiva”, para quem acabou de chegar.", numeroEm: "topo-direita" },
          { alvo: "[data-testid='input-busca-noiva']", nota: "A busca pelo nome, quando a lista fica longa." },
          { alvo: "[data-testid='toggle-vista-funil']", nota: "Alterna entre a lista e o funil.", numeroEm: "topo-direita" },
        ],
      },
      {
        nome: "nova-noiva-vazia",
        rota: `/loja/${LOJA}/noivas/nova`,
        alvo: "form",
        folga: 56,
        legenda: "Adicionar noiva: dos oito campos, só os dois primeiros são obrigatórios.",
        realces: [
          { alvo: "[data-testid='input-noiva-nome']", nota: "“Nome da noiva” — obrigatório." },
          { alvo: "[data-testid='select-noiva-origem']", nota: "“Origem” — obrigatório, e nasce vazio de propósito: é ele que responde de onde vêm as noivas que fecham." },
          { alvo: "[data-testid='button-salvar-noiva']", nota: "O botão que fecha o cadastro." },
        ],
      },
      {
        nome: "nova-noiva-origem",
        rota: `/loja/${LOJA}/noivas/nova`,
        alvo: "form",
        folga: 72,
        preparar: [{ clicar: "[data-testid='select-noiva-origem']" }],
        legenda: "As quatro origens que o sistema oferece — escolha a que de fato trouxe a noiva.",
        esperaMs: 1_200,
      },
      {
        nome: "nova-noiva-preenchida",
        rota: `/loja/${LOJA}/noivas/nova`,
        alvo: "form",
        folga: 56,
        preparar: [
          { preencher: "[data-testid='input-noiva-nome']", com: "Helena Ferraz" },
          { escolher: "[data-testid='select-noiva-origem']", opcao: "Instagram" },
          { preencher: "[data-testid='input-noivo-nome']", com: "Vitor Salles" },
          { digitar: "[data-testid='input-noiva-whatsapp']", com: "11962220147" },
          { preencher: "[data-testid='input-casamento-local']", com: "Casa Charlô" },
        ],
        legenda: "O mesmo formulário preenchido, pronto para salvar.",
        realces: [
          {
            alvo: "[data-testid='input-noiva-whatsapp']",
            nota: "Digite só os números: o campo põe os parênteses e o traço sozinho.",
          },
        ],
      },
      {
        // O erro é parte do passo a passo: a vendedora precisa reconhecer a
        // frase antes de encontrá-la com uma noiva na frente.
        nome: "nova-noiva-whatsapp-torto",
        rota: `/loja/${LOJA}/noivas/nova`,
        alvo: "form",
        folga: 56,
        preparar: [
          { preencher: "[data-testid='input-noiva-nome']", com: "Helena Ferraz" },
          { digitar: "[data-testid='input-noiva-whatsapp']", com: "962220147" },
          { clicar: "[data-testid='button-salvar-noiva']" },
        ],
        legenda: "Faltando o DDD, o sistema não deixa salvar — e diz o que aconteceria se deixasse.",
        realces: [
          { alvo: "text=Confira o número", nota: "A conferência que impede o número que apagaria todos os botões de WhatsApp dela." },
        ],
      },

      // ── 2. A ficha ──────────────────────────────────────────────────────
      {
        nome: "ficha-faixa",
        rota: `/loja/${LOJA}/noivas/demo-lead-ana`,
        alvo: "main",
        legenda: "A ficha da Ana Paula. A faixa do topo diz o que fazer agora, e só aparece quando há o que fazer.",
        realces: [
          { alvo: "text=Fechar o contrato", nota: "A faixa “próximo passo”: ela já aceitou, falta o contrato." },
          { alvo: "text=Orçamento aberto", nota: "A etapa em que ela está no funil." },
          { alvo: "text=Agendar atendimento", nota: "A ação principal da ficha.", numeroEm: "topo-direita" },
        ],
      },
      {
        nome: "ficha-blocos",
        rota: `/loja/${LOJA}/noivas/demo-lead-ana`,
        alvo: "main",
        preparar: [{ rolarAte: "text=Histórico de contato" }],
        legenda: "Descendo a ficha: o casamento, o contato e o histórico do que já foi combinado.",
      },
      {
        nome: "ficha-portal",
        rota: `/loja/${LOJA}/noivas/demo-lead-ana`,
        alvo: "text=Portal da noiva >> xpath=ancestor::div[contains(@class,'rounded')][1]",
        folga: 16,
        preparar: [{ rolarAte: "text=Portal da noiva" }],
        legenda: "O card do portal: um link só para tudo dela, e o registro de quando ela abriu.",
      },

      // ── 3. Interesses ───────────────────────────────────────────────────
      {
        nome: "interesses",
        rota: `/loja/${LOJA}/noivas/demo-lead-ana/interesses`,
        alvo: "main",
        legenda: "Interesses: o que ela procura, no vocabulário do catálogo, mais três campos livres.",
        realces: [
          { alvo: "text=Algo a mais", nota: "O que ela pediu com as palavras dela." },
          { alvo: "text=Não quer usar", nota: "O que ela recusou — vale tanto quanto o que ela quer." },
        ],
      },

      // ── 4. O acervo e o lookbook ────────────────────────────────────────
      {
        nome: "catalogo",
        rota: `/loja/${LOJA}/catalogo`,
        alvo: "main",
        legenda: "O catálogo: as peças com foto, preço e as características pelas quais se filtra.",
      },

      // ── 5. Marcar a prova ───────────────────────────────────────────────
      {
        nome: "agendar-tipo",
        rota: `/loja/${LOJA}/atendimentos/novo`,
        alvo: "main",
        legenda: "Agendar: o tipo decide o resto do formulário.",
        realces: [
          { alvo: "text=Tipo", nota: "“Atendimento” é a visita comum; “Prova” exige a reserva do vestido." },
          { alvo: "text=Noiva", nota: "A noiva — e a lista deixa cadastrar uma nova sem sair daqui." },
        ],
      },
      {
        nome: "agendar-horarios",
        rota: `/loja/${LOJA}/atendimentos/novo`,
        alvo: "main",
        preparar: [{ rolarAte: "text=Cabine" }],
        legenda: "Escolhidas a cabine, a vendedora e a data, o sistema acende só os horários que existem.",
      },

      // ── 6. O orçamento ──────────────────────────────────────────────────
      {
        nome: "orcamento-rascunho",
        rota: `/loja/${LOJA}/orcamentos/demo-orcamento-carolina`,
        alvo: "main",
        legenda: "Um orçamento em rascunho — é assim que ele nasce, e é aqui que se lançam os itens.",
        realces: [
          { alvo: "text=Adicionar", nota: "O botão que lança o item na proposta.", numeroEm: "topo-direita" },
          { alvo: "text=Tipo de desconto", nota: "O seletor do desconto: “Percentual (%)” tira 20%; “Valor (R$)” tira R$ 20,00." },
        ],
      },
      {
        nome: "orcamento-item",
        rota: `/loja/${LOJA}/orcamentos/demo-orcamento-carolina`,
        alvo: "form:has([data-testid='select-vestido-catalogo'])",
        folga: 20,
        preparar: [{ rolarAte: "[data-testid='select-vestido-catalogo']" }],
        legenda: "Lançar um item: escolhendo do catálogo, a descrição e o preço vêm sozinhos.",
        realces: [
          { alvo: "[data-testid='select-vestido-catalogo']", nota: "A peça do acervo — ou “avulso (digitar)”, para o que não está cadastrado." },
        ],
      },
      {
        nome: "orcamento-enviado",
        rota: `/loja/${LOJA}/orcamentos/demo-orcamento-ana`,
        alvo: "main",
        legenda: "A proposta da Ana Paula, já enviada e aceita: a conta que ela leu, com o desconto aplicado.",
        realces: [
          { alvo: "text=Aceito pela noiva", nota: "O chip que diz que ela aceitou pelo link.", numeroEm: "topo-direita" },
          // Aspas = casamento EXATO: `text=Total` pegava "Subtotal: R$ 5.780,00"
          // e a caixa apontava o número errado embaixo da legenda certa.
          { alvo: 'text="Total: R$ 5.202,00"', nota: "O total líquido — é ele que vira o contrato.", numeroEm: "topo-direita" },
        ],
      },
      {
        nome: "orcamento-aprovado",
        rota: `/loja/${LOJA}/orcamentos/demo-orcamento-juliana`,
        alvo: "main",
        legenda: "Aprovado, o orçamento congela e o botão colorido vira “Gerar contrato”.",
        realces: [{ alvo: "text=Gerar contrato", nota: "A porta para o contrato.", numeroEm: "topo-direita" }],
      },

      // ── 7. O que a noiva recebe ─────────────────────────────────────────
      {
        nome: "proposta-da-noiva",
        rota: "/orcamento/demo-proposta-ana-paula",
        publica: true,
        // As páginas públicas são estreitas (a noiva lê no celular): sem
        // recorte, o print fica com metade da folha em fundo vazio e a letra
        // some no PDF.
        alvo: ".bg-card",
        folga: 28,
        legenda: "O que a noiva abre pelo link do WhatsApp — sem login, no celular dela.",
        realces: [
          { alvo: "text=Soma dos itens", nota: "A conta que fecha: soma, desconto e total." },
          { alvo: "text=Você aceitou esta proposta", nota: "Depois do aceite, a página vira comprovante." },
        ],
      },
      {
        nome: "portal-da-noiva",
        rota: "/noiva/demo-portal-beatriz",
        publica: true,
        alvo: ".max-w-2xl",
        folga: 20,
        legenda: "O portal: um link só para tudo dela — proposta, provas, contrato, vestido e parcelas.",
      },

      // ── 8. O contrato ───────────────────────────────────────────────────
      {
        nome: "contrato",
        rota: `/loja/${LOJA}/contratos/demo-contrato-beatriz`,
        alvo: "main",
        legenda: "A tela do contrato: o total, o quanto falta receber e a forma de pagamento.",
        realces: [
          { alvo: "text=Valor total", nota: "O que foi fechado." },
          { alvo: "text=Falta receber", nota: "O que ainda não entrou." },
        ],
      },
      {
        nome: "contrato-carne",
        rota: `/loja/${LOJA}/contratos/demo-contrato-beatriz`,
        alvo: "main",
        preparar: [{ rolarAte: "text=Entrada" }],
        legenda: "O carnê, parcela por parcela: a paga sai riscada, e a próxima traz a data.",
      },

      // ── 9. As filas do dia ──────────────────────────────────────────────
      {
        nome: "mensagens",
        rota: `/loja/${LOJA}/mensagens`,
        alvo: "main",
        legenda: "Mensagens de hoje — com quem falar, e por quê. Cada bloco é um motivo diferente.",
      },
      {
        nome: "funil",
        rota: `/loja/${LOJA}/noivas?vista=funil`,
        alvo: "main",
        legenda: "O funil: onze colunas, do “Novo” ao “Devolvido”. O card se arrasta entre elas.",
      },
      {
        nome: "provas",
        rota: `/loja/${LOJA}/provas`,
        alvo: "main",
        legenda: "Provas: quem vem provar, da mais próxima à mais distante.",
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

/**
 * As capturas antigas deste manual saem antes das novas entrarem.
 *
 * Sem isto, um print renomeado deixa o arquivo velho no disco, a âncora antiga
 * do HTML continua achando imagem, e o PDF sai com uma tela que não existe mais
 * — sem aviso nenhum, porque nada falta.
 */
for (const arquivo of readdirSync(DESTINO_IMAGENS)) {
  if (arquivo.startsWith(`${process.argv[2] ?? "vendedora"}-`) && arquivo.endsWith(".png")) {
    unlinkSync(path.join(DESTINO_IMAGENS, arquivo));
  }
}

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
      await pagina.waitForTimeout(c.esperaMs ?? 1_000);
      for (const gesto of c.preparar ?? []) await executar(pagina, gesto);
      if (c.realces?.length) await desenharRealces(pagina, c.realces);
      await pagina.waitForTimeout(180);
      await recortar(pagina, c, destino);
      feitas.push(`${qual}-${c.nome}.png`);
      console.log(`  ✓ ${qual}-${c.nome}.png${c.realces?.length ? ` (${c.realces.length} realces)` : ""}`);
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

/** Um gesto na tela, antes do print. */
async function executar(pagina: Page, gesto: Gesto): Promise<void> {
  if ("clicar" in gesto) {
    await pagina.locator(gesto.clicar).first().click({ timeout: 10_000 });
    await pagina.waitForTimeout(450);
    return;
  }
  if ("preencher" in gesto) {
    await pagina.locator(gesto.preencher).first().fill(gesto.com, { timeout: 10_000 });
    await pagina.waitForTimeout(220);
    return;
  }
  if ("digitar" in gesto) {
    // `fill` grava o valor de uma vez e a máscara do campo não roda: o print
    // saía com "11962220147" cru embaixo de uma legenda que prometia
    // "(11) 96222-0147". Tecla a tecla, a tela formata como formata para ela.
    await pagina.locator(gesto.digitar).first().pressSequentially(gesto.com, { delay: 28, timeout: 15_000 });
    await pagina.waitForTimeout(220);
    return;
  }
  if ("escolher" in gesto) {
    // O `Select` do app não é `<select>`: abre uma lista e a opção é um item
    // com papel de option — o gesto é clique, clique.
    await pagina.locator(gesto.escolher).first().click({ timeout: 10_000 });
    await pagina.waitForTimeout(320);
    await pagina.getByRole("option", { name: gesto.opcao, exact: false }).first().click({ timeout: 10_000 });
    await pagina.waitForTimeout(320);
    return;
  }
  if ("rolarAte" in gesto) {
    await pagina.locator(gesto.rolarAte).first().scrollIntoViewIfNeeded({ timeout: 10_000 });
    await pagina.waitForTimeout(320);
    return;
  }
  await pagina.waitForTimeout(gesto.esperar);
}

/**
 * As caixas numeradas, desenhadas NA PÁGINA.
 *
 * O traço é `outline`, não `border`: borda muda o layout e empurraria o que
 * está sendo apontado. O número é um círculo fora da caixa, no canto que a
 * captura declarar — em cima do rótulo do campo ele esconderia justamente a
 * palavra que a legenda cita.
 */
async function desenharRealces(pagina: Page, realces: Realce[]): Promise<void> {
  /**
   * As caixas são medidas AQUI, pelo Playwright, e não com `querySelector` lá
   * dentro: assim o alvo pode ser `text=…`, `role=…` ou qualquer seletor que a
   * biblioteca entende — e o rótulo que a legenda cita é o mesmo texto que o
   * manual escreve, não um `data-testid` que só existe no código.
   */
  const medidas: (Realce & { caixa: { x: number; y: number; width: number; height: number } })[] = [];
  const rolagem = await pagina.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  for (const r of realces) {
    const caixa = await pagina.locator(r.alvo).first().boundingBox();
    if (!caixa) {
      console.error(`    ! realce sem alvo na tela: ${r.alvo}`);
      continue;
    }
    medidas.push({ ...r, caixa: { ...caixa, x: caixa.x + rolagem.x, y: caixa.y + rolagem.y } });
  }

  await pagina.evaluate((lista: typeof medidas) => {
    document.querySelectorAll("[data-realce-do-manual]").forEach((n) => n.remove());
    const CARMIM = "#a32f3f";
    lista.forEach((r, i) => {
      const caixa = r.caixa;
      const topo = caixa.y;
      const esquerda = caixa.x;

      const moldura = document.createElement("div");
      moldura.setAttribute("data-realce-do-manual", "");
      Object.assign(moldura.style, {
        position: "absolute",
        top: `${topo - 4}px`,
        left: `${esquerda - 4}px`,
        width: `${caixa.width + 8}px`,
        height: `${caixa.height + 8}px`,
        border: `2.5px solid ${CARMIM}`,
        borderRadius: "9px",
        boxShadow: `0 0 0 4px rgba(163,47,63,.12)`,
        pointerEvents: "none",
        zIndex: "2147483000",
      } as Partial<CSSStyleDeclaration>);
      document.body.appendChild(moldura);

      const numero = document.createElement("div");
      numero.setAttribute("data-realce-do-manual", "");
      numero.textContent = String(i + 1);
      // O padrão é FORA da caixa, à esquerda: medido, o número no canto superior
      // esquerdo comia a primeira letra do rótulo — "Nome da noiva" virava
      // "ome da noiva" no print, justamente a palavra que a legenda cita.
      const canto = r.numeroEm ?? "esquerda";
      const posicao =
        canto === "topo-direita"
          ? { top: `${topo - 18}px`, left: `${esquerda + caixa.width - 10}px` }
          : canto === "esquerda"
            ? { top: `${topo + caixa.height / 2 - 14}px`, left: `${esquerda - 38}px` }
            : { top: `${topo - 18}px`, left: `${esquerda - 18}px` };
      Object.assign(numero.style, {
        position: "absolute",
        ...posicao,
        width: "28px",
        height: "28px",
        borderRadius: "999px",
        background: CARMIM,
        color: "#fff",
        font: "600 15px/28px system-ui, sans-serif",
        textAlign: "center",
        boxShadow: "0 2px 6px rgba(0,0,0,.28)",
        pointerEvents: "none",
        zIndex: "2147483001",
      } as Partial<CSSStyleDeclaration>);
      document.body.appendChild(numero);
    });
  }, medidas);
}

/** O recorte: o elemento declarado com folga, ou a área visível inteira. */
async function recortar(pagina: Page, c: Captura, destino: string): Promise<void> {
  if (!c.alvo) {
    await pagina.screenshot({ path: destino });
    return;
  }
  const alvo = pagina.locator(c.alvo).first();
  await alvo.scrollIntoViewIfNeeded();
  await pagina.waitForTimeout(220);
  const caixa = await alvo.boundingBox();
  if (!caixa) throw new Error(`alvo sem caixa na tela: ${c.alvo}`);
  const folga = c.folga ?? 24;
  const largura = pagina.viewportSize()?.width ?? 1280;
  const altura = pagina.viewportSize()?.height ?? 860;
  await pagina.screenshot({
    path: destino,
    clip: {
      x: Math.max(0, caixa.x - folga),
      y: Math.max(0, caixa.y - folga),
      width: Math.min(largura - Math.max(0, caixa.x - folga), caixa.width + folga * 2),
      height: Math.min(altura - Math.max(0, caixa.y - folga), caixa.height + folga * 2),
    },
  });
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
      // A legenda numerada é a mesma ordem das caixas desenhadas na tela: quem
      // lê o número no print acha a frase sem procurar.
      const chamadas = captura?.realces?.length
        ? `<ol class="chamadas">` +
          captura.realces.map((r) => `<li>${r.nota}</li>`).join("") +
          `</ol>`
        : "";
      return (
        `<figure class="print">` +
        `<img src="data:image/png;base64,${b64}" alt="${captura?.legenda ?? nome}">` +
        (captura?.legenda ? `<figcaption>${captura.legenda}</figcaption>` : "") +
        chamadas +
        `</figure>`
      );
    },
  );

  const paraImprimir = comImagens.replace("</style>", `${CSS_DE_IMPRESSAO}\n</style>`);

  /**
   * A mesma página, com os prints, para a WEB — e não é luxo.
   *
   * O texto do manual fala com a imagem ("Preenchido, ele fica assim:"), e a
   * página publicada sem os prints fica com frases apontando para o nada. Esta
   * versão não é versionada (é derivada, e pesa 5 MB em base64): ela existe
   * para ser publicada, e nasce do MESMO arquivo que o PDF.
   */
  writeFileSync(path.join(DESTINO_PDF, `${qual}.html`), paraImprimir);

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
  /* As chamadas: a mesma numeração das caixas do print, em círculo carmim —
     o olho vai do número na imagem para o número na frase sem procurar. */
  figure.print ol.chamadas {
    list-style: none; counter-reset: chamada;
    margin: 12px auto 0; padding: 0; max-width: 58ch;
    display: flex; flex-direction: column; gap: 6px;
  }
  figure.print ol.chamadas li {
    counter-increment: chamada; position: relative;
    padding-left: 30px; margin: 0; font-size: 14.5px; line-height: 1.5;
  }
  figure.print ol.chamadas li::before {
    content: counter(chamada);
    position: absolute; left: 0; top: 1px;
    width: 21px; height: 21px; border-radius: 999px;
    background: var(--carmim); color: #fff;
    font: 600 12.5px/21px system-ui, sans-serif; text-align: center;
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
