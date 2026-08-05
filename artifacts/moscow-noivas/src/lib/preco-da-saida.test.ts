import { describe, expect, it } from "vitest";
import { precoDaSaida } from "./preco-da-saida";

/**
 * E157 — a régua que decide qual preço a peça cobra nesta saída.
 *
 * O que se prega aqui é a decisão de projeto do épico: a régua só age quando as
 * DUAS condições existem (a peça já saiu antes E tem preço de segunda saída);
 * em qualquer outro caso ela devolve o `precoBase`, que é o comportamento de
 * sempre. Uma régua de preço que age por engano custa dinheiro em silêncio.
 */
describe("E157 — o preço da saída", () => {
  const peca = { precoBase: 5000, precoRealuguel: 3500 };

  it("na primeira saída, o preço de tabela", () => {
    expect(precoDaSaida(peca, 0)).toMatchObject({ valor: 5000, ehRealuguel: false });
  });

  it("na segunda, o de realuguel — e a frase diz de que saída se trata", () => {
    expect(precoDaSaida(peca, 1)).toEqual({
      valor: 3500,
      motivo: "2ª saída desta peça — preço de realuguel",
      ehRealuguel: true,
    });
  });

  it("a contagem é do PASSADO: a noiva da vez é a próxima", () => {
    // Três contratos anteriores → esta é a quarta saída, não a terceira.
    expect(precoDaSaida(peca, 3).motivo).toBe("4ª saída desta peça — preço de realuguel");
  });

  it("peça sem preço de realuguel segue no base, por mais que já tenha saído", () => {
    // O caso comum, e o que faz a coluna nascer sem migração de dados: nulo
    // significa "não tem preço de segunda saída".
    const semRealuguel = { precoBase: 5000, precoRealuguel: null };
    expect(precoDaSaida(semRealuguel, 9)).toMatchObject({ valor: 5000, ehRealuguel: false });
  });

  it("campo ausente vale como nulo — a peça antiga do acervo não muda de preço", () => {
    expect(precoDaSaida({ precoBase: 4200 }, 5)).toMatchObject({ valor: 4200, ehRealuguel: false });
  });

  it("realuguel MAIOR que o base é aceito — quem decide preço é a loja", () => {
    // Não é conta, é número digitado: a peça pode ter valorizado, e recusar
    // seria a régua achando que entende do negócio mais que a dona.
    expect(precoDaSaida({ precoBase: 3000, precoRealuguel: 7600 }, 1).valor).toBe(7600);
  });

  it("realuguel ZERO é um preço, não uma ausência", () => {
    // A peça que sai de graça na segunda vez (cortesia, desgaste) — `0` é um
    // número que a dona digitou, e `??` o engoliria se a régua usasse `||`.
    expect(precoDaSaida({ precoBase: 5000, precoRealuguel: 0 }, 1)).toMatchObject({
      valor: 0,
      ehRealuguel: true,
    });
  });
});
