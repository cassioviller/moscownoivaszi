import { ehExclusivaDePrimeiroAluguel } from "@workspace/financeiro-core";

/**
 * **O que a peça exclusiva custa se a noiva desistir, dito antes do contrato** —
 * E216, cláusula 12ª do instrumento de locação.
 *
 * > Se tratar de rescisão de **vestido exclusivo para primeiro aluguel**, será
 * > cobrado na qualidade de multa de rescisão contratual **o valor integral do
 * > aluguel**.
 *
 * O predicado é o do `financeiro-core` (`exclusividade.ts`), e é por isso que
 * ele vem de lá em vez de ser reescrito aqui: no dia em que a leitura da 12ª
 * mudar, a tela e a porta mudam juntas. **O que a tela acrescenta é só saber
 * QUAIS peças perguntar** — as do acervo que estão neste orçamento.
 *
 * Por que o aviso é da mesma família do do E211: o contrato fecha num clique, e
 * a 12ª só aparece no papel que a noiva assina. Sem esta linha, a vendedora
 * descobre a multa integral **depois** — e quem paga a surpresa é a noiva que
 * desistiu.
 */
export interface ItemDoOrcamento {
  vestidoId?: string | null;
}

export interface PecaDoAcervo {
  id: string;
  codigo: string;
  nome: string;
  exclusiva?: boolean | null;
}

/**
 * As peças deste orçamento que estão sob a cláusula 12ª, sem repetição.
 *
 * `locacoesPorVestido` é a contagem de saídas de `GET /vestidos/utilizacao` sem
 * recorte — a mesma que o E157 usa para sugerir o preço. Aqui ela é o passado
 * puro: **o contrato ainda não existe**, então nada há a descontar (o E217, que
 * calcula na RESCISÃO, terá de descontar o próprio contrato).
 *
 * Item avulso (`vestidoId` nulo) não entra: não há peça do acervo a consultar.
 */
export function pecasSobAClausula12(params: {
  itens: ItemDoOrcamento[];
  vestidoPorId: Map<string, PecaDoAcervo>;
  locacoesPorVestido: Map<string, number>;
}): PecaDoAcervo[] {
  const { itens, vestidoPorId, locacoesPorVestido } = params;
  const achadas = new Map<string, PecaDoAcervo>();

  for (const item of itens) {
    if (!item.vestidoId) continue;
    if (achadas.has(item.vestidoId)) continue;
    const peca = vestidoPorId.get(item.vestidoId);
    if (!peca) continue;
    if (!ehExclusivaDePrimeiroAluguel(peca, locacoesPorVestido.get(peca.id) ?? 0)) continue;
    achadas.set(peca.id, peca);
  }

  return [...achadas.values()];
}

/**
 * A frase do aviso, ou `null` quando não há o que avisar — que é a resposta da
 * esmagadora maioria dos orçamentos.
 *
 * A peça é **nomeada**, no molde do gate do E162: "há uma peça exclusiva" não dá
 * próximo passo a ninguém; "EX-01 · Exclusivo da Marina" dá.
 */
export function avisoDaClausula12(pecas: PecaDoAcervo[]): string | null {
  if (pecas.length === 0) return null;
  const nomeadas = pecas.map((p) => `${p.codigo} · ${p.nome}`).join(", ");
  const sujeito = pecas.length === 1 ? "é peça exclusiva de primeiro aluguel" : "são peças exclusivas de primeiro aluguel";
  return `${nomeadas} ${sujeito} — se a noiva rescindir, a multa é o valor integral do aluguel (cláusula 12ª), e não os 60% da 11ª.`;
}
