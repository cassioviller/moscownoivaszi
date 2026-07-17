import { pgTable, text, timestamp, decimal, integer, unique, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { contratosTable } from "./contratos";
import { usuariosTable } from "./usuarios";
import { leadsTable } from "./leads";
import { parcelaStatusEnum, formaPagamentoEnum, contaPagarTipoEnum, contaPagarStatusEnum } from "./common/enums";

export const parcelasTable = pgTable("parcelas", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  contratoId: text("contrato_id").notNull().references(() => contratosTable.id, { onDelete: "cascade" }),
  numero: integer("numero").notNull(), // 0 = entrada/sinal; 1..N parcelas
  descricao: text("descricao"),
  valorPrevisto: decimal("valor_previsto", { precision: 10, scale: 2, mode: "number" }).notNull(),
  vencimento: timestamp("vencimento", { withTimezone: true }).notNull(),
  status: parcelaStatusEnum("status").notNull().default("PREVISTA"),
  valorRecebido: decimal("valor_recebido", { precision: 10, scale: 2, mode: "number" }),
  recebidoEm: timestamp("recebido_em", { withTimezone: true }),
  formaRecebimento: formaPagamentoEnum("forma_recebimento"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // gerar-plano checa "já tem parcela?" e insere, sem rede: dois POSTs
  // simultâneos passam ambos e dobram o plano. Um contrato não tem dois números
  // iguais — o segundo insert do número 0 colide e vira 409.
  numeroUnico: unique().on(t.contratoId, t.numero),
}));

export const insertParcelaSchema = createInsertSchema(parcelasTable).omit({ createdAt: true });
export type InsertParcela = z.infer<typeof insertParcelaSchema>;
export type Parcela = typeof parcelasTable.$inferSelect;

export const contasPagarTable = pgTable("contas_pagar", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  tipo: contaPagarTipoEnum("tipo").notNull(),
  colaboradorId: text("colaborador_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  competencia: text("competencia"), // "YYYY-MM"
  descricao: text("descricao").notNull(),
  categoria: text("categoria"),
  fornecedor: text("fornecedor"),
  valorPrevisto: decimal("valor_previsto", { precision: 10, scale: 2, mode: "number" }).notNull(),
  vencimento: timestamp("vencimento", { withTimezone: true }).notNull(),
  status: contaPagarStatusEnum("status").notNull().default("PREVISTA"),
  salarioRecorrenteId: text("salario_recorrente_id"), // rastro da geração de folha (será ref dps se necessário)
  origemComissaoFechamentoId: text("origem_comissao_fechamento_id"), // rastro da comissão (será ref dps)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // A idempotência da folha não pode depender só do check-then-insert da rota:
  // dois POSTs simultâneos leem "nada feito" e ambos inserem, pagando todo mundo
  // em dobro. Este é o backstop no banco — um salário recorrente rende no máximo
  // UMA conta por competência+loja. Parcial (só SALARIO) porque contas avulsas e
  // de comissão não têm salario_recorrente_id.
  folhaUnica: uniqueIndex("contas_pagar_salario_unico")
    .on(t.lojaId, t.competencia, t.salarioRecorrenteId)
    .where(sql`${t.tipo} = 'SALARIO'`),
}));

export const insertContaPagarSchema = createInsertSchema(contasPagarTable).omit({ createdAt: true });
export type InsertContaPagar = z.infer<typeof insertContaPagarSchema>;
export type ContaPagar = typeof contasPagarTable.$inferSelect;

export const pagamentosTable = pgTable("pagamentos", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  colaboradorId: text("colaborador_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  data: timestamp("data", { withTimezone: true }).notNull(),
  valorPago: decimal("valor_pago", { precision: 10, scale: 2, mode: "number" }).notNull(),
  forma: text("forma"),
  observacoes: text("observacoes"),
  enviadoContabilidadeEm: timestamp("enviado_contabilidade_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPagamentoSchema = createInsertSchema(pagamentosTable).omit({ createdAt: true });
export type InsertPagamento = z.infer<typeof insertPagamentoSchema>;
export type Pagamento = typeof pagamentosTable.$inferSelect;

export const pagamentoItensTable = pgTable("pagamento_itens", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  pagamentoId: text("pagamento_id").notNull().references(() => pagamentosTable.id, { onDelete: "cascade" }),
  contaPagarId: text("conta_pagar_id").notNull().unique().references(() => contasPagarTable.id, { onDelete: "cascade" }),
  valor: decimal("valor", { precision: 10, scale: 2, mode: "number" }).notNull(),
});

export const insertPagamentoItemSchema = createInsertSchema(pagamentoItensTable);
export type InsertPagamentoItem = z.infer<typeof insertPagamentoItemSchema>;
export type PagamentoItem = typeof pagamentoItensTable.$inferSelect;

export const salariosRecorrentesTable = pgTable("salarios_recorrentes", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  usuarioId: text("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  valor: decimal("valor", { precision: 10, scale: 2, mode: "number" }).notNull(),
  diaVencimento: integer("dia_vencimento").notNull().default(5),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  // Dois salários ATIVOS para a mesma pessoa geram duas contas na mesma folha
  // (o dedup do núcleo só olha o que já foi feito, não o lote). Um usuário tem
  // no máximo um salário ativo por loja; desativar libera cadastrar outro sem
  // apagar o histórico. Parcial em `ativo` para o inativo não trancar.
  salarioAtivoUnico: uniqueIndex("salarios_recorrentes_ativo_unico")
    .on(t.lojaId, t.usuarioId)
    .where(sql`${t.ativo} = true`),
}));

export const insertSalarioRecorrenteSchema = createInsertSchema(salariosRecorrentesTable).omit({ createdAt: true, updatedAt: true });
export type InsertSalarioRecorrente = z.infer<typeof insertSalarioRecorrenteSchema>;
export type SalarioRecorrente = typeof salariosRecorrentesTable.$inferSelect;

/**
 * O saldo de caixa conferido num DIA — a âncora da projeção.
 *
 * Era chaveado por competência (YYYY-MM), o que não responde à pergunta que a
 * projeção faz: "quanto tem em caixa HOJE?". Um saldo de julho não diz de qual
 * dia de julho ele é, e a curva partia de um nível que já embutia (ou não) os
 * movimentos do mês. `dataReferencia` é um instante ancorado ao meio-dia local
 * do dia conferido — mesma convenção de `vencimento`.
 */
export const saldosReferenciaTable = pgTable("saldos_referencia", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  dataReferencia: timestamp("data_referencia", { withTimezone: true }).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2, mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  // Um saldo por dia: conferir duas vezes o mesmo dia é corrigir, não empilhar.
  unq: unique().on(t.lojaId, t.dataReferencia),
}));

export const insertSaldoReferenciaSchema = createInsertSchema(saldosReferenciaTable).omit({ createdAt: true, updatedAt: true });
export type InsertSaldoReferencia = z.infer<typeof insertSaldoReferenciaSchema>;
export type SaldoReferencia = typeof saldosReferenciaTable.$inferSelect;

export const registrosCobrancaTable = pgTable("registros_cobranca", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  contatoData: timestamp("contato_data", { withTimezone: true }).notNull().defaultNow(),
  canal: text("canal").notNull(),
  observacao: text("observacao"),
  vendedorId: text("vendedor_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRegistroCobrancaSchema = createInsertSchema(registrosCobrancaTable).omit({ createdAt: true });
export type InsertRegistroCobranca = z.infer<typeof insertRegistroCobrancaSchema>;
export type RegistroCobranca = typeof registrosCobrancaTable.$inferSelect;
