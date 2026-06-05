// src/lib/financeiro/contabilidade.ts
// Itens pagos (PagamentoItem) num intervalo, achatados para exportação contábil; e a
// marcação de "enviado à contabilidade" dos pagamentos do período. Escopo de loja.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import type { ContaPagarTipo } from "@/generated/prisma/client";

export type ItemContabil = {
  dataPagamento: Date;
  quem: string | null; // colaborador.nome ?? fornecedor
  tipo: ContaPagarTipo;
  descricao: string;
  competencia: string | null;
  valor: string; // "1234.56"
  forma: string | null;
};

/** Itens (PagamentoItem) cujo Pagamento.data ∈ [gte, lt), por data asc. */
export async function itensPagosNoIntervalo(
  lojaId: string,
  intervalo: { gte: Date; lt: Date },
): Promise<ItemContabil[]> {
  const rows = await tenantPrisma(prisma, lojaId).pagamentoItem.findMany({
    where: { pagamento: { data: { gte: intervalo.gte, lt: intervalo.lt } } },
    orderBy: { pagamento: { data: "asc" } },
    include: {
      pagamento: { select: { data: true, forma: true, colaborador: { select: { nome: true } } } },
      contaPagar: { select: { tipo: true, descricao: true, competencia: true, fornecedor: true } },
    },
  });
  return rows.map((r) => ({
    dataPagamento: r.pagamento.data,
    quem: r.pagamento.colaborador?.nome ?? r.contaPagar.fornecedor ?? null,
    tipo: r.contaPagar.tipo,
    descricao: r.contaPagar.descricao,
    competencia: r.contaPagar.competencia,
    valor: Number(r.valor).toFixed(2),
    forma: r.pagamento.forma,
  }));
}

/** Carimba enviadoContabilidadeEm nos Pagamentos do período ainda não marcados. Retorna a contagem. */
export async function marcarEnviadosNoIntervalo(
  lojaId: string,
  intervalo: { gte: Date; lt: Date },
): Promise<number> {
  const r = await tenantPrisma(prisma, lojaId).pagamento.updateMany({
    where: { data: { gte: intervalo.gte, lt: intervalo.lt }, enviadoContabilidadeEm: null },
    data: { enviadoContabilidadeEm: new Date() },
  });
  return r.count;
}
