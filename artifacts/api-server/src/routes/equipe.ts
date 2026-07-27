import { Router, type IRouter } from "express";
import { db, usuariosTable, usuariosLojasTable, perfisTable, convitesTable, auditLogTable } from "@workspace/db";
import { eq, and, gt, gte, isNull, desc, count } from "drizzle-orm";
import {
  ListEquipeParams,
  ListEquipeResponse,
  AddMembroEquipeParams,
  AddMembroEquipeBody,
  AddMembroEquipeResponse,
  UpdateMembroEquipeParams,
  UpdateMembroEquipeBody,
  UpdateMembroEquipeResponse,
  RemoveMembroEquipeParams,
  ListConvitesEquipeResponse,
  CreateConviteEquipeBody,
  CreateConviteEquipeResponse,
  ReenviarConviteEquipeResponse,
  GetAtividadeEquipeResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { usuarioNaLoja } from "../lib/escopo-loja";
import { registrarAuditoria } from "../lib/auditoria";
import { hashSenha, gerarTokenConvite, encerrarSessoesDoUsuario, CONVITE_TTL_MS } from "../lib/auth";
import { ehViolacaoUnica , erroDeValidacao } from "../lib/erros";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

router.use(requireSessaoComLoja);
// Gerir a equipe é ato administrativo: criar login, trocar perfil, remover
// membro. Sem este gate, qualquer sessão com loja ativa se auto-promovia a
// admin. O módulo é `admin` — o mesmo que a tela já exige (equipe/index.tsx).
router.use("/lojas/:lojaId/equipe", requireModulo("admin"));

router.get("/lojas/:lojaId/equipe", async (req, res): Promise<void> => {
  const params = ListEquipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
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

// Log de atividade (E18): a visão da dona — quem entrou quando e quem mexeu
// em quê. `ultimoLoginEm` vem do carimbo no login (sessão não serve: logout e
// expiração apagam a linha); as ações vêm do audit_log do E10. Mesmo gate
// admin do restante da gestão de equipe.
router.get("/lojas/:lojaId/equipe/atividade", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const corte30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [membros, acoes, eventos] = await Promise.all([
    db
      .select({
        usuarioId: usuariosTable.id,
        nome: usuariosTable.nome,
        email: usuariosTable.email,
        perfilNome: perfisTable.nome,
        ativo: usuariosTable.ativo,
        ultimoAcesso: usuariosTable.ultimoLoginEm,
      })
      .from(usuariosLojasTable)
      .innerJoin(usuariosTable, eq(usuariosTable.id, usuariosLojasTable.usuarioId))
      .innerJoin(perfisTable, eq(perfisTable.id, usuariosLojasTable.perfilId))
      .where(eq(usuariosLojasTable.lojaId, lojaId)),
    db
      .select({ usuarioId: auditLogTable.usuarioId, qtd: count() })
      .from(auditLogTable)
      .where(and(eq(auditLogTable.lojaId, lojaId), gte(auditLogTable.criadoEm, corte30d)))
      .groupBy(auditLogTable.usuarioId),
    db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.lojaId, lojaId))
      .orderBy(desc(auditLogTable.criadoEm))
      .limit(50),
  ]);

  const acoesPor = new Map(acoes.map((a) => [a.usuarioId, a.qtd]));
  res.json(GetAtividadeEquipeResponse.parse({
    membros: membros
      .map((m) => ({ ...m, acoes30d: acoesPor.get(m.usuarioId) ?? 0 }))
      .sort((a, b) => (b.ultimoAcesso?.getTime() ?? 0) - (a.ultimoAcesso?.getTime() ?? 0)),
    eventos,
  }));
});

router.post("/lojas/:lojaId/equipe", async (req, res): Promise<void> => {
  const params = AddMembroEquipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const parsed = AddMembroEquipeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
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
      // A senha foi escolhida por OUTRA pessoa (E57): vale para entrar uma vez,
      // e a tela cobra a troca antes de deixar usar o sistema. Quem aceita
      // convite escolhe a própria e não passa por aqui.
      precisaTrocarSenha: true,
    });

    await tx.insert(usuariosLojasTable).values({
      usuarioId,
      lojaId: params.data.lojaId,
      perfilId: parsed.data.perfilId,
    });

    await registrarAuditoria(tx, {
      lojaId: params.data.lojaId,
      usuario: req.usuario!,
      acao: "MEMBRO_ADICIONADO",
      entidade: "usuario",
      entidadeId: usuarioId,
      // A senha NÃO entra no detalhe, nem o hash: a trilha é lida por gente e
      // exportada em CSV.
      detalhe: { nome: parsed.data.nome, email: parsed.data.email, perfilId: parsed.data.perfilId },
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

// ── Convites por link ──
// ATENÇÃO de roteamento: registradas ANTES das rotas /equipe/:usuarioId para
// "convites" (literal) nunca casar como :usuarioId (mesmo aviso de vestidos).

router.get("/lojas/:lojaId/equipe/convites", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  // Só os PENDENTES: não usados e não expirados. O token sai de propósito —
  // é o admin quem monta e re-copia o link.
  const convites = await db
    .select({
      id: convitesTable.id,
      lojaId: convitesTable.lojaId,
      token: convitesTable.token,
      nome: convitesTable.nome,
      email: convitesTable.email,
      perfilId: convitesTable.perfilId,
      perfilNome: perfisTable.nome,
      criadoEm: convitesTable.criadoEm,
      expiraEm: convitesTable.expiraEm,
    })
    .from(convitesTable)
    .innerJoin(perfisTable, eq(perfisTable.id, convitesTable.perfilId))
    .where(and(
      eq(convitesTable.lojaId, lojaId),
      isNull(convitesTable.usadoEm),
      gt(convitesTable.expiraEm, new Date()),
    ))
    .orderBy(desc(convitesTable.criadoEm));
  res.json(ListConvitesEquipeResponse.parse(convites));
});

router.post("/lojas/:lojaId/equipe/convites", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateConviteEquipeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();

  // Já é membro DESTA loja? Convite não faz sentido — 409 nomeado.
  const [membro] = await db
    .select({ usuarioId: usuariosLojasTable.usuarioId })
    .from(usuariosLojasTable)
    .innerJoin(usuariosTable, eq(usuariosTable.id, usuariosLojasTable.usuarioId))
    .where(and(eq(usuariosLojasTable.lojaId, lojaId), eq(usuariosTable.email, email)));
  if (membro) {
    res.status(409).json({ error: "CONVIDADO_JA_E_MEMBRO", detalhe: "Este e-mail já é da equipe desta loja" });
    return;
  }

  const valores = {
    id: randomUUID(),
    lojaId,
    token: gerarTokenConvite(),
    nome: parsed.data.nome,
    email,
    perfilId: parsed.data.perfilId,
    criadoPorId: req.usuario!.id,
    expiraEm: new Date(Date.now() + CONVITE_TTL_MS),
  };
  try {
    await db.transaction(async (tx) => {
      await tx.insert(convitesTable).values(valores);
      await registrarAuditoria(tx, {
        lojaId,
        usuario: req.usuario!,
        acao: "CONVITE_CRIADO",
        entidade: "convite",
        entidadeId: valores.id,
        // O TOKEN fica de fora: quem lê a trilha (ou o CSV dela) ganharia um
        // link de entrada válido na loja.
        detalhe: { email, perfilId: valores.perfilId },
      });
    });
  } catch (err) {
    // Unique parcial (loja,email pendente): a corrida resolve no banco.
    if (ehViolacaoUnica(err)) {
      res.status(409).json({ error: "CONVITE_PENDENTE", detalhe: "Use reenviar ou cancele o convite existente" });
      return;
    }
    throw err;
  }

  const [perfil] = await db
    .select({ nome: perfisTable.nome })
    .from(perfisTable)
    .where(eq(perfisTable.id, valores.perfilId));
  req.log.info({ conviteId: valores.id, lojaId, adminId: valores.criadoPorId, email }, "convite_criado");
  res.status(201).json(CreateConviteEquipeResponse.parse({
    ...valores,
    perfilNome: perfil?.nome ?? null,
    criadoEm: new Date(),
  }));
});

router.post("/lojas/:lojaId/equipe/convites/:conviteId/reenviar", async (req, res): Promise<void> => {
  const { lojaId, conviteId } = req.params;
  // Regenera token e validade — o link antigo morre (desejável se vazou no
  // WhatsApp errado). Só convite ainda não usado.
  const [renovado] = await db
    .update(convitesTable)
    .set({ token: gerarTokenConvite(), expiraEm: new Date(Date.now() + CONVITE_TTL_MS) })
    .where(and(
      eq(convitesTable.id, conviteId as string),
      eq(convitesTable.lojaId, lojaId as string),
      isNull(convitesTable.usadoEm),
    ))
    .returning();
  if (!renovado) {
    res.status(404).json({ error: "Convite não encontrado" });
    return;
  }
  const [perfil] = await db
    .select({ nome: perfisTable.nome })
    .from(perfisTable)
    .where(eq(perfisTable.id, renovado.perfilId));
  req.log.info({ conviteId: renovado.id, lojaId }, "convite_reenviado");
  res.json(ReenviarConviteEquipeResponse.parse({ ...renovado, perfilNome: perfil?.nome ?? null }));
});

router.delete("/lojas/:lojaId/equipe/convites/:conviteId", async (req, res): Promise<void> => {
  const { lojaId, conviteId } = req.params;
  const removido = await db.transaction(async (tx) => {
    const [linha] = await tx
      .delete(convitesTable)
      .where(and(eq(convitesTable.id, conviteId as string), eq(convitesTable.lojaId, lojaId as string)))
      .returning({ id: convitesTable.id, email: convitesTable.email });
    if (!linha) return null;
    await registrarAuditoria(tx, {
      lojaId: lojaId as string,
      usuario: req.usuario!,
      acao: "CONVITE_CANCELADO",
      entidade: "convite",
      entidadeId: linha.id,
      detalhe: { email: linha.email },
    });
    return linha;
  });
  if (!removido) {
    res.status(404).json({ error: "Convite não encontrado" });
    return;
  }
  req.log.info({ conviteId, lojaId }, "convite_cancelado");
  res.status(204).send();
});

router.patch("/lojas/:lojaId/equipe/:usuarioId", async (req, res): Promise<void> => {
  const params = UpdateMembroEquipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const parsed = UpdateMembroEquipeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  // B1 🔴 — a PROVA DE PERTENCIMENTO vem ANTES de qualquer escrita.
  //
  // `usuarios` é tabela GLOBAL: o `requireModulo("admin")` acima só diz que
  // quem chama administra a loja da URL, não que o `usuarioId` do path é dessa
  // loja. O UPDATE de `nome`/`ativo` ia direto pelo id e a conferência só
  // acontecia no SELECT final, DEPOIS do commit — o 404 era cosmético. Com
  // isso, um admin da loja A mandava `{"ativo": false}` no id da dona da loja B
  // e a derrubava (login recusado, sessões vivas encerradas), com a trilha
  // ficando na loja A, onde a vítima nunca olha.
  if (!(await usuarioNaLoja(params.data.usuarioId, params.data.lojaId))) {
    res.status(404).json({ error: "Membro da equipe não encontrado" });
    return;
  }

  // Trocar o perfil ou inativar muda o ACESSO; renomear, não. Só o primeiro
  // caso derruba sessão — obrigar a pessoa a logar de novo porque alguém
  // corrigiu um acento no nome dela seria castigo sem motivo.
  const mudouAcesso = parsed.data.perfilId !== undefined || parsed.data.ativo === false;

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

    // Dentro da MESMA transação: derrubar a sessão e mudar o acesso precisam
    // acontecer juntos, ou a pessoa fica com o acesso antigo válido.
    if (mudouAcesso) await encerrarSessoesDoUsuario(tx, params.data.usuarioId);

    await registrarAuditoria(tx, {
      lojaId: params.data.lojaId,
      usuario: req.usuario!,
      acao: "MEMBRO_ALTERADO",
      entidade: "usuario",
      entidadeId: params.data.usuarioId,
      detalhe: {
        ...(parsed.data.nome !== undefined && { nome: parsed.data.nome }),
        ...(parsed.data.ativo !== undefined && { ativo: parsed.data.ativo }),
        ...(parsed.data.perfilId !== undefined && { perfilId: parsed.data.perfilId }),
        sessoesEncerradas: mudouAcesso,
      },
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
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }

  // B1 🔴 — mesma prova de pertencimento do PATCH. O `delete` do vínculo já era
  // escopado, mas `encerrarSessoesDoUsuario` rodava incondicionalmente sobre o
  // id do path: um DoS de sessão repetível contra qualquer conta do sistema,
  // com a rota respondendo 204 mesmo sem ter removido nada.
  if (!(await usuarioNaLoja(params.data.usuarioId, params.data.lojaId))) {
    res.status(404).json({ error: "Membro da equipe não encontrado" });
    return;
  }

  await db.transaction(async (tx) => {
    // Defensivo: remover o membro também derruba convites pendentes do e-mail
    // dele nesta loja — senão o link ainda no WhatsApp recriaria o vínculo.
    const [usuario] = await tx
      .select({ email: usuariosTable.email })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, params.data.usuarioId));
    if (usuario) {
      await tx.delete(convitesTable).where(and(
        eq(convitesTable.lojaId, params.data.lojaId),
        eq(convitesTable.email, usuario.email),
        isNull(convitesTable.usadoEm),
      ));
    }
    await tx.delete(usuariosLojasTable)
      .where(and(
        eq(usuariosLojasTable.lojaId, params.data.lojaId),
        eq(usuariosLojasTable.usuarioId, params.data.usuarioId)
      ));

    // Removida da equipe com a aba aberta continuaria navegando até a sessão
    // expirar — o vínculo já não existe, e o acesso não pode sobreviver a ele.
    await encerrarSessoesDoUsuario(tx, params.data.usuarioId);

    await registrarAuditoria(tx, {
      lojaId: params.data.lojaId,
      usuario: req.usuario!,
      acao: "MEMBRO_REMOVIDO",
      entidade: "usuario",
      entidadeId: params.data.usuarioId,
      detalhe: { email: usuario?.email ?? null },
    });
  });

  res.status(204).send();
});

export default router;
