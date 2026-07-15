import { Router, type IRouter } from "express";
import {
  db,
  comissaoRegrasTable,
  comissaoFaixasTable,
  comissaoFechamentosTable,
  contasPagarTable,
  contratosTable,
  usuariosTable,
} from "@workspace/db";
import { eq, and, gte, lt, inArray } from "drizzle-orm";
import {
  ListComissaoRegrasResponse,
  CreateComissaoRegraBody,
  CreateComissaoRegraResponse,
  UpdateComissaoRegraBody,
  UpdateComissaoRegraResponse,
  ListComissaoFaixasResponse,
  CreateComissaoFaixaBody,
  CreateComissaoFaixaResponse,
  ListComissaoFechamentosResponse,
  GerarComissaoFechamentoBody,
  GerarComissaoFechamentoResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { randomUUID } from "node:crypto";
import { calcularComissao, limitesCompetencia, vencimentoComissao } from "../lib/comissao";

const router: IRouter = Router();

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/comissao", requireModulo("comissao"));

router.get("/lojas/:lojaId/comissao/regras", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const regras = await db.select().from(comissaoRegrasTable).where(eq(comissaoRegrasTable.lojaId, lojaId));
  res.json(ListComissaoRegrasResponse.parse(regras));
});

router.post("/lojas/:lojaId/comissao/regras", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateComissaoRegraBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [regra] = await db.insert(comissaoRegrasTable).values({
    id: randomUUID(),
    lojaId,
    usuarioId: parsed.data.usuarioId,
    regraGlobal: parsed.data.regraGlobal ?? null,
  }).returning();
  res.status(201).json(CreateComissaoRegraResponse.parse(regra));
});

router.patch("/lojas/:lojaId/comissao/regras/:regraId", async (req, res): Promise<void> => {
  const { lojaId, regraId } = req.params;
  const parsed = UpdateComissaoRegraBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [regra] = await db.update(comissaoRegrasTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(comissaoRegrasTable.id, regraId as string), eq(comissaoRegrasTable.lojaId, lojaId as string)))
    .returning();
  if (!regra) {
    res.status(404).json({ error: "Regra not found" });
    return;
  }
  res.json(UpdateComissaoRegraResponse.parse(regra));
});

router.get("/lojas/:lojaId/comissao/faixas", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const faixas = await db.select().from(comissaoFaixasTable).where(eq(comissaoFaixasTable.lojaId, lojaId)).orderBy(comissaoFaixasTable.minimoVenda);
  res.json(ListComissaoFaixasResponse.parse(faixas));
});

router.post("/lojas/:lojaId/comissao/faixas", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateComissaoFaixaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [faixa] = await db.insert(comissaoFaixasTable).values({
    id: randomUUID(),
    lojaId,
    minimoVenda: parsed.data.minimoVenda,
    percentual: parsed.data.percentual,
  }).returning();
  res.status(201).json(CreateComissaoFaixaResponse.parse(faixa));
});

router.delete("/lojas/:lojaId/comissao/faixas/:faixaId", async (req, res): Promise<void> => {
  const { lojaId, faixaId } = req.params;
  await db.delete(comissaoFaixasTable).where(and(eq(comissaoFaixasTable.id, faixaId as string), eq(comissaoFaixasTable.lojaId, lojaId as string)));
  res.status(204).send();
});

router.get("/lojas/:lojaId/comissao/fechamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const fechamentos = await db.select().from(comissaoFechamentosTable).where(eq(comissaoFechamentosTable.lojaId, lojaId)).orderBy(comissaoFechamentosTable.competencia);
  res.json(ListComissaoFechamentosResponse.parse(fechamentos));
});

// Fecha a competência para TODAS as vendedoras com movimento: calcula vendas
// reais − estornos, aplica as faixas (percentual sobre o total) e gera a
// conta a pagar COMISSAO vinculada. Competência já fechada → 409.
router.post("/lojas/:lojaId/comissao/fechamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = GerarComissaoFechamentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { competencia } = parsed.data;
  const { inicio, fim } = limitesCompetencia(competencia);

  const [jaGerado] = await db.select({ id: comissaoFechamentosTable.id })
    .from(comissaoFechamentosTable)
    .where(and(
      eq(comissaoFechamentosTable.lojaId, lojaId),
      eq(comissaoFechamentosTable.competencia, competencia),
    ));
  if (jaGerado) {
    res.status(409).json({ error: "COMPETENCIA_JA_FECHADA", detalhe: `Fechamento de ${competencia} já foi gerado` });
    return;
  }

  const faixas = await db.select().from(comissaoFaixasTable)
    .where(eq(comissaoFaixasTable.lojaId, lojaId));

  // Vendas da competência: fechados nela, exceto cancelados dentro dela mesma
  // (nunca geram comissão). Estornos: cancelados nela, fechados antes dela.
  const fechadosNaCompetencia = await db.select({
    vendedoraId: contratosTable.vendedoraId,
    valorTotal: contratosTable.valorTotal,
    comissaoEstornadaEm: contratosTable.comissaoEstornadaEm,
  }).from(contratosTable)
    .where(and(
      eq(contratosTable.lojaId, lojaId),
      gte(contratosTable.fechadoEm, inicio),
      lt(contratosTable.fechadoEm, fim),
    ));

  const estornadosNaCompetencia = await db.select({
    vendedoraId: contratosTable.vendedoraId,
    valorTotal: contratosTable.valorTotal,
  }).from(contratosTable)
    .where(and(
      eq(contratosTable.lojaId, lojaId),
      lt(contratosTable.fechadoEm, inicio),
      gte(contratosTable.comissaoEstornadaEm, inicio),
      lt(contratosTable.comissaoEstornadaEm, fim),
    ));

  const porVendedora = new Map<string, { vendasBrutas: number; estornos: number }>();
  const grupo = (id: string) => {
    let g = porVendedora.get(id);
    if (!g) {
      g = { vendasBrutas: 0, estornos: 0 };
      porVendedora.set(id, g);
    }
    return g;
  };
  for (const c of fechadosNaCompetencia) {
    const g = grupo(c.vendedoraId); // registra a vendedora mesmo com venda anulada
    // Cancelado dentro da própria competência → nunca entra na base.
    if (c.comissaoEstornadaEm && c.comissaoEstornadaEm < fim) continue;
    g.vendasBrutas += c.valorTotal;
  }
  for (const c of estornadosNaCompetencia) {
    grupo(c.vendedoraId).estornos += c.valorTotal;
  }

  if (porVendedora.size === 0) {
    res.status(422).json({ error: "SEM_MOVIMENTO", detalhe: `Nenhuma venda ou estorno em ${competencia}` });
    return;
  }

  const vendedoraIds = [...porVendedora.keys()];
  const nomes = await db.select({ id: usuariosTable.id, nome: usuariosTable.nome })
    .from(usuariosTable)
    .where(inArray(usuariosTable.id, vendedoraIds));
  const nomePorId = new Map(nomes.map((n) => [n.id, n.nome]));

  const fechamentos = await db.transaction(async (tx) => {
    const criados = [];
    for (const [vendedoraId, valores] of porVendedora) {
      const resultado = calcularComissao({ ...valores, faixas });
      const fechamentoId = randomUUID();

      let contaPagarId: string | null = null;
      if (resultado.comissaoValor > 0) {
        contaPagarId = randomUUID();
        await tx.insert(contasPagarTable).values({
          id: contaPagarId,
          lojaId,
          tipo: "COMISSAO",
          colaboradorId: vendedoraId,
          competencia,
          descricao: `Comissão ${competencia} — ${nomePorId.get(vendedoraId) ?? "vendedora"}`,
          valorPrevisto: resultado.comissaoValor,
          vencimento: vencimentoComissao(competencia),
          origemComissaoFechamentoId: fechamentoId,
        });
      }

      const [fechamento] = await tx.insert(comissaoFechamentosTable).values({
        id: fechamentoId,
        lojaId,
        usuarioId: vendedoraId,
        competencia,
        totalVendas: resultado.totalVendas,
        comissaoValor: resultado.comissaoValor,
        contaPagarId,
      }).returning();
      criados.push(fechamento);
    }
    return criados;
  });

  res.status(201).json(GerarComissaoFechamentoResponse.parse(fechamentos));
});

export default router;
