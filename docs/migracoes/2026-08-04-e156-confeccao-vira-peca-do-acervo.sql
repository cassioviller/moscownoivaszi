-- E156 — a confecção vira peça do acervo
--
-- O E155 pôs a peça sob medida na fila da costureira e deixou a pergunta
-- escrita sem modelar: depois do casamento, a manga confeccionada vira peça do
-- acervo? **A dona respondeu que vira** (P4).
--
-- A DIREÇÃO do vínculo é a decisão desta migração. A peça do acervo é o que
-- sobrevive; o trabalho da costureira é de onde ela veio. Apontar ao contrário
-- (`ajustes.vestido_id`) faria a fila carregar um campo que só interessa depois
-- que ela terminou.
--
-- E `ON DELETE SET NULL` pela mesma razão: apagar o trabalho da fila não pode
-- apagar a peça que já está alugável. O que se perde é a proveniência, não o
-- acervo.

BEGIN;

ALTER TABLE vestidos
  ADD COLUMN IF NOT EXISTS origem_ajuste_id text
  REFERENCES ajustes(id) ON DELETE SET NULL;

COMMIT;

-- Nada a fazer com as linhas existentes: **nulo significa "peça comprada"**, que
-- é a esmagadora maioria do acervo e todo o acervo de hoje. A coluna só ganha
-- valor pelo gesto — na fila, no trabalho CONFECCAO já FEITO, em "virou peça do
-- acervo". Nada vira sozinho quando o casamento passa: quem decide se aquela
-- manga entra no acervo é quem vai alugá-la de novo (mesma doutrina do
-- E100/F37 e do E151).
