import { pgTable, text, timestamp, decimal, integer, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
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
  // restrict (E91/B2): mesma regra de `contratos.vendedoraId` — a coluna é
  // notNull, então o `set null` da autoria não é possível e apagar a vendedora
  // apagaria a proposta que a noiva aceitou. Recusa-se o delete; inative.
  vendedoraId: text("vendedora_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  status: orcamentoStatusEnum("status").notNull().default("RASCUNHO"),
  descontoTipo: descontoTipoEnum("desconto_tipo"),
  descontoValor: decimal("desconto_valor", { precision: 10, scale: 2, mode: "number" }),
  validade: timestamp("validade", { withTimezone: true }),
  observacoes: text("observacoes"),
  aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
  // Link público somente-leitura (E13): o token é a capability (256 bits,
  // mesmo formato do convite E6); regenerar troca o token e o link antigo
  // morre. `publicoAbertoEm` guarda a PRIMEIRA abertura pela noiva — é o
  // "avisa a loja que ela viu" — e por isso nunca é sobrescrito.
  publicoToken: text("publico_token"),
  publicoExpiraEm: timestamp("publico_expira_em", { withTimezone: true }),
  publicoAbertoEm: timestamp("publico_aberto_em", { withTimezone: true }),
  // E74: aceite digital pelo link público — "ela viu" vira "ela concordou com
  // ESTA versão". O hash prende o aceite ao conteúdo (E75); não é assinatura
  // certificada, é registro próprio com instante e prova de integridade.
  aceitoEm: timestamp("aceito_em", { withTimezone: true }),
  aceiteVersao: integer("aceite_versao"),
  aceiteHash: text("aceite_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  publicoTokenUnq: uniqueIndex("orcamentos_publico_token_unq").on(t.publicoToken),
}));

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

/**
 * E75: versões do orçamento — o snapshot de cada ENVIO.
 *
 * Edição sobrescrevia: a noiva olhava um link cujo conteúdo mudava embaixo
 * dela, e o aceite (E74) não teria a que apontar. Marcar ENVIADO congela
 * itens, desconto e totais numa versão numerada; o link público mostra a
 * última versão enviada, nunca o rascunho vivo. `hash` (sha256 do conteúdo
 * canônico) é a integridade que o aceite referencia.
 */
export const orcamentoVersoesTable = pgTable("orcamento_versoes", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  orcamentoId: text("orcamento_id")
    .notNull()
    .references(() => orcamentosTable.id, { onDelete: "cascade" }),
  numero: integer("numero").notNull(),
  /** Itens congelados: [{tipo, descricao, valorUnitario, quantidade}]. */
  itens: jsonb("itens").notNull(),
  descontoTipo: descontoTipoEnum("desconto_tipo"),
  descontoValor: decimal("desconto_valor", { precision: 10, scale: 2, mode: "number" }),
  totalBruto: decimal("total_bruto", { precision: 10, scale: 2, mode: "number" }).notNull(),
  totalLiquido: decimal("total_liquido", { precision: 10, scale: 2, mode: "number" }).notNull(),
  hash: text("hash").notNull(),
  criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  numeroUnq: uniqueIndex("orcamento_versoes_numero_unq").on(t.orcamentoId, t.numero),
}));

export type OrcamentoVersao = typeof orcamentoVersoesTable.$inferSelect;
