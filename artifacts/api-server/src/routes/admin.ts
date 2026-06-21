import { Router } from "express";
import { requireSessao } from "../middlewares/auth.js";
import { query, queryOne, execute } from "../lib/db.js";
import { gerarHash } from "../lib/auth.js";

const router = Router();

router.get("/admin/lojas", requireSessao, async (req, res) => {
  const u = (req as any).usuario;
  if (!u.isSuperAdmin) return res.status(403).json({ erro: "Acesso negado" });
  const lojas = await query(`SELECT * FROM "Loja" ORDER BY nome`);
  res.json({ lojas });
});

router.post("/admin/lojas", requireSessao, async (req, res) => {
  const u = (req as any).usuario;
  if (!u.isSuperAdmin) return res.status(403).json({ erro: "Acesso negado" });
  const { nome } = req.body ?? {};
  if (!nome?.trim()) return res.status(400).json({ erro: "Nome da loja é obrigatório" });
  try {
    const id = `loja-${Date.now()}`;
    const rows = await query(
      `INSERT INTO "Loja" (id, nome, "updatedAt") VALUES ($1, $2, NOW()) RETURNING *`,
      [id, nome.trim()],
    );
    res.json({ loja: rows[0] });
  } catch (err: any) {
    res.status(400).json({ erro: err.message });
  }
});

router.get("/admin/admins", requireSessao, async (req, res) => {
  const u = (req as any).usuario;
  if (!u.isSuperAdmin) return res.status(403).json({ erro: "Acesso negado" });
  const rows = await query<{ id: string; nome: string; email: string; lojanome: string }>(
    `SELECT u.id, u.nome, u.email, l.nome as "lojaNome"
     FROM "Usuario" u
     JOIN "UsuarioLoja" ul ON ul."usuarioId" = u.id
     JOIN "Loja" l ON l.id = ul."lojaId"
     WHERE u."isSuperAdmin" = false AND ul."perfilId" = 'perfil-admin'
     ORDER BY u.nome, l.nome`,
  );
  const adminsMap = new Map<string, { id: string; nome: string; email: string; lojas: string[] }>();
  for (const row of rows) {
    if (!adminsMap.has(row.id)) {
      adminsMap.set(row.id, { id: row.id, nome: row.nome, email: row.email, lojas: [] });
    }
    if (row.lojaNome) adminsMap.get(row.id)!.lojas.push(row.lojaNome);
  }
  res.json({ admins: [...adminsMap.values()] });
});

router.post("/admin/admins", requireSessao, async (req, res) => {
  const u = (req as any).usuario;
  if (!u.isSuperAdmin) return res.status(403).json({ erro: "Acesso negado" });
  const { nome, email, senha, lojaIds } = req.body ?? {};
  if (!nome?.trim()) return res.status(400).json({ erro: "Nome é obrigatório" });
  if (!email?.trim()) return res.status(400).json({ erro: "Email é obrigatório" });
  if (!senha || senha.length < 8) return res.status(400).json({ erro: "Senha deve ter ao menos 8 caracteres" });
  if (!lojaIds?.length) return res.status(400).json({ erro: "Selecione ao menos uma loja" });
  try {
    const existente = await queryOne(`SELECT id FROM "Usuario" WHERE email = $1`, [email.toLowerCase().trim()]);
    if (existente) return res.status(400).json({ erro: "Já existe um usuário com esse e-mail" });
    const perfil = await queryOne(`SELECT id FROM "Perfil" WHERE id = 'perfil-admin'`);
    if (!perfil) return res.status(500).json({ erro: "Perfil admin não encontrado — rode o seed" });
    const hash = await gerarHash(senha);
    const id = `usr-${Date.now()}`;
    await execute(
      `INSERT INTO "Usuario" (id, nome, email, "senhaHash", "updatedAt") VALUES ($1, $2, $3, $4, NOW())`,
      [id, nome.trim(), email.toLowerCase().trim(), hash],
    );
    for (const lojaId of lojaIds) {
      await execute(
        `INSERT INTO "UsuarioLoja" ("usuarioId", "lojaId", "perfilId") VALUES ($1, $2, 'perfil-admin')`,
        [id, lojaId],
      );
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ erro: err.message });
  }
});

router.get("/admin/perfis", requireSessao, async (req, res) => {
  const u = (req as any).usuario;
  if (!u.isSuperAdmin) return res.status(403).json({ erro: "Acesso negado" });
  const perfis = await query(`SELECT * FROM "Perfil" ORDER BY nome`);
  res.json({ perfis });
});

router.put("/admin/perfis/:id", requireSessao, async (req, res) => {
  const u = (req as any).usuario;
  if (!u.isSuperAdmin) return res.status(403).json({ erro: "Acesso negado" });
  const { acessosModulos } = req.body ?? {};
  if (!acessosModulos) return res.status(400).json({ erro: "acessosModulos é obrigatório" });
  await execute(
    `UPDATE "Perfil" SET "acessosModulos" = $1, "updatedAt" = NOW() WHERE id = $2`,
    [JSON.stringify(acessosModulos), req.params.id],
  );
  res.json({ ok: true });
});

export default router;
