-- S-M27 (rodada 2, ângulo 9) — os índices que o B10/E91 não alcançou.
--
-- O Postgres NÃO cria índice para FK. O B10/E91 fechou a classe em parcelas,
-- contratos e leads; estas quatro tabelas ficaram de fora, e cada uma está no
-- caminho de uma tela quente: `registros_cobranca` é varrida pelo sino a cada
-- 5 minutos e 12 vezes por render do funil; `orcamentos`/`orcamento_itens`
-- pagam três varreduras por página de lista; `bloqueio_vestidos` é varrida a
-- cada data escolhida no acervo com a noiva na cabine.
--
-- Um banco NOVO nasce certo do schema (push/migrate 0013); um banco que JÁ
-- existe só chega lá por este script. IF NOT EXISTS: reexecutar não é erro.
BEGIN;

CREATE INDEX IF NOT EXISTS "registros_cobranca_lead_idx" ON "registros_cobranca" USING btree ("lead_id");
CREATE INDEX IF NOT EXISTS "registros_cobranca_loja_idx" ON "registros_cobranca" USING btree ("loja_id");
CREATE INDEX IF NOT EXISTS "orcamentos_loja_status_idx" ON "orcamentos" USING btree ("loja_id","status");
CREATE INDEX IF NOT EXISTS "orcamentos_lead_idx" ON "orcamentos" USING btree ("lead_id");
CREATE INDEX IF NOT EXISTS "orcamento_itens_orcamento_idx" ON "orcamento_itens" USING btree ("orcamento_id");
CREATE INDEX IF NOT EXISTS "bloqueio_vestidos_loja_cancelado_idx" ON "bloqueio_vestidos" USING btree ("loja_id","cancelado_em");

COMMIT;
