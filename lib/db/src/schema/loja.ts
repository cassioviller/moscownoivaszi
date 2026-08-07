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
  /**
   * S-A16 — a lavagem da PEÇA DE ESTOQUE (saiote, véu, bolero), separada da do
   * vestido de propósito: a dona decidiu em 2026-08-07 que ela é configurável,
   * e o default 0 preserva o comportamento que sempre valeu (estoque sem
   * lavagem na conta) até alguém preencher. Quem a soma é `estoque.ts`.
   */
  estoqueLavagemDiasDepois: integer("estoque_lavagem_dias_depois").notNull().default(0),
  atendimentoAberturaHora: integer("atendimento_abertura_hora").notNull().default(9),
  /**
   * S-A8 — era 19, e o papel do ateliê mostrava 6 provas às **18:30**. Com a
   * prova de 60 min, a última que cabia começava às 18:00: o horário mais usado
   * do fim do dia era justamente o que o default recusava. A dona confirmou o
   * expediente real — **até as 20h** —, e o default passou a ser o dela.
   */
  atendimentoFechamentoHora: integer("atendimento_fechamento_hora").notNull().default(20),
  /**
   * Dias da semana em que a loja abre (E38): 0=domingo … 6=sábado. Sem dia
   * aberto = agenda fechada.
   *
   * S-A8 — era `[1..6]`, com um comentário afirmando que loja de noiva fecha
   * domingo. **Este ateliê atendeu 7 vezes em 5 domingos** (19/07, 02/08,
   * 09/08, 16/08, 13/09), às 14h e às 18h. A dona explicou: domingo não é
   * expediente de rotina, mas ela atende **com hora marcada** — e o sistema não
   * sabe dizer essa diferença, só sabe abrir ou recusar. Aberto é o que não
   * perde a venda; o que ele não faz é oferecer domingo como dia de rotina.
   */
  diasFuncionamento: jsonb("dias_funcionamento").$type<number[]>().notNull().default([0, 1, 2, 3, 4, 5, 6]),
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
