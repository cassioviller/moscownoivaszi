/**
 * S-O5/R8 — **a prova que perdeu o vestido**, e por que ela é derivada.
 *
 * Cancelar uma reserva (`PATCH /reservas/:id` com `status: CANCELADA`)
 * soft-cancela todos os bloqueios vinculados — carimba `canceladoEm` — para
 * devolver as peças ao acervo. O que ela **não** faz é tocar em `atendimentos`:
 * a prova segue `AGENDADO` apontando um bloqueio que a disponibilidade
 * (`disponibilidade.ts:409`) e o `EXCLUDE` do banco já não enxergam, porque os
 * dois só olham `cancelado_em IS NULL`.
 *
 * Medido em 2026-08-12, na porta:
 *
 * ```
 * DELETE /bloqueios       : 409 BLOQUEIO_COM_HISTORICO   ← a porta que RECUSA
 * PATCH reserva CANCELADA : 200                          ← a porta sem guarda
 * bloqueio.canceladoEm    : 2026-08-12T08:05:59.072Z
 * atendimento.situacao    : AGENDADO
 * outra noiva reservou a mesma peça: 201
 * provas AGENDADAS no bloqueio morto: 1
 * ```
 *
 * **A ironia é o achado:** o `DELETE /bloqueios` recusa com 409 justamente
 * porque os atendimentos sumiriam junto (E115), e o comentário dele manda usar
 * o soft-cancel — *"quem quer tirar a peça do caminho usa o soft-cancel"*. A
 * saída que o código recomenda é a única que não tem guarda nenhuma.
 *
 * **Decisão da dona em 2026-08-12: a prova FICA, e o sistema para de tratá-la
 * como promessa viva.** Cancelar sozinho o compromisso da noiva perderia o
 * horário dela — e o sistema não sabe se ela desistiu ou só está trocando de
 * vestido. Quem decide é a loja, com a noiva na linha; o que muda é que agora
 * ela sabe.
 *
 * **Não há coluna nova, e é de propósito** (regra 26 — nada de segunda cópia da
 * regra para divergir). O estado já está no dado: o atendimento carrega o
 * `bloqueio` inteiro em toda resposta de `GET /atendimentos`
 * (`agenda.ts:230-243`, `ATENDIMENTO_WITH`), e `canceladoEm` já viaja nele
 * (`openapi.yaml:5836`). A informação chegava na tela desde sempre; ninguém a
 * lia.
 */

/** O que basta saber sobre o atendimento para responder à pergunta. */
export type AtendimentoParaOrfandade = {
  tipo?: string | null;
  situacao?: string | null;
  bloqueio?: { canceladoEm?: string | Date | null } | null;
};

/**
 * A prova perdeu o vestido: é PROVA, ainda está de pé, e o bloqueio dela foi
 * cancelado.
 *
 * `situacao` entra na conta porque prova **CONCLUIDO** ou **FALTOU** é
 * história, não promessa — a noiva já veio (ou não veio), e avisar sobre o
 * vestido de um fato passado é ruído. `EM_ATENDIMENTO` conta como de pé: ela
 * está na cabine agora, e é o pior momento para a loja descobrir sozinha.
 */
export function provaPerdeuOVestido(a: AtendimentoParaOrfandade | null | undefined): boolean {
  if (!a) return false;
  if (a.tipo !== "PROVA") return false;
  if (a.situacao !== "AGENDADO" && a.situacao !== "EM_ATENDIMENTO") return false;
  return a.bloqueio?.canceladoEm != null;
}

/**
 * A frase, num lugar só. Ela aparece na grade da agenda, na semana, na ficha da
 * noiva e na fila de provas — e uma frase copiada em quatro telas é a S-M9 na
 * letra.
 *
 * Diz a CONSEQUÊNCIA, não o estado interno: quem lê não quer saber que
 * `canceladoEm` deixou de ser nulo, quer saber que a noiva vem experimentar um
 * vestido que não é mais dela.
 */
export const PROVA_ORFA_SELO = "Reserva cancelada";

export const PROVA_ORFA_EXPLICACAO =
  "O vestido saiu desta noiva quando a reserva foi cancelada. A prova continua marcada — " +
  "confirme com ela antes do horário, ou desmarque.";

/** Quantas provas de uma lista perderam o vestido. Zero é o normal. */
export function contarProvasOrfas(atendimentos: readonly AtendimentoParaOrfandade[]): number {
  return atendimentos.filter(provaPerdeuOVestido).length;
}
