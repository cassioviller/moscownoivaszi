import { Router, type IRouter } from "express";
import { db, usuariosTable, usuariosLojasTable, perfisTable, convitesTable, auditLogTable, recorrenciasTable, lojasTable } from "@workspace/db";
import { eq, and, gt, gte, isNull, desc, count } from "drizzle-orm";
import {
  ListEquipeParams,
  ListEquipeResponse,
  AddMembroEquipeParams,
  AddMembroEquipeBody,
  AddMembroEquipeResponse,
  UpdateMembroEquipeParams,
  UpdateMembroEquipeBody,
  UpdateMembroEquipeResponse,
  RemoveMembroEquipeParams,
  ListConvitesEquipeResponse,
  CreateConviteEquipeBody,
  CreateConviteEquipeResponse,
  ReenviarConviteEquipeResponse,
  GetAtividadeEquipeResponse,
  UpdateDadosDaLojaBody,
  UpdateDadosDaLojaResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { usuarioNaLoja } from "../lib/escopo-loja";
import { registrarAuditoria } from "../lib/auditoria";
import { hashSenha, gerarTokenConvite, encerrarSessoesDoUsuario, CONVITE_TTL_MS } from "../lib/auth";
import { erroDeValidacao } from "../lib/erros";
import { cnpjNaPorta, cpfNaPorta, vaziosViramNulo } from "../lib/documento-na-porta";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

router.use(requireSessaoComLoja);
// Gerir a equipe é ato administrativo: criar login, trocar perfil, remover
// membro. Sem este gate, qualquer sessão com loja ativa se auto-promovia a
// admin. O módulo é `admin` — o mesmo que a tela já exige (equipe/index.tsx).
router.use("/lojas/:lojaId/equipe", requireModulo("admin"));
// S17: os dados da loja são do mesmo módulo — quem administra a loja é quem
// troca o endereço e o telefone dela. `editar` e não `ver`: a rota só escreve.
router.use("/lojas/:lojaId/dados", requireModulo("admin", "editar"));

/**
 * S17 — a dona edita os dados da PRÓPRIA loja.
 *
 * `endereco` e `telefone` só tinham formulário no console de SUPERADMIN, que é
 * rota top-level fora de `/loja/:lojaId` e com gate próprio: trocar o telefone
 * virava chamado para quem tem o console. E não são dados decorativos — os dois
 * alimentam o rodapé do portal da noiva (F35) e a linha "Endereço:" da mensagem
 * de confirmação do atendimento.
 *
 * **O terceiro dependente é o que justifica a guarda de telefone.**
 * `linkWhatsApp` (frontend) devolve `null` para telefone fora de 10–13 dígitos, e
 * o botão do portal simplesmente não é renderizado: **telefone errado degrada
 * tão calado quanto telefone vazio**. Aqui ele é recusado com uma frase, em vez
 * de virar um botão que some.
 *
 * A régua dos dígitos é a MESMA de `moscow-noivas/src/lib/whatsapp.ts`, e as
 * duas são cópias — está anotado como sobra. Mexeu numa, confira a outra.
 */
function viraLinkDeWhatsApp(telefone: string): boolean {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return true;
  return digitos.length >= 12 && digitos.length <= 13 && digitos.startsWith("55");
}

// E234: os sete do instrumento entram aqui — a dona os edita em Dados da loja.
const CAMPOS_DA_LOJA = [
  "nome",
  "cnpj",
  "endereco",
  "telefone",
  "cidade",
  "uf",
  "representanteNome",
  "representanteRg",
  "representanteCpf",
  "pixChave",
  "pixTitular",
] as const;

router.patch("/lojas/:lojaId/dados", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = UpdateDadosDaLojaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  /**
   * Campo de fora é RECUSADO, não descartado — medido: o zod gerado do Orval
   * ESTRIPA o desconhecido, então um `{ ativo: false }` respondia 200 e não
   * desativava nada. Silêncio bem-intencionado é o pior dos dois: quem chamou
   * acha que desativou a loja.
   */
  const intrusos = Object.keys(req.body ?? {}).filter(
    (k) => !(CAMPOS_DA_LOJA as readonly string[]).includes(k),
  );
  if (intrusos.length > 0) {
    res.status(400).json({
      error: "CAMPO_NAO_EDITAVEL",
      detalhe: `Esta tela edita ${CAMPOS_DA_LOJA.join(", ")}. Desativar a loja é ato de superadmin.`,
      campos: intrusos.map((campo) => ({ campo, motivo: "Não editável por aqui" })),
    });
    return;
  }
  // E corpo vazio também: `db.update().set({})` estoura no driver, e o 500 que
  // ele devolve não diz nada a quem clicou em "Salvar" sem mexer em nada.
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "NADA_PARA_ALTERAR", detalhe: "Nenhum campo foi informado." });
    return;
  }

  // E233: o CNPJ sai impresso no cabeçalho de todo contrato — entra conferido
  // pelos dígitos e gravado na grafia única.
  const cnpj = cnpjNaPorta(parsed.data.cnpj);
  if (cnpj.recusa) {
    res.status(422).json(cnpj.recusa);
    return;
  }
  // E234: quem assina pela loja também sai impresso — o CPF pela régua do E233.
  const cpfRep = cpfNaPorta(parsed.data.representanteCpf, "representanteCpf");
  if (cpfRep.recusa) {
    res.status(422).json(cpfRep.recusa);
    return;
  }

  const { telefone } = parsed.data;
  // Vazio é permitido — a loja pode não ter WhatsApp — e vira NULL, não "".
  if (telefone && telefone.trim() !== "" && !viraLinkDeWhatsApp(telefone)) {
    res.status(422).json({
      error: "TELEFONE_SEM_WHATSAPP",
      detalhe:
        "Este número não forma um link de WhatsApp: informe DDD + número (ex.: (11) 98888-7777). Sem isso, o botão de WhatsApp some do portal da noiva sem avisar.",
      campos: [{ campo: "telefone", motivo: "Fora de 10 a 13 dígitos" }],
    });
    return;
  }

  const [loja] = await db
    .update(lojasTable)
    .set({
      ...parsed.data,
      ...(cnpj.valor !== undefined ? { cnpj: cnpj.valor } : {}),
      ...(cpfRep.valor !== undefined ? { representanteCpf: cpfRep.valor } : {}),
      ...vaziosViramNulo(parsed.data, ["cidade", "uf", "representanteNome", "representanteRg", "pixChave", "pixTitular"]),
      ...(telefone !== undefined ? { telefone: telefone.trim() === "" ? null : telefone } : {}),
    })
    .where(eq(lojasTable.id, lojaId))
    .returning();
  if (!loja) {
    res.status(404).json({ error: "LOJA_NAO_ENCONTRADA", detalhe: "Esta loja não existe." });
    return;
  }
  res.json(UpdateDadosDaLojaResponse.parse(loja));
});

router.get("/lojas/:lojaId/equipe", async (req, res): Promise<void> => {
  const params = ListEquipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  
  const equipe = await db
    .select({
      usuarioId: usuariosTable.id,
      lojaId: usuariosLojasTable.lojaId,
      perfilId: usuariosLojasTable.perfilId,
      nome: usuariosTable.nome,
      email: usuariosTable.email,
      perfilNome: perfisTable.nome,
      ativo: usuariosTable.ativo,
    })
    .from(usuariosLojasTable)
    .innerJoin(usuariosTable, eq(usuariosTable.id, usuariosLojasTable.usuarioId))
    .innerJoin(perfisTable, eq(perfisTable.id, usuariosLojasTable.perfilId))
    .where(eq(usuariosLojasTable.lojaId, params.data.lojaId));

  res.json(ListEquipeResponse.parse(equipe));
});

// Log de atividade (E18): a visão da dona — quem entrou quando e quem mexeu
// em quê. `ultimoLoginEm` vem do carimbo no login (sessão não serve: logout e
// expiração apagam a linha); as ações vêm do audit_log do E10. Mesmo gate
// admin do restante da gestão de equipe.
router.get("/lojas/:lojaId/equipe/atividade", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const corte30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [membros, acoes, eventos] = await Promise.all([
    db
      .select({
        usuarioId: usuariosTable.id,
        nome: usuariosTable.nome,
        email: usuariosTable.email,
        perfilNome: perfisTable.nome,
        ativo: usuariosTable.ativo,
        ultimoAcesso: usuariosTable.ultimoLoginEm,
      })
      .from(usuariosLojasTable)
      .innerJoin(usuariosTable, eq(usuariosTable.id, usuariosLojasTable.usuarioId))
      .innerJoin(perfisTable, eq(perfisTable.id, usuariosLojasTable.perfilId))
      .where(eq(usuariosLojasTable.lojaId, lojaId)),
    db
      .select({ usuarioId: auditLogTable.usuarioId, qtd: count() })
      .from(auditLogTable)
      .where(and(eq(auditLogTable.lojaId, lojaId), gte(auditLogTable.criadoEm, corte30d)))
      .groupBy(auditLogTable.usuarioId),
    db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.lojaId, lojaId))
      .orderBy(desc(auditLogTable.criadoEm))
      .limit(50),
  ]);

  const acoesPor = new Map(acoes.map((a) => [a.usuarioId, a.qtd]));
  res.json(GetAtividadeEquipeResponse.parse({
    membros: membros
      .map((m) => ({ ...m, acoes30d: acoesPor.get(m.usuarioId) ?? 0 }))
      .sort((a, b) => (b.ultimoAcesso?.getTime() ?? 0) - (a.ultimoAcesso?.getTime() ?? 0)),
    eventos,
  }));
});

router.post("/lojas/:lojaId/equipe", async (req, res): Promise<void> => {
  const params = AddMembroEquipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const parsed = AddMembroEquipeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const senhaHash = await hashSenha(parsed.data.senha);
  const usuarioId = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(usuariosTable).values({
      id: usuarioId,
      nome: parsed.data.nome,
      email: parsed.data.email.toLowerCase().trim(),
      senhaHash,
      // A senha foi escolhida por OUTRA pessoa (E57): vale para entrar uma vez,
      // e a tela cobra a troca antes de deixar usar o sistema. Quem aceita
      // convite escolhe a própria e não passa por aqui.
      precisaTrocarSenha: true,
    });

    await tx.insert(usuariosLojasTable).values({
      usuarioId,
      lojaId: params.data.lojaId,
      perfilId: parsed.data.perfilId,
    });

    await registrarAuditoria(tx, {
      lojaId: params.data.lojaId,
      usuario: req.usuario!,
      acao: "MEMBRO_ADICIONADO",
      entidade: "usuario",
      entidadeId: usuarioId,
      // A senha NÃO entra no detalhe, nem o hash: a trilha é lida por gente e
      // exportada em CSV.
      detalhe: { nome: parsed.data.nome, email: parsed.data.email, perfilId: parsed.data.perfilId },
    });
  });

  const [membro] = await db
    .select({
      usuarioId: usuariosTable.id,
      lojaId: usuariosLojasTable.lojaId,
      perfilId: usuariosLojasTable.perfilId,
      nome: usuariosTable.nome,
      email: usuariosTable.email,
      perfilNome: perfisTable.nome,
      ativo: usuariosTable.ativo,
    })
    .from(usuariosLojasTable)
    .innerJoin(usuariosTable, eq(usuariosTable.id, usuariosLojasTable.usuarioId))
    .innerJoin(perfisTable, eq(perfisTable.id, usuariosLojasTable.perfilId))
    .where(and(eq(usuariosLojasTable.lojaId, params.data.lojaId), eq(usuariosLojasTable.usuarioId, usuarioId)));

  res.status(201).json(AddMembroEquipeResponse.parse(membro));
});

// ── Convites por link ──
// ATENÇÃO de roteamento: registradas ANTES das rotas /equipe/:usuarioId para
// "convites" (literal) nunca casar como :usuarioId (mesmo aviso de vestidos).

router.get("/lojas/:lojaId/equipe/convites", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  // Só os PENDENTES: não usados e não expirados. O token sai de propósito —
  // é o admin quem monta e re-copia o link.
  const convites = await db
    .select({
      id: convitesTable.id,
      lojaId: convitesTable.lojaId,
      token: convitesTable.token,
      nome: convitesTable.nome,
      email: convitesTable.email,
      perfilId: convitesTable.perfilId,
      perfilNome: perfisTable.nome,
      criadoEm: convitesTable.criadoEm,
      expiraEm: convitesTable.expiraEm,
    })
    .from(convitesTable)
    .innerJoin(perfisTable, eq(perfisTable.id, convitesTable.perfilId))
    .where(and(
      eq(convitesTable.lojaId, lojaId),
      isNull(convitesTable.usadoEm),
      gt(convitesTable.expiraEm, new Date()),
    ))
    .orderBy(desc(convitesTable.criadoEm));
  res.json(ListConvitesEquipeResponse.parse(convites));
});

router.post("/lojas/:lojaId/equipe/convites", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateConviteEquipeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();

  // Já é membro DESTA loja? Convite não faz sentido — 409 nomeado.
  const [membro] = await db
    .select({ usuarioId: usuariosLojasTable.usuarioId })
    .from(usuariosLojasTable)
    .innerJoin(usuariosTable, eq(usuariosTable.id, usuariosLojasTable.usuarioId))
    .where(and(eq(usuariosLojasTable.lojaId, lojaId), eq(usuariosTable.email, email)));
  if (membro) {
    res.status(409).json({ error: "CONVIDADO_JA_E_MEMBRO", detalhe: "Este e-mail já é da equipe desta loja" });
    return;
  }

  const valores = {
    id: randomUUID(),
    lojaId,
    token: gerarTokenConvite(),
    nome: parsed.data.nome,
    email,
    perfilId: parsed.data.perfilId,
    criadoPorId: req.usuario!.id,
    expiraEm: new Date(Date.now() + CONVITE_TTL_MS),
  };
  /**
   * S-O61/E186 — **o `catch` local saiu, e o 409 continua sendo o mesmo.**
   *
   * Havia aqui um `if (ehViolacaoUnica(err))` que respondia
   * `409 CONVITE_PENDENTE`. Ele foi escrito antes de existir tradução por
   * ÍNDICE, e por isso traduzia qualquer violação de unicidade desta transação
   * com a frase do convite. O índice `convites_loja_email_pendente_unq` agora
   * tem entrada em `DUPLICADO_POR_INDICE`, com o mesmo código — uma grafia da
   * mesma recusa, no lugar em que as outras quatorze moram (regra 26). A prova
   * de equivalência é o teste que já existia: `equipe-convites-api.test.ts`
   * segue cobrando `CONVITE_PENDENTE` no segundo convite.
   */
  await db.transaction(async (tx) => {
    await tx.insert(convitesTable).values(valores);
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "CONVITE_CRIADO",
      entidade: "convite",
      entidadeId: valores.id,
      // O TOKEN fica de fora: quem lê a trilha (ou o CSV dela) ganharia um
      // link de entrada válido na loja.
      detalhe: { email, perfilId: valores.perfilId },
    });
  });

  const [perfil] = await db
    .select({ nome: perfisTable.nome })
    .from(perfisTable)
    .where(eq(perfisTable.id, valores.perfilId));
  req.log.info({ conviteId: valores.id, lojaId, adminId: valores.criadoPorId, email }, "convite_criado");
  res.status(201).json(CreateConviteEquipeResponse.parse({
    ...valores,
    perfilNome: perfil?.nome ?? null,
    criadoEm: new Date(),
  }));
});

router.post("/lojas/:lojaId/equipe/convites/:conviteId/reenviar", requireModulo("admin", "editar"), async (req, res): Promise<void> => {
  const { lojaId, conviteId } = req.params;
  // Regenera token e validade — o link antigo morre (desejável se vazou no
  // WhatsApp errado). Só convite ainda não usado.
  const [renovado] = await db
    .update(convitesTable)
    .set({ token: gerarTokenConvite(), expiraEm: new Date(Date.now() + CONVITE_TTL_MS) })
    .where(and(
      eq(convitesTable.id, conviteId as string),
      eq(convitesTable.lojaId, lojaId as string),
      isNull(convitesTable.usadoEm),
    ))
    .returning();
  if (!renovado) {
    res.status(404).json({ error: "CONVITE_NAO_ENCONTRADO", detalhe: "Este convite não existe nesta loja." });
    return;
  }
  const [perfil] = await db
    .select({ nome: perfisTable.nome })
    .from(perfisTable)
    .where(eq(perfisTable.id, renovado.perfilId));
  req.log.info({ conviteId: renovado.id, lojaId }, "convite_reenviado");
  res.json(ReenviarConviteEquipeResponse.parse({ ...renovado, perfilNome: perfil?.nome ?? null }));
});

router.delete("/lojas/:lojaId/equipe/convites/:conviteId", async (req, res): Promise<void> => {
  const { lojaId, conviteId } = req.params;
  const removido = await db.transaction(async (tx) => {
    const [linha] = await tx
      .delete(convitesTable)
      .where(and(eq(convitesTable.id, conviteId as string), eq(convitesTable.lojaId, lojaId as string)))
      .returning({ id: convitesTable.id, email: convitesTable.email });
    if (!linha) return null;
    await registrarAuditoria(tx, {
      lojaId: lojaId as string,
      usuario: req.usuario!,
      acao: "CONVITE_CANCELADO",
      entidade: "convite",
      entidadeId: linha.id,
      detalhe: { email: linha.email },
    });
    return linha;
  });
  if (!removido) {
    res.status(404).json({ error: "CONVITE_NAO_ENCONTRADO", detalhe: "Este convite não existe nesta loja." });
    return;
  }
  req.log.info({ conviteId, lojaId }, "convite_cancelado");
  res.status(204).send();
});

router.patch("/lojas/:lojaId/equipe/:usuarioId", async (req, res): Promise<void> => {
  const params = UpdateMembroEquipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const parsed = UpdateMembroEquipeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  // B1 🔴 — a PROVA DE PERTENCIMENTO vem ANTES de qualquer escrita.
  //
  // `usuarios` é tabela GLOBAL: o `requireModulo("admin")` acima só diz que
  // quem chama administra a loja da URL, não que o `usuarioId` do path é dessa
  // loja. O UPDATE de `nome`/`ativo` ia direto pelo id e a conferência só
  // acontecia no SELECT final, DEPOIS do commit — o 404 era cosmético. Com
  // isso, um admin da loja A mandava `{"ativo": false}` no id da dona da loja B
  // e a derrubava (login recusado, sessões vivas encerradas), com a trilha
  // ficando na loja A, onde a vítima nunca olha.
  if (!(await usuarioNaLoja(params.data.usuarioId, params.data.lojaId))) {
    res.status(404).json({ error: "MEMBRO_NAO_ENCONTRADO", detalhe: "Este membro da equipe não existe nesta loja." });
    return;
  }

  // Trocar o perfil ou inativar muda o ACESSO; renomear, não. Só o primeiro
  // caso derruba sessão — obrigar a pessoa a logar de novo porque alguém
  // corrigiu um acento no nome dela seria castigo sem motivo.
  const mudouAcesso = parsed.data.perfilId !== undefined || parsed.data.ativo === false;

  await db.transaction(async (tx) => {
    if (parsed.data.nome !== undefined || parsed.data.ativo !== undefined) {
      await tx.update(usuariosTable)
        .set({ 
          ...(parsed.data.nome !== undefined && { nome: parsed.data.nome }),
          ...(parsed.data.ativo !== undefined && { ativo: parsed.data.ativo }),
          updatedAt: new Date()
        })
        .where(eq(usuariosTable.id, params.data.usuarioId));
    }

    if (parsed.data.perfilId !== undefined) {
      await tx.update(usuariosLojasTable)
        .set({ perfilId: parsed.data.perfilId })
        .where(and(
          eq(usuariosLojasTable.lojaId, params.data.lojaId),
          eq(usuariosLojasTable.usuarioId, params.data.usuarioId)
        ));
    }

    // Dentro da MESMA transação: derrubar a sessão e mudar o acesso precisam
    // acontecer juntos, ou a pessoa fica com o acesso antigo válido.
    if (mudouAcesso) await encerrarSessoesDoUsuario(tx, params.data.usuarioId);

    await registrarAuditoria(tx, {
      lojaId: params.data.lojaId,
      usuario: req.usuario!,
      acao: "MEMBRO_ALTERADO",
      entidade: "usuario",
      entidadeId: params.data.usuarioId,
      detalhe: {
        ...(parsed.data.nome !== undefined && { nome: parsed.data.nome }),
        ...(parsed.data.ativo !== undefined && { ativo: parsed.data.ativo }),
        ...(parsed.data.perfilId !== undefined && { perfilId: parsed.data.perfilId }),
        sessoesEncerradas: mudouAcesso,
      },
    });
  });

  const [membro] = await db
    .select({
      usuarioId: usuariosTable.id,
      lojaId: usuariosLojasTable.lojaId,
      perfilId: usuariosLojasTable.perfilId,
      nome: usuariosTable.nome,
      email: usuariosTable.email,
      perfilNome: perfisTable.nome,
      ativo: usuariosTable.ativo,
    })
    .from(usuariosLojasTable)
    .innerJoin(usuariosTable, eq(usuariosTable.id, usuariosLojasTable.usuarioId))
    .innerJoin(perfisTable, eq(perfisTable.id, usuariosLojasTable.perfilId))
    .where(and(eq(usuariosLojasTable.lojaId, params.data.lojaId), eq(usuariosLojasTable.usuarioId, params.data.usuarioId)));

  if (!membro) {
    res.status(404).json({ error: "MEMBRO_NAO_ENCONTRADO", detalhe: "Este membro da equipe não existe nesta loja." });
    return;
  }

  res.json(UpdateMembroEquipeResponse.parse(membro));
});

router.delete("/lojas/:lojaId/equipe/:usuarioId", async (req, res): Promise<void> => {
  const params = RemoveMembroEquipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }

  // B1 🔴 — mesma prova de pertencimento do PATCH. O `delete` do vínculo já era
  // escopado, mas `encerrarSessoesDoUsuario` rodava incondicionalmente sobre o
  // id do path: um DoS de sessão repetível contra qualquer conta do sistema,
  // com a rota respondendo 204 mesmo sem ter removido nada.
  if (!(await usuarioNaLoja(params.data.usuarioId, params.data.lojaId))) {
    res.status(404).json({ error: "MEMBRO_NAO_ENCONTRADO", detalhe: "Este membro da equipe não existe nesta loja." });
    return;
  }

  await db.transaction(async (tx) => {
    // Defensivo: remover o membro também derruba convites pendentes do e-mail
    // dele nesta loja — senão o link ainda no WhatsApp recriaria o vínculo.
    const [usuario] = await tx
      .select({ email: usuariosTable.email })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, params.data.usuarioId));
    if (usuario) {
      await tx.delete(convitesTable).where(and(
        eq(convitesTable.lojaId, params.data.lojaId),
        eq(convitesTable.email, usuario.email),
        isNull(convitesTable.usadoEm),
      ));
    }
    await tx.delete(usuariosLojasTable)
      .where(and(
        eq(usuariosLojasTable.lojaId, params.data.lojaId),
        eq(usuariosLojasTable.usuarioId, params.data.usuarioId)
      ));

    /**
     * E a FOLHA para junto. Sair da equipe apagava o vínculo e os convites e
     * não tocava em `recorrencias`: no mês seguinte, "Gerar folha" lia todas as
     * recorrências ATIVAS da loja — sem nenhuma junção com `usuarios_lojas` —
     * e a conta a pagar de quem já não trabalha ali nascia de novo, entrava na
     * tela de Pagar, no "a pagar dos próximos 30 dias" do dashboard e no DRE
     * previsto. Todo mês, para sempre.
     *
     * DESATIVA, não apaga: a recorrência é a régua que EXPLICA os salários já
     * pagos, e o índice parcial `recorrencias_salario_ativo_unico` só olha as
     * ativas — então recontratar a mesma pessoa volta a ser possível sem
     * apagar o histórico. É a mesma escolha de `usuarios.ativo`.
     */
    const desativadas = await tx.update(recorrenciasTable)
      .set({ ativo: false, updatedAt: new Date() })
      .where(and(
        eq(recorrenciasTable.lojaId, params.data.lojaId),
        eq(recorrenciasTable.usuarioId, params.data.usuarioId),
        eq(recorrenciasTable.ativo, true),
      ))
      .returning({ id: recorrenciasTable.id });

    // Removida da equipe com a aba aberta continuaria navegando até a sessão
    // expirar — o vínculo já não existe, e o acesso não pode sobreviver a ele.
    await encerrarSessoesDoUsuario(tx, params.data.usuarioId);

    await registrarAuditoria(tx, {
      lojaId: params.data.lojaId,
      usuario: req.usuario!,
      acao: "MEMBRO_REMOVIDO",
      entidade: "usuario",
      entidadeId: params.data.usuarioId,
      // A folha que parou junto entra na trilha: sem isto, a conta de R$ 2.800
      // que some do mês seguinte não tem nenhuma linha que a explique.
      detalhe: { email: usuario?.email ?? null, recorrenciasDesativadas: desativadas.length },
    });
  });

  res.status(204).send();
});

export default router;
