-- S-A8 — o expediente padrão passa a ser o DESTE ateliê, medido no papel dele
--
-- `regra_disponibilidade` nascia com `dias_funcionamento = [1..6]` e
-- `atendimento_fechamento_hora = 19`, e o comentário do código explicava o
-- primeiro com uma afirmação sobre o mundo: *"domingo fechado, como todo ateliê
-- de noiva"*. As 15 páginas de agenda do ateliê refutam a frase:
--
--   · **7 compromissos em 5 domingos** — 19/07 (14h e 18h), 02/08, 09/08,
--     16/08 (14h e 18h) e 13/09, todos prova de noiva;
--   · **6 provas às 18:30**, mais 12 às 18:00. Com prova de 60 min e fechamento
--     às 19h, a última que cabia começava às 18:00 — o horário mais usado do fim
--     do dia era justamente o que o default recusava.
--
-- Nenhum dos dois era bug: os dois sempre foram configuráveis numa linha da
-- tela. O defeito era a ORIGEM — o default não tinha sido tirado de ateliê
-- nenhum, e toda instalação nova nascia com a premissa. Perguntamos, e a dona
-- respondeu: **atende até as 20h**, e **domingo é com hora marcada**.
--
-- ESTE SCRIPT MEXE SÓ NO DEFAULT DA COLUNA, e é de propósito: o horário de uma
-- loja que já existe é dela, não nosso. Quem quiser o novo expediente muda em
-- **Atendimentos → Cabines & horário**, que é uma linha na tela — e é assim que
-- a dona muda o dela.

BEGIN;

ALTER TABLE regra_disponibilidade
  ALTER COLUMN atendimento_fechamento_hora SET DEFAULT 20;

ALTER TABLE regra_disponibilidade
  ALTER COLUMN dias_funcionamento SET DEFAULT '[0, 1, 2, 3, 4, 5, 6]'::jsonb;

COMMIT;

-- Nenhum UPDATE, e nenhuma linha existente muda. O default só vale para a
-- PRÓXIMA loja — que é exatamente quem a S-A8 queria proteger: *"antes de a
-- próxima loja nascer com ela"*.
--
-- A partir daqui, o default do schema e o `HORARIO_PADRAO` do seed são
-- comparados campo a campo por teste (`e147-configuracao-inicial-unit`): a mesma
-- régua estava escrita em três lugares, e a que diverge em silêncio é a que
-- ninguém lê.
