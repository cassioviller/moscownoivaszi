import { describe, expect, it } from "vitest";
import { avisoDaClausula12, pecasSobAClausula12 } from "./peca-exclusiva";

/**
 * E216 — o que a vendedora vê ANTES de montar o contrato com uma peça exclusiva.
 *
 * O molde é o do E211: a régua é a do `financeiro-core`; o que a tela acrescenta
 * é só saber **qual peça perguntar** — as do acervo que estão neste orçamento.
 */
const exclusiva = { id: "v1", codigo: "EX-01", nome: "Exclusivo da Marina", exclusiva: true };
const comum = { id: "v2", codigo: "VT-09", nome: "Sereia", exclusiva: false };

function mapa(...pecas: typeof exclusiva[]) {
  return new Map(pecas.map((p) => [p.id, p]));
}

describe("E216 — as peças sob a cláusula 12ª neste orçamento", () => {
  it("a peça exclusiva que nunca saiu aparece, e o item avulso não confunde", () => {
    const achadas = pecasSobAClausula12({
      itens: [
        { vestidoId: "v1" },
        { vestidoId: "v2" },
        // Item digitado à mão, sem peça do acervo — não há o que consultar.
        { vestidoId: null },
      ],
      vestidoPorId: mapa(exclusiva, comum),
      locacoesPorVestido: new Map(),
    });

    expect(achadas.map((p) => p.codigo)).toEqual(["EX-01"]);
  });

  it("a peça exclusiva que já saiu uma vez NÃO aparece — o estado expirou", () => {
    const achadas = pecasSobAClausula12({
      itens: [{ vestidoId: "v1" }],
      vestidoPorId: mapa(exclusiva),
      locacoesPorVestido: new Map([["v1", 1]]),
    });

    expect(achadas).toEqual([]);
  });

  it("a mesma peça em dois itens do orçamento é avisada UMA vez", () => {
    const achadas = pecasSobAClausula12({
      itens: [
        { vestidoId: "v1" },
        { vestidoId: "v1" },
      ],
      vestidoPorId: mapa(exclusiva),
      locacoesPorVestido: new Map(),
    });

    expect(achadas).toHaveLength(1);
  });

  it("sem peça sob a cláusula não há aviso — e é o caso da esmagadora maioria", () => {
    expect(avisoDaClausula12([])).toBeNull();
  });

  it("o aviso NOMEIA a peça e diz o que a rescisão custa", () => {
    const frase = avisoDaClausula12([exclusiva]);
    expect(frase).toContain("EX-01");
    expect(frase).toContain("Exclusivo da Marina");
    expect(frase).toContain("integral");
    expect(frase).toContain("12ª");
  });

  it("com duas peças o aviso continua uma frase só, com as duas nomeadas", () => {
    const frase = avisoDaClausula12([exclusiva, { ...exclusiva, id: "v3", codigo: "EX-02", nome: "Véu da Marina" }]);
    expect(frase).toContain("EX-01");
    expect(frase).toContain("EX-02");
  });
});
