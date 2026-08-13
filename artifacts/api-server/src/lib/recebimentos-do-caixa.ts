import { teveRecebimento } from "@workspace/financeiro-core";
import { recibosDaParcela, type LinhaDaTrilha } from "./recibo-do-papel";

/**
 * S-C31 — o caixa realizado data **cada** recebimento pelo dia em que ele
 * entrou, e não pelo dia do último pedaço.
 *
 * ## O defeito, com o número
 *
 * `parcelas.recebido_em` guarda **o instante do ÚLTIMO recebimento** — a coluna
 * é sobrescrita a cada `POST /parcelas/:id/receber` (E49). Uma parcela de
 * R$ 1.000,00 paga em dois pedaços — **R$ 300,00 em dinheiro no dia 01/03** e
 * **R$ 700,00 em PIX no dia 15/03** — fica com `recebidoEm = 15/03` e
 * `valorRecebido = 1.000,00`, e todo motor de caixa lê essa linha como UM
 * movimento:
 *
 * - o extrato do fluxo do dia 01/03 mostrava **R$ 0,00**, e o do dia 15/03
 *   mostrava **R$ 1.000,00** — os R$ 300,00 apareciam no dia errado;
 * - com os pedaços em meses diferentes (28/02 e 15/03) o DRE de **fevereiro**
 *   perdia os R$ 300,00 e o de **março** ganhava R$ 1.000,00;
 * - o "por meio" (E50) dava **PIX R$ 1.000,00 · Dinheiro R$ 0,00**, porque a
 *   forma da coluna também é a do último pedaço.
 *
 * Desde o **E221** existe de onde tirar o dia certo: uma linha
 * `PARCELA_RECEBIDA` por recebimento, escrita **na mesma transação do dinheiro**
 * e carregando o `recebidoEm` daquele ato. O recibo da cláusula 7ª já data por
 * ela; o caixa é o outro lado da mesma confusão.
 *
 * ## A régua, e o que ela recusa a fazer
 *
 * A leitura da trilha é a MESMA do recibo (`recibosDaParcela`) — inclusive o
 * corte do estorno, que é tudo-ou-nada — porque duas leituras do mesmo fato
 * seriam duas verdades sobre o mesmo dinheiro. Sobre ela, três decisões:
 *
 * 1. **O total NUNCA muda: o que muda é a data.** A parcela só se divide quando
 *    a soma dos atos **fecha exatamente** com o `valorRecebido` dela
 *    (`confere`). Faltando ou sobrando um centavo, ela entra no caixa como
 *    entra hoje — uma linha só, datada pelo `recebidoEm`. Dividir uma parcela
 *    cuja trilha não fecha tiraria dinheiro do caixa, que é pior que datá-lo
 *    errado.
 *
 * 2. **Um ato só não se divide.** Quando existe UM recebimento, o `recebidoEm`
 *    da parcela **é** o dia dele — e é melhor que a trilha, porque para os atos
 *    anteriores ao E221 o único dia gravado na linha é o do LANÇAMENTO (a
 *    vendedora recebe no sábado e lança na segunda). Nada muda para essas
 *    parcelas, que hoje são **todas** as do banco (ver a medição no relatório
 *    da sobra).
 *
 * 3. **Data que não existe não se inventa.** Num ato anterior ao E221 a linha
 *    não tem `recebidoEm`, e o dia dele é o do lançamento (`criadoEm`), que é o
 *    único dia que o sistema guardou daquele ato. O ÚLTIMO ato foge dessa
 *    regra: ele é quem escreveu o `recebidoEm` da parcela, então herda o dia
 *    informado pela vendedora em vez do dia do lançamento.
 */

/** O que este motor precisa saber de uma parcela para dividi-la. */
export type ParcelaDoCaixa = {
  id: string;
  contratoId: string;
  status: string;
  recebidoEm?: string | Date | null;
  valorRecebido?: number | null;
  formaRecebimento?: string | null;
};

/**
 * A parcela vira UMA linha por recebimento — mesma forma, campos de dinheiro
 * trocados pelos do ato. Os motores do `financeiro-core` (`resumoCaixa`,
 * `entradasPorMeio`, `tendenciaCaixa`, `dreDoIntervalo`) e o
 * `movimentosDoFluxo` recebem exatamente o que já recebiam, e por isso passam a
 * datar certo sem uma linha de mudança.
 *
 * O `id` da linha dividida é o da LINHA DA TRILHA (o mesmo número que o recibo
 * do E221 cita): estável, citável, e distinto entre os pedaços — sem isso dois
 * movimentos do mesmo dia colidiriam na chave do extrato e do CSV.
 */
export function porRecebimento<T extends ParcelaDoCaixa>(
  parcelas: readonly T[],
  trilha: readonly LinhaDaTrilha[],
): T[] {
  return parcelas.flatMap((p) => {
    // Sem dinheiro não há o que dividir — e o motor já a descarta adiante.
    if (!teveRecebimento(p)) return [p];
    const { recibos, confere } = recibosDaParcela(p, trilha);
    // Decisão 1 (o total não muda) e decisão 2 (um ato só não se divide).
    if (!confere || recibos.length < 2) return [p];
    const ultimo = recibos.length - 1;
    return recibos.map((r, i) => ({
      ...p,
      id: r.id,
      // Decisão 3: o último ato é quem escreveu o `recebidoEm` da parcela.
      recebidoEm: i === ultimo ? (p.recebidoEm ?? r.pagoEm) : r.pagoEm,
      valorRecebido: r.valor,
      formaRecebimento: r.forma,
    }));
  });
}
