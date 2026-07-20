import { pgTable, text, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { leadsTable } from "./leads";
import { vestidosTable } from "./vestidos";
import { usuariosTable } from "./usuarios";

/**
 * Lookbook (E21): a seleção de vestidos que a vendedora monta no atendimento
 * vira link para a noiva rever em casa — as fotos já estão no banco; o que
 * faltava era o caminho até elas sem login. Token é a capability (256 bits,
 * padrão convite E6/orçamento E13); expira para o link parado não virar porta
 * eterna ao catálogo.
 */
export const lookbooksTable = pgTable("lookbooks", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  criadoPorId: text("criado_por_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tokenUnq: uniqueIndex("lookbooks_token_unq").on(t.token),
  porLead: index("lookbooks_lead_idx").on(t.lojaId, t.leadId),
}));

export const insertLookbookSchema = createInsertSchema(lookbooksTable).omit({ createdAt: true });
export type InsertLookbook = z.infer<typeof insertLookbookSchema>;
export type Lookbook = typeof lookbooksTable.$inferSelect;

export const lookbookItensTable = pgTable("lookbook_itens", {
  id: text("id").primaryKey(),
  lookbookId: text("lookbook_id").notNull().references(() => lookbooksTable.id, { onDelete: "cascade" }),
  vestidoId: text("vestido_id").notNull().references(() => vestidosTable.id, { onDelete: "cascade" }),
  ordem: integer("ordem").notNull().default(0),
}, (t) => ({
  porLookbook: index("lookbook_itens_lookbook_idx").on(t.lookbookId),
}));

export const insertLookbookItemSchema = createInsertSchema(lookbookItensTable);
export type InsertLookbookItem = z.infer<typeof insertLookbookItemSchema>;
export type LookbookItem = typeof lookbookItensTable.$inferSelect;
