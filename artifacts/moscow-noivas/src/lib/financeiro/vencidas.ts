// src/lib/financeiro/vencidas.ts
// Contas em atraso da loja: PREVISTA com vencimento < hoje, a receber (parcelas) e a
// pagar (contas). Alimenta a "Atenção imediata" de financeiro no Início. Escopo de loja.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { decParaCentavos, deCentavos } from "@/lib/dinheiro";
import type { Prisma } from "@/generated/prisma/client";

export type Vencidas = {
  receberQtd: number;
  receberTotal: string; // decimal-string
  pagarQtd: number;
  pagarTotal: string;
};

export async function vencidasDaLoja(lojaId: string, hoje: Date): Promise<Vencidas> {
  const db = tenantPrisma(prisma, lojaId);
  const [parcelas, contas] = await Promise.all([
    db.parcela.findMany({ where: { status: "PREVISTA", vencimento: { lt: hoje } }, select: { valorPrevisto: true } }),
    db.contaPagar.findMany({ where: { status: "PREVISTA", vencimento: { lt: hoje } }, select: { valorPrevisto: true } }),
  ]);
  // Soma em CENTAVOS inteiros (convenção do módulo financeiro — sem float).
  const somaCentavos = (rows: { valorPrevisto: Prisma.Decimal }[]) =>
    rows.reduce((acc, r) => acc + decParaCentavos(r.valorPrevisto), 0);
  return {
    receberQtd: parcelas.length,
    receberTotal: deCentavos(somaCentavos(parcelas)),
    pagarQtd: contas.length,
    pagarTotal: deCentavos(somaCentavos(contas)),
  };
}
