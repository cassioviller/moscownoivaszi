import type { Recibo } from "@workspace/api-client-react";

/**
 * E221 — os recibos da cláusula 7ª, agrupados pela parcela a que pertencem.
 *
 * A porta devolve UMA lista do contrato inteiro, ordenada pelo dia do
 * pagamento — que é a ordem certa para o extrato da noiva. A tela da loja
 * mostra o carnê linha a linha, e ali a pergunta é outra: *"desta parcela, o
 * que já foi recebido?"*.
 *
 * Agrupar na tela e não na porta é decisão: a lista plana é a que a cláusula
 * pede ("todos os recibos"), e o agrupamento é uma leitura dela. Duas rotas
 * para as duas ordens seriam duas verdades sobre os mesmos recibos.
 *
 * Um recibo por RECEBIMENTO: uma parcela recebida em três vezes tem três
 * entradas aqui, e é isso que a tela precisa dizer.
 */
export function recibosPorParcela(recibos: Recibo[]): Map<string, Recibo[]> {
  const mapa = new Map<string, Recibo[]>();
  for (const r of recibos) {
    const lista = mapa.get(r.parcelaId);
    if (lista) lista.push(r);
    else mapa.set(r.parcelaId, [r]);
  }
  return mapa;
}
