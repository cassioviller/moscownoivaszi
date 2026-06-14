-- CreateEnum
CREATE TYPE "CobrancaCanal" AS ENUM ('WHATSAPP', 'TELEFONE', 'PRESENCIAL', 'OUTRO');

-- CreateTable
CREATE TABLE "RegistroCobranca" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "canal" "CobrancaCanal" NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroCobranca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroCobranca_lojaId_leadId_data_idx" ON "RegistroCobranca"("lojaId", "leadId", "data");

-- AddForeignKey
ALTER TABLE "RegistroCobranca" ADD CONSTRAINT "RegistroCobranca_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroCobranca" ADD CONSTRAINT "RegistroCobranca_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
