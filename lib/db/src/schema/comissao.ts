import { pgTable, text, timestamp, decimal, unique, boolean, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { usuariosTable } from "./usuarios";
import { contasPagarTable } from "./financeiro";

/**
 * Comissão por VENDEDORA, versionada no tempo.
 *
 * O modelo anterior tinha faixas globais e planas (`minimoVenda` + `percentual`)
 * para a loja inteira: não sabia dizer "a Ana ganha 5% e a Bia 6%", nem mudar a
 * regra de alguém a partir de março sem reescrever o passado. Agora a regra é
 * de uma vendedora e vale a partir de uma `vigenciaInicio` — fechar um mês
 * antigo continua usando a regra que valia naquele mês.
 */
export const comissaoRegrasTable = pgTable("comissao_regras", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  // restrict (E91/B2): a escada versionada é o que EXPLICA cada fechamento
  // passado. Apagá-la junto com a pessoa deixaria o valor pago sem régua.
  vendedoraId: text("vendedora_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  /** A regra passa a valer deste dia em diante; a mais recente já iniciada vence. */
  vigenciaInicio: timestamp("vigencia_inicio", { withTimezone: true }).notNull(),
  /** Ligado: os bônus dos degraus já vencidos se somam. Desligado: só o da faixa final. */
  bonusAcumulaFaixas: boolean("bonus_acumula_faixas").notNull().default(false),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  // Uma regra por vendedora por vigência: redefinir a mesma data é corrigir.
  unq: unique().on(t.lojaId, t.vendedoraId, t.vigenciaInicio),
  porVendedora: index("comissao_regras_vendedora_vigencia_idx").on(t.lojaId, t.vendedoraId, t.vigenciaInicio),
}));

export const insertComissaoRegraSchema = createInsertSchema(comissaoRegrasTable).omit({ createdAt: true, updatedAt: true });
export type InsertComissaoRegra = z.infer<typeof insertComissaoRegraSchema>;
export type ComissaoRegra = typeof comissaoRegrasTable.$inferSelect;

/**
 * Um degrau da escada. `minAcumulado` é inclusivo, `maxAcumulado` exclusivo
 * (null = topo aberto, sem teto de comissão). A faixa paga percentual, bônus,
 * ou os dois — o motor recusa uma que não pague nada.
 *
 * `lojaId` é carimbo de tenant: a faixa já pertence a uma regra que pertence a
 * uma loja, mas repetir aqui deixa toda query escopar por loja sem join.
 */
export const comissaoFaixasTable = pgTable("comissao_faixas", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  regraId: text("regra_id").notNull().references(() => comissaoRegrasTable.id, { onDelete: "cascade" }),
  minAcumulado: decimal("min_acumulado", { precision: 10, scale: 2, mode: "number" }).notNull(),
  maxAcumulado: decimal("max_acumulado", { precision: 10, scale: 2, mode: "number" }),
  percentual: decimal("percentual", { precision: 5, scale: 2, mode: "number" }),
  bonusFixo: decimal("bonus_fixo", { precision: 10, scale: 2, mode: "number" }),
}, (t) => ({
  porRegra: index("comissao_faixas_regra_idx").on(t.regraId),
}));

export const insertComissaoFaixaSchema = createInsertSchema(comissaoFaixasTable);
export type InsertComissaoFaixa = z.infer<typeof insertComissaoFaixaSchema>;
export type ComissaoFaixa = typeof comissaoFaixasTable.$inferSelect;

/**
 * O mês fechado de uma vendedora — o registro de quanto foi apurado e por quê.
 *
 * Guarda a memória do cálculo (`percentualAplicado`, `valorComissao`,
 * `valorBonus`), e não só o total: seis meses depois, "por que esse mês pagou
 * isso?" precisa ter resposta sem reconstituir as faixas da época.
 *
 * `unique(loja, vendedora, competencia)` é o que torna o fechamento IDEMPOTENTE:
 * rodar de novo pula quem já fechou, em vez de pagar duas vezes.
 */
export const comissaoFechamentosTable = pgTable("comissao_fechamentos", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  // restrict (E91/B2): o fechamento é dinheiro que a loja PAGOU. Ele não pode
  // sumir porque o cadastro de quem recebeu foi excluído.
  vendedoraId: text("vendedora_id").notNull().references(() => usuariosTable.id, { onDelete: "restrict" }),
  competencia: text("competencia").notNull(), // "YYYY-MM"
  /** Base líquida já com o estorno §6.4 abatido. Nunca negativa. */
  totalVendas: decimal("total_vendas", { precision: 10, scale: 2, mode: "number" }).notNull(),
  percentualAplicado: decimal("percentual_aplicado", { precision: 5, scale: 2, mode: "number" }),
  valorComissao: decimal("valor_comissao", { precision: 10, scale: 2, mode: "number" }).notNull(),
  valorBonus: decimal("valor_bonus", { precision: 10, scale: 2, mode: "number" }).notNull().default(0),
  /** = comissão + bônus. É este que vira ContaPagar. */
  valorTotal: decimal("valor_total", { precision: 10, scale: 2, mode: "number" }).notNull(),
  contaPagarId: text("conta_pagar_id").unique().references(() => contasPagarTable.id, { onDelete: "set null" }),
  /**
   * Quais contratos cancelados ESTE fechamento reconciliou (E54).
   *
   * Sem a lista, reabrir não teria como devolver `comissaoEstornadaEm` a NULL
   * com precisão: dois fechamentos da mesma vendedora em competências
   * diferentes carimbam instantes parecidos, e desfazer "pelo horário" pegaria
   * o estorno do fechamento errado. NULL = fechamento anterior ao E54, que não
   * guardou a lista; `[]` = não havia estorno a reconciliar.
   */
  estornoContratoIds: jsonb("estorno_contrato_ids").$type<string[]>(),
  fechadoEm: timestamp("fechado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq: unique().on(t.lojaId, t.vendedoraId, t.competencia),
}));

export const insertComissaoFechamentoSchema = createInsertSchema(comissaoFechamentosTable).omit({ fechadoEm: true });
export type InsertComissaoFechamento = z.infer<typeof insertComissaoFechamentoSchema>;
export type ComissaoFechamento = typeof comissaoFechamentosTable.$inferSelect;
