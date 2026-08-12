/**
 * E25: o dinheiro mora no motor único (@workspace/financeiro-core) — o mesmo
 * que o api-server consome. Este arquivo é só a porta local; os testes ao lado
 * (dinheiro.test.ts) continuam valendo e agora provam o core.
 */
export { centavos, reais, somaCentavos, parseValor } from "@workspace/financeiro-core";

/**
 * E95: o que um orçamento VALE também sai daqui. A tela de orçamento calculava
 * o bruto e o líquido à mão, em reais float, e discordava do servidor em 1,32%
 * das vendas com desconto percentual — um 422 `VALOR_TOTAL_NAO_BATE` que a
 * vendedora não tinha como destravar, porque o número que ela via era o único
 * que o servidor recusava.
 */
export { brutoEmCentavos, liquidoEmCentavos, temDesconto } from "@workspace/financeiro-core";

/**
 * S-O64/E187: e QUANTO de desconto se mostra também sai daqui. A conta é
 * `bruto − líquido`, nunca o `descontoValor` gravado: com desconto em VALOR
 * maior que a soma dos itens, a mesma proposta dizia "Desconto R$ 5.000,00" no
 * portal e "− R$ 4.800,00" na página pública — e o total, R$ 0,00 nos dois.
 */
export { linhaDeDesconto } from "@workspace/financeiro-core";
export type { LinhaDeDesconto } from "@workspace/financeiro-core";

/**
 * E169: a quantidade do item lê pela mesma borda que o valor (O6), e o teto do
 * desconto é a MESMA função que o servidor executa (A07.3) — a tela avisa antes
 * do clique com a frase que o 422 traria depois.
 */
export { parseQuantidade, recusaDeDesconto } from "@workspace/financeiro-core";
