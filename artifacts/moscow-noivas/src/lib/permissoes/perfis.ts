// src/lib/permissoes/perfis.ts
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { normalizarAcessos, type AcessosModulos } from "@/lib/permissoes/modulos";

export type PerfilListado = { id: string; nome: string; acessosModulos: AcessosModulos };

/** Perfis globais (templates), ordenados por nome. */
export async function listarPerfis(): Promise<PerfilListado[]> {
  const perfis = await prisma.perfil.findMany({ orderBy: { nome: "asc" } });
  return perfis.map((p) => ({
    id: p.id,
    nome: p.nome,
    acessosModulos: normalizarAcessos(p.acessosModulos),
  }));
}

/** Edita o template global de um perfil (super-admin). */
export async function salvarTemplate(perfilId: string, acessos: unknown): Promise<void> {
  await prisma.perfil.update({
    where: { id: perfilId },
    data: { acessosModulos: normalizarAcessos(acessos) as never },
  });
}

/** Overrides de uma loja: Map perfilId → acessos normalizados. Escopado pelo guard. */
export async function listarOverridesDaLoja(lojaId: string): Promise<Map<string, AcessosModulos>> {
  const rows = await tenantPrisma(prisma, lojaId).perfilOverrideLoja.findMany({});
  return new Map(rows.map((r) => [r.perfilId, normalizarAcessos(r.acessosModulos)]));
}

/** Cria/atualiza o override de um perfil na loja (snapshot). where não-único → guard injeta lojaId. */
export async function salvarOverride(lojaId: string, perfilId: string, acessos: unknown): Promise<void> {
  const tp = tenantPrisma(prisma, lojaId);
  const acessosModulos = normalizarAcessos(acessos);
  const existente = await tp.perfilOverrideLoja.findFirst({ where: { perfilId } });
  if (existente) {
    await tp.perfilOverrideLoja.updateMany({ where: { perfilId }, data: { acessosModulos } as never });
  } else {
    await tp.perfilOverrideLoja.create({ data: { perfilId, acessosModulos } as never });
  }
}

/** Remove o override (volta a herdar o template). Idempotente. */
export async function removerOverride(lojaId: string, perfilId: string): Promise<void> {
  await tenantPrisma(prisma, lojaId).perfilOverrideLoja.deleteMany({ where: { perfilId } });
}
