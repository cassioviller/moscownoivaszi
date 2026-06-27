-- CreateEnum
CREATE TYPE "ProvaTipo" AS ENUM ('PRIMEIRA', 'INTERMEDIARIA', 'FINAL');

-- CreateEnum
CREATE TYPE "ProvaComparecimento" AS ENUM ('AGENDADA', 'COMPARECEU', 'FALTOU', 'REMARCADA');

-- CreateEnum
CREATE TYPE "AjusteStatus" AS ENUM ('PENDENTE', 'FEITO');

-- CreateTable
CREATE TABLE "Prova" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "bloqueioId" TEXT NOT NULL,
    "dataReal" TIMESTAMP(3) NOT NULL,
    "tipo" "ProvaTipo" NOT NULL,
    "comparecimento" "ProvaComparecimento" NOT NULL DEFAULT 'AGENDADA',
    "observacao" TEXT,
    "responsavel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prova_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ajuste" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "provaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" "AjusteStatus" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ajuste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjusteChecklistItem" (
    "id" TEXT NOT NULL,
    "ajusteId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "feito" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AjusteChecklistItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Prova" ADD CONSTRAINT "Prova_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prova" ADD CONSTRAINT "Prova_bloqueioId_fkey" FOREIGN KEY ("bloqueioId") REFERENCES "BloqueioVestido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ajuste" ADD CONSTRAINT "Ajuste_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ajuste" ADD CONSTRAINT "Ajuste_provaId_fkey" FOREIGN KEY ("provaId") REFERENCES "Prova"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteChecklistItem" ADD CONSTRAINT "AjusteChecklistItem_ajusteId_fkey" FOREIGN KEY ("ajusteId") REFERENCES "Ajuste"("id") ON DELETE CASCADE ON UPDATE CASCADE;
