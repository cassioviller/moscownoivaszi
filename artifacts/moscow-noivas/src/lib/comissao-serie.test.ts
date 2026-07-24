import { describe, expect, it } from "vitest";
import type { ComissaoFechamento } from "@workspace/api-client-react";
import { serieDeComissao } from "./comissao-serie";

/**
 * E52 — o custo de comissão como linha do tempo. A agregação é trivial; o que
 * precisa de prova é a taxa efetiva do período, que tem uma armadilha
 * estatística, e a decisão de NÃO inventar meses zerados.
 */

function fechamento(over: Partial<ComissaoFechamento> = {}): ComissaoFechamento {
  return {
    id: "f1",
    lojaId: "loja",
    vendedoraId: "v1",
    competencia: "2026-07",
    totalVendas: 100_000,
    percentualAplicado: 5,
    valorComissao: 5_000,
    valorBonus: 0,
    valorTotal: 5_000,
    fechadoEm: "2026-08-01T12:00:00.000Z",
    ...over,
  } as ComissaoFechamento;
}

describe("serieDeComissao", () => {
  it("soma as vendedoras dentro da competência", () => {
    const s = serieDeComissao(
      [
        fechamento({ id: "a", vendedoraId: "v1", totalVendas: 60_000, valorTotal: 3_000 }),
        fechamento({ id: "b", vendedoraId: "v2", totalVendas: 40_000, valorTotal: 2_800 }),
      ],
      { meses: 12 },
    );

    expect(s.pontos).toHaveLength(1);
    expect(s.pontos[0]).toMatchObject({
      competencia: "2026-07",
      totalVendas: 100_000,
      custoComissao: 5_800,
      vendedoras: 2,
      taxaEfetiva: 5.8,
    });
  });

  it("ordena da competência mais antiga para a mais recente", () => {
    const s = serieDeComissao(
      [
        fechamento({ id: "c", competencia: "2026-09" }),
        fechamento({ id: "a", competencia: "2026-07" }),
        fechamento({ id: "b", competencia: "2026-08" }),
      ],
      { meses: 12 },
    );
    expect(s.pontos.map((p) => p.competencia)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("corta pelas mais RECENTES, mantendo a ordem cronológica", () => {
    const s = serieDeComissao(
      ["2026-05", "2026-06", "2026-07", "2026-08"].map((competencia, i) =>
        fechamento({ id: `f${i}`, competencia }),
      ),
      { meses: 2 },
    );
    expect(s.pontos.map((p) => p.competencia)).toEqual(["2026-07", "2026-08"]);
  });

  it("a taxa do período é SUM(comissão)/SUM(vendas), não a média das taxas", () => {
    // Mês pequeno com taxa altíssima + mês grande com taxa baixa. A média
    // simples das taxas daria (50 + 4)/2 = 27% e diria ao dono que a comissão
    // come um quarto do faturamento — quando come 4,4%.
    const s = serieDeComissao(
      [
        fechamento({ id: "a", competencia: "2026-06", totalVendas: 2_000, valorTotal: 1_000 }),
        fechamento({ id: "b", competencia: "2026-07", totalVendas: 200_000, valorTotal: 8_000 }),
      ],
      { meses: 12 },
    );

    expect(s.pontos.map((p) => p.taxaEfetiva)).toEqual([50, 4]);
    expect(s.totalVendas).toBe(202_000);
    expect(s.custoTotal).toBe(9_000);
    expect(s.taxaEfetivaMedia).toBe(4.5); // 9.000 / 202.000
  });

  it("mês sem fechamento NÃO entra zerado — ele não custou zero, só não foi apurado", () => {
    const s = serieDeComissao(
      [
        fechamento({ id: "a", competencia: "2026-05" }),
        // 2026-06 não fechou
        fechamento({ id: "b", competencia: "2026-07" }),
      ],
      { meses: 12 },
    );
    // Zerar junho faria o dono ler "esse mês não me custou nada".
    expect(s.pontos.map((p) => p.competencia)).toEqual(["2026-05", "2026-07"]);
  });

  it("competência sem venda não tem taxa — e taxa nenhuma não é taxa zero", () => {
    const s = serieDeComissao(
      [fechamento({ totalVendas: 0, valorComissao: 0, valorBonus: 500, valorTotal: 500 })],
      { meses: 12 },
    );
    // Bônus sem venda existe (faixa que só paga bônus); dividir por zero não.
    expect(s.pontos[0].taxaEfetiva).toBeNull();
    expect(s.taxaEfetivaMedia).toBeNull();
    expect(s.custoTotal).toBe(500);
  });

  it("sem fechamento nenhum, a série é vazia", () => {
    const s = serieDeComissao([], { meses: 12 });
    expect(s).toEqual({ pontos: [], totalVendas: 0, custoTotal: 0, taxaEfetivaMedia: null });
  });

  it("soma em centavos: o float erraria o total", () => {
    const s = serieDeComissao(
      [
        fechamento({ id: "a", competencia: "2026-07", totalVendas: 0.1, valorTotal: 0.1 }),
        fechamento({ id: "b", competencia: "2026-07", totalVendas: 0.2, valorTotal: 0.2 }),
      ],
      { meses: 12 },
    );
    expect(s.pontos[0].totalVendas).toBe(0.3); // 0.1 + 0.2 em float = 0.30000000000000004
  });
});
