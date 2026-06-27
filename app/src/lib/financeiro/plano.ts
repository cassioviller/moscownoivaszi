// src/lib/financeiro/plano.ts
// Reconciliação do plano de pagamento × total do contrato (puro, centavos). A Parcela é
// a fonte da verdade do que se deve; o valorTotal do contrato é o cabeçalho acordado.
// Quando há plano e a soma das parcelas difere do total, a UI sinaliza para reconciliar.
import { decParaCentavos } from "@/lib/dinheiro";

/** Soma (em centavos) os valores previstos das parcelas. */
export function totalDoPlanoCentavos(valoresPrevistos: string[]): number {
  return valoresPrevistos.reduce((soma, v) => soma + decParaCentavos(v), 0);
}

/** Há plano e a soma das parcelas difere do total do contrato → precisa reconciliar. */
export function planoDivergeDoTotal(valorTotalContrato: string, valoresPrevistos: string[]): boolean {
  if (valoresPrevistos.length === 0) return false;
  return totalDoPlanoCentavos(valoresPrevistos) !== decParaCentavos(valorTotalContrato);
}
