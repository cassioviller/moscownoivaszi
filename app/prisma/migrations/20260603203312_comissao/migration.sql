-- AlterTable
ALTER TABLE "Contrato" ADD COLUMN     "comissaoEstornadaEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ComissaoRegra" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedoraId" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "bonusAcumulaFaixas" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComissaoRegra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComissaoFaixa" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "regraId" TEXT NOT NULL,
    "minAcumulado" DECIMAL(10,2) NOT NULL,
    "maxAcumulado" DECIMAL(10,2),
    "percentual" DECIMAL(5,2),
    "bonusFixo" DECIMAL(10,2),

    CONSTRAINT "ComissaoFaixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComissaoFechamento" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedoraId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "totalVendas" DECIMAL(10,2) NOT NULL,
    "percentualAplicado" DECIMAL(5,2),
    "valorComissao" DECIMAL(10,2) NOT NULL,
    "valorBonus" DECIMAL(10,2) NOT NULL,
    "valorTotal" DECIMAL(10,2) NOT NULL,
    "contaPagarId" TEXT,
    "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComissaoFechamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComissaoFechamento_contaPagarId_key" ON "ComissaoFechamento"("contaPagarId");

-- CreateIndex
CREATE UNIQUE INDEX "ComissaoFechamento_lojaId_vendedoraId_competencia_key" ON "ComissaoFechamento"("lojaId", "vendedoraId", "competencia");

-- AddForeignKey
ALTER TABLE "ComissaoRegra" ADD CONSTRAINT "ComissaoRegra_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoRegra" ADD CONSTRAINT "ComissaoRegra_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoFaixa" ADD CONSTRAINT "ComissaoFaixa_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoFaixa" ADD CONSTRAINT "ComissaoFaixa_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "ComissaoRegra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoFechamento" ADD CONSTRAINT "ComissaoFechamento_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoFechamento" ADD CONSTRAINT "ComissaoFechamento_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoFechamento" ADD CONSTRAINT "ComissaoFechamento_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
