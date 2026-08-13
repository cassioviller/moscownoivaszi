import { describe, expect, it } from "vitest";
import { aluguelDaPeca, faixaDaAvariaRegistrada, faixaNaTela } from "./faixa-da-avaria";

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

  /**
   * **S-C47 — a avaria que já existe LÊ o teto; ela não o recalcula.**
   *
   * O servidor confere o teto contra o contrato que **COBRA** o reparo, e esta
   * tela só conhece o contrato **ATIVO** da noiva. Enquanto os dois coincidiam
   * ninguém via a diferença — e o furo medido é o bloqueio SEM dona, que o
   * `POST /cobrar` aceita cobrar em contrato de qualquer noiva da loja: ali a
   * tela não tem contrato nenhum para perguntar e anunciava "entra sem ser
   * conferido" sobre um véu com teto de R$ 2.000,00.
   */
  describe("a avaria registrada lê o teto do payload", () => {
    it("o véu do bloqueio sem dona tem teto no servidor, e agora a tela o mostra", () => {
      // O véu vale R$ 400,00 no contrato que cobra o reparo → teto R$ 2.000,00.
      const avaria = { aluguelDaPeca: 400 };
      expect(faixaDaAvariaRegistrada({ avaria, tipo: "DANO", valor: 2500 })).toMatchObject({
        teto: 2000,
        conferida: true,
        motivo: "ACIMA_DO_TETO",
        exigeJustificativa: true,
      });
      // A conta antiga, pelo contrato ATIVO da noiva, não tinha o que perguntar
      // (bloqueio sem dona ⇒ nenhum contrato na tela) e dizia o contrário: os
      // R$ 2.500,00 entravam sem justificativa e o PATCH devolvia 422.
      expect(faixaNaTela({ contratos: [], vestidoId: "veu-2", tipo: "DANO", valor: 2500 }))
        .toMatchObject({ tetoIndeterminado: true, exigeJustificativa: false });
    });

    it("o payload manda mesmo quando a tela tem um contrato ATIVO que diz outra coisa", () => {
      // O mesmo vestido: R$ 3.000,00 no contrato ATIVO da noiva (teto
      // R$ 15.000,00) e R$ 400,00 no contrato que cobra (teto R$ 2.000,00).
      // R$ 9.000,00 é o número da auditoria do E214, e ele cabe num e não no
      // outro — quem decide é a porta.
      expect(faixaDaAvariaRegistrada({ avaria: { aluguelDaPeca: 400 }, tipo: "DANO", valor: 9000 }))
        .toMatchObject({ teto: 2000, motivo: "ACIMA_DO_TETO" });
      expect(faixaNaTela({ contratos: [ATIVO], vestidoId: VESTIDO, tipo: "DANO", valor: 9000 }))
        .toMatchObject({ teto: 15000, dentroDaFaixa: true });
    });

    it("trocar o tipo troca a régua sobre o MESMO aluguel — é por isso que viaja o aluguel, não o teto", () => {
      const avaria = { aluguelDaPeca: 400 };
      // 15ª: teto de 5 × R$ 400,00. 14ª: faixa absoluta, e o contrato não entra.
      expect(faixaDaAvariaRegistrada({ avaria, tipo: "DANO", valor: 2400 }))
        .toMatchObject({ clausula: "15ª", teto: 2000, motivo: "ACIMA_DO_TETO" });
      expect(faixaDaAvariaRegistrada({ avaria, tipo: "LIMPEZA", valor: 2400 }))
        .toMatchObject({ clausula: "14ª", piso: 350, teto: 2500, dentroDaFaixa: true });
    });

    it("sem aluguel no payload, o veredicto é o de peça fora de contrato — e o diálogo fechado também", () => {
      expect(faixaDaAvariaRegistrada({ avaria: { aluguelDaPeca: null }, tipo: "DANO", valor: 4000 }))
        .toMatchObject({ tetoIndeterminado: true, conferida: false, exigeJustificativa: false });
      expect(faixaDaAvariaRegistrada({ avaria: null, tipo: "DANO", valor: 4000 }))
        .toMatchObject({ tetoIndeterminado: true, conferida: false });
    });
  });
});
