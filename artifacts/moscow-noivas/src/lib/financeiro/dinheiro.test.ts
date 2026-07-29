import { describe, expect, it } from "vitest";
import { centavos, parseValor, reais, somaCentavos } from "./dinheiro";

describe("centavos / reais", () => {
  it("ida e volta preserva a quantia", () => {
    expect(reais(centavos(1234.56))).toBe(1234.56);
    expect(reais(centavos(0.1))).toBe(0.1);
  });

  it("arredonda o centavo em vez de truncar", () => {
    expect(centavos(0.005)).toBe(1);
    expect(centavos(0.004)).toBe(0);
    // 19.99 * 100 dá 1998.9999… em float: truncar perderia um centavo.
    expect(centavos(19.99)).toBe(1999);
  });
});

describe("somaCentavos", () => {
  it("soma inteiro: o erro de float não se acumula", () => {
    const itens = Array.from({ length: 10 }, () => ({ v: 0.1 }));
    // Em reais, 0.1 somado 10 vezes dá 0.9999999999999999.
    expect(reais(somaCentavos(itens, (i) => i.v))).toBe(1);
  });

  it("campo ausente ou nulo conta como zero, nunca NaN", () => {
    const itens = [{ v: 10 }, { v: null }, { v: undefined }];
    expect(reais(somaCentavos(itens, (i) => i.v))).toBe(10);
  });

  it("lista vazia é zero", () => {
    expect(somaCentavos([], () => 0)).toBe(0);
  });
});

describe("parseValor", () => {
  it("lê o padrão pt-BR: vírgula decimal, ponto de milhar", () => {
    expect(parseValor("1.234,56")).toBe(1234.56);
    expect(parseValor("0,10")).toBe(0.1);
  });

  it("aceita o formato cru, sem separador de milhar", () => {
    expect(parseValor("1234.56")).toBe(1234.56);
    expect(parseValor("100")).toBe(100);
  });

  it("ponto de milhar sem decimais não vira decimal", () => {
    // O engano que custa caro: "1.234" é mil e pouco, não um e pouco.
    expect(parseValor("1.234")).toBe(1234);
    expect(parseValor("1.234.567")).toBe(1234567);
  });

  it("o SINAL não muda a quantia por mil", () => {
    // O caixa fecha no vermelho e a conferência aceita negativo de propósito.
    // O reconhecedor de milhar começava em `^\d` e reprovava o "-": "-1.234"
    // caía no Number cru e virava −1,23 — a âncora de saldo mil vezes menor.
    expect(parseValor("-1.234")).toBe(-1234);
    expect(parseValor("-1.234,56")).toBe(-1234.56);
    expect(parseValor("+1.234")).toBe(1234);
  });

  it("vazio é null (não digitou); lixo é NaN (digitou errado)", () => {
    expect(parseValor("")).toBeNull();
    expect(parseValor("   ")).toBeNull();
    expect(parseValor("abc")).toBeNaN();
  });
});
