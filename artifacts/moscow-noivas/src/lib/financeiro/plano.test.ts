import { describe, expect, it } from "vitest";
import { montarPlanoParcelas, ratearRestante } from "./plano";
import { centavos } from "./dinheiro";

/**
 * E95 — o carnê, provado pela borda da TELA.
 *
 * O rateio já tinha prova de propriedade no servidor (`lote25`), e não era
 * disso que o sistema padecia: a tela nunca chamava aquela função. Ela montava
 * o plano com uma conta própria, em reais float, e 1,77% dos carnês saíam
 * diferentes do que o servidor teria gerado — em silêncio, porque a soma
 * sempre fecha e a guarda `PARCELAS_NAO_BATEM` nunca dispara.
 *
 * Agora é a MESMA função dos dois lados, e a prova vale para o caller da tela.
 */
describe("o plano da tela é o plano do servidor", () => {
  it("R$ 1.282,00 em 10x: dez de R$ 128,20 — a conta antiga dava 128,19 ×9 + 128,29", () => {
    const plano = montarPlanoParcelas({
      totalCentavos: centavos(1282),
      numParcelas: 10,
      primeiroVencimento: "2026-08-10",
    });
    expect(plano.map((p) => p.valorCentavos)).toEqual(Array(10).fill(12820));

    // A conta que a tela fazia, reproduzida aqui para que a diferença fique
    // registrada e não volte por descuido.
    const base = Math.floor((1282 / 10) * 100) / 100;
    expect(base).toBe(128.19);
  });

  /**
   * A prova de PROPRIEDADE (fast-check, milhares de casos) vive no servidor,
   * em `lote25-rateio-parcelas-unit`, e desde o E95 ela roda sobre esta mesma
   * função do core — então ela já cobre o caller da tela. Aqui ficam os casos
   * que doem na venda real: divisão inexata, entrada quebrada, 1 parcela.
   */
  it("a soma é exatamente o total, inclusive quando a divisão não fecha", () => {
    const casos = [
      { total: 948055, entrada: 200000, n: 6 },
      { total: 100000, entrada: 0, n: 3 },
      { total: 100003, entrada: 33333, n: 7 },
      { total: 1, entrada: 0, n: 1 },
      { total: 999999, entrada: 999998, n: 1 },
      { total: 5000000, entrada: 123456, n: 360 },
    ];
    for (const c of casos) {
      const plano = montarPlanoParcelas({
        totalCentavos: c.total,
        entradaCentavos: c.entrada,
        numParcelas: c.n,
        primeiroVencimento: "2026-08-10",
        vencimentoEntrada: "2026-07-27",
      });
      expect(plano.reduce((s, p) => s + p.valorCentavos, 0)).toBe(c.total);
      for (const p of plano) expect(p.valorCentavos).toBeGreaterThanOrEqual(0);
    }
  });

  it("o dia do vencimento se repete todo mês — é o carnê que a loja combina", () => {
    const plano = montarPlanoParcelas({
      totalCentavos: 120000,
      numParcelas: 12,
      primeiroVencimento: "2026-08-05",
    });
    for (const p of plano) expect(p.vencimento.slice(8, 10)).toBe("05");
    expect(plano[11].vencimento).toBe("2027-07-05");
  });

  it("o rateio exportado é o mesmo do servidor", () => {
    expect(ratearRestante(10000, 3)).toEqual([3333, 3333, 3334]);
  });
});
