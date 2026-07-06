import type { Request, Response, NextFunction } from "express";
import { lerSessao, lerSessaoComLoja, COOKIE_NOME } from "../lib/auth.js";

function getSessaoId(req: Request): string | null {
  const cookieHeader = req.headers.cookie ?? "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k?.trim() ?? "", decodeURIComponent(v.join("="))];
    }),
  );
  return cookies[COOKIE_NOME] ?? null;
}

export async function requireSessao(req: Request, res: Response, next: NextFunction) {
  const id = getSessaoId(req);
  if (!id) return res.status(401).json({ erro: "Não autenticado" });
  const data = await lerSessao(id);
  if (!data) return res.status(401).json({ erro: "Sessão inválida ou expirada" });
  (req as any).sessao = data.sessao;
  (req as any).usuario = data.usuario;
  next();
}

export async function requireSessaoComLoja(req: Request, res: Response, next: NextFunction) {
  const id = getSessaoId(req);
  if (!id) return res.status(401).json({ erro: "Não autenticado" });
  const data = await lerSessaoComLoja(id);
  if (!data) return res.status(403).json({ erro: "Selecione uma loja" });
  (req as any).sessao = data.sessao;
  (req as any).usuario = data.usuario;
  (req as any).loja = data.loja;
  next();
}

export function getSessaoIdFromReq(req: Request): string | null {
  return getSessaoId(req);
}
