import { pgTable, text, timestamp, decimal, index, primaryKey, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { leadEtapaEnum, leadOrigemEnum, leadPerdidaMotivoEnum, estadoCivilEnum } from "./common/enums";
import { atributosTable, atributoOpcoesTable } from "./vestidos";

export const leadsTable = pgTable("leads", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  etapa: leadEtapaEnum("etapa").notNull().default("NOVO"),
  noivaNome: text("noiva_nome").notNull(),
  noivoNome: text("noivo_nome"),
  cerimonialista: text("cerimonialista"),
  whatsapp: text("whatsapp"),
  casamentoData: timestamp("casamento_data", { withTimezone: true }),
  casamentoHorario: text("casamento_horario"),
  casamentoLocal: text("casamento_local"),
  orcamentoAbertoEm: timestamp("orcamento_aberto_em", { withTimezone: true }),
  /**
   * S-O10 — **o "sim" dela é carimbo, não coluna do funil.**
   *
   * O aceite pelo link não muda ONDE a noiva está (ela segue negociando):
   * muda o que a loja tem de fazer. Por isso ele não virou etapa — viraria a
   * décima segunda coluna de um kanban que já se arrasta em onze no celular, e
   * não mexeria no número de conversão, que conta a partir de CONTRATO_FECHADO
   * porque aceite não é venda até o contrato existir.
   *
   * Vira o que os irmãos acima já são: um INSTANTE. É ele que acende o selo
   * "aceitou" no card do funil, e é dele que sai "do sim ao contrato leva
   * quantos dias" — a medida agregada que faltava, sem tocar no enum.
   *
   * Carimba o PRIMEIRO sim e não se apaga, como `perdidaEm`: desfazer o aceite
   * devolve o orçamento a rascunho, e a noiva que já disse sim uma vez é fato
   * da história dela.
   */
  aceiteEm: timestamp("aceite_em", { withTimezone: true }),
  contratoFechadoEm: timestamp("contrato_fechado_em", { withTimezone: true }),
  perdidaEm: timestamp("perdida_em", { withTimezone: true }),
  // Motivo estruturado da perda (obrigatório ao marcar PERDIDO via API) e o
  // detalhe livre. Ao reviver, ficam como histórico — mesmo espírito do
  // carimbo perdidaEm, que também não se apaga.
  perdidaMotivo: leadPerdidaMotivoEnum("perdida_motivo"),
  perdidaDetalhe: text("perdida_detalhe"),
  origem: leadOrigemEnum("origem").notNull().default("LOJA"),
  // E77 (LGPD): quando a própria noiva consentiu com o uso dos dados (form de
  // captação externa). Null = cadastro interno, consentimento presencial.
  consentimentoEm: timestamp("consentimento_em", { withTimezone: true }),
  // E77: carimbo da anonimização — a linha fica (histórico e números), a PII sai.
  anonimizadaEm: timestamp("anonimizada_em", { withTimezone: true }),
  /**
   * E215 — **quem assina o contrato.** As treze colunas abaixo são a
   * qualificação da locatária que o instrumento de papel exige e que a ficha
   * não tinha: até aqui a vendedora preenchia à mão, no papel, e o sistema
   * imprimia um contrato com os campos em branco.
   *
   * **Todas são ANULÁVEIS, e isso é decisão, não descuido.** A dona decidiu em
   * 13/08 que os campos são obrigatórios **no fecho do contrato** — a régua
   * mora na PORTA (`POST /contratos`), que recusa nomeando o campo que falta.
   * Pô-las `NOT NULL` puniria os **1413 leads** que já existem, nenhum dos
   * quais tem um só dado civil, e travaria o cadastro de quem só ligou
   * perguntando preço: a noiva vira ficha muito antes de virar contrato.
   *
   * O CPF é o caso que ensina o resto. Ele já existia — em `contratos`, não
   * aqui —, a tela de fechar contrato já o oferecia, e ele era **opcional**:
   * medido em 13/08, **0 de 735 contratos têm CPF**. Campo que dá para pular
   * é campo vazio, e por isso a obrigatoriedade da porta é o épico, não a
   * coluna.
   *
   * **Dado pessoal novo entra nas DUAS pontas da LGPD ou nasce fora da lei**
   * (a lição da S-C33, na direção que custa processo): o expurgo de
   * `routes/leads.ts` é `set({…})` de lista curada à mão, e campo que não
   * entra nela sobrevive à anonimização. As treze estão lá.
   */
  cpf: text("cpf"),
  rg: text("rg"),
  estadoCivil: estadoCivilEnum("estado_civil"),
  profissao: text("profissao"),
  nascimento: timestamp("nascimento", { withTimezone: true }),
  email: text("email"),
  enderecoLogradouro: text("endereco_logradouro"),
  enderecoNumero: text("endereco_numero"),
  enderecoComplemento: text("endereco_complemento"),
  enderecoBairro: text("endereco_bairro"),
  enderecoCep: text("endereco_cep"),
  enderecoCidade: text("endereco_cidade"),
  enderecoEstado: text("endereco_estado"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  // B10/E91: o funil, a busca e "leads parados" abrem por loja + etapa.
  lojaEtapaIdx: index("leads_loja_etapa_idx").on(t.lojaId, t.etapa),
}));

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;

export const leadInteressesTable = pgTable("lead_interesses", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().unique().references(() => leadsTable.id, { onDelete: "cascade" }),
  algoAMais: text("algo_a_mais"),
  naoQuerUsar: text("nao_quer_usar"),
  tetoOrcamento: decimal("teto_orcamento", { precision: 10, scale: 2, mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeadInteresseSchema = createInsertSchema(leadInteressesTable).omit({ createdAt: true, updatedAt: true });
export type InsertLeadInteresse = z.infer<typeof insertLeadInteresseSchema>;
export type LeadInteresse = typeof leadInteressesTable.$inferSelect;

export const leadInteresseAtributosTable = pgTable("lead_interesse_atributos", {
  leadInteresseId: text("lead_interesse_id").notNull().references(() => leadInteressesTable.id, { onDelete: "cascade" }),
  // S31 — vocabulário é CONFIGURAÇÃO, e configuração cascateia (régua do E91).
  // Apagar a palavra apaga a CLASSIFICAÇÃO, não a peça nem a noiva: o que a
  // noiva escreveu com as próprias palavras mora em `lead_interesses` e fica.
  // **Não troque por RESTRICT**: a guarda contra apagar sem querer é de
  // APLICAÇÃO e vive em `routes/catalogo.ts` (409 ATRIBUTO_EM_USO / OPCAO_EM_USO).
  atributoId: text("atributo_id").notNull().references(() => atributosTable.id, { onDelete: "cascade" }),
  opcaoId: text("opcao_id").notNull().references(() => atributoOpcoesTable.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.leadInteresseId, t.atributoId] }),
}));

export const insertLeadInteresseAtributoSchema = createInsertSchema(leadInteresseAtributosTable);
export type InsertLeadInteresseAtributo = z.infer<typeof insertLeadInteresseAtributoSchema>;
export type LeadInteresseAtributo = typeof leadInteresseAtributosTable.$inferSelect;
