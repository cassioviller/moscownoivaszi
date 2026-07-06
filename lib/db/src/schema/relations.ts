import { relations } from "drizzle-orm";
import { lojasTable, cabinesTable } from "./loja";
import { usuariosTable } from "./usuarios";
import {
  atributosTable,
  atributoOpcoesTable,
  vestidosTable,
  vestidoFotosTable,
  vestidoAtributosTable,
} from "./vestidos";
import {
  leadsTable,
  leadInteressesTable,
  leadInteresseAtributosTable,
} from "./leads";
import {
  reservasTable,
  bloqueioVestidosTable,
  atendimentosTable,
  ajustesTable,
  ajusteChecklistItensTable,
} from "./atendimentos";
import { orcamentosTable, orcamentoItensTable } from "./orcamentos";
import { contratosTable } from "./contratos";
import {
  parcelasTable,
  contasPagarTable,
  pagamentosTable,
  pagamentoItensTable,
  registrosCobrancaTable,
} from "./financeiro";

export const lojasRelations = relations(lojasTable, ({ many }) => ({
  cabines: many(cabinesTable),
  leads: many(leadsTable),
}));

export const cabinesRelations = relations(cabinesTable, ({ one, many }) => ({
  loja: one(lojasTable, { fields: [cabinesTable.lojaId], references: [lojasTable.id] }),
  atendimentos: many(atendimentosTable),
}));

export const leadsRelations = relations(leadsTable, ({ one, many }) => ({
  loja: one(lojasTable, { fields: [leadsTable.lojaId], references: [lojasTable.id] }),
  interesse: one(leadInteressesTable, {
    fields: [leadsTable.id],
    references: [leadInteressesTable.leadId],
  }),
  atendimentos: many(atendimentosTable),
  orcamentos: many(orcamentosTable),
  contratos: many(contratosTable),
  reservas: many(reservasTable),
  bloqueioVestidos: many(bloqueioVestidosTable),
  registrosCobranca: many(registrosCobrancaTable),
}));

export const leadInteressesRelations = relations(leadInteressesTable, ({ one, many }) => ({
  lead: one(leadsTable, { fields: [leadInteressesTable.leadId], references: [leadsTable.id] }),
  atributos: many(leadInteresseAtributosTable),
}));

export const leadInteresseAtributosRelations = relations(leadInteresseAtributosTable, ({ one }) => ({
  leadInteresse: one(leadInteressesTable, {
    fields: [leadInteresseAtributosTable.leadInteresseId],
    references: [leadInteressesTable.id],
  }),
  atributo: one(atributosTable, {
    fields: [leadInteresseAtributosTable.atributoId],
    references: [atributosTable.id],
  }),
  opcao: one(atributoOpcoesTable, {
    fields: [leadInteresseAtributosTable.opcaoId],
    references: [atributoOpcoesTable.id],
  }),
}));

export const atributosRelations = relations(atributosTable, ({ one, many }) => ({
  loja: one(lojasTable, { fields: [atributosTable.lojaId], references: [lojasTable.id] }),
  opcoes: many(atributoOpcoesTable),
}));

export const atributoOpcoesRelations = relations(atributoOpcoesTable, ({ one }) => ({
  atributo: one(atributosTable, {
    fields: [atributoOpcoesTable.atributoId],
    references: [atributosTable.id],
  }),
}));

export const vestidosRelations = relations(vestidosTable, ({ one, many }) => ({
  loja: one(lojasTable, { fields: [vestidosTable.lojaId], references: [lojasTable.id] }),
  atributos: many(vestidoAtributosTable),
  fotos: many(vestidoFotosTable),
}));

export const vestidoFotosRelations = relations(vestidoFotosTable, ({ one }) => ({
  vestido: one(vestidosTable, {
    fields: [vestidoFotosTable.vestidoId],
    references: [vestidosTable.id],
  }),
}));

export const vestidoAtributosRelations = relations(vestidoAtributosTable, ({ one }) => ({
  vestido: one(vestidosTable, {
    fields: [vestidoAtributosTable.vestidoId],
    references: [vestidosTable.id],
  }),
  atributo: one(atributosTable, {
    fields: [vestidoAtributosTable.atributoId],
    references: [atributosTable.id],
  }),
  opcao: one(atributoOpcoesTable, {
    fields: [vestidoAtributosTable.opcaoId],
    references: [atributoOpcoesTable.id],
  }),
}));

export const reservasRelations = relations(reservasTable, ({ one, many }) => ({
  loja: one(lojasTable, { fields: [reservasTable.lojaId], references: [lojasTable.id] }),
  lead: one(leadsTable, { fields: [reservasTable.leadId], references: [leadsTable.id] }),
  bloqueios: many(bloqueioVestidosTable),
}));

export const bloqueioVestidosRelations = relations(bloqueioVestidosTable, ({ one, many }) => ({
  loja: one(lojasTable, { fields: [bloqueioVestidosTable.lojaId], references: [lojasTable.id] }),
  vestido: one(vestidosTable, {
    fields: [bloqueioVestidosTable.vestidoId],
    references: [vestidosTable.id],
  }),
  lead: one(leadsTable, { fields: [bloqueioVestidosTable.leadId], references: [leadsTable.id] }),
  reserva: one(reservasTable, {
    fields: [bloqueioVestidosTable.reservaId],
    references: [reservasTable.id],
  }),
  atendimentos: many(atendimentosTable),
  contratos: many(contratosTable),
}));

export const atendimentosRelations = relations(atendimentosTable, ({ one, many }) => ({
  loja: one(lojasTable, { fields: [atendimentosTable.lojaId], references: [lojasTable.id] }),
  lead: one(leadsTable, { fields: [atendimentosTable.leadId], references: [leadsTable.id] }),
  cabine: one(cabinesTable, { fields: [atendimentosTable.cabineId], references: [cabinesTable.id] }),
  vendedora: one(usuariosTable, {
    fields: [atendimentosTable.vendedoraId],
    references: [usuariosTable.id],
  }),
  bloqueio: one(bloqueioVestidosTable, {
    fields: [atendimentosTable.bloqueioId],
    references: [bloqueioVestidosTable.id],
  }),
  ajustes: many(ajustesTable),
  orcamentos: many(orcamentosTable),
}));

export const ajustesRelations = relations(ajustesTable, ({ one, many }) => ({
  loja: one(lojasTable, { fields: [ajustesTable.lojaId], references: [lojasTable.id] }),
  atendimento: one(atendimentosTable, {
    fields: [ajustesTable.atendimentoId],
    references: [atendimentosTable.id],
  }),
  checklist: many(ajusteChecklistItensTable),
}));

export const ajusteChecklistItensRelations = relations(ajusteChecklistItensTable, ({ one }) => ({
  ajuste: one(ajustesTable, { fields: [ajusteChecklistItensTable.ajusteId], references: [ajustesTable.id] }),
}));

export const orcamentosRelations = relations(orcamentosTable, ({ one, many }) => ({
  loja: one(lojasTable, { fields: [orcamentosTable.lojaId], references: [lojasTable.id] }),
  lead: one(leadsTable, { fields: [orcamentosTable.leadId], references: [leadsTable.id] }),
  atendimento: one(atendimentosTable, {
    fields: [orcamentosTable.atendimentoId],
    references: [atendimentosTable.id],
  }),
  vendedora: one(usuariosTable, {
    fields: [orcamentosTable.vendedoraId],
    references: [usuariosTable.id],
  }),
  itens: many(orcamentoItensTable),
  contrato: one(contratosTable, {
    fields: [orcamentosTable.id],
    references: [contratosTable.orcamentoId],
  }),
}));

export const orcamentoItensRelations = relations(orcamentoItensTable, ({ one }) => ({
  orcamento: one(orcamentosTable, {
    fields: [orcamentoItensTable.orcamentoId],
    references: [orcamentosTable.id],
  }),
  vestido: one(vestidosTable, {
    fields: [orcamentoItensTable.vestidoId],
    references: [vestidosTable.id],
  }),
}));

export const contratosRelations = relations(contratosTable, ({ one, many }) => ({
  loja: one(lojasTable, { fields: [contratosTable.lojaId], references: [lojasTable.id] }),
  lead: one(leadsTable, { fields: [contratosTable.leadId], references: [leadsTable.id] }),
  orcamento: one(orcamentosTable, {
    fields: [contratosTable.orcamentoId],
    references: [orcamentosTable.id],
  }),
  bloqueioVestido: one(bloqueioVestidosTable, {
    fields: [contratosTable.bloqueioVestidoId],
    references: [bloqueioVestidosTable.id],
  }),
  vendedora: one(usuariosTable, {
    fields: [contratosTable.vendedoraId],
    references: [usuariosTable.id],
  }),
  parcelas: many(parcelasTable),
}));

export const parcelasRelations = relations(parcelasTable, ({ one }) => ({
  loja: one(lojasTable, { fields: [parcelasTable.lojaId], references: [lojasTable.id] }),
  contrato: one(contratosTable, { fields: [parcelasTable.contratoId], references: [contratosTable.id] }),
}));

export const contasPagarRelations = relations(contasPagarTable, ({ one, many }) => ({
  loja: one(lojasTable, { fields: [contasPagarTable.lojaId], references: [lojasTable.id] }),
  colaborador: one(usuariosTable, {
    fields: [contasPagarTable.colaboradorId],
    references: [usuariosTable.id],
  }),
  pagamentoItens: many(pagamentoItensTable),
}));

export const pagamentosRelations = relations(pagamentosTable, ({ one, many }) => ({
  loja: one(lojasTable, { fields: [pagamentosTable.lojaId], references: [lojasTable.id] }),
  colaborador: one(usuariosTable, {
    fields: [pagamentosTable.colaboradorId],
    references: [usuariosTable.id],
  }),
  itens: many(pagamentoItensTable),
}));

export const pagamentoItensRelations = relations(pagamentoItensTable, ({ one }) => ({
  pagamento: one(pagamentosTable, {
    fields: [pagamentoItensTable.pagamentoId],
    references: [pagamentosTable.id],
  }),
  contaPagar: one(contasPagarTable, {
    fields: [pagamentoItensTable.contaPagarId],
    references: [contasPagarTable.id],
  }),
}));

export const registrosCobrancaRelations = relations(registrosCobrancaTable, ({ one }) => ({
  loja: one(lojasTable, { fields: [registrosCobrancaTable.lojaId], references: [lojasTable.id] }),
  lead: one(leadsTable, { fields: [registrosCobrancaTable.leadId], references: [leadsTable.id] }),
  vendedor: one(usuariosTable, {
    fields: [registrosCobrancaTable.vendedorId],
    references: [usuariosTable.id],
  }),
}));

export const usuariosRelations = relations(usuariosTable, ({ many }) => ({
  atendimentosComoVendedora: many(atendimentosTable),
  orcamentosComoVendedora: many(orcamentosTable),
  contratosComoVendedora: many(contratosTable),
}));
