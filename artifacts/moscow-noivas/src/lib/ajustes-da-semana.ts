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

/**
 * S-O27 — **"da semana" e "urgente" são DUAS coisas, e o comentário dizia que
 * eram uma.**
 *
 * A ficha do trabalho afirmava, na letra, *"a mesma régua de urgência da
 * fila"*, e as duas grafias existiam em três lugares com três resultados.
 * Medido em 2026-08-12:
 *
 * ```
 * caso                                             | naSemana | fila(cor) | ficha(cor)
 * casamento em 10 dias, sem prova, com bloqueio    |  false   |   true    |   true
 * casamento em 10 dias, sem prova, SEM bloqueio    |  false   |   false   |   true
 * casamento em  5 dias, sem prova, SEM bloqueio    |  true    |   false   |   true
 * ```
 *
 * A linha do meio e a de baixo são o achado, e a de baixo é a que dói: **a
 * confecção com casamento em 5 dias entra no recorte "esta semana" da fila e
 * sai CINZA nela** — a costureira lê a linha na lista da semana sem destaque
 * nenhum, e a mesma linha aparece vermelha quando ela abre a ficha. A causa é
 * a S-A05.5 pela metade: o E170 ensinou a FICHA a usar
 * `casamentoDeReferencia` (bloqueio ?? noiva) e deixou a fila lendo só o
 * bloqueio — e confecção não tem bloqueio, por definição.
 *
 * As duas ideias ficam separadas e nomeadas:
 *
 * - **`naSemana`** é o RECORTE — o que a fila lista por padrão e o que o
 *   cartão do painel conta. Sete dias, medidos pelo prazo (prova ou
 *   casamento). O nome promete uma semana e entrega uma semana.
 * - **`urgenteAjuste`** é a COR — prova a ≤7 dias, ou, sem prova, casamento a
 *   ≤14. O prazo maior é de propósito: sem prova marcada, a peça precisa estar
 *   pronta com folga antes do casamento, e quem descobre na semana descobre
 *   tarde.
 *
 * Uma linha vermelha FORA do recorte da semana é estado válido — casamento em
 * 10 dias é exatamente isso. O que não podia era a mesma linha ter duas cores
 * em duas telas.
 */
export function urgenteAjuste(a: AjusteComPrazo & { status?: string }): boolean {
  if (a.status === "FEITO") return false;
  const dias = a.proximaProva ? diasAteCasamento(a.proximaProva) : null;
  if (dias !== null) return dias <= 7;
  const casamento = casamentoDeReferencia(a);
  if (!casamento) return false;
  return diasAteCasamento(casamento) <= 14;
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
