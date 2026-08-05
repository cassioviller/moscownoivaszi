-- S26 — cobrado um reparo, o contrato voltava a conseguir gerar o carnê
--
-- `POST /contratos/:id/parcelas/gerar-plano` perguntava *"este contrato já tem
-- carnê?"* olhando `parcelas.length > 0` — QUALQUER parcela. Na ordem do
-- balcão — a peça volta avariada, cobra-se o conserto, e só então se monta o
-- parcelamento — o contrato ficava em `409 JA_TEM_PLANO` **para sempre**, e sem
-- caminho de volta: a parcela do reparo não se apaga, ela É a cobrança. A venda
-- inteira era parcelada fora do sistema por causa de um reparo de R$ 350.
--
-- A pergunta não era dedutível do dado. Carnê, taxa avulsa e reparo eram todos
-- "uma parcela com um número", e é isso que esta coluna passa a distinguir.

BEGIN;

CREATE TYPE parcela_origem AS ENUM ('PLANO', 'AVULSA', 'AVARIA');

ALTER TABLE parcelas
  ADD COLUMN IF NOT EXISTS origem parcela_origem NOT NULL DEFAULT 'AVULSA';

-- O BACKFILL, e o que ele consegue e não consegue afirmar.
--
-- O reparo tem coluna própria do outro lado desde o E97 (`avarias.parcela_id`),
-- então essas são identificáveis com certeza:
UPDATE parcelas p
   SET origem = 'AVARIA'
  FROM avarias a
 WHERE a.parcela_id = p.id;

-- O resto vira PLANO, e isto é uma APROXIMAÇÃO declarada: a esmagadora maioria
-- das parcelas históricas nasceu do `gerar-plano` ou do fechamento do contrato,
-- e as poucas avulsas lançadas à mão ficam marcadas como carnê. O erro que isso
-- causa é o de HOJE — um contrato com avulsa e sem carnê continua recusando o
-- `gerar-plano` —, ou seja, o backfill não piora nada; ele só não conserta esse
-- caso retroativamente. Marcar tudo como AVULSA seria pior: contratos que TÊM
-- carnê passariam a aceitar um segundo, e aí o defeito seria dívida em dobro.
UPDATE parcelas
   SET origem = 'PLANO'
 WHERE origem = 'AVULSA'
   AND id NOT IN (SELECT parcela_id FROM avarias WHERE parcela_id IS NOT NULL);

COMMIT;

-- A partir daqui, quem escreve declara: `gerar-plano` grava PLANO, a cobrança de
-- avaria grava AVARIA, e a parcela avulsa fica no default. O `numero` continua
-- sendo ORDENAÇÃO — e `numero = 0` continua sendo a ENTRADA, que é a régua que
-- as três telas de parcela, o portal da noiva, a conciliação e o PDF do contrato
-- leem. É por isso que o carnê nasce sempre em 0..N e quem se desloca, quando a
-- ordem do balcão inverte, é o que não é carnê.
