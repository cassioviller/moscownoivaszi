-- Provas/ajustes antigos são descartáveis (sistema em testes, sem backfill — aprovado pelo dono).
-- Limpa os dados antes de remodelar para que as colunas NOT NULL possam ser adicionadas.
DELETE FROM "AjusteChecklistItem";
DELETE FROM "Ajuste";
DELETE FROM "Prova";

-- CreateEnum
CREATE TYPE "AtendimentoTipo" AS ENUM ('ATENDIMENTO', 'PROVA');

-- DropForeignKey
ALTER TABLE "Ajuste" DROP CONSTRAINT "Ajuste_provaId_fkey";

-- DropForeignKey
ALTER TABLE "Prova" DROP CONSTRAINT "Prova_bloqueioId_fkey";

-- DropForeignKey
ALTER TABLE "Prova" DROP CONSTRAINT "Prova_lojaId_fkey";

-- AlterTable: Ajuste passa a apontar para Atendimento
ALTER TABLE "Ajuste" DROP COLUMN "provaId",
ADD COLUMN     "atendimentoId" TEXT NOT NULL;

-- AlterTable: Atendimento ganha tipo + bloqueioId
ALTER TABLE "Atendimento" ADD COLUMN     "bloqueioId" TEXT,
ADD COLUMN     "tipo" "AtendimentoTipo" NOT NULL DEFAULT 'ATENDIMENTO';

-- DropTable
DROP TABLE "Prova";

-- DropEnum
DROP TYPE "ProvaTipo";

-- DropEnum
DROP TYPE "ProvaComparecimento";

-- AddForeignKey
ALTER TABLE "Atendimento" ADD CONSTRAINT "Atendimento_bloqueioId_fkey" FOREIGN KEY ("bloqueioId") REFERENCES "BloqueioVestido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ajuste" ADD CONSTRAINT "Ajuste_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "Atendimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
