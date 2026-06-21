-- AlterTable
ALTER TABLE "RegraDisponibilidade" ADD COLUMN     "atendimentoAberturaHora" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "atendimentoFechamentoHora" INTEGER NOT NULL DEFAULT 19;

-- CreateTable
CREATE TABLE "Cabine" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cabine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Atendimento" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "cabineId" TEXT NOT NULL,
    "vendedoraId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Atendimento_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Cabine" ADD CONSTRAINT "Cabine_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atendimento" ADD CONSTRAINT "Atendimento_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atendimento" ADD CONSTRAINT "Atendimento_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atendimento" ADD CONSTRAINT "Atendimento_cabineId_fkey" FOREIGN KEY ("cabineId") REFERENCES "Cabine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atendimento" ADD CONSTRAINT "Atendimento_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
