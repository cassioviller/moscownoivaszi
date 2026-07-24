import { describe, expect, it } from "vitest";
import {
  calcularComissao,
  competenciaDe,
  competenciaValida,
  limitesCompetencia,
  ordenarFaixas,
  proximoDegrau,
  validarFaixas,
  vencimentoComissao,
  type FaixaCalc,
} from "../lib/comissao";

/** Em centavos: 20k, 50k e 80k de acumulado. */
const faixa = (min: number, max: number | null, pct: number | null, bonus: number | null = null): FaixaCalc => ({
  minAcumulado: min,
  maxAcumulado: max,
  percentual: pct,
  bonusFixo: bonus,
});

const ESCADA: FaixaCalc[] = [
  faixa(2_000_000, 5_000_000, 3),
  faixa(5_000_000, 8_000_000, 5),
  faixa(8_000_000, null, 8),
];

describe("calcularComissao — a faixa final rege o mês (retroativo)", () => {
  it("aplica o % da faixa ao acumulado INTEIRO, não por degrau", () => {
    // 60k na faixa de 5%: 3.000, e não 20k×0 + 30k×3% + 10k×5%.
    const r = calcularComissao(6_000_000, ESCADA, false);
    expect(r.percentualAplicado).toBe(5);
    expect(r.valorComissao).toBe(300_000);
    expect(r.valorTotal).toBe(300_000);
  });

  it("a borda inferior é inclusiva; a superior, exclusiva", () => {
    expect(calcularComissao(5_000_000, ESCADA, false).percentualAplicado).toBe(5);
    expect(calcularComissao(4_999_999, ESCADA, false).percentualAplicado).toBe(3);
  });

  it("a faixa do topo é aberta — não há teto de comissão", () => {
    expect(calcularComissao(99_999_999, ESCADA, false).percentualAplicado).toBe(8);
  });

  it("a ordem do array não importa", () => {
    const embaralhada = [...ESCADA].reverse();
    expect(calcularComissao(6_000_000, embaralhada, false).valorComissao).toBe(300_000);
  });
});

describe("calcularComissao — buraco é zero, não a faixa de baixo", () => {
  it("abaixo do primeiro patamar não comissiona", () => {
    // "abaixo de 20k não comissiona" se escreve não criando faixa ali.
    const r = calcularComissao(1_999_999, ESCADA, false);
    expect(r).toEqual({
      faixaIndex: null,
      percentualAplicado: null,
      valorComissao: 0,
      valorBonus: 0,
      valorTotal: 0,
    });
  });

  it("buraco no meio da escada também zera", () => {
    const comBuraco = [faixa(0, 1_000_000, 2), faixa(5_000_000, null, 8)];
    expect(calcularComissao(3_000_000, comBuraco, false).valorTotal).toBe(0);
  });

  it("sem faixas, sem comissão", () => {
    expect(calcularComissao(9_999_999, [], false).valorTotal).toBe(0);
  });
});

describe("calcularComissao — acumulado não positivo", () => {
  it("zero não comissiona", () => {
    expect(calcularComissao(0, ESCADA, false).valorTotal).toBe(0);
  });

  it("negativo (estorno §6.4 que virou o mês) não vira comissão nem bônus", () => {
    // Nem mesmo o bônus da faixa mais baixa: o mês não existiu.
    const r = calcularComissao(-500_000, [faixa(0, null, 5, 100_000)], true);
    expect(r).toEqual({
      faixaIndex: null,
      percentualAplicado: null,
      valorComissao: 0,
      valorBonus: 0,
      valorTotal: 0,
    });
  });
});

describe("calcularComissao — bônus", () => {
  const COM_BONUS: FaixaCalc[] = [
    faixa(2_000_000, 5_000_000, 3, 50_000),
    faixa(5_000_000, 8_000_000, 5, 100_000),
    faixa(8_000_000, null, 8, 200_000),
  ];

  it("sem acumular, só o bônus da faixa final conta", () => {
    const r = calcularComissao(6_000_000, COM_BONUS, false);
    expect(r.valorBonus).toBe(100_000);
    expect(r.valorTotal).toBe(300_000 + 100_000);
  });

  it("acumulando, os bônus dos degraus já vencidos se somam", () => {
    const r = calcularComissao(6_000_000, COM_BONUS, true);
    expect(r.valorBonus).toBe(50_000 + 100_000);
    expect(r.valorTotal).toBe(300_000 + 150_000);
  });

  it("acumular não inclui degrau ainda não atingido", () => {
    // O bônus de 200k é da faixa de 80k; com 60k ele não pode entrar na soma.
    const r = calcularComissao(6_000_000, COM_BONUS, true);
    expect(r.valorBonus).toBe(150_000);
  });

  it("faixa só de bônus paga sem percentual", () => {
    const r = calcularComissao(3_000_000, [faixa(0, null, null, 75_000)], false);
    expect(r.percentualAplicado).toBeNull();
    expect(r.valorComissao).toBe(0);
    expect(r.valorTotal).toBe(75_000);
  });
});

describe("calcularComissao — centavos", () => {
  it("arredonda o centavo em vez de acumular dízima", () => {
    // 50.003,33 × 3,33% = 1.665,1109… → 1.665,11
    const r = calcularComissao(5_000_333, [faixa(0, null, 3.33)], false);
    expect(r.valorComissao).toBe(166_511);
  });

  it("o total nunca é negativo", () => {
    const r = calcularComissao(1, [faixa(0, null, 0, 0)], false);
    expect(r.valorTotal).toBeGreaterThanOrEqual(0);
  });
});

describe("validarFaixas", () => {
  it("aceita uma escada coerente", () => {
    expect(validarFaixas(ESCADA)).toEqual({ ok: true });
  });

  it("aceita buracos — é como se diz 'aqui não comissiona'", () => {
    expect(validarFaixas([faixa(0, 1_000_000, 2), faixa(5_000_000, null, 8)])).toEqual({ ok: true });
  });

  it("recusa lista vazia", () => {
    expect(validarFaixas([])).toEqual({ ok: false, motivo: "sem_faixas" });
  });

  it("recusa sobreposição — comissão ambígua vira discussão no fim do mês", () => {
    const sobrepostas = [faixa(0, 5_000_000, 3), faixa(4_000_000, null, 8)];
    expect(validarFaixas(sobrepostas)).toEqual({ ok: false, motivo: "sobreposicao" });
  });

  it("recusa faixa aberta que não seja a do topo", () => {
    const abertaNoMeio = [faixa(0, null, 3), faixa(5_000_000, null, 8)];
    expect(validarFaixas(abertaNoMeio)).toEqual({ ok: false, motivo: "aberta_no_meio" });
  });

  it("recusa intervalo invertido ou vazio", () => {
    expect(validarFaixas([faixa(5_000_000, 5_000_000, 3)])).toEqual({
      ok: false,
      motivo: "intervalo_invalido",
    });
    expect(validarFaixas([faixa(5_000_000, 1_000_000, 3)])).toEqual({
      ok: false,
      motivo: "intervalo_invalido",
    });
  });

  it("recusa faixa que não paga nada — não é faixa, é enfeite", () => {
    expect(validarFaixas([faixa(0, null, 0, 0)])).toEqual({ ok: false, motivo: "faixa_vazia" });
    expect(validarFaixas([faixa(0, null, null, null)])).toEqual({ ok: false, motivo: "faixa_vazia" });
  });

  it("recusa valores negativos", () => {
    expect(validarFaixas([faixa(-1, null, 5)])).toEqual({ ok: false, motivo: "min_negativo" });
    expect(validarFaixas([faixa(0, null, -5)])).toEqual({ ok: false, motivo: "valor_negativo" });
    expect(validarFaixas([faixa(0, null, 5, -1)])).toEqual({ ok: false, motivo: "valor_negativo" });
  });

  it("faixas encostadas não se sobrepõem — max é exclusivo", () => {
    expect(validarFaixas([faixa(0, 5_000_000, 3), faixa(5_000_000, null, 8)])).toEqual({ ok: true });
  });
});

describe("proximoDegrau", () => {
  it("diz quanto falta para o degrau seguinte", () => {
    expect(proximoDegrau(4_500_000, ESCADA)).toEqual({
      faltam: 500_000,
      percentual: 5,
      bonusFixo: null,
    });
  });

  it("no topo, não há próximo degrau", () => {
    expect(proximoDegrau(9_000_000, ESCADA)).toBeNull();
  });

  it("abaixo de tudo, o próximo é o primeiro patamar", () => {
    expect(proximoDegrau(0, ESCADA)?.faltam).toBe(2_000_000);
  });
});

describe("ordenarFaixas", () => {
  it("não muta a lista recebida", () => {
    const original = [...ESCADA].reverse();
    const copia = [...original];
    ordenarFaixas(original);
    expect(original).toEqual(copia);
  });
});

describe("competência", () => {
  it("limites em América/São Paulo, fim exclusivo", () => {
    const { inicio, fim } = limitesCompetencia("2027-03");
    expect(inicio.toISOString()).toBe("2027-03-01T03:00:00.000Z");
    expect(fim.toISOString()).toBe("2027-04-01T03:00:00.000Z");
  });

  it("virada de ano", () => {
    expect(limitesCompetencia("2027-12").fim.toISOString()).toBe("2028-01-01T03:00:00.000Z");
  });

  it("vencimento = dia 5 do mês seguinte", () => {
    expect(vencimentoComissao("2027-03").toISOString()).toBe("2027-04-05T15:00:00.000Z");
    expect(vencimentoComissao("2027-12").toISOString()).toBe("2028-01-05T15:00:00.000Z");
  });

  it("competenciaValida recusa mês fora de 1..12 e formato torto", () => {
    expect(competenciaValida("2027-03")).toBe(true);
    expect(competenciaValida("2027-13")).toBe(false);
    expect(competenciaValida("2027-00")).toBe(false);
    expect(competenciaValida("2027-3")).toBe(false);
    expect(competenciaValida("março")).toBe(false);
  });

  it("competenciaDe lê o instante no fuso da loja", () => {
    // 23h de 31/03 em SP ainda é março, embora já seja abril em UTC.
    expect(competenciaDe(new Date("2027-04-01T02:00:00Z"))).toBe("2027-03");
    expect(competenciaDe(new Date("2027-04-01T04:00:00Z"))).toBe("2027-04");
  });
});
