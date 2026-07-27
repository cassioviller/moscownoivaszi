import { describe, expect, it } from "vitest";
import { montarPlanoParcelas, addMeses, centavos } from "@workspace/financeiro-core";

/**
 * E95 — o carnê. A tela montava o plano sozinha, em reais float, e discordava
 * do servidor no VALOR e na DATA. Aqui ficam os dois casos que a trilha C
 * mediu, mais a régua de data decidida pelo dono: mensal por dia fixo, e
 * `primeiroVencimento` é a PARCELA 1.
 */

describe("montarPlanoParcelas — valor (C2)", () => {
  it("R$ 1.282,00 em 10x dá dez parcelas iguais de R$ 128,20", () => {
    const plano = montarPlanoParcelas({
      totalCentavos: centavos(1282),
      numParcelas: 10,
      primeiroVencimento: "2026-08-10",
    });
    expect(plano).toHaveLength(10);
    expect(plano.map((p) => p.valorCentavos)).toEqual(Array(10).fill(12820));

    // O que a tela fazia: base = Math.floor((1282/10)*100)/100 = 128.19.
    const base = Math.floor((1282 / 10) * 100) / 100;
    expect(base).toBe(128.19);
    expect(centavos(1282 - base * 9)).toBe(12829);
  });

  it("a soma bate exatamente com o total, com entrada e com sobra de centavos", () => {
    const plano = montarPlanoParcelas({
      totalCentavos: centavos(9480.55),
      entradaCentavos: centavos(2000),
      numParcelas: 6,
      primeiroVencimento: "2026-08-10",
      vencimentoEntrada: "2026-07-27",
    });
    expect(plano.reduce((s, p) => s + p.valorCentavos, 0)).toBe(centavos(9480.55));
    expect(plano[0]).toMatchObject({ numero: 0, descricao: "Entrada", valorCentavos: 200000 });
    // Cinco de R$ 1.246,75 e a última de R$ 1.246,80.
    expect(plano.slice(1, 6).map((p) => p.valorCentavos)).toEqual(Array(5).fill(124675));
    expect(plano[6].valorCentavos).toBe(124680);
  });
});

describe("montarPlanoParcelas — data (C9)", () => {
  it("primeiroVencimento é a PARCELA 1, e a entrada tem data própria", () => {
    const plano = montarPlanoParcelas({
      totalCentavos: centavos(9480.55),
      entradaCentavos: centavos(2000),
      numParcelas: 6,
      primeiroVencimento: "2026-08-10",
      vencimentoEntrada: "2026-07-27",
    });
    expect(plano.map((p) => p.vencimento)).toEqual([
      "2026-07-27", // entrada
      "2026-08-10",
      "2026-09-10",
      "2026-10-10",
      "2026-11-10",
      "2026-12-10",
      "2027-01-10",
    ]);
  });

  it("com e sem entrada, a parcela 1 cai no MESMO dia — o campo não muda de sentido", () => {
    const comum = { totalCentavos: 600000, numParcelas: 3, primeiroVencimento: "2026-08-10" };
    const semEntrada = montarPlanoParcelas(comum);
    const comEntrada = montarPlanoParcelas({ ...comum, entradaCentavos: 300000 });
    expect(semEntrada[0].vencimento).toBe("2026-08-10");
    expect(comEntrada.find((p) => p.numero === 1)!.vencimento).toBe("2026-08-10");
  });

  it("o dia 31 grampeia no mês curto e VOLTA no mês longo", () => {
    const plano = montarPlanoParcelas({
      totalCentavos: 400000,
      numParcelas: 4,
      primeiroVencimento: "2026-01-31",
    });
    expect(plano.map((p) => p.vencimento)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31", // não fica preso no 28: cada parcela conta da âncora
      "2026-04-30",
    ]);
  });

  it("addMeses atravessa o ano e o fevereiro bissexto", () => {
    expect(addMeses("2026-12-10", 1)).toBe("2027-01-10");
    expect(addMeses("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMeses("2026-08-10", 0)).toBe("2026-08-10");
  });
});

describe("montarPlanoParcelas — o que ele recusa", () => {
  it("entrada maior que o total não vira carnê", () => {
    expect(() =>
      montarPlanoParcelas({
        totalCentavos: 100000,
        entradaCentavos: 100001,
        numParcelas: 1,
        primeiroVencimento: "2026-08-10",
      }),
    ).toThrow("PLANO_ENTRADA_MAIOR");
  });

  it("restante positivo sem parcelas não vira carnê", () => {
    expect(() =>
      montarPlanoParcelas({
        totalCentavos: 100000,
        numParcelas: 0,
        primeiroVencimento: "2026-08-10",
      }),
    ).toThrow("PLANO_SEM_PARCELAS");
  });

  it("entrada que quita o total gera só a entrada — numParcelas é ignorado", () => {
    const plano = montarPlanoParcelas({
      totalCentavos: 100000,
      entradaCentavos: 100000,
      numParcelas: 6,
      primeiroVencimento: "2026-08-10",
      vencimentoEntrada: "2026-07-27",
    });
    expect(plano).toEqual([
      { numero: 0, descricao: "Entrada", valorCentavos: 100000, vencimento: "2026-07-27" },
    ]);
  });
});
