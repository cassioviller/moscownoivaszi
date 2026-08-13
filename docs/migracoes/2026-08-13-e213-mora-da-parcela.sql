-- E213 — a parcela vencida tem multa e juros (contrato, cláusula 9ª).
--
-- > CLÁUSULA 9ª — Em caso de inadimplemento por parte do LOCATÁRIO quanto ao
-- > pagamento do aluguel, deverá incidir sobre o valor do presente instrumento,
-- > multa pecuniária de 2%, juros de mora de 1% ao mês e correção monetária.
--
-- O sistema JÁ SABIA que a parcela estava atrasada desde o E49: `estaAtrasada`
-- é derivada (nunca gravada, porque o status no banco não sabe que dia é hoje)
-- e `projecao.emAtraso` totaliza o saldo vencido. **O número existia e a multa
-- não** — era a última linha da Onda A em que o ateliê deixava dinheiro na
-- mesa por o sistema não contar.
--
-- **A conta NÃO vira coluna, e é a decisão de desenho do épico.** Ela cresce
-- todo dia: uma coluna com o acréscimo estaria errada a partir da meia-noite
-- seguinte. O que o banco guarda são dois fatos DATADOS, e nada mais.
--
-- 1. O PERDÃO (`mora_perdoada_em` + `mora_perdoada_motivo`). A decisão da dona
--    (13/08/2026) foi automático COM gesto de perdoar: o contrato diz "deverá
--    incidir", então o padrão é cumprir a cláusula, e quem quiser abrir mão diz
--    por quê. O motivo fica na COLUNA e não só na trilha, pela lição do E214:
--    se ficasse só lá, a próxima leitura da cobrança veria uma parcela vencida
--    sem acréscimo e sem explicação ao lado — e é por este campo que a tela
--    desenha o selo.
--
-- 2. A origem `MORA` da parcela. **Ela é a única origem que não nasce de um
--    gesto de cobrar — nasce de RECEBER.** Conta derivada não sobrevive ao
--    pagamento do principal: quem paga R$ 500,00 de uma dívida de R$ 515,00
--    zera o saldo aberto e, com ele, o acréscimo. Medido antes da decisão: a
--    parcela ficava PARCIAL devendo R$ 15,00 que o sistema dizia não existir.
--    A escolha foi quitar no principal — o balcão deu quitação, e é o que ele
--    faz — e cristalizar só o que entra a mais, como linha PAGA com a conta na
--    descrição. O dinheiro da multa passa a ser rastreável no carnê, no caixa e
--    na comissão como qualquer outro.
--
-- As três mudanças são aditivas: nenhuma linha existente muda de valor, e as
-- duas colunas nascem NULL em todas as parcelas — que é a verdade, porque
-- nenhuma multa foi perdoada até hoje.

-- O `ALTER TYPE … ADD VALUE` não roda dentro de transação em Postgres < 12 e,
-- mesmo depois, não pode ser usado no mesmo bloco em que o valor novo é lido.
-- Rode esta linha sozinha, antes do resto.
ALTER TYPE parcela_origem ADD VALUE IF NOT EXISTS 'MORA';

BEGIN;

ALTER TABLE parcelas ADD COLUMN IF NOT EXISTS mora_perdoada_em timestamptz;
ALTER TABLE parcelas ADD COLUMN IF NOT EXISTS mora_perdoada_motivo text;

COMMIT;

-- Conferência (as duas devem devolver linha):
--   SELECT unnest(enum_range(NULL::parcela_origem));
--     -- PLANO, AVULSA, AVARIA, REAJUSTE_DATA, ATRASO_DEVOLUCAO, MORA
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'parcelas' AND column_name LIKE 'mora%';
--
-- **Confira no banco de `DATABASE_URL`, não no que você decorou** — a lição que
-- o E211 pagou e o E214 herdou. E acrescentar valor a um enum do banco pede
-- acrescentá-lo ao `openapi.yaml` no mesmo gesto: o Zod de resposta não estripa
-- valor fora do enum, ele EXPLODE, e a `varredura-enums-do-banco-no-spec`
-- (nascida do defeito que o E212 entregou) passou a pregar as duas listas.
