import { describe, expect, it } from "vitest";
import { opcoesDeVendedora } from "./equipe-select";

/**
 * O10 (E169) — a comissão que trocava de bolso por um campo que parecia vazio.
 *
 * O diálogo de gerar contrato nasce com `vendedoraId` do orçamento (B1/E120) e
 * montava as opções com `equipe.filter((m) => m.ativo !== false)`. Quando a
 * vendedora do orçamento saiu da loja, o valor selecionado não tinha opção
 * correspondente e o `<SelectValue>` desenhava o placeholder: quem lesse
 * "Escolha…" escolhia outra pessoa, e os **R$ 250,00 de comissão (5% de uma
 * venda de R$ 5.000,00)** mudavam de dona sem que a tela dissesse uma palavra.
 * O servidor nunca filtrou nada — ele aceita a inativa de boa vontade.
 */
const ANA = { usuarioId: "u-ana", nome: "Ana", ativo: true };
const BIA = { usuarioId: "u-bia", nome: "Bia", ativo: true };
const CLARA_INATIVA = { usuarioId: "u-clara", nome: "Clara", ativo: false };

describe("opcoesDeVendedora — a lista dos ativos MAIS a selecionada", () => {
  it("sem ninguém selecionado, só os ativos aparecem", () => {
    expect(opcoesDeVendedora([ANA, BIA, CLARA_INATIVA], null)).toEqual([
      { id: "u-ana", rotulo: "Ana", ativa: true },
      { id: "u-bia", rotulo: "Bia", ativa: true },
    ]);
  });

  it("a desativada SELECIONADA volta para a lista, marcada", () => {
    const opcoes = opcoesDeVendedora([ANA, BIA, CLARA_INATIVA], "u-clara");
    expect(opcoes).toHaveLength(3);
    const clara = opcoes.find((o) => o.id === "u-clara");
    expect(clara?.rotulo).toBe("Clara (desativada)");
    expect(clara?.ativa).toBe(false);
  });

  it("a ativa selecionada não é duplicada nem remarcada", () => {
    const opcoes = opcoesDeVendedora([ANA, BIA], "u-ana");
    expect(opcoes.filter((o) => o.id === "u-ana")).toHaveLength(1);
    expect(opcoes.find((o) => o.id === "u-ana")?.rotulo).toBe("Ana");
  });

  it("id selecionado que não está na equipe vira rótulo honesto, não um id cru", () => {
    // O contrato de outra loja, ou a linha de equipe que sumiu: um id no
    // select seria pior que o branco. A tela diz o que sabe.
    const opcoes = opcoesDeVendedora([ANA], "u-fantasma");
    expect(opcoes.find((o) => o.id === "u-fantasma")?.rotulo).toBe(
      "Vendedora fora da equipe atual",
    );
  });

  it("equipe vazia com selecionada ainda desenha a opção — o campo nunca fica em branco", () => {
    expect(opcoesDeVendedora([], "u-clara")).toHaveLength(1);
  });
});
