import { pgTable, text, timestamp, decimal, integer, index, unique, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lojasTable } from "./loja";
import { contratosTable } from "./contratos";
import { usuariosTable } from "./usuarios";
import { leadsTable } from "./leads";
import { parcelaStatusEnum, parcelaOrigemEnum, formaPagamentoEnum, contaPagarTipoEnum, contaPagarStatusEnum } from "./common/enums";

export const parcelasTable = pgTable("parcelas", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  contratoId: text("contrato_id").notNull().references(() => contratosTable.id, { onDelete: "cascade" }),
  numero: integer("numero").notNull(), // 0 = entrada/sinal; 1..N parcelas
  /**
   * S26 — de onde esta linha veio. Ver `parcelaOrigemEnum`.
   *
   * É o que responde "este contrato já tem carnê?" sem perguntar "existe
   * alguma parcela?", que era a pergunta errada: o reparo de avaria cobrado
   * antes do parcelamento trancava o contrato em 409 para sempre.
   *
   * O `numero` continua sendo ORDENAÇÃO, e `numero === 0` continua sendo a
   * entrada — seis pontos leem essa régua (as três telas, o portal, a
   * conciliação e o PDF do contrato). Por isso o carnê nasce sempre em 0..N e
   * quem se desloca, quando a ordem do balcão inverte, é o que não é carnê.
   */
  origem: parcelaOrigemEnum("origem").notNull().default("AVULSA"),
  descricao: text("descricao"),
  valorPrevisto: decimal("valor_previsto", { precision: 10, scale: 2, mode: "number" }).notNull(),
  vencimento: timestamp("vencimento", { withTimezone: true }).notNull(),
  status: parcelaStatusEnum("status").notNull().default("PREVISTA"),
  valorRecebido: decimal("valor_recebido", { precision: 10, scale: 2, mode: "number" }),
  recebidoEm: timestamp("recebido_em", { withTimezone: true }),
  formaRecebimento: formaPagamentoEnum("forma_recebimento"),
  // F32/E103: quando este recebimento casou com uma linha do extrato do banco.
  // NÃO é `pagamentos.enviado_contabilidade_em` — conciliar é "bateu com o
  // banco", enviar é "declarei à contabilidade", e um existe sem o outro nas
  // duas direções. O ESTORNO limpa: movimento que deixou de existir não pode
  // continuar conferido.
  conciliadoEm: timestamp("conciliado_em", { withTimezone: true }),
  // F34/E103: quando este RECEBIMENTO foi declarado à contabilidade. Irmã de
  // `pagamentos.enviado_contabilidade_em` — sem ela, fechar o mês carimbava só
  // as saídas. O ESTORNO LIMPA (E115): este carimbo é operacional — é o
  // `isNull` dele que decide o próximo envio —, e mantê-lo deixava um
  // recebimento estornado e re-lançado fora de TODO pacote futuro (o de julho
  // saía R$ 1.000,00 menor que o DRE de julho, sem aviso). O que a contadora
  // já recebeu é fato histórico e mora na trilha (RECEBIMENTO_ESTORNADO), não
  // aqui. A versão anterior deste comentário dizia o contrário e não via esse
  // custo.
  //
  // E252 (S-R6): passa a ser DERIVADA para a parcela recebida em pedaços — ela
  // recebe o instante quando todos os atos válidos estão declarados em
  // `envio_contabilidade_de_recebimentos`. A coluna FICA (o índice parcial das
  // não enviadas e a parcela SEM ato dependem dela), e o pedaço novo numa
  // parcela já declarada entra no pacote seguinte SEM redeclarar o antigo —
  // que é por que o carimbo não se limpa aqui, ao contrário do `conciliadoEm`.
  enviadoContabilidadeEm: timestamp("enviado_contabilidade_em", { withTimezone: true }),
  /**
   * E213 — o PERDÃO da multa e dos juros da cláusula 9ª.
   *
   * **O que o banco guarda é o perdão, e não a conta.** A mora é derivada a
   * cada leitura (`financeiro-core/mora.ts`), pela mesma razão do `estaAtrasada`
   * que ela estende: o valor cresce todo dia, e uma coluna com o acréscimo
   * estaria errada a partir da meia-noite seguinte. O perdão, ao contrário, é
   * um FATO datado — alguém decidiu, num dia, não cobrar.
   *
   * A decisão da dona (13/08/2026) foi **automático com gesto de perdoar**: o
   * contrato diz *"deverá incidir"*, então o padrão é cumprir a cláusula, e
   * quem quiser abrir mão diz por quê. O motivo fica AQUI, e não só na trilha,
   * pela lição do E214: se ficasse só na trilha, a próxima leitura da cobrança
   * veria uma parcela vencida sem acréscimo e sem explicação ao lado — e é por
   * este campo que a tela desenha o selo.
   *
   * Perdoar é reversível (basta limpar as duas), e a trilha guarda as duas
   * pontas: `MORA_PERDOADA` e `MORA_RESTABELECIDA`.
   */
  moraPerdoadaEm: timestamp("mora_perdoada_em", { withTimezone: true }),
  moraPerdoadaMotivo: text("mora_perdoada_motivo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // gerar-plano checa "já tem parcela?" e insere, sem rede: dois POSTs
  // simultâneos passam ambos e dobram o plano. Um contrato não tem dois números
  // iguais — o segundo insert do número 0 colide e vira 409.
  numeroUnico: unique().on(t.contratoId, t.numero),
  // B10/E91: toda query começa em `loja_id = ?` e segue por uma faixa de data.
  // O Postgres NÃO cria índice para FK — sem estes dois, o fluxo, o DRE, o
  // alerta de caixa (chamado pelo sino a cada poll) e o dashboard varrem a
  // tabela inteira de TODAS as lojas para responder por uma.
  lojaVencimentoIdx: index("parcelas_loja_vencimento_idx").on(t.lojaId, t.vencimento),
  lojaRecebidoEmIdx: index("parcelas_loja_recebido_em_idx").on(t.lojaId, t.recebidoEm),
  // F32: o filtro "só o não conciliado" abre por loja + data e descarta o resto.
  // Índice PARCIAL (o idioma de `contas_pagar_recorrencia_unica`): ele guarda só
  // o que a query procura, e encolhe conforme o mês fecha.
  naoConciliadasIdx: index("parcelas_nao_conciliadas_idx")
    .on(t.lojaId, t.recebidoEm)
    .where(sql`conciliado_em IS NULL`),
  naoEnviadasIdx: index("parcelas_nao_enviadas_idx")
    .on(t.lojaId, t.recebidoEm)
    .where(sql`enviado_contabilidade_em IS NULL`),
}));

export const insertParcelaSchema = createInsertSchema(parcelasTable).omit({ createdAt: true });
export type InsertParcela = z.infer<typeof insertParcelaSchema>;
export type Parcela = typeof parcelasTable.$inferSelect;

export const contasPagarTable = pgTable("contas_pagar", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  tipo: contaPagarTipoEnum("tipo").notNull(),
  colaboradorId: text("colaborador_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  competencia: text("competencia"), // "YYYY-MM"
  descricao: text("descricao").notNull(),
  categoria: text("categoria"),
  fornecedor: text("fornecedor"),
  valorPrevisto: decimal("valor_previsto", { precision: 10, scale: 2, mode: "number" }).notNull(),
  vencimento: timestamp("vencimento", { withTimezone: true }).notNull(),
  status: contaPagarStatusEnum("status").notNull().default("PREVISTA"),
  recorrenciaId: text("recorrencia_id"), // rastro da geração recorrente (será ref dps se necessário)
  origemComissaoFechamentoId: text("origem_comissao_fechamento_id"), // rastro da comissão (será ref dps)
  // E217 (tipo DEVOLUCAO): qual contrato rescindido gerou esta dívida da loja.
  // `set null` porque a conta é o rastro financeiro — apagar o contrato não
  // pode apagar uma dívida já lançada.
  origemContratoId: text("origem_contrato_id").references(() => contratosTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // A idempotência da geração não pode depender só do check-then-insert da rota:
  // dois POSTs simultâneos leem "nada feito" e ambos inserem, pagando todo mundo
  // em dobro. Este é o backstop no banco — uma recorrência rende no máximo UMA
  // conta por competência+loja.
  //
  // O predicado era `tipo = 'SALARIO'` (E48): a despesa recorrente nasceria sem
  // a rede que protegia o salário. `recorrencia_id IS NOT NULL` cobre toda conta
  // GERADA, de qualquer tipo, e continua deixando de fora a lançada à mão.
  recorrenciaUnica: uniqueIndex("contas_pagar_recorrencia_unica")
    .on(t.lojaId, t.competencia, t.recorrenciaId)
    .where(sql`${t.recorrenciaId} is not null`),
  // B10/E91: o recorte de "o que vence" abre por loja + vencimento.
  lojaVencimentoIdx: index("contas_pagar_loja_vencimento_idx").on(t.lojaId, t.vencimento),
}));

export const insertContaPagarSchema = createInsertSchema(contasPagarTable).omit({ createdAt: true });
export type InsertContaPagar = z.infer<typeof insertContaPagarSchema>;
export type ContaPagar = typeof contasPagarTable.$inferSelect;

export const pagamentosTable = pgTable("pagamentos", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  colaboradorId: text("colaborador_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  data: timestamp("data", { withTimezone: true }).notNull(),
  valorPago: decimal("valor_pago", { precision: 10, scale: 2, mode: "number" }).notNull(),
  forma: text("forma"),
  observacoes: text("observacoes"),
  enviadoContabilidadeEm: timestamp("enviado_contabilidade_em", { withTimezone: true }),
  /** F32/E103: casou com o extrato do banco. O estorno limpa. */
  conciliadoEm: timestamp("conciliado_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // B10/E91: a saída de caixa é lida por loja + dia em fluxo, DRE e alerta.
  lojaDataIdx: index("pagamentos_loja_data_idx").on(t.lojaId, t.data),
  naoConciliadosIdx: index("pagamentos_nao_conciliados_idx")
    .on(t.lojaId, t.data)
    .where(sql`conciliado_em IS NULL`),
}));

export const insertPagamentoSchema = createInsertSchema(pagamentosTable).omit({ createdAt: true });
export type InsertPagamento = z.infer<typeof insertPagamentoSchema>;
export type Pagamento = typeof pagamentosTable.$inferSelect;

export const pagamentoItensTable = pgTable("pagamento_itens", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  pagamentoId: text("pagamento_id").notNull().references(() => pagamentosTable.id, { onDelete: "cascade" }),
  contaPagarId: text("conta_pagar_id").notNull().unique().references(() => contasPagarTable.id, { onDelete: "cascade" }),
  valor: decimal("valor", { precision: 10, scale: 2, mode: "number" }).notNull(),
}, (t) => ({
  // B10/E91: toda montagem de extrato faz o join por `pagamento_id`.
  pagamentoIdx: index("pagamento_itens_pagamento_idx").on(t.pagamentoId),
}));

export const insertPagamentoItemSchema = createInsertSchema(pagamentoItensTable);
export type InsertPagamentoItem = z.infer<typeof insertPagamentoItemSchema>;
export type PagamentoItem = typeof pagamentoItensTable.$inferSelect;

/**
 * O que se repete todo mês e vira conta a pagar sozinho.
 *
 * Nasceu como `salarios_recorrentes` e só sabia pagar GENTE (E48): aluguel,
 * assinatura e fornecedor fixo eram relançados à mão toda competência, ao lado
 * de um motor de recorrência idempotente que já existia inteiro e não os
 * enxergava. Generalizar custou uma coluna `tipo` e um `usuario_id` opcional —
 * duplicar o motor teria custado a segunda implementação da idempotência.
 *
 * `tipo` espelha `contaPagarTipoEnum` mas é TEXTO, não o enum: a recorrência
 * gera SALARIO/DESPESA/FORNECEDOR e nunca COMISSAO (que nasce do fechamento,
 * não de um combinado mensal) — o pgEnum aqui prometeria um caminho que a
 * geração não tem.
 */
export const recorrenciasTable = pgTable("recorrencias", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  /** Só SALARIO tem colaborador; aluguel não é de ninguém. */
  usuarioId: text("usuario_id").references(() => usuariosTable.id, { onDelete: "cascade" }),
  /** O que a conta gerada vai dizer. SALARIO deriva do nome de quem recebe. */
  descricao: text("descricao"),
  categoria: text("categoria"),
  fornecedor: text("fornecedor"),
  valor: decimal("valor", { precision: 10, scale: 2, mode: "number" }).notNull(),
  diaVencimento: integer("dia_vencimento").notNull().default(5),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  // Dois salários ATIVOS para a mesma pessoa geram duas contas na mesma
  // competência (o dedup do núcleo só olha o que já foi feito, não o lote). Um
  // usuário tem no máximo um salário ativo por loja; desativar libera cadastrar
  // outro sem apagar o histórico. Parcial em `ativo` para o inativo não trancar.
  //
  // `usuario_id is not null` não muda o comportamento (NULLs já são distintos
  // num unique btree) — está aqui para o índice não LER como se restringisse
  // despesa: a loja pode ter dois aluguéis ativos, e isso é assunto dela.
  salarioAtivoUnico: uniqueIndex("recorrencias_salario_ativo_unico")
    .on(t.lojaId, t.usuarioId)
    .where(sql`${t.ativo} = true and ${t.usuarioId} is not null`),
}));

export const insertRecorrenciaSchema = createInsertSchema(recorrenciasTable).omit({ createdAt: true, updatedAt: true });
export type InsertRecorrencia = z.infer<typeof insertRecorrenciaSchema>;
export type Recorrencia = typeof recorrenciasTable.$inferSelect;

/**
 * O saldo de caixa conferido num DIA — a âncora da projeção.
 *
 * Era chaveado por competência (YYYY-MM), o que não responde à pergunta que a
 * projeção faz: "quanto tem em caixa HOJE?". Um saldo de julho não diz de qual
 * dia de julho ele é, e a curva partia de um nível que já embutia (ou não) os
 * movimentos do mês. `dataReferencia` é um instante ancorado ao meio-dia local
 * do dia conferido — mesma convenção de `vencimento`.
 */
export const saldosReferenciaTable = pgTable("saldos_referencia", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  dataReferencia: timestamp("data_referencia", { withTimezone: true }).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2, mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  // Um saldo por dia: conferir duas vezes o mesmo dia é corrigir, não empilhar.
  unq: unique().on(t.lojaId, t.dataReferencia),
}));

export const insertSaldoReferenciaSchema = createInsertSchema(saldosReferenciaTable).omit({ createdAt: true, updatedAt: true });
export type InsertSaldoReferencia = z.infer<typeof insertSaldoReferenciaSchema>;
export type SaldoReferencia = typeof saldosReferenciaTable.$inferSelect;

export const registrosCobrancaTable = pgTable("registros_cobranca", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  contatoData: timestamp("contato_data", { withTimezone: true }).notNull().defaultNow(),
  canal: text("canal").notNull(),
  observacao: text("observacao"),
  vendedorId: text("vendedor_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // S-M27 (rodada 2, achado 9#1): o Postgres NÃO cria índice para FK — a
  // regra do B10/E91, que fechou a classe em parcelas/contratos/leads e
  // deixou esta tabela de fora. `ultimoContatoPorLead` filtra por lead_id em
  // CINCO pontos quentes (toda página de /noivas, o sino a cada 5 min, a
  // lista de parcelas, o detalhe do lead) e o funil dispara 12 varreduras da
  // tabela inteira num render. A tabela só cresce — um clique de cobrança
  // por linha.
  leadIdx: index("registros_cobranca_lead_idx").on(t.leadId),
  lojaIdx: index("registros_cobranca_loja_idx").on(t.lojaId),
}));

export const insertRegistroCobrancaSchema = createInsertSchema(registrosCobrancaTable).omit({ createdAt: true });
export type InsertRegistroCobranca = z.infer<typeof insertRegistroCobrancaSchema>;
export type RegistroCobranca = typeof registrosCobrancaTable.$inferSelect;

/**
 * **E235 (S-C51, respondida em 15/08/2026: a conciliação enxerga cada PAGAMENTO)
 * — o carimbo "casou com o extrato" por ATO de recebimento.**
 *
 * `parcelas.conciliado_em` é coluna por linha, e a parcela paga em dois PIX
 * (R$ 300,00 em 01/03 e R$ 700,00 em 15/03) é UMA linha: marcar um pedaço
 * marcaria o outro, e a conciliação existe para NÃO esconder divergência.
 * Desde o E221 cada recebimento é uma linha `PARCELA_RECEBIDA` na trilha, e o
 * caixa já data cada pedaço por ela (S-C31, `porRecebimento`). Esta tabela
 * guarda a conferência de cada um desses atos: `ato_id` é o id da linha da
 * trilha — o mesmo número que o recibo cita.
 *
 * O que ela NÃO é: a "terceira verdade sobre o mesmo dinheiro" que o E221
 * recusou. Ela não tem valor, não soma nada e ninguém a concilia — é um fato
 * sobre a CONFERÊNCIA, não sobre o dinheiro. `parcelas.conciliado_em` FICA e
 * passa a ser DERIVADO para a parcela dividida ("todos os atos carimbados"),
 * de modo que o índice parcial das não conciliadas continue barato e a
 * parcela sem ato (o legado, o seed) continue sendo carimbada como sempre.
 *
 * A trilha não é apagada em lugar nenhum (medido: zero `delete(auditLogTable)`
 * fora de teste), então `ato_id` não fica órfão. O ESTORNO corta a trilha da
 * parcela (`recibosDaParcela` só conta atos depois do corte): o carimbo de um
 * ato cortado deixa de ter movimento a que se referir e não é lido — o mesmo
 * efeito de "o estorno limpa" que a coluna da parcela já tinha.
 */
export const conciliacaoDeRecebimentosTable = pgTable("conciliacao_de_recebimentos", {
  /** O id da linha `PARCELA_RECEBIDA` da trilha (`audit_log.id`). */
  atoId: text("ato_id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  parcelaId: text("parcela_id").notNull().references(() => parcelasTable.id, { onDelete: "cascade" }),
  conciliadoEm: timestamp("conciliado_em", { withTimezone: true }).notNull().defaultNow(),
  conciliadoPor: text("conciliado_por"),
}, (t) => ({
  lojaIdx: index("conciliacao_de_recebimentos_loja_idx").on(t.lojaId),
  parcelaIdx: index("conciliacao_de_recebimentos_parcela_idx").on(t.parcelaId),
}));

/**
 * **E252 (S-R6) — o carimbo "declarei à contabilidade" por ATO de recebimento.**
 *
 * Irmã de `conciliacao_de_recebimentos`, e pelo mesmo motivo: a parcela recebe
 * em pedaços e `parcelas.enviado_contabilidade_em` é coluna POR LINHA. Uma
 * parcela declarada com R$ 400,00 e completada depois com R$ 600,00 já tem o
 * carimbo, e o `isNull` do próximo envio (`contabilidade/enviar`) a exclui —
 * **os R$ 600,00 não entram em pacote nenhum.** Dinheiro recebido que nunca é
 * declarado.
 *
 * **E o conserto óbvio — limpar o carimbo quando chega pedaço novo, que é o
 * que o A6 fez com `conciliado_em` — está ERRADO aqui.** Os dois carimbos não
 * são o mesmo fato: conferir é repetível (a conferência de um pedaço novo é
 * trabalho novo), e DECLARAR é de mão única. Limpar o carimbo faz a parcela
 * INTEIRA voltar ao pacote seguinte e declara os R$ 400,00 duas vezes:
 * R$ 1.400,00 declarados sobre R$ 1.000,00 recebidos.
 *
 * Por isso a unidade é o ATO: `ato_id` é o id da linha `PARCELA_RECEBIDA` da
 * trilha — o mesmo número que o recibo da cláusula 7ª cita e que a
 * `conciliacao_de_recebimentos` carimba. Cada recebimento é declarado UMA vez,
 * e `parcelas.enviado_contabilidade_em` FICA, **derivado**: recebe o instante
 * quando todos os atos válidos da parcela estão declarados. A coluna continua
 * servindo ao índice parcial das não enviadas e à parcela SEM ato (o legado, o
 * seed), que segue sendo carimbada direto — e o carimbo dela declara junto os
 * atos que ela tiver, senão o pedaço já declarado voltaria no pacote seguinte.
 *
 * O ESTORNO corta a trilha da parcela (`recibosDaParcela` só conta atos depois
 * do corte), e o carimbo de um ato cortado deixa de ter movimento a que se
 * referir: o recebimento re-lançado depois do estorno nasce como ato NOVO, sem
 * linha aqui, e entra no pacote seguinte. É o mesmo efeito que o E115 obteve
 * limpando a coluna da parcela no estorno — que continua acontecendo.
 */
export const envioContabilidadeDeRecebimentosTable = pgTable("envio_contabilidade_de_recebimentos", {
  /** O id da linha `PARCELA_RECEBIDA` da trilha (`audit_log.id`). */
  atoId: text("ato_id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  parcelaId: text("parcela_id").notNull().references(() => parcelasTable.id, { onDelete: "cascade" }),
  enviadoEm: timestamp("enviado_em", { withTimezone: true }).notNull().defaultNow(),
  enviadoPor: text("enviado_por"),
}, (t) => ({
  lojaIdx: index("envio_contabilidade_de_recebimentos_loja_idx").on(t.lojaId),
  parcelaIdx: index("envio_contabilidade_de_recebimentos_parcela_idx").on(t.parcelaId),
}));

/**
 * **P4 / E237 (decidida em 15/08/2026: a correção da cláusula 9ª é pelo IPCA)
 * — o índice INFORMADO por competência.**
 *
 * O sistema não tem de onde tirar o IPCA sozinho, e não vai buscar em lugar
 * nenhum: a dona digita a variação do mês em Configurações → Índices, e a mora
 * (`financeiro-core/mora.ts`) corrige o saldo pelos meses cheios entre o
 * vencimento e hoje. Mês que não está aqui é mês sem correção — DITO na frase
 * com o mês que falta, nunca inventado. Por loja, como tudo o que a dona
 * configura; `indice` existe para o dia em que houver outro além do IPCA.
 */
export const indicesMonetariosTable = pgTable("indices_monetarios", {
  id: text("id").primaryKey(),
  lojaId: text("loja_id").notNull().references(() => lojasTable.id, { onDelete: "cascade" }),
  indice: text("indice").notNull().default("IPCA"),
  /** "YYYY-MM" — a competência do índice. */
  competencia: text("competencia").notNull(),
  /** A variação do mês, em pontos percentuais (0,42 = 0,42%). */
  variacaoPct: decimal("variacao_pct", { precision: 8, scale: 4, mode: "number" }).notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoPor: text("atualizado_por"),
}, (t) => ({
  umPorMes: unique().on(t.lojaId, t.indice, t.competencia),
}));
