import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { leadsTable } from "./leads";

/**
 * E78 — o portal da noiva: UM token por NOIVA (leadId unique), não por
 * documento. A noiva recebia até três links soltos (orçamento E13, lookbook
 * E21), cada um com validade própria; o portal é o lugar dela — proposta,
 * lookbook, provas e extrato — atrás de um link só. Os tokens antigos seguem
 * válidos (compat); a UI passa a oferecer este.
 *
 * Regenerar SUBSTITUI o token na mesma linha — o link antigo morre na hora.
 * `revogadoEm` derruba sem apagar (o rastro fica); `ultimoAcessoEm` é o
 * "ela abriu" do card da vendedora.
 */
export const portalTokensTable = pgTable("portal_tokens", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  revogadoEm: timestamp("revogado_em", { withTimezone: true }),
  ultimoAcessoEm: timestamp("ultimo_acesso_em", { withTimezone: true }),
}, (t) => ({
  tokenUnq: uniqueIndex("portal_tokens_token_unq").on(t.token),
  leadUnq: uniqueIndex("portal_tokens_lead_unq").on(t.leadId),
}));

export const insertPortalTokenSchema = createInsertSchema(portalTokensTable).omit({ criadoEm: true });
export type InsertPortalToken = z.infer<typeof insertPortalTokenSchema>;
export type PortalToken = typeof portalTokensTable.$inferSelect;
