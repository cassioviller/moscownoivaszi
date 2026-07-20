import { pgTable, text, boolean, timestamp, jsonb, primaryKey, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";

export const usuariosTable = pgTable("usuarios", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  senhaHash: text("senha_hash").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  // Carimbado a cada login (E18). As sessões não servem de fonte: logout e
  // expiração apagam a linha, e o "último acesso" sumiria junto.
  ultimoLoginEm: timestamp("ultimo_login_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUsuarioSchema = createInsertSchema(usuariosTable).omit({ createdAt: true, updatedAt: true });
export type InsertUsuario = z.infer<typeof insertUsuarioSchema>;
export type Usuario = typeof usuariosTable.$inferSelect;

export const perfisTable = pgTable("perfis", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(),
  acessosModulos: jsonb("acessos_modulos").notNull(), // { "leads": true, ... }
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPerfilSchema = createInsertSchema(perfisTable).omit({ createdAt: true, updatedAt: true });
export type InsertPerfil = z.infer<typeof insertPerfilSchema>;
export type Perfil = typeof perfisTable.$inferSelect;

export const usuariosLojasTable = pgTable("usuarios_lojas", {
  usuarioId: text("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  perfilId: text("perfil_id").notNull().references(() => perfisTable.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.usuarioId, t.lojaId] }),
}));

export const insertUsuarioLojaSchema = createInsertSchema(usuariosLojasTable);
export type InsertUsuarioLoja = z.infer<typeof insertUsuarioLojaSchema>;
export type UsuarioLoja = typeof usuariosLojasTable.$inferSelect;

export const sessoesTable = pgTable("sessoes", {
  id: text("id").primaryKey(),
  usuarioId: text("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  lojaAtivaId: text("loja_ativa_id").references(() => lojasTable.id, { onDelete: "set null" }),
  criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
}, (t) => ({
  expiraEmIdx: index("sessoes_expira_em_idx").on(t.expiraEm),
  usuarioIdIdx: index("sessoes_usuario_id_idx").on(t.usuarioId),
}));

export const insertSessaoSchema = createInsertSchema(sessoesTable);
export type InsertSessao = z.infer<typeof insertSessaoSchema>;
export type Sessao = typeof sessoesTable.$inferSelect;

/**
 * Convite por link (E6): o admin manda o link pelo WhatsApp e a própria pessoa
 * define a senha — ninguém mais digita a senha do colega. O usuário nasce só
 * no ACEITE: pré-criá-lo com hash impossível sequestraria o e-mail (unique) se
 * o convite fosse abandonado. Token cru como as sessões (256 bits aleatórios;
 * o admin precisa re-copiar o link da listagem). Uso único via UPDATE
 * condicional no aceite; "reenviar" regenera token+validade (link antigo morre).
 */
export const convitesTable = pgTable("convites", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  nome: text("nome").notNull(),
  email: text("email").notNull(), // normalizado lower/trim na rota
  perfilId: text("perfil_id").notNull().references(() => perfisTable.id),
  criadoPorId: text("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  usadoEm: timestamp("usado_em", { withTimezone: true }),
}, (t) => ({
  tokenUnq: uniqueIndex("convites_token_unq").on(t.token),
  // Um convite PENDENTE por e-mail/loja: o 409 nasce do banco, não de
  // check-then-insert racy. Parcial: aceitos não bloqueiam reconvite futuro.
  pendenteUnq: uniqueIndex("convites_loja_email_pendente_unq")
    .on(t.lojaId, t.email)
    .where(sql`usado_em IS NULL`),
  lojaIdx: index("convites_loja_id_idx").on(t.lojaId),
}));

export const insertConviteSchema = createInsertSchema(convitesTable).omit({ criadoEm: true });
export type InsertConvite = z.infer<typeof insertConviteSchema>;
export type Convite = typeof convitesTable.$inferSelect;

export const perfilOverridesLojasTable = pgTable("perfil_overrides_lojas", {
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  perfilId: text("perfil_id").notNull().references(() => perfisTable.id, { onDelete: "cascade" }),
  acessosModulos: jsonb("acessos_modulos").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  pk: primaryKey({ columns: [t.lojaId, t.perfilId] }),
}));

export const insertPerfilOverrideLojaSchema = createInsertSchema(perfilOverridesLojasTable).omit({ createdAt: true, updatedAt: true });
export type InsertPerfilOverrideLoja = z.infer<typeof insertPerfilOverrideLojaSchema>;
export type PerfilOverrideLoja = typeof perfilOverridesLojasTable.$inferSelect;
