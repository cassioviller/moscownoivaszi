import type { Request, Response, NextFunction } from "express";
import { buscarSessao, buscarLoja, COOKIE_NOME } from "../lib/auth";

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
