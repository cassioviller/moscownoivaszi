// Núcleo PURO do motor de comissão (S6) — sem banco. Aplica faixas sobre o acumulado.
import { describe, it, expect } from "vitest";
import { calcularComissao, validarFaixas, type FaixaCalc } from "@/lib/financeiro/comissao";

const R = (reais: number) => Math.round(reais * 100); // reais → centavos

// Faixas típicas: 3% até 30k, 5% até 60k, 7% acima.
const escada: FaixaCalc[] = [
  { minAcumulado: R(0), maxAcumulado: R(30000), percentual: 3, bonusFixo: null },
  { minAcumulado: R(30000), maxAcumulado: R(60000), percentual: 5, bonusFixo: null },
  { minAcumulado: R(60000), maxAcumulado: null, percentual: 7, bonusFixo: null },
];

describe("calcularComissao: faixa retroativa", () => {
  it("a faixa final manda no mês inteiro (50k → 5% sobre 50k)", () => {
    const r = calcularComissao(R(50000), escada, false);
    expect(r.percentualAplicado).toBe(5);
    expect(r.valorComissao).toBe(R(2500)); // 50000 * 5%
    expect(r.valorBonus).toBe(0);
    expect(r.valorTotal).toBe(R(2500));
    expect(r.faixaIndex).toBe(1);
  });

  it("borda exata cai na faixa de cima (30k → 5%, não 3%)", () => {
    const r = calcularComissao(R(30000), escada, false);
    expect(r.percentualAplicado).toBe(5);
    expect(r.valorComissao).toBe(R(1500)); // 30000 * 5%
  });

  it("topo aberto (100k → 7%)", () => {
    const r = calcularComissao(R(100000), escada, false);
    expect(r.percentualAplicado).toBe(7);
    expect(r.valorComissao).toBe(R(7000));
  });
});

describe("calcularComissao: % e bônus", () => {
  it("faixa só-%: sem bônus", () => {
    const faixas: FaixaCalc[] = [{ minAcumulado: 0, maxAcumulado: null, percentual: 4, bonusFixo: null }];
    const r = calcularComissao(R(10000), faixas, false);
    expect(r.valorComissao).toBe(R(400));
    expect(r.valorBonus).toBe(0);
  });

  it("faixa só-bônus: sem comissão %", () => {
    const faixas: FaixaCalc[] = [{ minAcumulado: 0, maxAcumulado: null, percentual: null, bonusFixo: R(200) }];
    const r = calcularComissao(R(10000), faixas, false);
    expect(r.percentualAplicado).toBeNull();
    expect(r.valorComissao).toBe(0);
    expect(r.valorBonus).toBe(R(200));
    expect(r.valorTotal).toBe(R(200));
  });

  it("faixa com % e bônus soma os dois", () => {
    const faixas: FaixaCalc[] = [{ minAcumulado: 0, maxAcumulado: null, percentual: 5, bonusFixo: R(300) }];
    const r = calcularComissao(R(10000), faixas, false);
    expect(r.valorComissao).toBe(R(500));
    expect(r.valorBonus).toBe(R(300));
    expect(r.valorTotal).toBe(R(800));
  });

  it("bonusAcumulaFaixas: soma bônus de cada faixa atingida × só a final", () => {
    const faixas: FaixaCalc[] = [
      { minAcumulado: R(0), maxAcumulado: R(30000), percentual: 3, bonusFixo: R(100) },
      { minAcumulado: R(30000), maxAcumulado: R(60000), percentual: 5, bonusFixo: R(200) },
    ];
    const off = calcularComissao(R(50000), faixas, false);
    expect(off.valorBonus).toBe(R(200)); // só a faixa final
    expect(off.valorTotal).toBe(R(2700)); // 2500 + 200

    const on = calcularComissao(R(50000), faixas, true);
    expect(on.valorBonus).toBe(R(300)); // 100 (faixa 1) + 200 (faixa 2)
    expect(on.valorTotal).toBe(R(2800)); // 2500 + 300
  });
});

describe("calcularComissao: bordas e degenerados", () => {
  it("sem faixas → tudo zero", () => {
    const r = calcularComissao(R(50000), [], false);
    expect(r).toMatchObject({ faixaIndex: null, percentualAplicado: null, valorComissao: 0, valorBonus: 0, valorTotal: 0 });
  });

  it("acumulado abaixo da menor faixa (buraco) → zero", () => {
    const faixas: FaixaCalc[] = [{ minAcumulado: R(10000), maxAcumulado: null, percentual: 5, bonusFixo: R(50) }];
    const r = calcularComissao(R(5000), faixas, false);
    expect(r.valorTotal).toBe(0);
    expect(r.valorBonus).toBe(0);
  });

  it("acumulado 0 ou negativo (estorno §6.4) → zero, sem bônus", () => {
    const faixas: FaixaCalc[] = [{ minAcumulado: 0, maxAcumulado: null, percentual: 5, bonusFixo: R(100) }];
    expect(calcularComissao(0, faixas, false).valorTotal).toBe(0);
    expect(calcularComissao(R(-1000), faixas, true).valorTotal).toBe(0);
  });
});

describe("validarFaixas", () => {
  it("escada contígua é válida", () => {
    expect(validarFaixas(escada)).toEqual({ ok: true });
  });
  it("buraco abaixo da primeira faixa é permitido", () => {
    expect(validarFaixas([
      { minAcumulado: R(10000), maxAcumulado: R(30000), percentual: 3, bonusFixo: null },
      { minAcumulado: R(30000), maxAcumulado: null, percentual: 5, bonusFixo: null },
    ])).toEqual({ ok: true });
  });
  it("recusa lista vazia", () => {
    expect(validarFaixas([])).toMatchObject({ ok: false, motivo: "sem_faixas" });
  });
  it("recusa sobreposição", () => {
    expect(validarFaixas([
      { minAcumulado: R(0), maxAcumulado: R(40000), percentual: 3, bonusFixo: null },
      { minAcumulado: R(30000), maxAcumulado: R(60000), percentual: 5, bonusFixo: null },
    ])).toMatchObject({ ok: false, motivo: "sobreposicao" });
  });
  it("recusa faixa aberta no meio", () => {
    expect(validarFaixas([
      { minAcumulado: R(0), maxAcumulado: null, percentual: 3, bonusFixo: null },
      { minAcumulado: R(30000), maxAcumulado: R(60000), percentual: 5, bonusFixo: null },
    ])).toMatchObject({ ok: false, motivo: "aberta_no_meio" });
  });
  it("recusa intervalo invertido (max ≤ min)", () => {
    expect(validarFaixas([{ minAcumulado: R(30000), maxAcumulado: R(10000), percentual: 3, bonusFixo: null }])).toMatchObject({ ok: false, motivo: "intervalo_invalido" });
  });
  it("recusa faixa sem % nem bônus", () => {
    expect(validarFaixas([{ minAcumulado: 0, maxAcumulado: R(30000), percentual: null, bonusFixo: null }])).toMatchObject({ ok: false, motivo: "faixa_vazia" });
  });
});
