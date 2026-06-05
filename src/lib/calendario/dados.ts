// src/lib/calendario/dados.ts
// Leituras Prisma do calendário (escopo de loja via tenantPrisma). Reúne, num
// intervalo [inicio, fim), os pontos que viram marcadores na grade do mês:
// casamentos (BloqueioVestido.casamentoData), provas (Prova.dataReal) e
// atendimentos (Atendimento.inicio). Datas saem como "YYYY-MM-DD" (UTC).
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { ymd } from "@/lib/tempo";
import type { Marcador } from "./mes";

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
    db.prova.findMany({
      where: { dataReal: { gte: inicio, lt: fim } },
      select: { dataReal: true },
    }),
    db.atendimento.findMany({
      where: { inicio: { gte: inicio, lt: fim } },
      select: { inicio: true },
    }),
  ]);

  const marcadores: Marcador[] = [];
  for (const c of casamentos) {
    if (c.casamentoData) marcadores.push({ ymd: ymd(c.casamentoData)!, tipo: "casamento" });
  }
  for (const p of provas) marcadores.push({ ymd: ymd(p.dataReal)!, tipo: "prova" });
  for (const a of atendimentos) marcadores.push({ ymd: ymd(a.inicio)!, tipo: "atendimento" });
  return marcadores;
}
