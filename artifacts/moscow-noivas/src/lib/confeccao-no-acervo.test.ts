import { describe, expect, it } from "vitest";
import { podeVirarPecaDoAcervo, fichaDaConfeccao, type TrabalhoDaFila } from "./confeccao-no-acervo";

/**
 * E156 — o gesto "virou peça do acervo" e a ficha com que ele abre o cadastro.
 *
 * Cada `false` aqui é uma peça que NÃO entra no acervo, e por um motivo
 * diferente: bainha não é peça nova, manga inacabada não é peça alugável, e a
 * mesma confecção não vira duas peças com dois códigos.
 */
const pronta: TrabalhoDaFila = {
  tipo: "CONFECCAO",
  status: "FEITO",
  descricao: "Manga renda c/ saia lisa",
  atendimento: { lead: { noivaNome: "Dayfini" } },
};

describe("E156 — quando a confecção pode virar peça do acervo", () => {
  it("confecção FEITA e ainda sem peça — é o caso do gesto", () => {
    expect(podeVirarPecaDoAcervo(pronta)).toBe(true);
  });

  it("confecção PENDENTE não vira — a manga não existe até a costureira terminar", () => {
    expect(podeVirarPecaDoAcervo({ ...pronta, status: "PENDENTE" })).toBe(false);
  });

  it("ajuste comum não vira — bainha não é peça nova", () => {
    expect(podeVirarPecaDoAcervo({ ...pronta, tipo: "AJUSTE" })).toBe(false);
  });

  it("o que já virou peça não vira de novo — a fila passa a mostrar a peça", () => {
    expect(
      podeVirarPecaDoAcervo({
        ...pronta,
        pecaDoAcervo: { id: "v1", codigo: "MG-01", nome: "Manga renda" },
      }),
    ).toBe(false);
  });

  it("trabalho antigo, sem tipo nenhum gravado, é ajuste — e não vira", () => {
    expect(podeVirarPecaDoAcervo({ descricao: "Barra", status: "FEITO" })).toBe(false);
  });
});

describe("E156 — a ficha com que o cadastro abre", () => {
  it("o nome da peça é a descrição do trabalho", () => {
    expect(fichaDaConfeccao(pronta).nome).toBe("Manga renda c/ saia lisa");
  });

  it("a observação registra para quem a peça foi feita", () => {
    expect(fichaDaConfeccao(pronta).observacoes).toBe("Peça confeccionada para Dayfini.");
  });

  it("sem noiva na ficha, a observação não inventa nome", () => {
    expect(fichaDaConfeccao({ ...pronta, atendimento: null }).observacoes).toBe(
      "Peça confeccionada sob medida.",
    );
    // Nome em branco é o mesmo caso — um "Peça confeccionada para ." seria pior
    // que a frase genérica.
    expect(
      fichaDaConfeccao({ ...pronta, atendimento: { lead: { noivaNome: "  " } } }).observacoes,
    ).toBe("Peça confeccionada sob medida.");
  });
});
