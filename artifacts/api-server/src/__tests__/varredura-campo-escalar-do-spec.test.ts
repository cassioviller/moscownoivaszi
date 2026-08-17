import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns, is, Table } from "drizzle-orm";
import * as schemaDoBanco from "@workspace/db/schema";
import { arquivosVersionados } from "./arquivos-versionados";
import { lerSpec, versionado, SPEC, RAIZ } from "./schemas-aninhados";

/**
 * **S-O115/E239 — o campo ESCALAR declarado e nunca preenchido deixa de ser
 * invisível.**
 *
 * A `varredura-schemas-aninhados` (E192) só enxerga objeto aninhado (`$ref`):
 * o `donoLeadId` — escalar, e a origem da trilha inteira — precisou de uma
 * régua própria, dedicada a UMA tabela. A sobra pedia a forma geral: cruzar as
 * **colunas do drizzle** com as **propriedades escalares** de cada schema.
 *
 * Medido em 2026-08-15, antes de escrever, e a medição mudou a régua:
 *
 * - **49 tabelas · 233 nomes de coluna distintos · 108 schemas alcançados por
 *   resposta 2xx · 700 propriedades escalares.** Destas, **162 em 57 schemas
 *   NÃO são coluna de tabela nenhuma** — são DERIVADAS: alguém as monta à mão
 *   (`donoLeadId`, `mora.dias`, `orfaoSeguraAte`, `ultimoContatoEm`…). (No
 *   spec inteiro, contando os schemas que nenhuma resposta alcança, são 197
 *   em 79 — o número que a primeira medição deu, e que a régua não usa: campo
 *   de schema que ninguém responde não é promessa a ninguém.)
 * - A forma que a sobra imaginava — cobrar por PORTA que cada derivada
 *   apareça no handler — dá **218 pares (operação, campo) mudos em 100
 *   operações**, e quase todos são schema COMPARTILHADO (`Lead.ultimoContatoEm`
 *   viaja em 40 respostas e só a listagem o monta) ou serializador que mora em
 *   OUTRO pacote (`MoraDaParcela.*` nasce no `financeiro-core`, que o motor de
 *   handlers não lê). Régua com 218 falsos positivos não é régua.
 * - A forma que DECIDE é a do fixo: **campo derivado que NINGUÉM escreve em
 *   lugar nenhum do servidor** — nem `nome:` de objeto, nem shorthand, nem
 *   `.nome =`. Hoje são **0 de 162**, e é isso que esta régua trava: a lista
 *   vazia, como a "nenhuma aresta fica órfã" do E199.
 *
 * O que ela pega: o campo que entra no spec (o cliente gerado o promete) e
 * ninguém preenche — o `donoLeadId` de antes do E167 teria aparecido aqui, e o
 * campo renomeado no código sem renomear no spec aparece hoje. O que ela NÃO
 * pega, dito: a porta que entrega MENOS que a irmã (a S-O17), porque essa
 * distinção pede seguir o serializador por porta e é o ruído medido acima.
 */

/** Todos os nomes de coluna (em camelCase, como o drizzle os expõe) de todas as tabelas. */
function colunasDoBanco(): { tabelas: number; colunas: Set<string> } {
  const colunas = new Set<string>();
  let tabelas = 0;
  for (const v of Object.values(schemaDoBanco)) {
    if (!is(v, Table)) continue;
    tabelas++;
    for (const k of Object.keys(getTableColumns(v as Table))) colunas.add(k);
  }
  return { tabelas, colunas };
}

/** Os schemas que alguma resposta 2xx alcança, resolvendo `$ref` transitivo. */
function schemasDeResposta(): { schemas: Map<string, { nome: string; ref: string | null; linha: number }[]>; alcancados: Set<string> } {
  const { schemas, operacoes } = lerSpec(versionado(SPEC));
  const alcancados = new Set<string>();
  const fila = operacoes.map((o) => o.raiz).filter((x): x is string => !!x);
  while (fila.length) {
    const s = fila.shift()!;
    if (alcancados.has(s)) continue;
    alcancados.add(s);
    for (const p of schemas.get(s) ?? []) if (p.ref) fila.push(p.ref);
  }
  return { schemas, alcancados };
}

/** O código do servidor que monta respostas: api-server e as libs, fora de teste e de gerado. */
function codigoDoServidor(): { arquivos: number; texto: string } {
  const arquivos = arquivosVersionados(RAIZ, ["artifacts/api-server/src", "lib"]).filter(
    (f) => f.endsWith(".ts") && !f.includes("__tests__") && !f.includes("/generated/") && !f.includes(".test."),
  );
  return { arquivos: arquivos.length, texto: arquivos.map((f) => readFileSync(join(RAIZ, f), "utf8")).join("\n") };
}

/** O campo aparece como identificador em algum lugar do servidor. */
function escrito(campo: string, codigo: string): boolean {
  return new RegExp(`\\b${campo}\\b`).test(codigo);
}

type Derivada = { schema: string; campo: string; linha: number };

function derivadas(): { total: number; lista: Derivada[] } {
  const { colunas } = colunasDoBanco();
  const { schemas, alcancados } = schemasDeResposta();
  let total = 0;
  const lista: Derivada[] = [];
  for (const s of alcancados) {
    for (const p of schemas.get(s) ?? []) {
      if (p.ref) continue;
      total++;
      if (!colunas.has(p.nome)) lista.push({ schema: s, campo: p.nome, linha: p.linha });
    }
  }
  return { total, lista };
}

describe("varredura — campo escalar do spec que ninguém preenche (S-O115)", () => {
  it("olha para o banco inteiro, o spec inteiro e o servidor inteiro", () => {
    const { tabelas, colunas } = colunasDoBanco();
    // piso anti-vacuidade (S-RM33): a população cresce por fora, e este número é o PISO — não a medida.
    expect(tabelas, "tabelas do drizzle").toBeGreaterThanOrEqual(40);
    // piso anti-vacuidade (S-RM33): a população cresce por fora, e este número é o PISO — não a medida.
    expect(colunas.size, "nomes de coluna distintos").toBeGreaterThanOrEqual(200);
    const { total, lista } = derivadas();
    // piso anti-vacuidade (S-RM33): a população cresce por fora, e este número é o PISO — não a medida.
    expect(total, "propriedades escalares alcançadas por resposta").toBeGreaterThanOrEqual(600);
    // O piso das derivadas: se ele desabar, ou o drizzle passou a expor as
    // colunas com outro nome, ou o `lerSpec` deixou de resolver o `$ref`.
    // piso anti-vacuidade (S-RM33): a população cresce por fora, e este número é o PISO — não a medida.
    expect(lista.length, "campos derivados (não são coluna)").toBeGreaterThanOrEqual(150);
    // piso anti-vacuidade (S-RM33): a população cresce por fora, e este número é o PISO — não a medida.
    expect(codigoDoServidor().arquivos).toBeGreaterThanOrEqual(100);
  });

  it("o detector reconhece as três grafias de escrita e não inventa a quarta", () => {
    const codigo = `
      const a = { donoLeadId: dono?.id ?? null };
      const porOrigem = await db.select();
      return { porOrigem };
      linha.orfaoSeguraAte = prazo;
      // moraDe monta dias/saldo/multa
    `;
    expect(escrito("donoLeadId", codigo)).toBe(true);
    expect(escrito("porOrigem", codigo), "shorthand conta").toBe(true);
    expect(escrito("orfaoSeguraAte", codigo), "atribuição conta").toBe(true);
    expect(escrito("ultimoContatoEm", codigo)).toBe(false);
    // Prefixo não é o campo: `dias` não casa em `diasUteis`.
    expect(escrito("dias", "const diasUteis = 3;")).toBe(false);
  });

  it("todo campo derivado é escrito por alguém no servidor — a lista de órfãos é vazia", () => {
    const { texto } = codigoDoServidor();
    const orfaos = derivadas()
      .lista.filter((d) => !escrito(d.campo, texto))
      .map((d) => `${d.schema}.${d.campo} (openapi.yaml:${d.linha})`)
      .sort();
    expect(
      orfaos,
      "campo escalar prometido pelo spec que NENHUM código do servidor escreve — o cliente o lê como undefined para sempre: ou sai do spec, ou alguém o preenche",
    ).toEqual([]);
  });

  /**
   * O que a régua declara e não julga: as derivadas por schema, para o número
   * não crescer calado. Campo derivado novo é promessa nova de serialização —
   * a pergunta "quem preenche?" é a mesma do E192, aqui para o escalar.
   */
  it("162 campos derivados em 57 schemas — o retrato, travado", () => {
    const { lista } = derivadas();
    const porSchema = new Set(lista.map((d) => d.schema));
    // E239: 162 · 57, medidos em 2026-08-15 sobre o spec com `ContratoParcela`
    // (S-O112) — o recorte novo repete os campos derivados de `Parcela` que não
    // são coluna (a mora vem por `$ref`, então nenhum escalar novo).
    expect(lista.length, "campo derivado novo — diga quem o preenche, e suba o número aqui").toBe(162);
    expect(porSchema.size).toBe(57);
  });
});
