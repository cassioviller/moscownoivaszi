-- CreateIndex
CREATE UNIQUE INDEX "Atendimento_cabineId_inicio_key" ON "Atendimento"("cabineId", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "Atendimento_lojaId_vendedoraId_inicio_key" ON "Atendimento"("lojaId", "vendedoraId", "inicio");
