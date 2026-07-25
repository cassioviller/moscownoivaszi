import { db, leadsTable, cabinesTable, usuariosLojasTable, reservasTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

/**
 * Guardas de escopo por loja para as ESCRITAS.
 *
 * O `requireModulo` garante que o usuário acessa a loja da URL — não que os IDs
 * que ele manda no corpo são dessa loja. Sem estas checagens, a loja A referencia
 * um `leadId`/`cabineId` da loja B, e o GET enriquecido puxa os dados da outra
 * loja para dentro dela: vazamento de tenant por FK forjada. A FK do banco só
 * garante que o id EXISTE, não a que loja pertence.
 *
 * Cada função responde "este id é desta loja?". A rota traduz `false` em 404.
 */

export async function leadNaLoja(leadId: string, lojaId: string): Promise<boolean> {
  const [r] = await db.select({ id: leadsTable.id }).from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.lojaId, lojaId))).limit(1);
  return !!r;
}

export async function cabineNaLoja(cabineId: string, lojaId: string): Promise<boolean> {
  const [r] = await db.select({ id: cabinesTable.id }).from(cabinesTable)
    .where(and(eq(cabinesTable.id, cabineId), eq(cabinesTable.lojaId, lojaId))).limit(1);
  return !!r;
}

/**
 * Usuário pertence à loja pelo vínculo `usuarios_lojas`, não por uma coluna.
 *
 * É a MESMA pergunta para vendedora, colaborador e membro da equipe — a tabela
 * `usuarios` é GLOBAL, e o que amarra alguém a uma loja é só este vínculo. Toda
 * escrita que recebe um id de gente (do corpo OU do path) passa por aqui antes
 * de escrever: sem isso, o id existe, a FK aceita, e a loja A mexe na loja B.
 */
export async function usuarioNaLoja(usuarioId: string, lojaId: string): Promise<boolean> {
  const [r] = await db.select({ id: usuariosLojasTable.usuarioId }).from(usuariosLojasTable)
    .where(and(eq(usuariosLojasTable.usuarioId, usuarioId), eq(usuariosLojasTable.lojaId, lojaId))).limit(1);
  return !!r;
}

/** Alias histórico de `usuarioNaLoja` — a pergunta é a mesma. */
export const vendedoraNaLoja = usuarioNaLoja;

export async function reservaNaLoja(reservaId: string, lojaId: string): Promise<boolean> {
  const [r] = await db.select({ id: reservasTable.id }).from(reservasTable)
    .where(and(eq(reservasTable.id, reservaId), eq(reservasTable.lojaId, lojaId))).limit(1);
  return !!r;
}
