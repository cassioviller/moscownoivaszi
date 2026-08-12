/**
 * S-O49 (E181) — a recusa do S-O25 dita ANTES do clique.
 *
 * O E174 fechou a porta do servidor: `exigirDescontoCabendoNosItens`
 * (`routes/orcamentos.ts:952`) roda dentro da transação das DUAS portas de item
 * e devolve 422 `DESCONTO_INVALIDO` quando o item que sai (ou encolhe) deixa o
 * desconto em VALOR maior que o bruto restante. A tela não sabia disso: ela
 * mandava o `DELETE`, e a vendedora lia o 422 num toast **depois** do gesto,
 * com a peça já removida da cabeça dela e não do orçamento.
 *
 * A régua do E27 é recusar ANTES, e a mesma tela já a cumpre no vizinho — o
 * "Aplicar desconto" (`orcamentos/[id].tsx:698`) chama `recusaDeDesconto` e
 * avisa antes de sair da tela. O que faltava era perguntar pelo OUTRO lado da
 * relação: o teto do desconto é um par (desconto, itens), e mexer no item mexe
 * no par.
 *
 * **Medido em 2026-08-12**, desconto de R$ 4.000,00 em VALOR sobre itens de
 * R$ 5.000,00 (R$ 3.000,00 + R$ 2.000,00): remover o item de R$ 2.000,00 deixa
 * bruto R$ 3.000,00 contra desconto R$ 4.000,00, e o líquido clampa em
 * R$ 0,00 — é o estado que o S-M23 e o A07.3 existem para impedir.
 *
 * Aqui não nasce régua nova: as duas perguntas montam a lista HIPOTÉTICA e
 * chamam a mesma `recusaDeDesconto` que o servidor executa (regra 26). O
 * percentual não depende dos itens — `recusaDeDesconto` só o compara com 100 —,
 * então a resposta é a mesma que o servidor daria em todo estado gravável.
 */
import { brutoEmCentavos, recusaDeDesconto } from "./dinheiro";

/** O mínimo que a régua precisa de um item — o `OrcamentoItem` do cliente serve. */
export interface ItemComPreco {
  id: string;
  valorUnitario: number;
  quantidade: number;
}

/** O mínimo que ela precisa do orçamento: o desconto gravado e os itens vivos. */
export interface OrcamentoComDesconto {
  descontoTipo?: string | null;
  descontoValor?: number | null;
  itens?: readonly ItemComPreco[] | null;
}

export type RecusaDoServidor = { error: string; detalhe: string } | null;

function recusaSobre(
  orcamento: OrcamentoComDesconto,
  itens: readonly ItemComPreco[],
): RecusaDoServidor {
  return recusaDeDesconto(orcamento.descontoTipo, orcamento.descontoValor, brutoEmCentavos(itens));
}

/** O que o servidor responderá se ESTE item sair — `null` é "pode remover". */
export function recusaAoRemoverItem(
  orcamento: OrcamentoComDesconto,
  itemId: string,
): RecusaDoServidor {
  const itens = orcamento.itens ?? [];
  return recusaSobre(
    orcamento,
    itens.filter((i) => i.id !== itemId),
  );
}

/**
 * A mesma pergunta para o `PATCH`: baixar o valor unitário ou a quantidade
 * derruba o bruto igual, e o E174 fechou as duas portas juntas.
 */
export function recusaAoEditarItem(
  orcamento: OrcamentoComDesconto,
  itemId: string,
  novo: { valorUnitario: number; quantidade: number },
): RecusaDoServidor {
  const itens = orcamento.itens ?? [];
  return recusaSobre(
    orcamento,
    itens.map((i) => (i.id === itemId ? { ...i, ...novo } : i)),
  );
}
