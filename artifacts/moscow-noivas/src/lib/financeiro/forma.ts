import type { ReceberParcelaInputFormaRecebimento } from "@workspace/api-client-react";

/**
 * Forma de pagamento (vocabulário de TELA) — o predicado de atraso mora no
 * motor único (@workspace/financeiro-core), o mesmo do api-server (E25).
 * forma.test.ts ao lado prova o core.
 */
export {
  estaAtrasada,
  vencidas,
  estaAberta,
  saldoAberto,
  // E125: o saldo devedor de um contrato — a MESMA soma do portal da noiva.
  abertoEmCentavos,
  teveRecebimento,
} from "@workspace/financeiro-core";

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

/**
 * O shape do recorte por meio (E50) como as TELAS o montam a partir do
 * `porMeio` do servidor — desde o E79 a agregação (`entradasPorMeio`) roda no
 * banco; o motor client-side saiu no E88. Os tipos ficam: são a assinatura de
 * `RecebimentosPorFormaLista` e do CSV (`linhasDre`).
 */
export type LinhaPorForma = {
  /** O código cru (chave estável) ou null para o que não tem forma registrada. */
  forma: string | null;
  rotulo: string;
  total: number;
  qtd: number;
};

export type RecebimentosPorForma = {
  /** Maior total primeiro; "Não informado" sempre por último. */
  linhas: LinhaPorForma[];
  total: number;
};
