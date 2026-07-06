-- Conciliação saneada de contratos: forma de pagamento vira enum, parcela ganha CANCELADA,
-- e a entrada deixa de ser campo do contrato (passa a ser a parcela nº0 do plano).
-- Migração destrutiva sobre dados de teste/demo (sem backfill — convenção do projeto):
-- as colunas texto-livre `formaPagamento`/`formaRecebimento` são recriadas como enum (perdem
-- o valor antigo) e `entrada` é removida. O seed-demo repopula com valores do enum.

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO', 'BOLETO', 'TRANSFERENCIA', 'OUTRO');

-- AlterEnum
-- (só ADICIONA o valor; não o usa nesta migração → ok rodar em transação no Postgres)
ALTER TYPE "ParcelaStatus" ADD VALUE 'CANCELADA';

-- AlterTable
ALTER TABLE "Contrato" DROP COLUMN "entrada",
ADD COLUMN     "canceladoMotivo" TEXT,
DROP COLUMN "formaPagamento",
ADD COLUMN     "formaPagamento" "FormaPagamento";

-- AlterTable
ALTER TABLE "Parcela" DROP COLUMN "formaRecebimento",
ADD COLUMN     "formaRecebimento" "FormaPagamento";
