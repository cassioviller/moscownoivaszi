import { Router, type IRouter } from "express";
import { db, lojasTable, perfisTable, usuariosTable, usuariosLojasTable, perfilOverridesLojasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { 
  ListLojasResponse, 
  CreateLojaBody, 
  CreateLojaResponse, 
  UpdateLojaParams, 
  UpdateLojaBody, 
  UpdateLojaResponse, 
  DeleteLojaParams,
  ListPerfisResponse,
  CreatePerfilBody,
  CreatePerfilResponse,
  UpdatePerfilParams,
  UpdatePerfilBody,
  UpdatePerfilResponse,
  DeletePerfilParams,
  ListUsuariosResponse,
  CreateUsuarioBody,
  CreateUsuarioResponse,
  UpdateUsuarioParams,
  UpdateUsuarioBody,
  UpdateUsuarioResponse,
  DeleteUsuarioParams,
  ListPerfilOverridesParams,
  ListPerfilOverridesResponse,
  SetPerfilOverrideParams,
  SetPerfilOverrideBody,
  SetPerfilOverrideResponse
} from "@workspace/api-zod";
import { requireSessao, requireSuperAdmin } from "../middlewares/auth";
import { hashSenha } from "../lib/auth";
import { normalizarAcessos } from "../lib/permissoes";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

// Escopado ao path /admin: este router é montado sem prefixo junto aos demais,
// então um use() sem path aplicaria superadmin à API inteira.
router.use("/admin", requireSessao, requireSuperAdmin);

// Lojas
router.get("/admin/lojas", async (_req, res): Promise<void> => {
  const lojas = await db.select().from(lojasTable).orderBy(lojasTable.nome);
  res.json(ListLojasResponse.parse(lojas));
});

router.post("/admin/lojas", async (req, res): Promise<void> => {
  const parsed = CreateLojaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [loja] = await db.insert(lojasTable).values({
    id: randomUUID(),
    ...parsed.data,
  }).returning();
  res.status(201).json(CreateLojaResponse.parse(loja));
});

router.patch("/admin/lojas/:lojaId", async (req, res): Promise<void> => {
  const params = UpdateLojaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateLojaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [loja] = await db.update(lojasTable)
    .set(parsed.data)
    .where(eq(lojasTable.id, params.data.lojaId))
    .returning();
  if (!loja) {
    res.status(404).json({ error: "Loja not found" });
    return;
  }
  res.json(UpdateLojaResponse.parse(loja));
});

router.delete("/admin/lojas/:lojaId", async (req, res): Promise<void> => {
  const params = DeleteLojaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(lojasTable).where(eq(lojasTable.id, params.data.lojaId));
  res.status(204).send();
});

// Perfis
//
// `acessosModulos` é normalizado na ESCRITA e na LEITURA. Na escrita, para o
// banco não guardar shape inventado; na leitura, para uma linha gravada antes
// do modelo por ação sair daqui já traduzida — quem consome nunca vê o formato
// plano antigo, e a resposta bate com o contrato.
router.get("/admin/perfis", async (_req, res): Promise<void> => {
  const perfis = await db.select().from(perfisTable).orderBy(perfisTable.nome);
  res.json(
    ListPerfisResponse.parse(
      perfis.map((p) => ({ ...p, acessosModulos: normalizarAcessos(p.acessosModulos) })),
    ),
  );
});

router.post("/admin/perfis", async (req, res): Promise<void> => {
  const parsed = CreatePerfilBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [perfil] = await db.insert(perfisTable).values({
    id: randomUUID(),
    ...parsed.data,
    acessosModulos: normalizarAcessos(parsed.data.acessosModulos),
  }).returning();
  res.status(201).json(CreatePerfilResponse.parse(perfil));
});

router.patch("/admin/perfis/:perfilId", async (req, res): Promise<void> => {
  const params = UpdatePerfilParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePerfilBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [perfil] = await db.update(perfisTable)
    .set({
      ...parsed.data,
      // PATCH parcial: só normaliza o que veio. `undefined` não vira {} zerado,
      // que trancaria o perfil para fora ao renomeá-lo.
      ...(parsed.data.acessosModulos !== undefined
        ? { acessosModulos: normalizarAcessos(parsed.data.acessosModulos) }
        : {}),
    })
    .where(eq(perfisTable.id, params.data.perfilId))
    .returning();
  if (!perfil) {
    res.status(404).json({ error: "Perfil not found" });
    return;
  }
  res.json(
    UpdatePerfilResponse.parse({ ...perfil, acessosModulos: normalizarAcessos(perfil.acessosModulos) }),
  );
});

router.delete("/admin/perfis/:perfilId", async (req, res): Promise<void> => {
  const params = DeletePerfilParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(perfisTable).where(eq(perfisTable.id, params.data.perfilId));
  res.status(204).send();
});

// Usuarios
router.get("/admin/usuarios", async (_req, res): Promise<void> => {
  const usuarios = await db.select().from(usuariosTable).orderBy(usuariosTable.nome);
  res.json(ListUsuariosResponse.parse(usuarios));
});

router.post("/admin/usuarios", async (req, res): Promise<void> => {
  const parsed = CreateUsuarioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const senhaHash = await hashSenha(parsed.data.senha);
  const [usuario] = await db.insert(usuariosTable).values({
    id: randomUUID(),
    nome: parsed.data.nome,
    email: parsed.data.email.toLowerCase().trim(),
    senhaHash,
    isSuperAdmin: parsed.data.isSuperAdmin || false,
  }).returning();
  res.status(201).json(CreateUsuarioResponse.parse(usuario));
});

router.patch("/admin/usuarios/:usuarioId", async (req, res): Promise<void> => {
  const params = UpdateUsuarioParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUsuarioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const updateData: any = { ...parsed.data };
  if (updateData.senha) {
    updateData.senhaHash = await hashSenha(updateData.senha);
    delete updateData.senha;
  }

  const [usuario] = await db.update(usuariosTable)
    .set(updateData)
    .where(eq(usuariosTable.id, params.data.usuarioId))
    .returning();
  if (!usuario) {
    res.status(404).json({ error: "Usuario not found" });
    return;
  }
  res.json(UpdateUsuarioResponse.parse(usuario));
});

router.delete("/admin/usuarios/:usuarioId", async (req, res): Promise<void> => {
  const params = DeleteUsuarioParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(usuariosTable).where(eq(usuariosTable.id, params.data.usuarioId));
  res.status(204).send();
});

// Perfil Overrides
router.get("/admin/lojas/:lojaId/overrides", async (req, res): Promise<void> => {
  const params = ListPerfilOverridesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const overrides = await db.select().from(perfilOverridesLojasTable).where(eq(perfilOverridesLojasTable.lojaId, params.data.lojaId));
  res.json(
    ListPerfilOverridesResponse.parse(
      overrides.map((o) => ({ ...o, acessosModulos: normalizarAcessos(o.acessosModulos) })),
    ),
  );
});

router.put("/admin/lojas/:lojaId/overrides", async (req, res): Promise<void> => {
  const params = SetPerfilOverrideParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SetPerfilOverrideBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const acessos = normalizarAcessos(parsed.data.acessosModulos);
  const [override] = await db.insert(perfilOverridesLojasTable)
    .values({
      lojaId: params.data.lojaId,
      perfilId: parsed.data.perfilId,
      acessosModulos: acessos,
    })
    .onConflictDoUpdate({
      target: [perfilOverridesLojasTable.lojaId, perfilOverridesLojasTable.perfilId],
      set: { acessosModulos: acessos, updatedAt: new Date() },
    })
    .returning();

  res.json(
    SetPerfilOverrideResponse.parse({ ...override, acessosModulos: normalizarAcessos(override.acessosModulos) }),
  );
});

export default router;
