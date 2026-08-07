import { diasAteCasamento } from "@/pages/noivas/helpers";

/**
 * E132 (D10) — o recorte "esta semana" da fila de ajustes, extraído para a
 * decisão morar num lugar só: a fila (`/ajustes`, recorte default) e o cartão
 * do painel contam o MESMO conjunto por construção — a disciplina do F7 (um
 * painel que promete 3 e a fila entrega 5 é pior que um painel calado).
 *
 * O prazo de um ajuste é a PRÓXIMA PROVA quando existe, senão o casamento —
 * a mesma régua que a fila já usava inline.
 */

type AjusteComPrazo = {
  status?: string;
  proximaProva?: string | null;
  atendimento?: { bloqueio?: { casamentoData?: string | null } | null } | null;
};

export function prazoDias(a: AjusteComPrazo): number | null {
  const referencia = a.proximaProva ?? a.atendimento?.bloqueio?.casamentoData;
  return referencia ? diasAteCasamento(referencia) : null;
}

/** Prazo conhecido e dentro de 7 dias — atrasado (< 0) também é "da semana". */
export function naSemana(a: AjusteComPrazo): boolean {
  const dias = prazoDias(a);
  return dias !== null && dias <= 7;
}

/** O que o cartão do painel conta: PENDENTE com prazo na semana. */
export function ajustesDaSemana<T extends AjusteComPrazo>(lista: readonly T[]): T[] {
  return lista.filter((a) => a.status === "PENDENTE" && naSemana(a));
}

// S-A17: os rótulos moravam inline na fila; a ficha do trabalho
// (`/ajustes/:ajusteId`) mostra o MESMO prazo com as MESMAS palavras.

export function rotuloProva(dias: number): string {
  if (dias < 0) return "prova atrasada";
  if (dias === 0) return "prova hoje";
  if (dias === 1) return "prova amanhã";
  return `prova em ${dias} dias`;
}

export function rotuloCasamento(dias: number): string {
  if (dias < 0) return "casamento passou";
  if (dias === 0) return "casamento hoje";
  if (dias === 1) return "casamento amanhã";
  return `casamento em ${dias} dias`;
}
