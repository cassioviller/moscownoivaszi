import { describe, expect, it } from "vitest";
import { diasDeProva, temJanelaDeProva } from "./janela-de-prova";

/**
 * S-A23 — a janela de prova que some sem avisar.
 *
 * Cada caso aqui foi medido antes na régua do servidor
 * (`api-server/src/lib/disponibilidade.ts`), com casamento em 03/03: é a mesma
 * comparação, do lado da tela, para a loja ver o efeito da configuração ANTES
 * de a primeira reserva nascer sem período de prova.
 */
describe("S-A23 — quantos dias de prova a régua reserva", () => {
  it("o padrão de fábrica reserva 11 dias — prova 14, uso começa 3 antes", () => {
    expect(diasDeProva({ provaDiasAntes: 14, usoDiasAntes: 3 })).toBe(11);
    expect(temJanelaDeProva({ provaDiasAntes: 14, usoDiasAntes: 3 })).toBe(true);
  });

  it("prova IGUAL ao uso apaga a janela — é a borda, e ela é silenciosa hoje", () => {
    expect(diasDeProva({ provaDiasAntes: 3, usoDiasAntes: 3 })).toBe(0);
    expect(temJanelaDeProva({ provaDiasAntes: 3, usoDiasAntes: 3 })).toBe(false);
  });

  it("prova MENOR que o uso também apaga — e não vira número negativo", () => {
    expect(diasDeProva({ provaDiasAntes: 2, usoDiasAntes: 3 })).toBe(0);
  });

  it("um dia a mais que o uso já é uma janela — a borda de baixo é 1", () => {
    expect(diasDeProva({ provaDiasAntes: 4, usoDiasAntes: 3 })).toBe(1);
    expect(temJanelaDeProva({ provaDiasAntes: 4, usoDiasAntes: 3 })).toBe(true);
  });

  it("regra ainda não configurada não estoura — vale zero, e a tela já diz isso", () => {
    expect(diasDeProva({})).toBe(0);
    expect(diasDeProva({ provaDiasAntes: null, usoDiasAntes: null })).toBe(0);
    expect(temJanelaDeProva({})).toBe(false);
  });
});
