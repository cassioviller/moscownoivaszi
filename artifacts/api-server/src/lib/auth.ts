import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { query, queryOne, execute } from "./db.js";

export const SESSAO_TTL_MS = 8 * 60 * 60 * 1000;
export const COOKIE_NOME = "moscow_sessao";
export const PERFIL_ADMIN_ID = "perfil-admin";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  senhaHash: string;
  ativo: boolean;
  isSuperAdmin: boolean;
}

export interface Sessao {
  id: string;
  usuarioId: string;
  lojaAtivaId: string | null;
  expiraEm: Date;
}

export interface Loja {
  id: string;
  nome: string;
  ativo: boolean;
}

export async function autenticarUsuario(
  email: string,
  senha: string,
): Promise<Usuario | null> {
  const u = await queryOne<Usuario>(
    `SELECT * FROM "Usuario" WHERE email = $1`,
    [email.toLowerCase().trim()],
  );
  if (!u || !u.ativo) return null;
  const ok = await bcrypt.compare(senha, u.senhaHash);
  return ok ? u : null;
}

export async function criarSessao(usuarioId: string): Promise<Sessao> {
  await execute(
    `DELETE FROM "Sessao" WHERE "usuarioId" = $1 AND "expiraEm" < NOW()`,
    [usuarioId],
  );
  const id = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + SESSAO_TTL_MS);
  const rows = await query<Sessao>(
    `INSERT INTO "Sessao" (id, "usuarioId", "expiraEm") VALUES ($1, $2, $3) RETURNING *`,
    [id, usuarioId, expiraEm],
  );
  return rows[0]!;
}

export async function lerSessao(
  sessionId: string,
): Promise<{ sessao: Sessao; usuario: Usuario } | null> {
  const row = await queryOne<Sessao & { u_id: string; u_nome: string; u_email: string; u_ativo: boolean; u_isSuperAdmin: boolean; u_senhaHash: string }>(
    `SELECT s.*, u.id as u_id, u.nome as u_nome, u.email as u_email,
            u.ativo as u_ativo, u."isSuperAdmin" as "u_isSuperAdmin", u."senhaHash" as "u_senhaHash"
     FROM "Sessao" s JOIN "Usuario" u ON u.id = s."usuarioId"
     WHERE s.id = $1`,
    [sessionId],
  );
  if (!row) return null;
  if (new Date(row.expiraEm).getTime() <= Date.now()) return null;
  if (!row.u_ativo) return null;
  const sessao: Sessao = {
    id: row.id,
    usuarioId: row.usuarioId,
    lojaAtivaId: row.lojaAtivaId,
    expiraEm: new Date(row.expiraEm),
  };
  const usuario: Usuario = {
    id: row.u_id,
    nome: row.u_nome,
    email: row.u_email,
    ativo: row.u_ativo,
    isSuperAdmin: (row as any)["u_isSuperAdmin"],
    senhaHash: (row as any)["u_senhaHash"],
  };
  return { sessao, usuario };
}

export async function destruirSessao(sessionId: string): Promise<void> {
  await execute(`DELETE FROM "Sessao" WHERE id = $1`, [sessionId]);
}

export async function listarLojasDoUsuario(usuarioId: string): Promise<Loja[]> {
  const u = await queryOne<{ isSuperAdmin: boolean }>(
    `SELECT "isSuperAdmin" FROM "Usuario" WHERE id = $1`,
    [usuarioId],
  );
  if (u?.isSuperAdmin) {
    return query<Loja>(`SELECT * FROM "Loja" WHERE ativo = true ORDER BY nome`);
  }
  return query<Loja>(
    `SELECT l.* FROM "Loja" l JOIN "UsuarioLoja" ul ON ul."lojaId" = l.id
     WHERE ul."usuarioId" = $1 AND l.ativo = true ORDER BY l.nome`,
    [usuarioId],
  );
}

export async function definirLojaAtiva(
  sessaoId: string,
  lojaId: string,
  usuarioId: string,
): Promise<void> {
  const u = await queryOne<{ isSuperAdmin: boolean }>(
    `SELECT "isSuperAdmin" FROM "Usuario" WHERE id = $1`,
    [usuarioId],
  );
  if (u?.isSuperAdmin) {
    const loja = await queryOne<Loja>(`SELECT * FROM "Loja" WHERE id = $1`, [lojaId]);
    if (!loja || !loja.ativo) throw new Error("loja inexistente ou inativa");
  } else {
    const vinculo = await queryOne(
      `SELECT 1 FROM "UsuarioLoja" WHERE "usuarioId" = $1 AND "lojaId" = $2`,
      [usuarioId, lojaId],
    );
    if (!vinculo) throw new Error("acesso negado à loja");
  }
  await execute(
    `UPDATE "Sessao" SET "lojaAtivaId" = $1 WHERE id = $2`,
    [lojaId, sessaoId],
  );
}

export async function lerSessaoComLoja(
  sessionId: string,
): Promise<{ sessao: Sessao; usuario: Usuario; loja: Loja } | null> {
  const base = await lerSessao(sessionId);
  if (!base || !base.sessao.lojaAtivaId) return null;
  const loja = await queryOne<Loja>(
    `SELECT * FROM "Loja" WHERE id = $1`,
    [base.sessao.lojaAtivaId],
  );
  if (!loja || !loja.ativo) return null;
  return { sessao: base.sessao, usuario: base.usuario, loja };
}

export async function gerarHash(senha: string): Promise<string> {
  return bcrypt.hash(senha, 12);
}
