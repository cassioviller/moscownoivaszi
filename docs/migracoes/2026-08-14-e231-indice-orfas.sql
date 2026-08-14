-- E231/S-C111 — o índice parcial das peças que SAÍRAM.
--
-- `pecasForaSemContrato` (a varredura das órfãs, refeita pelo sino a cada
-- 5 min em toda tela) e o braço "na rua" do E225 leem POR LOJA quem tem
-- `retirada_data_real` — numa loja com legado importado (as 132 peças de
-- `moscow_base`), a varredura sem índice percorre a tabela inteira. O índice
-- parcial cobre exatamente o predicado das duas leituras e não custa nada nas
-- escritas de bloqueio comum (que nasce sem retirada).
--
-- Aplicado no `heliumdb` (dev) em 2026-08-14. Um banco existente roda:

CREATE INDEX IF NOT EXISTS bloqueio_vestidos_loja_na_rua_idx
  ON bloqueio_vestidos (loja_id)
  WHERE retirada_data_real IS NOT NULL;
