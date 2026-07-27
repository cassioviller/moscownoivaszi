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
export { brutoEmCentavos, liquidoEmCentavos } from "@workspace/financeiro-core";
