/**
 * S-A23 — quantos dias de prova a régua da loja realmente reserva, e quando
 * esse número vira zero sem ninguém perceber.
 *
 * A janela de PROVA de uma reserva nasce em `casamento − provaDiasAntes` e
 * termina um dia antes de o USO começar, ou seja em `casamento − usoDiasAntes −
 * 1` (`api-server/src/lib/disponibilidade.ts`). Ela só existe enquanto o início
 * for anterior ao fim, e a conta se resume a uma comparação:
 *
 *     existe janela de prova  ⟺  provaDiasAntes > usoDiasAntes
 *
 * **Quando não existe, a reserva nasce sem período de prova nenhum, e nada é
 * dito.** Medido na régua, com casamento em 03/03:
 *
 *     prova=14 uso=3  →  PROVA, USO, LAVAGEM
 *     prova=3  uso=3  →  USO, LAVAGEM          ← a prova sumiu
 *     prova=2  uso=3  →  USO, LAVAGEM
 *
 * O padrão de fábrica (14 × 3) está longe da borda, então isto não morde
 * ninguém hoje; morde a primeira loja que configurar "prova até 3 dias antes".
 *
 * **A dona decidiu que a configuração não se recusa** — *"tudo pode ser
 * configurado em configurações"* —, e antes disso já havia dito que toda
 * reserva guarda ao menos um dia de prova (P7). As duas respostas convivem numa
 * só regra: o sistema **aceita e mostra**. O que ele não faz mais é apagar a
 * janela em silêncio.
 */
export function diasDeProva(regra: {
  provaDiasAntes?: number | null;
  usoDiasAntes?: number | null;
}): number {
  const prova = regra.provaDiasAntes ?? 0;
  const uso = regra.usoDiasAntes ?? 0;
  return Math.max(0, prova - uso);
}

export function temJanelaDeProva(regra: {
  provaDiasAntes?: number | null;
  usoDiasAntes?: number | null;
}): boolean {
  return diasDeProva(regra) > 0;
}
