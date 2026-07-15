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

export const leadOrigemEnum = pgEnum("lead_origem", ["LOJA", "WHATSAPP"]);

export const bloqueioTipoEnum = pgEnum("bloqueio_tipo", [
  "RESERVA_CASAMENTO",
  "MANUTENCAO",
]);

export const ajusteStatusEnum = pgEnum("ajuste_status", ["PENDENTE", "FEITO"]);

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

export const orcamentoItemTipoEnum = pgEnum("orcamento_item_tipo", [
  "VESTIDO",
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

export const parcelaStatusEnum = pgEnum("parcela_status", [
  "PREVISTA",
  "PAGA",
  "CANCELADA",
]);

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
