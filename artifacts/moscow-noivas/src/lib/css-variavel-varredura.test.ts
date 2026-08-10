import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * S19/E104 — a grafia de variável CSS que o Tailwind v4 descarta em silêncio.
 *
 * Na v3, `max-h-[--foo]` era um atalho: o compilador embrulhava a variável em
 * `var()`. Na **v4** esse atalho foi REMOVIDO e substituído por parênteses —
 * `max-h-(--foo)`. A grafia antiga continua compilando, e é isso que a torna
 * cara: ela emite `max-height: --foo`, que não é um valor CSS (é o NOME de uma
 * custom property escrito onde deveria ir um valor). O navegador descarta a
 * declaração inteira, sem aviso, sem erro de build.
 *
 * A prova, lida do bundle entregue antes do conserto:
 *
 *     .h-\[--cell-size\]{height:--cell-size}      ← morta
 *     .\[--cell-size\:2rem\]{--cell-size:2rem}    ← a variável existe, 32px
 *     .min-w-\[8rem\]{min-width:8rem}             ← o compilador está sadio
 *
 * Eram 13 linhas em 6 arquivos. Oito no `calendar.tsx` (as setas de mês ficavam
 * com a largura do ícone, e o `px-` do rótulo era a reserva de espaço para
 * elas), cinco de `origin-*` (cosmético) e — a pior — `combobox-noiva.tsx`, que
 * passava `w-[--radix-popover-trigger-width]` a um popover com base `w-72`: o
 * `tailwind-merge` via dois `w-*`, removia o `w-72`, e a lista de noivas ficava
 * sem regra de largura nenhuma.
 */

/**
 * O que este teste cobre, dito por extenso — a lição do D15, que foi dado por
 * fechado três vezes porque o nome do teste prometia mais do que ele olhava:
 *
 * ✔ cobre: `prefixo-[--variavel]` em qualquer arquivo de `src/`.
 * ✘ NÃO cobre: `prefixo-[var(--variavel)]`, que é VÁLIDO e continua em uso
 *   (`dropdown-menu.tsx` usa a forma longa e funciona).
 * ✘ NÃO cobre: `[--variavel:valor]`, a propriedade arbitrária que DEFINE a
 *   variável — também válida (`calendar.tsx:32` define `[--cell-size:2rem]`).
 * ✘ NÃO cobre: outras baixas da migração v3→v4 que não sejam esta grafia.
 */
const GRAFIA_MORTA = /-\[--[a-z0-9-]+\]/;

const RAIZ = join(import.meta.dirname, "..");

/**
 * Todo `.ts`/`.tsx` de `src/`, menos os próprios testes. A enumeração sai do
 * versionamento, não do disco (S-D30). Caminhos relativos a `src/`.
 */
function fontes(): string[] {
  return arquivosVersionados(RAIZ, ["."]).filter(
    (r) => /\.tsx?$/.test(r) && !/\.test\.tsx?$/.test(r),
  );
}

/**
 * Comentário não é CSS. Sem tirar os comentários, o próprio aviso escrito em
 * `select.tsx` — que explica a grafia morta citando-a — reprovaria o teste, e a
 * saída seria apagar a explicação. Mesma decisão de `datas-varredura.ts`.
 */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("nenhum arquivo de src/ usa a grafia `-[--var]`, que o Tailwind v4 descarta", () => {
  it("varre src/ INTEIRO, e não só components/ui", () => {
    const culpados: string[] = [];
    for (const relativo of fontes()) {
      const linhas = semComentarios(readFileSync(join(RAIZ, relativo), "utf8")).split("\n");
      linhas.forEach((linha, i) => {
        if (GRAFIA_MORTA.test(linha)) {
          culpados.push(`src/${relativo}:${i + 1}`);
        }
      });
    }
    // O `ui/` era onde a sobra mandava varrer, e o pior caso estava fora dele.
    expect(culpados).toEqual([]);
  });

  /**
   * Conjunto vazio aprova tudo em silêncio (S-D31). O piso é o medido em
   * 2026-08-07 — 166 arquivos `.ts`/`.tsx` versionados em `src/`, fora os
   * testes — com folga para baixo.
   */
  it("a varredura olha os arquivos de verdade, não um conjunto vazio", () => {
    expect(fontes().length).toBeGreaterThan(140);
  });

  /**
   * A régua vale nos dois sentidos: se ela só soubesse acusar, um refactor que
   * trocasse tudo por `var()` a deixaria verde por vacuidade.
   */
  it("acusa a grafia morta e ABSOLVE as duas válidas", () => {
    /**
     * Os exemplos são MONTADOS, e isso não é preciosismo.
     *
     * O scanner do Tailwind v4 lê texto cru — não faz parse de TypeScript e não
     * distingue teste de componente. Com o literal escrito por extenso aqui, ele
     * o encontrava e **emitia a classe morta no bundle**: o teste que existe
     * para impedir a grafia era a última fonte dela. Medido: uma ocorrência de
     * `.h-\[--cell-size\]{height:--cell-size}` no CSS entregue, vinda deste
     * arquivo e de nenhum outro. Concatenar basta para o scanner não casar.
     */
    const morta = (prefixo: string, v: string) => `className="${prefixo}-[` + `${v}]"`;
    const viva = (prefixo: string, v: string) => `className="${prefixo}-(` + `${v})"`;

    expect(GRAFIA_MORTA.test(morta("max-h", "--radix-popper-available-height"))).toBe(true);
    expect(GRAFIA_MORTA.test(morta("h", "--cell-size"))).toBe(true);

    // Forma longa: válida, em uso hoje.
    expect(GRAFIA_MORTA.test('className="max-h-[' + 'var(--radix-x)]"')).toBe(false);
    // Forma nova da v4: o destino do conserto.
    expect(GRAFIA_MORTA.test(viva("max-h", "--radix-x"))).toBe(false);
    // Propriedade arbitrária que DEFINE a variável.
    expect(GRAFIA_MORTA.test('className="p-3 [' + '--cell-size:2rem]"')).toBe(false);
    // Valor arbitrário comum, sem variável.
    expect(GRAFIA_MORTA.test('className="min-w-[8rem] aspect-[3/4]"')).toBe(false);
  });
});
