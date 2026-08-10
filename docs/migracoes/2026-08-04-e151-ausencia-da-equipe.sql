-- E151 — a ausência da vendedora existe, e a agenda a respeita
--
-- `grep -rniE "ferias|ausencia|indisponibilidade|folga"` em `artifacts/` e
-- `lib/` não devolvia NENHUMA ocorrência de domínio: a agenda sabia de cabine e
-- de vendedora, e nada tornava uma pessoa indisponível num intervalo.
--
-- No papel a ausência é a PRIMEIRA coisa que a página declara, e mora no
-- caderno que conta as peças que saem: 7 das 14 páginas a anunciam, todas entre
-- 22/06 e 16/08 ("Volta da Marilza 15 dias"). Nas semanas de férias a agenda
-- esvazia — 09 e 10/07 riscados com um X que atravessa as duas colunas; 18, 19,
-- 22, 23 e 24 de agosto sem um único compromisso.

BEGIN;

CREATE TABLE IF NOT EXISTS ausencias (
  id          text PRIMARY KEY,
  loja_id     text NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  -- `usuario_id`, não `vendedora_id`: quem falta é uma pessoa da equipe, e a
  -- agenda a chama de vendedora só porque é o papel dela ali.
  usuario_id  text NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  -- `date` e não `timestamptz`: férias são DIAS inteiros no fuso da loja, e o
  -- intervalo é inclusivo nas duas pontas — quem digita 10/07 a 20/07 está
  -- dizendo que no dia 20 ainda não voltou.
  inicio      date NOT NULL,
  fim         date NOT NULL,
  motivo      text,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- A agenda pergunta "quem falta NESTE dia?" a cada agendamento; o índice é por
-- loja + período porque é assim que a pergunta chega.
CREATE INDEX IF NOT EXISTS ausencias_loja_periodo_idx ON ausencias (loja_id, inicio, fim);

COMMIT;

-- Nada a fazer com o que já existe: a tabela nasce vazia, e a ausência só
-- impede o agendamento NOVO — o que já está na agenda não é tocado (isso é
-- decisão de produto, e ninguém pediu remarcação em lote).
