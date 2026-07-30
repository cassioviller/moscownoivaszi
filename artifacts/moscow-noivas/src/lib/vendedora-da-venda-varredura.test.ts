import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * B1/E120 — a varredura que impede a venda de trocar de bolso de novo.
 *
 * O defeito tem uma grafia só e apareceu DUAS vezes: `vendedoraId: user...`
 * num payload de escrita — quem estava logada virava a dona do registro, sem
 * campo nem aviso. O E98 fechou a porta da agenda; a rodada 7 encontrou a
 * MESMA linha na porta que paga comissão (`orcamentos/[id].tsx:595` — num
 * contrato de R$ 4.200,00 a 5%, R$ 210,00 trocavam de bolso em silêncio).
 * Duas ocorrências da mesma classe é o critério da casa para virar régua
 * mecânica: a vendedora de um payload nasce de um SELECT (a dona da venda,
 * escolhida à vista), nunca da sessão de quem clicou.
 *
 * Lição S-D7 aplicada: a busca é no ARQUIVO INTEIRO com `\s*` no meio, não
 * linha a linha — o prettier já escondeu um ofensor quebrando a linha no meio
 * de outra varredura.
 */

const RAIZ = join(import.meta.dirname, "..");

function arquivosFonte(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...arquivosFonte(caminho));
    else if (/\.tsx?$/.test(entrada.name) && !entrada.name.includes(".test.")) {
      achados.push(caminho);
    }
  }
  return achados;
}

describe("varredura: a dona da venda não é quem clicou", () => {
  it("nenhum payload envia vendedoraId lido da sessão (user.id / user!.id)", () => {
    const ofensores: string[] = [];
    for (const arquivo of arquivosFonte(join(RAIZ, "pages"))) {
      const fonte = readFileSync(arquivo, "utf-8")
        // Comentários citam o código errado para explicar o conserto.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      if (/vendedoraId:\s*user\b/.test(fonte)) {
        ofensores.push(relative(RAIZ, arquivo));
      }
    }
    expect(
      ofensores,
      "vendedoraId veio da SESSÃO num payload — a dona da venda se escolhe num select " +
        "(precedentes: E98 na agenda, E120 no contrato)",
    ).toEqual([]);
  });
});
