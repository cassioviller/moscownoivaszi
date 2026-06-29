import { describe, it, expect } from "vitest";
import { totalDoPlanoCentavos, planoDivergeDoTotal, montarPlano } from "@/lib/financeiro/plano";

describe("totalDoPlanoCentavos", () => {
  it("soma os valores em centavos", () => {
    expect(totalDoPlanoCentavos(["400.00", "600.00"])).toBe(100000);
    expect(totalDoPlanoCentavos([])).toBe(0);
  });
});

describe("planoDivergeDoTotal", () => {
  it("sem parcelas → false (não há plano para divergir)", () => {
    expect(planoDivergeDoTotal("1000.00", [])).toBe(false);
  });
  it("soma das parcelas bate com o total → false", () => {
    expect(planoDivergeDoTotal("1000.00", ["400.00", "600.00"])).toBe(false);
  });
  it("soma das parcelas difere do total → true", () => {
    expect(planoDivergeDoTotal("1000.00", ["400.00", "500.00"])).toBe(true);
    expect(planoDivergeDoTotal("1300.00", ["200.00", "400.00", "400.00"])).toBe(true);
  });
});

describe("montarPlano", () => {
  it("entrada + N parcelas somam o total; última absorve o resto", () => {
    const r = montarPlano(100_00, { entrada: "40,00", numParcelas: 3, primeiroVencimento: "2026-07-10" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas).toHaveLength(4); // entrada (0) + 3
    expect(r.linhas[0]).toMatchObject({ numero: 0, descricao: "Entrada", valor: 40_00 });
    expect(r.linhas[0].vencimento.toISOString().slice(0, 10)).toBe("2026-07-10");
    const soma = r.linhas.reduce((s, l) => s + l.valor, 0);
    expect(soma).toBe(100_00);
    expect(r.linhas.slice(1).map((l) => l.valor)).toEqual([20_00, 20_00, 20_00]);
  });

  it("sem entrada: só N parcelas, última absorve o resto da divisão", () => {
    const r = montarPlano(100_00, { numParcelas: 3, primeiroVencimento: "2026-07-10" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas).toHaveLength(3);
    expect(r.linhas.map((l) => l.valor)).toEqual([33_33, 33_33, 33_34]);
    expect(r.linhas[0].numero).toBe(1);
  });

  it("vencimentos avançam de 30 em 30 dias a partir do primeiro", () => {
    const r = montarPlano(90_00, { numParcelas: 2, primeiroVencimento: "2026-07-10" });
    if (!r.ok) throw new Error("esperava ok");
    expect(r.linhas[0].vencimento.toISOString().slice(0, 10)).toBe("2026-07-10");
    expect(r.linhas[1].vencimento.toISOString().slice(0, 10)).toBe("2026-08-09");
  });

  it("rejeita nº de parcelas fora de 1..360", () => {
    expect(montarPlano(100_00, { numParcelas: 0, primeiroVencimento: "2026-07-10" })).toEqual({ ok: false, motivo: "num_invalido" });
    expect(montarPlano(100_00, { numParcelas: 361, primeiroVencimento: "2026-07-10" })).toEqual({ ok: false, motivo: "num_invalido" });
  });

  it("rejeita data impossível", () => {
    expect(montarPlano(100_00, { numParcelas: 2, primeiroVencimento: "2027-02-30" })).toEqual({ ok: false, motivo: "data_invalida" });
  });

  it("rejeita entrada maior ou igual ao total", () => {
    expect(montarPlano(100_00, { entrada: "200,00", numParcelas: 2, primeiroVencimento: "2026-07-10" })).toEqual({ ok: false, motivo: "entrada_maior" });
    expect(montarPlano(100_00, { entrada: "100,00", numParcelas: 2, primeiroVencimento: "2026-07-10" })).toEqual({ ok: false, motivo: "entrada_maior" });
  });

  it("rejeita valor não-parseável", () => {
    expect(montarPlano(100_00, { entrada: "abc", numParcelas: 2, primeiroVencimento: "2026-07-10" })).toEqual({ ok: false, motivo: "valor_invalido" });
  });

  it("n=1: parcela única recebe o total", () => {
    const r = montarPlano(100_00, { numParcelas: 1, primeiroVencimento: "2026-07-10" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ numero: 1, valor: 100_00 });
    expect(r.linhas[0].vencimento.toISOString().slice(0, 10)).toBe("2026-07-10");
  });

  it("n=1 com entrada: entrada no dia 0, parcela única no dia 30", () => {
    const r = montarPlano(100_00, { entrada: "30,00", numParcelas: 1, primeiroVencimento: "2026-07-10" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toMatchObject({ numero: 0, descricao: "Entrada", valor: 30_00 });
    expect(r.linhas[0].vencimento.toISOString().slice(0, 10)).toBe("2026-07-10");
    expect(r.linhas[1]).toMatchObject({ numero: 1, valor: 70_00 });
    expect(r.linhas[1].vencimento.toISOString().slice(0, 10)).toBe("2026-08-09");
  });
});
