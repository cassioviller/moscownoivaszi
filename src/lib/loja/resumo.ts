// src/lib/loja/resumo.ts
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";

export type ResumoLoja = { vestidos: number; noivas: number };

/**
 * Resumo da loja para o dashboard. ÚNICO ponto de leitura de dado de tenant
 * desta fatia — passa OBRIGATORIAMENTE pelo guard `tenantPrisma`. Acesso direto
 * via `prisma.vestido.*` seria bug de segurança (ver docs/estado-atual.md).
 */
export async function carregarResumoLoja(lojaId: string): Promise<ResumoLoja> {
  const db = tenantPrisma(prisma, lojaId);
  const [vestidos, noivas] = await Promise.all([
    db.vestido.count(),
    db.lead.count(),
  ]);
  return { vestidos, noivas };
}
