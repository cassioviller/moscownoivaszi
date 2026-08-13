-- E214 — a taxa de limpeza e a de dano ganham faixa (contrato, cláusulas 14ª e 15ª).
--
-- > 14ª — Caso os trajes e/ou acessórios sejam devolvidos com excesso de sujeira
-- > ou manchas, será cobrada uma taxa a partir de R$ 350,00 até R$ 2.500,00 para
-- > a limpeza das peças (caso sujeira extraordinária, como por exemplo tinta,
-- > esmalte, vômito, sangue, ou a barra com muita sujeira de terra ou barro).
-- >
-- > 15ª — Se houver qualquer dano aos trajes e/ou acessórios locados, ou sujeira
-- > ou mancha que não podem ser removidas com lavagem, o LOCATÁRIO pagará uma
-- > taxa a ser definida no momento da devolução de acordo com o tipo de dano,
-- > NÃO EXCEDENDO CINCO VEZES O VALOR DO ALUGUEL DE CADA PEÇA DANIFICADA.
--
-- `avarias.custo_reparo` era campo LIVRE: sem piso, sem teto, e sem dizer de
-- qual das duas cláusulas o número saiu. R$ 50,00 e R$ 9.000,00 entravam iguais.
--
-- Duas mudanças.
--
-- 1. `avaria_tipo` (LIMPEZA · DANO) e a coluna `avarias.tipo`. As duas cláusulas
--    têm réguas de FORMA diferente — a da limpeza é absoluta (350 a 2.500) e a
--    do dano é relativa à peça (5 × o aluguel dela, que mora em
--    `contrato_itens.valor_unitario`) —, então conferir um número sem saber a
--    cláusula é impossível.
--
--    O default é DANO, e é o valor certo para o que já existe: a tabela se chama
--    `avarias` e a coluna, `custo_reparo`. É também o único dos dois que não
--    acusa ninguém retroativamente — o DANO não tem piso, então nenhuma linha
--    antiga passa a estar "abaixo dos R$ 350,00" por causa desta migração.
--
-- 2. `avarias.justificativa_da_taxa`. A régua NÃO impede a dona de decidir:
--    obriga a dizer por quê. Valor fora da faixa entra com a razão escrita, e a
--    razão vai junto para a trilha (`AVARIA_FORA_DA_FAIXA`), com os números do
--    veredicto ao lado.
--
--    Nula é o caso normal. Não há retroatividade: nenhuma avaria existente é
--    reavaliada, porque a régua roda na ESCRITA, não na leitura.
--
-- Idempotente: `IF NOT EXISTS` nos três.

-- 1) O tipo. `CREATE TYPE` não aceita IF NOT EXISTS, então o bloco faz a guarda.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'avaria_tipo') THEN
    CREATE TYPE avaria_tipo AS ENUM ('LIMPEZA', 'DANO');
  END IF;
END
$$;

-- 2) De qual cláusula a taxa saiu.
ALTER TABLE avarias
  ADD COLUMN IF NOT EXISTS tipo avaria_tipo NOT NULL DEFAULT 'DANO';

-- 3) Por que o valor saiu da faixa.
ALTER TABLE avarias
  ADD COLUMN IF NOT EXISTS justificativa_da_taxa text;

-- Conferência no BANCO, não no console — o `drizzle-kit push` do E211 imprimiu
-- "Changes applied" sem aplicar o ADD VALUE de um enum. (Aqui ele aplicou: criar
-- um tipo novo é caminho diferente de acrescentar valor a um existente. A régua
-- continua sendo conferir.)
--
--   SELECT unnest(enum_range(NULL::avaria_tipo));
--   SELECT column_name, udt_name, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'avarias'
--      AND column_name IN ('tipo', 'justificativa_da_taxa');
--
-- E a contagem do que a migração classificou como DANO, que é o número a
-- conferir com a dona antes de a régua começar a valer numa instalação com
-- história:
--
--   SELECT tipo, count(*), min(custo_reparo), max(custo_reparo)
--     FROM avarias GROUP BY tipo;
