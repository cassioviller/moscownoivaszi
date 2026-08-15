import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * **S-O109/E239 — todo texto LIVRE que entra pela API tem teto, e o teto é o
 * mesmo para o mesmo campo.**
 *
 * A S-O81 nomeava UM campo (`AvariaInput.descricao`, E191) e a classe era o
 * spec inteiro. Medido em 2026-08-15, antes de escrever: nos schemas de
 * entrada (`*Input`/`*Update`/`*Body`), **205 propriedades `string` que não são
 * enum, data nem uuid — 13 com `maxLength` e 192 sem**. A sobra contava 4 e 93
 * (só `*Input`/`*Body`, e sem contar as `Update`; a régua da S-M9 diz que
 * criar×editar são o mesmo campo, então os gêmeos entram). Nem todas são texto
 * livre: a maioria é id que o banco constrange, ou senha, ou base64 com o teto
 * do parser (E186). As de texto livre eram **35** — a sobra dizia 19, e as
 * outras 16 são os gêmeos `Update` dos mesmos campos, mais o `perdidaDetalhe`,
 * os dois `AjusteChecklistItem*.descricao` e o `motivo` do estorno de comissão.
 *
 * O teto é a mesma conta do E191: `express.json()` sem `limit` aceita 100 kB,
 * e o que se decidiu é quanto disso UM campo pode ocupar. Dois números, e só
 * dois — para não haver a segunda grafia da S-O81 (`CORPO_MAX_FOTO_VESTIDO` ×
 * `CORPO_MAX_AVARIA`, E186):
 *
 * - **1000** para NOTA — `observacoes`, `observacao`, `descricao`,
 *   `vestidoDescricao`, `algoAMais`, `naoQuerUsar`, `perdidaDetalhe`. É o teto
 *   que a `AvariaInput.descricao` já tinha, e ~200 palavras cabem com sobra.
 * - **300** para FRASE — `motivo`, `endereco`, `casamentoLocal`. É o teto que
 *   `justificativaDaTaxa` e `PerdoarMoraInput.motivo` já tinham.
 *
 * O que a régua cobra: (1) campo de entrada cujo NOME é da classe de texto
 * livre tem `maxLength`; (2) o mesmo nome carrega o mesmo teto em todos os
 * schemas de entrada; (3) só existem os dois tetos acima para a classe.
 * O que ela NÃO julga: `nome`, `codigo`, `categoria`, `tamanho`, `cor` —
 * texto curto que o banco não constrange, mas que não é NOTA; ficam ditos, e
 * o dia em que um deles crescer é uma linha na classe abaixo.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");
const SPEC = join(RAIZ, "lib/api-spec/openapi.yaml");

/** Os nomes que são texto livre — nota longa ou frase curta. */
const NOTA = /^(observacoes|observacao|descricao|vestidoDescricao|algoAMais|naoQuerUsar|perdidaDetalhe)$/;
const FRASE = /^(motivo|endereco|casamentoLocal)$/;
const TETO = { nota: 1000, frase: 300 } as const;

type Propriedade = { schema: string; nome: string; corpo: string; linha: number; maxLength: number | null };

/** As propriedades `string` dos schemas de ENTRADA, com o corpo inline + bloco. */
function propriedadesDeEntrada(fonte: string): Propriedade[] {
  const linhas = fonte.split("\n");
  const out: Propriedade[] = [];
  let schema: string | null = null;
  let emProps = false;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]!;
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const ind = l.length - l.trimStart().length;
    const m4 = /^    ([A-Za-z0-9_]+):$/.exec(l);
    if (m4) {
      schema = m4[1]!;
      emProps = false;
      continue;
    }
    if (ind === 6) emProps = l.trim() === "properties:";
    if (!schema || !/(Input|Update|Body)$/.test(schema) || ind !== 8 || !emProps) continue;
    const pm = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(l.trim());
    if (!pm) continue;
    let corpo = pm[2]!;
    for (let j = i + 1; j < linhas.length; j++) {
      const lj = linhas[j]!;
      if (!lj.trim() || lj.trim().startsWith("#")) continue;
      if (lj.length - lj.trimStart().length <= 8) break;
      corpo += "\n" + lj.trim();
    }
    if (!/type:\s*(\[?\s*"?string"?)/.test(corpo)) continue;
    if (/\benum:|format:\s*(date|uuid|email|date-time)/.test(corpo)) continue;
    const ml = /maxLength:\s*(\d+)/.exec(corpo);
    out.push({ schema, nome: pm[1]!, corpo, linha: i + 1, maxLength: ml ? Number(ml[1]) : null });
  }
  return out;
}

const classe = (nome: string): "nota" | "frase" | null => (NOTA.test(nome) ? "nota" : FRASE.test(nome) ? "frase" : null);

describe("varredura — o texto livre que entra pela API tem teto, e é um só por campo (S-O109)", () => {
  const spec = readFileSync(SPEC, "utf8");
  const props = propriedadesDeEntrada(spec);
  const livres = props.filter((p) => classe(p.nome) !== null);

  it("lê os schemas de entrada inteiros — 205 strings livres em 2026-08-15, 35 delas de texto", () => {
    expect(props.length, "propriedades string (não enum/data/uuid) dos schemas de entrada").toBeGreaterThanOrEqual(150);
    // Piso da classe: se ele desabar, ou os nomes mudaram de grafia ou o leitor
    // deixou de entrar em `properties:`.
    expect(livres.length, "campos de texto livre").toBeGreaterThanOrEqual(30);
  });

  it("o leitor acha a propriedade plantada e ignora enum, data e id", () => {
    const fonte = [
      "components:",
      "  schemas:",
      "    ProvaInput:",
      "      type: object",
      "      properties:",
      "        observacoes: { type: [\"string\", \"null\"], maxLength: 1000 }",
      "        motivo:",
      "          type: string",
      "          description: sem teto",
      "        status: { type: string, enum: [A, B] }",
      "        vencimento: { type: string, format: date-time }",
      "        leadId: { type: string }",
      "    Prova:",
      "      type: object",
      "      properties:",
      "        motivo: { type: string }",
    ].join("\n");
    const p = propriedadesDeEntrada(fonte);
    expect(p.map((x) => `${x.schema}.${x.nome}`)).toEqual(["ProvaInput.observacoes", "ProvaInput.motivo", "ProvaInput.leadId"]);
    expect(p.find((x) => x.nome === "observacoes")!.maxLength).toBe(1000);
    expect(p.find((x) => x.nome === "motivo")!.maxLength, "o bloco de baixo conta, e não tem teto").toBeNull();
  });

  it("todo campo de texto livre dos schemas de entrada tem maxLength", () => {
    const semTeto = livres.filter((p) => p.maxLength === null).map((p) => `${p.schema}.${p.nome} (openapi.yaml:${p.linha})`);
    expect(
      semTeto,
      "texto livre sem teto: 100 kB de colagem viram linha no banco — ponha `maxLength` (1000 para nota, 300 para frase)",
    ).toEqual([]);
  });

  it("o mesmo campo carrega o mesmo teto em todos os schemas de entrada, e a classe tem dois tetos", () => {
    const porNome = new Map<string, Set<number>>();
    for (const p of livres) {
      if (p.maxLength === null) continue;
      if (!porNome.has(p.nome)) porNome.set(p.nome, new Set());
      porNome.get(p.nome)!.add(p.maxLength);
    }
    const divergentes = [...porNome].filter(([, tetos]) => tetos.size > 1).map(([n, t]) => `${n}: ${[...t].join("/")}`);
    expect(divergentes, "o mesmo campo com dois tetos é a segunda grafia da S-O81 — decida um").toEqual([]);
    const foraDaConta = livres
      .filter((p) => p.maxLength !== null && p.maxLength !== TETO[classe(p.nome)!])
      .map((p) => `${p.schema}.${p.nome} = ${p.maxLength} (esperado ${TETO[classe(p.nome)!]})`);
    expect(foraDaConta, "teto fora da conta — nota é 1000, frase é 300; um terceiro número pede decisão escrita aqui").toEqual([]);
  });
});
