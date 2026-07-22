/**
 * Arredondamento a 2 casas dos TOTAIS de orçamento (bruto/líquido, desconto
 * percentual). Unificado no E88: vivia duplicado nas rotas de orçamento e na
 * visao-noiva — e os dois lados TÊM de fechar no mesmo centavo, porque a
 * versão enviada congela um hash do conteúdo (E75) e a noiva confere o número.
 *
 * Não confundir com a regra de ouro do repo (somar em centavos inteiros):
 * aqui não há soma acumulada, só o corte final de um produto/percentual.
 */
export const round2 = (v: number): number => Math.round(v * 100) / 100;
