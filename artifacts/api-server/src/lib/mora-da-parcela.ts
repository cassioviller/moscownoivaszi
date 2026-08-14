import { explicacaoDaMora, moraDaParcela, saldoAberto } from "@workspace/financeiro-core";

/**
 * **A mora da cláusula 9ª anexada à parcela, num lugar só** — E213.
 *
 * Toda porta que devolve parcela passa por aqui, e é essa a razão de o helper
 * existir em vez de a conta ser refeita em cada rota: a fila de cobrança, o
 * carnê do contrato, o extrato do portal da noiva e a resposta do recebimento
 * mostram o MESMO número. Duas grafias divergiriam no dia em que a régua
 * mudasse, e a noiva leria no portal um total que a loja não pratica — é a
 * lição do E187, que achou cinco grafias da mesma conta de desconto, três
 * acertando por cópia e duas errando.
 *
 * A conta é **derivada**, nunca gravada: o valor cresce todo dia. O que o banco
 * guarda é o perdão (`mora_perdoada_em`), que é um fato datado.
 */

/** O subconjunto da parcela de que a conta precisa. */
export type ParcelaComMora = {
  valorPrevisto: number;
  valorRecebido: number | null;
  vencimento: Date | string;
  status: string;
  moraPerdoadaEm: Date | null;
  origem: string;
};

/**
 * A mora desta parcela, ou `null` quando a cláusula não incide.
 *
 * **A parcela CANCELADA não deve mora**, e **a linha `MORA` não deve mora de
 * si mesma** — são as duas exclusões. A primeira já existia; a segunda é
 * S-C101: o estorno avulso devolve a PRÓPRIA linha de MORA a PREVISTA (ela é
 * PAGA como qualquer parcela, e a porta não distingue), e sem esta guarda
 * `moraDe` a recalcula por cima — R$ 15,00 de multa passam a render 2% e
 * 1%/mês SOBRE SI MESMOS, virando R$ 15,45 no dia seguinte. A PAGA sai
 * sozinha, porque o saldo aberto dela é zero.
 */
export function moraDe(p: ParcelaComMora) {
  if (p.status === "CANCELADA" || p.origem === "MORA") return null;
  const m = moraDaParcela({
    // O MESMO `saldoAberto` do resto do sistema (E49/E125): o previsto menos o
    // que já entrou, nunca negativo. Incidir sobre o previsto cheio cobraria
    // multa sobre dinheiro que a noiva já pagou.
    saldoAberto: saldoAberto(p),
    vencimento: p.vencimento,
    perdoada: p.moraPerdoadaEm !== null,
  });
  return m === null ? null : { ...m, explicacao: explicacaoDaMora(m) };
}

/**
 * **Por que não há um `comMora(p)` que já devolva o objeto montado.**
 *
 * Havia, e a `varredura-schemas-aninhados` reprovou: `Parcela.mora` apareceu
 * como **aresta órfã** — *"o spec promete e nenhuma porta entrega"*. O motor
 * dela segue a chamada dentro do mesmo arquivo (S-O59/E186) e não atravessa
 * import de outro módulo, que é o ponto cego 2 declarado na própria varredura.
 * Com `.map(comMora)`, a chave `mora` não aparecia em handler nenhum.
 *
 * O conserto foi escrever `mora: moraDe(p)` nas três portas em vez de declarar
 * a aresta numa tabela de julgamentos — que é justamente o que a S-O114 cobrou
 * e o E199 apagou. **A conta continua tendo uma grafia só** (`moraDe`); o que
 * se repete é a atribuição do campo, e é ela que a régua precisa ver.
 */
