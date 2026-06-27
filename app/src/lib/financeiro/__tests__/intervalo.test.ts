import { describe, it, expect } from "vitest";
import {
  primeiroDiaDoMes,
  ultimoDiaDoMes,
  resolverIntervalo,
  vencimentoNaJanela,
} from "@/lib/financeiro/intervalo";

describe("primeiroDiaDoMes / ultimoDiaDoMes", () => {
  it("primeiro dia é sempre o 01 do mês de referência", () => {
    expect(primeiroDiaDoMes("2026-06-15")).toBe("2026-06-01");
    expect(primeiroDiaDoMes("2026-12-31")).toBe("2026-12-01");
  });
  it("último dia lida com 30/31 e fevereiro bissexto", () => {
    expect(ultimoDiaDoMes("2026-06-10")).toBe("2026-06-30");
    expect(ultimoDiaDoMes("2026-07-10")).toBe("2026-07-31");
    expect(ultimoDiaDoMes("2024-02-10")).toBe("2024-02-29");
    expect(ultimoDiaDoMes("2026-02-10")).toBe("2026-02-28");
  });
});

describe("resolverIntervalo", () => {
  it("sem params → 1º e último dia do mês de hoje; lt é exclusivo (fim + 1)", () => {
    const r = resolverIntervalo(undefined, undefined, "2026-06-15");
    expect(r.iniYMD).toBe("2026-06-01");
    expect(r.fimYMD).toBe("2026-06-30");
    expect(r.gte.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(r.lt.toISOString().slice(0, 10)).toBe("2026-07-01");
  });
  it("usa ini/fim válidos da URL", () => {
    const r = resolverIntervalo("2026-06-08", "2026-06-14", "2026-06-15");
    expect(r.iniYMD).toBe("2026-06-08");
    expect(r.fimYMD).toBe("2026-06-14");
    expect(r.gte.toISOString().slice(0, 10)).toBe("2026-06-08");
    expect(r.lt.toISOString().slice(0, 10)).toBe("2026-06-15"); // 14 + 1 (exclusivo)
  });
  it("valores inválidos caem no default do mês", () => {
    expect(resolverIntervalo("lixo", "2026-13-40", "2026-06-15")).toMatchObject({
      iniYMD: "2026-06-01",
      fimYMD: "2026-06-30",
    });
  });
  it("ini > fim → troca para um intervalo válido", () => {
    const r = resolverIntervalo("2026-06-20", "2026-06-10", "2026-06-15");
    expect([r.iniYMD, r.fimYMD]).toEqual(["2026-06-10", "2026-06-20"]);
    expect(r.lt.toISOString().slice(0, 10)).toBe("2026-06-21");
  });
});

describe("vencimentoNaJanela", () => {
  const jan = { gte: new Date("2026-06-01T00:00:00.000Z"), lt: new Date("2026-07-01T00:00:00.000Z") };
  const hoje = new Date("2026-06-15T00:00:00.000Z");

  it("sem intervalo nem teto → undefined (não filtra)", () => {
    expect(vencimentoNaJanela(undefined)).toBeUndefined();
  });
  it("sem intervalo, com teto → só o teto (atrasadas sem filtro de período)", () => {
    expect(vencimentoNaJanela(undefined, hoje)).toEqual({ lt: hoje });
  });
  it("com intervalo, sem teto → gte/lt do intervalo", () => {
    expect(vencimentoNaJanela(jan)).toEqual({ gte: jan.gte, lt: jan.lt });
  });
  it("com intervalo e teto → lt é o MENOR (mais restritivo)", () => {
    expect(vencimentoNaJanela(jan, hoje)).toEqual({ gte: jan.gte, lt: hoje }); // hoje < jan.lt
    const tetoTardio = new Date("2026-08-01T00:00:00.000Z");
    expect(vencimentoNaJanela(jan, tetoTardio)).toEqual({ gte: jan.gte, lt: jan.lt }); // jan.lt menor
  });
});
