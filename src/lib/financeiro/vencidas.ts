// src/lib/financeiro/vencidas.ts
// Contas em atraso da loja: PREVISTA com vencimento < hoje, a receber (parcelas) e a
// pagar (contas). Alimenta a "Atenção imediata" de financeiro no Início. Escopo de loja.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { decParaString } from "@/lib/dinheiro";

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
  const soma = (rows: { valorPrevisto: unknown }[]) =>
    rows.reduce((acc, r) => acc + Number(decParaString(r.valorPrevisto as never)), 0);
  return {
    receberQtd: parcelas.length,
    receberTotal: String(soma(parcelas)),
    pagarQtd: contas.length,
    pagarTotal: String(soma(contas)),
  };
}
