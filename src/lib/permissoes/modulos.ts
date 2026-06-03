// src/lib/permissoes/modulos.ts
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { PERFIL_ADMIN_ID } from "@/lib/admin/usuarios";

export const MODULOS = ["leads", "interesses", "vestidos", "ajustes", "config", "financeiro"] as const;
export const ACOES = ["ver", "criar", "editar"] as const;
export type Modulo = (typeof MODULOS)[number];
export type Acao = (typeof ACOES)[number];
export type AcessosModulos = Record<Modulo, Record<Acao, boolean>>;

/**
 * Módulos renderizados na grade de permissões. `config` gateia a gestão do
 * catálogo (telas /catalogo); `ajustes` gateia a tela da costureira (provas e
 * ajustes) — por isso aparecem na grade, deixando admins concederem esses
 * acessos a perfis customizados por loja. O mecanismo de hidden input do
 * MatrizPermissoes segue valendo para qualquer módulo futuro fora da grade.
 */
export const MODULOS_VISIVEIS: Modulo[] = [...MODULOS];

/**
 * Lê o shape de acessos de um FormData de matriz (checkbox `${modulo}.${acao}` === "on").
 * Módulos ocultos da grade chegam via inputs hidden emitidos pelo MatrizPermissoes,
 * então o snapshot preserva o que o template concedia (não zera config). normalizarAcessos
 * aplica o shape/coerência depois.
 */
export function lerAcessosDoForm(fd: FormData): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  for (const m of MODULOS) {
    out[m] = {} as Record<string, boolean>;
    for (const a of ACOES) out[m][a] = fd.get(`${m}.${a}`) === "on";
  }
  return out;
}

/**
 * Reconcilia um acessosModulos cru contra o shape atual (MODULOS × ACOES):
 * - chave conhecida → respeita; desconhecida → descarta;
 * - módulo/ação ausente → false (fail-closed);
 * - coerência: criar || editar ⇒ ver.
 * Fonte da verdade do shape: o CÓDIGO, nunca o banco.
 */
export function normalizarAcessos(raw: unknown): AcessosModulos {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as AcessosModulos;
  for (const m of MODULOS) {
    const mod = (src[m] && typeof src[m] === "object" ? src[m] : {}) as Record<string, unknown>;
    const criar = mod.criar === true;
    const editar = mod.editar === true;
    const ver = mod.ver === true || criar || editar;
    out[m] = { ver, criar, editar };
  }
  return out;
}

/** Snapshot: se há override, ignora o template para aquele perfil×loja. */
export function resolverAcessosEfetivos(template: unknown, override: unknown | null): AcessosModulos {
  return normalizarAcessos(override != null ? override : template);
}

/**
 * Única porta de enforcement de permissão por módulo×ação.
 * super-admin → sempre true; perfil Admin → acesso total escopado à loja.
 * Senão resolve o efetivo = override(loja) ?? template(perfil), normalizado.
 * Sem vínculo / módulo ausente / flag ausente → false (falha-fechada).
 * UsuarioLoja é a exceção do guard (lida via `prisma` direto, por usuarioId);
 * o override por loja passa pelo tenantPrisma (where não-único {perfilId}).
 */
export async function podeNoModulo(
  usuarioId: string,
  lojaId: string,
  modulo: Modulo,
  acao: Acao,
): Promise<boolean> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { isSuperAdmin: true },
  });
  if (usuario?.isSuperAdmin) return true;

  const vinculo = await prisma.usuarioLoja.findUnique({
    where: { usuarioId_lojaId: { usuarioId, lojaId } },
    select: { perfilId: true, perfil: { select: { acessosModulos: true } } },
  });
  if (!vinculo) return false;
  if (vinculo.perfilId === PERFIL_ADMIN_ID) return true;

  const override = await tenantPrisma(prisma, lojaId).perfilOverrideLoja.findFirst({
    where: { perfilId: vinculo.perfilId },
    select: { acessosModulos: true },
  });
  const efetivo = resolverAcessosEfetivos(
    vinculo.perfil.acessosModulos,
    override?.acessosModulos ?? null,
  );
  return efetivo[modulo][acao] === true;
}
