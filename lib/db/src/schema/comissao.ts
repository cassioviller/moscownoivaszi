import { pgTable, text, timestamp, decimal, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { usuariosTable } from "./usuarios";
import { contasPagarTable } from "./financeiro";

export const comissaoRegrasTable = pgTable("comissao_regras", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  usuarioId: text("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  regraGlobal: text("regra_global"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  unq: unique().on(t.lojaId, t.usuarioId),
}));

export const insertComissaoRegraSchema = createInsertSchema(comissaoRegrasTable).omit({ createdAt: true, updatedAt: true });
export type InsertComissaoRegra = z.infer<typeof insertComissaoRegraSchema>;
export type ComissaoRegra = typeof comissaoRegrasTable.$inferSelect;

export const comissaoFaixasTable = pgTable("comissao_faixas", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  minimoVenda: decimal("minimo_venda", { precision: 10, scale: 2, mode: "number" }).notNull(),
  percentual: decimal("percentual", { precision: 5, scale: 2, mode: "number" }).notNull(),
});

export const insertComissaoFaixaSchema = createInsertSchema(comissaoFaixasTable);
export type InsertComissaoFaixa = z.infer<typeof insertComissaoFaixaSchema>;
export type ComissaoFaixa = typeof comissaoFaixasTable.$inferSelect;

export const comissaoFechamentosTable = pgTable("comissao_fechamentos", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  usuarioId: text("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  competencia: text("competencia").notNull(), // "YYYY-MM"
  totalVendas: decimal("total_vendas", { precision: 10, scale: 2, mode: "number" }).notNull(),
  comissaoValor: decimal("comissao_valor", { precision: 10, scale: 2, mode: "number" }).notNull(),
  contaPagarId: text("conta_pagar_id").unique().references(() => contasPagarTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq: unique().on(t.lojaId, t.usuarioId, t.competencia),
}));

export const insertComissaoFechamentoSchema = createInsertSchema(comissaoFechamentosTable).omit({ createdAt: true });
export type InsertComissaoFechamento = z.infer<typeof insertComissaoFechamentoSchema>;
export type ComissaoFechamento = typeof comissaoFechamentosTable.$inferSelect;
