import { describe, expect, it } from "vitest";
import {
  addDias,
  competenciaAtual,
  competenciaValida,
  diaDeNegocio,
  diaLocal,
  diasEntre,
  instanteNoIntervalo,
  negocioNoIntervalo,
  resolverIntervalo,
  ultimasCompetencias,
} from "./datas";
// Sem porta no front desde o E88 (nenhuma tela consome) — a prova é do core.
import {
  intervaloDaCompetencia,
  primeiroDiaDoMes,
  ultimoDiaDoMes,
} from "@workspace/financeiro-core";

describe("dia de instante × dia de negócio", () => {
  it("instante lê o dia no fuso da loja, não em UTC", () => {
    // 22h de 10/03 em SP já é 01:00 de 11/03 em UTC. O dinheiro entrou dia 10.
    const noite = "2027-03-11T01:00:00.000Z";
    expect(diaLocal(noite)).toBe("2027-03-10");
    expect(diaDeNegocio(noite)).toBe("2027-03-11"); // o outro tipo de data, de propósito
  });

  it("data de negócio (meio-dia SP) tem o dia UTC igual ao dia de negócio", () => {
    const vencimento = new Date("2027-03-10T12:00:00-03:00").toISOString();
    expect(diaDeNegocio(vencimento)).toBe("2027-03-10");
    expect(diaLocal(vencimento)).toBe("2027-03-10"); // meio-dia: os dois concordam
  });
});

describe("competência", () => {
  it("valida o formato e o mês", () => {
    expect(competenciaValida("2027-01")).toBe(true);
    expect(competenciaValida("2027-12")).toBe(true);
    expect(competenciaValida("2027-13")).toBe(false);
    expect(competenciaValida("2027-00")).toBe(false);
    expect(competenciaValida("2027-1")).toBe(false);
    expect(competenciaValida("")).toBe(false);
  });

  it("competenciaAtual devolve YYYY-MM", () => {
    expect(competenciaAtual()).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it("ultimasCompetencias atravessa a virada do ano", () => {
    expect(ultimasCompetencias("2027-02", 4)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("intervaloDaCompetencia cobre o mês inteiro", () => {
    expect(intervaloDaCompetencia("2027-02")).toEqual({ iniYMD: "2027-02-01", fimYMD: "2027-02-28" });
    expect(intervaloDaCompetencia("2028-02").fimYMD).toBe("2028-02-29"); // bissexto
  });
});

describe("dias do mês", () => {
  it("primeiro e último dia lidam com meses de tamanhos diferentes", () => {
    expect(primeiroDiaDoMes("2027-07-16")).toBe("2027-07-01");
    expect(ultimoDiaDoMes("2027-07-16")).toBe("2027-07-31");
    expect(ultimoDiaDoMes("2027-04-10")).toBe("2027-04-30");
    expect(ultimoDiaDoMes("2027-02-10")).toBe("2027-02-28");
    expect(ultimoDiaDoMes("2028-02-10")).toBe("2028-02-29");
  });
});

describe("aritmética de dias", () => {
  it("addDias atravessa mês e ano", () => {
    expect(addDias("2027-01-31", 1)).toBe("2027-02-01");
    expect(addDias("2027-12-31", 1)).toBe("2028-01-01");
    expect(addDias("2027-03-01", -1)).toBe("2027-02-28");
    expect(addDias("2027-07-16", 90)).toBe("2027-10-14");
  });

  it("diasEntre conta dias-calendário", () => {
    expect(diasEntre("2027-07-16", "2027-07-16")).toBe(0);
    expect(diasEntre("2027-07-16", "2027-07-17")).toBe(1);
    expect(diasEntre("2027-07-17", "2027-07-16")).toBe(-1);
    expect(diasEntre("2027-01-01", "2028-01-01")).toBe(365);
  });
});

describe("resolverIntervalo", () => {
  it("sem params, cai no mês de hoje", () => {
    expect(resolverIntervalo(undefined, undefined, "2027-07-16")).toEqual({
      iniYMD: "2027-07-01",
      fimYMD: "2027-07-31",
    });
  });

  it("params inválidos são ignorados em favor do default", () => {
    expect(resolverIntervalo("nao-e-data", "2027-13-45", "2027-07-16")).toEqual({
      iniYMD: "2027-07-01",
      fimYMD: "2027-07-31",
    });
  });

  it("ini > fim vira um intervalo coerente em vez de vazio", () => {
    expect(resolverIntervalo("2027-07-31", "2027-07-01", "2027-07-16")).toEqual({
      iniYMD: "2027-07-01",
      fimYMD: "2027-07-31",
    });
  });

  it("respeita os params quando válidos", () => {
    expect(resolverIntervalo("2027-01-05", "2027-02-10", "2027-07-16")).toEqual({
      iniYMD: "2027-01-05",
      fimYMD: "2027-02-10",
    });
  });
});

describe("pertencimento ao intervalo", () => {
  const intervalo = { iniYMD: "2027-03-01", fimYMD: "2027-03-31" };

  it("as duas pontas são inclusivas", () => {
    const primeiro = new Date("2027-03-01T12:00:00-03:00").toISOString();
    const ultimo = new Date("2027-03-31T12:00:00-03:00").toISOString();
    expect(negocioNoIntervalo(primeiro, intervalo)).toBe(true);
    expect(negocioNoIntervalo(ultimo, intervalo)).toBe(true);
  });

  it("instante das 23h do último dia ainda pertence ao mês", () => {
    // 23h de 31/03 em SP = 02:00 de 01/04 em UTC: ler em UTC jogaria fora.
    expect(instanteNoIntervalo("2027-04-01T02:00:00.000Z", intervalo)).toBe(true);
  });

  it("instante da 1h do primeiro dia do mês seguinte fica fora", () => {
    expect(instanteNoIntervalo("2027-04-01T12:00:00.000Z", intervalo)).toBe(false);
  });
});
