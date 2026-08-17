import { Router, type IRouter } from "express";
import { db, atributosTable, atributoOpcoesTable, vestidoAtributosTable, leadInteresseAtributosTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
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
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { randomUUID } from "node:crypto";
import { erroDeValidacao } from "../lib/erros";

const router: IRouter = Router();

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/atributos", requireModulo("vestidos"));

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
    res.status(400).json(erroDeValidacao(parsed.error));
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
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const parsed = UpdateAtributoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const [atributo] = await db.update(atributosTable)
    .set(parsed.data)
    .where(and(eq(atributosTable.id, params.data.atributoId), eq(atributosTable.lojaId, params.data.lojaId)))
    .returning();

  if (!atributo) {
    res.status(404).json({ error: "ATRIBUTO_NAO_ENCONTRADO", detalhe: "Este atributo não existe nesta loja." });
    return;
  }

  const opcoes = await db.select().from(atributoOpcoesTable).where(eq(atributoOpcoesTable.atributoId, atributo.id));
  res.json(UpdateAtributoResponse.parse({ ...atributo, opcoes }));
});

router.delete("/lojas/:lojaId/atributos/:atributoId", async (req, res): Promise<void> => {
  const params = DeleteAtributoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  // S31 — o cascade do banco apagaria a classificação em silêncio. A guarda é
  // de APLICAÇÃO, no molde do `DELETE /vestidos/:id` da S-A25: quem apaga a
  // palavra fica sabendo quantas peças e quantas noivas dependiam dela.
  const alvo = await db.query.atributosTable.findFirst({
    where: and(eq(atributosTable.id, params.data.atributoId), eq(atributosTable.lojaId, params.data.lojaId)),
  });
  if (!alvo) {
    res.status(404).json({ error: "ATRIBUTO_NAO_ENCONTRADO", detalhe: "Este atributo não existe nesta loja." });
    return;
  }
  const [[emPecas], [emNoivas]] = await Promise.all([
    db.select({ n: count() }).from(vestidoAtributosTable).where(eq(vestidoAtributosTable.atributoId, alvo.id)),
    db.select({ n: count() }).from(leadInteresseAtributosTable).where(eq(leadInteresseAtributosTable.atributoId, alvo.id)),
  ]);
  if (emPecas.n > 0 || emNoivas.n > 0) {
    res.status(409).json({
      error: "ATRIBUTO_EM_USO",
      detalhe:
        // S-RM16 — o nome sai SEM aspas retas, por decisão da dona (17/08): o manual
        // (`proprietario.html:711`) cita a frase sem elas, e quem procurava na tela o
        // que leu no manual achava `"Marfim" classifica`. A frase equivalente em
        // `routes/agenda.ts:232` já nomeia sem aspa nenhuma.
        `${alvo.nome} classifica ${emPecas.n} peça(s) e ${emNoivas.n} noiva(s) — apagar levaria essa classificação junto. ` +
        "Para tirá-lo do catálogo sem perder o que já foi classificado, desmarque \"Atributo ativo\".",
    });
    return;
  }
  await db.delete(atributosTable).where(and(eq(atributosTable.id, params.data.atributoId), eq(atributosTable.lojaId, params.data.lojaId)));
  res.status(204).send();
});

router.post("/lojas/:lojaId/atributos/:atributoId/opcoes", async (req, res): Promise<void> => {
  const params = CreateAtributoOpcaoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const parsed = CreateAtributoOpcaoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const atributo = await db.query.atributosTable.findFirst({
    where: and(eq(atributosTable.id, params.data.atributoId), eq(atributosTable.lojaId, params.data.lojaId)),
  });
  if (!atributo) {
    res.status(404).json({ error: "ATRIBUTO_NAO_ENCONTRADO", detalhe: "Este atributo não existe nesta loja." });
    return;
  }

  const [opcao] = await db.insert(atributoOpcoesTable).values({
    id: randomUUID(),
    atributoId: params.data.atributoId,
    ...parsed.data,
  }).returning();

  res.status(201).json(CreateAtributoOpcaoResponse.parse(opcao));
});

router.patch("/lojas/:lojaId/atributos/opcoes/:opcaoId", async (req, res): Promise<void> => {
  const params = UpdateAtributoOpcaoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const parsed = UpdateAtributoOpcaoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const existing = await db.query.atributoOpcoesTable.findFirst({
    where: eq(atributoOpcoesTable.id, params.data.opcaoId),
  });
  if (!existing) {
    res.status(404).json({ error: "OPCAO_NAO_ENCONTRADA", detalhe: "Esta opção não existe nesta loja." });
    return;
  }
  const atributo = await db.query.atributosTable.findFirst({
    where: and(eq(atributosTable.id, existing.atributoId), eq(atributosTable.lojaId, params.data.lojaId)),
  });
  if (!atributo) {
    res.status(404).json({ error: "OPCAO_NAO_ENCONTRADA", detalhe: "Esta opção não existe nesta loja." });
    return;
  }

  const [opcao] = await db.update(atributoOpcoesTable)
    .set(parsed.data)
    .where(eq(atributoOpcoesTable.id, params.data.opcaoId))
    .returning();

  if (!opcao) {
    res.status(404).json({ error: "OPCAO_NAO_ENCONTRADA", detalhe: "Esta opção não existe nesta loja." });
    return;
  }

  res.json(UpdateAtributoOpcaoResponse.parse(opcao));
});

router.delete("/lojas/:lojaId/atributos/opcoes/:opcaoId", async (req, res): Promise<void> => {
  const params = DeleteAtributoOpcaoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const existing = await db.query.atributoOpcoesTable.findFirst({
    where: eq(atributoOpcoesTable.id, params.data.opcaoId),
  });
  // S31 — antes, opção inexistente saía com 204: a tela dizia "apagado" sobre
  // o que nunca existiu. Agora 404, como a irmã acima.
  if (!existing) {
    res.status(404).json({ error: "OPCAO_NAO_ENCONTRADA", detalhe: "Esta opção não existe nesta loja." });
    return;
  }
  const atributo = await db.query.atributosTable.findFirst({
    where: and(eq(atributosTable.id, existing.atributoId), eq(atributosTable.lojaId, params.data.lojaId)),
  });
  if (!atributo) {
    res.status(404).json({ error: "OPCAO_NAO_ENCONTRADA", detalhe: "Esta opção não existe nesta loja." });
    return;
  }
  const [[emPecas], [emNoivas]] = await Promise.all([
    db.select({ n: count() }).from(vestidoAtributosTable).where(eq(vestidoAtributosTable.opcaoId, existing.id)),
    db.select({ n: count() }).from(leadInteresseAtributosTable).where(eq(leadInteresseAtributosTable.opcaoId, existing.id)),
  ]);
  if (emPecas.n > 0 || emNoivas.n > 0) {
    res.status(409).json({
      error: "OPCAO_EM_USO",
      detalhe:
        // S-RM16 — sem aspas retas, pela mesma decisão da linha 109.
        `${existing.valor} classifica ${emPecas.n} peça(s) e ${emNoivas.n} noiva(s) — apagar levaria essa classificação junto.`,
    });
    return;
  }
  await db.delete(atributoOpcoesTable).where(eq(atributoOpcoesTable.id, params.data.opcaoId));
  res.status(204).send();
});

export default router;
