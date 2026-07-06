import { describe, it, expect } from "vitest";
import { paraCentavos, deCentavos, decParaCentavos } from "@/lib/dinheiro";

describe("dinheiro: paraCentavos", () => {
  it("pt-BR completo: vírgula=decimal, ponto=milhar", () => {
    expect(paraCentavos("1.234,56")).toBe(123456);
    expect(paraCentavos("150,50")).toBe(15050);
    expect(paraCentavos("12.345,67")).toBe(1234567);
  });

  it("ponto sem vírgula: MILHAR (não decimal) — o bug do review S2", () => {
    expect(paraCentavos("1.234")).toBe(123400); // R$ 1.234,00, não R$ 1,23
    expect(paraCentavos("1.000")).toBe(100000);
    expect(paraCentavos("12.345.678")).toBe(1234567800);
  });

  it("decimal explícito com ponto (1–2 casas)", () => {
    expect(paraCentavos("1234.56")).toBe(123456);
    expect(paraCentavos("500.50")).toBe(50050);
    expect(paraCentavos("50.5")).toBe(5050);
  });

  it("inteiro puro", () => {
    expect(paraCentavos("100")).toBe(10000);
    expect(paraCentavos("0")).toBe(0);
  });

  it("rejeita vazio, negativo, notação científica e lixo", () => {
    expect(() => paraCentavos("")).toThrow();
    expect(() => paraCentavos("   ")).toThrow();
    expect(() => paraCentavos("-5")).toThrow();
    expect(() => paraCentavos("1e3")).toThrow();
    expect(() => paraCentavos("abc")).toThrow();
  });
});

describe("dinheiro: deCentavos / decParaCentavos", () => {
  it("formata centavos → string com 2 casas", () => {
    expect(deCentavos(123456)).toBe("1234.56");
    expect(deCentavos(0)).toBe("0.00");
  });

  it("Decimal-ish → centavos; null → 0", () => {
    expect(decParaCentavos("1234.56")).toBe(123456);
    expect(decParaCentavos(null)).toBe(0);
  });
});
