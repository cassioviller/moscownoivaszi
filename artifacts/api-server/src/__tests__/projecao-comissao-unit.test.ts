import { describe, expect, it } from "vitest";
import {
  MIN_DIAS_PROJECAO,
  calcularComissao,
  projetarCompetencia,
  type FaixaCalc,
} from "../lib/comissao";

/**
 * E51 — "no seu ritmo, o mês fecha em Y%". O run-rate em si é uma regra de
 * três; o que precisa de prova é o que ele NÃO faz: não projeta mês passado,
 * não projeta com meia dúzia de horas de dado, e não estica o estorno.
 */

/** Instante no fuso da loja — é nele que o dia do mês é lido. */
const emSP = (iso: string) => new Date(`${iso}-03:00`);

describe("projetarCompetencia", () => {
  it("estica as vendas do mês pelo ritmo dos dias decorridos", () => {
    // 10 mil em 10 dias de um mês de 31 → 31 mil no fim.
    const p = projetarCompetencia(1_000_000, 0, "2026-07", emSP("2026-07-10T18:00:00"));
    expect(p).toEqual({ diasDecorridos: 10, diasNoMes: 31, baseProjetadaC: 3_100_000 });
  });

  it("no último dia a projeção É o realizado", () => {
    const p = projetarCompetencia(1_234_567, 0, "2026-07", emSP("2026-07-31T23:00:00"));
    expect(p?.baseProjetadaC).toBe(1_234_567);
  });

  it("não projeta competência que não é a corrente", () => {
    // Mês passado não tem ritmo a projetar: o total já é o total.
    expect(projetarCompetencia(500_000, 0, "2026-06", emSP("2026-07-10T12:00:00"))).toBeNull();
    // Mês futuro, idem — nem começou.
    expect(projetarCompetencia(0, 0, "2026-08", emSP("2026-07-10T12:00:00"))).toBeNull();
  });

  it("cala nos primeiros dias do mês", () => {
    // No dia 2, "no seu ritmo você fecha em 15x o de ontem" é ruído com cara
    // de número — e número na tela é acreditado.
    for (let dia = 1; dia < MIN_DIAS_PROJECAO; dia++) {
      const d = String(dia).padStart(2, "0");
      expect(projetarCompetencia(100_000, 0, "2026-07", emSP(`2026-07-${d}T20:00:00`))).toBeNull();
    }
    const primeiroValido = String(MIN_DIAS_PROJECAO).padStart(2, "0");
    expect(
      projetarCompetencia(100_000, 0, "2026-07", emSP(`2026-07-${primeiroValido}T20:00:00`)),
    ).not.toBeNull();
  });

  it("o estorno é abatido UMA vez, não esticado", () => {
    // Estorno é evento único (cancelamento de mês fechado), não ritmo.
    // Esticá-lo diria que a vendedora vai devolver 3x o que devolveu.
    const p = projetarCompetencia(1_000_000, 300_000, "2026-07", emSP("2026-07-10T12:00:00"));
    // 1.000.000 × 31/10 = 3.100.000, menos os 300.000 de estorno.
    expect(p?.baseProjetadaC).toBe(2_800_000);
  });

  it("respeita o tamanho do mês", () => {
    const fev = projetarCompetencia(280_000, 0, "2024-02", emSP("2024-02-14T12:00:00"));
    expect(fev).toMatchObject({ diasNoMes: 29, diasDecorridos: 14 }); // bissexto
    const abr = projetarCompetencia(300_000, 0, "2026-04", emSP("2026-04-10T12:00:00"));
    expect(abr?.diasNoMes).toBe(30);
  });

  it("a virada do dia no fuso da loja não adianta o denominador", () => {
    // 23h do dia 10 em SP é 02h do dia 11 em UTC: ler em UTC diria 11 dias
    // decorridos e encolheria a projeção sem ninguém perceber.
    const p = projetarCompetencia(1_000_000, 0, "2026-07", emSP("2026-07-10T23:30:00"));
    expect(p?.diasDecorridos).toBe(10);
  });
});

describe("a projeção passa pela MESMA escada do realizado", () => {
  const faixas: FaixaCalc[] = [
    { minAcumulado: 0, maxAcumulado: 2_000_000, percentual: 3, bonusFixo: null },
    { minAcumulado: 2_000_000, maxAcumulado: null, percentual: 6, bonusFixo: null },
  ];

  it("o ritmo pode mudar a faixa — que é o ponto do épico", () => {
    const vendasC = 1_000_000; // 10 mil em 10 dias
    const realizado = calcularComissao(vendasC, faixas, false);
    const proj = projetarCompetencia(vendasC, 0, "2026-07", emSP("2026-07-10T12:00:00"))!;
    const projetado = calcularComissao(proj.baseProjetadaC, faixas, false);

    // Hoje paga 3%; no ritmo, o mês fecha na faixa de 6%. É essa diferença que
    // a vendedora precisa ver ANTES do dia 30 para decidir empurrar o mês.
    expect(realizado.percentualAplicado).toBe(3);
    expect(projetado.percentualAplicado).toBe(6);
    expect(projetado.valorTotal).toBe(186_000); // 3.100.000 × 6%
  });
});
