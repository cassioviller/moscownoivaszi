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

/**
 * `executor` permite criar a sessão DENTRO de uma transação — a troca de
 * senha (E57) derruba as sessões e emite a nova no mesmo passo, e usar o `db`
 * global ali criaria a sessão nova fora da transação que a antecede.
 */
export async function criarSessao(
  usuarioId: string,
  executor: { insert: typeof db.insert } = db,
) {
  const id = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + SESSAO_TTL_MS);

  const [sessao] = await executor.insert(sessoesTable).values({
    id,
    usuarioId,
    expiraEm,
  }).returning();

  return sessao;
}

/**
 * Derruba TODAS as sessões vivas de um usuário (E56).
 *
 * A permissão é lida da sessão e só se atualizava no próximo `/auth/me`: tirar
 * alguém da equipe ou rebaixar o perfil não tinha efeito enquanto a aba dela
 * estivesse aberta — a pessoa seguia com o acesso antigo por até 8 horas. Uma
 * permissão revogada que continua valendo não é permissão.
 *
 * Recebe o executor para rodar DENTRO da transação que mudou o acesso: derrubar
 * a sessão e mudar o perfil precisam acontecer juntos, ou nenhum dos dois.
 */
export async function encerrarSessoesDoUsuario(
  executor: { delete: typeof db.delete },
  usuarioId: string,
): Promise<void> {
  await executor.delete(sessoesTable).where(eq(sessoesTable.usuarioId, usuarioId));
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

  /**
   * Vínculo e override numa consulta só.
   *
   * Eram duas SEQUENCIAIS (a segunda esperando o `perfilId` da primeira), e
   * esta função roda em TODA request protegida por `requireModulo` — o caminho
   * mais quente do servidor. O `leftJoin` resolve com o mesmo resultado: o
   * override é opcional por definição, e a chave dele é (loja, perfil), que a
   * própria linha do vínculo já dá.
   */
  const [linha] = await db
    .select({
      acessosModulos: perfisTable.acessosModulos,
      override: perfilOverridesLojasTable.acessosModulos,
    })
    .from(usuariosLojasTable)
    .innerJoin(perfisTable, eq(perfisTable.id, usuariosLojasTable.perfilId))
    .leftJoin(
      perfilOverridesLojasTable,
      and(
        eq(perfilOverridesLojasTable.perfilId, usuariosLojasTable.perfilId),
        eq(perfilOverridesLojasTable.lojaId, lojaId),
      ),
    )
    .where(and(eq(usuariosLojasTable.usuarioId, usuarioId), eq(usuariosLojasTable.lojaId, lojaId)));

  if (!linha) return null;

  // Havendo override, ele SUBSTITUI o template — não se mistura. Um override
  // meio-aplicado seria impossível de auditar depois ("de onde veio o acesso?").
  return resolverAcessosEfetivos(linha.acessosModulos, linha.override ?? null);
}
