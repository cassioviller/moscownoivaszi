-- E100/F37 — a noiva pode dizer que NÃO pode ir.
--
-- Até aqui a única ação dela no portal era "confirmo que vou", e ninguém abre um
-- link para dizer que vai: abre para dizer que não. O aviso que faltava é o que
-- devolve à loja os três recursos mais caros do ateliê — a cabine, a hora da
-- vendedora e o vestido separado — com antecedência em vez de com a ausência.
--
-- Coluna NOVA, e não um valor a mais em `situacao`, pela lição do E97: este é o
-- TERCEIRO fato da mesma família. `contatado_em` é a loja ter procurado,
-- `confirmado_em` é a noiva ter dito que vem, `remarcacao_pedida_em` é a noiva
-- ter dito que não pode. Guardar dois deles no mesmo campo foi o que o E85 fez
-- sobre o E39, e o E97 precisou de migração e de arqueologia na trilha de
-- auditoria para desfazer.
--
-- O atendimento continua AGENDADO: isto é um PEDIDO, não uma remarcação. O
-- horário segue preso até alguém da loja decidir.
--
-- Idempotente: `IF NOT EXISTS` para o banco que já recebeu o push.

BEGIN;

-- Guarda: aborta se a tabela não estiver no estado esperado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atendimentos' AND column_name = 'confirmado_em'
  ) THEN
    RAISE EXCEPTION 'atendimentos.confirmado_em não existe — o E97 não foi aplicado neste banco';
  END IF;
END $$;

ALTER TABLE atendimentos
  ADD COLUMN IF NOT EXISTS remarcacao_pedida_em timestamptz;

COMMENT ON COLUMN atendimentos.remarcacao_pedida_em IS
  'F37/E100: quando a NOIVA pediu remarcação pelo portal. Terceiro fato da família do E97 (contatado_em = a loja procurou, confirmado_em = ela disse que vem). O atendimento segue AGENDADO: é pedido, não remarcação.';

COMMIT;
