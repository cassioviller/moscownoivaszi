-- CreateTable
CREATE TABLE "SaldoReferencia" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "dataReferencia" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaldoReferencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaldoReferencia_lojaId_dataReferencia_idx" ON "SaldoReferencia"("lojaId", "dataReferencia");

-- AddForeignKey
ALTER TABLE "SaldoReferencia" ADD CONSTRAINT "SaldoReferencia_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
