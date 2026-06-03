-- CreateEnum
CREATE TYPE "AtendimentoSituacao" AS ENUM ('AGENDADO', 'EM_ATENDIMENTO', 'CONCLUIDO', 'FALTOU');

-- CreateEnum
CREATE TYPE "AtendimentoDesfecho" AS ENUM ('RESERVOU', 'VAI_PENSAR', 'NAO_SERVIU');

-- AlterTable
ALTER TABLE "Atendimento" ADD COLUMN     "atendidoEm" TIMESTAMP(3),
ADD COLUMN     "desfecho" "AtendimentoDesfecho",
ADD COLUMN     "situacao" "AtendimentoSituacao" NOT NULL DEFAULT 'AGENDADO';
