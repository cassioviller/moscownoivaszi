import { Router, type IRouter } from "express";
import { db, usuariosTable, sessoesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { 
  LoginBody, 
  LoginResponse, 
  GetMeResponse, 
  SelecionarLojaBody, 
  SelecionarLojaResponse 
} from "@workspace/api-zod";
import { 
  compararSenha, 
  criarSessao, 
  buscarSessao, 
  buscarLojasUsuario, 
  buscarLoja,
  COOKIE_NOME 
} from "../lib/auth";
import { requireSessao } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [usuario] = await db.select().from(usuariosTable).where(eq(usuariosTable.email, parsed.data.email.toLowerCase().trim()));
  
  if (!usuario || !usuario.ativo) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const senhaValida = await compararSenha(parsed.data.senha, usuario.senhaHash);
  if (!senhaValida) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const sessao = await criarSessao(usuario.id);
  const lojas = await buscarLojasUsuario(usuario.id, usuario.isSuperAdmin);

  res.cookie(COOKIE_NOME, sessao.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: sessao.expiraEm,
  });

  res.json(LoginResponse.parse({
    usuario,
    lojaAtivaId: sessao.lojaAtivaId,
    lojas,
  }));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const sessionId = req.cookies[COOKIE_NOME];
  if (sessionId) {
    await db.delete(sessoesTable).where(eq(sessoesTable.id, sessionId));
  }
  res.clearCookie(COOKIE_NOME);
  res.status(204).send();
});

router.get("/auth/me", requireSessao, async (req, res): Promise<void> => {
  const usuario = req.usuario!;
  const sessao = req.sessao!;
  const lojas = await buscarLojasUsuario(usuario.id, usuario.isSuperAdmin);

  res.json(GetMeResponse.parse({
    usuario,
    lojaAtivaId: sessao.lojaAtivaId,
    lojas,
  }));
});

router.post("/auth/selecionar-loja", requireSessao, async (req, res): Promise<void> => {
  const parsed = SelecionarLojaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { lojaId } = parsed.data;
  const usuario = req.usuario!;
  const sessao = req.sessao!;

  let temAcesso = false;
  if (usuario.isSuperAdmin) {
    const loja = await buscarLoja(lojaId);
    if (loja) temAcesso = true;
  } else {
    const lojas = await buscarLojasUsuario(usuario.id, false);
    temAcesso = lojas.some(l => l.id === lojaId);
  }

  if (!temAcesso) {
    res.status(403).json({ error: "Acesso negado a esta loja" });
    return;
  }

  await db.update(sessoesTable)
    .set({ lojaAtivaId: lojaId })
    .where(eq(sessoesTable.id, sessao.id));

  const updatedSessao = await buscarSessao(sessao.id);
  const lojas = await buscarLojasUsuario(usuario.id, usuario.isSuperAdmin);

  res.json(SelecionarLojaResponse.parse({
    usuario,
    lojaAtivaId: updatedSessao?.sessao.lojaAtivaId,
    lojas,
  }));
});

export default router;
