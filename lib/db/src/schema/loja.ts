import { pgTable, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const lojasTable = pgTable("lojas", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(),
  cnpj: text("cnpj"),
  endereco: text("endereco"),
  telefone: text("telefone"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLojaSchema = createInsertSchema(lojasTable).omit({ createdAt: true, updatedAt: true });
export type InsertLoja = z.infer<typeof insertLojaSchema>;
export type Loja = typeof lojasTable.$inferSelect;

export const regraDisponibilidadeTable = pgTable("regra_disponibilidade", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().unique().references(() => lojasTable.id, { onDelete: "cascade" }),
  provaDiasAntes: integer("prova_dias_antes").notNull().default(14),
  provaDuracao: integer("prova_duracao").notNull().default(2),
  usoDiasAntes: integer("uso_dias_antes").notNull().default(3),
  usoDiasDepois: integer("uso_dias_depois").notNull().default(2),
  lavagemDiasDepois: integer("lavagem_dias_depois").notNull().default(7),
  atendimentoAberturaHora: integer("atendimento_abertura_hora").notNull().default(9),
  atendimentoFechamentoHora: integer("atendimento_fechamento_hora").notNull().default(19),
});

export const insertRegraDisponibilidadeSchema = createInsertSchema(regraDisponibilidadeTable);
export type InsertRegraDisponibilidade = z.infer<typeof insertRegraDisponibilidadeSchema>;
export type RegraDisponibilidade = typeof regraDisponibilidadeTable.$inferSelect;

export const cabinesTable = pgTable("cabines", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCabineSchema = createInsertSchema(cabinesTable).omit({ createdAt: true, updatedAt: true });
export type InsertCabine = z.infer<typeof insertCabineSchema>;
export type Cabine = typeof cabinesTable.$inferSelect;
