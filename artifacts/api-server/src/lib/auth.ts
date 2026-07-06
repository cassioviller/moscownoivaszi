import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db, usuariosTable, sessoesTable, lojasTable, usuariosLojasTable, perfisTable, perfilOverridesLojasTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

export const SESSAO_TTL_MS = 8 * 60 * 60 * 1000;
export const COOKIE_NOME = "moscow_sessao";

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 12);
}

export async function compararSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

export async function criarSessao(usuarioId: string) {
  const id = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + SESSAO_TTL_MS);
  
  const [sessao] = await db.insert(sessoesTable).values({
    id,
    usuarioId,
    expiraEm,
  }).returning();
  
  return sessao;
}

export async function buscarSessao(id: string) {
  const [row] = await db
    .select({
      sessao: sessoesTable,
      usuario: usuariosTable,
    })
    .from(sessoesTable)
    .innerJoin(usuariosTable, eq(usuariosTable.id, sessoesTable.usuarioId))
    .where(and(eq(sessoesTable.id, id), gt(sessoesTable.expiraEm, new Date())));

  if (!row || !row.usuario.ativo) return null;
  return row;
}

export async function buscarLoja(id: string) {
  const [loja] = await db.select().from(lojasTable).where(eq(lojasTable.id, id));
  if (!loja || !loja.ativo) return null;
  return loja;
}

export async function buscarLojasUsuario(usuarioId: string, isSuperAdmin: boolean) {
  if (isSuperAdmin) {
    return db.select().from(lojasTable).where(eq(lojasTable.ativo, true));
  }
  
  const rows = await db
    .select({
      id: lojasTable.id,
      nome: lojasTable.nome,
      cnpj: lojasTable.cnpj,
      endereco: lojasTable.endereco,
      telefone: lojasTable.telefone,
      ativo: lojasTable.ativo,
      createdAt: lojasTable.createdAt,
      perfilId: usuariosLojasTable.perfilId,
      perfilNome: perfisTable.nome,
    })
    .from(usuariosLojasTable)
    .innerJoin(lojasTable, eq(lojasTable.id, usuariosLojasTable.lojaId))
    .innerJoin(perfisTable, eq(perfisTable.id, usuariosLojasTable.perfilId))
    .where(and(eq(usuariosLojasTable.usuarioId, usuarioId), eq(lojasTable.ativo, true)));
    
  return rows;
}

export async function getPermissoes(usuarioId: string, lojaId: string, isSuperAdmin: boolean) {
  if (isSuperAdmin) return null; // Bypass

  const [vinculo] = await db
    .select({
      perfilId: usuariosLojasTable.perfilId,
      acessosModulos: perfisTable.acessosModulos,
    })
    .from(usuariosLojasTable)
    .innerJoin(perfisTable, eq(perfisTable.id, usuariosLojasTable.perfilId))
    .where(and(eq(usuariosLojasTable.usuarioId, usuarioId), eq(usuariosLojasTable.lojaId, lojaId)));

  if (!vinculo) return null;

  const [override] = await db
    .select({
      acessosModulos: perfilOverridesLojasTable.acessosModulos,
    })
    .from(perfilOverridesLojasTable)
    .where(and(eq(perfilOverridesLojasTable.lojaId, lojaId), eq(perfilOverridesLojasTable.perfilId, vinculo.perfilId)));

  return (override?.acessosModulos || vinculo.acessosModulos) as Record<string, boolean | Record<string, boolean>>;
}
