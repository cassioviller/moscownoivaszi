-- CreateTable
CREATE TABLE "PerfilOverrideLoja" (
    "lojaId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "acessosModulos" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerfilOverrideLoja_pkey" PRIMARY KEY ("lojaId","perfilId")
);

-- AddForeignKey
ALTER TABLE "PerfilOverrideLoja" ADD CONSTRAINT "PerfilOverrideLoja_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilOverrideLoja" ADD CONSTRAINT "PerfilOverrideLoja_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "Perfil"("id") ON DELETE CASCADE ON UPDATE CASCADE;
