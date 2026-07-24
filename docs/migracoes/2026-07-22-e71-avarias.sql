-- E71 — a avaria na devolução vira registro com foto, e o custo pode virar
-- parcela cobrável.
--
-- Aditivo (tabela nova): `drizzle-kit push` aplica sozinho. Versionado para
-- um banco existente nascer igual ao schema.

CREATE TABLE IF NOT EXISTS avarias (
  id text PRIMARY KEY,
  loja_id text NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  bloqueio_id text NOT NULL REFERENCES bloqueio_vestidos(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  custo_reparo numeric(10, 2),
  foto_bytes bytea,
  foto_mime text,
  registrado_por_nome text,
  criada_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS avarias_bloqueio_id_idx ON avarias (bloqueio_id);
