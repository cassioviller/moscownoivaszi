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
--
-- ## E250/S-R9 — corrigida em 2026-08-17: ela CRUZAVA LOJAS.
--
-- A versão que rodou selecionava o atributo *Tipo de peça* **sem `loja_id`** e
-- casava as duas CTEs com `FROM alvo, tipo` — um produto cartesiano. Num banco
-- com uma loja só, `tipo` tem uma linha e o cartesiano é a identidade; é por
-- isso que ela rodou certo no `moscow_base` e ninguém viu nada.
--
-- **Num banco com DUAS lojas ela escreve o dobro.** O dev tem duas "Moscow
-- Noivas" desde a S-O144, e cada uma tem o seu *Tipo de peça*: 132 peças × 2
-- linhas de `tipo` = **264 inserções**, metade delas classificando a peça de
-- uma loja com o atributo da OUTRA. E o estrago se esconde sozinho: a guarda
-- de idempotência (`NOT EXISTS … JOIN tipo`) também ignorava a loja, então na
-- segunda execução ela lê tudo como "já classificado" e não repara nada.
--
-- O conserto é o `loja_id` nas três pontas — no `tipo`, na guarda e no `JOIN`
-- que substitui a vírgula. **Não é reexecução**: no `moscow_base` (uma loja)
-- o resultado é idêntico ao que já está gravado, e a guarda de idempotência
-- garante que rodar de novo não insere nada. O arquivo fica no repositório
-- para a instalação real, que ainda não o rodou — e é ela que pode ter duas
-- lojas.
BEGIN;

WITH tipo AS (
  -- E250/S-R9: `loja_id` sai daqui e amarra tudo o que vem depois. Sem ele,
  -- uma linha por loja e um cartesiano na ponta.
  SELECT a.loja_id AS loja_id,
         a.id AS atributo_id,
         (SELECT o.id FROM atributo_opcoes o WHERE o.atributo_id = a.id AND o.valor = 'Noiva') AS noiva,
         (SELECT o.id FROM atributo_opcoes o WHERE o.atributo_id = a.id AND o.valor = 'Acessório') AS acessorio
  FROM atributos a WHERE a.nome = 'Tipo de peça'
),
alvo AS (
  SELECT v.id AS vestido_id,
         v.loja_id AS loja_id,
         CASE
           WHEN v.codigo IN ('L018', 'L037', 'L075', 'L086', 'L109') THEN 'Acessório'
           WHEN v.codigo = 'L084' THEN NULL
           ELSE 'Noiva'
         END AS tipo_de_peca
  FROM vestidos v
  WHERE v.codigo ~ '^L[0-9]{3}$'
    AND NOT EXISTS (
      SELECT 1 FROM vestido_atributos va
        JOIN tipo t ON t.atributo_id = va.atributo_id AND t.loja_id = v.loja_id
      WHERE va.vestido_id = v.id
    )
)
INSERT INTO vestido_atributos (vestido_id, atributo_id, opcao_id)
SELECT alvo.vestido_id, tipo.atributo_id,
       CASE alvo.tipo_de_peca WHEN 'Noiva' THEN tipo.noiva WHEN 'Acessório' THEN tipo.acessorio END
FROM alvo JOIN tipo ON tipo.loja_id = alvo.loja_id
WHERE alvo.tipo_de_peca IS NOT NULL;

-- Conferência: 126 Noiva · 5 Acessório · 1 sem tipo (L084) — POR LOJA, porque
-- num banco de duas lojas um total agregado esconde exatamente o defeito que
-- a S-R9 apontou.
SELECT a.loja_id, o.valor, count(*) FROM vestido_atributos va
  JOIN vestidos v ON v.id = va.vestido_id
  JOIN atributos a ON a.id = va.atributo_id AND a.nome = 'Tipo de peça' AND a.loja_id = v.loja_id
  JOIN atributo_opcoes o ON o.id = va.opcao_id
 GROUP BY a.loja_id, o.valor ORDER BY a.loja_id, o.valor;
SELECT v.loja_id, v.codigo, v.nome FROM vestidos v
 WHERE v.codigo ~ '^L[0-9]{3}$' AND NOT EXISTS (
   SELECT 1 FROM vestido_atributos va
     JOIN atributos a ON a.id = va.atributo_id AND a.nome = 'Tipo de peça' AND a.loja_id = v.loja_id
   WHERE va.vestido_id = v.id);

COMMIT;
