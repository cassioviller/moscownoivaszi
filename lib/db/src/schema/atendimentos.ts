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
  // Quando a recepção confirmou a presença por WhatsApp (E39). Separa "já falei"
  // de "falta falar" na fila de confirmação — antes o E8 era um clique sem rastro.
  confirmadoEm: timestamp("confirmado_em", { withTimezone: true }),
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
