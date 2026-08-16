-- S-A27 (arqueologia do legado) — o "Tipo de peça" das 132 peças que vieram do papel.
--
-- Decisão da dona em 2026-08-16 ("classifica"). A regra é a que a resposta da
-- S-A3 já dava: a linha de NOIVA é indexada por NOME DE MODELO (é o que os 132
-- códigos L001–L132 são); a linha de festa/madrinha/dama é indexada por COR e
-- código de 4 dígitos, e não há nenhuma dessas no legado. Do resto, o que é
-- PEÇA AVULSA pelo próprio nome — bolero, mantilha, saiote/crinol — é
-- Acessório. Fica de fora, para a dona dizer: L084 "Solussaia + Manga" (o
-- nome não diz se é vestido ou conjunto avulso).
--
-- Roda no banco da LOJA (moscow_base). Idempotente: só insere onde a peça
-- ainda não tem Tipo de peça. Antes de aplicar: 132 peças, 0 classificadas.
BEGIN;

WITH tipo AS (
  SELECT a.id AS atributo_id,
         (SELECT o.id FROM atributo_opcoes o WHERE o.atributo_id = a.id AND o.valor = 'Noiva') AS noiva,
         (SELECT o.id FROM atributo_opcoes o WHERE o.atributo_id = a.id AND o.valor = 'Acessório') AS acessorio
  FROM atributos a WHERE a.nome = 'Tipo de peça'
),
alvo AS (
  SELECT v.id AS vestido_id,
         CASE
           WHEN v.codigo IN ('L018', 'L037', 'L075', 'L086', 'L109') THEN 'Acessório'
           WHEN v.codigo = 'L084' THEN NULL
           ELSE 'Noiva'
         END AS tipo_de_peca
  FROM vestidos v
  WHERE v.codigo ~ '^L[0-9]{3}$'
    AND NOT EXISTS (
      SELECT 1 FROM vestido_atributos va JOIN tipo t ON t.atributo_id = va.atributo_id
      WHERE va.vestido_id = v.id
    )
)
INSERT INTO vestido_atributos (vestido_id, atributo_id, opcao_id)
SELECT alvo.vestido_id, tipo.atributo_id,
       CASE alvo.tipo_de_peca WHEN 'Noiva' THEN tipo.noiva WHEN 'Acessório' THEN tipo.acessorio END
FROM alvo, tipo
WHERE alvo.tipo_de_peca IS NOT NULL;

-- Conferência: 126 Noiva · 5 Acessório · 1 sem tipo (L084).
SELECT o.valor, count(*) FROM vestido_atributos va
  JOIN atributos a ON a.id = va.atributo_id AND a.nome = 'Tipo de peça'
  JOIN atributo_opcoes o ON o.id = va.opcao_id
 GROUP BY o.valor ORDER BY o.valor;
SELECT v.codigo, v.nome FROM vestidos v
 WHERE v.codigo ~ '^L[0-9]{3}$' AND NOT EXISTS (
   SELECT 1 FROM vestido_atributos va JOIN atributos a ON a.id = va.atributo_id AND a.nome = 'Tipo de peça'
   WHERE va.vestido_id = v.id);

COMMIT;
