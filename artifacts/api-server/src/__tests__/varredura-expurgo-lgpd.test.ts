import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { leadsTable } from "@workspace/db";
import { NOMES_DA_QUALIFICACAO } from "../lib/qualificacao-da-locataria";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * Varredura — **dado pessoal novo entra nas duas pontas da LGPD, ou nasce fora
 * da lei.**
 *
 * O expurgo de `routes/leads.ts` anonimiza a noiva com um `set({…})` de lista
 * **curada à mão**. É a classe da S-C33 — que custou dois épicos seguidos com a
 * varredura de trancas acusando código certo porque `COLUNAS_DE_ESTADO` era
 * lista à mão — e da S-C55 ao lado. Só que aqui a direção do erro é pior: uma
 * coluna que não entra na lista **sobrevive à anonimização**, e o sistema fica
 * dizendo "(anonimizada)" no nome ao lado de um CPF, um RG e um endereço
 * completo. Lista curada não reprova quando envelhece; ela vaza.
 *
 * O E215 acrescentou treze colunas de dado pessoal de uma vez. Sem esta régua,
 * a décima quarta nasce invisível para o expurgo, em silêncio.
 *
 * ## O que ela prega, e o que ela deliberadamente NÃO prega
 *
 * Prega que **todo campo de `NOMES_DA_QUALIFICACAO` aparece no `set` do
 * expurgo**. Essa lista é a fonte única do E215 (`lib/qualificacao-da-locataria.ts`),
 * consumida também pela guarda do `POST /contratos` e pelo congelamento — então
 * acrescentar um campo lá e esquecer o expurgo reprova aqui.
 *
 * Não tenta decidir sozinha **quais colunas de `leads` são dado pessoal**: isso
 * é semântica, não schema, e uma heurística por nome erraria nos dois sentidos
 * (`origem` não é pessoal; `cerimonialista` é). O que ela faz é a segunda
 * metade: enumera as colunas de `leads` que **não** são conhecidas — nem
 * pessoais já tratadas, nem estruturais — e reprova se aparecer uma nova sem
 * decisão. Coluna nova em `leads` passa a custar uma linha aqui, que é o preço
 * de não vazar.
 */

const CAMINHO_DO_EXPURGO = join(__dirname, "..", "routes", "leads.ts");

/** O bloco `set({…})` da transação do expurgo, extraído do fonte. */
function blocoDoExpurgo(): string {
  const fonte = readFileSync(CAMINHO_DO_EXPURGO, "utf8");
  const ancora = fonte.indexOf('noivaNome: "(anonimizada)"');
  expect(
    ancora,
    "a âncora do expurgo sumiu de routes/leads.ts — se o `set` mudou de forma, esta varredura precisa ser reapontada, não deletada",
  ).toBeGreaterThan(-1);
  const fim = fonte.indexOf("anonimizadaEm:", ancora);
  expect(fim).toBeGreaterThan(ancora);
  return fonte.slice(ancora, fim);
}

/**
 * As colunas de `leads` que NÃO são dado pessoal da noiva — estrutura, funil,
 * carimbos e vínculos. Toda coluna fora desta lista e fora do expurgo reprova.
 *
 * `noivaNome` fica de fora de propósito: ele é pessoal e é tratado, mas por
 * SUBSTITUIÇÃO ("(anonimizada)") e não por `null`, porque a linha continua
 * existindo para os números e precisa de um rótulo.
 */
const COLUNAS_NAO_PESSOAIS = new Set([
  "id",
  "lojaId",
  "etapa",
  "origem",
  "casamentoData",
  "casamentoHorario",
  "orcamentoAbertoEm",
  "aceiteEm",
  "contratoFechadoEm",
  "perdidaEm",
  "perdidaMotivo",
  "consentimentoEm",
  "anonimizadaEm",
  "createdAt",
  "updatedAt",
  // Tratado por substituição, não por null — ver acima.
  "noivaNome",
]);

describe("varredura — dado pessoal novo entra nas duas pontas da LGPD", () => {
  it("olha para o fonte versionado, e não para um conjunto vazio", () => {
    const versionados = arquivosVersionados(join(__dirname, "..", "routes"), ["*.ts"]);
    // piso anti-vacuidade (S-RM33): a população cresce por fora, e este número é o PISO — não a medida.
    expect(versionados.length).toBeGreaterThanOrEqual(15);
    expect(versionados.some((f) => f.endsWith("leads.ts"))).toBe(true);
  });

  it("toda coluna da qualificação (E215) é apagada pelo expurgo", () => {
    const bloco = blocoDoExpurgo();
    const ausentes = NOMES_DA_QUALIFICACAO.filter(
      (campo) => !new RegExp(`\\b${campo}\\s*:\\s*null`).test(bloco),
    );
    expect(
      ausentes,
      `estas colunas de dado pessoal sobrevivem à anonimização: ${ausentes.join(", ")}`,
    ).toEqual([]);
  });

  it("são as treze da qualificação, e a conta é do módulo — não deste teste", () => {
    // Se o E215 ganhar um décimo quarto campo, ele entra aqui sozinho e a
    // asserção acima passa a cobrá-lo do expurgo. O número é conferido para o
    // dia em que alguém ESVAZIAR a lista e a régua ficar verde por não ter
    // olhado — o pior resultado de uma sonda (a lição da S-C55).
    expect(NOMES_DA_QUALIFICACAO.length).toBe(13);
  });

  it("nenhuma coluna de `leads` fica sem decisão — nem pessoal, nem estrutural", () => {
    const doSchema = Object.keys(getTableColumns(leadsTable));
    const bloco = blocoDoExpurgo();
    const semDecisao = doSchema.filter(
      (coluna) =>
        !COLUNAS_NAO_PESSOAIS.has(coluna) &&
        !new RegExp(`\\b${coluna}\\s*:`).test(bloco),
    );
    expect(
      semDecisao,
      `coluna nova em \`leads\` sem decisão de LGPD: ${semDecisao.join(", ")} — ou ela é apagada pelo expurgo, ou entra em COLUNAS_NAO_PESSOAIS com a razão escrita`,
    ).toEqual([]);
  });

  it("a sonda enxerga: uma coluna sintética fora do expurgo reprova", () => {
    // Autoteste, no formato que a S-C55 cobrou: `[]` de sonda cega e `[]` de
    // repositório limpo são o mesmo valor, e só isto separa os dois.
    const bloco = blocoDoExpurgo();
    const sintetica = "numeroDoPassaporte";
    expect(COLUNAS_NAO_PESSOAIS.has(sintetica)).toBe(false);
    expect(new RegExp(`\\b${sintetica}\\s*:`).test(bloco)).toBe(false);
  });
});
