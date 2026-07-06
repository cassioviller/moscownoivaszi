import { pgTable, text, boolean, timestamp, jsonb, primaryKey, index } from "drizzle-orm/pg-core";
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
