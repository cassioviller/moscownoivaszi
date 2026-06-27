-- CreateEnum
CREATE TYPE "ReservaStatus" AS ENUM ('EM_MONTAGEM', 'CONFIRMADA');

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "casamentoData" TIMESTAMP(3) NOT NULL,
    "status" "ReservaStatus" NOT NULL DEFAULT 'EM_MONTAGEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reserva_lojaId_leadId_idx" ON "Reserva"("lojaId", "leadId");

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: BloqueioVestido ganha reservaId
ALTER TABLE "BloqueioVestido" ADD COLUMN "reservaId" TEXT;

-- AddForeignKey
ALTER TABLE "BloqueioVestido" ADD CONSTRAINT "BloqueioVestido_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: uma cabeça por grupo (lojaId, leadId, casamentoData) das reservas existentes (CONFIRMADA).
INSERT INTO "Reserva" ("id", "lojaId", "leadId", "casamentoData", "status", "createdAt", "updatedAt")
SELECT
    md5(g."lojaId" || '|' || g."leadId" || '|' || g."casamentoData"::text),
    g."lojaId", g."leadId", g."casamentoData", 'CONFIRMADA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "lojaId", "leadId", "casamentoData"
    FROM "BloqueioVestido"
    WHERE "tipo" = 'RESERVA_CASAMENTO' AND "leadId" IS NOT NULL AND "casamentoData" IS NOT NULL
) g;

-- Backfill: liga cada bloqueio à sua cabeça (join pelas 3 colunas do grupo).
UPDATE "BloqueioVestido" bv
SET "reservaId" = r."id"
FROM "Reserva" r
WHERE bv."tipo" = 'RESERVA_CASAMENTO'
  AND bv."leadId" IS NOT NULL AND bv."casamentoData" IS NOT NULL
  AND r."lojaId" = bv."lojaId" AND r."leadId" = bv."leadId" AND r."casamentoData" = bv."casamentoData";
