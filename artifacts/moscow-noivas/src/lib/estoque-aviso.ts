/**
 * E154 — o aviso de estoque, que conta e não bloqueia.
 *
 * A peça de acervo se reserva e o contrato a exige (E150). A peça de estoque
 * se CONTA: o saiote existe dez, iguais, e reservar "o nº 7" não significa
 * nada. Quando o que este orçamento pede, somado ao que os contratos ativos já
 * comprometeram para o dia, passa do que a loja tem, a tela diz o número — e
 * deixa fechar.
 *
 * Bloquear seria pior que o problema: saiote é substituível, e recusar uma
 * venda de R$ 4.000 por causa de uma anágua é um defeito, não uma proteção.
 *
 * Núcleo puro: quem busca é a tela.
 */
import { diaMesAno } from "./formatos";

/** Uma linha de `GET /itens-estoque/comprometimento`. */
export interface ComprometimentoDoItem {
  itemEstoqueId: string;
  nome: string;
  tamanho?: string | null;
  /** Quantas a loja tem. */
  quantidade: number;
  /** Quantas os contratos ATIVOS já comprometeram no dia. */
  comprometida: number;
}

/** Um item do orçamento aberto — só os de estoque interessam. */
export interface ItemDoOrcamento {
  tipo: string;
  itemEstoqueId?: string | null;
  quantidade: number;
}

/** "Saiote 2 aros (G)" — o tamanho só aparece quando existe. */
export function nomeDoItemEstoque(item: { nome: string; tamanho?: string | null }): string {
  return item.tamanho ? `${item.nome} (${item.tamanho})` : item.nome;
}

/**
 * S-M11 — a contagem digitada na arara, ou `null` se não dá para salvar.
 *
 * A tela validava com `Math.trunc(Number(valor))` seguido de `< 0`, e
 * `Number("")` é `0`: limpar o campo para redigitar passava pelos dois guards
 * e ZERAVA o estoque da peça — depois disso todo orçamento com ela alarmava
 * falta que não existe. O vazio não é zero: é campo pela metade. O ZERO
 * digitado continua valendo — a loja contou a arara e não tem nenhum.
 */
export function quantidadeContada(valor: string): number | null {
  if (valor.trim() === "") return null;
  const n = Math.trunc(Number(valor));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * As frases de aviso para o dia — uma por item de estoque que estoura.
 *
 * `dia` nulo (noiva sem data de casamento) devolve lista vazia: sem dia não há
 * conta, e um aviso sobre "algum dia" não ajudaria ninguém.
 *
 * A soma é a DESTE orçamento mais a dos contratos ativos, porque o orçamento
 * ainda não é contrato — quem o fechar hoje leva o total que a frase mostra.
 */
export function avisosDeEstoque(params: {
  itens: readonly ItemDoOrcamento[];
  comprometimento: readonly ComprometimentoDoItem[];
  dia: string | null;
}): string[] {
  if (!params.dia) return [];

  const pedidoPorItem = new Map<string, number>();
  for (const item of params.itens) {
    if (item.tipo !== "ESTOQUE" || !item.itemEstoqueId) continue;
    pedidoPorItem.set(
      item.itemEstoqueId,
      (pedidoPorItem.get(item.itemEstoqueId) ?? 0) + item.quantidade,
    );
  }
  if (pedidoPorItem.size === 0) return [];

  const avisos: string[] = [];
  for (const linha of params.comprometimento) {
    const pedido = pedidoPorItem.get(linha.itemEstoqueId);
    if (!pedido) continue;
    const total = linha.comprometida + pedido;
    if (total <= linha.quantidade) continue;
    avisos.push(
      `${total} × ${nomeDoItemEstoque(linha)} para ${diaMesAno(params.dia)}` +
        ` — a loja tem ${linha.quantidade}.`,
    );
  }
  return avisos;
}
