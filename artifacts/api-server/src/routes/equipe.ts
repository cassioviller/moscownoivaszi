import { Router, type IRouter } from "express";
import { db, usuariosTable, usuariosLojasTable, perfisTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { 
  ListEquipeParams,
  ListEquipeResponse,
  AddMembroEquipeParams,
  AddMembroEquipeBody,
  AddMembroEquipeResponse,
  UpdateMembroEquipeParams,
  UpdateMembroEquipeBody,
  UpdateMembroEquipeResponse,
  RemoveMembroEquipeParams
} from "@workspace/api-zod";
import { requireSessaoComLoja } from "../middlewares/auth";
import { hashSenha } from "../lib/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

router.use(requireSessaoComLoja);

router.get("/lojas/:lojaId/equipe", async (req, res): Promise<void> => {
  const params = ListEquipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  
  const equipe = await db
    .select({
      usuarioId: usuariosTable.id,
      lojaId: usuariosLojasTable.lojaId,
      perfilId: usuariosLojasTable.perfilId,
      nome: usuariosTable.nome,
      email: usuariosTable.email,
      perfilNome: perfisTable.nome,
      ativo: usuariosTable.ativo,
    })
    .from(usuariosLojasTable)
    .innerJoin(usuariosTable, eq(usuariosTable.id, usuariosLojasTable.usuarioId))
    .innerJoin(perfisTable, eq(perfisTable.id, usuariosLojasTable.perfilId))
    .where(eq(usuariosLojasTable.lojaId, params.data.lojaId));

  res.json(ListEquipeResponse.parse(equipe));
});

router.post("/lojas/:lojaId/equipe", async (req, res): Promise<void> => {
  const params = AddMembroEquipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AddMembroEquipeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const senhaHash = await hashSenha(parsed.data.senha);
  const usuarioId = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(usuariosTable).values({
      id: usuarioId,
      nome: parsed.data.nome,
      email: parsed.data.email.toLowerCase().trim(),
      senhaHash,
    });

    await tx.insert(usuariosLojasTable).values({
      usuarioId,
      lojaId: params.data.lojaId,
      perfilId: parsed.data.perfilId,
    });
  });

  const [membro] = await db
    .select({
      usuarioId: usuariosTable.id,
      lojaId: usuariosLojasTable.lojaId,
      perfilId: usuariosLojasTable.perfilId,
      nome: usuariosTable.nome,
      email: usuariosTable.email,
      perfilNome: perfisTable.nome,
      ativo: usuariosTable.ativo,
    })
    .from(usuariosLojasTable)
    .innerJoin(usuariosTable, eq(usuariosTable.id, usuariosLojasTable.usuarioId))
    .innerJoin(perfisTable, eq(perfisTable.id, usuariosLojasTable.perfilId))
    .where(and(eq(usuariosLojasTable.lojaId, params.data.lojaId), eq(usuariosLojasTable.usuarioId, usuarioId)));

  res.status(201).json(AddMembroEquipeResponse.parse(membro));
});

router.patch("/lojas/:lojaId/equipe/:usuarioId", async (req, res): Promise<void> => {
  const params = UpdateMembroEquipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMembroEquipeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db.transaction(async (tx) => {
    if (parsed.data.nome !== undefined || parsed.data.ativo !== undefined) {
      await tx.update(usuariosTable)
        .set({ 
          ...(parsed.data.nome !== undefined && { nome: parsed.data.nome }),
          ...(parsed.data.ativo !== undefined && { ativo: parsed.data.ativo }),
          updatedAt: new Date()
        })
        .where(eq(usuariosTable.id, params.data.usuarioId));
    }

    if (parsed.data.perfilId !== undefined) {
      await tx.update(usuariosLojasTable)
        .set({ perfilId: parsed.data.perfilId })
        .where(and(
          eq(usuariosLojasTable.lojaId, params.data.lojaId),
          eq(usuariosLojasTable.usuarioId, params.data.usuarioId)
        ));
    }
  });

  const [membro] = await db
    .select({
      usuarioId: usuariosTable.id,
      lojaId: usuariosLojasTable.lojaId,
      perfilId: usuariosLojasTable.perfilId,
      nome: usuariosTable.nome,
      email: usuariosTable.email,
      perfilNome: perfisTable.nome,
      ativo: usuariosTable.ativo,
    })
    .from(usuariosLojasTable)
    .innerJoin(usuariosTable, eq(usuariosTable.id, usuariosLojasTable.usuarioId))
    .innerJoin(perfisTable, eq(perfisTable.id, usuariosLojasTable.perfilId))
    .where(and(eq(usuariosLojasTable.lojaId, params.data.lojaId), eq(usuariosLojasTable.usuarioId, params.data.usuarioId)));

  if (!membro) {
    res.status(404).json({ error: "Membro da equipe não encontrado" });
    return;
  }

  res.json(UpdateMembroEquipeResponse.parse(membro));
});

router.delete("/lojas/:lojaId/equipe/:usuarioId", async (req, res): Promise<void> => {
  const params = RemoveMembroEquipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  
  await db.delete(usuariosLojasTable)
    .where(and(
      eq(usuariosLojasTable.lojaId, params.data.lojaId),
      eq(usuariosLojasTable.usuarioId, params.data.usuarioId)
    ));
    
  res.status(204).send();
});

export default router;
