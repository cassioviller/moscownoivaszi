-- S-O10 — o "sim" da noiva vira CARIMBO no lead, não coluna do funil.
--
-- A decisão: o aceite não muda ONDE a noiva está (ela segue negociando até o
-- contrato existir) — muda o que a loja tem de fazer. Uma etapa "ACEITO" seria
-- a décima segunda coluna de um kanban que já se arrasta em onze no celular, e
-- não mexeria no número de conversão, que conta a partir de CONTRATO_FECHADO
-- porque aceite não é venda enquanto o vestido ainda pode sair para outra.
--
-- Vira o que `orcamento_aberto_em` e `contrato_fechado_em` já são: um instante.
-- É ele que acende o selo "Aceitou — falta o contrato" no card do funil, e dele
-- sai "do sim ao contrato leva quantos dias" — a medida agregada que faltava,
-- sem tocar no enum de etapas.
--
-- Nulo = ainda não disse sim, ou aceitou antes desta coluna. SEM BACKFILL de
-- propósito: o `aceito_em` mora no ORÇAMENTO e é de lá que a história antiga se
-- lê; inventar um carimbo retroativo no lead seria afirmar um instante que
-- ninguém mediu.

ALTER TABLE leads
  ADD COLUMN aceite_em timestamp with time zone;
