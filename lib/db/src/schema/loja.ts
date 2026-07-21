import { pgTable, text, boolean, timestamp, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const lojasTable = pgTable("lojas", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(),
  cnpj: text("cnpj"),
  endereco: text("endereco"),
  telefone: text("telefone"),
  ativo: boolean("ativo").notNull().default(true),
  // Captação externa (E19): o token é a credencial do formulário do site/
  // Instagram para criar leads sem sessão. Null = captação desligada;
  // rotacionar troca o token e o formulário antigo para de funcionar.
  captacaoToken: text("captacao_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  captacaoTokenUnq: uniqueIndex("lojas_captacao_token_unq").on(t.captacaoToken),
}));

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
  // Dias da semana em que a loja abre (E38): 0=domingo … 6=sábado. Default
  // seg–sáb (loja de noiva fecha domingo). Sem dia aberto = agenda fechada.
  diasFuncionamento: jsonb("dias_funcionamento").$type<number[]>().notNull().default([1, 2, 3, 4, 5, 6]),
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
