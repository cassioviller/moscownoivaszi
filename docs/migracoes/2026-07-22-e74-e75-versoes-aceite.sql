-- E75 (versões de orçamento) + E74 (aceite digital pelo link público).
--
-- Edição sobrescrevia: a noiva olhava um link cujo conteúdo mudava embaixo
-- dela. Marcar ENVIADO passa a congelar uma versão numerada (itens, desconto,
-- totais, hash sha256); o link público mostra a última versão enviada. O
-- aceite grava instante + versão + hash no orçamento — "ela viu" vira "ela
-- concordou com ESTA versão".
--
-- Aditivo: `drizzle-kit push` aplica sozinho. Sem backfill de versões:
-- orçamento já ENVIADO antes desta migração ganha a v1 no próximo reenvio.

ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS aceito_em timestamptz,
  ADD COLUMN IF NOT EXISTS aceite_versao integer,
  ADD COLUMN IF NOT EXISTS aceite_hash text;

CREATE TABLE IF NOT EXISTS orcamento_versoes (
  id text PRIMARY KEY,
  loja_id text NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  orcamento_id text NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  numero integer NOT NULL,
  itens jsonb NOT NULL,
  desconto_tipo desconto_tipo,
  desconto_valor numeric(10, 2),
  total_bruto numeric(10, 2) NOT NULL,
  total_liquido numeric(10, 2) NOT NULL,
  hash text NOT NULL,
  criada_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS orcamento_versoes_numero_unq
  ON orcamento_versoes (orcamento_id, numero);
