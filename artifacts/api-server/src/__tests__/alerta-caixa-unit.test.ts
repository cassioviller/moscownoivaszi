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
