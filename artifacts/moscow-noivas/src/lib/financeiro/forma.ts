import type { ReceberParcelaInputFormaRecebimento } from "@workspace/api-client-react";
import type { Parcela, ContaPagar } from "@workspace/api-client-react";
import { centavos, reais } from "./dinheiro";
import { diaDeNegocio, hojeLocal } from "./datas";

/**
 * Forma de pagamento e o predicado de atraso — o vocabulário que contrato,
 * recebimento e conta a pagar compartilham.
 */

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
 * Uma obrigação está ATRASADA quando ainda está PREVISTA e o vencimento já
 * passou. Derivado, nunca gravado: o status no banco não sabe que dia é hoje.
 */
export function estaAtrasada(
  obrigacao: { status: string; vencimento: string },
  hoje: string = hojeLocal(),
): boolean {
  return obrigacao.status === "PREVISTA" && diaDeNegocio(obrigacao.vencimento) < hoje;
}

export type Vencidas = { qtd: number; total: number };

/** Total em aberto e já vencido de uma lista de obrigações. */
export function vencidas(
  obrigacoes: readonly (Parcela | ContaPagar)[],
  hoje: string = hojeLocal(),
): Vencidas {
  const atrasadas = obrigacoes.filter((o) => estaAtrasada(o, hoje));
  return {
    qtd: atrasadas.length,
    total: reais(atrasadas.reduce((s, o) => s + centavos(o.valorPrevisto), 0)),
  };
}
