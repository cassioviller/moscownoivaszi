import { describe, expect, it } from "vitest";
import { liquidoEmCentavos, centavos } from "@workspace/financeiro-core";

/**
 * E95/C1 — o líquido do orçamento tinha DUAS fórmulas: `liquidoEmCentavos` em
 * centavos inteiros (o validador do `POST /contratos`) e `round2(bruto * (1 −
 * v/100))` em reais float (a rota de orçamento, a visão da noiva e a tela).
 *
 * São algebricamente iguais e numericamente diferentes: quando o resultado cai
 * exatamente em meio centavo, o caminho float chega ali por baixo (`…4999999`)
 * e arredonda para o outro lado. A vendedora recebia um 422
 * `VALOR_TOTAL_NAO_BATE` que não tinha como destravar pela tela — o número que
 * ela via era o único que o servidor NÃO aceitava.
 *
 * Este arquivo fixa a régua ÚNICA, em centavos. Os dois exemplos numéricos são
 * os que a trilha C mediu.
 */

/** A fórmula float que estava em orcamentos.ts, visao-noiva.ts e na tela. */
const round2 = (v: number): number => Math.round(v * 100) / 100;
function liquidoFloat(bruto: number, tipo: string | null, valor: number | null): number {
  if (!tipo || !valor) return bruto;
  if (tipo === "PERCENTUAL") return round2(bruto * (1 - valor / 100));
  return Math.max(0, round2(bruto - valor));
}

describe("liquidoEmCentavos — a régua única do líquido (C1)", () => {
  it("R$ 1.000,50 com 5% dá R$ 950,48 — a fórmula float dava 950,47", () => {
    expect(liquidoEmCentavos(centavos(1000.5), "PERCENTUAL", 5)).toBe(95048);
    // A prova de que o épico existe: as duas discordam neste caso.
    expect(centavos(liquidoFloat(1000.5, "PERCENTUAL", 5))).toBe(95047);
  });

  it("R$ 1.051,00 com 2,5% dá R$ 1.024,73 — a fórmula float dava 1.024,72", () => {
    expect(liquidoEmCentavos(centavos(1051), "PERCENTUAL", 2.5)).toBe(102473);
    expect(centavos(liquidoFloat(1051, "PERCENTUAL", 2.5))).toBe(102472);
  });

  it("desconto em VALOR subtrai em centavos e nunca fica negativo", () => {
    expect(liquidoEmCentavos(centavos(1000.5), "VALOR", 100.55)).toBe(89995);
    expect(liquidoEmCentavos(centavos(50), "VALOR", 80)).toBe(0);
  });

  it("sem desconto, o líquido é o bruto — inclusive com valor 0 ou tipo nulo", () => {
    expect(liquidoEmCentavos(95047, null, null)).toBe(95047);
    expect(liquidoEmCentavos(95047, "PERCENTUAL", 0)).toBe(95047);
    expect(liquidoEmCentavos(95047, "PERCENTUAL", null)).toBe(95047);
  });

  it("100% de desconto zera, e o resultado é sempre inteiro", () => {
    expect(liquidoEmCentavos(centavos(1000.5), "PERCENTUAL", 100)).toBe(0);
    for (const bruto of [1, 33, 99, 100_003, 7_777_777]) {
      for (const pct of [1, 2.5, 5, 7.5, 13, 33.33]) {
        expect(Number.isInteger(liquidoEmCentavos(bruto, "PERCENTUAL", pct))).toBe(true);
      }
    }
  });
});
