import { Router, type IRouter } from "express";
import {
  db,
  leadsTable,
  atendimentosTable,
  contratosTable,
  vestidosTable,
  orcamentosTable,
  parcelasTable,
  contasPagarTable,
} from "@workspace/db";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { GetDashboardResponse } from "@workspace/api-zod";
import { requireSessaoComLoja } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/lojas/:lojaId/dashboard", requireSessaoComLoja, async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;

  const now = new Date();
  const inicioHoje = new Date(now);
  inicioHoje.setHours(0, 0, 0, 0);
  const fimHoje = new Date(now);
  fimHoje.setHours(23, 59, 59, 999);
  const em30Dias = new Date(now);
  em30Dias.setDate(em30Dias.getDate() + 30);

  const [
    leadsAtivos,
    vestidosAtivos,
    orcamentosAbertos,
    contratosAtivos,
    atendimentosHoje,
    receberProximos30Dias,
    pagarProximos30Dias,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(leadsTable)
      .where(and(eq(leadsTable.lojaId, lojaId), ne(leadsTable.etapa, "PERDIDO"), ne(leadsTable.etapa, "DEVOLVIDO"))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(vestidosTable)
      .where(and(eq(vestidosTable.lojaId, lojaId), eq(vestidosTable.status, "ativo"))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(orcamentosTable)
      .where(and(eq(orcamentosTable.lojaId, lojaId), eq(orcamentosTable.status, "ENVIADO"))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(contratosTable)
      .where(and(eq(contratosTable.lojaId, lojaId), eq(contratosTable.status, "ATIVO"))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(atendimentosTable)
      .where(
        and(
          eq(atendimentosTable.lojaId, lojaId),
          gte(atendimentosTable.inicio, inicioHoje),
          lte(atendimentosTable.inicio, fimHoje),
        ),
      ),
    db
      .select({ total: sql<string>`coalesce(sum(${parcelasTable.valorPrevisto}), 0)` })
      .from(parcelasTable)
      .where(
        and(
          eq(parcelasTable.lojaId, lojaId),
          eq(parcelasTable.status, "PREVISTA"),
          gte(parcelasTable.vencimento, now),
          lte(parcelasTable.vencimento, em30Dias),
        ),
      ),
    db
      .select({ total: sql<string>`coalesce(sum(${contasPagarTable.valorPrevisto}), 0)` })
      .from(contasPagarTable)
      .where(
        and(
          eq(contasPagarTable.lojaId, lojaId),
          eq(contasPagarTable.status, "PREVISTA"),
          gte(contasPagarTable.vencimento, now),
          lte(contasPagarTable.vencimento, em30Dias),
        ),
      ),
  ]);

  res.json(
    GetDashboardResponse.parse({
      totalLeadsAtivos: Number(leadsAtivos[0]?.count ?? 0),
      totalVestidosAtivos: Number(vestidosAtivos[0]?.count ?? 0),
      totalOrcamentosAbertos: Number(orcamentosAbertos[0]?.count ?? 0),
      totalContratosAtivos: Number(contratosAtivos[0]?.count ?? 0),
      receberProximos30Dias: Number(receberProximos30Dias[0]?.total ?? 0),
      pagarProximos30Dias: Number(pagarProximos30Dias[0]?.total ?? 0),
      atendimentosHoje: Number(atendimentosHoje[0]?.count ?? 0),
    }),
  );
});

export default router;
