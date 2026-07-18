import { Router, type IRouter } from "express";
import { db, usuariosTable, usuariosLojasTable, convitesTable, lojasTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import {
  GetConviteInfoQueryParams,
  GetConviteInfoResponse,
  AceitarConviteBody,
  AceitarConviteResponse,
} from "@workspace/api-zod";
import { hashSenha, criarSessao, COOKIE_NOME } from "../lib/auth";
import { randomUUID } from "node:crypto";

/**
 * Rotas PÚBLICAS do convite — sem sessão: quem tem o token (256 bits
 * aleatórios) é a capability. Token em QUERY/corpo, nunca no path: o pino-http
 * loga `req.url.split("?")[0]`, então o token jamais cai em log.
 *
 * Este router é montado logo após o auth em routes/index.ts — os routers de
 * domínio aplicam requireSessaoComLoja sem path, e montado depois deles estas
 * rotas morreriam num 401 antes de existir.
 */
const router: IRouter = Router();

/** m•••a@dominio — o suficiente para a convidada se reconhecer, nada além. */
function mascararEmail(email: string): string {
  const [local, dominio] = email.split("@");
  if (!dominio || local.length <= 2) return `•••@${dominio ?? ""}`;
  return `${local[0]}•••${local[local.length - 1]}@${dominio}`;
}

router.get("/equipe/convites/info", async (req, res): Promise<void> => {
  const parsed = GetConviteInfoQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [linha] = await db
    .select({ convite: convitesTable, lojaNome: lojasTable.nome })
    .from(convitesTable)
    .innerJoin(lojasTable, eq(lojasTable.id, convitesTable.lojaId))
    .where(eq(convitesTable.token, parsed.data.token));
  if (!linha) {
    res.status(404).json({ error: "CONVITE_INVALIDO" });
    return;
  }
  const { convite, lojaNome } = linha;
  if (convite.usadoEm) {
    res.status(410).json({ error: "CONVITE_UTILIZADO" });
    return;
  }
  if (convite.expiraEm <= new Date()) {
    res.status(410).json({ error: "CONVITE_EXPIRADO" });
    return;
  }

  const [existente] = await db
    .select({ id: usuariosTable.id })
    .from(usuariosTable)
    .where(eq(usuariosTable.email, convite.email));

  res.json(GetConviteInfoResponse.parse({
    lojaNome,
    nome: convite.nome,
    emailMascarado: mascararEmail(convite.email),
    precisaSenha: !existente,
    expiraEm: convite.expiraEm,
  }));
});

router.post("/equipe/convites/aceitar", async (req, res): Promise<void> => {
  const parsed = AceitarConviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { token, senha } = parsed.data;

  const [convite] = await db.select().from(convitesTable).where(eq(convitesTable.token, token));
  if (!convite) {
    res.status(404).json({ error: "CONVITE_INVALIDO" });
    return;
  }
  if (convite.usadoEm) {
    res.status(410).json({ error: "CONVITE_UTILIZADO" });
    return;
  }
  if (convite.expiraEm <= new Date()) {
    res.status(410).json({ error: "CONVITE_EXPIRADO" });
    return;
  }

  const [existente] = await db.select().from(usuariosTable).where(eq(usuariosTable.email, convite.email));
  if (existente && !existente.ativo) {
    // Sem este 409, o aceite criaria vínculo de conta que não loga — beco sem
    // saída silencioso para a colega.
    res.status(409).json({ error: "CONTA_INATIVA", detalhe: "Fale com o administrador da loja" });
    return;
  }
  if (!existente && (!senha || senha.length < 6)) {
    res.status(422).json({
      error: "SENHA_OBRIGATORIA",
      detalhe: "Defina uma senha de ao menos 6 caracteres para criar a conta",
    });
    return;
  }

  const resultado = await db.transaction(async (tx) => {
    // O claim do uso único é o UPDATE condicional: dois aceites simultâneos
    // resolvem no banco — o segundo não encontra `usado_em IS NULL` e sai.
    const [claim] = await tx
      .update(convitesTable)
      .set({ usadoEm: new Date() })
      .where(and(eq(convitesTable.id, convite.id), isNull(convitesTable.usadoEm)))
      .returning({ id: convitesTable.id });
    if (!claim) return null;

    let usuarioId: string;
    if (existente) {
      usuarioId = existente.id;
    } else {
      usuarioId = randomUUID();
      await tx.insert(usuariosTable).values({
        id: usuarioId,
        nome: convite.nome,
        email: convite.email,
        senhaHash: await hashSenha(senha!),
      });
    }
    // Conta existente já vinculada à loja por outro caminho: vínculo idempotente.
    await tx.insert(usuariosLojasTable)
      .values({ usuarioId, lojaId: convite.lojaId, perfilId: convite.perfilId })
      .onConflictDoNothing();
    return { usuarioId };
  });

  if (!resultado) {
    res.status(410).json({ error: "CONVITE_UTILIZADO" });
    return;
  }

  // E-mail novo: a pessoa acabou de definir a senha — já entra logada.
  // Conta existente: o portador do link NÃO provou ser o dono da conta; o
  // vínculo beneficia o dono do e-mail, e o login continua sendo a prova.
  if (!existente) {
    const sessao = await criarSessao(resultado.usuarioId);
    res.cookie(COOKIE_NOME, sessao.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: sessao.expiraEm,
    });
  }

  req.log.info(
    { conviteId: convite.id, usuarioId: resultado.usuarioId, jaTinhaConta: !!existente },
    "convite_aceito",
  );
  res.json(AceitarConviteResponse.parse({ jaTinhaConta: !!existente }));
});

export default router;
