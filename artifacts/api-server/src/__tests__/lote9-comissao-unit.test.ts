import { describe, expect, it } from "vitest";
import {
  percentualParaTotal,
  calcularComissao,
  limitesCompetencia,
  vencimentoComissao,
} from "../lib/comissao";

const FAIXAS = [
  { minimoVenda: 5000, percentual: 5 },
  { minimoVenda: 10000, percentual: 8 },
  { minimoVenda: 20000, percentual: 10 },
];

describe("Lote 9 — cálculo de comissão (puro)", () => {
  describe("percentualParaTotal (percentual sobre o total)", () => {
    it("abaixo de todas as faixas → 0%", () => {
      expect(percentualParaTotal(4999.99, FAIXAS)).toBe(0);
      expect(percentualParaTotal(0, FAIXAS)).toBe(0);
    });

    it("borda exata entra na faixa", () => {
      expect(percentualParaTotal(5000, FAIXAS)).toBe(5);
      expect(percentualParaTotal(10000, FAIXAS)).toBe(8);
    });

    it("maior faixa atingida vence, independente da ordem do array", () => {
      expect(percentualParaTotal(15000, FAIXAS)).toBe(8);
      expect(percentualParaTotal(25000, [...FAIXAS].reverse())).toBe(10);
    });

    it("sem faixas → 0%", () => {
      expect(percentualParaTotal(50000, [])).toBe(0);
    });
  });

  describe("calcularComissao", () => {
    it("aplica o percentual da faixa ao TOTAL (não progressivo)", () => {
      const r = calcularComissao({ vendasBrutas: 10000, estornos: 0, faixas: FAIXAS });
      expect(r).toEqual({ totalVendas: 10000, percentualAplicado: 8, comissaoValor: 800 });
    });

    it("estorno reduz a base e pode rebaixar a faixa", () => {
      // 12000 − 3000 = 9000 → cai da faixa de 8% para a de 5%.
      const r = calcularComissao({ vendasBrutas: 12000, estornos: 3000, faixas: FAIXAS });
      expect(r).toEqual({ totalVendas: 9000, percentualAplicado: 5, comissaoValor: 450 });
    });

    it("base líquida ≤ 0 → comissão 0 (sem comissão negativa)", () => {
      const r = calcularComissao({ vendasBrutas: 4000, estornos: 9000, faixas: FAIXAS });
      expect(r.totalVendas).toBe(-5000);
      expect(r.comissaoValor).toBe(0);
      expect(r.percentualAplicado).toBe(0);
    });

    it("arredonda para centavos", () => {
      // 5000.33 × 3.33% = 166.510989… → 166.51
      const r = calcularComissao({ vendasBrutas: 5000.33, estornos: 0, faixas: [{ minimoVenda: 0, percentual: 3.33 }] });
      expect(r.comissaoValor).toBe(166.51);
    });
  });

  describe("competência", () => {
    it("limites em América/São Paulo, fim exclusivo", () => {
      const { inicio, fim } = limitesCompetencia("2027-03");
      expect(inicio.toISOString()).toBe("2027-03-01T03:00:00.000Z");
      expect(fim.toISOString()).toBe("2027-04-01T03:00:00.000Z");
    });

    it("virada de ano", () => {
      const { fim } = limitesCompetencia("2027-12");
      expect(fim.toISOString()).toBe("2028-01-01T03:00:00.000Z");
    });

    it("vencimento = dia 5 do mês seguinte", () => {
      expect(vencimentoComissao("2027-03").toISOString()).toBe("2027-04-05T15:00:00.000Z");
      expect(vencimentoComissao("2027-12").toISOString()).toBe("2028-01-05T15:00:00.000Z");
    });
  });
});
