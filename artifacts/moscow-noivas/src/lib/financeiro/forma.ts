import type { ReceberParcelaInputFormaRecebimento } from "@workspace/api-client-react";

/**
 * Forma de pagamento (vocabulário de TELA) — o predicado de atraso mora no
 * motor único (@workspace/financeiro-core), o mesmo do api-server (E25).
 * forma.test.ts ao lado prova o core.
 */
export { estaAtrasada, vencidas, type Vencidas } from "@workspace/financeiro-core";

/**
 * Tipado pelo enum gerado: se o backend mudar as formas, o openapi regenera e
 * este mapa falha no typecheck em vez de virar 422 em produção.
 */
export const ROTULO_FORMA: Record<ReceberParcelaInputFormaRecebimento, string> = {
  PIX: "Pix",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  DINHEIRO: "Dinheiro",
  BOLETO: "Boleto",
  TRANSFERENCIA: "Transferência",
  OUTRO: "Outro",
};

export const FORMAS = Object.keys(ROTULO_FORMA) as ReceberParcelaInputFormaRecebimento[];

/** Rótulo PT-BR de uma forma; devolve o valor cru se vier algo fora do enum. */
export function rotuloForma(forma: string | null | undefined): string | null {
  if (!forma) return null;
  return ROTULO_FORMA[forma as ReceberParcelaInputFormaRecebimento] ?? forma;
}
