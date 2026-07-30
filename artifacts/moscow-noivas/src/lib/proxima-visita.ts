/**
 * E125 (D3) — a próxima visita marcada da noiva, derivada da agenda DELA.
 *
 * A ligação mais comum do ateliê é "que dia mesmo é a minha prova?", e a ficha
 * — a tela de "quem ela é" — não pedia a agenda: a resposta custava 2 telas e
 * uma digitação (/atendimentos → aba Provas → buscar o nome). A query
 * recortada (`GET /atendimentos?leadId=&de=hoje`) traz a janela; esta função
 * decide O QUE é "a próxima": a mais cedo ainda AGENDADA que ainda não
 * começou. EM_ATENDIMENTO é agora (não "próxima"), CONCLUIDO/FALTOU são
 * passado mesmo quando o relógio ainda não virou o dia.
 *
 * Regra pura de propósito, como `proximo-passo.ts` ao lado: dá para testar
 * sem montar tela.
 */

export type VisitaAgendada = {
  tipo: string;
  inicio: string | Date;
  situacao: string;
};

export function proximaVisita<T extends VisitaAgendada>(
  atendimentos: readonly T[],
  agora: Date = new Date(),
): T | null {
  const futuras = atendimentos
    .filter(
      (a) => a.situacao === "AGENDADO" && new Date(a.inicio).getTime() >= agora.getTime(),
    )
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  return futuras[0] ?? null;
}
