// src/lib/financeiro/obrigacao.ts
// Predicado compartilhado da carteira: uma obrigação (parcela a receber em S4 ou conta a
// pagar em S5) está ATRASADA quando ainda está PREVISTA e o vencimento já passou. DERIVADO,
// nunca gravado. Antes copiado idêntico em receber.ts e pagar.ts.
import type { ParcelaStatus, ContaPagarStatus } from "@/generated/prisma/client";

/** `hoje` em epoch-ms (ex.: hojeUTC().getTime()). PREVISTA + vencido = atrasada. */
export function ehAtrasada(status: ParcelaStatus | ContaPagarStatus, vencimento: Date, hoje: number): boolean {
  return status === "PREVISTA" && vencimento.getTime() < hoje;
}
