import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Loja, Sessao, Usuario } from "@/generated/prisma/client";

export const SESSAO_TTL_MS = 8 * 60 * 60 * 1000; // 8h absolute, sem rolling

function novoId(): string {
  return randomBytes(32).toString("base64url");
}

async function cleanupSessoesExpiradasDoUsuario(usuarioId: string): Promise<void> {
  await prisma.sessao.deleteMany({
    where: { usuarioId, expiraEm: { lt: new Date() } },
  });
}

export async function criarSessao(usuarioId: string): Promise<Sessao> {
  await cleanupSessoesExpiradasDoUsuario(usuarioId);
  return prisma.sessao.create({
    data: {
      id: novoId(),
      usuarioId,
      expiraEm: new Date(Date.now() + SESSAO_TTL_MS),
    },
  });
}

export async function lerSessao(
  sessionId: string,
): Promise<{ sessao: Sessao; usuario: Usuario } | null> {
  const sessao = await prisma.sessao.findUnique({
    where: { id: sessionId },
    include: { usuario: true },
  });
  if (!sessao) return null;
  if (sessao.expiraEm.getTime() <= Date.now()) return null;
  if (!sessao.usuario.ativo) return null;
  const { usuario, ...rest } = sessao;
  return { sessao: rest as Sessao, usuario };
}

export async function destruirSessao(sessionId: string): Promise<void> {
  // deleteMany não lança quando não acha; idempotente por construção.
  await prisma.sessao.deleteMany({ where: { id: sessionId } });
}

// ──────────────────── Loja ativa (B.2-T1) ────────────────────

/**
 * Lojas que o usuário pode abrir, ordenadas por nome. Filtra lojas desativadas.
 * NÃO passa por `tenantPrisma` (cross-loja por construção — é a pergunta "que lojas
 * esse user vê no seletor?"; não é leitura de dados de tenant).
 *
 * - **Super-admin** (staff da plataforma): vê TODAS as lojas ativas do sistema,
 *   independente de `UsuarioLoja`.
 * - **Demais**: só as lojas vinculadas via `UsuarioLoja`.
 */
export async function listarLojasDoUsuario(usuarioId: string): Promise<Loja[]> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { isSuperAdmin: true },
  });

  if (usuario?.isSuperAdmin) {
    return prisma.loja.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
    });
  }

  const vinculos = await prisma.usuarioLoja.findMany({
    where: { usuarioId, loja: { ativo: true } },
    include: { loja: true },
    orderBy: { loja: { nome: "asc" } },
  });
  return vinculos.map((v) => v.loja);
}

/**
 * Atalho do auto-select: se o usuário tem exatamente 1 loja, devolve ela; senão null.
 */
export async function selecionarLojaPorPadrao(
  usuarioId: string,
): Promise<Loja | null> {
  const lojas = await listarLojasDoUsuario(usuarioId);
  return lojas.length === 1 ? lojas[0] : null;
}

/**
 * Grava `Sessao.lojaAtivaId`. Valida o acesso ANTES de gravar — não confia no input.
 * Sem permissão, lança e não grava nada (falha fechada).
 *
 * - **Super-admin**: basta a loja existir e estar ativa.
 * - **Demais**: o vínculo `UsuarioLoja(usuarioId, lojaId)` precisa existir.
 *
 * Isolamento entre lojas continua garantido pelo `tenantPrisma` (super-admin opera
 * dentro de UMA loja por vez via `lojaAtivaId`). Esta validação é só "quem pode abrir o quê".
 */
export async function definirLojaAtiva(
  sessaoId: string,
  lojaId: string,
  usuarioId: string,
): Promise<void> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { isSuperAdmin: true },
  });

  if (usuario?.isSuperAdmin) {
    const loja = await prisma.loja.findUnique({ where: { id: lojaId } });
    if (!loja || !loja.ativo) throw new Error("loja inexistente ou inativa");
  } else {
    const vinculo = await prisma.usuarioLoja.findUnique({
      where: { usuarioId_lojaId: { usuarioId, lojaId } },
    });
    if (!vinculo) throw new Error("acesso negado à loja");
  }

  await prisma.sessao.update({
    where: { id: sessaoId },
    data: { lojaAtivaId: lojaId },
  });
}

/**
 * Variante por-id de `getSessaoComLoja` (testável sem mockar `cookies()`).
 * Retorna null se: sessão inválida, `lojaAtivaId` null, ou a loja foi desativada.
 */
export async function lerSessaoComLojaId(
  sessionId: string,
): Promise<{ sessao: Sessao; usuario: Usuario; loja: Loja } | null> {
  const base = await lerSessao(sessionId);
  if (!base) return null;
  if (!base.sessao.lojaAtivaId) return null;
  const loja = await prisma.loja.findUnique({
    where: { id: base.sessao.lojaAtivaId },
  });
  if (!loja || !loja.ativo) return null;
  return { sessao: base.sessao, usuario: base.usuario, loja };
}

export type GateEstado =
  | { tipo: "sem-sessao" }
  | { tipo: "sem-loja-ativa"; sessao: Sessao }
  | { tipo: "ok"; sessao: Sessao; usuario: Usuario; loja: Loja };

/**
 * Variante por-id do gate de layout (testável sem mockar `cookies()`).
 * Recebe o id do cookie (ou null) e devolve o estado; quem redireciona é o layout.
 * Loja desativada cai em "sem-loja-ativa" → força nova seleção (invariante de segurança).
 */
export async function gateSessaoLojaAtivaPorId(
  sessionId: string | null,
): Promise<GateEstado> {
  if (!sessionId) return { tipo: "sem-sessao" };
  const base = await lerSessao(sessionId);
  if (!base) return { tipo: "sem-sessao" };
  if (!base.sessao.lojaAtivaId) {
    return { tipo: "sem-loja-ativa", sessao: base.sessao };
  }
  const loja = await prisma.loja.findUnique({
    where: { id: base.sessao.lojaAtivaId },
  });
  if (!loja || !loja.ativo) {
    return { tipo: "sem-loja-ativa", sessao: base.sessao };
  }
  return { tipo: "ok", sessao: base.sessao, usuario: base.usuario, loja };
}
