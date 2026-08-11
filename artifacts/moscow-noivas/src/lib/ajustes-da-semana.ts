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
  atendimento?: {
    bloqueio?: { casamentoData?: string | Date | null } | null;
    lead?: { casamentoData?: string | Date | null } | null;
  } | null;
};

/**
 * E170/A05.5 — o casamento que serve de prazo é o da NOIVA, e o do bloqueio é
 * só onde ele costuma estar.
 *
 * A régua lia `bloqueio.casamentoData` e mais nada. A confecção é justamente o
 * trabalho SEM peça de acervo (`schema/atendimentos.ts:156-157`): sem vestido
 * não há reserva, sem reserva não há bloqueio — e o prazo virava `null`, a
 * costureira lia "Sem prazo definido" e a noiva casava em 40 dias. O dado já
 * viajava pela rede: `agenda.ts:1002` carrega `lead: true` e
 * `AjusteAtendimento.lead` expõe `casamentoData`. Era descartado na chegada.
 *
 * Exportada porque a ficha do trabalho (`ajustes/[ajusteId].tsx`) calculava a
 * mesma referência inline — duas grafias da mesma régua é como a regra 26 do
 * METODO descreve o sítio que esquece.
 */
export function casamentoDeReferencia(a: AjusteComPrazo): string | null {
  // O tipo gerado diz `Date` e a rede entrega ISO; a régua devolve uma grafia só.
  const data = a.atendimento?.bloqueio?.casamentoData ?? a.atendimento?.lead?.casamentoData;
  if (!data) return null;
  return data instanceof Date ? data.toISOString() : data;
}

export function prazoDias(a: AjusteComPrazo): number | null {
  const referencia = a.proximaProva ?? casamentoDeReferencia(a);
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
