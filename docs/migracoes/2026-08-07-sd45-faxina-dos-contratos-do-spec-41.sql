-- S-D45 — a faxina dos contratos que o spec 41 cancelava em vez de apagar.
--
-- `41-colocacao-comissao.spec.ts` marcava `status: "CANCELADO"` no afterAll —
-- correto para tirar as vendas do ranking e das pendências (E53), mas as
-- linhas ficavam: dois contratos e dois leads por passada, para sempre. O
-- conserto de código entra no mesmo commit que esta faxina: o afterAll passa
-- a apagar contratos → leads, a mesma forma da S-D25 nas cabines.
--
-- Medido em 2026-08-07, antes desta faxina:
--   300 contratos `E2E Colocacao %`, TODOS CANCELADO (eram 274 no dia 06 —
--       a taxa de +2 por passada seguiu pagando: 13 passadas em um dia)
--   300 leads, um por contrato
--   ZERO em tudo que pendura: parcelas, contrato_itens, contrato_bloqueios,
--        orcamentos, atendimentos — o spec só cria lead e contrato
--   ZERO leads `E2E Colocacao %` sem contrato, ZERO contratos não-CANCELADO
--
-- A guarda é tripla, como a sobra pediu: assinatura do spec no NOME do lead,
-- status CANCELADO, e nenhuma parcela (dinheiro real fica, para olho humano).
-- Contratos saem antes dos leads porque `contratos.lead_id` é RESTRICT.

BEGIN;

WITH alvo AS (
  SELECT c.id AS contrato_id, c.lead_id
  FROM contratos c
  JOIN leads l ON l.id = c.lead_id
  WHERE l.noiva_nome LIKE 'E2E Colocacao %'
    AND c.status = 'CANCELADO'
    AND NOT EXISTS (SELECT 1 FROM parcelas p WHERE p.contrato_id = c.id)
),
apaga_contratos AS (
  DELETE FROM contratos WHERE id IN (SELECT contrato_id FROM alvo)
  RETURNING id, lead_id
)
DELETE FROM leads WHERE id IN (SELECT lead_id FROM apaga_contratos)
  AND noiva_nome LIKE 'E2E Colocacao %';

COMMIT;

-- Depois: as duas contagens abaixo devolvem 0.
--   SELECT count(*) FROM leads WHERE noiva_nome LIKE 'E2E Colocacao %';
--   SELECT count(*) FROM contratos c JOIN leads l ON l.id = c.lead_id
--    WHERE l.noiva_nome LIKE 'E2E Colocacao %';
