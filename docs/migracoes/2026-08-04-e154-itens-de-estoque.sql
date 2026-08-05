-- E154 — o acessório de ESTOQUE, que se conta em vez de se reservar
--
-- Duas naturezas diferentes de "segunda peça", e o que as separa é o mecanismo
-- de disponibilidade:
--
--   · peça ÚNICA (bolero, mantilha) → `vestidos`, com código e reserva (E150)
--   · peça de ESTOQUE (saiote, crinol) → esta tabela, com quantidade
--
-- Reservar "o saiote nº 7" não significa nada — ninguém vai atrás daquele. E
-- cadastrar dez saiotes um a um encheria de anágua a mesma lista que a
-- vendedora abre com a noiva na cabine.
--
-- Duas partes, e a ordem importa: o ALTER TYPE precisa de commit próprio antes
-- que o valor novo seja usado, então ele vem primeiro e sozinho.

-- ── 1. o tipo de item ────────────────────────────────────────────────────────
ALTER TYPE orcamento_item_tipo ADD VALUE IF NOT EXISTS 'ESTOQUE' AFTER 'ACESSORIO';

-- ── 2. a tabela e as colunas ─────────────────────────────────────────────────
BEGIN;

CREATE TABLE IF NOT EXISTS itens_estoque (
  id          text PRIMARY KEY,
  loja_id     text NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  -- Só quando faz diferença para quem separa a peça (P/M/G de saiote).
  tamanho     text,
  -- Quantas a loja TEM. O comprometimento por data é derivado dos contratos
  -- ativos, nunca gravado aqui — duas verdades sobre o mesmo número é como se
  -- perde a confiança no estoque.
  quantidade  integer NOT NULL DEFAULT 0,
  -- Nulo = vai junto com o vestido, sem cobrar à parte.
  preco       numeric(10,2),
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT itens_estoque_loja_nome_tamanho_unq UNIQUE (loja_id, nome, tamanho)
);

CREATE INDEX IF NOT EXISTS itens_estoque_loja_idx ON itens_estoque (loja_id);

-- O item aponta a peça de UM dos dois jeitos, nunca dos dois: `vestido_id` para
-- peça única, `item_estoque_id` para peça de estoque.
ALTER TABLE orcamento_itens
  ADD COLUMN IF NOT EXISTS item_estoque_id text REFERENCES itens_estoque(id) ON DELETE SET NULL;
ALTER TABLE contrato_itens
  ADD COLUMN IF NOT EXISTS item_estoque_id text REFERENCES itens_estoque(id) ON DELETE SET NULL;

COMMIT;

-- Nada a fazer com as linhas existentes: ESTOQUE é tipo NOVO e a tabela nasce
-- vazia. O que o ateliê tem a fazer, e é trabalho da loja, é cadastrar os
-- saiotes e crinóis que hoje só existem como frase no contrato — e dizer
-- quantos são de cada.
