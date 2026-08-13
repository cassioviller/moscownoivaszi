-- E211 — o reajuste da troca de data (contrato, cláusula 17ª §§ 2º e 3º).
--
-- > §2º — As trocas de datas para o ano seguinte sofrerão reajuste automático
-- > de 10% do valor total do contrato.
-- > §3º — A partir da segunda troca haverá reajuste de 20% e 30% na terceira.
--
-- Duas mudanças, e as duas são pequenas de propósito.
--
-- 1. `parcela_origem` ganha REAJUSTE_DATA. O reajuste entra como PARCELA, não
--    como aumento de `contratos.valor_total`, pelo mesmo desenho que a AVARIA
--    já usa: assim ele aparece na cobrança, no extrato e na comissão como
--    qualquer outro dinheiro, e a ORIGEM diz por que ele existe. Engordar
--    `valor_total` faria a base do próximo reajuste crescer sozinha — a
--    cláusula diz "do valor total do contrato", e o contrato é o que foi
--    assinado, não o que já foi reajustado.
--
-- 2. `contratos.reajustes_de_data` conta quantas trocas já foram COBRADAS.
--    É o degrau da escada. Coluna, e não contagem da trilha de auditoria, para
--    a cobrança não depender do formato de um `detalhe` JSON que existe para
--    narrar a história — a trilha continua narrando; a coluna responde "qual é
--    o próximo degrau".
--
--    Ela conta o COBRADO, não o movido: troca dentro do mesmo ano não incide e
--    não anda a escada.
--
-- Nasce em 0 para todo mundo, e é o comportamento certo: nenhuma troca foi
-- cobrada antes deste épico, então todo contrato existente começa no primeiro
-- degrau. Não se cobra retroativamente o que não foi acordado na hora.
--
-- Idempotente: `IF NOT EXISTS` nos dois.

-- 1) O valor novo do enum. `IF NOT EXISTS` existe em ADD VALUE desde o PG 12.
ALTER TYPE parcela_origem ADD VALUE IF NOT EXISTS 'REAJUSTE_DATA';

-- 2) O contador do degrau.
ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS reajustes_de_data integer NOT NULL DEFAULT 0;

-- Conferência (deve devolver a linha do enum e a coluna):
--   SELECT unnest(enum_range(NULL::parcela_origem));
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'contratos' AND column_name = 'reajustes_de_data';
