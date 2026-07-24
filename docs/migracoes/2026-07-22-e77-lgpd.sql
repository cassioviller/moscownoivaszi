-- E77 — LGPD interno: consentimento na captação e anonimização com carimbo.
--
-- Aditivo: `drizzle-kit push` aplica sozinho.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS consentimento_em timestamptz,
  ADD COLUMN IF NOT EXISTS anonimizada_em timestamptz;
