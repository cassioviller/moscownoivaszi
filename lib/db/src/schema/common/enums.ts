import { pgEnum } from "drizzle-orm/pg-core";

export const atributoTipoEnum = pgEnum("atributo_tipo", ["OPCAO_UNICA", "ESCALA"]);

export const leadEtapaEnum = pgEnum("lead_etapa", [
  "NOVO",
  "INTERESSES_PREENCHIDOS",
  "ATENDIMENTO_AGENDADO",
  "EM_ATENDIMENTO",
  "ORCAMENTO_ABERTO",
  "CONTRATO_FECHADO",
  "EM_PROVAS",
  "RETIRADO",
  "CASAMENTO_REALIZADO",
  "DEVOLVIDO",
  "PERDIDO",
]);

// SITE/INSTAGRAM nascem da captação externa (E19) — lead que chega sozinho
// pelo formulário público, sem ninguém digitar na loja.
export const leadOrigemEnum = pgEnum("lead_origem", ["LOJA", "WHATSAPP", "SITE", "INSTAGRAM"]);

// Por que a noiva não fechou — estruturado para o funil responder "onde
// estamos perdendo": preço, data indisponível, concorrente…
export const leadPerdidaMotivoEnum = pgEnum("lead_perdida_motivo", [
  "PRECO",
  "DATA_INDISPONIVEL",
  "CONCORRENTE",
  "DESISTENCIA",
  "SEM_RETORNO",
  "OUTRO",
]);

export const bloqueioTipoEnum = pgEnum("bloqueio_tipo", [
  "RESERVA_CASAMENTO",
  "MANUTENCAO",
]);

export const ajusteStatusEnum = pgEnum("ajuste_status", ["PENDENTE", "FEITO"]);

/**
 * E155 — o que a costureira tem na mão é de duas naturezas.
 *
 * **AJUSTE** é peça existente que se altera: bainha, cintura, alça. **CONFECÇÃO**
 * é peça NOVA, feita para aquela noiva — no caderno de 10–16/08,
 * `Siam + Manga será confeccionada + Mantilha`, e na agenda dois compromissos
 * de 10:30 marcados só para conversar sobre ela (21/07 e 24/07).
 *
 * Elas dividem a mesma fila de propósito: prazo (a próxima prova), status,
 * checklist e a tela que ordena pelo aperto já existem e são os mesmos. Uma
 * tabela `producoes` duplicaria a fila e criaria uma segunda tela para a mesma
 * pessoa. O que muda é o rótulo, e que confecção tem CUSTO — material e mão de
 * obra, que ajuste comum não tem.
 */
export const ajusteTipoEnum = pgEnum("ajuste_tipo", ["AJUSTE", "CONFECCAO"]);

export const reservaStatusEnum = pgEnum("reserva_status", [
  "EM_MONTAGEM",
  "CONFIRMADA",
  "CONCLUIDA",
  "CANCELADA",
]);

export const atendimentoTipoEnum = pgEnum("atendimento_tipo", [
  "ATENDIMENTO",
  "PROVA",
]);

export const atendimentoSituacaoEnum = pgEnum("atendimento_situacao", [
  "AGENDADO",
  "EM_ATENDIMENTO",
  "CONCLUIDO",
  "FALTOU",
]);

export const atendimentoDesfechoEnum = pgEnum("atendimento_desfecho", [
  "RESERVOU",
  "VAI_PENSAR",
  "NAO_SERVIU",
]);

export const orcamentoStatusEnum = pgEnum("orcamento_status", [
  "RASCUNHO",
  "ENVIADO",
  "APROVADO",
  "RECUSADO",
]);

/**
 * E150: **ACESSORIO** entra ao lado de VESTIDO, e a razão é física.
 *
 * O caderno do ateliê numera a peça componente como item do acervo, com ordem
 * própria — na semana de 13–19/07 a mesma noiva ocupa duas linhas, e quem
 * escreveu anotou "(Mesma noiva Dayfini)" ao lado da segunda para explicar a
 * repetição. São 11 conjuntos em 14 semanas (`Bernarda + Bolero Ricca Sposa`,
 * `Kalina + Saiote 2 aros + crinol`, `Tamara + Bolero 2026`…), e o mesmo
 * `Bolero Ricca Sposa` sai em duas semanas distintas para noivas diferentes:
 * é peça que circula, não adjetivo.
 *
 * Sem um tipo próprio, o bolero virava `SERVICO` ou `VESTIDO` com `vestidoId`
 * nulo — e a descrição em texto passava a ser o registro autoritativo, o que
 * significa **nenhuma reserva e nenhum conflito possível**: dois contratos do
 * mesmo sábado podiam vender o mesmo bolero.
 *
 * ACESSORIO se comporta como VESTIDO onde importa: aponta `vestidoId` e o
 * fechamento exige que a peça esteja reservada (`routes/contratos.ts`).
 */
export const orcamentoItemTipoEnum = pgEnum("orcamento_item_tipo", [
  "VESTIDO",
  "ACESSORIO",
  // E154: peça de ESTOQUE — conta-se, não se reserva. Aponta
  // `itemEstoqueId`, nunca `vestidoId`, e por isso a guarda do E150 não a
  // cobra: não há peça única a prender.
  "ESTOQUE",
  "SERVICO",
  "AJUSTE",
]);

export const descontoTipoEnum = pgEnum("desconto_tipo", ["PERCENTUAL", "VALOR"]);

export const contratoStatusEnum = pgEnum("contrato_status", ["ATIVO", "CANCELADO"]);

export const formaPagamentoEnum = pgEnum("forma_pagamento", [
  "PIX",
  "CARTAO_CREDITO",
  "CARTAO_DEBITO",
  "DINHEIRO",
  "BOLETO",
  "TRANSFERENCIA",
  "OUTRO",
]);

/**
 * PARCIAL (E49) fica ENTRE prevista e paga: a noiva pagou parte, o dinheiro
 * entrou no caixa e o resto continua devido. Antes o status era binário, então
 * meio pagamento ou sumia do "a receber" (marcado PAGA, faltando dinheiro) ou
 * ficava 100% aberto (o que entrou não aparecia no caixa). Não é um estado
 * gravado à toa: quem decide é o saldo (`valorRecebido` vs `valorPrevisto`), e
 * a régua de leitura mora em financeiro-core (`estaAberta`/`saldoAberto`).
 */
export const parcelaStatusEnum = pgEnum("parcela_status", [
  "PREVISTA",
  "PARCIAL",
  "PAGA",
  "CANCELADA",
]);

/**
 * S26 — de onde a parcela veio, que é o que ninguém sabia responder.
 *
 * O guard do `gerar-plano` perguntava *"este contrato já tem carnê?"* e olhava
 * `parcelas.length > 0` — QUALQUER parcela. Cobrado um reparo de avaria antes
 * de montar o parcelamento, o contrato ficava em `409 JA_TEM_PLANO` **para
 * sempre**, e a venda inteira era parcelada fora do sistema.
 *
 * A pergunta não era dedutível do dado: carnê, taxa avulsa e reparo eram todas
 * "uma parcela com um número". `PLANO` é o carnê (a série que
 * `montarPlanoParcelas` emite, e que existe **uma vez** por contrato); `AVARIA`
 * é o reparo cobrado, que já tem coluna própria do outro lado
 * (`avarias.parcela_id`); `AVULSA` é o resto — taxa, acerto, o que a loja
 * lançar à mão.
 *
 * O default é `AVULSA` de propósito: é o que uma linha inserida por quem não
 * conhece esta régua deve ser, e é a única das três que não tem consequência.
 */
export const parcelaOrigemEnum = pgEnum("parcela_origem", ["PLANO", "AVULSA", "AVARIA"]);

export const contaPagarTipoEnum = pgEnum("conta_pagar_tipo", [
  "DESPESA",
  "FORNECEDOR",
  "SALARIO",
  "COMISSAO",
]);

export const contaPagarStatusEnum = pgEnum("conta_pagar_status", [
  "PREVISTA",
  "PAGA",
]);
