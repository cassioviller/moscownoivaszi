-- S-A26 — a grafia do status do vestido, para um banco que viveu sem o enum
--
-- O contrato fechou `status` em `enum: [ativo, inativo]` (openapi.yaml), e as
-- RESPOSTAS são validadas em runtime (`ListVestidosResponse.parse`, em
-- vestidos.ts:98): uma linha legada com grafia fora do enum, que antes só
-- inativava a peça em silêncio, passaria a derrubar a LISTAGEM INTEIRA com 500.
-- Este script normaliza o que é a mesma palavra em outra caixa, e NADA mais.
--
-- **ESTE SCRIPT NÃO É DE SCHEMA**: a coluna continua `text NOT NULL DEFAULT
-- 'ativo'` (lib/db/src/schema/vestidos.ts:81). É idempotente.
--
-- MEDIDO ANTES (rode e anote — regra 16 do método):
--   SELECT status, count(*) FROM vestidos GROUP BY status;
--   -- esperado num banco são: só 'ativo' e 'inativo'.
--
-- A GUARDA: só se normaliza o que, minusculizado e sem espaços, JÁ É um dos
-- dois valores ('Ativo' → 'ativo', ' inativo ' → 'inativo'). Valor que não é
-- nenhum dos dois ('vendido', 'em reforma') NÃO se adivinha: ele fica, o
-- SELECT final o denuncia, e a decisão é de gente — mapear no braço ou
-- inativar de propósito.

UPDATE vestidos
SET status = lower(trim(status))
WHERE status NOT IN ('ativo', 'inativo')
  AND lower(trim(status)) IN ('ativo', 'inativo');

-- DEPOIS: tem de voltar vazio. Cada linha que sobrar aqui é uma peça cujo
-- estado ninguém sabe escrever — e que hoje derruba o GET /vestidos da loja.
SELECT id, codigo, nome, status
FROM vestidos
WHERE status NOT IN ('ativo', 'inativo');
