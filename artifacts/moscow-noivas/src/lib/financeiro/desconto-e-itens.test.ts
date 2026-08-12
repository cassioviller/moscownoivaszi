import { describe, expect, it } from "vitest";
import { recusaAoEditarItem, recusaAoRemoverItem } from "./desconto-e-itens";

/**
 * S-O49 — a pergunta que a tela do orçamento não fazia antes do clique.
 *
 * Os números são os do S-O25/E174, medidos contra o servidor em 2026-08-12:
 * desconto de R$ 4.000,00 em VALOR sobre R$ 5.000,00 de itens passa (e deve);
 * tirar o item de R$ 2.000,00 deixa bruto R$ 3.000,00 contra desconto de
 * R$ 4.000,00, e o total do orçamento clampa em R$ 0,00.
 */

const VESTIDO = { id: "i1", valorUnitario: 3000, quantidade: 1 };
const VEU = { id: "i2", valorUnitario: 2000, quantidade: 1 };

const ORCAMENTO = {
  descontoTipo: "VALOR",
  descontoValor: 4000,
  itens: [VESTIDO, VEU],
};

describe("S-O49 — remover item, com a recusa do servidor dita antes", () => {
  it("o item que sustenta o desconto não sai calado: a recusa diz os dois números", () => {
    const recusa = recusaAoRemoverItem(ORCAMENTO, "i2");
    expect(recusa?.error).toBe("DESCONTO_INVALIDO");
    // A frase é a do 422 — a mesma função, então o texto não pode divergir.
    expect(recusa?.detalhe).toContain("R$ 4.000,00");
    expect(recusa?.detalhe).toContain("R$ 3.000,00");
  });

  it("o item que o desconto não precisa sai sem uma palavra", () => {
    // Tirar o véu de R$ 2.000,00 com desconto de R$ 1.000,00 deixa R$ 3.000,00
    // de itens — o desconto continua cabendo.
    expect(recusaAoRemoverItem({ ...ORCAMENTO, descontoValor: 1000 }, "i2")).toBeNull();
  });

  it("sem desconto não há teto para romper", () => {
    expect(recusaAoRemoverItem({ descontoTipo: null, descontoValor: null, itens: [VESTIDO, VEU] }, "i1")).toBeNull();
  });

  it("o percentual não depende dos itens — tirar tudo não o quebra", () => {
    // 40% de R$ 3.000,00 é R$ 1.200,00; de R$ 0,00 é R$ 0,00. O clamp do
    // `liquidoEmCentavos` nunca morde, e o servidor também não recusa.
    const so40 = { descontoTipo: "PERCENTUAL", descontoValor: 40, itens: [VESTIDO, VEU] };
    expect(recusaAoRemoverItem(so40, "i1")).toBeNull();
    expect(recusaAoRemoverItem(so40, "i2")).toBeNull();
  });

  it("o último item que sai leva o bruto a zero, e aí todo desconto em reais é grande demais", () => {
    expect(recusaAoRemoverItem({ ...ORCAMENTO, itens: [VEU], descontoValor: 1500 }, "i2")?.error).toBe(
      "DESCONTO_INVALIDO",
    );
  });
});

describe("S-O49 — a mesma pergunta para o PATCH do item", () => {
  it("baixar a quantidade derruba o bruto igual: 5 → 1 é R$ 5.000,00 → R$ 1.000,00", () => {
    const cincoVeus = {
      descontoTipo: "VALOR",
      descontoValor: 4000,
      itens: [{ id: "i2", valorUnitario: 1000, quantidade: 5 }],
    };
    expect(recusaAoEditarItem(cincoVeus, "i2", { valorUnitario: 1000, quantidade: 5 })).toBeNull();
    expect(recusaAoEditarItem(cincoVeus, "i2", { valorUnitario: 1000, quantidade: 1 })?.error).toBe(
      "DESCONTO_INVALIDO",
    );
  });

  it("baixar o valor unitário rompe o mesmo teto", () => {
    expect(recusaAoEditarItem(ORCAMENTO, "i1", { valorUnitario: 500, quantidade: 1 })?.error).toBe(
      "DESCONTO_INVALIDO",
    );
    // E SUBIR o valor não rompe nada: o bruto só cresce.
    expect(recusaAoEditarItem(ORCAMENTO, "i1", { valorUnitario: 9000, quantidade: 1 })).toBeNull();
  });

  it("item que não está na lista não muda o bruto — a pergunta segue sendo sobre o que existe", () => {
    expect(recusaAoEditarItem(ORCAMENTO, "sumiu", { valorUnitario: 1, quantidade: 1 })).toBeNull();
  });
});
