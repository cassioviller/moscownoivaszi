/**
 * E155 — quais trabalhos da fila da costureira este orçamento pode cobrar.
 *
 * Duas condições, e as duas têm consequência quando faltam:
 *
 * · **CONFECÇÃO, não ajuste.** Ajuste de peça alugada não se cobra à parte —
 *   oferecer "bainha 3cm" como item de venda convida a cobrar duas vezes o que
 *   já está no aluguel. Confecção é peça nova, e essa se cobra.
 * · **Desta noiva.** Sem o recorte, o seletor ofereceria a manga que a
 *   costureira faz para outra — o servidor recusa (404, `ajusteDaNoiva`), mas
 *   uma lista que oferece o que não pode ser escolhido é um erro esperando a
 *   vendedora na frente da noiva.
 *
 * O dono do trabalho é o lead do ATENDIMENTO que o gerou: a fila não tem
 * coluna de noiva, tem a conversa que a marcou.
 */
export interface TrabalhoDaFila {
  id: string;
  tipo?: string;
  descricao: string;
  custo?: number | null;
  atendimento?: { leadId?: string } | null;
}

export function confeccoesDaNoiva<T extends TrabalhoDaFila>(
  fila: readonly T[],
  leadId: string | null | undefined,
): T[] {
  if (!leadId) return [];
  return fila.filter((t) => t.tipo === "CONFECCAO" && t.atendimento?.leadId === leadId);
}
