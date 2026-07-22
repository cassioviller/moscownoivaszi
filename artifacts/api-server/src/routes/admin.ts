import { Router, type IRouter } from "express";
import { db, lojasTable, perfisTable, usuariosTable, usuariosLojasTable, perfilOverridesLojasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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
  SetPerfilOverrideResponse,
  DeletePerfilOverrideParams,
  GetBackupStatusResponse,
  RunBackupResponse,
  DownloadBackupParams
} from "@workspace/api-zod";
import { requireSessao, requireSuperAdmin } from "../middlewares/auth";
import { hashSenha, encerrarSessoesDoUsuario } from "../lib/auth";
import { registrarAuditoria } from "../lib/auditoria";
import { normalizarAcessos } from "../lib/permissoes";
import { executarBackup, statusBackup, caminhoDoDump } from "../lib/backup";
import { backupLogTable } from "@workspace/db";
import { existsSync } from "node:fs";
import path from "node:path";
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
    // Senha escolhida por outra pessoa (E57) — a troca é cobrada na entrada.
    precisaTrocarSenha: true,
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
    // Resetar a senha de alguém é o mesmo caso do cadastro: quem escolheu foi
    // o admin, e a pessoa troca na próxima entrada.
    updateData.precisaTrocarSenha = true;
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

  const override = await db.transaction(async (tx) => {
    const [linha] = await tx.insert(perfilOverridesLojasTable)
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

    // Mudar o override muda o acesso de TODO MUNDO que tem esse perfil na loja
    // (E56) — e a permissão vive na sessão. Sem derrubá-las, revogar um módulo
    // só valeria no próximo login: por até 8 horas a pessoa segue entrando
    // onde já não pode.
    const afetados = await tx
      .select({ usuarioId: usuariosLojasTable.usuarioId })
      .from(usuariosLojasTable)
      .where(and(
        eq(usuariosLojasTable.lojaId, params.data.lojaId),
        eq(usuariosLojasTable.perfilId, parsed.data.perfilId),
      ));
    for (const a of afetados) await encerrarSessoesDoUsuario(tx, a.usuarioId);

    await registrarAuditoria(tx, {
      lojaId: params.data.lojaId,
      usuario: req.usuario!,
      acao: "PERMISSOES_ALTERADAS",
      entidade: "perfil",
      entidadeId: parsed.data.perfilId,
      detalhe: { acessosModulos: acessos, sessoesEncerradas: afetados.length },
    });
    return linha;
  });

  res.json(
    SetPerfilOverrideResponse.parse({ ...override, acessosModulos: normalizarAcessos(override.acessosModulos) }),
  );
});

// E60: o caminho de volta — remover o override devolve o perfil ao modelo
// global. Mesma disciplina do PUT (E56): mudou permissão, cai sessão e fica
// rastro; o acesso efetivo troca na hora, não no próximo login.
router.delete("/admin/lojas/:lojaId/overrides/:perfilId", async (req, res): Promise<void> => {
  const params = DeletePerfilOverrideParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const removido = await db.transaction(async (tx) => {
    const [linha] = await tx
      .delete(perfilOverridesLojasTable)
      .where(and(
        eq(perfilOverridesLojasTable.lojaId, params.data.lojaId),
        eq(perfilOverridesLojasTable.perfilId, params.data.perfilId),
      ))
      .returning();
    if (!linha) return false;

    const afetados = await tx
      .select({ usuarioId: usuariosLojasTable.usuarioId })
      .from(usuariosLojasTable)
      .where(and(
        eq(usuariosLojasTable.lojaId, params.data.lojaId),
        eq(usuariosLojasTable.perfilId, params.data.perfilId),
      ));
    for (const a of afetados) await encerrarSessoesDoUsuario(tx, a.usuarioId);

    await registrarAuditoria(tx, {
      lojaId: params.data.lojaId,
      usuario: req.usuario!,
      acao: "PERMISSOES_RESTAURADAS",
      entidade: "perfil",
      entidadeId: params.data.perfilId,
      detalhe: { sessoesEncerradas: afetados.length },
    });
    return true;
  });

  if (!removido) {
    res.status(404).json({ error: "Este perfil não tem personalização nesta loja" });
    return;
  }
  res.status(204).send();
});

// Backup do sistema (E30) — o dump é do banco inteiro, então vive no gate
// superadmin junto com as lojas e usuários globais.
router.get("/admin/backup", async (_req, res): Promise<void> => {
  const status = await statusBackup();
  res.json(GetBackupStatusResponse.parse(status));
});

router.post("/admin/backup", async (req, res): Promise<void> => {
  const registro = await executarBackup({
    gatilho: "manual",
    autorNome: req.usuario?.nome,
  });
  res.json(RunBackupResponse.parse(registro));
});

// E59: o dump precisa SAIR da instância — backup que mora só no disco que ele
// protege não é backup. Streaming do .sql.gz; 410 quando a retenção já podou.
router.get("/admin/backup/:backupId/download", async (req, res): Promise<void> => {
  const params = DownloadBackupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [registro] = await db
    .select()
    .from(backupLogTable)
    .where(eq(backupLogTable.id, params.data.backupId));
  if (!registro) {
    res.status(404).json({ error: "Execução de backup não encontrada" });
    return;
  }
  const caminho = caminhoDoDump(registro);
  if (!caminho || !existsSync(caminho)) {
    res.status(410).json({ error: "O arquivo deste backup já foi removido pela retenção" });
    return;
  }
  res.setHeader("Content-Type", "application/gzip");
  res.download(caminho, path.basename(caminho));
});

export default router;
