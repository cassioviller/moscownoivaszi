-- E97/F6 — separar "a loja falou" de "a noiva respondeu".
--
-- O DEFEITO. `atendimentos.confirmado_em` guardava DOIS fatos diferentes no
-- mesmo lugar, e depois de gravados ficavam indistinguíveis:
--
--   1. A recepção abriu o WhatsApp pela fila do dia. O carimbo acontecia no
--      `onClick` do link — ANTES de escrever, ANTES de enviar, ANTES de a noiva
--      ler. É um ato da LOJA, e nem sequer prova que a mensagem saiu.
--   2. A noiva clicou "confirmo" no portal (E85). É a resposta DELA, e é o
--      único número sobre o qual o ateliê toma uma decisão física — separar a
--      peça, reservar a cabine, escalar a costureira.
--
-- Gravados no mesmo campo, a linha sumia da fila de confirmação e da contagem
-- do sino nos dois casos, sem tela nenhuma que desfizesse.
--
-- A HISTÓRIA IMPORTA AQUI. A coluna nasceu no E39 com o significado (1) — o
-- comentário do schema ainda diz "quando a recepção confirmou a presença por
-- WhatsApp". O E85 sobrepôs o significado (2) sem renomear nada. Ou seja: o
-- segundo sentido é o intruso, mas é ele que a agenda deve mostrar como
-- "confirmada", porque é o único que corresponde a uma resposta.
--
-- O BACKLOG DIZIA QUE O PASSADO NÃO DAVA PARA SEPARAR. Dá. Toda confirmação
-- pelo portal grava uma linha em `audit_log` com `acao = 'PROVA_CONFIRMADA'` e
-- `entidade_id` = o id do atendimento (routes/portal.ts, autoria da noiva, o
-- mesmo rastro do aceite do E74). Então o backfill abaixo não chuta: ele
-- pergunta à trilha quem carimbou.
--
--   - tem linha PROVA_CONFIRMADA  → foi a NOIVA  → `confirmado_em` fica.
--   - não tem                     → foi a LOJA   → vira `contatado_em`, e
--                                                  `confirmado_em` é limpo.
--
-- Nada se perde: o instante continua gravado, na coluna que diz a verdade
-- sobre ele. Para desfazer, basta `UPDATE atendimentos SET confirmado_em =
-- contatado_em, contatado_em = NULL WHERE contatado_em IS NOT NULL` — o que
-- também mostra por que a operação é segura: ela é uma renomeação de valor por
-- linha, não uma perda.
--
-- Em transação e com guarda, no padrão do E91: aborta se o banco não estiver no
-- estado esperado em vez de aplicar meio caminho.

BEGIN;

-- Guarda 1: a coluna nova não pode já existir (migração aplicada duas vezes).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atendimentos' AND column_name = 'contatado_em'
  ) THEN
    RAISE EXCEPTION 'E97: atendimentos.contatado_em já existe — migração já aplicada';
  END IF;
END $$;

-- Guarda 2: a coluna de origem precisa existir com o tipo esperado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atendimentos'
      AND column_name = 'confirmado_em'
      AND data_type = 'timestamp with time zone'
  ) THEN
    RAISE EXCEPTION 'E97: atendimentos.confirmado_em ausente ou com tipo inesperado';
  END IF;
END $$;

ALTER TABLE atendimentos
  ADD COLUMN contatado_em timestamptz;

COMMENT ON COLUMN atendimentos.contatado_em IS
  'E97: quando a LOJA mandou mensagem (clique na fila do dia). Ato nosso — não prova resposta da noiva.';

COMMENT ON COLUMN atendimentos.confirmado_em IS
  'E97: quando a NOIVA respondeu/confirmou (portal, E85). Só isto conta como presença confirmada.';

-- O backfill guiado pela trilha, não por chute.
UPDATE atendimentos a
   SET contatado_em = a.confirmado_em,
       confirmado_em = NULL
 WHERE a.confirmado_em IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM audit_log l
      WHERE l.entidade = 'atendimento'
        AND l.entidade_id = a.id
        AND l.acao = 'PROVA_CONFIRMADA'
   );

-- Índice para a fila do dia: ela pergunta "quem falta contatar hoje" por loja.
CREATE INDEX IF NOT EXISTS atendimentos_loja_contato_idx
  ON atendimentos (loja_id, contatado_em);

COMMIT;
