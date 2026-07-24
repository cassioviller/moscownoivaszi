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
import { and, eq, gte, lte, lt, ne, sql } from "drizzle-orm";
import { GetDashboardResponse } from "@workspace/api-zod";
import { requireSessaoComLoja } from "../middlewares/auth";
import { addDias, hojeLocal, inicioDoDia, previstoNaJanela } from "@workspace/financeiro-core";

const router: IRouter = Router();

router.get("/lojas/:lojaId/dashboard", requireSessaoComLoja, async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;

  const now = new Date();
  const inicioHoje = new Date(now);
  inicioHoje.setHours(0, 0, 0, 0);
  const fimHoje = new Date(now);
  fimHoje.setHours(23, 59, 59, 999);

  // Janela do "próximos 30 dias" pela régua do MOTOR (E25): dia de negócio
  // São Paulo, hoje inclusivo, soma em centavos — antes era sum(float) em SQL
  // por INSTANTE, que descartava o vencimento de hoje (meio-dia) quando a
  // consulta rodava à tarde e podia divergir da projeção por centavos.
  const hoje = hojeLocal();
  const janela = { iniYMD: hoje, fimYMD: addDias(hoje, 30) };
  const recorteSql = { de: inicioDoDia(hoje), ate: inicioDoDia(addDias(janela.fimYMD, 1)) };

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
    // As LINHAS (não a soma): quem soma é o motor, na mesma régua do front.
    // O recorte SQL só limita o tráfego; o corte exato é do previstoNaJanela.
    db
      .select({
        status: parcelasTable.status,
        vencimento: parcelasTable.vencimento,
        valorPrevisto: parcelasTable.valorPrevisto,
      })
      .from(parcelasTable)
      .where(
        and(
          eq(parcelasTable.lojaId, lojaId),
          eq(parcelasTable.status, "PREVISTA"),
          gte(parcelasTable.vencimento, recorteSql.de),
          lt(parcelasTable.vencimento, recorteSql.ate),
        ),
      ),
    db
      .select({
        status: contasPagarTable.status,
        vencimento: contasPagarTable.vencimento,
        valorPrevisto: contasPagarTable.valorPrevisto,
      })
      .from(contasPagarTable)
      .where(
        and(
          eq(contasPagarTable.lojaId, lojaId),
          eq(contasPagarTable.status, "PREVISTA"),
          gte(contasPagarTable.vencimento, recorteSql.de),
          lt(contasPagarTable.vencimento, recorteSql.ate),
        ),
      ),
  ]);

  res.json(
    GetDashboardResponse.parse({
      totalLeadsAtivos: Number(leadsAtivos[0]?.count ?? 0),
      totalVestidosAtivos: Number(vestidosAtivos[0]?.count ?? 0),
      totalOrcamentosAbertos: Number(orcamentosAbertos[0]?.count ?? 0),
      totalContratosAtivos: Number(contratosAtivos[0]?.count ?? 0),
      receberProximos30Dias: previstoNaJanela(receberProximos30Dias, janela),
      pagarProximos30Dias: previstoNaJanela(pagarProximos30Dias, janela),
      atendimentosHoje: Number(atendimentosHoje[0]?.count ?? 0),
    }),
  );
});

export default router;
