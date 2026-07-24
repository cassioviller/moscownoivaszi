-- E54 — o fechamento passa a guardar QUAIS contratos cancelados ele
-- reconciliou, para a reabertura poder desfazer exatamente isso.
--
-- Aditivo e sem prompt: `drizzle-kit push` aplica esta coluna sozinho (só
-- rename/drop é que travam sem TTY). Fica versionado porque um banco já
-- existente precisa dela antes de a rota de reabertura rodar.

ALTER TABLE comissao_fechamentos
  ADD COLUMN IF NOT EXISTS estorno_contrato_ids jsonb;

-- Deliberadamente SEM backfill. NULL significa "fechamento anterior ao E54,
-- que não guardou a lista" e é diferente de `[]` ("não havia estorno a
-- reconciliar"). Preencher tudo com `[]` apagaria essa distinção e faria a
-- reabertura de um fechamento antigo afirmar que não havia estorno — quando a
-- verdade é que não dá para saber.
