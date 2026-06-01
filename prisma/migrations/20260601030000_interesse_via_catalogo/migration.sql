-- Interesse via catálogo: volumeSaia/brilho/cauda/fenda deixam de ser colunas
-- fixas de LeadInteresse e passam a viver no catálogo (LeadInteresseAtributo),
-- o mesmo vocabulário usado pelos vestidos. Esta migração:
--   1) faz BACKFILL dos valores antigos para o catálogo (idempotente);
--   2) só então DROPA as colunas e os enums Escala/Fenda.
-- O backfill casa por NOME do atributo + VALOR da opção, dentro da loja do lead
-- (Atributo é escopado por lojaId). ON CONFLICT DO NOTHING preserva qualquer
-- seleção de catálogo já feita pela noiva (não sobrescreve).

-- 1) BACKFILL ───────────────────────────────────────────────────────────────

INSERT INTO "LeadInteresseAtributo" ("leadInteresseId", "atributoId", "opcaoId")
SELECT li."id", a."id", o."id"
FROM "LeadInteresse" li
JOIN "Lead" l ON l."id" = li."leadId"
JOIN "Atributo" a ON a."lojaId" = l."lojaId" AND a."nome" = 'Volume da saia'
JOIN "AtributoOpcao" o ON o."atributoId" = a."id" AND o."valor" =
  CASE li."volumeSaia"::text WHEN 'POUCO' THEN 'Pouco' WHEN 'MEDIO' THEN 'Médio' WHEN 'MUITO' THEN 'Muito' END
WHERE li."volumeSaia" IS NOT NULL
ON CONFLICT ("leadInteresseId", "atributoId") DO NOTHING;

INSERT INTO "LeadInteresseAtributo" ("leadInteresseId", "atributoId", "opcaoId")
SELECT li."id", a."id", o."id"
FROM "LeadInteresse" li
JOIN "Lead" l ON l."id" = li."leadId"
JOIN "Atributo" a ON a."lojaId" = l."lojaId" AND a."nome" = 'Brilho'
JOIN "AtributoOpcao" o ON o."atributoId" = a."id" AND o."valor" =
  CASE li."brilho"::text WHEN 'POUCO' THEN 'Pouco' WHEN 'MEDIO' THEN 'Médio' WHEN 'MUITO' THEN 'Muito' END
WHERE li."brilho" IS NOT NULL
ON CONFLICT ("leadInteresseId", "atributoId") DO NOTHING;

INSERT INTO "LeadInteresseAtributo" ("leadInteresseId", "atributoId", "opcaoId")
SELECT li."id", a."id", o."id"
FROM "LeadInteresse" li
JOIN "Lead" l ON l."id" = li."leadId"
JOIN "Atributo" a ON a."lojaId" = l."lojaId" AND a."nome" = 'Cauda'
JOIN "AtributoOpcao" o ON o."atributoId" = a."id" AND o."valor" =
  CASE li."cauda"::text WHEN 'POUCO' THEN 'Pouco' WHEN 'MEDIO' THEN 'Médio' WHEN 'MUITO' THEN 'Muito' END
WHERE li."cauda" IS NOT NULL
ON CONFLICT ("leadInteresseId", "atributoId") DO NOTHING;

INSERT INTO "LeadInteresseAtributo" ("leadInteresseId", "atributoId", "opcaoId")
SELECT li."id", a."id", o."id"
FROM "LeadInteresse" li
JOIN "Lead" l ON l."id" = li."leadId"
JOIN "Atributo" a ON a."lojaId" = l."lojaId" AND a."nome" = 'Fenda'
JOIN "AtributoOpcao" o ON o."atributoId" = a."id" AND o."valor" =
  CASE li."fenda"::text WHEN 'SIM' THEN 'Sim' WHEN 'NAO' THEN 'Não' WHEN 'TALVEZ' THEN 'Talvez' END
WHERE li."fenda" IS NOT NULL
ON CONFLICT ("leadInteresseId", "atributoId") DO NOTHING;

-- 2) DROP das colunas e enums (já backfillados acima) ────────────────────────

ALTER TABLE "LeadInteresse"
  DROP COLUMN "volumeSaia",
  DROP COLUMN "brilho",
  DROP COLUMN "cauda",
  DROP COLUMN "fenda";

DROP TYPE "Escala";
DROP TYPE "Fenda";
