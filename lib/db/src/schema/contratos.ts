import { pgTable, text, timestamp, decimal, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { leadsTable } from "./leads";
import { orcamentosTable } from "./orcamentos";
import { bloqueioVestidosTable } from "./atendimentos";
import { vestidosTable } from "./vestidos";
import { usuariosTable } from "./usuarios";
import { contratoStatusEnum, formaPagamentoEnum, orcamentoItemTipoEnum, descontoTipoEnum } from "./common/enums";

export const contratosTable = pgTable("contratos", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  // restrict: apagar um lead NÃO pode levar junto contratos e parcelas pagas
  // (histórico financeiro). Lead com contrato → o DELETE falha com 23503→409.
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "restrict" }),
  orcamentoId: text("orcamento_id").unique().references(() => orcamentosTable.id, { onDelete: "set null" }),
  bloqueioVestidoId: text("bloqueio_vestido_id").references(() => bloqueioVestidosTable.id, { onDelete: "set null" }),
  vendedoraId: text("vendedora_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  status: contratoStatusEnum("status").notNull().default("ATIVO"),
  cpf: text("cpf"),
  vestidoDescricao: text("vestido_descricao"),
  valorTotal: decimal("valor_total", { precision: 10, scale: 2, mode: "number" }).notNull(),
  // Desconto CONGELADO do orçamento no fecho. Sem isto, o snapshot guarda os
  // itens brutos mas o valorTotal é líquido — soma dos itens ≠ total, e a noiva
  // vê um contrato que não fecha. `valorTotal` continua o líquido; estes dois
  // dão a proveniência ("foi 10%") e permitem desenhar a linha "Desconto".
  descontoTipo: descontoTipoEnum("desconto_tipo"),
  descontoValor: decimal("desconto_valor", { precision: 10, scale: 2, mode: "number" }),
  formaPagamento: formaPagamentoEnum("forma_pagamento"),
  canceladoMotivo: text("cancelado_motivo"),
  canceladoEm: timestamp("cancelado_em", { withTimezone: true }),
  dataCasamento: timestamp("data_casamento", { withTimezone: true }),
  dataRetirada: timestamp("data_retirada", { withTimezone: true }),
  dataDevolucao: timestamp("data_devolucao", { withTimezone: true }),
  observacoes: text("observacoes"),
  fechadoEm: timestamp("fechado_em", { withTimezone: true }).notNull().defaultNow(),
  comissaoEstornadaEm: timestamp("comissao_estornada_em", { withTimezone: true }),
  // Baixa MANUAL de estorno (I10): quando o estorno de uma venda cancelada não é
  // absorvido por nenhum mês (a vendedora parou de vender), ele carrega para
  // sempre. A baixa é uma decisão HUMANA e auditável — nunca automática, que
  // apagaria o rastro de um erro de lançamento ou fraude. `comissaoEstornadaEm`
  // recebe o carimbo (e por isso o estorno para de carregar); estes dois campos
  // distinguem a baixa manual da reconciliação automática e dizem QUEM e por quê.
  comissaoEstornoBaixaPor: text("comissao_estorno_baixa_por").references(() => usuariosTable.id, { onDelete: "set null" }),
  comissaoEstornoBaixaMotivo: text("comissao_estorno_baixa_motivo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertContratoSchema = createInsertSchema(contratosTable).omit({ createdAt: true, updatedAt: true });
export type InsertContrato = z.infer<typeof insertContratoSchema>;
export type Contrato = typeof contratosTable.$inferSelect;

// Snapshot dos itens do orçamento no momento do fechamento do contrato.
// Preserva o que foi vendido mesmo que o orçamento seja editado/apagado depois
// (orcamentoId no contrato é `set null`). vestidoId é referência frouxa
// (set null) — a descrição em texto é o registro autoritativo.
export const contratoItensTable = pgTable("contrato_itens", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  contratoId: text("contrato_id").notNull().references(() => contratosTable.id, { onDelete: "cascade" }),
  tipo: orcamentoItemTipoEnum("tipo").notNull(),
  vestidoId: text("vestido_id").references(() => vestidosTable.id, { onDelete: "set null" }),
  descricao: text("descricao").notNull(),
  valorUnitario: decimal("valor_unitario", { precision: 10, scale: 2, mode: "number" }).notNull(),
  quantidade: integer("quantidade").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertContratoItemSchema = createInsertSchema(contratoItensTable).omit({ createdAt: true });
export type InsertContratoItem = z.infer<typeof insertContratoItemSchema>;
export type ContratoItem = typeof contratoItensTable.$inferSelect;
