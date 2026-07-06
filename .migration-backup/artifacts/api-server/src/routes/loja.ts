import { Router } from "express";
import { requireSessaoComLoja } from "../middlewares/auth.js";
import { query, queryOne, execute } from "../lib/db.js";
import { podeNoModulo, ehAdminDaLoja } from "../lib/permissoes.js";

const router = Router();

// ── Dashboard ──
router.get("/loja/:lojaId/dashboard", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });

  const [noivas, atendimentos, contratos, vestidos] = await Promise.all([
    query(`SELECT COUNT(*) as total FROM "Lead" WHERE "lojaId" = $1 AND etapa NOT IN ('CASAMENTO_REALIZADO','DEVOLVIDO','PERDIDO')`, [l.id]),
    query(`SELECT COUNT(*) as total FROM "Atendimento" WHERE "lojaId" = $1 AND situacao = 'AGENDADO'`, [l.id]),
    query(`SELECT COUNT(*) as total FROM "Contrato" WHERE "lojaId" = $1 AND status = 'ATIVO'`, [l.id]),
    query(`SELECT COUNT(*) as total FROM "Vestido" WHERE "lojaId" = $1 AND status = 'ativo'`, [l.id]),
  ]);

  res.json({
    noivas: Number(noivas[0]?.total ?? 0),
    atendimentos: Number(atendimentos[0]?.total ?? 0),
    contratos: Number(contratos[0]?.total ?? 0),
    vestidos: Number(vestidos[0]?.total ?? 0),
  });
});

// ── Noivas ──
router.get("/loja/:lojaId/noivas", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "leads", "ver"))) return res.status(403).json({ erro: "Sem permissão" });
  const { busca, etapa, pagina = "1" } = req.query as Record<string, string>;
  const limit = 20;
  const offset = (parseInt(pagina) - 1) * limit;
  let where = `WHERE l."lojaId" = $1`;
  const params: unknown[] = [l.id];
  if (etapa) { params.push(etapa); where += ` AND l.etapa = $${params.length}::\"LeadEtapa\"`; }
  if (busca) { params.push(`%${busca}%`); where += ` AND l."noivaNome" ILIKE $${params.length}`; }
  const [leads, count] = await Promise.all([
    query(`SELECT l.*, (SELECT COUNT(*) FROM "Atendimento" a WHERE a."leadId" = l.id) as atendimentos FROM "Lead" l ${where} ORDER BY l."createdAt" DESC LIMIT ${limit} OFFSET ${offset}`, params),
    query(`SELECT COUNT(*) as total FROM "Lead" l ${where}`, params),
  ]);
  res.json({ leads, total: Number(count[0]?.total ?? 0), pagina: parseInt(pagina), limit });
});

router.post("/loja/:lojaId/noivas", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "leads", "criar"))) return res.status(403).json({ erro: "Sem permissão" });
  const { noivaNome, noivoNome, whatsapp, casamentoData, casamentoLocal, origem } = req.body ?? {};
  if (!noivaNome?.trim()) return res.status(400).json({ erro: "Nome da noiva é obrigatório" });
  const id = `lead-${Date.now()}`;
  const rows = await query(
    `INSERT INTO "Lead" (id, "lojaId", "noivaNome", "noivoNome", whatsapp, "casamentoData", "casamentoLocal", origem, "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
    [id, l.id, noivaNome.trim(), noivoNome || null, whatsapp || null, casamentoData || null, casamentoLocal || null, origem || 'LOJA'],
  );
  res.json({ lead: rows[0] });
});

router.get("/loja/:lojaId/noivas/:leadId", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "leads", "ver"))) return res.status(403).json({ erro: "Sem permissão" });
  const lead = await queryOne(`SELECT * FROM "Lead" WHERE id = $1 AND "lojaId" = $2`, [req.params.leadId, l.id]);
  if (!lead) return res.status(404).json({ erro: "Noiva não encontrada" });
  const [atendimentos, contratos, interesse] = await Promise.all([
    query(
      `SELECT a.*, u.nome as "vendedoraNome", c.nome as "cabineNome"
       FROM "Atendimento" a
       JOIN "Usuario" u ON u.id = a."vendedoraId"
       JOIN "Cabine" c ON c.id = a."cabineId"
       WHERE a."leadId" = $1 ORDER BY a.inicio DESC`,
      [req.params.leadId],
    ),
    query(`SELECT ct.*, u.nome as "vendedoraNome" FROM "Contrato" ct JOIN "Usuario" u ON u.id = ct."vendedoraId" WHERE ct."leadId" = $1 ORDER BY ct."fechadoEm" DESC`, [req.params.leadId]),
    queryOne(`SELECT * FROM "LeadInteresse" WHERE "leadId" = $1`, [req.params.leadId]),
  ]);
  res.json({ lead, atendimentos, contratos, interesse });
});

router.put("/loja/:lojaId/noivas/:leadId", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "leads", "editar"))) return res.status(403).json({ erro: "Sem permissão" });
  const { noivaNome, noivoNome, whatsapp, casamentoData, casamentoHorario, casamentoLocal, etapa } = req.body ?? {};
  await execute(
    `UPDATE "Lead" SET "noivaNome" = COALESCE($1, "noivaNome"), "noivoNome" = $2, whatsapp = $3,
     "casamentoData" = $4, "casamentoHorario" = $5, "casamentoLocal" = $6,
     etapa = COALESCE($7::\"LeadEtapa\", etapa), "updatedAt" = NOW()
     WHERE id = $8 AND "lojaId" = $9`,
    [noivaNome?.trim() || null, noivoNome || null, whatsapp || null,
     casamentoData || null, casamentoHorario || null, casamentoLocal || null,
     etapa || null, req.params.leadId, l.id],
  );
  res.json({ ok: true });
});

// ── Vestidos ──
router.get("/loja/:lojaId/vestidos", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "vestidos", "ver"))) return res.status(403).json({ erro: "Sem permissão" });
  const { busca, pagina = "1" } = req.query as Record<string, string>;
  const limit = 20;
  const offset = (parseInt(pagina) - 1) * limit;
  let where = `WHERE v."lojaId" = $1`;
  const params: unknown[] = [l.id];
  if (busca) { params.push(`%${busca}%`); where += ` AND (v.nome ILIKE $${params.length} OR v.codigo ILIKE $${params.length})`; }
  const [vestidos, count] = await Promise.all([
    query(`SELECT * FROM "Vestido" v ${where} ORDER BY v.nome LIMIT ${limit} OFFSET ${offset}`, params),
    query(`SELECT COUNT(*) as total FROM "Vestido" v ${where}`, params),
  ]);
  res.json({ vestidos, total: Number(count[0]?.total ?? 0) });
});

router.post("/loja/:lojaId/vestidos", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "vestidos", "criar"))) return res.status(403).json({ erro: "Sem permissão" });
  const { codigo, nome, precoBase, tamanho, cor, categoria, observacoes } = req.body ?? {};
  if (!codigo?.trim()) return res.status(400).json({ erro: "Código é obrigatório" });
  if (!nome?.trim()) return res.status(400).json({ erro: "Nome é obrigatório" });
  if (!precoBase) return res.status(400).json({ erro: "Preço base é obrigatório" });
  const id = `vest-${Date.now()}`;
  try {
    const rows = await query(
      `INSERT INTO "Vestido" (id, "lojaId", codigo, nome, "precoBase", tamanho, cor, categoria, observacoes, "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
      [id, l.id, codigo.trim(), nome.trim(), precoBase, tamanho || null, cor || null, categoria || null, observacoes || null],
    );
    res.json({ vestido: rows[0] });
  } catch (err: any) {
    if (err.message?.includes("unique")) return res.status(400).json({ erro: "Código já existe nesta loja" });
    throw err;
  }
});

router.get("/loja/:lojaId/vestidos/:vestidoId", requireSessaoComLoja, async (req, res) => {
  const l = (req as any).loja;
  const u = (req as any).usuario;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "vestidos", "ver"))) return res.status(403).json({ erro: "Sem permissão" });
  const vestido = await queryOne(`SELECT * FROM "Vestido" WHERE id = $1 AND "lojaId" = $2`, [req.params.vestidoId, l.id]);
  if (!vestido) return res.status(404).json({ erro: "Vestido não encontrado" });
  res.json({ vestido });
});

router.put("/loja/:lojaId/vestidos/:vestidoId", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "vestidos", "editar"))) return res.status(403).json({ erro: "Sem permissão" });
  const { nome, precoBase, tamanho, cor, categoria, status, observacoes } = req.body ?? {};
  await execute(
    `UPDATE "Vestido" SET nome = COALESCE($1, nome), "precoBase" = COALESCE($2, "precoBase"),
     tamanho = $3, cor = $4, categoria = $5, status = COALESCE($6, status), observacoes = $7, "updatedAt" = NOW()
     WHERE id = $8 AND "lojaId" = $9`,
    [nome?.trim() || null, precoBase || null, tamanho || null, cor || null,
     categoria || null, status || null, observacoes || null, req.params.vestidoId, l.id],
  );
  res.json({ ok: true });
});

// ── Contratos ──
router.get("/loja/:lojaId/contratos", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "leads", "ver"))) return res.status(403).json({ erro: "Sem permissão" });
  const { pagina = "1" } = req.query as Record<string, string>;
  const limit = 20;
  const offset = (parseInt(pagina) - 1) * limit;
  const [contratos, count] = await Promise.all([
    query(
      `SELECT ct.*, ld."noivaNome", u.nome as "vendedoraNome"
       FROM "Contrato" ct JOIN "Lead" ld ON ld.id = ct."leadId" JOIN "Usuario" u ON u.id = ct."vendedoraId"
       WHERE ct."lojaId" = $1 ORDER BY ct."fechadoEm" DESC LIMIT ${limit} OFFSET ${offset}`,
      [l.id],
    ),
    query(`SELECT COUNT(*) as total FROM "Contrato" WHERE "lojaId" = $1`, [l.id]),
  ]);
  res.json({ contratos, total: Number(count[0]?.total ?? 0) });
});

router.get("/loja/:lojaId/contratos/:contratoId", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "leads", "ver"))) return res.status(403).json({ erro: "Sem permissão" });
  const contrato = await queryOne(
    `SELECT ct.*, ld."noivaNome", ld."noivoNome", u.nome as "vendedoraNome"
     FROM "Contrato" ct JOIN "Lead" ld ON ld.id = ct."leadId" JOIN "Usuario" u ON u.id = ct."vendedoraId"
     WHERE ct.id = $1 AND ct."lojaId" = $2`,
    [req.params.contratoId, l.id],
  );
  if (!contrato) return res.status(404).json({ erro: "Contrato não encontrado" });
  const parcelas = await query(`SELECT * FROM "Parcela" WHERE "contratoId" = $1 ORDER BY numero`, [req.params.contratoId]);
  res.json({ contrato, parcelas });
});

// ── Atendimentos ──
router.get("/loja/:lojaId/atendimentos", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "leads", "ver"))) return res.status(403).json({ erro: "Sem permissão" });
  const { data } = req.query as Record<string, string>;
  let where = `WHERE a."lojaId" = $1`;
  const params: unknown[] = [l.id];
  if (data) { params.push(data); where += ` AND DATE(a.inicio) = $${params.length}::date`; }
  const rows = await query(
    `SELECT a.*, ld."noivaNome", u.nome as "vendedoraNome", c.nome as "cabineNome"
     FROM "Atendimento" a
     JOIN "Lead" ld ON ld.id = a."leadId"
     JOIN "Usuario" u ON u.id = a."vendedoraId"
     JOIN "Cabine" c ON c.id = a."cabineId"
     ${where} ORDER BY a.inicio`,
    params,
  );
  res.json({ atendimentos: rows });
});

router.get("/loja/:lojaId/cabines", requireSessaoComLoja, async (req, res) => {
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  const cabines = await query(`SELECT * FROM "Cabine" WHERE "lojaId" = $1 AND ativo = true ORDER BY nome`, [l.id]);
  res.json({ cabines });
});

router.post("/loja/:lojaId/atendimentos", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "leads", "criar"))) return res.status(403).json({ erro: "Sem permissão" });
  const { leadId, cabineId, vendedoraId, inicio, observacao } = req.body ?? {};
  if (!leadId || !cabineId || !inicio) return res.status(400).json({ erro: "Campos obrigatórios faltando" });
  const id = `atend-${Date.now()}`;
  try {
    const rows = await query(
      `INSERT INTO "Atendimento" (id, "lojaId", "leadId", "cabineId", "vendedoraId", inicio, observacao, "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
      [id, l.id, leadId, cabineId, vendedoraId || u.id, inicio, observacao || null],
    );
    res.json({ atendimento: rows[0] });
  } catch (err: any) {
    if (err.message?.includes("unique")) return res.status(400).json({ erro: "Horário já ocupado" });
    throw err;
  }
});

// ── Calendário ──
router.get("/loja/:lojaId/calendario", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "leads", "ver"))) return res.status(403).json({ erro: "Sem permissão" });
  const { mes, ano } = req.query as Record<string, string>;
  const m = parseInt(mes ?? new Date().getMonth() + 1 + "");
  const a = parseInt(ano ?? new Date().getFullYear() + "");
  const inicio = new Date(a, m - 1, 1);
  const fim = new Date(a, m, 1);
  const rows = await query(
    `SELECT a.*, ld."noivaNome", u.nome as "vendedoraNome", c.nome as "cabineNome"
     FROM "Atendimento" a
     JOIN "Lead" ld ON ld.id = a."leadId"
     JOIN "Usuario" u ON u.id = a."vendedoraId"
     JOIN "Cabine" c ON c.id = a."cabineId"
     WHERE a."lojaId" = $1 AND a.inicio >= $2 AND a.inicio < $3
     ORDER BY a.inicio`,
    [l.id, inicio, fim],
  );
  res.json({ atendimentos: rows });
});

// ── Reservas ──
router.get("/loja/:lojaId/reservas", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "leads", "ver"))) return res.status(403).json({ erro: "Sem permissão" });
  const rows = await query(
    `SELECT r.*, ld."noivaNome",
     (SELECT COUNT(*) FROM "BloqueioVestido" bv WHERE bv."reservaId" = r.id) as vestidos
     FROM "Reserva" r JOIN "Lead" ld ON ld.id = r."leadId"
     WHERE r."lojaId" = $1 ORDER BY r."casamentoData"`,
    [l.id],
  );
  res.json({ reservas: rows });
});

// ── Financeiro ──
router.get("/loja/:lojaId/financeiro/receber", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "financeiro", "ver"))) return res.status(403).json({ erro: "Sem permissão" });
  const rows = await query(
    `SELECT p.*, ct."leadId", ld."noivaNome" FROM "Parcela" p
     JOIN "Contrato" ct ON ct.id = p."contratoId"
     JOIN "Lead" ld ON ld.id = ct."leadId"
     WHERE p."lojaId" = $1 ORDER BY p.vencimento`,
    [l.id],
  );
  res.json({ parcelas: rows });
});

router.get("/loja/:lojaId/financeiro/pagar", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "financeiro", "ver"))) return res.status(403).json({ erro: "Sem permissão" });
  const rows = await query(
    `SELECT * FROM "ContaPagar" WHERE "lojaId" = $1 ORDER BY vencimento`,
    [l.id],
  );
  res.json({ contas: rows });
});

router.get("/loja/:lojaId/financeiro/comissoes", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "financeiro", "ver"))) return res.status(403).json({ erro: "Sem permissão" });
  const rows = await query(
    `SELECT cf.*, u.nome as "vendedoraNome" FROM "ComissaoFechamento" cf
     JOIN "Usuario" u ON u.id = cf."vendedoraId"
     WHERE cf."lojaId" = $1 ORDER BY cf.competencia DESC, u.nome`,
    [l.id],
  );
  res.json({ comissoes: rows });
});

router.get("/loja/:lojaId/financeiro", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await podeNoModulo(u.id, l.id, "financeiro", "ver"))) return res.status(403).json({ erro: "Sem permissão" });
  const [receber, pagar] = await Promise.all([
    query(
      `SELECT SUM(CASE WHEN status = 'PREVISTA' THEN "valorPrevisto" ELSE 0 END) as previsto,
              SUM(CASE WHEN status = 'PAGA' THEN "valorRecebido" ELSE 0 END) as recebido
       FROM "Parcela" WHERE "lojaId" = $1`,
      [l.id],
    ),
    query(
      `SELECT SUM(CASE WHEN status = 'PREVISTA' THEN "valorPrevisto" ELSE 0 END) as previsto,
              SUM(CASE WHEN status = 'PAGA' THEN "valorPrevisto" ELSE 0 END) as pago
       FROM "ContaPagar" WHERE "lojaId" = $1`,
      [l.id],
    ),
  ]);
  res.json({
    receber: receber[0] ?? { previsto: 0, recebido: 0 },
    pagar: pagar[0] ?? { previsto: 0, pago: 0 },
  });
});

// ── Permissões ──
router.get("/loja/:lojaId/permissoes", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await ehAdminDaLoja(u.id, l.id))) return res.status(403).json({ erro: "Acesso negado" });
  const [perfis, overrides] = await Promise.all([
    query(`SELECT * FROM "Perfil" ORDER BY nome`),
    query(`SELECT * FROM "PerfilOverrideLoja" WHERE "lojaId" = $1`, [l.id]),
  ]);
  res.json({ perfis, overrides });
});

router.put("/loja/:lojaId/permissoes/:perfilId", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  if (!(await ehAdminDaLoja(u.id, l.id))) return res.status(403).json({ erro: "Acesso negado" });
  const { acessosModulos } = req.body ?? {};
  await execute(
    `INSERT INTO "PerfilOverrideLoja" ("lojaId", "perfilId", "acessosModulos", "updatedAt")
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT ("lojaId", "perfilId") DO UPDATE SET "acessosModulos" = $3, "updatedAt" = NOW()`,
    [l.id, req.params.perfilId, JSON.stringify(acessosModulos)],
  );
  res.json({ ok: true });
});

// ── Flags de permissão ──
router.get("/loja/:lojaId/flags", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (l.id !== req.params.lojaId) return res.status(403).json({ erro: "Acesso negado" });
  const [podeVerNoivas, podeVerCatalogo, podeVerAjustes, podeVerFinanceiro, isAdmin] = await Promise.all([
    podeNoModulo(u.id, l.id, "leads", "ver"),
    podeNoModulo(u.id, l.id, "config", "ver"),
    podeNoModulo(u.id, l.id, "ajustes", "ver"),
    podeNoModulo(u.id, l.id, "financeiro", "ver"),
    ehAdminDaLoja(u.id, l.id),
  ]);
  // Count lojas to determine mostrarTroca
  const lojasCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM "Loja" l
     LEFT JOIN "UsuarioLoja" ul ON ul."lojaId" = l.id AND ul."usuarioId" = $1
     WHERE l.ativo = true AND ($2 OR ul."usuarioId" IS NOT NULL)`,
    [u.id, u.isSuperAdmin],
  );
  res.json({
    podeVerNoivas,
    podeVerCatalogo,
    podeVerAjustes,
    podeVerFinanceiro,
    podeGerenciarEquipe: isAdmin,
    isSuperAdmin: u.isSuperAdmin,
    mostrarTroca: Number(lojasCount?.count ?? 0) > 1,
  });
});

export default router;
