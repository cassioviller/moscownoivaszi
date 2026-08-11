-- E158 (K3/A08.1) — uma noiva tem no máximo UM contrato ativo, e agora quem
-- garante é o banco.
--
-- A guarda vivia só em código (`contratos.ts:184`), lida no pool ANTES da
-- transação que insere. Duas vendedoras clicando "gerar contrato" no mesmo
-- segundo liam as duas "esta noiva não tem contrato ativo" e as duas inseriam.
-- Medido: dois contratos ATIVOS de R$ 5.000,00 para a mesma noiva — a ficha
-- somando 2 × 10 × R$ 500,00 = R$ 10.000,00 a receber sobre uma venda de
-- R$ 5.000,00, com a comissão fechando sobre o dobro. É o estrago da S-M3
-- entrando por outra porta.
--
-- A rota passou a trancar a linha do LEAD (`FOR UPDATE`) e a reler o duplicado
-- DENTRO da transação, o que fecha a corrida no caminho normal. Este índice é o
-- cinto: fecha a porta para script, seed e rota futura que não conheçam a régua.
--
-- Parcial em `status = 'ATIVO'` porque contrato CANCELADO não segura noiva
-- nenhuma: a mesma noiva pode ter três cancelados e um ativo, que é o caso
-- comum de quem refez a venda.
--
-- ANTES DE APLICAR num banco que já viveu, confira que não há duplicata:
--
--   SELECT lead_id, count(*) FROM contratos
--    WHERE status = 'ATIVO' GROUP BY 1 HAVING count(*) > 1;
--
-- devolvendo linhas, decida qual contrato é o verdadeiro ANTES — o CREATE
-- abaixo recusa o banco com duplicata, de propósito. O `CONCURRENTLY` deixa a
-- loja trabalhando durante a criação; ele não roda dentro de transação, então
-- execute esta linha sozinha.
--
-- Medido no dev em 2026-08-11: 647 contratos (309 ATIVOS, 338 CANCELADOS) e
-- ZERO leads com dois ativos — o índice nasce verde num banco que já viveu.

CREATE UNIQUE INDEX CONCURRENTLY contratos_lead_ativo_unico
  ON contratos (lead_id)
  WHERE status = 'ATIVO';
