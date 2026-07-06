import { Router } from "express";
import {
  autenticarUsuario, criarSessao, destruirSessao,
  lerSessao, listarLojasDoUsuario, definirLojaAtiva,
  lerSessaoComLoja, COOKIE_NOME, SESSAO_TTL_MS,
} from "../lib/auth.js";
import { getSessaoIdFromReq } from "../middlewares/auth.js";

const router = Router();

function setCookie(res: any, id: string, expiraEm: Date) {
  const isProduction = process.env.NODE_ENV === "production";
  const expStr = expiraEm.toUTCString();
  const secure = isProduction ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NOME}=${id}; HttpOnly; SameSite=Lax; Path=/; Expires=${expStr}${secure}`,
  );
}

function clearCookie(res: any) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NOME}=; HttpOnly; SameSite=Lax; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
  );
}

router.post("/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body ?? {};
    if (!email || !senha) return res.status(400).json({ erro: "Email e senha são obrigatórios" });
    const usuario = await autenticarUsuario(email, senha);
    if (!usuario) return res.status(401).json({ erro: "E-mail ou senha incorretos" });
    const sessao = await criarSessao(usuario.id);
    setCookie(res, sessao.id, sessao.expiraEm);
    res.json({ ok: true, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, isSuperAdmin: usuario.isSuperAdmin } });
  } catch (err) {
    res.status(500).json({ erro: "Erro interno" });
  }
});

router.post("/auth/logout", async (req, res) => {
  const id = getSessaoIdFromReq(req);
  if (id) await destruirSessao(id).catch(() => {});
  clearCookie(res);
  res.json({ ok: true });
});

router.get("/auth/sessao", async (req, res) => {
  const id = getSessaoIdFromReq(req);
  if (!id) return res.status(401).json({ erro: "Não autenticado" });
  const data = await lerSessao(id);
  if (!data) {
    clearCookie(res);
    return res.status(401).json({ erro: "Sessão inválida" });
  }
  const { sessao, usuario } = data;
  // Check if there's an active loja
  let loja = null;
  if (sessao.lojaAtivaId) {
    const sc = await lerSessaoComLoja(id);
    if (sc) loja = { id: sc.loja.id, nome: sc.loja.nome };
  }
  res.json({
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, isSuperAdmin: usuario.isSuperAdmin },
    lojaAtivaId: sessao.lojaAtivaId,
    loja,
  });
});

router.get("/auth/lojas", async (req, res) => {
  const id = getSessaoIdFromReq(req);
  if (!id) return res.status(401).json({ erro: "Não autenticado" });
  const data = await lerSessao(id);
  if (!data) return res.status(401).json({ erro: "Sessão inválida" });
  const lojas = await listarLojasDoUsuario(data.usuario.id);
  res.json({ lojas: lojas.map((l) => ({ id: l.id, nome: l.nome })) });
});

router.post("/auth/selecionar-loja", async (req, res) => {
  const id = getSessaoIdFromReq(req);
  if (!id) return res.status(401).json({ erro: "Não autenticado" });
  const data = await lerSessao(id);
  if (!data) return res.status(401).json({ erro: "Sessão inválida" });
  const { lojaId } = req.body ?? {};
  if (!lojaId) return res.status(400).json({ erro: "lojaId é obrigatório" });
  try {
    await definirLojaAtiva(data.sessao.id, lojaId, data.usuario.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(403).json({ erro: err.message });
  }
});

export default router;
