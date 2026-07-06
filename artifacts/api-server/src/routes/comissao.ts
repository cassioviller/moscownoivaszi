import { Router, type IRouter } from "express";
import { db, comissaoRegrasTable, comissaoFaixasTable, comissaoFechamentosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { 
  ListComissaoRegrasResponse,
  CreateComissaoRegraBody,
  CreateComissaoRegraResponse,
  UpdateComissaoRegraBody,
  UpdateComissaoRegraResponse,
  ListComissaoRegrasResponseItem as ListComissaoFaixasResponseItem,
  ListComissaoRegrasResponse as ListComissaoFaixasResponse,
  CreateComissaoRegraBody as CreateComissaoFaixaBody,
  CreateComissaoRegraResponse as CreateComissaoFaixaResponse,
  DeleteComissaoRegraParams as DeleteComissaoFaixaParams,
  ListComissaoFechamentosResponse,
  GerarComissaoFechamentoBody,
  GerarComissaoFechamentoResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja } from "../middlewares/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

router.use(requireSessaoComLoja);

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
  
  // @ts-ignore
  const { vendedoraId, ...regraData } = parsed.data;

  const [regra] = await db.insert(comissaoRegrasTable).values({
    id: randomUUID(),
    lojaId,
    usuarioId: (vendedoraId as string),
    ...regraData,
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
    ...parsed.data,
  } as any).returning();
  res.status(201).json(CreateComissaoFaixaResponse.parse(faixa));
});

router.delete("/comissao/faixas/:faixaId", async (req, res): Promise<void> => {
  const params = DeleteComissaoFaixaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(comissaoFaixasTable).where(eq(comissaoFaixasTable.id, (params.data as any).faixaId || (params.data as any).id));
  res.status(204).send();
});

router.get("/lojas/:lojaId/comissao/fechamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const fechamentos = await db.select().from(comissaoFechamentosTable).where(eq(comissaoFechamentosTable.lojaId, lojaId)).orderBy(comissaoFechamentosTable.competencia);
  res.json(ListComissaoFechamentosResponse.parse(fechamentos));
});

router.post("/lojas/:lojaId/comissao/fechamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = GerarComissaoFechamentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [fechamento] = await db.insert(comissaoFechamentosTable).values({
    id: randomUUID(),
    lojaId,
    // @ts-ignore
    usuarioId: parsed.data.usuarioId,
    competencia: parsed.data.competencia,
    totalVendas: 0,
    comissaoValor: 0,
  } as any).returning();

  res.status(201).json(GerarComissaoFechamentoResponse.parse([fechamento]));
});

export default router;
