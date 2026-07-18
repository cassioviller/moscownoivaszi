import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db, usuariosTable, sessoesTable, lojasTable, usuariosLojasTable, perfisTable, perfilOverridesLojasTable } from "@workspace/db";
import { resolverAcessosEfetivos } from "./permissoes";
import { eq, and, gt } from "drizzle-orm";

export const SESSAO_TTL_MS = 8 * 60 * 60 * 1000;
export const COOKIE_NOME = "moscow_sessao";
// Convite por link vale 7 dias — tempo de a colega ver o WhatsApp, sem o link
// virar porta permanente.
export const CONVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Token de convite: mesmo formato do id de sessão (256 bits, base64url). */
export function gerarTokenConvite(): string {
  return randomBytes(32).toString("base64url");
}

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 12);
}

export async function compararSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

// Hash de sacrifício, criado uma vez sob demanda. Serve para gastar o mesmo
// tempo de um bcrypt.compare real quando o e-mail NÃO existe.
let hashDummy: string | null = null;
function getHashDummy(): string {
  if (!hashDummy) hashDummy = bcrypt.hashSync(randomBytes(16).toString("hex"), 12);
  return hashDummy;
}

/**
 * Compara a senha em TEMPO CONSTANTE quanto à existência do usuário. Com hash
 * nulo (usuário inexistente/inativo) ainda roda um bcrypt.compare contra um
 * dummy — senão o 401 imediato denuncia quais e-mails têm conta, insumo para
 * phishing e força bruta dirigida. Sempre devolve false para hash nulo.
 */
export async function compararSenhaConstante(senha: string, hash: string | null): Promise<boolean> {
  const alvo = hash ?? getHashDummy();
  const ok = await bcrypt.compare(senha, alvo);
  return hash !== null && ok;
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

/**
 * Os acessos efetivos do usuário na loja, já normalizados para MÓDULO × AÇÃO.
 *
 * Normaliza aqui, na fonte: é o mesmo dado que alimenta o guard das rotas e o
 * `/me` do frontend, e os dois precisam enxergar exatamente as mesmas
 * permissões. Traduzir em cada consumidor é como as duas visões divergem.
 *
 * Superadmin devolve `null` — ele não tem perfil, tem bypass. `null` significa
 * "sem restrição", e por isso não pode ser confundido com "sem acesso".
 */
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

  // Havendo override, ele SUBSTITUI o template — não se mistura. Um override
  // meio-aplicado seria impossível de auditar depois ("de onde veio o acesso?").
  return resolverAcessosEfetivos(vinculo.acessosModulos, override?.acessosModulos ?? null);
}
