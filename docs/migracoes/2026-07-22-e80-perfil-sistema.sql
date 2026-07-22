-- E80 — o perfil do SISTEMA vira flag no banco, não convenção de nome.
--
-- `ehPerfilAdmin` identificava o perfil de acesso total pelo NOME
-- ("admin"/"administrador…"): renomear perdia o readonly da matriz e abria
-- PATCH/DELETE por curl. A flag é a verdade; o nome volta a ser só rótulo.
--
-- Aditivo: `drizzle-kit push` cria a coluna num banco novo. O UPDATE marca o
-- Admin de um banco JÁ EXISTENTE — push não sabe fazê-lo, por isso o script
-- fica versionado (gotcha do push, replit.md).

BEGIN;

ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS sistema boolean NOT NULL DEFAULT false;

-- Marca pelo nome UMA vez — exatamente a heurística que a flag aposenta.
UPDATE perfis
  SET sistema = true
  WHERE lower(trim(nome)) IN ('admin', 'administrador', 'administradora');

COMMIT;
