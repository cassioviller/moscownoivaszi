import { describe, expect, it } from "vitest";
import { avisosDeEstoque, nomeDoItemEstoque } from "./estoque-aviso";

/**
 * E154 — a frase que a vendedora lê quando o saiote não dá para todo mundo.
 *
 * O que se prega aqui é a decisão do épico: a conta soma o que ESTE orçamento
 * pede ao que os contratos ativos já comprometeram, e o resultado é uma frase
 * — nunca um bloqueio.
 */
const SAIOTE = "id-saiote";
const CRINOL = "id-crinol";
const DIA = "2026-09-19";

describe("E154 — o aviso de estoque", () => {
  it("avisa com o total que sai no dia e o que a loja tem", () => {
    const avisos = avisosDeEstoque({
      itens: [{ tipo: "ESTOQUE", itemEstoqueId: SAIOTE, quantidade: 1 }],
      comprometimento: [
        { itemEstoqueId: SAIOTE, nome: "Saiote 2 aros", tamanho: null, quantidade: 2, comprometida: 2 },
      ],
      dia: DIA,
    });
    expect(avisos).toEqual(["3 × Saiote 2 aros para 19/09/2026 — a loja tem 2."]);
  });

  it("o tamanho entra na frase quando existe — é o que distingue duas araras", () => {
    expect(nomeDoItemEstoque({ nome: "Saiote liso", tamanho: "G" })).toBe("Saiote liso (G)");
    expect(nomeDoItemEstoque({ nome: "Crinol", tamanho: null })).toBe("Crinol");
  });

  it("dentro da quantidade, nenhuma frase — o aviso só aparece quando estoura", () => {
    const avisos = avisosDeEstoque({
      itens: [{ tipo: "ESTOQUE", itemEstoqueId: SAIOTE, quantidade: 1 }],
      comprometimento: [
        { itemEstoqueId: SAIOTE, nome: "Saiote 2 aros", quantidade: 5, comprometida: 2 },
      ],
      dia: DIA,
    });
    expect(avisos).toEqual([]);
  });

  it("bater na conta exata não é estouro", () => {
    const avisos = avisosDeEstoque({
      itens: [{ tipo: "ESTOQUE", itemEstoqueId: SAIOTE, quantidade: 1 }],
      comprometimento: [
        { itemEstoqueId: SAIOTE, nome: "Saiote 2 aros", quantidade: 3, comprometida: 2 },
      ],
      dia: DIA,
    });
    expect(avisos).toEqual([]);
  });

  it("duas linhas do MESMO item somam — a vendedora pode ter lançado em dois itens", () => {
    const avisos = avisosDeEstoque({
      itens: [
        { tipo: "ESTOQUE", itemEstoqueId: SAIOTE, quantidade: 1 },
        { tipo: "ESTOQUE", itemEstoqueId: SAIOTE, quantidade: 2 },
      ],
      comprometimento: [
        { itemEstoqueId: SAIOTE, nome: "Saiote 2 aros", quantidade: 2, comprometida: 0 },
      ],
      dia: DIA,
    });
    expect(avisos).toEqual(["3 × Saiote 2 aros para 19/09/2026 — a loja tem 2."]);
  });

  it("item que não é de estoque não conta, mesmo com quantidade alta", () => {
    const avisos = avisosDeEstoque({
      itens: [
        { tipo: "VESTIDO", itemEstoqueId: null, quantidade: 9 },
        { tipo: "SERVICO", quantidade: 9 },
      ],
      comprometimento: [
        { itemEstoqueId: SAIOTE, nome: "Saiote 2 aros", quantidade: 1, comprometida: 1 },
      ],
      dia: DIA,
    });
    expect(avisos).toEqual([]);
  });

  it("uma frase por item que estoura, e só por esses", () => {
    const avisos = avisosDeEstoque({
      itens: [
        { tipo: "ESTOQUE", itemEstoqueId: SAIOTE, quantidade: 2 },
        { tipo: "ESTOQUE", itemEstoqueId: CRINOL, quantidade: 1 },
      ],
      comprometimento: [
        { itemEstoqueId: SAIOTE, nome: "Saiote 2 aros", quantidade: 1, comprometida: 0 },
        { itemEstoqueId: CRINOL, nome: "Crinol", quantidade: 4, comprometida: 0 },
      ],
      dia: DIA,
    });
    expect(avisos).toEqual(["2 × Saiote 2 aros para 19/09/2026 — a loja tem 1."]);
  });

  it("noiva sem data de casamento não gera aviso — sem dia não há conta", () => {
    const avisos = avisosDeEstoque({
      itens: [{ tipo: "ESTOQUE", itemEstoqueId: SAIOTE, quantidade: 9 }],
      comprometimento: [
        { itemEstoqueId: SAIOTE, nome: "Saiote 2 aros", quantidade: 1, comprometida: 0 },
      ],
      dia: null,
    });
    expect(avisos).toEqual([]);
  });
});
