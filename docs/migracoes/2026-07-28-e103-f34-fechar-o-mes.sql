-- E103/F34 — fechar o mês num lugar só, com os DOIS lados carimbados.
--
-- Hoje só metade do mês tem memória. `pagamentos.enviado_contabilidade_em`
-- existe desde a onda 5 e é carimbado por `POST /financeiro/contabilidade/enviar`
-- (`financeiro.ts:1305`). As ENTRADAS não têm nada: o export de parcelas é um
-- GET puro, não escreve e não audita. "Escolhe a competência, mostra os dois
-- lados e carimba os dois" não era possível — faltava onde carimbar um deles.
--
-- Por que na PARCELA e não no contrato: a unidade que a contabilidade recebe é o
-- RECEBIMENTO (uma linha de caixa, por `recebido_em`), não o acordo. É a mesma
-- unidade que o outro lado usa — `pagamentos`, também por data.
--
-- SEM BACKFILL, e a consequência está escrita no relatório: todo mês fechado até
-- hoje tem as SAÍDAS carimbadas e as ENTRADAS sem carimbo, porque a coluna não
-- existia. A tela NÃO pode ler isso como "o mês está pendente" — ela deriva uma
-- data de corte por loja (o menor `enviado_contabilidade_em` dos pagamentos) e
-- chama o que é anterior a ela de "anterior ao carimbo", que é a verdade.
-- Adivinhar por heurística é o que o E97 recusou com as avarias.
--
-- Idempotente: `IF NOT EXISTS` para o banco que já recebeu o push.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pagamentos' AND column_name = 'enviado_contabilidade_em'
  ) THEN
    RAISE EXCEPTION 'pagamentos.enviado_contabilidade_em não existe — a onda 5 não foi aplicada neste banco';
  END IF;
END $$;

ALTER TABLE parcelas ADD COLUMN IF NOT EXISTS enviado_contabilidade_em timestamptz;

COMMENT ON COLUMN parcelas.enviado_contabilidade_em IS
  'F34/E103: quando este RECEBIMENTO foi declarado à contabilidade. Irmã de pagamentos.enviado_contabilidade_em — sem ela, fechar o mês carimbava só as saídas. NÃO é conciliado_em (bater com o extrato do banco é outro fato). O estorno NÃO limpa: ter sido declarado é fato histórico, e desfazer o recebimento não desfaz o que a contadora recebeu.';

-- O alvo de "fechar o mês" abre por loja + data de recebimento + IS NULL.
CREATE INDEX IF NOT EXISTS parcelas_nao_enviadas_idx
  ON parcelas (loja_id, recebido_em) WHERE enviado_contabilidade_em IS NULL;

COMMIT;
