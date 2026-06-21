import { describe, it, expect } from "vitest";
import { addDias, parseDiaUTC, janelasSobrepoem } from "../datas";
import type { Janela } from "../tipos";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

describe("parseDiaUTC", () => {
  it('parseia "YYYY-MM-DD" para a meia-noite em UTC', () => {
    expect(parseDiaUTC("2026-06-20")).toEqual(dia(2026, 6, 20));
  });
  it("rejeita formato inválido", () => {
    expect(() => parseDiaUTC("20/06/2026")).toThrow(/YYYY-MM-DD/);
  });
  it("rejeita data fora do calendário (não normaliza em silêncio)", () => {
    expect(() => parseDiaUTC("2026-02-30")).toThrow(/inválida/i);
    expect(() => parseDiaUTC("2026-13-01")).toThrow(/inválida/i);
  });
});

describe("addDias", () => {
  it("subtrai dias dentro do mês", () => {
    expect(addDias(dia(2026, 6, 20), -14)).toEqual(dia(2026, 6, 6));
  });
  it("vira o ano para frente", () => {
    expect(addDias(dia(2026, 12, 31), 1)).toEqual(dia(2027, 1, 1));
  });
  it("vira o mês para trás (fevereiro)", () => {
    expect(addDias(dia(2026, 3, 1), -1)).toEqual(dia(2026, 2, 28));
  });
});

describe("janelasSobrepoem", () => {
  const j = (ini: Date, fim: Date): Janela => ({ tipo: "uso", inicio: ini, fim });
  it("detecta sobreposição parcial", () => {
    expect(
      janelasSobrepoem(j(dia(2026, 6, 17), dia(2026, 6, 22)), j(dia(2026, 6, 18), dia(2026, 6, 23))),
    ).toBe(true);
  });
  it("NÃO sobrepõe quando uma janela começa exatamente onde a outra termina (meio-aberto)", () => {
    // devolveu 22/6 → nova retirada 22/6 é permitida (back-to-back)
    expect(
      janelasSobrepoem(j(dia(2026, 6, 17), dia(2026, 6, 22)), j(dia(2026, 6, 22), dia(2026, 6, 25))),
    ).toBe(false);
  });
  it("sobrepõe quando o início cai um dia antes do fim da outra", () => {
    expect(
      janelasSobrepoem(j(dia(2026, 6, 17), dia(2026, 6, 22)), j(dia(2026, 6, 21), dia(2026, 6, 25))),
    ).toBe(true);
  });
  it("não sobrepõe quando há um dia de folga", () => {
    expect(
      janelasSobrepoem(j(dia(2026, 6, 17), dia(2026, 6, 22)), j(dia(2026, 6, 23), dia(2026, 6, 25))),
    ).toBe(false);
  });
});
