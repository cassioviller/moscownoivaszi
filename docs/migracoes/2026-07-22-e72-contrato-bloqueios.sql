-- E72 — o vínculo contrato ↔ reserva física vira N:N.
--
-- `contratos.bloqueio_vestido_id` assumia UM vestido por contrato — e a UI
-- nem o enviava. A tabela nova aceita N peças (vestido + véu + segunda peça);
-- o backfill preserva os vínculos singulares que existirem. A coluna antiga
-- fica como legado LIDO (o cancelamento ainda a considera), nunca mais
-- escrito — dropá-la exigiria push interativo e não ganha nada.
--
-- Aditivo: `drizzle-kit push` cria a tabela; o BACKFILL é só daqui.

CREATE TABLE IF NOT EXISTS contrato_bloqueios (
  contrato_id text NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  bloqueio_id text NOT NULL REFERENCES bloqueio_vestidos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contrato_id, bloqueio_id)
);

INSERT INTO contrato_bloqueios (contrato_id, bloqueio_id)
SELECT id, bloqueio_vestido_id
FROM contratos
WHERE bloqueio_vestido_id IS NOT NULL
ON CONFLICT DO NOTHING;
