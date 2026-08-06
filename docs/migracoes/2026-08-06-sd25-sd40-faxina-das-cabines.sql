-- S-D25 / S-D40 — a faxina das cabines que os specs criaram e não apagaram.
--
-- Cinco specs do E2E criam uma cabine por execução (`e<NN>-<timestamp>`) e
-- quatro não a apagavam; o spec 18 DESATIVAVA as suas (`Cabine E2E
-- <timestamp>`) em vez de apagar. O conserto de código entra no mesmo commit
-- que esta faxina: a régua `apagarCabineCriada` no afterAll dos oito specs que
-- criam cabine, e uma varredura cobrando que não nasça o nono sem ela.
--
-- Medido em 2026-08-06, antes desta faxina, sobre 240 cabines:
--   220 `e<NN>-<timestamp>`, TODAS ativas (e22 68, e25 66, e24 36, e57 26, e59 24)
--     4 `Cabine E2E <timestamp>` inativas (spec 18, de antes do reuso da "Grade")
--   230 das 240 moram na loja do seed — a agenda daquela loja desenhava cada
--       uma como coluna, e a grade oferecia 20 slots por dia em cada.
--   ZERO atendimentos pendurados nos 224 alvos.
--
-- `atendimentos.cabine_id` é ON DELETE CASCADE: apagar cabine COM atendimento
-- levaria o atendimento junto — e `ajustes.atendimento_id` cascateia de novo —
-- em silêncio. A guarda exige cabine VAZIA: fixture que tenha história fica, e
-- fica de propósito, para olho humano.
--
-- A "Cabine E2E Grade" (ativa, sem timestamp) NÃO é alvo: ela é reusável entre
-- runs por decisão do spec 18, que só apaga a que ele mesmo criou.
--
-- Reversibilidade: tire o dump antes. Foi o que tornou a S-A13 reversível.
--   pg_dump "$DATABASE_URL" -t cabines > artifacts/api-server/backups/pre-sd25-$(date +%F).sql

BEGIN;

DELETE FROM cabines c
WHERE (
    c.nome ~ '^e[0-9]{2}-[0-9]{13}$'
    OR (c.nome ~ '^Cabine E2E [0-9]+$' AND NOT c.ativo)
  )
  AND NOT EXISTS (SELECT 1 FROM atendimentos a WHERE a.cabine_id = c.id);

-- O que deve sobrar: as cabines do seed, a "Cabine E2E Grade" e as de loja
-- viva. `fixtures_restantes` acima de zero significa que alguma fixture tem
-- atendimento pendurado e a guarda a recusou — olho humano antes de forçar.
SELECT count(*) AS cabines_restantes,
       count(*) FILTER (WHERE nome ~ '^e[0-9]{2}-[0-9]{13}$') AS fixtures_restantes
FROM cabines;

COMMIT;
