import { Router, type IRouter } from "express";
import { db, usuariosTable, sessoesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { 
  LoginBody, 
  LoginResponse, 
  GetMeResponse, 
  SelecionarLojaBody, 
  SelecionarLojaResponse,
  TrocarSenhaBody
} from "@workspace/api-zod";
import {
  compararSenhaConstante,
  criarSessao,
  encerrarSessoesDoUsuario,
  hashSenha,
  buscarSessao,
  buscarLojasUsuario,
  buscarLoja,
  getPermissoes,
  COOKIE_NOME
} from "../lib/auth";
import { requireSessao } from "../middlewares/auth";
import { erroDeValidacao } from "../lib/erros";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const [usuario] = await db.select().from(usuariosTable).where(eq(usuariosTable.email, parsed.data.email.toLowerCase().trim()));

  // Sempre roda o compare (contra dummy se não há usuário) para o tempo de
  // resposta não revelar quais e-mails têm conta. A mensagem já era idêntica; o
  // que faltava era igualar o TEMPO.
  const hashParaComparar = usuario && usuario.ativo ? usuario.senhaHash : null;
  const senhaValida = await compararSenhaConstante(parsed.data.senha, hashParaComparar);
  if (!senhaValida) {
    // Sem `detalhe`: aqui o `porStatus` da tela de login é que manda dizer
    // "e-mail ou senha não conferem", e `detalhe` ganharia dele (erro-api.ts:62).
    res.status(401).json({ error: "CREDENCIAIS_INVALIDAS" });
    return;
  }

  const sessao = await criarSessao(usuario.id);
  // Carimbo do último acesso (E18) — a sessão não serve de fonte: logout e
  // expiração apagam a linha.
  await db.update(usuariosTable)
    .set({ ultimoLoginEm: new Date() })
    .where(eq(usuariosTable.id, usuario.id));
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
  const acessosModulos = sessao.lojaAtivaId
    ? await getPermissoes(usuario.id, sessao.lojaAtivaId, usuario.isSuperAdmin)
    : null;

  res.json(GetMeResponse.parse({
    usuario,
    lojaAtivaId: sessao.lojaAtivaId,
    acessosModulos,
    lojas,
  }));
});

/**
 * A própria pessoa troca a própria senha (E57).
 *
 * Exige a senha ATUAL de propósito, inclusive na troca FORÇADA: uma sessão
 * sequestrada não pode virar troca de senha, e quem está sendo forçado sabe a
 * senha (foi o admin quem contou — é exatamente esse o problema que se resolve).
 *
 * Trocar derruba TODAS as sessões da pessoa e reemite a de quem trocou. Sem
 * isso, a troca não resolveria o caso que a motivou: o admin que conhece a
 * senha e já está logado como ela continuaria dentro.
 */
router.post("/auth/senha", requireSessao, async (req, res): Promise<void> => {
  const parsed = TrocarSenhaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const usuarioId = req.usuario!.id;

  const [usuario] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, usuarioId));
  if (!usuario || !(await compararSenhaConstante(parsed.data.senhaAtual, usuario.senhaHash))) {
    res.status(422).json({ error: "SENHA_ATUAL_INCORRETA", detalhe: "A senha atual não confere." });
    return;
  }
  // Repetir a senha antiga passaria pela validação e não trocaria nada — a
  // pessoa sairia da tela achando que se protegeu.
  if (await compararSenhaConstante(parsed.data.novaSenha, usuario.senhaHash)) {
    res.status(422).json({ error: "SENHA_REPETIDA", detalhe: "A nova senha é igual à atual." });
    return;
  }

  const senhaHash = await hashSenha(parsed.data.novaSenha);
  const sessao = await db.transaction(async (tx) => {
    await tx.update(usuariosTable)
      .set({ senhaHash, precisaTrocarSenha: false, updatedAt: new Date() })
      .where(eq(usuariosTable.id, usuarioId));
    await encerrarSessoesDoUsuario(tx, usuarioId);
    return criarSessao(usuarioId, tx);
  });

  // A sessão nova no lugar da que acabou de cair: ser deslogada por se
  // proteger ensinaria a não trocar a senha.
  res.cookie(COOKIE_NOME, sessao.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: sessao.expiraEm,
  });
  res.status(204).send();
});

router.post("/auth/selecionar-loja", requireSessao, async (req, res): Promise<void> => {
  const parsed = SelecionarLojaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
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
    res.status(403).json({ error: "ACESSO_NEGADO_LOJA" });
    return;
  }

  await db.update(sessoesTable)
    .set({ lojaAtivaId: lojaId })
    .where(eq(sessoesTable.id, sessao.id));

  const updatedSessao = await buscarSessao(sessao.id);
  const lojas = await buscarLojasUsuario(usuario.id, usuario.isSuperAdmin);
  const acessosModulos = await getPermissoes(usuario.id, lojaId, usuario.isSuperAdmin);

  res.json(SelecionarLojaResponse.parse({
    usuario,
    lojaAtivaId: updatedSessao?.sessao.lojaAtivaId,
    acessosModulos,
    lojas,
  }));
});

export default router;
