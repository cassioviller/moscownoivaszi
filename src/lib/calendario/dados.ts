// src/lib/calendario/dados.ts
// Leituras Prisma do calendário (escopo de loja via tenantPrisma). Reúne, num
// intervalo [inicio, fim), os pontos que viram marcadores na grade do mês:
// casamentos (BloqueioVestido.casamentoData), provas (Atendimento{tipo:PROVA}.inicio)
// e atendimentos (Atendimento{tipo:ATENDIMENTO}.inicio). Datas saem como "YYYY-MM-DD" (UTC).
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { ymd } from "@/lib/tempo";
import type { Marcador } from "./mes";
import type { AtendimentoSituacao } from "@/generated/prisma/client";

/** Marcadores (casamento/prova/atendimento) com data em [inicio, fim). */
export async function marcadoresNoIntervalo(
  lojaId: string,
  inicio: Date,
  fim: Date,
): Promise<Marcador[]> {
  const db = tenantPrisma(prisma, lojaId);
  const [casamentos, provas, atendimentos] = await Promise.all([
    db.bloqueioVestido.findMany({
      where: { casamentoData: { gte: inicio, lt: fim } },
      select: { casamentoData: true },
    }),
    db.atendimento.findMany({
      where: { tipo: "PROVA", inicio: { gte: inicio, lt: fim } },
      select: { inicio: true },
    }),
    db.atendimento.findMany({
      where: { tipo: "ATENDIMENTO", inicio: { gte: inicio, lt: fim } },
      select: { inicio: true },
    }),
  ]);

  const marcadores: Marcador[] = [];
  for (const c of casamentos) {
    if (c.casamentoData) marcadores.push({ ymd: ymd(c.casamentoData)!, tipo: "casamento" });
  }
  for (const p of provas) marcadores.push({ ymd: ymd(p.inicio)!, tipo: "prova" });
  for (const a of atendimentos) marcadores.push({ ymd: ymd(a.inicio)!, tipo: "atendimento" });
  return marcadores;
}

export type AtendimentoCalendario = {
  id: string;
  inicio: Date;
  situacao: AtendimentoSituacao;
  noivaNome: string | null;
  leadId: string;
};

/** Atendimentos da loja com início em [inicio, fim), por horário asc. */
export async function atendimentosNoIntervalo(
  lojaId: string,
  inicio: Date,
  fim: Date,
): Promise<AtendimentoCalendario[]> {
  const rows = await tenantPrisma(prisma, lojaId).atendimento.findMany({
    where: { tipo: "ATENDIMENTO", inicio: { gte: inicio, lt: fim } },
    orderBy: { inicio: "asc" },
    include: { lead: { select: { noivaNome: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    situacao: a.situacao,
    noivaNome: a.lead?.noivaNome ?? null,
    leadId: a.leadId,
  }));
}
