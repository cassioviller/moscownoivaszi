-- S25 / S-D22 / S27 — a faxina do vazamento do spec 48, com guarda.
--
-- O `e2e/48-avaria-vira-parcela.spec.ts` apagava o LEAD no `afterAll` e deixava
-- vestido, bloqueio e avaria. Como `bloqueio_vestidos.lead_id` é `SET NULL`, a
-- reserva não saía: ficava ÓRFÃ. É a mesma linha vista de três trilhas — a S25
-- e a S-D22 chamam de vazamento de fixture, a S27 chama de reserva sem noiva.
--
-- Medido em 2026-08-06, depois de duas passadas da suíte nesta sessão:
--   131 RESERVA_CASAMENTO sem lead_id  (a sobra dizia 61; a conferência, 124)
--   129 vestidos AVA-<epoch de 13 dígitos> num acervo de 511  (25%)
--   127 avarias órfãs, R$ 44.450,00 de custo de reparo, TODAS com parcela_id nulo
--     2 leads "E2E Avaria <stamp>" vivos, de 22/07
-- A taxa é de +1 por passada da suíte, e foi medida nesta própria sessão: o
-- número saiu de 130 para 131 entre a leitura do dossiê e esta migração.
--
-- A GUARDA INVERTE a do `DELETE /vestidos/:id` DE PROPÓSITO. A rota recusa
-- apagar o que tem HISTÓRIA (S-A25, `2912526`), e está certa: ela protege o
-- acervo de quem vende. Aqui a história É a assinatura do spec, então a guarda
-- exige que ela seja EXATAMENTE a que o spec 48 produz e nada mais. Uma avaria
-- que virou cobrança viva (`parcela_id` não nulo) NÃO sai — é dinheiro.
--
-- Reversibilidade: tire o dump antes. Foi o que tornou a S-A13 reversível.
--   pg_dump "$DATABASE_URL" -t vestidos -t bloqueio_vestidos -t avarias -t leads \
--     -t contratos -t parcelas > artifacts/api-server/backups/pre-s27-$(date +%F).sql

BEGIN;

-- ---------------------------------------------------------------------------
-- BLOCO 1 — os vestidos do spec 48, com sete guardas concordando.
-- O CASCADE de `bloqueio_vestidos.vestido_id` leva o bloqueio, e o de
-- `avarias.bloqueio_id` leva a avaria: os três saem por este DELETE.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE s27_vestidos_alvo ON COMMIT DROP AS
SELECT v.id
FROM vestidos v
WHERE
  -- (1..3) as três marcas do spec concordando entre si
  v.codigo ~ '^AVA-[0-9]{13}$'
  AND v.nome = 'Vestido Avaria ' || substring(v.codigo from 5)
  AND v.preco_base = 5000
  -- (4) exatamente UM bloqueio, e na janela fixa que o spec grava
  AND (SELECT count(*) FROM bloqueio_vestidos b WHERE b.vestido_id = v.id) = 1
  AND EXISTS (
    SELECT 1 FROM bloqueio_vestidos b
    WHERE b.vestido_id = v.id
      AND b.tipo = 'RESERVA_CASAMENTO'
      AND b.casamento_data BETWEEN '2027-11-17' AND '2027-11-29'
  )
  -- (5) exatamente UMA avaria, com a descrição e o custo do spec, e NUNCA cobrada
  AND (
    SELECT count(*) FROM avarias a
    JOIN bloqueio_vestidos b ON b.id = a.bloqueio_id
    WHERE b.vestido_id = v.id
  ) = 1
  AND EXISTS (
    SELECT 1 FROM avarias a
    JOIN bloqueio_vestidos b ON b.id = a.bloqueio_id
    WHERE b.vestido_id = v.id
      AND a.descricao LIKE 'Barrado rasgado E2E %'
      AND a.custo_reparo = 350
      AND a.parcela_id IS NULL          -- avaria cobrada é dinheiro: fica
  )
  -- (6) a peça não entrou em nada que alguém veja
  AND NOT EXISTS (SELECT 1 FROM contrato_itens ci WHERE ci.vestido_id = v.id)
  AND NOT EXISTS (SELECT 1 FROM orcamento_itens oi WHERE oi.vestido_id = v.id)
  AND NOT EXISTS (SELECT 1 FROM lookbook_itens li WHERE li.vestido_id = v.id)
  -- (7) e o bloqueio dela não está preso a contrato nem a atendimento
  AND NOT EXISTS (
    SELECT 1 FROM bloqueio_vestidos b
    WHERE b.vestido_id = v.id AND (
      EXISTS (SELECT 1 FROM contrato_bloqueios cb WHERE cb.bloqueio_id = b.id)
      OR EXISTS (SELECT 1 FROM contratos c WHERE c.bloqueio_vestido_id = b.id)
      OR EXISTS (SELECT 1 FROM atendimentos at WHERE at.bloqueio_id = b.id)
    )
  );

DELETE FROM vestidos WHERE id IN (SELECT id FROM s27_vestidos_alvo);

-- ---------------------------------------------------------------------------
-- BLOCO 2 — as reservas órfãs que sobraram e não vieram do spec 48.
-- Todas moram em loja de fixture: 23 das 25 lojas do banco de dev são
-- `Loja Teste …`/`Loja Vazia …` (família S18 / S-D25 / S-D40). Num banco de
-- produção este bloco tende a ZERO linhas, e a guarda por nome é apertada de
-- propósito para que ele continue tendendo a zero.
-- ---------------------------------------------------------------------------
DELETE FROM bloqueio_vestidos b
USING lojas l
WHERE l.id = b.loja_id
  AND b.tipo = 'RESERVA_CASAMENTO'
  AND b.lead_id IS NULL
  AND (l.nome LIKE 'Loja Teste %' OR l.nome LIKE 'Loja Vazia %')
  AND NOT EXISTS (SELECT 1 FROM contrato_bloqueios cb WHERE cb.bloqueio_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM contratos c WHERE c.bloqueio_vestido_id = b.id)
  AND NOT EXISTS (
    SELECT 1 FROM avarias a WHERE a.bloqueio_id = b.id AND a.parcela_id IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- BLOCO 3 — as noivas "E2E Avaria" que ficaram sem nada pendurado.
-- Depois do bloco 1 elas não seguram mais bloqueio nenhum, e é isso que as
-- deixa passar pela última guarda.
-- ---------------------------------------------------------------------------
DELETE FROM leads le
WHERE le.noiva_nome LIKE 'E2E Avaria %'
  AND NOT EXISTS (SELECT 1 FROM contratos c WHERE c.lead_id = le.id)
  AND NOT EXISTS (SELECT 1 FROM orcamentos o WHERE o.lead_id = le.id)
  AND NOT EXISTS (SELECT 1 FROM atendimentos a WHERE a.lead_id = le.id)
  AND NOT EXISTS (SELECT 1 FROM bloqueio_vestidos b WHERE b.lead_id = le.id)
  AND NOT EXISTS (SELECT 1 FROM registros_cobranca rc WHERE rc.lead_id = le.id);

-- ---------------------------------------------------------------------------
-- BLOCO 4 — a pré-condição do CHECK.
-- Se isto não devolver 0, NÃO aplique `bloqueio_vestidos_reserva_exige_noiva`:
-- sobrou linha que a guarda recusou, e ela precisa de olho humano antes.
-- ---------------------------------------------------------------------------
SELECT
  count(*) AS reservas_sem_noiva_restantes,
  CASE WHEN count(*) = 0
    THEN 'pode aplicar o CHECK'
    ELSE 'NAO aplique o CHECK — sobrou linha que a guarda recusou'
  END AS veredito
FROM bloqueio_vestidos
WHERE tipo = 'RESERVA_CASAMENTO' AND lead_id IS NULL;

COMMIT;
