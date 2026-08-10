-- S-M8 — a MESMA confecção não vira duas peças do acervo.
--
-- O E156 criou o caminho "confecção FEITA vira peça" (P4) e o invariante
-- "uma vez só" ficou morando no botão da tela: dois cliques — ou duas
-- requisições na mesma janela — criavam DOIS vestidos apontando o mesmo
-- `origem_ajuste_id`. A rota ganhou o 409 amigável (CONFECCAO_JA_VIROU_PECA);
-- este unique é o cinto do banco, que fecha a corrida que a leitura da rota
-- não fecha.
--
-- NULL não colide com NULL em unique do Postgres: toda peça comprada (a
-- esmagadora maioria — no dev, 100%: zero linhas com origem em 494 vestidos)
-- fica fora da régua.
--
-- Antes de aplicar num banco que já viveu, confira que não há duplicata:
--   SELECT origem_ajuste_id, count(*) FROM vestidos
--    WHERE origem_ajuste_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
-- devolvendo linhas, decida qual peça é a verdadeira ANTES — o ALTER abaixo
-- recusa o banco com duplicata, de propósito.

ALTER TABLE vestidos
  ADD CONSTRAINT vestidos_origem_ajuste_id_unique UNIQUE (origem_ajuste_id);
