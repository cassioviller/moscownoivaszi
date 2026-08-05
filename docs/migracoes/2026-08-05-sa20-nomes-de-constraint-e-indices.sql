-- S-A20 — os scripts à mão e o schema drizzle voltam a falar os mesmos nomes
--
-- Havia quatro divergências entre `docs/migracoes/` (o que um banco que JÁ
-- EXISTE roda) e o schema drizzle (do que um banco NOVO nasce). Só uma gritou:
--
--   · `itens_estoque_loja_nome_tamanho_unq` (E154) — o script batizou a unique
--     assim, o drizzle gera `itens_estoque_loja_id_nome_tamanho_unique`. Ele não
--     encontrava a dele, tentava CRIAR a duplicata e perguntava se podia truncar
--     a tabela: prompt, sem TTY, `push` morto para todo banco provisionado pelos
--     scripts — que é todo banco que já existia.
--   · `itens_estoque_loja_idx` (E154), `avarias_parcela_id_idx` (E97) e
--     `atendimentos_loja_contato_idx` (E97) — índices que existiam nos bancos
--     antigos e em NENHUM banco novo. Ninguém tropeça num índice que falta: só
--     fica mais lento, e num banco que ainda é pequeno.
--
-- O conserto foi do lado do SCHEMA: ele passou a declarar os três índices e a
-- nomear a unique como o script a nomeou. A direção é essa, e não a inversa,
-- porque **nenhum banco consumiu o `migrate`** (`__drizzle_migrations` não
-- existe — conferido no E115 e de novo na S-A20): adotar o nome do script custa
-- zero DDL em banco real.
--
-- ESTE SCRIPT É PARA A OUTRA POPULAÇÃO: o banco que nasceu de `push` ou
-- `migrate` ANTES do conserto, e por isso carrega o nome do drizzle e não tem os
-- três índices. Num banco vindo dos scripts, ele não faz nada — e é de propósito.

BEGIN;

-- A unique: renomeia só se o nome do drizzle for o que está lá.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'itens_estoque_loja_id_nome_tamanho_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'itens_estoque_loja_nome_tamanho_unq'
  ) THEN
    ALTER TABLE itens_estoque
      RENAME CONSTRAINT itens_estoque_loja_id_nome_tamanho_unique
                     TO itens_estoque_loja_nome_tamanho_unq;
  END IF;
END $$;

-- Os três índices. `IF NOT EXISTS` faz o script valer nas duas populações.
CREATE INDEX IF NOT EXISTS itens_estoque_loja_idx ON itens_estoque (loja_id);
CREATE INDEX IF NOT EXISTS avarias_parcela_id_idx ON avarias (parcela_id);
CREATE INDEX IF NOT EXISTS atendimentos_loja_contato_idx
  ON atendimentos (loja_id, contatado_em);

COMMIT;

-- A partir daqui a divergência não volta em silêncio: a varredura de
-- `e115-migracao-snapshot-unit.test.ts` reprova todo nome de constraint ou
-- índice criado em `docs/migracoes/` que o snapshot do drizzle não conheça.
