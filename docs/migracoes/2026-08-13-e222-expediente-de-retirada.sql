-- E222 — o ateliê tem DOIS expedientes, e o sistema só conhecia um
-- (contrato de locação, cláusulas 4ª e 5ª).
--
-- > CLÁUSULA 4ª — O horário de funcionamento da LOCADORA é de terça a sexta,
-- > das 10:30 às 19:00, e aos sábados das 10:30 às 18:00.
--
-- > CLÁUSULA 5ª — A locação tem início às 10:30 do dia da retirada e término
-- > às 18:00 do dia da devolução.
--
-- O horário que o sistema já tinha (`atendimento_abertura_hora`,
-- `atendimento_fechamento_hora`, `dias_funcionamento`) governa ATENDIMENTO — as
-- provas. Ele é sete dias até as 20h, veio do caderno de papel (S-A8: sete
-- compromissos em cinco domingos, provas às 18:30) e está CERTO para provas.
--
-- A 4ª governa RETIRADA e DEVOLUÇÃO, que é outro expediente. **Não é
-- contradição — é ausência**: um ateliê que prova aos domingos e só entrega de
-- terça a sábado é perfeitamente coerente, e o modelo é que tinha um calendário
-- onde o negócio tem dois. A primeira versão da auditoria listou a 4ª como
-- colisão, e o erro de leitura está registrado em `B-auditoria.md`.
--
-- **As quatro colunas nascem com o expediente do papel**, e por isso a migração
-- é aditiva de verdade: nenhuma linha existente muda de valor, e uma loja que
-- nunca abrir Configurações passa a valer o que o contrato dela já diz.
--
-- Por que MINUTOS e não horas, como o expediente de atendimento: a cláusula
-- abre às 10:30, e hora inteira não escreve meia hora.
--
-- Por que o sábado tem coluna própria: o instrumento dá a ele um expediente
-- mais curto, e não uma exceção de calendário. Um número só teria de escolher
-- entre recusar retirada às 18:30 numa quarta (que o contrato permite) ou
-- aceitá-la no sábado (que ele não permite).

BEGIN;

ALTER TABLE regra_disponibilidade
  ADD COLUMN IF NOT EXISTS retirada_dias jsonb NOT NULL DEFAULT '[2,3,4,5,6]'::jsonb;

-- 630 = 10:30 (4ª).
ALTER TABLE regra_disponibilidade
  ADD COLUMN IF NOT EXISTS retirada_abertura_minutos integer NOT NULL DEFAULT 630;

-- 1140 = 19:00 (4ª), de terça a sexta.
ALTER TABLE regra_disponibilidade
  ADD COLUMN IF NOT EXISTS retirada_fechamento_minutos integer NOT NULL DEFAULT 1140;

-- 1080 = 18:00 (4ª), só no sábado.
ALTER TABLE regra_disponibilidade
  ADD COLUMN IF NOT EXISTS retirada_fechamento_sabado_minutos integer NOT NULL DEFAULT 1080;

COMMIT;

-- Conferência (deve devolver as quatro colunas com os defaults do papel):
--   SELECT column_name, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'regra_disponibilidade' AND column_name LIKE 'retirada%';
--
-- **Confira no banco de `DATABASE_URL`, não no que você decorou** — a lição que
-- o E211 pagou e o E214 herdou: o `drizzle-kit push` já disse "Changes applied"
-- sem aplicar nada.
--
-- O que esta migração NÃO faz, e é decisão medida: **não corrige contrato
-- nenhum já gravado**. Medido no banco de dev antes de escrever o épico — 723
-- contratos, 1 com data de retirada e ZERO com data de devolução —, e o único
-- que existe cai numa sexta às 16:00, dentro do expediente. A régua vale para o
-- que entrar daqui para frente; o que já está gravado não é reescrito por
-- migração, pela mesma razão do E197.
