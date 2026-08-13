import { describe, expect, it } from "vitest";
import {
  ehExclusivaDePrimeiroAluguel,
  ehPrimeiroAluguel,
  MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL,
} from "@workspace/financeiro-core";

/**
 * E216 — o predicado da cláusula 12ª, e a interpretação que ele carrega.
 *
 * > Se tratar de rescisão de **vestido exclusivo para primeiro aluguel**, será
 * > cobrado na qualidade de multa de rescisão contratual **o valor integral do
 * > aluguel**.
 *
 * A cláusula nomeia uma coisa e são duas: a **marca** (exclusiva, da loja) e o
 * **estado** (primeiro aluguel, do acervo). Este arquivo prega as duas metades
 * separadas — e prega a leitura adotada, que é a parte que a dona pode querer
 * corrigir.
 */
describe("E216 — a peça exclusiva de primeiro aluguel (cláusula 12ª)", () => {
  it("a peça exclusiva que nunca saiu está sob a 12ª", () => {
    expect(ehExclusivaDePrimeiroAluguel({ exclusiva: true }, 0)).toBe(true);
  });

  it("a peça comum nunca está sob a 12ª, tenha saído quantas vezes for", () => {
    expect(ehExclusivaDePrimeiroAluguel({ exclusiva: false }, 0)).toBe(false);
    expect(ehExclusivaDePrimeiroAluguel({ exclusiva: false }, 7)).toBe(false);
    // Peça gravada antes da coluna existir: o campo ausente é "não exclusiva",
    // e é o mesmo default da migração. O sistema não inventa exclusividade.
    expect(ehExclusivaDePrimeiroAluguel({}, 0)).toBe(false);
    expect(ehExclusivaDePrimeiroAluguel({ exclusiva: null }, 0)).toBe(false);
  });

  /**
   * **A leitura adotada, e é interpretação declarada, não medição.**
   *
   * O contrato não diz o que acontece com a peça exclusiva depois do primeiro
   * aluguel. Adotamos que a 12ª deixa de incidir: a 11ª já cobre a rescisão
   * comum com 60% de dedução, e o que justifica a 12ª subir para o aluguel
   * inteiro é o dano de estrear uma peça feita para uma noiva que desistiu.
   *
   * Se a dona disser que a intenção era outra, o conserto é apagar o termo
   * `locacoesAnteriores === 0` do predicado — e este teste é o que reprova
   * primeiro, de propósito.
   */
  it("depois da primeira saída a MARCA fica e o ESTADO expira — a 12ª não incide mais", () => {
    expect(ehExclusivaDePrimeiroAluguel({ exclusiva: true }, 1)).toBe(false);
    expect(ehExclusivaDePrimeiroAluguel({ exclusiva: true }, 4)).toBe(false);
  });

  it("«primeiro aluguel» é a contagem de saídas ANTERIORES, e só ela", () => {
    expect(ehPrimeiroAluguel(0)).toBe(true);
    expect(ehPrimeiroAluguel(1)).toBe(false);
    // Contagem negativa não existe no acervo, mas o E217 vai subtrair o próprio
    // contrato da utilização (`contratos - 1`) — e um −1 acidental tem de cair
    // no lado seguro, que é "ainda é primeiro aluguel", nunca num throw.
    expect(ehPrimeiroAluguel(-1)).toBe(true);
  });

  it("a multa da 12ª é o aluguel INTEIRO — 100%, e a constante é nomeada", () => {
    expect(MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL).toBe(100);
  });
});
