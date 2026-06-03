-- CreateEnum
CREATE TYPE "OrcamentoStatus" AS ENUM ('RASCUNHO', 'ENVIADO', 'APROVADO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "OrcamentoItemTipo" AS ENUM ('VESTIDO', 'SERVICO', 'AJUSTE');

-- CreateEnum
CREATE TYPE "DescontoTipo" AS ENUM ('PERCENTUAL', 'VALOR');

-- CreateTable
CREATE TABLE "Orcamento" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "atendimentoId" TEXT,
    "vendedoraId" TEXT NOT NULL,
    "status" "OrcamentoStatus" NOT NULL DEFAULT 'RASCUNHO',
    "descontoTipo" "DescontoTipo",
    "descontoValor" DECIMAL(10,2),
    "validade" TIMESTAMP(3),
    "observacoes" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrcamentoItem" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "tipo" "OrcamentoItemTipo" NOT NULL,
    "vestidoId" TEXT,
    "descricao" TEXT NOT NULL,
    "valorUnitario" DECIMAL(10,2) NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrcamentoItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "Atendimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoItem" ADD CONSTRAINT "OrcamentoItem_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoItem" ADD CONSTRAINT "OrcamentoItem_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoItem" ADD CONSTRAINT "OrcamentoItem_vestidoId_fkey" FOREIGN KEY ("vestidoId") REFERENCES "Vestido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
