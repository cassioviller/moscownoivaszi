-- E103/F32 — a conciliação passa a ter memória.
--
-- Hoje ela é uma FOTOGRAFIA: `pages/financeiro/conciliacao.tsx` não tem uma
-- única mutation, e o resultado morre com a aba. Todo mês se refaz o mesmo
-- trabalho, e as divergências que já foram olhadas e perdoadas voltam sem marca
-- nenhuma — indistinguíveis das novas.
--
-- DUAS tabelas, e não uma. O plano de fechamento dizia "Migração: sim —
-- `conciliadoEm`", no singular; o que a tela chama de "movimento do sistema" é
-- montado de DOIS lugares (`conciliacao.tsx:118` e `:131`), com ids sintéticos
-- (`parcela:<id>` e `pagamento:<id>`). Não existe entidade "movimento" para
-- carregar a coluna: ou são as duas, ou metade da conciliação continua amnésica.
--
-- `conciliado_em` NÃO é `enviado_contabilidade_em`. São dois fatos e um pode
-- existir sem o outro nas duas direções: conciliado = "bateu com o extrato do
-- banco"; enviado = "declarei este período à contabilidade".
--
-- SEM BACKFILL, e é honesto dizer por quê: nada no sistema sabe o que já foi
-- conciliado antes de hoje, porque a conciliação nunca escreveu. Todo movimento
-- antigo nasce não-conciliado, que é exatamente a verdade sobre ele. Adivinhar
-- por heurística é o que o E97 já decidiu não fazer com as avarias.
--
-- Idempotente: `IF NOT EXISTS` para o banco que já recebeu o push.

BEGIN;

-- Guarda: aborta se as tabelas não estiverem no estado esperado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pagamentos' AND column_name = 'enviado_contabilidade_em'
  ) THEN
    RAISE EXCEPTION 'pagamentos.enviado_contabilidade_em não existe — a onda 5 não foi aplicada neste banco';
  END IF;
END $$;

ALTER TABLE parcelas   ADD COLUMN IF NOT EXISTS conciliado_em timestamptz;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS conciliado_em timestamptz;

COMMENT ON COLUMN parcelas.conciliado_em IS
  'F32/E103: quando este recebimento casou com uma linha do extrato do banco. NÃO confundir com pagamentos.enviado_contabilidade_em (declarar à contabilidade é outro fato). O ESTORNO limpa esta coluna: o movimento deixou de existir, e um movimento que não existe não pode estar conferido.';
COMMENT ON COLUMN pagamentos.conciliado_em IS
  'F32/E103: quando esta saída casou com uma linha do extrato do banco. O estorno do pagamento limpa a coluna, pelo mesmo motivo da parcela.';

-- O filtro "só o não conciliado" abre por loja + faixa de data + IS NULL.
-- Índice PARCIAL, o idioma que o repo já usa em `contas_pagar_recorrencia_unica`:
-- o índice guarda só o que a query procura, e encolhe conforme o mês fecha.
CREATE INDEX IF NOT EXISTS parcelas_nao_conciliadas_idx
  ON parcelas (loja_id, recebido_em) WHERE conciliado_em IS NULL;
CREATE INDEX IF NOT EXISTS pagamentos_nao_conciliados_idx
  ON pagamentos (loja_id, data) WHERE conciliado_em IS NULL;

COMMIT;
