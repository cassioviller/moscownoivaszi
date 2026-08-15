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
  /** E240/S-O50 — o dia (AAAA-MM-DD) que a costureira fixou para a confecção. */
  prazoProprio?: string | null;
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

/**
 * E240/S-O50 (decisão da dona, 15/08/2026) — **a confecção ganha prazo
 * próprio, e a régua ganha um degrau no meio.**
 *
 * A referência do prazo era `proximaProva ?? casamento`. Agora é
 * **prova → prazo próprio → casamento**, nesta ordem, e a ordem é o que se
 * decide aqui: a prova marcada continua mandando sobre tudo, porque é para ela
 * que a peça precisa estar pronta; o prazo que a costureira fixou manda sobre
 * o casamento, porque foi para isso que ela o fixou. Medido no `heliumdb` em
 * 15/08: 7 ajustes, 5 confecções, todas com o prazo saindo do casamento — o
 * campo nasce vazio para todas elas, e nada muda até alguém preenchê-lo.
 *
 * A ORIGEM viaja junto porque o rótulo depende dela ("prova em 3 dias",
 * "prazo em 3 dias", "casamento em 3 dias" são três frases), e porque o limiar
 * de atenção também: prova é ≤ `PROVA_APERTADA_DIAS`; prazo próprio e
 * casamento são ≤ `CASAMENTO_APERTADO_DIAS` — os dois são o dia em que a peça
 * tem de estar PRONTA, e a folga maior é a que o E175 já explicava.
 */
export type OrigemDoPrazo = "PROVA" | "PRAZO_PROPRIO" | "CASAMENTO";

export type ReferenciaDoPrazo = { data: string; origem: OrigemDoPrazo };

export function referenciaDoPrazo(a: AjusteComPrazo): ReferenciaDoPrazo | null {
  if (a.proximaProva) return { data: a.proximaProva, origem: "PROVA" };
  if (a.prazoProprio) return { data: a.prazoProprio, origem: "PRAZO_PROPRIO" };
  const casamento = casamentoDeReferencia(a);
  return casamento ? { data: casamento, origem: "CASAMENTO" } : null;
}

export function prazoDias(a: AjusteComPrazo): number | null {
  const referencia = referenciaDoPrazo(a);
  return referencia ? diasAteCasamento(referencia.data) : null;
}

/**
 * E240/S-O94 — os dois limiares com NOME, para o manual da costureira poder
 * pregá-los (`varredura-manuais-prazos`): até aqui eram o `7` e o `14` escritos
 * dentro de `dentroDoPrazoDeAtencao`, e a célula do manual que os cita não
 * tinha de onde sair.
 */
/** Prova marcada a até N dias acende a fila (e entra no recorte padrão). */
export const PROVA_APERTADA_DIAS = 7;
/** Sem prova: prazo próprio ou casamento a até N dias acende a fila. */
export const CASAMENTO_APERTADO_DIAS = 14;

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
  const referencia = referenciaDoPrazo(a);
  if (!referencia) return false;
  const dias = diasAteCasamento(referencia.data);
  return dias <= (referencia.origem === "PROVA" ? PROVA_APERTADA_DIAS : CASAMENTO_APERTADO_DIAS);
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

/** E240/S-O50 — o prazo que a costureira fixou, nas mesmas palavras dos outros dois. */
export function rotuloPrazoProprio(dias: number): string {
  if (dias < 0) return "prazo passou";
  if (dias === 0) return "prazo hoje";
  if (dias === 1) return "prazo amanhã";
  return `prazo em ${dias} dias`;
}

/**
 * O rótulo pela ORIGEM — a fila e a ficha desenham o mesmo prazo com a mesma
 * frase, e a escolha da frase mora aqui e não em cada tela (S-A17, de novo).
 */
export function rotuloDoPrazo(referencia: ReferenciaDoPrazo, dias: number): string {
  if (referencia.origem === "PROVA") return rotuloProva(dias);
  if (referencia.origem === "PRAZO_PROPRIO") return rotuloPrazoProprio(dias);
  return rotuloCasamento(dias);
}
