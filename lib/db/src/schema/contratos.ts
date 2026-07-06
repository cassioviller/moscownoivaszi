import { pgTable, text, timestamp, decimal, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { leadsTable } from "./leads";
import { orcamentosTable } from "./orcamentos";
import { bloqueioVestidosTable } from "./atendimentos";
import { usuariosTable } from "./usuarios";
import { contratoStatusEnum, formaPagamentoEnum } from "./common/enums";

export const contratosTable = pgTable("contratos", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  orcamentoId: text("orcamento_id").unique().references(() => orcamentosTable.id, { onDelete: "set null" }),
  bloqueioVestidoId: text("bloqueio_vestido_id").references(() => bloqueioVestidosTable.id, { onDelete: "set null" }),
  vendedoraId: text("vendedora_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  status: contratoStatusEnum("status").notNull().default("ATIVO"),
  cpf: text("cpf"),
  vestidoDescricao: text("vestido_descricao"),
  valorTotal: decimal("valor_total", { precision: 10, scale: 2, mode: "number" }).notNull(),
  formaPagamento: formaPagamentoEnum("forma_pagamento"),
  canceladoMotivo: text("cancelado_motivo"),
  dataCasamento: timestamp("data_casamento", { withTimezone: true }),
  dataRetirada: timestamp("data_retirada", { withTimezone: true }),
  dataDevolucao: timestamp("data_devolucao", { withTimezone: true }),
  observacoes: text("observacoes"),
  fechadoEm: timestamp("fechado_em", { withTimezone: true }).notNull().defaultNow(),
  comissaoEstornadaEm: timestamp("comissao_estornada_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertContratoSchema = createInsertSchema(contratosTable).omit({ createdAt: true, updatedAt: true });
export type InsertContrato = z.infer<typeof insertContratoSchema>;
export type Contrato = typeof contratosTable.$inferSelect;
