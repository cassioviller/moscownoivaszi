import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * **S-C30 — o espaço duro do `brl` se escreve ESCAPADO no código.**
 *
 * `brl()` põe um NBSP (U+00A0) entre o `R$` e o número desde o E92 — é o que
 * impede o navegador de quebrar a linha ali. Quem prega esse texto num teste
 * precisa do mesmo caractere, e há duas formas de escrevê-lo: o LITERAL, que é
 * invisível na tela do editor, e o escapado `\u00a0`, que se lê.
 *
 * O literal tem dois modos de falha, e o primeiro é o caro:
 *
 * 1. **Silencioso.** Numa NORMALIZAÇÃO — `.replace(/<nbsp>/g, " ")` — um editor
 *    ou um formatador que troque espaços exóticos por espaço comum desliga a
 *    normalização sem mudar uma linha visível do diff: o `replace` passa a
 *    procurar o espaço que já está lá, não acha nada, e o golden test volta a
 *    comparar bytes de codificação em vez de texto lido por gente. Ele continua
 *    VERDE enquanto não tiver mais nada a provar. Foi assim que a régua do E165
 *    (`e165-pdf-fala-a-verdade.test.ts:19`) passou a carregar um caractere que
 *    ninguém enxergava.
 * 2. **Ilegível.** Num assert, a mesma troca faz o teste falhar exibindo duas
 *    strings visualmente IDÊNTICAS — `expected 'R$ 500,00' to be 'R$ 500,00'` —,
 *    que é o pior vermelho possível: o que não diz o que está errado.
 *
 * A régua é uma só e não tem exceção declarada: **nenhum arquivo `.ts`/`.tsx`
 * versionado carrega U+00A0 literal**. Em prosa de documentação (`.md`) ele
 * continua livre — lá o caractere é texto, não código.
 *
 * Medido no fecho da S-C30: **9 ocorrências em 6 arquivos** — 2 em regex de
 * normalização (`e165-pdf-fala-a-verdade.test.ts`, `avaria.test.ts`) e 7 em
 * literais de frase (`atraso.test.ts`, `mora.test.ts`, `auditoria.test.ts` ×3,
 * `reserva.test.ts`). Três delas moravam sob um comentário que AFIRMAVA o
 * escape.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

/** O caractere procurado, escrito escapado — a régua obedece a si mesma. */
const ESPACO_DURO = "\u00a0";

/**
 * Todo código versionado, e a enumeração sai do `git ls-files` (S38): o disco
 * guarda worktree órfão e `dist/`, e uma varredura que lê o disco mede 65% de
 * cópia. `lib/` entra porque `financeiro-core` é onde o `brl` mora.
 */
function arquivosDeCodigo(): string[] {
  return arquivosVersionados(RAIZ, ["artifacts", "lib", "e2e", "scripts"]).filter((relativo) =>
    /\.tsx?$/.test(relativo),
  );
}

describe("varredura — o espaço duro (U+00A0) nunca é literal no código", () => {
  it("nenhum `.ts`/`.tsx` versionado carrega o caractere invisível", () => {
    const arquivos = arquivosDeCodigo();
    // Piso de população: conjunto vazio aprovaria em silêncio, que é a falha
    // mais cara possível numa sonda — verde por não ter olhado nada.
    expect(arquivos.length).toBeGreaterThan(800);

    const achados: string[] = [];
    for (const relativo of arquivos) {
      const linhas = readFileSync(join(RAIZ, relativo), "utf8").split("\n");
      linhas.forEach((linha, i) => {
        if (!linha.includes(ESPACO_DURO)) return;
        achados.push(
          `${relativo}:${i + 1} — ${linha.trim().replace(new RegExp(ESPACO_DURO, "g"), "␠")}`,
        );
      });
    }

    expect(
      achados,
      `U+00A0 LITERAL no código. Escreva-o \`\\u00a0\`: assim ele sobrevive a um editor ` +
        `que normalize espaços, e quem lê o arquivo enxerga o caractere.\n${achados.join("\n")}`,
    ).toEqual([]);
  });
});
