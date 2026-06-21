import { query, queryOne } from "./db.js";
import { PERFIL_ADMIN_ID } from "./auth.js";

export const MODULOS = ["leads", "interesses", "vestidos", "ajustes", "config", "financeiro"] as const;
export const ACOES = ["ver", "criar", "editar"] as const;
export type Modulo = (typeof MODULOS)[number];
export type Acao = (typeof ACOES)[number];
export type AcessosModulos = Record<Modulo, Record<Acao, boolean>>;

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

export async function podeNoModulo(
  usuarioId: string,
  lojaId: string,
  modulo: Modulo,
  acao: Acao,
): Promise<boolean> {
  const usuario = await queryOne<{ isSuperAdmin: boolean }>(
    `SELECT "isSuperAdmin" FROM "Usuario" WHERE id = $1`,
    [usuarioId],
  );
  if (usuario?.isSuperAdmin) return true;

  const vinculo = await queryOne<{ perfilId: string; acessosModulos: unknown }>(
    `SELECT ul."perfilId", p."acessosModulos"
     FROM "UsuarioLoja" ul JOIN "Perfil" p ON p.id = ul."perfilId"
     WHERE ul."usuarioId" = $1 AND ul."lojaId" = $2`,
    [usuarioId, lojaId],
  );
  if (!vinculo) return false;
  if (vinculo.perfilId === PERFIL_ADMIN_ID) return true;

  const overrideRow = await queryOne<{ acessosModulos: unknown }>(
    `SELECT "acessosModulos" FROM "PerfilOverrideLoja" WHERE "lojaId" = $1 AND "perfilId" = $2`,
    [lojaId, vinculo.perfilId],
  );
  const efetivo = normalizarAcessos(overrideRow?.acessosModulos ?? vinculo.acessosModulos);
  return efetivo[modulo]?.[acao] === true;
}

export async function ehAdminDaLoja(usuarioId: string, lojaId: string): Promise<boolean> {
  const u = await queryOne<{ isSuperAdmin: boolean }>(
    `SELECT "isSuperAdmin" FROM "Usuario" WHERE id = $1`,
    [usuarioId],
  );
  if (u?.isSuperAdmin) return true;
  const vinc = await queryOne<{ perfilId: string }>(
    `SELECT "perfilId" FROM "UsuarioLoja" WHERE "usuarioId" = $1 AND "lojaId" = $2`,
    [usuarioId, lojaId],
  );
  return vinc?.perfilId === PERFIL_ADMIN_ID;
}
