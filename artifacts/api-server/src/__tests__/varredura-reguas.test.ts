import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * As assinaturas mecânicas das classes de defeito que a revisão do E111 achou —
 * varridas sobre o repositório INTEIRO, não sobre uma amostra.
 *
 * Por que existe: os 58 achados do E111 caíram em poucas formas repetidas, e
 * uma revisão (humana ou de modelo) encontra ALGUMAS ocorrências de cada. Um
 * `grep` encontra TODAS — e vira teste, então não expira. É a lição que o
 * `moscow-noivas/src/lib/datas-varredura.test.ts` (D15/E99) já tinha escrito:
 * *"uma varredura que procura uma grafia declara-se completa e não é."*
 *
 * A divisão de trabalho com aquela é limpa: **ela** cobra que todo formatador
 * DIGA o fuso; **esta** cobra que ele não seja uma cópia da régua, e cuida de
 * "hoje" e da leitura de dinheiro.
 *
 * Cada perdão abaixo carrega a razão. Perdão sem razão é allowlist, e allowlist
 * silenciosa foi exatamente o que o E101 provou que apodrece.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

const PASTAS_FONTE = [
  "artifacts/api-server/src",
  "artifacts/moscow-noivas/src",
  "lib/financeiro-core/src",
  "lib/funil-core/src",
  "lib/agenda-core/src",
];

/**
 * Os arquivos-fonte VERSIONADOS, em caminho relativo à raiz.
 *
 * A enumeração saía do `readdirSync`, que lê o disco, com uma lista de
 * diretórios a pular mantida à mão (`generated`, `node_modules`). `git
 * ls-files` deriva do `.gitignore` a exclusão do que não é código nosso —
 * `node_modules`, `dist`, `coverage`, `build` —, que é onde a decisão já mora.
 * Régua da S38. Medido em 2026-08-06: os dois caminhos devolvem **os mesmos 237
 * arquivos**; a troca não muda a conta, tira a dependência de uma lista mantida
 * à mão. O `generated/` segue excluído à mão porque ele É versionado (334
 * arquivos em `lib/api-zod` e `lib/api-client-react`) e mesmo assim não é
 * código escrito por gente: cobrar régua de saída de codegen é cobrar do
 * gerador.
 */
function arquivosFonte(): string[] {
  return arquivosVersionados(RAIZ, PASTAS_FONTE).filter(
    (relativo) =>
      /\.tsx?$/.test(relativo) &&
      !relativo.includes(".test.") &&
      !relativo.split("/").includes("generated"),
  );
}

/** Comentários fora: eles CITAM o código errado para explicar o conserto. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Quantas vezes a assinatura aparece no arquivo, comentários fora. */
function contar(assinatura: RegExp, relativo: string): number {
  const fonte = semComentarios(readFileSync(join(RAIZ, relativo), "utf8"));
  return (fonte.match(new RegExp(assinatura.source, "g")) ?? []).length;
}

function varrer(assinatura: RegExp, perdoados: readonly string[]): string[] {
  const ofensores: string[] = [];
  for (const relativo of arquivosFonte()) {
    if (perdoados.includes(relativo)) continue;
    const fonte = semComentarios(readFileSync(join(RAIZ, relativo), "utf8"));
    const re = new RegExp(assinatura.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(fonte)) !== null) {
      ofensores.push(`${relativo}: ${m[0].replace(/\s+/g, " ").slice(0, 80)}`);
    }
  }
  return ofensores;
}

// ─────────────────── 1. "hoje" no relógio de quem executa ───────────────────

/**
 * `new Date()` seguido de `setHours(0,0,0,0)` é a meia-noite do fuso de QUEM
 * EXECUTA — o processo no servidor (UTC no container) ou o aparelho no
 * navegador. O dia do negócio é o de São Paulo, e a régua é
 * `inicioDoDia(hojeLocal())` do `financeiro-core`.
 *
 * O E111 achou quatro no servidor (dashboard, consolidado da rede, relatório de
 * acervo, expurgo LGPD) e a varredura achou mais três no frontend, que a
 * revisão não tinha visto. `setMonth` entra na mesma família por um motivo
 * pior: ele **transborda para o futuro** quando o dia de hoje não existe no mês
 * alvo (31/03 −1 mês = 03/03), e o expurgo é irreversível.
 */
describe("varredura — 'hoje' nunca sai do relógio de quem executa", () => {
  const ASSINATURA = /\.set(?:Hours|Minutes|Date|Month|FullYear)\(/;

  const PERDOADOS: string[] = [];

  it("a assinatura reconhece a grafia errada e ignora a certa", () => {
    const fonte = `const d = new Date(); d.setHours(0,0,0,0);`;
    expect(new RegExp(ASSINATURA.source).test(fonte)).toBe(true);
    expect(new RegExp(ASSINATURA.source).test(`inicioDoDia(hojeLocal())`)).toBe(false);
  });

  it("nenhum arquivo do app deriva um dia do relógio local", () => {
    expect(varrer(ASSINATURA, PERDOADOS)).toEqual([]);
  });
});

// ─────────────────── 2. dinheiro lido fora da régua pt-BR ───────────────────

/**
 * `Number(texto.replace(",", "."))` lê `"1.500"` como 1,5 — mil e quinhentos
 * viram um e meio, e a avaria de R$ 1.500,00 vira R$ 1,50. `parseValor` do core
 * lê o ponto de milhar como pt-BR e separa "não digitou" (null) de "digitou
 * bobagem" (NaN).
 *
 * O E95 fechou isso na tela de orçamento, o E111 achou mais três — e o defeito
 * já estava DOCUMENTADO como corrigido no mesmo arquivo em que sobrevivia.
 */
describe("varredura — dinheiro do teclado passa por parseValor", () => {
  const ASSINATURA = /Number\([^)]*\.replace\(/;

  const PERDOADOS = [
    /**
     * O ÚNICO perdão, e ele é o contrário de um descuido: em OFX o ponto é
     * DECIMAL por especificação, então `1.500` ali é um e meio. `parseValor`
     * leria 1500 e multiplicaria a transação por mil — a régua pt-BR está
     * CERTA para o teclado e ERRADA para este formato. O `replace` da vírgula
     * existe para os bancos brasileiros que descumprem o padrão.
     */
    "lib/financeiro-core/src/extrato.ts",
  ];

  it("a assinatura reconhece a grafia errada e ignora a certa", () => {
    expect(new RegExp(ASSINATURA.source).test(`Number(t.replace(",", "."))`)).toBe(true);
    expect(new RegExp(ASSINATURA.source).test(`parseValor(t)`)).toBe(false);
  });

  it("nenhum arquivo lê dinheiro do teclado fora da régua", () => {
    expect(varrer(ASSINATURA, PERDOADOS)).toEqual([]);
  });
});

// ───────────── 3. router montado sem path — mora em OUTRO arquivo ─────────────

/**
 * O item 3 nunca esteve neste arquivo, e o buraco na numeração era a pergunta
 * da S-D33. A resposta está no histórico: este arquivo nasceu em `fc2182a` já
 * pulando do 2 para o 4, e a numeração segue a tabela do adendo do E111
 * (`docs/revisao/2026-07-25-rodada-6/execucao/E111.md`, "Adendo — a varredura
 * mecânica das quatro assinaturas"), que lista as quatro classes nesta ordem:
 * 1. `setHours`/`setMonth` sobre `new Date()` · 2. `Number(…replace(` ·
 * 3. `router.use(fn)` sem path · 4. `new Intl.` fora da régua.
 *
 * A terceira não virou grep porque grep não a prova: `router.use(fn)` sem path
 * era "seguras hoje" no veredito do E111, e o que decide se um router novo
 * nasce aberto é o COMPORTAMENTO — o 403 da fronteira em cada recurso. Ela
 * virou a sonda `varredura-fronteira-loja-api.test.ts`, criada no MESMO commit
 * `fc2182a`, que extrai os recursos de `routes/*.ts` e chama cada um com a
 * sessão da outra loja. A numeração fica com o buraco de propósito: ela existe
 * para casar a sonda com o diagnóstico, e renumerar apagaria o casamento.
 */

// ─────────────── 4. formatador declarado fora dos arquivos-régua ───────────────

/**
 * O E111 apagou treze cópias de régua, e cinco delas eram `Intl` declarado numa
 * tela — inclusive um construído DENTRO de um `.map()`. A varredura de datas do
 * D15 não pegava nenhuma, e o motivo importa: ela cobra que o fuso seja DITO, e
 * todas essas o diziam. Cópia correta continua sendo cópia.
 *
 * **A lista abaixo é o ESTADO DE HOJE, não um atestado.** Não verifiquei uma a
 * uma se cada formatador fora da régua se justifica — várias são candidatas à
 * próxima consolidação, e o E92 já tinha deixado parte delas de propósito
 * (eram 36, foram a 17). O que esta sonda garante é que o número não cresça em
 * SILÊNCIO: arquivo novo declarando formatador reprova, e alguém decide.
 *
 * ## Os quatro recortes de "quantos formatadores Intl o sistema tem" (S-D32)
 *
 * Quatro números circularam como "os formatadores do sistema" — 15, 17, 25,
 * 36, 46 — e nenhum dizia seu recorte; foi assim que a S30 nasceu dizendo
 * quinze. Cada número abaixo foi remedido em 2026-08-07 DEPOIS da consolidação
 * da S30 (o valor antes dela entre parênteses), com a assinatura desta seção
 * (`new Intl.DateTimeFormat(` ou `new Intl.NumberFormat(`), comentários fora,
 * enumerando por `git ls-files`:
 *
 * - **5 — o passivo herdado** (era 17): a soma das contagens de `HERDADOS`
 *   (5 arquivos). É o número que o teste "o total do passivo é 5" congela, e o
 *   único que esta sonda DEFENDE.
 * - **26 — os arquivos-régua** (era 19): a soma nos 7 arquivos de `REGUAS`,
 *   com `formatos.ts` sozinho em 17 — os 7 que a S30 promoveu nasceram lá.
 *   Formatador aqui é o produto, não dívida.
 * - **31 — o código de aplicação** (era 36): 5 + 26, sobre os arquivos de
 *   `arquivosFonte()` (as cinco `PASTAS_FONTE`, `.ts`/`.tsx`, sem `.test.`,
 *   sem `generated/`). Zero fora das duas listas — é o que o primeiro caso
 *   desta seção prova. A diferença de 5 é o que a S30 APAGOU: cinco cópias
 *   opção a opção de funções que a régua já tinha.
 * - **40 — contando testes e E2E** (era 45): as mesmas cinco pastas COM os
 *   `.test.` + `e2e/` + `scripts/`, sem `generated/`. Os 9 além da aplicação:
 *   4 em testes de `moscow-noivas/src/lib` e 5 no E2E (4 specs +
 *   `global-setup.ts`).
 */
describe("varredura — formatador novo fora da régua exige decisão", () => {
  const ASSINATURA = /new Intl\.(?:DateTimeFormat|NumberFormat)\(/;

  /** As réguas: é aqui que formatador PODE nascer. */
  const REGUAS = [
    "artifacts/moscow-noivas/src/lib/formatos.ts",
    "artifacts/moscow-noivas/src/lib/financeiro/datas.ts",
    "lib/financeiro-core/src/datas.ts",
    "lib/agenda-core/src/slots.ts",
    "artifacts/api-server/src/lib/contrato-do-papel.ts",
    "artifacts/api-server/src/lib/auditoria.ts",
    "artifacts/api-server/src/lib/disponibilidade.ts",
  ];

  /**
   * O passivo herdado, arquivo por arquivo, com **quantos** formatadores cada
   * um declara. Cada linha é dívida reconhecida, não permissão.
   *
   * **Era uma lista de nomes, e a lista não é o número.** A sonda só perguntava
   * se cada herdado ainda declarava *pelo menos um* formatador
   * (`ASSINATURA.test(fonte)`), então `reservas/helpers.ts` podia ir de 6 para
   * 60 com a suíte verde — o passivo cresce dentro dos arquivos que já estão
   * perdoados, que é justamente onde é mais fácil crescer. Foi o que a
   * conferência de 2026-08-05 mediu ao conferir a S30: *"trava a lista de
   * arquivos, não a contagem"*.
   *
   * **S30 (2026-08-07) julgou os 17 um a um e o passivo caiu para 5.** O que
   * desceu: **5 eram cópia opção a opção de função que `formatos.ts` já
   * oferecia** e sumiram (o `formatadorContato` de cobranca = `instanteCurto`;
   * o `horaFmt` do whatsapp = `instanteHora`; o `diaFmt` do fluxo =
   * `diaMesAbrevAno`; o `quandoFmt` de minha-comissao = `instanteDia`; o
   * `mesAnoFmt` de reservas = `mesAnoLongo`), e **7 eram opção-sets gerais com
   * 2+ usos ou par de fuso de régua existente** e viraram funções públicas em
   * `formatos.ts` (`diaMesAbrev`, `diaMesLongo`, `diaMesAnoLongo`, `mesAbrev`,
   * `instanteDiaMesAbrev`, `instanteMesAno`, `instanteMesAbrev`). Os 5 que
   * ficam têm, cada um, o comentário do porquê no próprio arquivo — três
   * carregam o dia da SEMANA, que régua nenhuma traz, e dois são voz de uma
   * única tela.
   *
   * Consolidou um? A conta cai, o teste fica vermelho, e o vermelho é o
   * lembrete de baixar a dívida aqui.
   */
  const HERDADOS: Record<string, number> = {
    "artifacts/moscow-noivas/src/lib/whatsapp.ts": 1,
    "artifacts/moscow-noivas/src/pages/noiva-portal.tsx": 1,
    "artifacts/moscow-noivas/src/pages/noivas/conversao.tsx": 1,
    "artifacts/moscow-noivas/src/pages/noivas/helpers.ts": 1,
    "artifacts/moscow-noivas/src/pages/reservas/helpers.ts": 1,
  };

  it("nenhum arquivo NOVO declara formatador fora da régua", () => {
    expect(varrer(ASSINATURA, [...REGUAS, ...Object.keys(HERDADOS)])).toEqual([]);
  });

  it("e o passivo não cresce às escondidas — a CONTAGEM é o número", () => {
    const hoje: Record<string, number> = {};
    for (const arquivo of Object.keys(HERDADOS)) hoje[arquivo] = contar(ASSINATURA, arquivo);
    expect(hoje).toEqual(HERDADOS);
  });

  it("e o total do passivo é 5 — a S30 julgou os 17 de `fc2182a` um a um", () => {
    const total = Object.keys(HERDADOS).reduce((s, f) => s + contar(ASSINATURA, f), 0);
    expect(total).toBe(5);
  });

  /**
   * A varredura enumera pelo versionamento, e conjunto vazio aprova tudo em
   * silêncio. O piso é o número remedido em 2026-08-07 — 235 arquivos-fonte
   * versionados nas cinco pastas; o 237 de 2026-08-06 envelheceu porque cinco
   * fontes saíram (quatro `ui/` órfãos e o `use-mobile.tsx`) e duas entraram
   * desde a medida, e a cópia de `arquivos-versionados.ts` que a S-D30 pôs em
   * `moscow-noivas/src/lib` faz 236 no commit dela — com folga para baixo.
   */
  it("a varredura olha para os arquivos, e não para um conjunto vazio", () => {
    expect(arquivosFonte().length).toBeGreaterThan(200);
  });
});

// ───────── 5. executor de banco tipado como o POOL, e o cast que ele exige ─────────

/**
 * S-O6/E179 — `as unknown as typeof db` é a assinatura de um tipo que mente.
 *
 * Uma função que aceita "o db ou uma transação" tipada como `typeof db`
 * **recusa a transação**: o executor que o `db.transaction` entrega não é
 * atribuível ao do pool. Quem escreveu a função resolveu com um cast duplo, que
 * é a única forma de o TypeScript ficar quieto — e o cast apaga a checagem
 * inteira do argumento, não só a parte que incomodava. `DbExecutor`
 * (`lib/disponibilidade.ts`) é a união que já existia no repositório para isso,
 * derivada do próprio `db.transaction`, e com ela o argumento volta a ser
 * conferido.
 *
 * Medido no E179: **quatro declarações e dois casts**, todos em `reservas.ts`.
 * A sobra nomeava duas funções (`contarHistoria` e `cobrancaViva`) e a
 * varredura achou quatro — `donoDoBloqueio` e `statusDaCobranca` tinham a mesma
 * anotação sem nunca terem exigido o cast, porque ninguém as chamava de dentro
 * de uma transação AINDA. Os dois casts vivem exatamente onde a chamada corre
 * dentro de uma: a recontagem de história sob `FOR UPDATE` e a guarda do DELETE
 * de avaria sob tranca.
 *
 * Este é o irmão de tipo da varredura de portas sob tranca: aquela cobra que a
 * escrita segure a linha, esta cobra que o executor que a segura não precise
 * mentir sobre o que é.
 */
describe("varredura — executor de transação não vira `typeof db` por cast", () => {
  const CAST = /as unknown as typeof db\b/;
  const ANOTACAO = /executor\s*(?:\?)?:\s*typeof db\b(?!\.)/;

  it("as assinaturas reconhecem a grafia errada e ignoram a certa", () => {
    expect(new RegExp(CAST.source).test(`contarHistoria(tx as unknown as typeof db, ids)`)).toBe(true);
    expect(new RegExp(CAST.source).test(`contarHistoria(tx, ids)`)).toBe(false);
    expect(new RegExp(ANOTACAO.source).test(`executor: typeof db = db,`)).toBe(true);
    expect(new RegExp(ANOTACAO.source).test(`executor: DbExecutor = db,`)).toBe(false);
    // O tipo ESTRUTURAL de `lib/auth.ts` não é a mesma coisa e fica de fora:
    // ele pede UM método, e transação nenhuma é passada para lá.
    expect(new RegExp(ANOTACAO.source).test(`executor: { insert: typeof db.insert } = db,`)).toBe(false);
  });

  it("nenhum executor é declarado como o pool, e nenhum cast o força a ser", () => {
    expect([...varrer(CAST, []), ...varrer(ANOTACAO, [])]).toEqual([]);
  });
});
