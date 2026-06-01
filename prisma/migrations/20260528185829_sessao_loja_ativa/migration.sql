-- AlterTable
ALTER TABLE "Sessao" ADD COLUMN     "lojaAtivaId" TEXT;

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_lojaAtivaId_fkey" FOREIGN KEY ("lojaAtivaId") REFERENCES "Loja"("id") ON DELETE SET NULL ON UPDATE CASCADE;
