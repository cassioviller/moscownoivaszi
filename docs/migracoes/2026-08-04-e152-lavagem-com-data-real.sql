-- E152 — a lavagem tem fim REAL, não só previsto
--
-- A régua de 7 dias está CERTA — a dona respondeu (P1): "uma semana, lavagem
-- externa". O defeito nunca foi o número. É que a lavagem era a ÚNICA etapa do
-- ciclo sem data real, e a assimetria estava escrita no schema:
--
--   retirada  · prevista: casamento − usoDiasAntes  · real: retirada_data_real  ✅
--   devolução · prevista: casamento + usoDiasDepois · real: devolucao_data_real ✅
--   lavagem   · prevista: [fimUso+1, fimUso+7]      · real: NENHUMA             ❌
--
-- A peça voltava da lavanderia na quarta e continuava ocupada até domingo,
-- pendurada na arara, e ninguém tinha como dizer ao sistema que ela chegou. O
-- caso `Adelita` do caderno — a mesma peça alugada de novo em 7 dias — era
-- recusado sem oferecer caminho nenhum.

BEGIN;

ALTER TABLE bloqueio_vestidos
  ADD COLUMN IF NOT EXISTS lavagem_concluida_em timestamptz;

COMMIT;

-- Nada a fazer com as linhas existentes: nulo significa "a lavagem segue a
-- régua prevista", que é exatamente o comportamento de hoje. A coluna só muda
-- alguma coisa quando alguém AFIRMA um fato — e o fato fica gravado, como toda
-- data real do bloqueio. Não é um jeito de furar a régua.
--
-- O envelope materializado (`ocupacao_inicio`/`ocupacao_fim`) é recalculado
-- pela rota a cada PATCH que mexe em janela; as linhas antigas não mudam
-- porque a coluna nasce nula e a janela delas não se altera.
