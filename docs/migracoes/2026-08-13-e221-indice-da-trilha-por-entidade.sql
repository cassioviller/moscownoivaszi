-- E221 — o recibo de pagamento (contrato, cláusula 7ª).
--
-- > CLÁUSULA 7ª — A LOCADORA deverá fornecer todos os recibos de pagamentos
-- > efetuados pelo LOCATÁRIO.
--
-- Uma mudança só, e ela é de LEITURA — nenhuma tabela nova, nenhuma coluna.
--
-- O recibo é por RECEBIMENTO (a cláusula diz "pagamentos EFETUADOS", e uma
-- parcela deste sistema recebe em pedaços), e o recebimento individual existe
-- num lugar só: a linha `PARCELA_RECEBIDA` de `audit_log`, escrita dentro da
-- MESMA transação do dinheiro. A parcela guarda o acumulado, não os atos —
-- por isso não há tabela de recibos a criar, e criar uma seria gravar o mesmo
-- fato duas vezes.
--
-- O que muda é que a trilha passou a ser lida POR ENTIDADE, e não só por
-- período. Abrir o portal da noiva pergunta "as linhas destas 12 parcelas", e
-- o único índice que havia abre por (loja_id, criado_em): a pergunta varria a
-- trilha inteira da loja — uma tabela que só cresce, uma linha por ação
-- sensível — para devolver algumas linhas.
--
-- É a regra do B10/E91 ("o Postgres não cria índice para FK") aplicada à
-- coluna que virou chave de busca.
--
-- Idempotente, e CONCURRENTLY porque `audit_log` é escrita em toda ação
-- sensível: um CREATE INDEX comum tranca a tabela e, com ela, todo recebimento
-- e todo cancelamento em curso. Rode fora de transação (o CONCURRENTLY exige).

CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_log_loja_entidade_idx
  ON audit_log USING btree (loja_id, entidade_id);

-- Conferência (deve devolver a linha do índice):
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'audit_log' AND indexname = 'audit_log_loja_entidade_idx';
--
-- O snapshot do drizzle grava o índice SEM `CONCURRENTLY`
-- (`lib/db/migrations/0019_safe_marrow.sql`), que é o certo para banco novo:
-- lá a tabela está vazia e a tranca não custa nada. Este arquivo é o de quem
-- já tem instalação rodando.
