-- CreateEnum
CREATE TYPE "ParcelaStatus" AS ENUM ('PREVISTA', 'PAGA');

-- CreateTable
CREATE TABLE "Parcela" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "descricao" TEXT,
    "valorPrevisto" DECIMAL(10,2) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "ParcelaStatus" NOT NULL DEFAULT 'PREVISTA',
    "valorRecebido" DECIMAL(10,2),
    "recebidoEm" TIMESTAMP(3),
    "formaRecebimento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Parcela_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Parcela" ADD CONSTRAINT "Parcela_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcela" ADD CONSTRAINT "Parcela_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
