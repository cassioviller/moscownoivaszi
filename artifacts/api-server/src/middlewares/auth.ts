import type { Request, Response, NextFunction } from "express";
import { buscarSessao, buscarLoja, getPermissoes, COOKIE_NOME } from "../lib/auth";

/** Um módulo é liberado se marcado `true` ou se tem ao menos um sub-acesso true. */
function moduloLiberado(acesso: boolean | Record<string, boolean> | undefined): boolean {
  if (acesso === true) return true;
  if (acesso && typeof acesso === "object") return Object.values(acesso).some(Boolean);
  return false;
}

export async function requireSessao(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sessionId = req.cookies[COOKIE_NOME];
  if (!sessionId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const data = await buscarSessao(sessionId);
  if (!data) {
    res.status(401).json({ error: "Sessão inválida ou expirada" });
    return;
  }

  req.sessao = data.sessao;
  req.usuario = data.usuario;
  next();
}

export async function requireSessaoComLoja(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sessionId = req.cookies[COOKIE_NOME];
  if (!sessionId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const data = await buscarSessao(sessionId);
  if (!data || !data.sessao.lojaAtivaId) {
    res.status(401).json({ error: "Selecione uma loja" });
    return;
  }

  const loja = await buscarLoja(data.sessao.lojaAtivaId);
  if (!loja) {
    res.status(403).json({ error: "Loja ativa inválida" });
    return;
  }

  const lojaIdParam = Array.isArray(req.params.lojaId) ? req.params.lojaId[0] : req.params.lojaId;
  if (lojaIdParam && lojaIdParam !== data.sessao.lojaAtivaId) {
    res.status(403).json({ error: "Acesso negado a esta loja" });
    return;
  }

  req.sessao = data.sessao;
  req.usuario = data.usuario;
  req.lojaAtiva = loja;
  next();
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.usuario?.isSuperAdmin) {
    res.status(403).json({ error: "Acesso negado (SuperAdmin only)" });
    return;
  }
  next();
}

/**
 * Exige que o perfil do usuário na loja ativa tenha acesso ao módulo.
 * Deve ser montado DEPOIS de requireSessaoComLoja. Superadmin sempre passa.
 */
export function requireModulo(modulo: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const usuario = req.usuario;
    const lojaId = req.sessao?.lojaAtivaId;
    if (!usuario || !lojaId) {
      res.status(401).json({ error: "Selecione uma loja" });
      return;
    }
    if (usuario.isSuperAdmin) {
      next();
      return;
    }
    const permissoes = await getPermissoes(usuario.id, lojaId, false);
    if (!permissoes || !moduloLiberado(permissoes[modulo] as boolean | Record<string, boolean> | undefined)) {
      res.status(403).json({ error: "ACESSO_NEGADO_MODULO", modulo });
      return;
    }
    next();
  };
}
