/**
 * E154 — a peça que se CONTA, e a régua que diz quantas estão comprometidas
 * num dia.
 *
 * O acervo decide disponibilidade POR PEÇA: o `Bolero Ricca Sposa` existe um,
 * e a reserva o prende (E150). O saiote existe dez, iguais, e reservar "o nº 7"
 * não significa nada — ninguém vai atrás daquele. Aqui a pergunta é outra:
 * **quantas saem no dia 19/09?**
 *
 * A resposta é DERIVADA dos contratos ativos, nunca gravada: `itens_estoque`
 * guarda quantas a loja TEM, e duas verdades sobre o mesmo número é como se
 * perde a confiança no estoque.
 *
 * A janela de cada contrato é a **de uso**, a mesma régua do vestido
 * (`disponibilidade.ts`): [casamento − usoDiasAntes, casamento + usoDiasDepois],
 * com as datas REAIS de retirada e devolução mandando quando existem. A
 * lavagem fica de fora — é o que a spec do épico pediu, e a nota registra o
 * que isso custa.
 *
 * Núcleo puro, sem IO: quem lê o banco é a rota.
 */
import { addDias, diaLocal, type RegraJanelas } from "./disponibilidade";

/** Intervalo de dias locais inclusivos; `fim = null` = janela aberta. */
export interface JanelaDeUso {
  inicio: string;
  fim: string | null;
}

/** As três datas do contrato que dizem quando a peça está fora da loja. */
export interface DatasDoContrato {
  dataCasamento: Date | null;
  dataRetirada: Date | null;
  dataDevolucao: Date | null;
}

/**
 * A janela em que a peça deste contrato está fora da loja.
 *
 * `null` quando o contrato não tem nenhuma data que o coloque num calendário —
 * e é caso REAL, não defensivo: `contratos.data_casamento` é nullable e a tela
 * de fechamento deixa o campo vazio. Contrato sem data não compromete peça
 * nenhuma em dia nenhum, porque não há dia; contá-lo em todos seria pior.
 *
 * Retirada sem devolução deixa a janela ABERTA, como em `janelasDoBloqueio`:
 * a peça está com a noiva até que alguém registre a volta.
 */
export function janelaDeUsoDoContrato(
  c: DatasDoContrato,
  regra: RegraJanelas,
): JanelaDeUso | null {
  const casamento = c.dataCasamento ? diaLocal(c.dataCasamento) : null;
  const retirada = c.dataRetirada ? diaLocal(c.dataRetirada) : null;
  const devolucao = c.dataDevolucao ? diaLocal(c.dataDevolucao) : null;

  let inicio = casamento ? addDias(casamento, -regra.usoDiasAntes) : null;
  if (retirada && (inicio === null || retirada < inicio)) inicio = retirada;
  if (inicio === null) return null;

  // Sem devolução real, o previsto manda; sem casamento, a janela é aberta.
  const fim = devolucao ?? (casamento ? addDias(casamento, regra.usoDiasDepois) : null);
  return { inicio, fim };
}

/** O dia local cai dentro da janela inclusiva (fim null = sem fim). */
export function janelaCobre(j: JanelaDeUso, dia: string): boolean {
  return j.inicio <= dia && (j.fim === null || dia <= j.fim);
}

/** Uma linha de `contrato_itens` que aponta estoque, com as datas do contrato. */
export interface LinhaComprometida extends DatasDoContrato {
  itemEstoqueId: string;
  quantidade: number;
}

/**
 * Quantas unidades de cada item de estoque estão comprometidas no dia.
 *
 * Chave = `itemEstoqueId`; itens sem nenhum compromisso no dia não aparecem no
 * mapa (quem lê soma zero).
 */
export function comprometidoNoDia(
  linhas: LinhaComprometida[],
  dia: string,
  regra: RegraJanelas,
): Map<string, number> {
  const porItem = new Map<string, number>();
  for (const linha of linhas) {
    const janela = janelaDeUsoDoContrato(linha, regra);
    if (!janela || !janelaCobre(janela, dia)) continue;
    porItem.set(linha.itemEstoqueId, (porItem.get(linha.itemEstoqueId) ?? 0) + linha.quantidade);
  }
  return porItem;
}
