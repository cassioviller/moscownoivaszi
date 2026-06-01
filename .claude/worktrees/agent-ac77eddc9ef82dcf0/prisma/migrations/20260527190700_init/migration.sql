-- CreateEnum
CREATE TYPE "AtributoTipo" AS ENUM ('OPCAO_UNICA', 'ESCALA');

-- CreateEnum
CREATE TYPE "Escala" AS ENUM ('POUCO', 'MEDIO', 'MUITO');

-- CreateEnum
CREATE TYPE "Fenda" AS ENUM ('SIM', 'NAO', 'TALVEZ');

-- CreateEnum
CREATE TYPE "LeadEtapa" AS ENUM ('NOVO', 'INTERESSES_PREENCHIDOS', 'ATENDIMENTO_AGENDADO', 'EM_ATENDIMENTO', 'ORCAMENTO_ABERTO', 'CONTRATO_FECHADO', 'EM_PROVAS', 'RETIRADO', 'CASAMENTO_REALIZADO', 'DEVOLVIDO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "LeadOrigem" AS ENUM ('LOJA', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "BloqueioTipo" AS ENUM ('RESERVA_CASAMENTO', 'MANUTENCAO');

-- CreateTable
CREATE TABLE "Loja" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "endereco" TEXT,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Perfil" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "acessosModulos" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Perfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioLoja" (
    "usuarioId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,

    CONSTRAINT "UsuarioLoja_pkey" PRIMARY KEY ("usuarioId","lojaId")
);

-- CreateTable
CREATE TABLE "Atributo" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "AtributoTipo" NOT NULL DEFAULT 'OPCAO_UNICA',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Atributo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtributoOpcao" (
    "id" TEXT NOT NULL,
    "atributoId" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AtributoOpcao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegraDisponibilidade" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "provaDiasAntes" INTEGER NOT NULL DEFAULT 14,
    "provaDuracao" INTEGER NOT NULL DEFAULT 2,
    "usoDiasAntes" INTEGER NOT NULL DEFAULT 3,
    "usoDiasDepois" INTEGER NOT NULL DEFAULT 2,
    "lavagemDiasDepois" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "RegraDisponibilidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vestido" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "precoBase" DECIMAL(10,2) NOT NULL,
    "tamanho" TEXT,
    "cor" TEXT,
    "categoria" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vestido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VestidoAtributo" (
    "vestidoId" TEXT NOT NULL,
    "atributoId" TEXT NOT NULL,
    "opcaoId" TEXT NOT NULL,

    CONSTRAINT "VestidoAtributo_pkey" PRIMARY KEY ("vestidoId","atributoId")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "etapa" "LeadEtapa" NOT NULL DEFAULT 'NOVO',
    "noivaNome" TEXT NOT NULL,
    "noivoNome" TEXT,
    "cerimonialista" TEXT,
    "whatsapp" TEXT,
    "casamentoData" TIMESTAMP(3),
    "casamentoHorario" TEXT,
    "casamentoLocal" TEXT,
    "origem" "LeadOrigem" NOT NULL DEFAULT 'LOJA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadInteresse" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "volumeSaia" "Escala",
    "brilho" "Escala",
    "cauda" "Escala",
    "fenda" "Fenda",
    "algoAMais" TEXT,
    "naoQuerUsar" TEXT,
    "tetoOrcamento" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadInteresse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadInteresseAtributo" (
    "leadInteresseId" TEXT NOT NULL,
    "atributoId" TEXT NOT NULL,
    "opcaoId" TEXT NOT NULL,

    CONSTRAINT "LeadInteresseAtributo_pkey" PRIMARY KEY ("leadInteresseId","atributoId")
);

-- CreateTable
CREATE TABLE "BloqueioVestido" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vestidoId" TEXT NOT NULL,
    "leadId" TEXT,
    "tipo" "BloqueioTipo" NOT NULL,
    "casamentoData" TIMESTAMP(3),
    "provaDataReal" TIMESTAMP(3),
    "retiradaDataReal" TIMESTAMP(3),
    "devolucaoDataReal" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloqueioVestido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RegraDisponibilidade_lojaId_key" ON "RegraDisponibilidade"("lojaId");

-- CreateIndex
CREATE UNIQUE INDEX "Vestido_lojaId_codigo_key" ON "Vestido"("lojaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "LeadInteresse_leadId_key" ON "LeadInteresse"("leadId");

-- AddForeignKey
ALTER TABLE "UsuarioLoja" ADD CONSTRAINT "UsuarioLoja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioLoja" ADD CONSTRAINT "UsuarioLoja_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioLoja" ADD CONSTRAINT "UsuarioLoja_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "Perfil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atributo" ADD CONSTRAINT "Atributo_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtributoOpcao" ADD CONSTRAINT "AtributoOpcao_atributoId_fkey" FOREIGN KEY ("atributoId") REFERENCES "Atributo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegraDisponibilidade" ADD CONSTRAINT "RegraDisponibilidade_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vestido" ADD CONSTRAINT "Vestido_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VestidoAtributo" ADD CONSTRAINT "VestidoAtributo_vestidoId_fkey" FOREIGN KEY ("vestidoId") REFERENCES "Vestido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VestidoAtributo" ADD CONSTRAINT "VestidoAtributo_atributoId_fkey" FOREIGN KEY ("atributoId") REFERENCES "Atributo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VestidoAtributo" ADD CONSTRAINT "VestidoAtributo_opcaoId_fkey" FOREIGN KEY ("opcaoId") REFERENCES "AtributoOpcao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadInteresse" ADD CONSTRAINT "LeadInteresse_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadInteresseAtributo" ADD CONSTRAINT "LeadInteresseAtributo_leadInteresseId_fkey" FOREIGN KEY ("leadInteresseId") REFERENCES "LeadInteresse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadInteresseAtributo" ADD CONSTRAINT "LeadInteresseAtributo_atributoId_fkey" FOREIGN KEY ("atributoId") REFERENCES "Atributo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadInteresseAtributo" ADD CONSTRAINT "LeadInteresseAtributo_opcaoId_fkey" FOREIGN KEY ("opcaoId") REFERENCES "AtributoOpcao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioVestido" ADD CONSTRAINT "BloqueioVestido_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioVestido" ADD CONSTRAINT "BloqueioVestido_vestidoId_fkey" FOREIGN KEY ("vestidoId") REFERENCES "Vestido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioVestido" ADD CONSTRAINT "BloqueioVestido_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
