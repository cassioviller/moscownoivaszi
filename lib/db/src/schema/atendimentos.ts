import { pgTable, text, timestamp, boolean, integer, unique, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable, cabinesTable } from "./loja";
import { leadsTable } from "./leads";
import { usuariosTable } from "./usuarios";
import { vestidosTable } from "./vestidos";
import { 
  reservaStatusEnum, 
  bloqueioTipoEnum, 
  ajusteStatusEnum, 
  atendimentoTipoEnum, 
  atendimentoSituacaoEnum, 
  atendimentoDesfechoEnum 
} from "./common/enums";

export const reservasTable = pgTable("reservas", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  casamentoData: timestamp("casamento_data", { withTimezone: true }).notNull(),
  status: reservaStatusEnum("status").notNull().default("EM_MONTAGEM"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReservaSchema = createInsertSchema(reservasTable).omit({ createdAt: true, updatedAt: true });
export type InsertReserva = z.infer<typeof insertReservaSchema>;
export type Reserva = typeof reservasTable.$inferSelect;

export const bloqueioVestidosTable = pgTable("bloqueio_vestidos", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  vestidoId: text("vestido_id").notNull().references(() => vestidosTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  tipo: bloqueioTipoEnum("tipo").notNull(),
  casamentoData: timestamp("casamento_data", { withTimezone: true }),
  provaDataReal: timestamp("prova_data_real", { withTimezone: true }),
  retiradaDataReal: timestamp("retirada_data_real", { withTimezone: true }),
  devolucaoDataReal: timestamp("devolucao_data_real", { withTimezone: true }),
  // Manutenção: janela [inicio, fim]; fim null = sem prazo definido.
  inicio: timestamp("inicio", { withTimezone: true }),
  fim: timestamp("fim", { withTimezone: true }),
  // Soft-cancel do bloqueio (a constraint EXCLUDE do banco só enxerga esta coluna,
  // não o status da reserva vinculada).
  canceladoEm: timestamp("cancelado_em", { withTimezone: true }),
  // Envelope FÍSICO materializado (dias locais America/Sao_Paulo, inclusivos),
  // calculado pelo serviço de disponibilidade em todo INSERT/UPDATE.
  // ocupacaoFim null = janela aberta (retirada sem devolução).
  ocupacaoInicio: date("ocupacao_inicio"),
  ocupacaoFim: date("ocupacao_fim"),
  observacao: text("observacao"),
  reservaId: text("reserva_id").references(() => reservasTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBloqueioVestidoSchema = createInsertSchema(bloqueioVestidosTable).omit({ createdAt: true, updatedAt: true });
export type InsertBloqueioVestido = z.infer<typeof insertBloqueioVestidoSchema>;
export type BloqueioVestido = typeof bloqueioVestidosTable.$inferSelect;

export const atendimentosTable = pgTable("atendimentos", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  cabineId: text("cabine_id").notNull().references(() => cabinesTable.id, { onDelete: "cascade" }),
  // restrict (E91/B2): o atendimento é O QUE ACONTECEU com a noiva — a prova, o
  // desfecho, o `atendidoEm`. Com `cascade`, excluir a vendedora apagava o
  // histórico da ficha da noiva junto com o cadastro dela. Inative, não exclua.
  vendedoraId: text("vendedora_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  tipo: atendimentoTipoEnum("tipo").notNull().default("ATENDIMENTO"),
  bloqueioId: text("bloqueio_id").references(() => bloqueioVestidosTable.id, { onDelete: "cascade" }),
  inicio: timestamp("inicio", { withTimezone: true }).notNull(),
  situacao: atendimentoSituacaoEnum("situacao").notNull().default("AGENDADO"),
  atendidoEm: timestamp("atendido_em", { withTimezone: true }),
  /**
   * Quando a LOJA mandou mensagem (E97). É um ato nosso: carimbado no clique da
   * fila do dia, antes mesmo de a mensagem sair. Tira a linha da fila para a
   * recepção não repetir, e não afirma nada sobre a noiva.
   */
  contatadoEm: timestamp("contatado_em", { withTimezone: true }),
  /**
   * Quando a NOIVA respondeu (E85, pelo portal). É o único dos dois sobre o qual
   * a loja toma decisão física — separar a peça, reservar cabine, escalar
   * costureira —, e por isso é o que a agenda mostra como "confirmada".
   *
   * Até o E97 esta coluna guardava os DOIS fatos: nasceu no E39 significando "a
   * recepção falou" e o E85 sobrepôs "a noiva confirmou", sem renomear. Depois
   * de gravados eram indistinguíveis. A migração
   * `docs/migracoes/2026-07-27-e97-contato-e-confirmacao.sql` separou o passado
   * pela trilha (`audit_log.acao = 'PROVA_CONFIRMADA'` só existe quando foi ela).
   */
  confirmadoEm: timestamp("confirmado_em", { withTimezone: true }),
  /**
   * Quando a noiva pediu para REMARCAR, pelo portal (F37/E100).
   *
   * É o TERCEIRO fato da família que o E97 separou, e o motivo de ser coluna
   * própria é o mesmo: `contatadoEm` é a loja ter procurado, `confirmadoEm` é a
   * noiva ter dito que vem, e este é a noiva ter dito que **não pode**. Guardar
   * os três num campo só é exatamente o erro que o E85 cometeu sobre o E39 e o
   * E97 teve de desfazer com migração e arqueologia de trilha.
   *
   * O atendimento **continua AGENDADO** de propósito: isto é um PEDIDO, não uma
   * remarcação. O horário, a cabine e o vestido seguem presos até alguém da loja
   * decidir — cancelar sozinho devolveria o recurso e deixaria a noiva sem
   * horário nenhum por causa de um clique dela num link.
   */
  remarcacaoPedidaEm: timestamp("remarcacao_pedida_em", { withTimezone: true }),
  desfecho: atendimentoDesfechoEnum("desfecho"),
  observacao: text("observacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  cabineUnq: unique().on(t.cabineId, t.inicio),
  vendedoraUnq: unique().on(t.lojaId, t.vendedoraId, t.inicio),
}));

export const insertAtendimentoSchema = createInsertSchema(atendimentosTable).omit({ createdAt: true, updatedAt: true });
export type InsertAtendimento = z.infer<typeof insertAtendimentoSchema>;
export type Atendimento = typeof atendimentosTable.$inferSelect;

export const ajustesTable = pgTable("ajustes", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  atendimentoId: text("atendimento_id").notNull().references(() => atendimentosTable.id, { onDelete: "cascade" }),
  descricao: text("descricao").notNull(),
  status: ajusteStatusEnum("status").notNull().default("PENDENTE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAjusteSchema = createInsertSchema(ajustesTable).omit({ createdAt: true, updatedAt: true });
export type InsertAjuste = z.infer<typeof insertAjusteSchema>;
export type Ajuste = typeof ajustesTable.$inferSelect;

export const ajusteChecklistItensTable = pgTable("ajuste_checklist_itens", {
  id: text("id").primaryKey(),
  ajusteId: text("ajuste_id").notNull().references(() => ajustesTable.id, { onDelete: "cascade" }),
  descricao: text("descricao").notNull(),
  feito: boolean("feito").notNull().default(false),
  ordem: integer("ordem").notNull().default(0),
});

export const insertAjusteChecklistItemSchema = createInsertSchema(ajusteChecklistItensTable);
export type InsertAjusteChecklistItem = z.infer<typeof insertAjusteChecklistItemSchema>;
export type AjusteChecklistItem = typeof ajusteChecklistItensTable.$inferSelect;
