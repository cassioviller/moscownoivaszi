/**
    // Recicla a página entre capturas (ver acima).
    await pagina.close().catch(() => undefined);
    pagina = await ctx.newPage();
 * Os PRINTS dos manuais, e o PDF que sai deles.
 *
 *   # 1. a loja de demonstração (idempotente)
 *   pnpm --filter @workspace/api-server exec tsx ../../scripts/loja-de-demonstracao.ts
 *   # 2. com o app de pé em BASE_URL:
 *   BASE_URL=http://localhost:5173 \
 *     pnpm --filter @workspace/api-server exec tsx ../../scripts/prints-dos-manuais.ts vendedora   # ou: todos
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

/**
 * `--so-injetar` reconstrói a página publicável sobre as capturas versionadas,
 * e para isso **não precisa do app de pé** — a bandeira é lida aqui em cima
 * porque a guarda abaixo pararia o script antes de ela ser considerada.
 */
const SO_INJETAR = process.argv.includes("--so-injetar");

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL && !SO_INJETAR) {
  console.error(
    "prints-dos-manuais: BASE_URL é obrigatória (onde o app está de pé, ex.: http://localhost:5173).\n" +
      "  Sem ela o script antigo do repositório gravou em `undefined/` — a S-D1 não se repete.\n" +
      "  Só reescreveu o TEXTO do manual? `--so-injetar` republica sobre as capturas versionadas.",
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
  /** E236: a altura do viewport desta captura — formulário mais alto que 860px saía cortado no recorte. */
  altura?: number;
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
      // ── E236: o que nasceu depois dos 24 primeiros prints (12/08) ──────
      {
        nome: "reservas",
        rota: `/loja/${LOJA}/reservas`,
        alvo: "main",
        legenda: "Reservas: cada peça com a noiva dela, por mês do casamento. “Provas & ajustes” abre a ficha da reserva.",
      },
      {
        nome: "reserva-ficha",
        rota: `/loja/${LOJA}/reservas/demo-bloqueio-beatriz`,
        alvo: "main",
        legenda: "A ficha da reserva: de quem é a peça, a movimentação (retirada e devolução reais), as avarias e as provas — tudo o que o contrato cobra passa por aqui.",
        realces: [
          { alvo: "[data-testid='trocar-noiva-da-reserva']", nota: "“Trocar a noiva” — quando a peça muda de mãos antes do contrato.", numeroEm: "topo-direita" },
          { alvo: "button:has-text('Registrar retirada')", nota: "“Registrar retirada” — a peça saiu com a noiva; a partir daqui conta o prazo de devolução (cláusula 10ª).", numeroEm: "topo-direita" },
          { alvo: "text=Agendar prova", nota: "“Agendar prova” — já com a noiva e a reserva preenchidas.", numeroEm: "topo-direita" },
        ],
      },
      {
        nome: "contrato-pecas",
        rota: `/loja/${LOJA}/contratos/demo-contrato-beatriz`,
        alvo: "[data-testid='pecas-do-contrato']",
        folga: 40,
        preparar: [{ rolarAte: "[data-testid='pecas-do-contrato']" }],
        legenda: "As peças do contrato: é aqui que se troca uma peça (cláusula 17ª) — em até 7 dias do fecho, e nunca em sexta ou sábado.",
      },
      {
        nome: "contrato-receber",
        rota: `/loja/${LOJA}/contratos/demo-contrato-beatriz`,
        alvo: "[role='dialog']",
        folga: 40,
        preparar: [{ rolarAte: "text=Plano de pagamento" }, { clicar: "button:has-text('Receber')" }],
        esperaMs: 1_200,
        legenda: "Receber uma parcela pelo contrato: valor, data e forma — vencida, a mora da cláusula 9ª já vem somada, e dá para perdoar.",
      },
      {
        nome: "minha-comissao",
        rota: `/loja/${LOJA}/minha-comissao`,
        esperaMs: 2_500,
        legenda: "Minha comissão: o seu extrato — o mês corrente e os fechados. Só o seu, não o da loja.",
      },
      {
        nome: "vestidos",
        rota: `/loja/${LOJA}/vestidos`,
        alvo: "main",
        legenda: "Vestidos: o acervo com o estado de cada peça — disponível, reservada, na rua, em reparo.",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // E236 — os quatro manuais que eram só prosa ganham o passo a passo com
  // prints, na sessão de quem os protagoniza (a loja de demonstração ganhou a
  // dona, a recepção e a costureira). Cada captura é uma tela QUE A PESSOA VÊ,
  // recortada no pedaço que a seção do manual descreve, com os realces
  // numerados na ordem em que a legenda os conta.
  // ═══════════════════════════════════════════════════════════════════════════

  proprietario: {
    arquivo: "proprietario.html",
    email: "helena@moscownoivas.com",
    senha: "demo-dos-manuais",
    capturas: [
      // ── O que ela vê ────────────────────────────────────────────────────
      {
        nome: "menu",
        rota: `/loja/${LOJA}/dashboard`,
        legenda: "A tela de entrada da dona: as dezenove linhas do menu abrem para o seu perfil.",
        realces: [
          { alvo: "aside >> text=Financeiro", nota: "Financeiro — o mapa do dinheiro, e a porta das telas do mês.", numeroEm: "esquerda" },
          { alvo: "aside >> text=Folha do mês", nota: "Folha do mês — o roteiro de fechar o mês, em três passos.", numeroEm: "esquerda" },
          { alvo: "aside >> text=Comissões", nota: "Comissões — as regras e o fechamento por competência.", numeroEm: "esquerda" },
          { alvo: "aside >> text=Equipe", nota: "Equipe e Permissões — quem entra, e com que perfil.", numeroEm: "esquerda" },
          { alvo: "aside >> text=Configurações", nota: "Configurações — os dados da loja que saem no contrato.", numeroEm: "esquerda" },
        ],
      },
      // ── 1. Seu dia ─────────────────────────────────────────────────────
      {
        nome: "seu-dia",
        rota: `/loja/${LOJA}/dashboard`,
        alvo: "main",
        legenda: "“Seu dia”: os cards do topo são o que pede atenção agora; os de baixo, o resumo da loja.",
        realces: [
          { alvo: "[data-testid='card-aceitos-sem-contrato']", nota: "O aceite que espera contrato — dinheiro parado, com o valor na frente." },
          { alvo: "text=A receber — próximos 30 dias", nota: "O que entra nos próximos 30 dias; o card ao lado é o que sai.", numeroEm: "topo-direita" },
          { alvo: "text=Hoje na loja", nota: "Quem vem hoje, e o botão de iniciar o atendimento." },
        ],
      },
      // ── 2. O mapa do financeiro ────────────────────────────────────────
      {
        nome: "financeiro",
        rota: `/loja/${LOJA}/financeiro`,
        alvo: "main",
        legenda: "Financeiro: o caixa realizado da janela, e as seis portas para o resto (Projeção, Resultado, Cobrança, Folha, Auditoria, Conciliação).",
        realces: [
          { alvo: "text=Projeção de caixa →", nota: "Projeção de caixa — o saldo para a frente, pelo vencimento.", numeroEm: "topo-direita" },
          { alvo: "text=Conciliação →", nota: "Conciliação — o extrato do banco contra o sistema.", numeroEm: "topo-direita" },
          { alvo: "[data-testid='recebimentos-por-forma']", nota: "Entradas por meio — Pix, cartão e dinheiro, para conferir com o caixa físico." },
          { alvo: "#fluxo-ini", nota: "A janela: mude as datas e tudo na tela acompanha." },
        ],
      },
      // ── 4. Receber e pagar ─────────────────────────────────────────────
      {
        nome: "receber",
        rota: `/loja/${LOJA}/financeiro/receber`,
        alvo: "main",
        legenda: "Contas a receber: as parcelas de todos os contratos, com o filtro por situação e o botão de receber em cada linha.",
        realces: [
          { alvo: "button:has-text('Atrasadas')", nota: "“Atrasadas” — a lista de quem precisa de cobrança, num clique.", numeroEm: "topo-direita" },
          { alvo: "[data-testid='input-busca-receber']", nota: "A busca pela noiva." },
          { alvo: "button:has-text('Receber')", nota: "“Receber” abre o diálogo com o valor, a data e a forma de pagamento.", numeroEm: "topo-direita" },
        ],
      },
      {
        nome: "receber-dialogo",
        rota: `/loja/${LOJA}/financeiro/receber`,
        alvo: "[role='dialog']",
        folga: 40,
        preparar: [{ clicar: "button:has-text('Receber')" }],
        esperaMs: 1_200,
        legenda: "O diálogo de receber: o valor vem preenchido com o que falta; a data e a forma são o que o banco vai mostrar depois.",
      },
      {
        nome: "contrato-instrumento",
        rota: `/loja/${LOJA}/contratos/demo-contrato-beatriz`,
        alvo: "main",
        legenda: "A tela do contrato, e o botão que imprime o INSTRUMENTO: as 21 cláusulas com os números das réguas, quem assina pela loja, o foro e o PIX — tudo do cadastro.",
        realces: [
          { alvo: "text=Baixar PDF", nota: "“Baixar PDF” — o contrato de locação, pronto para assinar.", numeroEm: "topo-direita" },
          { alvo: "[data-testid='text-falta-receber']", nota: "O que falta receber, ao vivo." },
          { alvo: "[data-testid='pecas-do-contrato']", nota: "As peças deste contrato, e a porta de trocar uma delas (cláusula 17ª)." },
        ],
      },
      // ── 5. Cobrança ────────────────────────────────────────────────────
      {
        nome: "cobranca",
        rota: `/loja/${LOJA}/financeiro/cobranca`,
        alvo: "main",
        legenda: "Cobrança: as noivas em atraso, com a mora da cláusula 9ª calculada até hoje e o botão de perdoar.",
      },
      // ── 6. Conferir o banco ────────────────────────────────────────────
      {
        nome: "conciliacao",
        rota: `/loja/${LOJA}/financeiro/conciliacao`,
        alvo: "main",
        legenda: "Conciliação: suba o extrato (OFX ou CSV) e a tela diz o que bateu, o que só o banco tem e o que só o sistema tem — um movimento por PAGAMENTO desde 15/08/2026.",
        realces: [
          { alvo: "button:has-text('Escolher extrato')", nota: "“Escolher extrato” — o arquivo é lido no navegador; nada sai do seu computador." },
        ],
      },
      // ── 7. Fechar o mês ────────────────────────────────────────────────
      {
        nome: "folha",
        rota: `/loja/${LOJA}/financeiro/folha`,
        alvo: "[data-testid='roteiro-fechar-mes']",
        folga: 40,
        legenda: "Folha do mês — o roteiro: cada passo diz o que falta e leva ao lugar de resolver.",
        realces: [
          { alvo: "[data-testid='passo-fechar-1']", nota: "Passo 1 — a competência gerada (as recorrências do mês)." },
          { alvo: "[data-testid='passo-fechar-2']", nota: "Passo 2 — os salários definidos e as despesas lançadas." },
          { alvo: "[data-testid='passo-fechar-3']", nota: "Passo 3 — declarar o mês para a contadora (o CSV)." },
        ],
      },
      {
        nome: "folha-despesa",
        rota: `/loja/${LOJA}/financeiro/folha`,
        alvo: "#despesa-descricao >> xpath=ancestor::div[contains(@class,'rounded')][1]",
        folga: 40,
        preparar: [{ rolarAte: "#despesa-descricao" }],
        legenda: "Lançar uma despesa do mês: descrição, fornecedor, valor e o dia em que vence.",
        realces: [
          { alvo: "#despesa-descricao", nota: "O que é — o nome que aparece no DRE." },
          { alvo: "#despesa-valor", nota: "O valor, em reais." },
          { alvo: "#despesa-dia", nota: "O dia do vencimento — é ele que põe a conta na projeção." },
        ],
      },
      {
        nome: "dre",
        rota: `/loja/${LOJA}/financeiro/dre`,
        alvo: "main",
        legenda: "Resultado do mês (DRE): entradas, saídas por categoria e o resultado, no regime de caixa.",
      },
      // ── 8. Comissões ───────────────────────────────────────────────────
      {
        nome: "comissoes",
        rota: `/loja/${LOJA}/comissoes`,
        alvo: "main",
        legenda: "Comissões: como está o mês por vendedora, as pendências e a regra em faixas.",
        realces: [
          { alvo: "[data-testid='pendencias-comissao']", nota: "O que trava o fechamento — resolve-se antes de fechar." },
          { alvo: "button:has-text('Fechar competência')", nota: "“Fechar competência” — congela o mês e gera o que pagar.", numeroEm: "topo-direita" },
          { alvo: "text=Regras de comissão", nota: "As regras: faixas de venda × percentual, com o simulador ao lado." },
        ],
      },
      // ── 9. Equipe e permissões ─────────────────────────────────────────
      {
        nome: "equipe",
        rota: `/loja/${LOJA}/equipe`,
        alvo: "main",
        legenda: "Equipe: quem entra na loja, com que perfil, e as duas formas de trazer alguém.",
        realces: [
          { alvo: "button:has-text('Convidar por link')", nota: "“Convidar por link” — a pessoa cria a própria senha.", numeroEm: "topo-direita" },
          { alvo: "button:has-text('Cadastrar com senha')", nota: "“Cadastrar com senha” — você define a senha e entrega.", numeroEm: "topo-direita" },
          { alvo: "text=Gerenciar permissões desta loja →", nota: "Permissões — o que cada perfil vê e faz, módulo a módulo.", numeroEm: "topo-direita" },
        ],
      },
      {
        nome: "permissoes",
        rota: `/loja/${LOJA}/permissoes`,
        alvo: "main",
        legenda: "Permissões: uma linha por perfil, uma coluna por módulo — ver, criar, editar. É daqui que sai o menu de cada pessoa.",
      },
      // ── 10. A loja e os dados ──────────────────────────────────────────
      {
        nome: "dados-da-loja",
        altura: 1500,
        rota: `/loja/${LOJA}/configuracoes`,
        alvo: "#loja-nome >> xpath=ancestor::form",
        folga: 40,
        preparar: [{ rolarAte: "#loja-nome" }],
        legenda: "Dados da loja — três blocos: a loja, quem assina por ela e como a noiva paga. É o que sai impresso no contrato.",
        realces: [
          { alvo: "#loja-cnpj", nota: "O CNPJ é conferido pelos dígitos: número que não fecha não grava." },
          { alvo: "#loja-cidade", nota: "Cidade e UF nomeiam o foro (cláusula 21ª) e a linha de local e data." },
          { alvo: "#loja-representante-nome", nota: "Quem assina pela loja — nome, RG e CPF saem na identificação das partes." },
          { alvo: "#loja-pix-chave", nota: "A chave PIX e o titular saem ao pé da assinatura e no recibo." },
          { alvo: "button:has-text('Salvar dados')", nota: "“Salvar dados” — trava enquanto um CNPJ ou CPF não fechar." },
        ],
      },
      {
        nome: "privacidade",
        rota: `/loja/${LOJA}/configuracoes`,
        alvo: "text=Privacidade (LGPD) >> xpath=ancestor::*[self::section or self::div][1]",
        folga: 40,
        preparar: [{ rolarAte: "text=Privacidade (LGPD)" }],
        legenda: "Privacidade (LGPD): a anonimização das noivas perdidas antigas — um gesto seu, nunca automático.",
        realces: [{ alvo: "[data-testid='anonimizar-perdidas']", nota: "O botão que anonimiza; a tela diz quantas antes de você confirmar." }],
      },
      {
        nome: "auditoria",
        rota: `/loja/${LOJA}/financeiro/auditoria`,
        alvo: "main",
        legenda: "Auditoria: a linha do tempo de quem mexeu em dinheiro — recebeu, estornou, pagou, perdoou.",
      },
    ],
  },

  recepcao: {
    arquivo: "recepcao.html",
    email: "renata@moscownoivas.com",
    senha: "demo-dos-manuais",
    capturas: [
      {
        nome: "menu",
        rota: `/loja/${LOJA}/dashboard`,
        legenda: "A tela de entrada da recepção. O menu mostra só o que o seu perfil abre.",
        realces: [
          { alvo: "aside >> text=Agenda", nota: "Agenda — a grade do dia, por cabine.", numeroEm: "esquerda" },
          { alvo: "aside >> text=Atendimentos", nota: "Atendimentos — a fila: quem chega, quem faltou, quem está sendo atendida.", numeroEm: "esquerda" },
          { alvo: "aside >> text=Mensagens de hoje", nota: "Mensagens de hoje — o que confirmar e a quem lembrar.", numeroEm: "esquerda" },
          { alvo: "aside >> text=Noivas", nota: "Noivas — para cadastrar quem ligou e corrigir um telefone.", numeroEm: "esquerda" },
        ],
      },
      // ── 1. A agenda do dia ─────────────────────────────────────────────
      {
        nome: "agenda",
        rota: `/loja/${LOJA}/agenda`,
        alvo: "main",
        legenda: "A agenda do dia: uma coluna por cabine, meia hora por linha. O horário ocupado aparece com o nome da noiva.",
        realces: [
          { alvo: "text=Novo agendamento", nota: "“Novo agendamento” — abre o formulário já no dia que você está vendo.", numeroEm: "topo-direita" },
          { alvo: "text=Semana →", nota: "“Semana” — a mesma agenda, sete dias de uma vez.", numeroEm: "topo-direita" },
          { alvo: "[data-testid='grade-agenda']", nota: "A grade — clique num horário livre para marcar ali." },
        ],
      },
      {
        nome: "agenda-semana",
        rota: `/loja/${LOJA}/agenda/semana`,
        alvo: "main",
        legenda: "A semana: para achar um horário livre sem virar dia por dia.",
      },
      // ── 2. Marcar ──────────────────────────────────────────────────────
      {
        nome: "agendar-tipo",
        rota: `/loja/${LOJA}/atendimentos/novo`,
        alvo: "form",
        folga: 56,
        legenda: "Marcar: o tipo decide o resto do formulário — atendimento pede a noiva; prova pede também a reserva.",
        realces: [
          { alvo: "text=Tipo", nota: "O tipo — “Atendimento” é a visita comum; “Prova” exige a reserva do vestido." },
          { alvo: "text=Noiva", nota: "A noiva — busque pelo nome; a lista deixa cadastrar uma nova sem sair daqui." },
        ],
      },
      {
        nome: "agendar-horarios",
        rota: `/loja/${LOJA}/atendimentos/novo`,
        alvo: "form",
        folga: 56,
        preparar: [{ rolarAte: "text=Cabine" }],
        legenda: "Escolhidas a cabine, a vendedora e a data, o sistema acende só os horários que existem — o expediente e as ausências já estão descontados.",
      },
      // ── 4. A fila do atendimento ───────────────────────────────────────
      {
        nome: "fila",
        rota: `/loja/${LOJA}/atendimentos`,
        alvo: "main",
        legenda: "A fila do dia: quem vem, com o telefone e os três gestos de cada linha.",
        realces: [
          { alvo: "text=Confirmar por WhatsApp", nota: "“Confirmar por WhatsApp” — abre a conversa com a mensagem pronta.", numeroEm: "topo-direita" },
          { alvo: "button:has-text('Iniciar atendimento')", nota: "“Iniciar atendimento” — quando a noiva chega; passa a vez para a vendedora.", numeroEm: "topo-direita" },
          { alvo: "button:has-text('Marcou falta')", nota: "“Marcou falta” — a noiva não veio; a agenda libera e a ficha registra.", numeroEm: "topo-direita" },
        ],
      },
      {
        nome: "fila-filtros",
        rota: `/loja/${LOJA}/atendimentos`,
        alvo: "main",
        legenda: "Os filtros do topo: por vendedora, por situação, e a aba de provas ao lado da de atendimentos.",
        realces: [
          { alvo: "button:has-text('Provas')", nota: "A aba de provas — a mesma fila, só as provas.", numeroEm: "topo-direita" },
          { alvo: "button:has-text('Todas as vendedoras')", nota: "Filtre por vendedora quando uma delas perguntar “quem é minha hoje?”." },
        ],
      },
      // ── 6. Mensagens de hoje ───────────────────────────────────────────
      {
        nome: "mensagens",
        rota: `/loja/${LOJA}/mensagens`,
        alvo: "main",
        legenda: "Mensagens de hoje: cada bloco é um motivo — presença a confirmar, cobrança, contato que esfriou. O botão abre o WhatsApp com o texto pronto.",
      },
      // ── 7. A noiva que ligou ───────────────────────────────────────────
      {
        nome: "noivas",
        rota: `/loja/${LOJA}/noivas`,
        alvo: "main",
        legenda: "Noivas: a lista, a busca e o botão de cadastrar quem acabou de ligar.",
        realces: [
          { alvo: "[data-testid='button-adicionar-noiva']", nota: "“Adicionar noiva” — nome e origem bastam para começar.", numeroEm: "topo-direita" },
          { alvo: "[data-testid='input-busca-noiva']", nota: "A busca — pelo nome, para achar a ficha de quem está ao telefone." },
        ],
      },
      {
        nome: "nova-noiva",
        rota: `/loja/${LOJA}/noivas/nova`,
        alvo: "form",
        folga: 56,
        preparar: [
          { preencher: "[data-testid='input-noiva-nome']", com: "Marina Castro" },
          { escolher: "[data-testid='select-noiva-origem']", opcao: "Instagram" },
          { digitar: "[data-testid='input-noiva-whatsapp']", com: "11961114522" },
        ],
        legenda: "Cadastrar quem ligou: nome, origem e o WhatsApp — o resto a vendedora completa no atendimento.",
        realces: [
          { alvo: "[data-testid='input-noiva-nome']", nota: "O nome — obrigatório." },
          { alvo: "[data-testid='select-noiva-origem']", nota: "A origem — obrigatória: é ela que responde de onde vêm as noivas." },
          { alvo: "[data-testid='input-noiva-whatsapp']", nota: "Só os números; o campo põe a máscara. Faltando o DDD, o sistema não salva." },
        ],
      },
      {
        nome: "ficha",
        rota: `/loja/${LOJA}/noivas/demo-lead-ana`,
        alvo: "main",
        legenda: "A ficha da noiva: a faixa do topo diz em que ponto ela está — é o que você lê quando ela liga perguntando.",
      },
      // ── 8. Cabines & horário ───────────────────────────────────────────
      {
        nome: "cabines-horario",
        altura: 1400,
        rota: `/loja/${LOJA}/atendimentos/config`,
        alvo: "main",
        legenda: "Cabines & horário: o expediente da loja, a duração da prova, as cabines e as ausências da equipe — é isto que decide que horários a agenda acende.",
        realces: [
          { alvo: "#abertura", nota: "Abre e fecha — o expediente. Fora dele, a agenda não oferece horário." },
          { alvo: "[data-testid='duracao-prova']", nota: "A duração da prova, em minutos." },
          { alvo: "#ausencia-pessoa", nota: "Ausências: quem está de férias sai da agenda naqueles dias." },
        ],
      },
      {
        nome: "provas",
        rota: `/loja/${LOJA}/provas`,
        alvo: "main",
        legenda: "Provas: quem vem provar, da mais próxima à mais distante — o selo avisa quando a prova está fora da janela do casamento.",
      },
    ],
  },

  costureira: {
    arquivo: "costureira.html",
    email: "dona.lourdes@moscownoivas.com",
    senha: "demo-dos-manuais",
    capturas: [
      {
        nome: "menu",
        rota: `/loja/${LOJA}/dashboard`,
        legenda: "Como você entra: o menu do seu perfil — Ajustes é a sua fila; Provas e Reservas, de onde o trabalho nasce.",
        realces: [
          { alvo: "aside >> text=Ajustes", nota: "Ajustes — a sua fila, com o prazo de cada trabalho.", numeroEm: "esquerda" },
          { alvo: "aside >> text=Provas", nota: "Provas — quem vem provar, e o que a prova pode gerar.", numeroEm: "esquerda" },
          { alvo: "aside >> text=Reservas", nota: "Reservas — a ficha da peça com a noiva: retirada, devolução, dano.", numeroEm: "esquerda" },
        ],
      },
      // ── 1. A fila ──────────────────────────────────────────────────────
      {
        nome: "fila",
        rota: `/loja/${LOJA}/ajustes`,
        alvo: "main",
        legenda: "A fila: cada card é um trabalho, com a noiva, a peça e o prazo. Os filtros separam o apertado do resto.",
        realces: [
          { alvo: "button:has-text('Prazo apertado')", nota: "“Prazo apertado” — o que vence primeiro, pela data da retirada.", numeroEm: "topo-direita" },
          { alvo: "button:has-text('Concluídos')", nota: "“Concluídos” — o que já saiu da fila.", numeroEm: "topo-direita" },
          { alvo: "[data-testid='abrir-nova-confeccao']", nota: "“Nova confecção” — trabalho que não nasce de prova: uma peça feita do zero.", numeroEm: "topo-direita" },
        ],
      },
      // ── 3/4. Marcar o que ficou pronto · a ficha do trabalho ───────────
      {
        nome: "ficha",
        rota: `/loja/${LOJA}/ajustes/demo-ajuste-1`,
        alvo: "main",
        legenda: "A ficha do trabalho: o checklist do que fazer, o botão de dar por feito, e de onde ele veio (a prova, a noiva, a peça, a reserva).",
        realces: [
          { alvo: "text=O trabalho", nota: "O trabalho — o checklist; marque cada item conforme termina." },
          { alvo: "button:has-text('Marcar feito')", nota: "“Marcar feito” — o item sai da lista; com todos feitos, o trabalho está pronto.", numeroEm: "topo-direita" },
          { alvo: "text=De onde veio", nota: "De onde veio — a noiva, a peça e a ficha da reserva, num clique." },
        ],
      },
      {
        nome: "nova-confeccao",
        rota: `/loja/${LOJA}/ajustes`,
        alvo: "[role='dialog']",
        folga: 40,
        preparar: [{ clicar: "[data-testid='abrir-nova-confeccao']" }],
        esperaMs: 1_200,
        legenda: "Nova confecção: a noiva, o que vai ser feito e o prazo — nasce direto na sua fila.",
      },
      // ── 5. De onde nasce o trabalho ────────────────────────────────────
      {
        nome: "provas",
        rota: `/loja/${LOJA}/provas`,
        alvo: "main",
        legenda: "Provas: a prova é onde o ajuste nasce — a vendedora anota o que a costureira vai fazer, e ele aparece na sua fila.",
        realces: [{ alvo: "text=Abrir reserva", nota: "“Abrir reserva” — a ficha da peça com a noiva.", numeroEm: "topo-direita" }],
      },
      {
        nome: "reservas",
        rota: `/loja/${LOJA}/reservas`,
        alvo: "main",
        legenda: "Reservas: cada peça com a noiva dela, por mês do casamento. “Provas & ajustes” abre a ficha.",
      },
      // ── 6. O dano que você vê primeiro ─────────────────────────────────
      {
        nome: "reserva-avaria",
        rota: `/loja/${LOJA}/reservas/demo-bloqueio-beatriz`,
        alvo: "section:has(h2:text-is('Avarias'))",
        folga: 40,
        preparar: [{ rolarAte: "section:has(h2:text-is('Avarias'))" }],
        legenda: "O bloco Avarias, na ficha da reserva, como VOCÊ o vê: sem botão nenhum. Você lê o que foi registrado (a descrição, a cláusula, o reparo, a foto) — e quem registra é quem pode criar em Vestidos. O que só você faz: chamar essa pessoa com a peça ainda na mão.",
      },
      {
        nome: "reserva-movimentacao",
        rota: `/loja/${LOJA}/reservas/demo-bloqueio-beatriz`,
        alvo: "section:has(h2:text-is('Movimentação'))",
        folga: 40,
        preparar: [{ rolarAte: "section:has(h2:text-is('Movimentação'))" }],
        legenda: "Movimentação: a retirada e a devolução reais da peça — é o que decide o prazo do seu trabalho. Você lê; quem registra é a vendedora ou a dona.",
      },
      {
        nome: "agenda",
        rota: `/loja/${LOJA}/agenda`,
        alvo: "main",
        legenda: "A agenda também é sua: “Ajustes pendentes” lista o que está na fila ao lado dos atendimentos do dia.",
        realces: [{ alvo: "text=Ajustes pendentes", nota: "Ajustes pendentes — a fila, vista da agenda." }],
      },
    ],
  },

  noiva: {
    arquivo: "noiva.html",
    // O guia é da EQUIPE sobre o que a noiva vê: as telas são públicas, sem sessão.
    email: null,
    senha: "",
    capturas: [
      // ── Os três links ─────────────────────────────────────────────────
      {
        nome: "proposta",
        rota: "/orcamento/demo-proposta-ana-paula",
        publica: true,
        legenda: "O primeiro link — a proposta: o que a noiva abre pelo WhatsApp, sem login, no celular dela. A conta inteira, o desconto e o botão de aceitar.",
      },
      {
        nome: "portal",
        rota: "/noiva/demo-portal-beatriz",
        publica: true,
        legenda: "O segundo link — o portal: um link só para tudo dela. O topo diz o vestido, a data e o que falta.",
        realces: [
          { alvo: "[data-testid='falar-com-a-loja']", nota: "“Falar no WhatsApp” — abre a conversa com a loja, já se apresentando.", numeroEm: "topo-direita" },
        ],
      },
      {
        nome: "portal-contrato",
        rota: "/noiva/demo-portal-beatriz",
        publica: true,
        alvo: "text=Seu contrato >> xpath=ancestor::section[1]",
        folga: 40,
        preparar: [{ rolarAte: "text=Seu contrato" }],
        legenda: "“Seu contrato”: o total, o que já pagou e o botão que baixa o instrumento em PDF — o mesmo que a loja imprime.",
        realces: [{ alvo: "[data-testid='baixar-contrato-portal']", nota: "“Baixar o contrato em PDF” — as 21 cláusulas, com os números da loja.", numeroEm: "topo-direita" }],
      },
      {
        nome: "portal-parcelas",
        rota: "/noiva/demo-portal-beatriz",
        publica: true,
        alvo: "text=Suas parcelas >> xpath=ancestor::section[1]",
        folga: 40,
        preparar: [{ rolarAte: "text=Suas parcelas" }],
        legenda: "“Suas parcelas”: o carnê como ela vê — a paga riscada, a próxima com a data. Vencida, aparece com a mora da cláusula 9ª.",
      },
      {
        nome: "portal-clausulas",
        rota: "/noiva/demo-portal-beatriz",
        publica: true,
        alvo: "[data-testid='clausulas-do-contrato']",
        folga: 40,
        preparar: [{ rolarAte: "[data-testid='clausulas-do-contrato']" }],
        legenda: "“O que o seu contrato prevê”: os prazos e as regras que mexem com ela, na língua dela — a troca, a devolução, o dano, o cancelamento.",
      },
      {
        nome: "lookbook",
        rota: "/lookbook/demo-lookbook-ana-paula",
        publica: true,
        legenda: "O terceiro link — o lookbook: as peças que a vendedora separou para ela, com foto, para ela olhar em casa.",
      },
    ],
  },
};

/**
 * E236 — `todos` roda os cinco manuais em série, na mesma sessão de Chromium
 * por manual (cada um com a SUA sessão de perfil). `qual`/`manual` são o manual
 * DA VEZ: as funções abaixo os leem como estado do módulo, e o laço no fim do
 * arquivo os avança.
 */
const PEDIDO = process.argv[2] ?? "vendedora";
const PEDIDOS = PEDIDO === "todos" ? Object.keys(MANUAIS) : [PEDIDO];
for (const p of PEDIDOS) {
  if (!MANUAIS[p]) {
    console.error(`prints-dos-manuais: manual desconhecido "${p}". Conhecidos: ${Object.keys(MANUAIS).join(", ")}, todos`);
    process.exit(1);
  }
}
let qual = PEDIDOS[0]!;
let manual = MANUAIS[qual]!;


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
 *
 * **`--so-injetar` NÃO limpa**, e a primeira versão da bandeira esquecia disto:
 * este laço roda no topo do módulo, então injetar apagava as 24 capturas
 * versionadas ANTES de lê-las, e a página saía com 90 KB e 24 figuras vazias em
 * vez de 5 MB. O modo que existe justamente para não recapturar não pode
 * começar destruindo o que ele ia reusar.
 */
function limparCapturasDe(q: string): void {
  for (const arquivo of readdirSync(DESTINO_IMAGENS)) {
    if (arquivo.startsWith(`${q}-`) && arquivo.endsWith(".png")) {
      unlinkSync(path.join(DESTINO_IMAGENS, arquivo));
    }
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
  // E236: uma PÁGINA por captura. O diálogo aberto de um print derrubava a página
  // no `goto` seguinte ("Target page, context or browser has been closed" — as
  // duas capturas depois de `contrato-receber`, em duas rodadas de três); página
  // nova a cada print isola o estado, e o custo é de milissegundos.
  let pagina = await ctx.newPage();

  const feitas: string[] = [];
  for (const c of manual.capturas) {
    const destino = path.join(DESTINO_IMAGENS, `${qual}-${c.nome}.png`);
    try {
      if (pagina.isClosed()) pagina = await ctx.newPage();
      await pagina.setViewportSize({ width: 1280, height: c.altura ?? 860 });
      await pagina.goto(c.rota, { waitUntil: "networkidle", timeout: 45_000 });
      await pagina.waitForTimeout(c.esperaMs ?? 1_000);
      for (const gesto of c.preparar ?? []) await executar(pagina, gesto);
      // E236: o `main` do app rola POR DENTRO (`overflow-y-auto`), então a rolagem
      // que o recorte faz depois moveria o conteúdo e deixaria as caixas no lugar
      // errado — medido: os realces de "dados-da-loja" saíram ~700px abaixo do
      // campo. A rolagem final acontece AQUI, antes de desenhar.
      if (c.alvo) {
        await pagina.locator(c.alvo).first().scrollIntoViewIfNeeded();
        await pagina.waitForTimeout(220);
      }
      if (c.realces?.length) await desenharRealces(pagina, c.realces);
      await pagina.waitForTimeout(180);
      await recortar(pagina, c, destino);
      // E236: um diálogo aberto (o print de "receber", por exemplo) derrubava o
      // navegador no `goto` seguinte — medido: as duas capturas depois de
      // `contrato-receber` saíam "browser has been closed". Fecha antes de seguir.
      await pagina.keyboard.press("Escape").catch(() => undefined);
      await pagina.waitForTimeout(250);
      feitas.push(`${qual}-${c.nome}.png`);
      console.log(`  ✓ ${qual}-${c.nome}.png${c.realces?.length ? ` (${c.realces.length} realces)` : ""}`);
    } catch (erro) {
      console.error(`  ✗ ${qual}-${c.nome}.png — ${(erro as Error).message.split("\n")[0]}`);
    }
    // Recicla a página entre capturas (ver acima).
    await pagina.close().catch(() => undefined);
    pagina = await ctx.newPage();
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
 * O HTML do manual com as imagens injetadas nas âncoras que ele declara.
 *
 * **Separado do `gerarPdf` porque as duas coisas mudam em ritmos diferentes**
 * (S-C270/15-08): o TEXTO do manual se reescreve ao fim de cada onda — é a
 * regra do E196 —, e os PRINTS só mudam quando a tela muda. Recapturar 24
 * telas para republicar um parágrafo custa subir o app, semear a loja de
 * demonstração e dirigir o navegador; injetar sobre as capturas versionadas
 * custa um `readFileSync`.
 *
 * As capturas estão no versionamento (`docs/manuais/capturas/`), então esta
 * função é reproduzível sem app no ar. O que ela NÃO faz é perceber que a tela
 * mudou — para isso é o `capturar()`, e o print velho é mentira do mesmo jeito
 * que a prosa velha. Quem muda a tela recaptura; quem muda só o texto, injeta.
 */
function montarHtmlComImagens(): string {
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
  return paraImprimir;
}

/**
 * O PDF sai do MESMO HTML da página publicada — o manual não tem duas versões.
 * O que muda é o que se injeta antes de imprimir: as imagens nos lugares que o
 * HTML declara (`<figure data-print="…">`) e a folha de estilo de impressão.
 */
async function gerarPdf(pagina: Page): Promise<void> {
  const paraImprimir = montarHtmlComImagens();

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

/**
 * `--so-injetar` reconstrói a página publicável a partir das capturas que já
 * estão no versionamento, **sem subir o app**.
 *
 * É o caminho da reescrita de manual (a regra do E196: manual se reescreve ao
 * fim de cada onda). Sem ele, republicar um parágrafo custava semear a loja de
 * demonstração e dirigir 24 telas — e o custo fazia a página publicada
 * envelhecer: em 15/08 ela ainda era a de **11/08**, quatro ondas atrás.
 *
 * Quem mudou a TELA continua rodando o script inteiro: print velho é mentira
 * do mesmo jeito que prosa velha, e esta bandeira não sabe a diferença.
 */
/**
 * E236 — o `--so-injetar` também IMPRIME o PDF. Ele precisa do Chromium e não
 * do app (`setContent` sobre o HTML já montado), então republicar os cinco
 * depois de reescrever um parágrafo custa ~10 s e nenhuma sessão.
 */
let navegadorParaInjetar: Awaited<ReturnType<typeof chromium.launch>> | null = null;
for (const p of PEDIDOS) {
  qual = p;
  manual = MANUAIS[p]!;
  if (SO_INJETAR) {
    navegadorParaInjetar ??= await chromium.launch({ executablePath: EXECUTAVEL });
    const pagina = await navegadorParaInjetar.newPage();
    await gerarPdf(pagina);
    await pagina.close();
    console.log(
      `prints-dos-manuais: ${qual} · injetadas ${manual.capturas.length} capturas versionadas ` +
        `em docs/manuais/pdf/${qual}.{html,pdf} (sem app no ar — para recapturar, rode sem --so-injetar)`,
    );
  } else {
    limparCapturasDe(qual);
    console.log(`prints-dos-manuais: ${qual} · ${manual.capturas.length} capturas · sessão ${manual.email ?? "pública"}`);
    await capturar();
  }
}
await navegadorParaInjetar?.close();
