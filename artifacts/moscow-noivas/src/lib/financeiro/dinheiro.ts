/**
 * E25: o dinheiro mora no motor único (@workspace/financeiro-core) — o mesmo
 * que o api-server consome. Este arquivo é só a porta local; os testes ao lado
 * (dinheiro.test.ts) continuam valendo e agora provam o core.
 */
export { centavos, reais, somaCentavos, parseValor } from "@workspace/financeiro-core";
