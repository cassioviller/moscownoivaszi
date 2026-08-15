import { describe, expect, it } from "vitest";
import {
  CNPJ_DE_EXEMPLO,
  cnpjFormatado,
  cnpjValido,
  cpfFormatado,
  cpfValido,
} from "@workspace/financeiro-core";

/**
 * E233 — CPF e CNPJ conferidos pela aritmética dos dígitos verificadores.
 *
 * Os dois CNPJs do contrato de papel PASSAM — o da identificação
 * (37.771.644/0001-93) e o da página 6 (31.897.111/0001-76), que é de OUTRA
 * empresa. É a P1 do rastreador em forma de teste: a régua confere que o número
 * fecha, não que ele é o certo. E o exemplo antigo do seed NÃO passa — foi por
 * isso que ele mudou.
 */
describe("E233 — documentos", () => {
  it("CNPJ: os dois do papel fecham; o exemplo antigo do seed não; o novo sim", () => {
    expect(cnpjValido("37.771.644/0001-93")).toBe(true);
    expect(cnpjValido("31.897.111/0001-76")).toBe(true);
    expect(cnpjValido("12.345.678/0001-99")).toBe(false);
    expect(cnpjValido(CNPJ_DE_EXEMPLO)).toBe(true);
    // Sem pontuação é o mesmo número.
    expect(cnpjValido("37771644000193")).toBe(true);
    // Um dígito trocado, sequência repetida, tamanho errado, vazio.
    expect(cnpjValido("37.771.644/0001-92")).toBe(false);
    expect(cnpjValido("11.111.111/1111-11")).toBe(false);
    expect(cnpjValido("37.771.644/0001")).toBe(false);
    expect(cnpjValido("")).toBe(false);
    expect(cnpjValido(null)).toBe(false);
  });

  it("CPF: os das fixtures fecham; o velho '123.456.789-00' e '999.999.999-99' não", () => {
    expect(cpfValido("390.533.447-05")).toBe(true);
    expect(cpfValido("111.444.777-35")).toBe(true);
    expect(cpfValido("39053344705")).toBe(true);
    expect(cpfValido("123.456.789-00")).toBe(false);
    expect(cpfValido("999.999.999-99")).toBe(false);
    expect(cpfValido("390.533.447-06")).toBe(false);
    expect(cpfValido("390.533.447")).toBe(false);
    expect(cpfValido(undefined)).toBe(false);
  });

  it("a grafia única: formata o válido e devolve intacto o que não tem tamanho", () => {
    expect(cpfFormatado("39053344705")).toBe("390.533.447-05");
    expect(cpfFormatado("390.533.447-05")).toBe("390.533.447-05");
    expect(cnpjFormatado("37771644000193")).toBe("37.771.644/0001-93");
    expect(cnpjFormatado("abc")).toBe("abc");
  });
});
