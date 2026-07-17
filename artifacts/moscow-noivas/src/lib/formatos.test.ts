import { describe, expect, it } from "vitest";
import { brl } from "./formatos";

/**
 * brl() é o formatador de dinheiro usado em TODA tela financeira. O bug: sem
 * maximumFractionDigits, um valor com mais de 2 casas saía com 3 dígitos de
 * centavo — "R$ 1.234,567" — quebrando o alinhamento e a confiança no número.
 */
describe("brl", () => {
  it("sempre 2 casas: trunca/arredonda o que tem mais", () => {
    expect(brl(1234.567)).toBe("1.234,57");
    expect(brl(33.333333)).toBe("33,33");
    expect(brl(0.1 + 0.2)).toBe("0,30"); // 0.30000000000000004
  });

  it("sempre 2 casas: completa o que tem menos", () => {
    expect(brl(1000)).toBe("1.000,00");
    expect(brl(5)).toBe("5,00");
    expect(brl(0)).toBe("0,00");
  });

  it("separador de milhar BR (ponto)", () => {
    expect(brl(1234567.89)).toBe("1.234.567,89");
  });
});
