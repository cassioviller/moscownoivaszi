import { describe, expect, it } from "vitest";
import { aluguelDaPeca, faixaNaTela } from "./faixa-da-avaria";

/**
 * E214 — **o aviso da tela sai da MESMA conta do servidor.**
 *
 * O que se prega aqui não é a aritmética das cláusulas (essa é da régua de
 * `financeiro/avaria.test.ts`, ao lado): é a escolha de QUAL aluguel perguntar,
 * que é onde a tela pode errar sozinha — e errava, porque a listagem de
 * contratos nem descia os itens antes deste épico.
 */
describe("faixa da avaria na tela — qual aluguel a tela pergunta", () => {
  const VESTIDO = "vestido-1";
  const ATIVO = {
    status: "ATIVO",
    itens: [{ vestidoId: VESTIDO, valorUnitario: 3000 }],
  };

  it("o contrato ATIVO manda, e o cancelado é ignorado", () => {
    // Se lesse o cancelado, anunciaria teto de R$ 50.000,00 num contrato que o
    // servidor não vai aceitar cobrar.
    const teto = aluguelDaPeca({
      contratos: [
        { status: "CANCELADO", itens: [{ vestidoId: VESTIDO, valorUnitario: 10000 }] },
        ATIVO,
      ],
      vestidoId: VESTIDO,
    });
    expect(teto).toBe(3000);
  });

  it("a peça que não é item do contrato não tem aluguel", () => {
    // O véu pendurado na reserva-mãe, que entrou depois do fechamento.
    expect(aluguelDaPeca({ contratos: [ATIVO], vestidoId: "veu-2" })).toBeNull();
  });

  it("sem contrato ativo, sem itens ou sem peça, não há aluguel", () => {
    expect(aluguelDaPeca({ contratos: [], vestidoId: VESTIDO })).toBeNull();
    expect(aluguelDaPeca({ contratos: undefined, vestidoId: VESTIDO })).toBeNull();
    expect(aluguelDaPeca({ contratos: [{ status: "ATIVO" }], vestidoId: VESTIDO })).toBeNull();
    expect(aluguelDaPeca({ contratos: [ATIVO], vestidoId: null })).toBeNull();
  });

  it("duas linhas para a mesma peça devolvem a MAIOR — o mesmo desempate do servidor", () => {
    const teto = aluguelDaPeca({
      contratos: [{ status: "ATIVO", itens: [
        { vestidoId: VESTIDO, valorUnitario: 800 },
        { vestidoId: VESTIDO, valorUnitario: 3000 },
      ] }],
      vestidoId: VESTIDO,
    });
    expect(teto).toBe(3000);
  });

  it("o veredicto da tela é o mesmo da porta: teto de 5× o aluguel encontrado", () => {
    expect(faixaNaTela({ contratos: [ATIVO], vestidoId: VESTIDO, tipo: "DANO", valor: 9000 }))
      .toMatchObject({ teto: 15000, dentroDaFaixa: true });
    expect(faixaNaTela({ contratos: [ATIVO], vestidoId: VESTIDO, tipo: "DANO", valor: 20000 }))
      .toMatchObject({ motivo: "ACIMA_DO_TETO", exigeJustificativa: true });
  });

  it("a limpeza não olha o contrato — a faixa da 14ª é absoluta", () => {
    // Mesmo sem contrato nenhum, a tela sabe anunciar 350–2.500.
    expect(faixaNaTela({ contratos: [], vestidoId: VESTIDO, tipo: "LIMPEZA", valor: 50 }))
      .toMatchObject({ piso: 350, teto: 2500, motivo: "ABAIXO_DO_PISO" });
  });

  it("dano em peça sem contrato: a tela diz que o valor entra SEM ser conferido", () => {
    // Não é recusa — a 15ª não alcança o caso. É aviso: a vendedora lê que o
    // número não foi conferido contra teto nenhum, no momento em que o digita.
    expect(faixaNaTela({ contratos: [], vestidoId: VESTIDO, tipo: "DANO", valor: 4000 }))
      .toMatchObject({ tetoIndeterminado: true, conferida: false, exigeJustificativa: false });
  });
});
