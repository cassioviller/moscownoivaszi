-- E155 — a peça sob medida entra na fila da costureira, que já existe
--
-- O caderno de 10–16/08 traz `Siam + Manga será confeccionada + Mantilha`, e a
-- agenda traz DOIS compromissos de 10:30 marcados só para o assunto (21/07 e
-- 24/07, "conversar sobre confecção de manga"). Não é ajuste de peça existente:
-- é peça nova, feita para aquela noiva — e o modelo não tinha lugar para ela.
--
-- Não é tabela nova de propósito. Prazo (a próxima prova), status, checklist e
-- a tela que ordena pelo aperto já existem em `ajustes`, e uma tabela
-- `producoes` duplicaria a fila e criaria uma segunda tela para a mesma pessoa.
--
-- Três partes, e a ordem importa: o CREATE TYPE vem antes de a coluna usá-lo.

-- ── 1. as duas naturezas de trabalho de agulha ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ajuste_tipo') THEN
    CREATE TYPE ajuste_tipo AS ENUM ('AJUSTE', 'CONFECCAO');
  END IF;
END
$$;

BEGIN;

-- ── 2. a fila guarda o tipo e o custo ────────────────────────────────────────
-- O default 'AJUSTE' é o que faz a migração não precisar de UPDATE nenhum: todo
-- ajuste que já existe é, por definição, alteração de peça existente — a
-- confecção não tinha como ser registrada antes desta linha.
ALTER TABLE ajustes
  ADD COLUMN IF NOT EXISTS tipo ajuste_tipo NOT NULL DEFAULT 'AJUSTE';

-- Material + mão de obra da confecção. Nulo é o caso de todo ajuste comum — e
-- também o da confecção cujo custo ainda não se sabe. É o que a COSTUREIRA
-- cobra, não o que a noiva paga: isso é o item do orçamento, abaixo.
ALTER TABLE ajustes
  ADD COLUMN IF NOT EXISTS custo numeric(10,2);

-- ── 3. o item que cobra a confecção aponta o trabalho ────────────────────────
-- `set null` como os irmãos `vestido_id` e `item_estoque_id`: apagar o trabalho
-- da fila não apaga a venda, e a descrição em texto continua autoritativa.
ALTER TABLE orcamento_itens
  ADD COLUMN IF NOT EXISTS ajuste_id text REFERENCES ajustes(id) ON DELETE SET NULL;

COMMIT;

-- Nada a fazer com as linhas existentes. O que o ateliê tem a fazer, e é
-- trabalho da loja, é marcar como CONFECCAO o que já estiver na fila como
-- ajuste e for peça nova — a manga da Dayfini é o caso conhecido.
