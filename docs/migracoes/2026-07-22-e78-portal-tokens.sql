-- E78 — o portal da noiva: um link para tudo dela.
--
-- UM token por NOIVA (lead_id unique): proposta, lookbook, provas e extrato
-- atrás do mesmo link. Regenerar substitui o token NA MESMA LINHA (o antigo
-- morre); revogado_em derruba sem apagar o rastro; ultimo_acesso_em é o
-- "ela abriu" do card da vendedora.
--
-- Aditivo: `drizzle-kit push` cria a tabela num banco novo. Versionado porque
-- um banco JÁ EXISTENTE precisa dela antes de as rotas /portal subirem
-- (gotcha do push, replit.md).

CREATE TABLE IF NOT EXISTS portal_tokens (
  id text PRIMARY KEY,
  loja_id text NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  lead_id text NOT NULL,
  token text NOT NULL,
  expira_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  revogado_em timestamptz,
  ultimo_acesso_em timestamptz
);

-- FK de lead separada: leads(id) precisa existir — e existe desde a E1.
ALTER TABLE portal_tokens
  ADD CONSTRAINT portal_tokens_lead_id_leads_id_fk
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS portal_tokens_token_unq ON portal_tokens (token);
CREATE UNIQUE INDEX IF NOT EXISTS portal_tokens_lead_unq ON portal_tokens (lead_id);
