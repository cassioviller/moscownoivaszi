import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";
import { MARCA_DO_IPCA_DE_EXEMPLO } from "../lib/configuracao-inicial";

/**
 * **E250 — duas réguas sobre `docs/migracoes/`, as duas nascidas de um defeito
 * medido no mesmo dia.**
 *
 * ## 1. A migração não casa tabela por-loja com VÍRGULA (S-R9)
 *
 * O backfill da S-A27 (`2026-08-16-s-a27-tipo-de-peca-do-legado.sql`)
 * selecionava o atributo *Tipo de peça* sem `loja_id` e casava as duas CTEs
 * com `FROM alvo, tipo` — produto cartesiano. Numa loja só, `tipo` tem uma
 * linha e o cartesiano é a identidade; **em duas lojas ele escreve 264 linhas
 * onde deviam ser 132**, metade classificando a peça de uma loja com o
 * atributo da outra. E a guarda de idempotência, cega da mesma forma, lê tudo
 * como "já classificado" na segunda execução e não repara nada.
 *
 * O dev tem duas "Moscow Noivas" desde a S-O144 e o `moscow_base` tem uma —
 * então o defeito rodou certo onde foi executado e ficaria armado para a
 * instalação real, que é multi-loja por construção.
 *
 * **A régua é sobre a FORMA, não sobre o alvo**: junção por vírgula num
 * arquivo que escreve dado. É a única grafia em que o cartesiano não aparece
 * escrito — `JOIN … ON` obriga quem escreve a dizer por onde casa, e é aí que
 * o `loja_id` esquecido vira erro de sintaxe em vez de linha a mais.
 *
 * ## 2. A marca do índice de exemplo é uma só (S-R5)
 *
 * A faxina do E250 acha as linhas do seed por uma FRASE
 * (`MARCA_DO_IPCA_DE_EXEMPLO`). Se alguém editar a frase no seed e não no SQL,
 * o `DELETE` deixa de casar e **não avisa**: ele apaga zero linhas com sucesso,
 * e a instalação segue imprimindo correção inventada. É a classe da regra 26 —
 * o mesmo texto escrito em dois lugares, preso por nada.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

const MIGRACOES = arquivosVersionados(RAIZ, ["docs/migracoes"])
  .filter((f) => f.endsWith(".sql"))
  .sort();

const ler = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

/** Tira comentários (`--` e `/* *\/`) e literais de texto, que podem conter vírgulas. */
function soOCodigo(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .replace(/'[^']*'/g, "''");
}

/** Sentença de escrita de DADO — a mesma leitura da varredura do banco virgem. */
const ESCREVE_DADO = /^\s*(update|insert\s+into|delete\s+from)\s/im;

/**
 * `FROM a, b` — a junção por vírgula. Só na cláusula FROM, e só entre dois
 * NOMES: `FROM (SELECT …), x` e listas de colunas não passam por aqui, e
 * `EXTRACT(… FROM x)` também não, porque exige a vírgula depois do nome.
 */
const JUNCAO_POR_VIRGULA = /\bfrom\s+([a-z_][a-z0-9_]*)\s*(?:\s+as\s+[a-z_][a-z0-9_]*)?\s*,\s*([a-z_][a-z0-9_]*)\b/gi;

describe("varredura — a migração diz por onde casa, e a marca da faxina é uma só", () => {
  it("a população não encolheu: há migrações versionadas para varrer", () => {
    // A régua do E247/G5 na letra: varredura que examina zero arquivos passa
    // por não ter olhado. O piso é folgado de propósito — ele existe para
    // pegar o dia em que o diretório muda de nome, não para travar a conta.
    expect(MIGRACOES.length).toBeGreaterThan(50);
  });

  it("nenhuma migração que escreve dado casa tabelas por VÍRGULA (S-R9)", () => {
    const ofensores: string[] = [];
    for (const rel of MIGRACOES) {
      const codigo = soOCodigo(ler(rel));
      if (!ESCREVE_DADO.test(codigo)) continue;
      for (const m of codigo.matchAll(JUNCAO_POR_VIRGULA)) {
        ofensores.push(`${rel} — FROM ${m[1]}, ${m[2]}`);
      }
    }
    expect(
      ofensores,
      "junção por vírgula numa migração que escreve dado — é a única grafia em que o " +
        "produto cartesiano não aparece escrito, e num banco de duas lojas ele dobra o " +
        `backfill (S-R9: 264 linhas onde deviam ser 132):\n${ofensores.join("\n")}`,
    ).toEqual([]);
  });

  it("a marca do IPCA de exemplo é a MESMA no seed e na faxina (S-R5)", () => {
    const faxina = "docs/migracoes/2026-08-17-e250-ipca-de-exemplo-sai.sql";
    expect(MIGRACOES, "a migração de faxina do E250 saiu do repositório").toContain(faxina);
    expect(
      ler(faxina).includes(`'${MARCA_DO_IPCA_DE_EXEMPLO}'`),
      "a frase que o seed grava e a que o DELETE procura divergiram — a faxina apaga " +
        "ZERO linhas com sucesso, e a instalação segue imprimindo correção inventada como fato",
    ).toBe(true);
  });
});
