import { describe, expect, it } from "vitest";
import {
  OPCOES_DE_DURACAO_MIN,
  minutosDaProva,
  opcoesDeDuracaoDaProva,
  slotsDaProva,
} from "./duracao-da-prova";

/**
 * S-A10/S-A7 — a unidade de `provaDuracao` é SLOT de 30 min, e a dona fala em
 * minutos. Os números de referência são os que já vivem no repositório: o
 * seed usa `2` (= 1h, E2E 26) e as fixtures de API usam `3` (= 90 min,
 * `e115-portal-agenda-api.test.ts:92`).
 */
describe("duração da prova — slots do banco, minutos na tela", () => {
  it("converte os slots do banco nos minutos que a tela mostra", () => {
    expect(minutosDaProva(2)).toBe(60); // o seed: 2 slots = 1h
    expect(minutosDaProva(3)).toBe(90); // a fixture do E115
    expect(minutosDaProva(1)).toBe(30);
  });

  it("um zero gravado lê como 1 slot — a mesma defesa dos consumidores da agenda", () => {
    // O zod da rota aceita 0 (S-A7, sem `.min(1)`); `grade.tsx` faz
    // `Math.max(1, …)` ao desenhar. A tela diz o que a agenda faria.
    expect(minutosDaProva(0)).toBe(30);
  });

  it("converte os minutos escolhidos nos slots que a rota grava, e a volta bate", () => {
    expect(slotsDaProva(30)).toBe(1);
    expect(slotsDaProva(60)).toBe(2);
    expect(slotsDaProva(90)).toBe(3);
    expect(slotsDaProva(120)).toBe(4);
    for (const min of OPCOES_DE_DURACAO_MIN) {
      expect(minutosDaProva(slotsDaProva(min))).toBe(min);
    }
  });

  it("as opções do select trazem o valor vigente mesmo fora da lista padrão", () => {
    // Uma loja que gravou 5 slots (150 min) por PATCH direto abre o campo e
    // vê a própria configuração, não a de fábrica.
    expect(opcoesDeDuracaoDaProva(150)).toEqual([30, 60, 90, 120, 150]);
    // Vigente dentro da lista não duplica.
    expect(opcoesDeDuracaoDaProva(60)).toEqual([30, 60, 90, 120]);
  });
});
