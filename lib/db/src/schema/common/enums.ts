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
 * E214 — **de qual cláusula a taxa saiu**, e por isso são dois valores.
 *
 * O contrato de locação trata a devolução suja e a devolução danificada em
 * cláusulas SEPARADAS, com réguas de forma diferente:
 *
 * - **LIMPEZA** é a **14ª**: sujeira extraordinária que sai com lavagem (tinta,
 *   esmalte, vômito, sangue, barra com terra). Faixa ABSOLUTA — R$ 350,00 a
 *   R$ 2.500,00 —, que não depende de peça nem de contrato.
 * - **DANO** é a **15ª**: rasgo, queimadura, e também a mancha que **não sai**
 *   com lavagem, que a própria 15ª puxa para si. Teto RELATIVO: cinco vezes o
 *   aluguel **daquela peça**.
 *
 * Sem a coluna, `custo_reparo` era um número sem cláusula, e conferir era
 * impossível: não há como dizer se R$ 400,00 cabe sem saber qual das duas
 * réguas o rege.
 *
 * **O default é DANO**, e a escolha é a das linhas que já existem: a tabela se
 * chama `avarias` e a coluna, `custo_reparo` — uma linha gravada antes deste
 * épico é registro de dano. Também é o valor que não acusa ninguém
 * retroativamente: o DANO não tem piso, então nenhuma avaria antiga passa a
 * estar "abaixo dos R$ 350,00" por causa da migração.
 */
export const avariaTipoEnum = pgEnum("avaria_tipo", ["LIMPEZA", "DANO"]);

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
/**
 * De onde a linha de cobrança veio.
 *
 * `REAJUSTE_DATA` nasceu no E211: a cláusula 17ª §§2º e 3º do contrato manda
 * reajustar o total quando a noiva move o casamento para o ano seguinte, e o
 * reajuste entra como parcela própria — não engorda `valorTotal` — pelo mesmo
 * desenho da AVARIA, para aparecer na cobrança e na comissão como qualquer
 * outro dinheiro, e para a origem dizer por que ele existe.
 */
/**
 * `ATRASO_DEVOLUCAO` nasceu no E212: a cláusula 16ª e seus dois parágrafos
 * cobram a peça que não voltou na data — diária + multa até o nono dia, 4× o
 * aluguel a partir do décimo, que o contrato chama de EXTRAVIO. O sistema já
 * enxergava o atraso (o motivo homônimo em `disponibilidade.ts`) e nunca o
 * cobrava; a origem é o que faz a linha dizer de onde ela veio.
 *
 * **Uma origem para as duas faixas, e não duas.** Elas são cláusulas
 * diferentes, mas o FATO é o mesmo — a peça não voltou —, e a origem responde
 * "de onde esta cobrança veio". Qual das duas faixas incidiu está na descrição
 * da parcela e na trilha, que é onde a régua mora.
 */
/**
 * `MORA` nasceu no E213: a multa de 2% e os juros de 1% ao mês da cláusula 9ª.
 *
 * **Ela é a única origem que não nasce de um gesto de cobrar — nasce de
 * RECEBER.** A conta da mora é derivada (cresce todo dia, e gravá-la estaria
 * errado na meia-noite seguinte), mas conta derivada não sobrevive ao pagamento
 * do principal: quem paga R$ 500,00 de uma dívida de R$ 515,00 zera o saldo
 * aberto, e com ele o acréscimo que era devido. Medido, e é o buraco que a
 * decisão da dona fechou: a parcela ficava PARCIAL devendo R$ 15,00 que o
 * sistema dizia não existir.
 *
 * A escolha (13/08/2026) foi **quitar no principal e cristalizar o que for
 * efetivamente recebido a mais**: os R$ 15,00 viram esta linha, PAGA, com a
 * conta na descrição. O dinheiro da multa passa a ser rastreável no carnê, no
 * caixa e na comissão como qualquer outro — e quem recebeu só o principal deu
 * quitação, que é o que o balcão faz.
 */
export const parcelaOrigemEnum = pgEnum("parcela_origem", ["PLANO", "AVULSA", "AVARIA", "REAJUSTE_DATA", "ATRASO_DEVOLUCAO", "MORA"]);

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
