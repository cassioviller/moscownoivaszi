import { describe, expect, it } from "vitest";
import { alertaDeCaixa } from "@workspace/financeiro-core";

/**
 * E46 — o núcleo do alerta de caixa. Ele compõe dois motores já provados
 * (`saldoDeHoje` e `projetarCaixa`), então o que precisa de prova aqui é o que
 * NASCE da composição:
 *
 *  1. sem âncora não há alerta — a regra que separa "vai furar" de alarme falso;
 *  2. o saldo de partida é o de HOJE (âncora + realizado), não a âncora crua;
 *  3. a mesma lista de parcelas serve às duas pernas sem uma contaminar a outra.
 */

const HOJE = "2026-07-21";
const opts = { horizonteDias: 30 as const, hoje: HOJE };

/** Data de negócio: meio-dia SP, a mesma convenção do banco. */
const vence = (dia: string) => `${dia}T12:00:00-03:00`;

const ancora = (valor: number, dia = "2026-07-20") => ({
  dataReferencia: `${dia}T12:00:00-03:00`,
  valor,
});

const prevista = (dia: string, valor: number) => ({
  status: "PREVISTA",
  vencimento: vence(dia),
  valorPrevisto: valor,
});

const paga = (dia: string, valor: number) => ({
  status: "PAGA",
  recebidoEm: `${dia}T15:00:00-03:00`,
  valorRecebido: valor,
  // A linha do banco traz as duas pernas; a projeção ignora o que não é PREVISTA.
  vencimento: vence(dia),
  valorPrevisto: valor,
});

/**
 * A parcela meio recebida (E49): o que entrou tem data de RECEBIMENTO, o que
 * falta tem data de VENCIMENTO — a mesma linha alimenta as duas pernas, cada
 * uma pelo seu campo. É o caso do C4, e a palavra PARCIAL não aparecia em
 * nenhum dos dois testes do alerta.
 */
const parcial = (
  recebidoDia: string,
  recebido: number,
  venceDia: string,
  previsto: number,
) => ({
  status: "PARCIAL",
  recebidoEm: `${recebidoDia}T15:00:00-03:00`,
  valorRecebido: recebido,
  vencimento: vence(venceDia),
  valorPrevisto: previsto,
});

describe("E46 — alerta de caixa", () => {
  it("sem âncora não dá alerta, mesmo com o caixa fadado a furar", () => {
    const a = alertaDeCaixa([], [], [prevista("2026-07-25", 9_000)], [], opts);

    expect(a.ancorado).toBe(false);
    // O ponto do épico: sem saldo conferido a curva partiria de ZERO e QUALQUER
    // conta a pagar acenderia o alarme — em toda loja, todo dia.
    expect(a.diaNegativo).toBeNull();
    expect(a.saldoHoje).toBeNull();
    expect(a.menorSaldo).toBeNull();
    expect(a.horizonteDias).toBe(30);
  });

  it("aponta o primeiro dia em que o saldo vira negativo", () => {
    const a = alertaDeCaixa(
      [ancora(5_000)],
      [prevista("2026-07-28", 1_000)],
      [prevista("2026-07-25", 4_000), prevista("2026-07-30", 3_000)],
      [],
      opts,
    );

    expect(a.ancorado).toBe(true);
    expect(a.saldoHoje).toBe(5_000);
    // 5.000 −4.000 = 1.000 (25) → +1.000 = 2.000 (28) → −3.000 = −1.000 (30).
    expect(a.diaNegativo).toBe("2026-07-30");
    expect(a.menorSaldo).toEqual({ dia: "2026-07-30", valor: -1_000 });
  });

  /**
   * S-M4 — o saldo de PARTIDA também é saldo. `montarCurva` só testava o
   * negativo DEPOIS de aplicar um evento: loja no vermelho HOJE e sem evento
   * no horizonte não acendia nada, e com eventos bastava a primeira entrada
   * devolver o saldo ao positivo para o alerta sumir igual.
   */
  it("S-M4 — a loja já negativa HOJE acende o alerta, mesmo sem evento nenhum", () => {
    const a = alertaDeCaixa([ancora(-2_000)], [], [], [], opts);

    expect(a.ancorado).toBe(true);
    expect(a.saldoHoje).toBe(-2_000);
    // VERMELHO ANTES: null — R$ 2.000,00 no vermelho e o cartão não aparecia.
    expect(a.diaNegativo).toBe(HOJE);
    expect(a.menorSaldo).toEqual({ dia: null, valor: -2_000 });
  });

  it("S-M4 — a entrada que salva a curva não apaga o vermelho de hoje", () => {
    const a = alertaDeCaixa(
      [ancora(-2_000)],
      [prevista("2026-07-23", 6_000)],
      [prevista("2026-07-28", 1_000)],
      [],
      opts,
    );

    // A curva termina positiva (−2.000 → +4.000 → +3.000), mas o PRIMEIRO dia
    // negativo é hoje — e é hoje que a dona precisa saber.
    expect(a.diaNegativo).toBe(HOJE);
    expect(a.menorSaldo).toEqual({ dia: null, valor: -2_000 });
  });

  it("cala quando o previsto cobre o horizonte inteiro", () => {
    const a = alertaDeCaixa(
      [ancora(5_000)],
      [prevista("2026-07-24", 2_000)],
      [prevista("2026-07-25", 1_500)],
      [],
      opts,
    );

    expect(a.ancorado).toBe(true);
    expect(a.diaNegativo).toBeNull();
    expect(a.menorSaldo).toEqual({ dia: null, valor: 5_000 });
  });

  it("parte do saldo de HOJE: o realizado desde a âncora entra antes da curva", () => {
    // Mesma conta a pagar dos casos acima, mas entre a âncora e hoje saiu
    // dinheiro do caixa. Usar a âncora crua (5.000) esconderia o furo.
    const a = alertaDeCaixa(
      [ancora(5_000)],
      [paga("2026-07-20", 500)],
      [prevista("2026-07-25", 4_000)],
      [{ data: "2026-07-21T10:00:00-03:00", valorPago: 2_000 }],
      opts,
    );

    expect(a.saldoHoje).toBe(3_500); // 5.000 + 500 − 2.000
    expect(a.diaNegativo).toBe("2026-07-25");
    expect(a.menorSaldo).toEqual({ dia: "2026-07-25", valor: -500 });
  });

  it("a parcela PAGA não é contada duas vezes: entra no saldo, não na curva", () => {
    // A recebida vence DENTRO do horizonte. Se a projeção a somasse de novo, o
    // caixa apareceria 4.000 mais rico e o furo sumiria.
    const a = alertaDeCaixa(
      [ancora(1_000)],
      [paga("2026-07-21", 4_000)],
      [prevista("2026-07-26", 6_000)],
      [],
      opts,
    );

    expect(a.saldoHoje).toBe(5_000);
    expect(a.diaNegativo).toBe("2026-07-26");
    expect(a.menorSaldo).toEqual({ dia: "2026-07-26", valor: -1_000 });
  });

  it("a parcela PARCIAL entra nas DUAS pernas: o recebido no saldo, o resto na curva", () => {
    // C4/E94. 10.000 previstos, 4.000 já recebidos em 21/07, vence 26/07.
    // Se ela ficasse de fora das duas pernas — que é o que o SQL da rota fazia —
    // o saldo perderia os 4.000 QUE ENTRARAM e a curva perderia os 6.000 QUE
    // VÃO ENTRAR, e o alerta anunciaria um furo que a projeção não vê.
    const a = alertaDeCaixa(
      [ancora(1_000)],
      [parcial("2026-07-21", 4_000, "2026-07-26", 10_000)],
      [prevista("2026-07-28", 9_000)],
      [],
      opts,
    );

    expect(a.saldoHoje).toBe(5_000); // 1.000 + 4.000 recebidos
    // 5.000 +6.000 (o saldo aberto da parcial, em 26) = 11.000 → −9.000 = 2.000.
    expect(a.diaNegativo).toBeNull();
    expect(a.menorSaldo).toEqual({ dia: "2026-07-28", valor: 2_000 });
  });

  it("a PARCIAL leva para a curva o SALDO, não o previsto cheio", () => {
    // O erro simétrico do anterior: contar os 10.000 na curva depois de já ter
    // contado 4.000 no saldo receberia o mesmo dinheiro duas vezes.
    const a = alertaDeCaixa(
      [ancora(0)],
      [parcial("2026-07-21", 4_000, "2026-07-26", 10_000)],
      [prevista("2026-07-27", 10_500)],
      [],
      opts,
    );

    expect(a.saldoHoje).toBe(4_000);
    // 4.000 +6.000 = 10.000 (26) → −10.500 = −500 (27). Com o previsto cheio
    // daria +3.500 e o alarme não tocaria.
    expect(a.diaNegativo).toBe("2026-07-27");
    expect(a.menorSaldo).toEqual({ dia: "2026-07-27", valor: -500 });
  });

  it("o que vence além do horizonte não acende alarme", () => {
    const a = alertaDeCaixa(
      [ancora(1_000)],
      [],
      [prevista("2026-09-15", 50_000)],
      [],
      opts,
    );

    expect(a.diaNegativo).toBeNull();
    expect(a.menorSaldo).toEqual({ dia: null, valor: 1_000 });
  });
});
