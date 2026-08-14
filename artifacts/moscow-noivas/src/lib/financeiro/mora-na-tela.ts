import type { Parcela } from "@workspace/api-client-react";
import { saldoAberto } from "./forma";

/**
 * **E226 — a mora da cláusula 9ª, do lado de quem LÊ.**
 *
 * A conta é do `financeiro-core` (`moraDaParcela`) e o servidor a anexa a cada
 * parcela que devolve (`api-server/src/lib/mora-da-parcela.ts`). O que faltava
 * era a outra metade: **qual número a tela mostra, e qual ela sugere quando a
 * vendedora vai lançar.**
 *
 * O defeito, medido antes do conserto: o carnê do contrato imprimia
 * `parcela.valorPrevisto` e o diálogo de receber abria preenchido com
 * `saldoAberto(parcela)`. Numa parcela de R$ 500,00 vencida há 30 dias a noiva
 * lia **R$ 515,00** no portal, a porta ACEITAVA R$ 515,00 desde o E213, e a
 * vendedora — que tem `financeiro: NADA` e por isso não abre a fila de cobrança
 * — lia **R$ 500,00** na única tela de dinheiro dela. **Os R$ 15,00 da cláusula
 * ficavam no chão a cada lançamento.**
 *
 * **Uma grafia só, aqui, pela lição do E187**, que achou cinco escritas da mesma
 * conta de desconto — três acertando por cópia e duas errando. As quatro
 * leituras (a linha do carnê, a sugestão do diálogo, o selo do perdão e o gesto
 * de perdoar) saem destas quatro funções, e não de quatro condicionais em JSX.
 *
 * **Nada aqui recalcula a mora.** O total vem pronto do servidor: a conta é
 * DERIVADA e cresce todo dia, e uma segunda régua no navegador divergiria no
 * dia em que a primeira mudasse — que é exatamente o formato do defeito que
 * este módulo fecha.
 */

/** O subconjunto que as quatro leituras usam. `mora` pode faltar (porta velha). */
type ComMora = Pick<Parcela, "valorPrevisto" | "valorRecebido" | "vencimento" | "status"> & {
  mora?: Parcela["mora"];
  moraPerdoadaEm?: Parcela["moraPerdoadaEm"];
};

/**
 * A mora que ainda é COBRADA, ou `null`.
 *
 * As três formas de não haver nada a explicar são diferentes e a tela não
 * precisa distingui-las: a parcela em dia (`mora: null`), a perdoada
 * (`perdoada: true`, e o selo dela é outro) e a que veio de uma porta que ainda
 * não anexa a conta (`mora: undefined`). O `undefined` é deliberado: enquanto o
 * `GET /contratos/:id` não passava pelo helper, o campo simplesmente não vinha,
 * e uma tela que lesse `p.mora.total` cru quebraria em vez de mostrar o número
 * antigo.
 */
export function moraEmAberto(p: ComMora) {
  const m = p.mora;
  if (!m || m.perdoada) return null;
  return m;
}

/**
 * O número em negrito na linha da parcela: o que se deve HOJE.
 *
 * Cai no previsto quando não há mora — inclusive na CANCELADA, que não deve
 * nada e cujo valor aparece riscado.
 */
export function valorDaParcelaNaTela(p: ComMora): number {
  return p.mora?.total ?? p.valorPrevisto;
}

/**
 * O valor com que o diálogo de receber abre preenchido.
 *
 * Difere do de cima em uma coisa que importa: sem mora a sugestão é o SALDO, não
 * o previsto — numa parcela meio recebida, repetir o valor cheio faz a vendedora
 * cobrar de novo o que já entrou, que é o erro que a noiva percebe primeiro
 * (nota do E98 no diálogo). Com mora, `total` já é o saldo COM o acréscimo, e
 * é o mesmo número que o `POST /receber` aceita desde o E213.
 */
export function sugestaoDeRecebimento(p: ComMora): number {
  return p.mora?.total ?? saldoAberto(p);
}

/**
 * **S-C231 — o total EM ATRASO de uma lista, com a mora: a leitura de
 * COBRANÇA.**
 *
 * A convenção decidida em 14/08 (na recomendação): **cobrança mostra com
 * mora, projeção mostra o principal** — e cada tela diz qual das duas está
 * mostrando. O cartão "Em atraso" da carteira é cobrança (quanto de dívida
 * vencida a loja tem a receber HOJE), e somava `saldoAberto` enquanto a
 * fila de cobrança, a linha da parcela e a porta de receber já diziam o total
 * com a 9ª — o mesmo par de números da S-C200, uma tela adiante.
 *
 * Soma `sugestaoDeRecebimento` de propósito: é O MESMO número que o diálogo
 * abre preenchido e que a porta aceita — três leituras, uma grafia.
 */
export function emAtrasoComMora(
  parcelas: readonly ComMora[],
  estaAtrasada: (p: ComMora) => boolean,
): number {
  return (
    Math.round(
      parcelas
        .filter((p) => estaAtrasada(p))
        .reduce((s, p) => s + sugestaoDeRecebimento(p) * 100, 0),
    ) / 100
  );
}

/**
 * Se o gesto de perdoar cabe nesta parcela.
 *
 * É a mesma régua que o servidor aplica ao recusar com `SEM_MORA` (422), e ela
 * está aqui para o botão não existir em vez de existir levando a um erro — a
 * lição do P6/E169, em que o botão "Remover" numa parcela PARCIAL levava a um
 * 422 cuja frase se contradizia sobre a parcela que o usuário estava vendo.
 *
 * Já perdoada é `false` de propósito: o gesto de lá é RESTABELECER. Sem esta
 * metade, o segundo clique se autoconfirmaria.
 */
export function podePerdoarMora(p: ComMora): boolean {
  return moraEmAberto(p) !== null && p.status !== "CANCELADA";
}
