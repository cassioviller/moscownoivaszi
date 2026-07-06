import { pgTable, text, timestamp, decimal, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { leadsTable } from "./leads";
import { atendimentosTable } from "./atendimentos";
import { usuariosTable } from "./usuarios";
import { vestidosTable } from "./vestidos";
import { orcamentoStatusEnum, orcamentoItemTipoEnum, descontoTipoEnum } from "./common/enums";

export const orcamentosTable = pgTable("orcamentos", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  atendimentoId: text("atendimento_id").references(() => atendimentosTable.id, { onDelete: "set null" }),
  vendedoraId: text("vendedora_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  status: orcamentoStatusEnum("status").notNull().default("RASCUNHO"),
  descontoTipo: descontoTipoEnum("desconto_tipo"),
  descontoValor: decimal("desconto_valor", { precision: 10, scale: 2, mode: "number" }),
  validade: timestamp("validade", { withTimezone: true }),
  observacoes: text("observacoes"),
  aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrcamentoSchema = createInsertSchema(orcamentosTable).omit({ createdAt: true, updatedAt: true });
export type InsertOrcamento = z.infer<typeof insertOrcamentoSchema>;
export type Orcamento = typeof orcamentosTable.$inferSelect;

export const orcamentoItensTable = pgTable("orcamento_itens", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  orcamentoId: text("orcamento_id").notNull().references(() => orcamentosTable.id, { onDelete: "cascade" }),
  tipo: orcamentoItemTipoEnum("tipo").notNull(),
  vestidoId: text("vestido_id").references(() => vestidosTable.id, { onDelete: "set null" }),
  descricao: text("descricao").notNull(),
  valorUnitario: decimal("valor_unitario", { precision: 10, scale: 2, mode: "number" }).notNull(),
  quantidade: integer("quantidade").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrcamentoItemSchema = createInsertSchema(orcamentoItensTable).omit({ createdAt: true });
export type InsertOrcamentoItem = z.infer<typeof insertOrcamentoItemSchema>;
export type OrcamentoItem = typeof orcamentoItensTable.$inferSelect;
