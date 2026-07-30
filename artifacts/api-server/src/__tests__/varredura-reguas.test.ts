import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

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

function arquivosFonte(): string[] {
  const achados: string[] = [];
  const anda = (dir: string) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === "generated" || entrada.name === "node_modules") continue;
        anda(caminho);
      } else if (/\.tsx?$/.test(entrada.name) && !entrada.name.includes(".test.")) {
        achados.push(caminho);
      }
    }
  };
  for (const pasta of PASTAS_FONTE) anda(join(RAIZ, pasta));
  return achados;
}

/** Comentários fora: eles CITAM o código errado para explicar o conserto. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function varrer(assinatura: RegExp, perdoados: readonly string[]): string[] {
  const ofensores: string[] = [];
  for (const arquivo of arquivosFonte()) {
    const relativo = relative(RAIZ, arquivo);
    if (perdoados.includes(relativo)) continue;
    const fonte = semComentarios(readFileSync(arquivo, "utf8"));
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

  /** O passivo herdado. Cada linha é dívida reconhecida, não permissão. */
  const HERDADOS = [
    "artifacts/moscow-noivas/src/lib/financeiro/cobranca.ts",
    "artifacts/moscow-noivas/src/lib/whatsapp.ts",
    "artifacts/moscow-noivas/src/pages/financeiro/fluxo.tsx",
    "artifacts/moscow-noivas/src/pages/financeiro/projecao.tsx",
    "artifacts/moscow-noivas/src/pages/minha-comissao/index.tsx",
    "artifacts/moscow-noivas/src/pages/noiva-portal.tsx",
    "artifacts/moscow-noivas/src/pages/noivas/conversao.tsx",
    "artifacts/moscow-noivas/src/pages/noivas/helpers.ts",
    "artifacts/moscow-noivas/src/pages/reservas/helpers.ts",
  ];

  it("nenhum arquivo NOVO declara formatador fora da régua", () => {
    expect(varrer(ASSINATURA, [...REGUAS, ...HERDADOS])).toEqual([]);
  });

  it("e o passivo não cresce às escondidas — a lista é o número", () => {
    // Se um herdado for consolidado, esta conta cai e a linha sai da lista
    // acima: o teste vermelho é o lembrete de apagar a dívida da planilha.
    const aindaDeclaram = HERDADOS.filter((f) =>
      new RegExp(ASSINATURA.source).test(semComentarios(readFileSync(join(RAIZ, f), "utf8"))),
    );
    expect(aindaDeclaram).toEqual(HERDADOS);
  });
});
