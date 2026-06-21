import { prisma } from "@/lib/db";
import { gerarHash } from "@/lib/auth/senha";
import type { Loja, Usuario } from "@/generated/prisma/client";

// Perfis vêm do seed. Papéis são DADOS (UsuarioLoja.perfilId), não enums novos.
// Os IDs moram numa folha pura (./perfis-ids) para não acoplar quem só precisa do ID
// a este módulo (que arrasta prisma + bcrypt).
// Re-exportados via "export from" (não import+export) para evitar bug do Turbopack
// onde variáveis importadas e re-exportadas ficam undefined no chunk de SSR.
export { PERFIL_ADMIN_ID, PERFIL_VENDEDORA_ID, PERFIL_RECEPCAO_ID } from "./perfis-ids";

const SENHA_MIN = 8;

// ───────────────────────── Lojas ─────────────────────────

/** Todas as lojas, ordenadas por nome (console mostra ativas e inativas). */
export async function listarLojas(): Promise<Loja[]> {
  return prisma.loja.findMany({ orderBy: { nome: "asc" } });
}

/** Cria uma loja. Apenas super-admin (guard na camada de rota/action). */
export async function criarLoja(nome: string): Promise<Loja> {
  const n = nome.trim();
  if (!n) throw new Error("Nome da loja é obrigatório");
  return prisma.loja.create({ data: { nome: n } });
}

// ───────────────────────── Admins ─────────────────────────

export interface NovoAdmin {
  nome: string;
  email: string;
  senha: string;
  lojaIds: string[];
}

export interface AdminListado {
  id: string;
  nome: string;
  email: string;
  lojas: string[]; // nomes das lojas onde é Admin
}

/** Admins (não super-admin) com as lojas onde têm perfil Admin. */
export async function listarAdmins(): Promise<AdminListado[]> {
  const usuarios = await prisma.usuario.findMany({
    where: { isSuperAdmin: false, lojas: { some: { perfilId: "perfil-admin" } } },
    orderBy: { nome: "asc" },
    include: { lojas: { include: { loja: true } } },
  });
  return usuarios.map((u) => ({
    id: u.id,
    nome: u.nome,
    email: u.email,
    lojas: u.lojas
      .filter((ul) => ul.perfilId === "perfil-admin")
      .map((ul) => ul.loja.nome)
      .sort(),
  }));
}

/**
 * Cria um `Usuario` + `UsuarioLoja(perfilId)` em 1+ lojas, atômico. Núcleo
 * compartilhado por `criarAdmin` e `criarVendedora`. Valida nome/email/senha,
 * e-mail único e existência das lojas. Senha via bcrypt. Quem pode chamar é
 * garantido na camada de rota/action.
 */
async function criarUsuarioComPerfil(input: NovoAdmin, perfilId: string): Promise<Usuario> {
  const nome = input.nome.trim();
  const email = input.email.trim().toLowerCase(); // normaliza igual ao login
  const lojaIds = [...new Set(input.lojaIds)];

  if (!nome) throw new Error("Nome é obrigatório");
  if (!email) throw new Error("E-mail é obrigatório");
  if (input.senha.length < SENHA_MIN) {
    throw new Error(`Senha deve ter ao menos ${SENHA_MIN} caracteres`);
  }
  if (lojaIds.length === 0) throw new Error("Selecione ao menos uma loja");

  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) throw new Error("Já existe um usuário com esse e-mail");

  const lojas = await prisma.loja.findMany({
    where: { id: { in: lojaIds } },
    select: { id: true },
  });
  if (lojas.length !== lojaIds.length) throw new Error("Loja inexistente");

  const perfil = await prisma.perfil.findUnique({ where: { id: perfilId } });
  if (!perfil) throw new Error("Perfil não encontrado — rode o seed");

  const senhaHash = await gerarHash(input.senha);

  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({ data: { nome, email, senhaHash } });
    await tx.usuarioLoja.createMany({
      data: lojaIds.map((lojaId) => ({ usuarioId: usuario.id, lojaId, perfilId })),
    });
    return usuario;
  });
}

/** Cria um admin (perfil Admin) em 1+ lojas. Quem chama (super-admin) é guardado na rota. */
export async function criarAdmin(input: NovoAdmin): Promise<Usuario> {
  return criarUsuarioComPerfil(input, "perfil-admin");
}

// ─────────────────────── Vendedoras / equipe ───────────────────────

export interface NovaVendedora {
  nome: string;
  email: string;
  senha: string;
  lojaId: string;
}

export interface MembroEquipe {
  id: string;
  nome: string;
  email: string;
  perfil: string;
}

/** True se o usuário pode gerenciar a loja: super-admin OU perfil Admin nela. */
export async function ehAdminDaLoja(usuarioId: string, lojaId: string): Promise<boolean> {
  const u = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { isSuperAdmin: true },
  });
  if (u?.isSuperAdmin) return true;
  const vinc = await prisma.usuarioLoja.findUnique({
    where: { usuarioId_lojaId: { usuarioId, lojaId } },
    select: { perfilId: true },
  });
  return vinc?.perfilId === "perfil-admin";
}

/** Membros vinculados a uma loja (qualquer perfil), ordenados por nome. */
export async function listarEquipe(lojaId: string): Promise<MembroEquipe[]> {
  const vinculos = await prisma.usuarioLoja.findMany({
    where: { lojaId },
    include: { usuario: true, perfil: true },
    orderBy: { usuario: { nome: "asc" } },
  });
  return vinculos.map((v) => ({
    id: v.usuario.id,
    nome: v.usuario.nome,
    email: v.usuario.email,
    perfil: v.perfil.nome,
  }));
}

/** Cria uma vendedora (perfil Vendedora) vinculada a UMA loja. Guard na rota/action. */
export async function criarVendedora(input: NovaVendedora): Promise<Usuario> {
  return criarUsuarioComPerfil(
    { nome: input.nome, email: input.email, senha: input.senha, lojaIds: [input.lojaId] },
    "perfil-vendedora",
  );
}
