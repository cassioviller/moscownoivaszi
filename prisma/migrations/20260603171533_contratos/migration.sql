-- CreateEnum
CREATE TYPE "ContratoStatus" AS ENUM ('ATIVO', 'CANCELADO');

-- CreateTable
CREATE TABLE "Contrato" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "orcamentoId" TEXT,
    "bloqueioVestidoId" TEXT,
    "vendedoraId" TEXT NOT NULL,
    "status" "ContratoStatus" NOT NULL DEFAULT 'ATIVO',
    "cpf" TEXT,
    "vestidoDescricao" TEXT,
    "valorTotal" DECIMAL(10,2) NOT NULL,
    "entrada" DECIMAL(10,2),
    "formaPagamento" TEXT,
    "dataCasamento" TIMESTAMP(3),
    "dataRetirada" TIMESTAMP(3),
    "dataDevolucao" TIMESTAMP(3),
    "observacoes" TEXT,
    "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_orcamentoId_key" ON "Contrato"("orcamentoId");

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_bloqueioVestidoId_fkey" FOREIGN KEY ("bloqueioVestidoId") REFERENCES "BloqueioVestido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
