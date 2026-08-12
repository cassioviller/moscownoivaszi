import { pgTable, text, timestamp, decimal, integer, uniqueIndex, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { leadsTable } from "./leads";
import { atendimentosTable, ajustesTable } from "./atendimentos";
import { usuariosTable } from "./usuarios";
import { vestidosTable, itensEstoqueTable } from "./vestidos";
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
  // S-M27 (rodada 2, achado 9#2): toda consulta de orçamento começa em
  // lojaId (lista paginada roda DUAS — count + página) e as quentes somam
  // status (fila de /mensagens, card do dashboard em todo load da home) ou
  // leadId (ficha da noiva). Sem índice, cada uma varria a tabela de TODAS
  // as lojas — os irmãos da mesma classe (contratos, leads, parcelas) têm o
  // deles desde o B10/E91.
  lojaStatusIdx: index("orcamentos_loja_status_idx").on(t.lojaId, t.status),
  leadIdx: index("orcamentos_lead_idx").on(t.leadId),
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
  // E154: item de ESTOQUE aponta aqui em vez de `vestidoId` — são os dois
  // jeitos de um item apontar uma peça, e nunca os dois ao mesmo tempo.
  itemEstoqueId: text("item_estoque_id").references(() => itensEstoqueTable.id, { onDelete: "set null" }),
  /**
   * E155 — o item `AJUSTE` que COBRA uma confecção aponta o trabalho na fila da
   * costureira. Sem isto, o que foi cobrado e o que alguém costura são duas
   * frases parecidas em telas diferentes, e ninguém sabe se a manga da noiva
   * está paga. `set null` como os irmãos: apagar o trabalho não apaga a venda.
   */
  ajusteId: text("ajuste_id").references(() => ajustesTable.id, { onDelete: "set null" }),
  descricao: text("descricao").notNull(),
  valorUnitario: decimal("valor_unitario", { precision: 10, scale: 2, mode: "number" }).notNull(),
  quantidade: integer("quantidade").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // S-M27: o irmão contrato_itens TEM o dele (contrato_itens_contrato_idx) —
  // o `inArray(orcamentoId, ids)` de toda listagem varria a tabela inteira.
  orcamentoIdx: index("orcamento_itens_orcamento_idx").on(t.orcamentoId),
}));

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
  /**
   * O7/C5 (E166) — a página da noiva mostra observações e validade LOGO ACIMA
   * do comprovante de aceite, e as duas eram lidas da linha VIVA: a observação
   * mudava de "entrada de R$ 1.500,00" para "entrada de R$ 2.500,00" com o
   * total intacto, o hash continuava batendo, e o comprovante passava a
   * afirmar R$ 1.000,00 a mais de entrada sob o mesmo "Aceito em". Agora as
   * duas congelam com a versão. Nulos = versão anterior a esta coluna — a
   * página cai na linha viva, como sempre fez.
   */
  observacoes: text("observacoes"),
  validade: timestamp("validade", { withTimezone: true }),
  /**
   * S-O29 (A07.4) — **a IDENTIDADE das peças, congelada FORA do hash.**
   *
   * O `hash` prende `{tipo, descricao, valorUnitario, quantidade}` e nada mais
   * (`lib/conteudo-orcamento.ts:34-39`): trocar o `vestidoId` de um item
   * mantendo descrição e preço **não muda o hash**, e o `POST /contratos`
   * aceita. A noiva prova o vestido A, assina uma proposta que diz "Vestido
   * tomara-que-caia marfim · R$ 5.000,00", e o contrato fecha sobre o vestido
   * B — e `contratos.ts` já registra que a mesma descrição sai para noivas
   * diferentes.
   *
   * Por que coluna nova em vez de pôr o `vestidoId` no hash: o comentário de
   * `conteudoEnviado` é explícito — *"o formato do `conteudo` é CONTRATO: mudar
   * uma chave invalida todo hash já gravado"*. Uma noiva com o link na mão no
   * momento do deploy perderia o aceite dela. Aqui a identidade viaja ao lado,
   * na MESMA ordem de `itens`, e a conferência é independente.
   *
   * `null` = versão anterior a esta coluna. A conferência se desliga nela, que
   * é exatamente o comportamento de hoje — não se pode cobrar de um snapshot o
   * que ele nunca guardou.
   */
  itensVestidoIds: jsonb("itens_vestido_ids"),
  criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  numeroUnq: uniqueIndex("orcamento_versoes_numero_unq").on(t.orcamentoId, t.numero),
}));

export type OrcamentoVersao = typeof orcamentoVersoesTable.$inferSelect;
