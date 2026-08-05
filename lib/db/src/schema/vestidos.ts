import { pgTable, text, boolean, timestamp, integer, decimal, primaryKey, customType, unique, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { ajustesTable } from "./atendimentos";
import { atributoTipoEnum } from "./common/enums";

// Drizzle doesn't have a built-in Bytes type for Postgres, using customType
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const atributosTable = pgTable("atributos", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  tipo: atributoTipoEnum("tipo").notNull().default("OPCAO_UNICA"),
  ordem: integer("ordem").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
});

export const insertAtributoSchema = createInsertSchema(atributosTable);
export type InsertAtributo = z.infer<typeof insertAtributoSchema>;
export type Atributo = typeof atributosTable.$inferSelect;

export const atributoOpcoesTable = pgTable("atributo_opcoes", {
  id: text("id").primaryKey(),
  atributoId: text("atributo_id").notNull().references(() => atributosTable.id, { onDelete: "cascade" }),
  valor: text("valor").notNull(),
  ordem: integer("ordem").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
});

export const insertAtributoOpcaoSchema = createInsertSchema(atributoOpcoesTable);
export type InsertAtributoOpcao = z.infer<typeof insertAtributoOpcaoSchema>;
export type AtributoOpcao = typeof atributoOpcoesTable.$inferSelect;

export const vestidosTable = pgTable("vestidos", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  codigo: text("codigo").notNull(),
  nome: text("nome").notNull(),
  precoBase: decimal("preco_base", { precision: 10, scale: 2, mode: "number" }).notNull(),
  /**
   * E157 — o preço da peça que já saiu antes.
   *
   * O ateliê precifica pela VEZ em que a peça sai: o caderno registra a
   * contagem 7 vezes em 14 semanas — `1º Aluguel` (YOKO, Adelita, Andreia),
   * `2º Aluguel` (Nixia), `2º` (BLARY), `Realuguel` (Fencyella, Adelita) — e o
   * sistema tinha um preço só.
   *
   * **Nulo é o caso comum e significa "não tem preço de segunda saída"**: o
   * orçamento segue com o `precoBase`, que é o comportamento de sempre. Por
   * isso a coluna nasce sem migração de dados nenhuma.
   *
   * A contagem que decide qual preço vale NÃO mora aqui: ela é derivada dos
   * contratos (`GET /vestidos/utilizacao`), como toda contagem deste repo.
   */
  precoRealuguel: decimal("preco_realuguel", { precision: 10, scale: 2, mode: "number" }),
  /**
   * E156 — de onde esta peça veio, quando ela não veio do fornecedor.
   *
   * A confecção sob medida entra na fila da costureira (E155) e, depois do
   * casamento, **vira peça do acervo** (P4). A proveniência mora aqui, e não em
   * `ajustes.vestidoId`, porque a direção importa: **a peça do acervo é o que
   * sobrevive**, o trabalho da costureira é de onde ela veio. Apontar ao
   * contrário faria a fila carregar um campo que só interessa depois que ela
   * terminou.
   *
   * `set null` pela mesma razão: apagar o trabalho da fila não pode apagar a
   * peça que já está alugável — perde-se a proveniência, não o acervo.
   *
   * Nulo é o caso de toda peça comprada, que é a esmagadora maioria.
   */
  origemAjusteId: text("origem_ajuste_id").references((): AnyPgColumn => ajustesTable.id, { onDelete: "set null" }),
  tamanho: text("tamanho"),
  cor: text("cor"),
  categoria: text("categoria"),
  status: text("status").notNull().default("ativo"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  unq: unique().on(t.lojaId, t.codigo),
}));

export const insertVestidoSchema = createInsertSchema(vestidosTable).omit({ createdAt: true, updatedAt: true });
export type InsertVestido = z.infer<typeof insertVestidoSchema>;
export type Vestido = typeof vestidosTable.$inferSelect;

export const vestidoFotosTable = pgTable("vestido_fotos", {
  id: text("id").primaryKey(),
  vestidoId: text("vestido_id").notNull().references(() => vestidosTable.id, { onDelete: "cascade" }),
  ordem: integer("ordem").notNull(), // 0 ou 1
  bytes: bytea("bytes").notNull(),
  mime: text("mime").notNull(),
  largura: integer("largura").notNull(),
  altura: integer("altura").notNull(),
  // Thumb gerada no CLIENTE (canvas) e enviada junto — os cards da lista deixam
  // de puxar a foto cheia do Postgres. Nullable: legado sem thumb cai na cheia.
  thumbBytes: bytea("thumb_bytes"),
  thumbMime: text("thumb_mime"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  unq: unique().on(t.vestidoId, t.ordem),
}));

export const insertVestidoFotoSchema = createInsertSchema(vestidoFotosTable).omit({ createdAt: true, updatedAt: true });
export type InsertVestidoFoto = z.infer<typeof insertVestidoFotoSchema>;
export type VestidoFoto = typeof vestidoFotosTable.$inferSelect;

export const vestidoAtributosTable = pgTable("vestido_atributos", {
  vestidoId: text("vestido_id").notNull().references(() => vestidosTable.id, { onDelete: "cascade" }),
  atributoId: text("atributo_id").notNull().references(() => atributosTable.id),
  opcaoId: text("opcao_id").notNull().references(() => atributoOpcoesTable.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.vestidoId, t.atributoId] }),
}));

export const insertVestidoAtributoSchema = createInsertSchema(vestidoAtributosTable);
export type InsertVestidoAtributo = z.infer<typeof insertVestidoAtributoSchema>;
export type VestidoAtributo = typeof vestidoAtributosTable.$inferSelect;

/**
 * E154 — o acessório de ESTOQUE, que se conta em vez de se reservar.
 *
 * O caderno do ateliê chama de "segunda peça" coisas que não têm nada em
 * comum. O que as distingue não é o que são: é **como se decide se estão
 * disponíveis**.
 *
 *  · `Bolero Ricca Sposa`, `Mantilha Chan` — existe UMA. Decide-se POR PEÇA, e
 *    por isso moram em `vestidos`, com código e reserva próprios (E150).
 *  · `Saiote 2 aros`, `crinol` — existem DEZ, iguais. Decide-se POR CONTAGEM.
 *
 * Reservar "o saiote nº 7" não significa nada, porque ninguém vai atrás
 * daquele; e cadastrá-los um a um encheria de anágua a mesma lista que a
 * vendedora abre com a noiva na cabine. Daí a tabela separada: o que muda é o
 * mecanismo de disponibilidade, não o carinho com a peça.
 *
 * `quantidade` é quantas a loja tem. O comprometimento por data é derivado dos
 * contratos ativos — nunca gravado aqui —, para não existirem duas verdades
 * sobre o mesmo número.
 */
export const itensEstoqueTable = pgTable("itens_estoque", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  /** Só quando faz diferença para quem separa a peça (P/M/G de saiote). */
  tamanho: text("tamanho"),
  quantidade: integer("quantidade").notNull().default(0),
  /** Nulo = vai junto com o vestido, sem cobrar à parte. */
  preco: decimal("preco", { precision: 10, scale: 2, mode: "number" }),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  unq: unique().on(t.lojaId, t.nome, t.tamanho),
}));

export const insertItemEstoqueSchema = createInsertSchema(itensEstoqueTable).omit({ createdAt: true, updatedAt: true });
export type InsertItemEstoque = z.infer<typeof insertItemEstoqueSchema>;
export type ItemEstoque = typeof itensEstoqueTable.$inferSelect;
