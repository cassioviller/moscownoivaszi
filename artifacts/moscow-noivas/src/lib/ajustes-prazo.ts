import { diasAteCasamento } from "@/pages/noivas/helpers";

/**
 * E132 (D10) — o recorte da fila de ajustes, extraído para a decisão morar num
 * lugar só: a fila (`/ajustes`, recorte default) e o cartão do painel contam o
 * MESMO conjunto por construção — a disciplina do F7 (um painel que promete 3
 * e a fila entrega 5 é pior que um painel calado).
 *
 * O prazo de um ajuste é a PRÓXIMA PROVA quando existe, senão o casamento —
 * a mesma régua que a fila já usava inline.
 *
 * **E183 — o arquivo se chamava `ajustes-da-semana.ts` e o recorte não é mais
 * de uma semana.** Até aqui havia DUAS réguas: o recorte cortava em 7 dias e a
 * cor acendia a 14, então a costureira via a peça vermelha só se trocasse de
 * aba — e a aba padrão é a que ela abre de manhã. Decisão da dona em
 * 2026-08-12: **o recorte passa a enxergar o que a cor enxerga.** As duas
 * viraram uma expressão só (`prazoApertado`), o arquivo, a função e os rótulos
 * das telas foram renomeados junto, e a S-O27 fecha pela raiz — não havia como
 * alinhar filtro e destaque mantendo dois números.
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

/**
 * **A ÚNICA expressão de "está apertado" do módulo** — prova marcada manda
 * (≤7 dias); sem prova, vale o casamento (≤14). Atrasado (< 0) entra também.
 *
 * A folga maior sem prova é de propósito e é a régua que o E175 já tinha
 * escrito: sem prova marcada, a peça precisa estar pronta ANTES do casamento,
 * e quem descobre na semana descobre tarde.
 *
 * Ela é privada para não haver por onde nascer uma segunda grafia (regra 26):
 * quem quer o recorte chama `prazoApertado`, quem quer a cor chama
 * `urgenteAjuste`, e as duas descem para cá.
 */
function dentroDoPrazoDeAtencao(a: AjusteComPrazo): boolean {
  const dias = a.proximaProva ? diasAteCasamento(a.proximaProva) : null;
  if (dias !== null) return dias <= 7;
  const casamento = casamentoDeReferencia(a);
  if (!casamento) return false;
  return diasAteCasamento(casamento) <= 14;
}

/**
 * O RECORTE — o que a fila lista por padrão e o que o cartão do painel conta.
 *
 * **E183: era `naSemana`, e cortava em 7 dias.** O nome prometia uma semana e
 * entregava uma semana; o problema é que a COR acendia a 14, então a linha
 * vermelha da noiva que casa em 10 dias ficava fora da aba padrão. A costureira
 * só a encontrava trocando para "Todos", e ninguém troca de aba para procurar o
 * que não sabe que existe.
 */
export function prazoApertado(a: AjusteComPrazo): boolean {
  return dentroDoPrazoDeAtencao(a);
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
 * O E175 separou as duas ideias e as nomeou, e deixou escrito que *"uma linha
 * vermelha FORA do recorte da semana é estado válido"*. **O E183 desfez essa
 * parte por decisão da dona**, e o motivo é o da linha do meio da tabela acima:
 * o estado era válido e ninguém o via. Hoje a COR e o RECORTE são a mesma
 * expressão (`dentroDoPrazoDeAtencao`); o que separa `urgenteAjuste` de
 * `prazoApertado` é só o FEITO — trabalho pronto não acende, mas continua
 * podendo ser listado.
 */
export function urgenteAjuste(a: AjusteComPrazo & { status?: string }): boolean {
  if (a.status === "FEITO") return false;
  return dentroDoPrazoDeAtencao(a);
}

/** O que o cartão do painel conta: PENDENTE com o prazo apertado. */
export function ajustesComPrazoApertado<T extends AjusteComPrazo>(lista: readonly T[]): T[] {
  return lista.filter((a) => a.status === "PENDENTE" && prazoApertado(a));
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
