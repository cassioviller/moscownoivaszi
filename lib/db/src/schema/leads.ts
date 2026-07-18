import { pgTable, text, timestamp, decimal, primaryKey, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { leadEtapaEnum, leadOrigemEnum, leadPerdidaMotivoEnum } from "./common/enums";
import { atributosTable, atributoOpcoesTable } from "./vestidos";

export const leadsTable = pgTable("leads", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  etapa: leadEtapaEnum("etapa").notNull().default("NOVO"),
  noivaNome: text("noiva_nome").notNull(),
  noivoNome: text("noivo_nome"),
  cerimonialista: text("cerimonialista"),
  whatsapp: text("whatsapp"),
  casamentoData: timestamp("casamento_data", { withTimezone: true }),
  casamentoHorario: text("casamento_horario"),
  casamentoLocal: text("casamento_local"),
  orcamentoAbertoEm: timestamp("orcamento_aberto_em", { withTimezone: true }),
  contratoFechadoEm: timestamp("contrato_fechado_em", { withTimezone: true }),
  perdidaEm: timestamp("perdida_em", { withTimezone: true }),
  // Motivo estruturado da perda (obrigatório ao marcar PERDIDO via API) e o
  // detalhe livre. Ao reviver, ficam como histórico — mesmo espírito do
  // carimbo perdidaEm, que também não se apaga.
  perdidaMotivo: leadPerdidaMotivoEnum("perdida_motivo"),
  perdidaDetalhe: text("perdida_detalhe"),
  origem: leadOrigemEnum("origem").notNull().default("LOJA"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;

export const leadInteressesTable = pgTable("lead_interesses", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().unique().references(() => leadsTable.id, { onDelete: "cascade" }),
  algoAMais: text("algo_a_mais"),
  naoQuerUsar: text("nao_quer_usar"),
  tetoOrcamento: decimal("teto_orcamento", { precision: 10, scale: 2, mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeadInteresseSchema = createInsertSchema(leadInteressesTable).omit({ createdAt: true, updatedAt: true });
export type InsertLeadInteresse = z.infer<typeof insertLeadInteresseSchema>;
export type LeadInteresse = typeof leadInteressesTable.$inferSelect;

export const leadInteresseAtributosTable = pgTable("lead_interesse_atributos", {
  leadInteresseId: text("lead_interesse_id").notNull().references(() => leadInteressesTable.id, { onDelete: "cascade" }),
  atributoId: text("atributo_id").notNull().references(() => atributosTable.id),
  opcaoId: text("opcao_id").notNull().references(() => atributoOpcoesTable.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.leadInteresseId, t.atributoId] }),
}));

export const insertLeadInteresseAtributoSchema = createInsertSchema(leadInteresseAtributosTable);
export type InsertLeadInteresseAtributo = z.infer<typeof insertLeadInteresseAtributoSchema>;
export type LeadInteresseAtributo = typeof leadInteresseAtributosTable.$inferSelect;
