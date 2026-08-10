/**
 * S-A10/S-A7 — a régua ÚNICA de conversão entre a unidade do banco e a da
 * dona.
 *
 * `provaDuracao` é contado em SLOTS de 30 minutos (`SLOT_MINUTOS`, de
 * `@workspace/agenda-core`): o seed grava 2 e a prova dura 1h. A dona nunca
 * deve ver nem digitar o número cru — a tela de Configurações já mostrava a
 * conversão inline (`provaDuracao * 30`, do E148), e o campo editável de
 * "Cabines & horário" precisa da volta (minutos → slots). Duas contas soltas
 * em duas telas é a regra 26 dizendo que falta uma função; ela mora aqui.
 *
 * O `Math.max(1, …)` é a MESMA leitura defensiva dos consumidores da agenda
 * (`grade.tsx:180`, `Math.max(1, expediente.provaDuracao ?? 1)`): o zod da
 * rota aceita `provaDuracao: 0` sem `.min(1)` (S-A7), e um zero gravado é
 * tratado em toda leitura como 1 slot — a tela diz o que a agenda faria.
 */
import { SLOT_MINUTOS } from "@/lib/agenda";

/** O que a dona escolhe: meia hora a duas horas, no passo da grade. */
export const OPCOES_DE_DURACAO_MIN = [30, 60, 90, 120] as const;

/** Slots do banco → minutos na tela. `2 → 60`. */
export function minutosDaProva(slots: number): number {
  return Math.max(1, slots) * SLOT_MINUTOS;
}

/** Minutos escolhidos → slots que a rota grava. `90 → 3`. */
export function slotsDaProva(minutos: number): number {
  return Math.max(1, Math.round(minutos / SLOT_MINUTOS));
}

/**
 * As opções do select, com o valor VIGENTE sempre presente: uma loja que já
 * gravou 150 min por PATCH direto não pode abrir o campo e ver a própria
 * configuração como se fosse outra.
 */
export function opcoesDeDuracaoDaProva(minutosVigentes: number): number[] {
  const opcoes = new Set<number>([...OPCOES_DE_DURACAO_MIN, minutosVigentes]);
  return [...opcoes].sort((a, b) => a - b);
}
