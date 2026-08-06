import { pgTable, text, timestamp, decimal, index, primaryKey, unique } from "drizzle-orm/pg-core";
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
  // E77 (LGPD): quando a própria noiva consentiu com o uso dos dados (form de
  // captação externa). Null = cadastro interno, consentimento presencial.
  consentimentoEm: timestamp("consentimento_em", { withTimezone: true }),
  // E77: carimbo da anonimização — a linha fica (histórico e números), a PII sai.
  anonimizadaEm: timestamp("anonimizada_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  // B10/E91: o funil, a busca e "leads parados" abrem por loja + etapa.
  lojaEtapaIdx: index("leads_loja_etapa_idx").on(t.lojaId, t.etapa),
}));

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
  // S31 — vocabulário é CONFIGURAÇÃO, e configuração cascateia (régua do E91).
  // Apagar a palavra apaga a CLASSIFICAÇÃO, não a peça nem a noiva: o que a
  // noiva escreveu com as próprias palavras mora em `lead_interesses` e fica.
  // **Não troque por RESTRICT**: a guarda contra apagar sem querer é de
  // APLICAÇÃO e vive em `routes/catalogo.ts` (409 ATRIBUTO_EM_USO / OPCAO_EM_USO).
  atributoId: text("atributo_id").notNull().references(() => atributosTable.id, { onDelete: "cascade" }),
  opcaoId: text("opcao_id").notNull().references(() => atributoOpcoesTable.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.leadInteresseId, t.atributoId] }),
}));

export const insertLeadInteresseAtributoSchema = createInsertSchema(leadInteresseAtributosTable);
export type InsertLeadInteresseAtributo = z.infer<typeof insertLeadInteresseAtributoSchema>;
export type LeadInteresseAtributo = typeof leadInteresseAtributosTable.$inferSelect;
