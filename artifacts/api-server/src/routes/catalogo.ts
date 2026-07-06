import { Router, type IRouter } from "express";
import { db, atributosTable, atributoOpcoesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { 
  ListAtributosResponse,
  CreateAtributoBody,
  CreateAtributoResponse,
  UpdateAtributoParams,
  UpdateAtributoBody,
  UpdateAtributoResponse,
  DeleteAtributoParams,
  CreateAtributoOpcaoParams,
  CreateAtributoOpcaoBody,
  CreateAtributoOpcaoResponse,
  UpdateAtributoOpcaoParams,
  UpdateAtributoOpcaoBody,
  UpdateAtributoOpcaoResponse,
  DeleteAtributoOpcaoParams
} from "@workspace/api-zod";
import { requireSessaoComLoja } from "../middlewares/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

router.use(requireSessaoComLoja);

router.get("/lojas/:lojaId/atributos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const atributos = await db.query.atributosTable.findMany({
    where: eq(atributosTable.lojaId, lojaId),
    with: {
      opcoes: true,
    },
    orderBy: atributosTable.ordem,
  });

  res.json(ListAtributosResponse.parse(atributos));
});

router.post("/lojas/:lojaId/atributos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateAtributoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [atributo] = await db.insert(atributosTable).values({
    id: randomUUID(),
    lojaId,
    ...parsed.data,
  }).returning();

  res.status(201).json(CreateAtributoResponse.parse({ ...atributo, opcoes: [] }));
});

router.patch("/lojas/:lojaId/atributos/:atributoId", async (req, res): Promise<void> => {
  const params = UpdateAtributoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAtributoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [atributo] = await db.update(atributosTable)
    .set(parsed.data)
    .where(and(eq(atributosTable.id, params.data.atributoId), eq(atributosTable.lojaId, params.data.lojaId)))
    .returning();

  if (!atributo) {
    res.status(404).json({ error: "Atributo not found" });
    return;
  }

  const opcoes = await db.select().from(atributoOpcoesTable).where(eq(atributoOpcoesTable.atributoId, atributo.id));
  res.json(UpdateAtributoResponse.parse({ ...atributo, opcoes }));
});

router.delete("/lojas/:lojaId/atributos/:atributoId", async (req, res): Promise<void> => {
  const params = DeleteAtributoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(atributosTable).where(and(eq(atributosTable.id, params.data.atributoId), eq(atributosTable.lojaId, params.data.lojaId)));
  res.status(204).send();
});

router.post("/atributos/:atributoId/opcoes", async (req, res): Promise<void> => {
  const params = CreateAtributoOpcaoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateAtributoOpcaoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [opcao] = await db.insert(atributoOpcoesTable).values({
    id: randomUUID(),
    atributoId: params.data.atributoId,
    ...parsed.data,
  }).returning();

  res.status(201).json(CreateAtributoOpcaoResponse.parse(opcao));
});

router.patch("/atributos/opcoes/:opcaoId", async (req, res): Promise<void> => {
  const params = UpdateAtributoOpcaoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAtributoOpcaoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [opcao] = await db.update(atributoOpcoesTable)
    .set(parsed.data)
    .where(eq(atributoOpcoesTable.id, params.data.opcaoId))
    .returning();

  if (!opcao) {
    res.status(404).json({ error: "Opção not found" });
    return;
  }

  res.json(UpdateAtributoOpcaoResponse.parse(opcao));
});

router.delete("/atributos/opcoes/:opcaoId", async (req, res): Promise<void> => {
  const params = DeleteAtributoOpcaoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(atributoOpcoesTable).where(eq(atributoOpcoesTable.id, params.data.opcaoId));
  res.status(204).send();
});

export default router;
