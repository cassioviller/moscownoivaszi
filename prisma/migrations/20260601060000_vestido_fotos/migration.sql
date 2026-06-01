-- Até 2 fotos por vestido, guardadas otimizadas (WebP) como bytea no Postgres.
CREATE TABLE "VestidoFoto" (
    "id" TEXT NOT NULL,
    "vestidoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "largura" INTEGER NOT NULL,
    "altura" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VestidoFoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VestidoFoto_vestidoId_ordem_key" ON "VestidoFoto"("vestidoId", "ordem");

ALTER TABLE "VestidoFoto" ADD CONSTRAINT "VestidoFoto_vestidoId_fkey"
    FOREIGN KEY ("vestidoId") REFERENCES "Vestido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
