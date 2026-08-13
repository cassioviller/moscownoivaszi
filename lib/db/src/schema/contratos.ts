import { pgTable, text, timestamp, decimal, integer, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { leadsTable } from "./leads";
import { orcamentosTable } from "./orcamentos";
import { bloqueioVestidosTable } from "./atendimentos";
import { vestidosTable, itensEstoqueTable } from "./vestidos";
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
  // restrict (E91/B2): a regra do repo é que autoria é `set null` porque perder
  // QUEM fez é recuperável e perder O QUE aconteceu não é. Aqui a coluna é
  // notNull, então `set null` não existe — a única saída honesta é RECUSAR o
  // delete. Com `cascade`, excluir uma vendedora apagava os contratos dela, as
  // parcelas PAGAS (com `recebidoEm`), o snapshot de itens e os fechamentos de
  // comissão: o caixa realizado mudava para trás, sem erro e sem trilha.
  // O caminho suportado para quem sai do ateliê é INATIVAR (`usuarios.ativo`).
  vendedoraId: text("vendedora_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
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
  /**
   * E211 — quantas trocas de data **já foram COBRADAS** neste contrato.
   *
   * É o degrau da escada do §3º (10% → 20% → 30%), e é coluna e não contagem
   * da trilha de propósito: decidir dinheiro lendo o JSON de `audit_log` faria
   * a cobrança depender do formato de um detalhe de auditoria, que existe para
   * contar a história e não para ser fonte de cálculo. A trilha continua
   * narrando; a coluna é quem responde "qual é o próximo degrau".
   *
   * Conta o que foi COBRADO, não o que foi movido: troca dentro do mesmo ano
   * não incide (§2º) e não anda a escada.
   */
  reajustesDeData: integer("reajustes_de_data").notNull().default(0),
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
}, (t) => ({
  // B10/E91: comissão, dashboard e conversão abrem por loja + data do fecho.
  lojaFechadoEmIdx: index("contratos_loja_fechado_em_idx").on(t.lojaId, t.fechadoEm),
  /**
   * K3/A08.1 (E158) — uma noiva tem no máximo UM contrato ativo, e agora quem
   * garante é o banco.
   *
   * A guarda existia só em código (`contratos.ts:184`), lida no pool antes da
   * transação: duas vendedoras clicando "gerar contrato" no mesmo segundo liam
   * as duas "não tem ativo" e as duas inseriam. **Medido:** dois contratos
   * ATIVOS de R$ 5.000,00 para a mesma noiva, a ficha somando 2 × 10 ×
   * R$ 500,00 = R$ 10.000,00 a receber sobre uma venda de R$ 5.000,00, e a
   * comissão fechando sobre o dobro — o estrago da S-M3 entrando por outra
   * porta.
   *
   * A rota passou a trancar a linha do LEAD e reler dentro da transação, o que
   * fecha a corrida no caminho normal. Este índice é o cinto: fecha a porta
   * para script, seed e rota futura que não conheçam a régua. Parcial em
   * `status = 'ATIVO'` porque contrato CANCELADO não segura noiva nenhuma — a
   * mesma noiva pode ter três cancelados e um ativo.
   *
   * No dev, `309` contratos ATIVOS e ZERO leads com dois — o índice nasce
   * verde num banco que já viveu.
   */
  ativoUnicoPorLead: uniqueIndex("contratos_lead_ativo_unico")
    .on(t.leadId)
    .where(sql`${t.status} = 'ATIVO'`),
}));

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
  // E154: item de ESTOQUE aponta aqui em vez de `vestidoId` — são os dois
  // jeitos de um item apontar uma peça, e nunca os dois ao mesmo tempo.
  itemEstoqueId: text("item_estoque_id").references(() => itensEstoqueTable.id, { onDelete: "set null" }),
  descricao: text("descricao").notNull(),
  valorUnitario: decimal("valor_unitario", { precision: 10, scale: 2, mode: "number" }).notNull(),
  quantidade: integer("quantidade").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // B10/E91: o snapshot é lido por join em toda montagem de contrato/PDF.
  contratoIdx: index("contrato_itens_contrato_idx").on(t.contratoId),
}));

export const insertContratoItemSchema = createInsertSchema(contratoItensTable).omit({ createdAt: true });
export type InsertContratoItem = z.infer<typeof insertContratoItemSchema>;
export type ContratoItem = typeof contratoItensTable.$inferSelect;

/**
 * E72: o vínculo forte contrato ↔ reserva física deixa de ser singular.
 * `contratos.bloqueio_vestido_id` assumia UM vestido por contrato — e a UI
 * nem o enviava: o contrato nascia sem prender vestido nenhum, e cancelar não
 * liberava nada. Este N:N é a versão que escala (vestido + véu + segunda
 * peça); a coluna antiga fica como legado lido, nunca mais escrito.
 */
export const contratoBloqueiosTable = pgTable(
  "contrato_bloqueios",
  {
    contratoId: text("contrato_id")
      .notNull()
      .references(() => contratosTable.id, { onDelete: "cascade" }),
    bloqueioId: text("bloqueio_id")
      .notNull()
      .references(() => bloqueioVestidosTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.contratoId, t.bloqueioId] }),
  }),
);

export type ContratoBloqueio = typeof contratoBloqueiosTable.$inferSelect;
