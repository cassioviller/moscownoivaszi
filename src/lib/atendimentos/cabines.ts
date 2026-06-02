// src/lib/atendimentos/cabines.ts
// Cabines da loja + horário de funcionamento (em RegraDisponibilidade). tenantPrisma.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";

export type CabineItem = { id: string; nome: string; ativo: boolean };

export async function listarCabines(
  lojaId: string,
  opts: { ativasApenas?: boolean },
): Promise<CabineItem[]> {
  const rows = await tenantPrisma(prisma, lojaId).cabine.findMany({
    where: opts.ativasApenas ? { ativo: true } : {},
    orderBy: { nome: "asc" },
  });
  return rows.map((c) => ({ id: c.id, nome: c.nome, ativo: c.ativo }));
}

export type ResultadoCabine = { ok: true; cabineId: string } | { ok: false; motivo: "sem_nome" };

export async function criarCabine(lojaId: string, nome: string): Promise<ResultadoCabine> {
  const n = nome?.trim();
  if (!n) return { ok: false, motivo: "sem_nome" };
  const c = await tenantPrisma(prisma, lojaId).cabine.create({ data: { nome: n } as never });
  return { ok: true, cabineId: c.id };
}

export async function alternarCabineAtiva(lojaId: string, cabineId: string): Promise<void> {
  const db = tenantPrisma(prisma, lojaId);
  const atual = await db.cabine.findUnique({ where: { id: cabineId }, select: { ativo: true } });
  if (!atual) return;
  await db.cabine.update({ where: { id: cabineId }, data: { ativo: !atual.ativo } });
}

export type HorarioLoja = { abertura: number; fechamento: number };

export async function obterHorarioLoja(lojaId: string): Promise<HorarioLoja> {
  const r = await tenantPrisma(prisma, lojaId).regraDisponibilidade.findUnique({
    where: { lojaId },
    select: { atendimentoAberturaHora: true, atendimentoFechamentoHora: true },
  });
  return { abertura: r?.atendimentoAberturaHora ?? 9, fechamento: r?.atendimentoFechamentoHora ?? 19 };
}

export type ResultadoHorario = { ok: true } | { ok: false; motivo: "intervalo_invalido" };

export async function salvarHorarioLoja(
  lojaId: string,
  abertura: number,
  fechamento: number,
): Promise<ResultadoHorario> {
  if (!Number.isInteger(abertura) || !Number.isInteger(fechamento)) return { ok: false, motivo: "intervalo_invalido" };
  if (abertura < 0 || fechamento > 24 || abertura >= fechamento) return { ok: false, motivo: "intervalo_invalido" };
  await tenantPrisma(prisma, lojaId).regraDisponibilidade.upsert({
    where: { lojaId },
    update: { atendimentoAberturaHora: abertura, atendimentoFechamentoHora: fechamento },
    create: { atendimentoAberturaHora: abertura, atendimentoFechamentoHora: fechamento } as never,
  });
  return { ok: true };
}
