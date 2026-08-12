import { Router, type IRouter } from "express";
import { db, lojasTable, perfisTable, usuariosTable, usuariosLojasTable, perfilOverridesLojasTable, leadsTable, contratosTable, parcelasTable, pagamentosTable, vestidosTable, orcamentosTable, atendimentosTable, comissaoFechamentosTable, comissaoRegrasTable, recorrenciasTable, convitesTable, auditLogTable } from "@workspace/db";
import { eq, and, sql, count, inArray, isNull, desc } from "drizzle-orm";
import { STATUS_ABERTO, hojeLocal, inicioDoDia, primeiroDiaDoMes } from "@workspace/financeiro-core";
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
  DownloadBackupParams,
  GetConsolidadoResponse,
  ListAuditoriaGlobalResponse
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
import { erroDeValidacao } from "../lib/erros";

const router: IRouter = Router();

// Escopado ao path /admin: este router é montado sem prefixo junto aos demais,
// então um use() sem path aplicaria superadmin à API inteira.
router.use("/admin", requireSessao, requireSuperAdmin);

// Lojas
router.get("/admin/lojas", async (_req, res): Promise<void> => {
  const lojas = await db.select().from(lojasTable).orderBy(lojasTable.nome);
  res.json(ListLojasResponse.parse(lojas));
});

/**
 * S3 — a trilha do que não é de loja nenhuma.
 *
 * As linhas com `loja_id` nulo não aparecem em `/lojas/:id/financeiro/auditoria`
 * (aquela tela filtra por loja, e deve mesmo), então sem esta porta o rastro
 * seria gravado e nunca lido — meio conserto, que é o que se cobrou da S15
 * algumas horas atrás. Aqui é o único lugar do sistema onde a pergunta "quem
 * apagou aquela loja?" tem resposta.
 *
 * Sem paginação de propósito: são os dois atos mais raros do sistema, e ambos
 * já são recusados quando há histórico. Uma lista que cresce um punhado de
 * linhas por ano não precisa de janela — e o dia em que precisar, a existência
 * dela é que vai contar a história.
 */
router.get("/admin/auditoria-global", async (_req, res): Promise<void> => {
  const linhas = await db
    .select()
    .from(auditLogTable)
    .where(isNull(auditLogTable.lojaId))
    .orderBy(desc(auditLogTable.criadoEm))
    .limit(500);
  res.json(ListAuditoriaGlobalResponse.parse(linhas));
});

router.post("/admin/lojas", async (req, res): Promise<void> => {
  const parsed = CreateLojaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
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
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const parsed = UpdateLojaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const [loja] = await db.update(lojasTable)
    .set(parsed.data)
    .where(eq(lojasTable.id, params.data.lojaId))
    .returning();
  if (!loja) {
    res.status(404).json({ error: "LOJA_NAO_ENCONTRADA", detalhe: "Esta loja não existe." });
    return;
  }
  res.json(UpdateLojaResponse.parse(loja));
});

/**
 * E106/S1 🔴 — apagar uma loja deixa de ser um clique sem volta.
 *
 * A rota tinha o gate certo (`requireSuperAdmin`, acima) e **nenhuma guarda de
 * destruição**: `DELETE FROM lojas WHERE id = ?` e 204. `lojas` é referenciada
 * por **33 FKs em CASCADE e zero RESTRICT** — medidas em `pg_constraint` (o
 * número era 31 quando este bloco nasceu e cresceu com E151/E154) —, e
 * entre elas estão `parcelas` (com `recebido_em` preenchido), `pagamentos`,
 * `contratos`, `vestidos` (o acervo inteiro), `usuarios_lojas` (os vínculos da
 * equipe) e `audit_log`. Uma linha some e leva 31 tabelas junto.
 *
 * É o irmão maior do B2, que o E91 fechou em `DELETE /admin/usuarios/:id`, e
 * ganha a mesma forma: contar o que seria destruído, **recusar com 409 legível**
 * e ensinar o caminho que preserva. Aqui a diferença é o alcance — lá morria o
 * histórico de UMA pessoa, aqui morre o de uma loja inteira.
 *
 * **A contagem não é só de dinheiro, e isso é decisão.** Uma loja sem contrato
 * nenhum pode ter 200 vestidos fotografados e seis pessoas na equipe: é trabalho,
 * e some igual. Por isso o acervo e a equipe entram na régua ao lado das
 * parcelas.
 *
 * **A trilha É gravada aqui desde a S3.** Este bloco dizia o contrário, e a
 * razão era boa: `audit_log.loja_id` era `notNull` + CASCADE, então registrar
 * "loja X apagada" dentro da loja X apagava o registro junto com ela. Sobrava um
 * `req.log.warn`. O conserto foi tornar a coluna anulável — **nulo é o ato
 * global** —, e é o nulo que faz o registro sobreviver ao que ele registra. Lê-se
 * em `GET /admin/auditoria-global`.
 */
router.delete("/admin/lojas/:lojaId", async (req, res): Promise<void> => {
  const params = DeleteLojaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const lojaId = params.data.lojaId;

  /**
   * S33 — a LEITURA da guarda entra na transação, e com tranca.
   *
   * O `DELETE` sempre esteve em transação; quem ficava fora era a contagem, e
   * em READ COMMITTED movê-la para dentro NÃO fecha a corrida: a linha
   * inserida por outra sessão entre a contagem e o delete continuava invisível
   * para o `count()` e visível para o CASCADE — e aqui são 33 CASCADE e zero
   * RESTRICT, não há rede do banco (o irmão DELETE /admin/usuarios só não
   * corre o risco porque lá existem 5 RESTRICT).
   *
   * O `FOR UPDATE` na linha da loja fecha de verdade: todo INSERT de filho
   * precisa de `FOR KEY SHARE` na linha-pai para validar a FK, e KEY SHARE
   * conflita com FOR UPDATE. Um insert em voo segura a nossa tranca até
   * commitar (e a contagem, statement novo, o vê); um insert que chegue depois
   * espera a transação inteira — e encontra a loja apagada, FK recusada.
   */
  const veredito = await db.transaction(async (tx) => {
    // 404 ANTES de qualquer coisa — e trancando. O `delete` devolvia 204 mesmo
    // sem ter removido linha nenhuma (o 404 cosmético que o E91 corrigiu no
    // DELETE da equipe).
    const [loja] = await tx.select().from(lojasTable).where(eq(lojasTable.id, lojaId)).for("update");
    if (!loja) return { status: 404 as const };

    const [[l], [c], [p], [pg], [v], [e]] = await Promise.all([
      tx.select({ n: count() }).from(leadsTable).where(eq(leadsTable.lojaId, lojaId)),
      tx.select({ n: count() }).from(contratosTable).where(eq(contratosTable.lojaId, lojaId)),
      tx.select({ n: count() }).from(parcelasTable).where(eq(parcelasTable.lojaId, lojaId)),
      tx.select({ n: count() }).from(pagamentosTable).where(eq(pagamentosTable.lojaId, lojaId)),
      tx.select({ n: count() }).from(vestidosTable).where(eq(vestidosTable.lojaId, lojaId)),
      tx.select({ n: count() }).from(usuariosLojasTable).where(eq(usuariosLojasTable.lojaId, lojaId)),
    ]);

    // A ordem é a do estrago: dinheiro primeiro, porque é o irreversível de
    // verdade — o resto se recadastra, uma parcela recebida não.
    const historico = [
      p.n > 0 ? `${p.n} parcela(s)` : null,
      pg.n > 0 ? `${pg.n} pagamento(s)` : null,
      c.n > 0 ? `${c.n} contrato(s)` : null,
      l.n > 0 ? `${l.n} noiva(s)` : null,
      v.n > 0 ? `${v.n} vestido(s) no acervo` : null,
      e.n > 0 ? `${e.n} pessoa(s) na equipe` : null,
    ].filter(Boolean);

    if (historico.length > 0) return { status: 409 as const, historico };

    /**
     * S3 — e aqui o `loja_id` nulo é o que faz o registro EXISTIR.
     *
     * Gravar "loja X apagada" com `loja_id = X` num FK em CASCADE apagaria o
     * próprio registro no mesmo `DELETE`. O rastro morreria no instante exato
     * em que passasse a importar — que é o motivo de a coluna ter deixado de
     * ser obrigatória, e não uma frouxidão de modelagem.
     */
    await tx.delete(lojasTable).where(eq(lojasTable.id, lojaId));
    await registrarAuditoria(tx, {
      lojaId: null,
      usuario: { id: req.usuario!.id, nome: req.usuario!.nome },
      acao: "LOJA_EXCLUIDA",
      entidade: "loja",
      entidadeId: lojaId,
      detalhe: { nome: loja.nome, cnpj: loja.cnpj ?? null },
    });
    return { status: 204 as const };
  });

  if (veredito.status === 404) {
    res.status(404).json({ error: "LOJA_NAO_ENCONTRADA", detalhe: "Esta loja não existe." });
    return;
  }
  if (veredito.status === 409) {
    res.status(409).json({
      error: "LOJA_COM_HISTORICO",
      detalhe: `Esta loja tem ${veredito.historico.join(", ")} — excluir apagaria tudo isso, inclusive parcelas já recebidas. Desative a loja em vez de excluir: ela sai dos seletores e ninguém entra nela, e nada é perdido.`,
    });
    return;
  }
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
    res.status(400).json(erroDeValidacao(parsed.error));
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
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const parsed = UpdatePerfilBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  // E80: o perfil do sistema é intocável pela API — hoje só a UI protegia, e
  // um curl derrubava o Admin (renome ou permissões a menos = loja trancada).
  const [alvo] = await db.select({ sistema: perfisTable.sistema }).from(perfisTable)
    .where(eq(perfisTable.id, params.data.perfilId));
  if (alvo?.sistema) {
    res.status(403).json({ error: "PERFIL_SISTEMA", detalhe: "o perfil do sistema não pode ser alterado" });
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
    res.status(404).json({ error: "PERFIL_NAO_ENCONTRADO", detalhe: "Este perfil não existe." });
    return;
  }
  res.json(
    UpdatePerfilResponse.parse({ ...perfil, acessosModulos: normalizarAcessos(perfil.acessosModulos) }),
  );
});

router.delete("/admin/perfis/:perfilId", async (req, res): Promise<void> => {
  const params = DeletePerfilParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  // E80: apagar o perfil do sistema deixaria a loja sem Admin — recusa igual.
  const [alvo] = await db.select({ sistema: perfisTable.sistema }).from(perfisTable)
    .where(eq(perfisTable.id, params.data.perfilId));
  if (alvo?.sistema) {
    res.status(403).json({ error: "PERFIL_SISTEMA", detalhe: "o perfil do sistema não pode ser removido" });
    return;
  }
  if (!alvo) {
    res.status(404).json({ error: "PERFIL_NAO_ENCONTRADO", detalhe: "Este perfil não existe." });
    return;
  }
  // Mesma régua do DELETE de usuário: o 409 LEGÍVEL sai antes de o banco
  // levantar o 23503, e ele diz QUEM depende do perfil. Sem isto, a resposta
  // era o `VINCULO_EXISTENTE` genérico ("há registros dependendo deste") — que
  // não diz se são pessoas, convites ou overrides, nem em que loja, e deixa
  // quem administra sem próximo passo.
  const [[vinculos], [convites], [overrides]] = await Promise.all([
    db.select({ n: count() }).from(usuariosLojasTable)
      .where(eq(usuariosLojasTable.perfilId, params.data.perfilId)),
    db.select({ n: count() }).from(convitesTable)
      .where(and(eq(convitesTable.perfilId, params.data.perfilId), isNull(convitesTable.usadoEm))),
    db.select({ n: count() }).from(perfilOverridesLojasTable)
      .where(eq(perfilOverridesLojasTable.perfilId, params.data.perfilId)),
  ]);
  const emUso = [
    vinculos.n > 0 ? `${vinculos.n} pessoa(s)` : null,
    convites.n > 0 ? `${convites.n} convite(s) pendente(s)` : null,
    overrides.n > 0 ? `${overrides.n} personalização(ões) de loja` : null,
  ].filter(Boolean);
  if (emUso.length > 0) {
    res.status(409).json({
      error: "PERFIL_EM_USO",
      detalhe: `Este perfil está em uso por ${emUso.join(", ")}. Mova quem o usa para outro perfil antes de removê-lo.`,
    });
    return;
  }

  await db.delete(perfisTable).where(eq(perfisTable.id, params.data.perfilId));
  res.status(204).send();
});

// Usuarios
router.get("/admin/usuarios", async (_req, res): Promise<void> => {
  const usuarios = await db.select().from(usuariosTable).orderBy(usuariosTable.nome);
  // E61: o console responde "essa pessoa entra onde?" — os vínculos vêm numa
  // consulta só e são agrupados aqui, não N+1 por usuário.
  const vinculos = await db
    .select({
      usuarioId: usuariosLojasTable.usuarioId,
      lojaId: lojasTable.id,
      lojaNome: lojasTable.nome,
    })
    .from(usuariosLojasTable)
    .innerJoin(lojasTable, eq(usuariosLojasTable.lojaId, lojasTable.id))
    .orderBy(lojasTable.nome);
  const lojasPorUsuario = new Map<string, { id: string; nome: string }[]>();
  for (const v of vinculos) {
    const lista = lojasPorUsuario.get(v.usuarioId) ?? [];
    lista.push({ id: v.lojaId, nome: v.lojaNome });
    lojasPorUsuario.set(v.usuarioId, lista);
  }
  res.json(
    ListUsuariosResponse.parse(
      usuarios.map((u) => ({ ...u, lojas: lojasPorUsuario.get(u.id) ?? [] })),
    ),
  );
});

router.post("/admin/usuarios", async (req, res): Promise<void> => {
  const parsed = CreateUsuarioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
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
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const parsed = UpdateUsuarioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  
  const updateData: any = { ...parsed.data };
  // O e-mail entra pela MESMA borda do cadastro (linha do POST) e do login,
  // que procura por `email` já em minúsculas. Gravando o texto cru, corrigir a
  // ficha de alguém digitando "Ana@Moscow.com" trancava a pessoa para fora: o
  // login não achava linha nenhuma e devolvia 401 com a senha certa, sem nada
  // na tela do admin mostrando o que mudou. Pior, a unicidade é sobre o texto
  // cru (`email` .unique()), então as duas grafias conviviam e só uma logava.
  if (typeof updateData.email === "string") {
    updateData.email = updateData.email.toLowerCase().trim();
  }
  if (updateData.senha) {
    updateData.senhaHash = await hashSenha(updateData.senha);
    delete updateData.senha;
    // Resetar a senha de alguém é o mesmo caso do cadastro: quem escolheu foi
    // o admin, e a pessoa troca na próxima entrada.
    updateData.precisaTrocarSenha = true;
  }

  // B12 — trocar a credencial ou inativar tem de DERRUBAR as sessões vivas, na
  // MESMA transação. Sem isso, o superadmin reseta a senha de quem foi
  // desligado às pressas e a aba já aberta segue valendo por até 8h
  // (SESSAO_TTL_MS): a pessoa continua fechando contrato e recebendo parcela
  // com a identidade dela na trilha, enquanto o admin acredita ter fechado a
  // porta. É a mesma regra de `/auth/senha` e dos overrides de perfil.
  const mudouAcesso = parsed.data.senha !== undefined || parsed.data.ativo === false;

  const usuario = await db.transaction(async (tx) => {
    const [linha] = await tx.update(usuariosTable)
      .set(updateData)
      .where(eq(usuariosTable.id, params.data.usuarioId))
      .returning();
    if (linha && mudouAcesso) await encerrarSessoesDoUsuario(tx, params.data.usuarioId);
    return linha;
  });
  if (!usuario) {
    res.status(404).json({ error: "USUARIO_NAO_ENCONTRADO", detalhe: "Este usuário não existe." });
    return;
  }
  res.json(UpdateUsuarioResponse.parse(usuario));
});

router.delete("/admin/usuarios/:usuarioId", async (req, res): Promise<void> => {
  const params = DeleteUsuarioParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  // B2 🔴 — a exclusão passa a ser RECUSADA quando a pessoa tem histórico.
  //
  // As FKs de vendedora eram ON DELETE CASCADE: este `delete` apagava os
  // contratos dela, as parcelas PAGAS (com `recebidoEm`), o snapshot de itens,
  // os orçamentos, os atendimentos e os fechamentos de comissão — o caixa
  // realizado mudava para trás, sem confirmação e sem trilha. O DDL do E91 as
  // trocou por `restrict`; aqui damos o 409 LEGÍVEL antes de o banco levantar o
  // 23503 genérico ("Operação viola vínculos existentes"), e a mensagem ensina
  // o caminho certo: inativar preserva tudo.
  //
  // A contagem tem de cobrir TODAS as FKs que apontam para `usuarios`, e
  // cobria quatro de seis. As duas que faltavam falhavam em direções opostas:
  //
  // - `recorrencias.usuario_id` é CASCADE. Uma costureira com salário ativo de
  //   R$ 2.800 e nada mais passava pelas quatro contagens, o DELETE ia adiante
  //   e o banco apagava a recorrência junto. No mês seguinte a folha vinha
  //   R$ 2.800 menor, sem erro e sem linha nenhuma que explicasse.
  // - `comissao_regras.vendedora_id` é restrict. Uma vendedora que só tem
  //   regra de comissão também passava, e morria no 23503 do banco — devolvendo
  //   o `409 VINCULO_EXISTENTE` genérico em vez da mensagem que ensina a
  //   inativar, que era exatamente o ponto desta guarda.
  const usuarioId = params.data.usuarioId;
  // S3: a linha é lida ANTES de sumir, porque o rastro carrega o nome — depois
  // do DELETE não há `usuarios` para consultar. E ler dá o 404 de graça, que a
  // rota não tinha: apagar quem não existe respondia 204, como se tivesse.
  const [alvo] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, usuarioId));
  if (!alvo) {
    res.status(404).json({ error: "USUARIO_NAO_ENCONTRADO", detalhe: "Esta pessoa não existe." });
    return;
  }
  const [[c1], [c2], [c3], [c4], [c5], [c6]] = await Promise.all([
    db.select({ n: count() }).from(contratosTable).where(eq(contratosTable.vendedoraId, usuarioId)),
    db.select({ n: count() }).from(orcamentosTable).where(eq(orcamentosTable.vendedoraId, usuarioId)),
    db.select({ n: count() }).from(atendimentosTable).where(eq(atendimentosTable.vendedoraId, usuarioId)),
    db.select({ n: count() }).from(comissaoFechamentosTable).where(eq(comissaoFechamentosTable.vendedoraId, usuarioId)),
    db.select({ n: count() }).from(recorrenciasTable).where(eq(recorrenciasTable.usuarioId, usuarioId)),
    db.select({ n: count() }).from(comissaoRegrasTable).where(eq(comissaoRegrasTable.vendedoraId, usuarioId)),
  ]);
  const contratos = c1.n, orcamentos = c2.n, atendimentos = c3.n, comissoes = c4.n;
  const recorrencias = c5.n, regras = c6.n;

  const historico = [
    contratos > 0 ? `${contratos} contrato(s)` : null,
    orcamentos > 0 ? `${orcamentos} orçamento(s)` : null,
    atendimentos > 0 ? `${atendimentos} atendimento(s)` : null,
    comissoes > 0 ? `${comissoes} fechamento(s) de comissão` : null,
    recorrencias > 0 ? `${recorrencias} lançamento(s) recorrente(s) — salário` : null,
    regras > 0 ? `${regras} regra(s) de comissão` : null,
  ].filter(Boolean);

  if (historico.length > 0) {
    res.status(409).json({
      error: "USUARIO_COM_HISTORICO",
      detalhe: `Esta pessoa tem ${historico.join(", ")} — excluir apagaria esse histórico (inclusive parcelas já recebidas). Inative em vez de excluir.`,
    });
    return;
  }

  /**
   * S3 — o rastro do ato GLOBAL, que antes era só um `req.log.warn`.
   *
   * O DELETE e a trilha vão na MESMA transação: gravar depois deixaria a janela
   * em que a pessoa some e o registro não nasce, que é exatamente o estado que
   * esta sobra existe para impedir. E o nome vai desnormalizado no detalhe
   * porque, depois daqui, não há linha de `usuarios` para consultar — o que não
   * estiver no detalhe está perdido.
   */
  await db.transaction(async (tx) => {
    await tx.delete(usuariosTable).where(eq(usuariosTable.id, params.data.usuarioId));
    await registrarAuditoria(tx, {
      lojaId: null,
      usuario: { id: req.usuario!.id, nome: req.usuario!.nome },
      acao: "USUARIO_EXCLUIDO",
      entidade: "usuario",
      entidadeId: params.data.usuarioId,
      detalhe: { nome: alvo.nome, email: alvo.email, superAdmin: alvo.isSuperAdmin },
    });
  });
  res.status(204).send();
});

// Perfil Overrides
router.get("/admin/lojas/:lojaId/overrides", async (req, res): Promise<void> => {
  const params = ListPerfilOverridesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
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
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const parsed = SetPerfilOverrideBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
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
    res.status(400).json(erroDeValidacao(params.error));
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
    res.status(404).json({ error: "PERSONALIZACAO_NAO_ENCONTRADA", detalhe: "Este perfil não tem personalização nesta loja." });
    return;
  }
  res.status(204).send();
});

// E76: a rede numa tela. Quatro agregados por loja, cada um numa consulta com
// GROUP BY — nada de N+1 por loja.
router.get("/admin/consolidado", async (_req, res): Promise<void> => {
  // "Recebido no mês" é o mês da LOJA, não o do relógio do processo. Com
  // `setDate(1)` + `setHours(0,0,0,0)` num container UTC, o corte caía às 21h
  // do último dia do mês anterior em São Paulo: todo recebimento entre 21h e a
  // meia-noite do dia 31 entrava no mês seguinte, e o número que a rede vê no
  // console não batia com o DRE de nenhuma das lojas.
  const inicioMes = inicioDoDia(primeiroDiaDoMes(hojeLocal()));

  const [lojas, leadsPorLoja, contratosPorLoja, recebidoPorLoja, abertoPorLoja] = await Promise.all([
    db.select({ id: lojasTable.id, nome: lojasTable.nome }).from(lojasTable)
      .where(eq(lojasTable.ativo, true)).orderBy(lojasTable.nome),
    // S-M26 (rodada 2, achado 7#2): o consolidado excluía só PERDIDO enquanto
    // o dashboard da loja exclui PERDIDO e DEVOLVIDO — e DEVOLVIDO é a etapa
    // final FELIZ do funil: toda noiva que casou e devolveu o vestido termina
    // ali, para sempre. A linha da rede lia 100 "no funil" onde a dona da
    // loja lia 40 — 2,5× o real, inflado por todo casamento já realizado, e a
    // diferença só crescia com a vida da loja. A régua é UMA: quem saiu do
    // funil (pelo sim ou pelo não) não é lead ativo.
    db.select({ lojaId: leadsTable.lojaId, total: sql<number>`count(*)`.mapWith(Number) })
      .from(leadsTable)
      .where(sql`${leadsTable.etapa} not in ('PERDIDO', 'DEVOLVIDO')`)
      .groupBy(leadsTable.lojaId),
    db.select({ lojaId: contratosTable.lojaId, total: sql<number>`count(*)`.mapWith(Number) })
      .from(contratosTable)
      .where(eq(contratosTable.status, "ATIVO"))
      .groupBy(contratosTable.lojaId),
    db.select({
      lojaId: parcelasTable.lojaId,
      total: sql<number>`coalesce(sum(${parcelasTable.valorRecebido}), 0)`.mapWith(Number),
    })
      .from(parcelasTable)
      .where(sql`${parcelasTable.recebidoEm} >= ${inicioMes}`)
      .groupBy(parcelasTable.lojaId),
    db.select({
      lojaId: parcelasTable.lojaId,
      total: sql<number>`coalesce(sum(${parcelasTable.valorPrevisto} - coalesce(${parcelasTable.valorRecebido}, 0)), 0)`.mapWith(Number),
    })
      .from(parcelasTable)
      // A lista vem do core (C4/E94) — era a quarta cópia à mão da mesma
      // regra, aqui em SQL cru, onde nem o typecheck a alcançava.
      .where(inArray(parcelasTable.status, [...STATUS_ABERTO]))
      .groupBy(parcelasTable.lojaId),
  ]);

  const mapa = <T extends { lojaId: string; total: number }>(linhas: T[]) =>
    new Map(linhas.map((l) => [l.lojaId, l.total]));
  const leadsM = mapa(leadsPorLoja);
  const contratosM = mapa(contratosPorLoja);
  const recebidoM = mapa(recebidoPorLoja);
  const abertoM = mapa(abertoPorLoja);

  res.json(
    GetConsolidadoResponse.parse(
      lojas.map((l) => ({
        lojaId: l.id,
        nome: l.nome,
        leadsAtivos: leadsM.get(l.id) ?? 0,
        contratosAtivos: contratosM.get(l.id) ?? 0,
        recebidoNoMes: recebidoM.get(l.id) ?? 0,
        aReceberAberto: abertoM.get(l.id) ?? 0,
      })),
    ),
  );
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
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const [registro] = await db
    .select()
    .from(backupLogTable)
    .where(eq(backupLogTable.id, params.data.backupId));
  if (!registro) {
    res.status(404).json({ error: "BACKUP_NAO_ENCONTRADO", detalhe: "Esta execução de backup não existe." });
    return;
  }
  const caminho = caminhoDoDump(registro);
  if (!caminho || !existsSync(caminho)) {
    res.status(410).json({
      error: "BACKUP_SEM_ARQUIVO",
      detalhe: "O arquivo deste backup já foi removido pela retenção.",
    });
    return;
  }
  res.setHeader("Content-Type", "application/gzip");
  /**
   * S-O26 — **o `send` recusa por mais motivos que o `existsSync` cobre, e o
   * que vazava era a stack.**
   *
   * O `existsSync` acima pega o caso comum (a retenção já levou o arquivo).
   * Todo motivo restante — permissão negada, corrida com a poda entre o
   * `existsSync` e o `download`, e **componente oculto no caminho** — chegava
   * ao cliente como 500 com o erro cru do `send`.
   *
   * O componente oculto não é hipótese: foi o que fez o
   * `backup-download-api.test.ts` reprovar em TRÊS worktrees de agente ao
   * mesmo tempo, na Faixa C da trilha, e ser relatado como 🟠 por um deles. O
   * `res.download` recusa caminho com componente que começa em ponto, e todo
   * worktree de agente vive sob `.claude/` — o `main` passava e os três
   * mediam vermelho. Um 500 com stack não diz nada disso; um 410 nomeado diz
   * que o arquivo não está alcançável.
   *
   * `headersSent` é a guarda de sempre: se o stream já começou, não há
   * resposta para trocar — só resta encerrar e deixar o log contar.
   *
   * **E os DOIS cabeçalhos saem antes do JSON.** O `Content-Type` de gzip foi
   * posto acima, e o `Content-Disposition: attachment` é o `download` que o
   * põe: sem removê-los, a recusa vai embora como JSON rotulado de gzip, que o
   * navegador tenta SALVAR como arquivo em vez de mostrar a frase. O status
   * certo com o cabeçalho errado é meio conserto — foi assim que o teste desta
   * mesma sobra reprovou com `expected undefined to be 'BACKUP_SEM_ARQUIVO'`:
   * o 410 estava certo e o corpo, ilegível.
   */
  res.download(caminho, path.basename(caminho), (err) => {
    if (!err) return;
    req.log.warn({ err, caminho }, "backup_download_recusado_pelo_send");
    if (res.headersSent) {
      res.end();
      return;
    }
    res.removeHeader("Content-Type");
    res.removeHeader("Content-Disposition");
    res.status(410).json({
      error: "BACKUP_SEM_ARQUIVO",
      detalhe: "O arquivo deste backup não está acessível no servidor.",
    });
  });
});

export default router;
