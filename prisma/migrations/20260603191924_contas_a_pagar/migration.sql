-- CreateEnum
CREATE TYPE "ContaPagarTipo" AS ENUM ('DESPESA', 'FORNECEDOR', 'SALARIO', 'COMISSAO');

-- CreateEnum
CREATE TYPE "ContaPagarStatus" AS ENUM ('PREVISTA', 'PAGA');

-- CreateTable
CREATE TABLE "ContaPagar" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "tipo" "ContaPagarTipo" NOT NULL,
    "colaboradorId" TEXT,
    "competencia" TEXT,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT,
    "fornecedor" TEXT,
    "valorPrevisto" DECIMAL(10,2) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "ContaPagarStatus" NOT NULL DEFAULT 'PREVISTA',
    "salarioRecorrenteId" TEXT,
    "origemComissaoFechamentoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "colaboradorId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "valorPago" DECIMAL(10,2) NOT NULL,
    "forma" TEXT,
    "observacoes" TEXT,
    "enviadoContabilidadeEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagamentoItem" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "pagamentoId" TEXT NOT NULL,
    "contaPagarId" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PagamentoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalarioRecorrente" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "valorBase" DECIMAL(10,2) NOT NULL,
    "diaVencimento" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalarioRecorrente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PagamentoItem_contaPagarId_key" ON "PagamentoItem"("contaPagarId");

-- CreateIndex
CREATE UNIQUE INDEX "SalarioRecorrente_lojaId_colaboradorId_key" ON "SalarioRecorrente"("lojaId", "colaboradorId");

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagamentoItem" ADD CONSTRAINT "PagamentoItem_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagamentoItem" ADD CONSTRAINT "PagamentoItem_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagamentoItem" ADD CONSTRAINT "PagamentoItem_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalarioRecorrente" ADD CONSTRAINT "SalarioRecorrente_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalarioRecorrente" ADD CONSTRAINT "SalarioRecorrente_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
