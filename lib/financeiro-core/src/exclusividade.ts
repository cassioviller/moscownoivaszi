/**
 * **A peça exclusiva de primeiro aluguel** — cláusula 12ª do instrumento de
 * locação (`docs/revisao/2026-08-13-contrato-de-papel/`).
 *
 * > **CLÁUSULA 12ª** — Se tratar de rescisão de **vestido exclusivo para
 * > primeiro aluguel**, será cobrado na qualidade de multa de rescisão
 * > contratual **o valor integral do aluguel**.
 *
 * A auditoria mediu **duas** ausências nesta cláusula, e este módulo fecha a
 * primeira: *não havia como saber que a peça é exclusiva*. A segunda — a conta
 * da multa — é do **E217**, que consome o predicado daqui em vez de reescrevê-lo.
 *
 * ## A leitura, declarada porque o contrato não diz
 *
 * A prosa nomeia uma coisa só — *"vestido exclusivo para primeiro aluguel"* —,
 * mas ela tem **duas metades de naturezas diferentes**:
 *
 * | metade | natureza | onde mora |
 * |---|---|---|
 * | *exclusivo* | **marca** da peça, declarada pela loja | `vestidos.exclusiva` |
 * | *primeiro aluguel* | **estado**, que o tempo consome | contagem de saídas |
 *
 * **A marca é permanente; o estado expira.** Uma peça comprada para sair
 * exclusiva continua tendo sido comprada assim depois do primeiro casamento — o
 * que deixa de valer é a condição da cláusula, não o fato. Por isso a marca
 * **não se apaga sozinha** no primeiro contrato: apagá-la por efeito colateral
 * deixaria a ficha errada no dia em que aquele contrato fosse cancelado, e
 * ninguém voltaria para remarcar.
 *
 * O contrato não diz o que acontece depois do primeiro aluguel. Duas leituras
 * cabem:
 *
 * 1. a 12ª incide **só enquanto a peça está no primeiro aluguel** — a condição
 *    é composta, e as duas metades têm de valer ao mesmo tempo;
 * 2. a 12ª incide em **toda** rescisão de peça exclusiva, e *"para primeiro
 *    aluguel"* seria só a descrição de como a peça foi adquirida.
 *
 * **Adotamos a (1)**, e por dois motivos. A cláusula 11ª já cobre a rescisão
 * comum com 60% de dedução; a 12ª sobe para o aluguel INTEIRO, e o que justifica
 * a diferença é o dano de estrear uma peça feita para uma noiva que desistiu —
 * dano que a segunda locação não tem, porque a peça já entrou no acervo geral. E
 * a leitura (2) cobraria o aluguel inteiro da noiva que alugou, na quarta saída,
 * uma peça que já se pagou — o que nenhuma das partes esperaria.
 *
 * **Isto é interpretação, não medição.** Está escrito aqui, no teste e na nota
 * do E216 para que a dona corrija em UMA LINHA se a intenção era outra: para a
 * leitura (2), apague o termo `locacoesAnteriores === 0` de
 * `ehExclusivaDePrimeiroAluguel`. A porta não muda, a coluna não muda, a
 * migração não muda.
 */

/** O que o predicado precisa saber da peça. Estrutural: a linha do drizzle e o
 *  objeto da API entram igual. */
export interface PecaComExclusividade {
  /** A MARCA, declarada pela loja na ficha da peça (`vestidos.exclusiva`). */
  exclusiva?: boolean | null;
}

/**
 * A peça está no **primeiro aluguel**?
 *
 * `locacoesAnteriores` são as saídas que já aconteceram **antes** desta — os
 * contratos ATIVOS que venderam a peça, da vida inteira, que é o número que
 * `GET /vestidos/utilizacao` devolve sem recorte de data (E157).
 *
 * **Atenção de quem vai chamar isto na RESCISÃO (E217):** o contrato que está
 * sendo rescindido ainda é ATIVO e entra naquela contagem. Quem decide a multa
 * tem de descontá-lo — `contratos - 1` —, senão a peça nunca estará em primeiro
 * aluguel no exato momento em que a cláusula precisa ser aplicada. Na tela do
 * orçamento o problema não existe: lá o contrato ainda não nasceu.
 */
export function ehPrimeiroAluguel(locacoesAnteriores: number): boolean {
  return locacoesAnteriores <= 0;
}

/**
 * O predicado da 12ª: **esta peça, nesta saída, cobra multa integral se a noiva
 * rescindir?**
 *
 * As duas metades ao mesmo tempo — a marca da loja e o estado do acervo.
 */
export function ehExclusivaDePrimeiroAluguel(
  peca: PecaComExclusividade,
  locacoesAnteriores: number,
): boolean {
  return peca.exclusiva === true && ehPrimeiroAluguel(locacoesAnteriores);
}

/**
 * O percentual da multa da 12ª: **o aluguel inteiro**.
 *
 * Constante nomeada, e não `100` espalhado pelo E217, pela mesma razão do
 * `PERCENTUAIS_DA_TROCA_DE_DATA` (E211): o dia em que a dona renegociar a
 * cláusula, muda-se aqui e a porta continua igual. Note o contraste com a 11ª,
 * que deduz 60% do pago — a 12ª cobra 100% do **aluguel**, que é a base que o
 * E217 vai ter de escolher e declarar.
 */
export const MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL = 100;
