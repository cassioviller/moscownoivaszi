import { pgTable, text, boolean, timestamp, integer, decimal, primaryKey, customType, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { atributoTipoEnum } from "./common/enums";

// Drizzle doesn't have a built-in Bytes type for Postgres, using customType
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const atributosTable = pgTable("atributos", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  tipo: atributoTipoEnum("tipo").notNull().default("OPCAO_UNICA"),
  ordem: integer("ordem").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
});

export const insertAtributoSchema = createInsertSchema(atributosTable);
export type InsertAtributo = z.infer<typeof insertAtributoSchema>;
export type Atributo = typeof atributosTable.$inferSelect;

export const atributoOpcoesTable = pgTable("atributo_opcoes", {
  id: text("id").primaryKey(),
  atributoId: text("atributo_id").notNull().references(() => atributosTable.id, { onDelete: "cascade" }),
  valor: text("valor").notNull(),
  ordem: integer("ordem").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
});

export const insertAtributoOpcaoSchema = createInsertSchema(atributoOpcoesTable);
export type InsertAtributoOpcao = z.infer<typeof insertAtributoOpcaoSchema>;
export type AtributoOpcao = typeof atributoOpcoesTable.$inferSelect;

export const vestidosTable = pgTable("vestidos", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  codigo: text("codigo").notNull(),
  nome: text("nome").notNull(),
  precoBase: decimal("preco_base", { precision: 10, scale: 2, mode: "number" }).notNull(),
  tamanho: text("tamanho"),
  cor: text("cor"),
  categoria: text("categoria"),
  status: text("status").notNull().default("ativo"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  unq: unique().on(t.lojaId, t.codigo),
}));

export const insertVestidoSchema = createInsertSchema(vestidosTable).omit({ createdAt: true, updatedAt: true });
export type InsertVestido = z.infer<typeof insertVestidoSchema>;
export type Vestido = typeof vestidosTable.$inferSelect;

export const vestidoFotosTable = pgTable("vestido_fotos", {
  id: text("id").primaryKey(),
  vestidoId: text("vestido_id").notNull().references(() => vestidosTable.id, { onDelete: "cascade" }),
  ordem: integer("ordem").notNull(), // 0 ou 1
  bytes: bytea("bytes").notNull(),
  mime: text("mime").notNull(),
  largura: integer("largura").notNull(),
  altura: integer("altura").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  unq: unique().on(t.vestidoId, t.ordem),
}));

export const insertVestidoFotoSchema = createInsertSchema(vestidoFotosTable).omit({ createdAt: true, updatedAt: true });
export type InsertVestidoFoto = z.infer<typeof insertVestidoFotoSchema>;
export type VestidoFoto = typeof vestidoFotosTable.$inferSelect;

export const vestidoAtributosTable = pgTable("vestido_atributos", {
  vestidoId: text("vestido_id").notNull().references(() => vestidosTable.id, { onDelete: "cascade" }),
  atributoId: text("atributo_id").notNull().references(() => atributosTable.id),
  opcaoId: text("opcao_id").notNull().references(() => atributoOpcoesTable.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.vestidoId, t.atributoId] }),
}));

export const insertVestidoAtributoSchema = createInsertSchema(vestidoAtributosTable);
export type InsertVestidoAtributo = z.infer<typeof insertVestidoAtributoSchema>;
export type VestidoAtributo = typeof vestidoAtributosTable.$inferSelect;
