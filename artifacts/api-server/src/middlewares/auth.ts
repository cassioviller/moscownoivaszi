import type { Request, Response, NextFunction } from "express";
import { buscarSessao, buscarLoja, getPermissoes, COOKIE_NOME } from "../lib/auth";
import { acaoDoMetodo, acaoDoRequest, podeNoModulo, type Acao } from "../lib/permissoes";

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
 * Exige que o perfil do usuário na loja ativa possa a AÇÃO neste módulo.
 * Deve ser montado DEPOIS de requireSessaoComLoja. Superadmin sempre passa.
 *
 * Sem `acao`, ela vem do método HTTP (GET→ver, POST→criar, resto→editar), que é
 * o certo para rotas REST. Passe explicitamente quando a rota mentir sobre o
 * que faz — um POST que só consulta pede `"ver"`, não `"criar"`.
 */
export function requireModulo(modulo: string, acao?: Acao) {
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
    const exigida = acao ?? acaoDoRequest(req.method, req.path);
    const permissoes = await getPermissoes(usuario.id, lojaId, false);
    if (!permissoes || !podeNoModulo(permissoes, modulo, exigida)) {
      res.status(403).json({ error: "ACESSO_NEGADO_MODULO", modulo, acao: exigida });
      return;
    }
    next();
  };
}
