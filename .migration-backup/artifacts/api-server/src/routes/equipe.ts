import { Router } from "express";
import { requireSessaoComLoja } from "../middlewares/auth.js";
import { query, queryOne, execute } from "../lib/db.js";
import { gerarHash } from "../lib/auth.js";
import { ehAdminDaLoja } from "../lib/permissoes.js";

const router = Router();

router.get("/equipe", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (!(await ehAdminDaLoja(u.id, l.id))) return res.status(403).json({ erro: "Acesso negado" });
  const rows = await query(
    `SELECT u.id, u.nome, u.email, p.nome as "perfilNome"
     FROM "UsuarioLoja" ul
     JOIN "Usuario" u ON u.id = ul."usuarioId"
     JOIN "Perfil" p ON p.id = ul."perfilId"
     WHERE ul."lojaId" = $1 ORDER BY u.nome`,
    [l.id],
  );
  res.json({ equipe: rows });
});

router.post("/equipe/vendedoras", requireSessaoComLoja, async (req, res) => {
  const u = (req as any).usuario;
  const l = (req as any).loja;
  if (!(await ehAdminDaLoja(u.id, l.id))) return res.status(403).json({ erro: "Acesso negado" });
  const { nome, email, senha } = req.body ?? {};
  if (!nome?.trim()) return res.status(400).json({ erro: "Nome é obrigatório" });
  if (!email?.trim()) return res.status(400).json({ erro: "Email é obrigatório" });
  if (!senha || senha.length < 8) return res.status(400).json({ erro: "Senha deve ter ao menos 8 caracteres" });
  try {
    const existente = await queryOne(`SELECT id FROM "Usuario" WHERE email = $1`, [email.toLowerCase().trim()]);
    if (existente) return res.status(400).json({ erro: "Já existe um usuário com esse e-mail" });
    const perfil = await queryOne(`SELECT id FROM "Perfil" WHERE id = 'perfil-vendedora'`);
    if (!perfil) return res.status(500).json({ erro: "Perfil vendedora não encontrado — rode o seed" });
    const hash = await gerarHash(senha);
    const id = `usr-${Date.now()}`;
    await execute(
      `INSERT INTO "Usuario" (id, nome, email, "senhaHash", "updatedAt") VALUES ($1, $2, $3, $4, NOW())`,
      [id, nome.trim(), email.toLowerCase().trim(), hash],
    );
    await execute(
      `INSERT INTO "UsuarioLoja" ("usuarioId", "lojaId", "perfilId") VALUES ($1, $2, 'perfil-vendedora')`,
      [id, l.id],
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ erro: err.message });
  }
});

export default router;
