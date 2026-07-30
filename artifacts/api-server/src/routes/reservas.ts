import { Router, type IRouter } from "express";
import { db, reservasTable, bloqueioVestidosTable, vestidosTable, atendimentosTable, contratoBloqueiosTable } from "@workspace/db";
import { eq, and, isNull, gte, lt, asc, desc, sql, inArray } from "drizzle-orm";
import { registrarAuditoria } from "../lib/auditoria";
import { leadNaLoja, reservaNaLoja } from "../lib/escopo-loja";
import {
  ListReservasResponse,
  CreateReservaBody,
  CreateReservaResponse,
  UpdateReservaBody,
  UpdateReservaResponse,
  ListBloqueiosResponse,
  ListBloqueiosQueryParams,
  GetBloqueioResponse,
  CreateBloqueioBody,
  CreateBloqueioResponse,
  UpdateBloqueioBody,
  UpdateBloqueioResponse,
  ListAvariasResponse,
  CreateAvariaBody,
  CreateAvariaResponse,
  CobrarAvariaBody,
  CobrarAvariaResponse
} from "@workspace/api-zod";
import { avariasTable, parcelasTable, contratosTable } from "@workspace/db";
import { identificarImagem } from "../lib/imagem";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { randomUUID } from "node:crypto";
import {
  verificarDisponibilidade,
  ocupacaoFisica,
  buscarRegra,
  diaLocal,
  inicioDoDia,
  type BloqueioJanelasInput,
  type ConflitoDetalhe,
} from "../lib/disponibilidade";
import { transicaoReservaValida } from "../lib/estados";
import { erroDeValidacao } from "../lib/erros";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";

const router: IRouter = Router();

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/reservas", requireModulo("vestidos"));
router.use("/lojas/:lojaId/bloqueios", requireModulo("vestidos"));

/** Erro interno para abortar a transação com rollback e responder 409. */
class ConflitoDisponibilidadeError extends Error {
  constructor(public readonly conflitos: ConflitoDetalhe[]) {
    super("VESTIDO_INDISPONIVEL");
  }
}

// Reservas
router.get("/lojas/:lojaId/reservas", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const reservas = await db.query.reservasTable.findMany({
    where: eq(reservasTable.lojaId, lojaId),
    with: {
      lead: true,
      // Vestido aninhado: o livro de reservas exibe "codigo · nome".
      bloqueios: { with: { vestido: true } },
    },
    orderBy: reservasTable.casamentoData,
  });
  res.json(ListReservasResponse.parse(reservas));
});

router.post("/lojas/:lojaId/reservas", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateReservaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  if (!(await leadNaLoja(parsed.data.leadId, lojaId))) {
    res.status(404).json({ error: "REFERENCIA_INVALIDA", detalhe: "lead não é desta loja" });
    return;
  }
  const [reserva] = await db.insert(reservasTable).values({
    id: randomUUID(),
    lojaId,
    leadId: parsed.data.leadId,
    casamentoData: parsed.data.casamentoData,
  }).returning();

  const fullReserva = await db.query.reservasTable.findFirst({
    where: eq(reservasTable.id, reserva.id),
    with: { lead: true, bloqueios: { with: { vestido: true } } }
  });
  res.status(201).json(CreateReservaResponse.parse(fullReserva));
});

router.patch("/lojas/:lojaId/reservas/:reservaId", async (req, res): Promise<void> => {
  const { lojaId, reservaId } = req.params as { lojaId: string; reservaId: string };
  const parsed = UpdateReservaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const dados = parsed.data;

  const [reserva] = await db.select().from(reservasTable)
    .where(and(eq(reservasTable.id, reservaId), eq(reservasTable.lojaId, lojaId)));
  if (!reserva) {
    res.status(404).json({ error: "RESERVA_NAO_ENCONTRADA", detalhe: "Esta reserva não existe nesta loja." });
    return;
  }

  // Mudança de status só por caminho válido da máquina de estados.
  if (dados.status && !transicaoReservaValida(reserva.status, dados.status)) {
    res.status(422).json({
      error: "TRANSICAO_INVALIDA",
      detalhe: `Reserva não pode ir de ${reserva.status} para ${dados.status}`,
    });
    return;
  }

  const hoje = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx.update(reservasTable)
        .set({
          status: dados.status,
          casamentoData: dados.casamentoData,
          updatedAt: new Date(),
        })
        .where(eq(reservasTable.id, reserva.id));

      if (dados.status === "CANCELADA") {
        // A constraint EXCLUDE do banco não enxerga o status da reserva —
        // soft-cancela os bloqueios vinculados para liberar os vestidos.
        await tx.update(bloqueioVestidosTable)
          .set({ canceladoEm: new Date(), updatedAt: new Date() })
          .where(and(
            eq(bloqueioVestidosTable.reservaId, reserva.id),
            isNull(bloqueioVestidosTable.canceladoEm),
          ));
        return;
      }

      if (dados.casamentoData === undefined) return;

      // Reserva é a fonte da verdade da data operacional → propaga a nova
      // data a todos os bloqueios vinculados, revalidando cada um.
      const vinculados = await tx.select().from(bloqueioVestidosTable)
        .where(and(
          eq(bloqueioVestidosTable.reservaId, reserva.id),
          isNull(bloqueioVestidosTable.canceladoEm),
        ));

      for (const bloqueio of vinculados) {
        const candidato: BloqueioJanelasInput = {
          id: bloqueio.id,
          tipo: bloqueio.tipo,
          casamentoData: dados.casamentoData,
          provaDataReal: bloqueio.provaDataReal,
          retiradaDataReal: bloqueio.retiradaDataReal,
          devolucaoDataReal: bloqueio.devolucaoDataReal,
          inicio: bloqueio.inicio,
          fim: bloqueio.fim,
        };
        const resultado = await verificarDisponibilidade({
          lojaId,
          vestidoId: bloqueio.vestidoId,
          candidato,
          ignorarBloqueioId: bloqueio.id,
          hoje,
          executor: tx,
        });
        if (!resultado.disponivel) {
          throw new ConflitoDisponibilidadeError(resultado.conflitos);
        }
        const ocupacao = ocupacaoFisica(candidato, resultado.regra);
        await tx.update(bloqueioVestidosTable)
          .set({
            casamentoData: dados.casamentoData,
            ocupacaoInicio: ocupacao?.inicio ?? null,
            ocupacaoFim: ocupacao?.fim ?? null,
            updatedAt: new Date(),
          })
          .where(eq(bloqueioVestidosTable.id, bloqueio.id));
      }
    });
  } catch (err) {
    if (err instanceof ConflitoDisponibilidadeError) {
      res.status(409).json({ error: "VESTIDO_INDISPONIVEL", conflitos: err.conflitos });
      return;
    }
    throw err;
  }

  const fullReserva = await db.query.reservasTable.findFirst({
    where: eq(reservasTable.id, reserva.id),
    with: { lead: true, bloqueios: { with: { vestido: true } } }
  });
  res.json(UpdateReservaResponse.parse(fullReserva));
});

/**
 * E115 — este DELETE era cru (sem 404, sem contagem, sem trilha), e a cascata
 * dele é a mais funda do domínio: `bloqueio_vestidos.reserva_id` é CASCADE, e
 * de cada bloqueio caem as avarias (com a foto-prova que sustenta a parcela já
 * cobrada — o 409 do E97/F23 não roda, porque a cascata não passa pela rota),
 * os atendimentos/provas e os vínculos `contrato_bloqueios` de contratos
 * ATIVOS — a peça voltava a aparecer disponível para outra noiva. A régua é a
 * do E91/E106/E111: 404 antes, 409 legível dizendo o que segura, trilha DENTRO
 * da transação e ANTES do delete.
 */
router.delete("/lojas/:lojaId/reservas/:reservaId", async (req, res): Promise<void> => {
  const { lojaId, reservaId } = req.params as { lojaId: string; reservaId: string };
  const reserva = await db.query.reservasTable.findFirst({
    where: and(eq(reservasTable.id, reservaId), eq(reservasTable.lojaId, lojaId)),
  });
  if (!reserva) {
    res.status(404).json({ error: "RESERVA_NAO_ENCONTRADA", detalhe: "Esta reserva não existe nesta loja." });
    return;
  }

  const bloqueios = await db
    .select({ id: bloqueioVestidosTable.id })
    .from(bloqueioVestidosTable)
    .where(eq(bloqueioVestidosTable.reservaId, reservaId));
  const bloqueioIds = bloqueios.map((b) => b.id);

  const [avarias, vinculosAtivos, atendimentos] = await Promise.all([
    bloqueioIds.length
      ? db.select({ id: avariasTable.id }).from(avariasTable)
          .where(inArray(avariasTable.bloqueioId, bloqueioIds))
      : Promise.resolve([]),
    bloqueioIds.length
      ? db.select({ id: contratoBloqueiosTable.contratoId }).from(contratoBloqueiosTable)
          .innerJoin(contratosTable, eq(contratosTable.id, contratoBloqueiosTable.contratoId))
          .where(and(
            inArray(contratoBloqueiosTable.bloqueioId, bloqueioIds),
            eq(contratosTable.status, "ATIVO"),
          ))
      : Promise.resolve([]),
    // Atendimento não aponta para a reserva: ele chega a ela pelo bloqueio
    // (`atendimentos.bloqueio_id`), e é por esse caminho que a cascata o leva.
    bloqueioIds.length
      ? db.select({ id: atendimentosTable.id }).from(atendimentosTable)
          .where(inArray(atendimentosTable.bloqueioId, bloqueioIds))
      : Promise.resolve([]),
  ]);

  if (avarias.length + vinculosAtivos.length + atendimentos.length > 0) {
    res.status(409).json({
      error: "RESERVA_COM_HISTORICO",
      detalhe:
        "Esta reserva carrega história que sumiria junto: " +
        `${vinculosAtivos.length} contrato(s) ativo(s) preso(s) ao vestido, ` +
        `${avarias.length} avaria(s) registrada(s) e ${atendimentos.length} atendimento(s)/prova(s). ` +
        "Cancele os bloqueios (soft-cancel) em vez de apagar a reserva.",
      contratosAtivos: vinculosAtivos.length,
      avarias: avarias.length,
      atendimentos: atendimentos.length,
    });
    return;
  }

  await db.transaction(async (tx) => {
    // ANTES do delete: depois dele não há linha de onde reconstituir.
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "RESERVA_REMOVIDA",
      entidade: "reserva",
      entidadeId: reservaId,
      detalhe: { leadId: reserva.leadId, casamentoData: reserva.casamentoData, bloqueios: bloqueioIds.length },
    });
    await tx.delete(reservasTable).where(and(eq(reservasTable.id, reservaId), eq(reservasTable.lojaId, lojaId)));
  });
  res.status(204).send();
});

// Bloqueios
router.get("/lojas/:lojaId/bloqueios", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  // E45: filtro opcional por vestido — a ficha do vestido passa a puxar só os
  // bloqueios dele, em vez de baixar a loja inteira e filtrar no cliente.
  // E79: mesmo movimento por noiva — a ficha do orçamento (E72) e o portal.
  // E87: futuras=true|false recorta por casamentoData contra HOJE em dia local
  // (fronteira via inicioDoDia, como a janela de/ate do E83) — o livro de
  // reservas pede só a lente que está aberta; passadas já saem em ordem desc.
  // Bloqueios sem casamentoData (manutenção) ficam fora do recorte: a
  // comparação SQL com NULL descarta a linha, e é o comportamento desejado.
  const query = ListBloqueiosQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "FILTRO_INVALIDO" });
    return;
  }
  const { vestidoId, leadId, futuras } = query.data;
  const hoje = inicioDoDia(diaLocal(new Date()));
  // Joins: telas de reservas/provas exibem vestido "codigo · nome" e a noiva.
  const bloqueios = await db.query.bloqueioVestidosTable.findMany({
    where: and(
      eq(bloqueioVestidosTable.lojaId, lojaId),
      ...(vestidoId ? [eq(bloqueioVestidosTable.vestidoId, vestidoId)] : []),
      ...(leadId ? [eq(bloqueioVestidosTable.leadId, leadId)] : []),
      ...(futuras === "true" ? [gte(bloqueioVestidosTable.casamentoData, hoje)] : []),
      ...(futuras === "false" ? [lt(bloqueioVestidosTable.casamentoData, hoje)] : []),
    ),
    with: { vestido: true, lead: true },
    // Com recorte, a ordem é do servidor: próximas da mais próxima à mais
    // distante, passadas da mais recente à mais antiga. Sem recorte, mantém-se
    // a ordem histórica (nenhuma) para não mudar o contrato dos outros usos.
    orderBy:
      futuras === "true"
        ? [asc(bloqueioVestidosTable.casamentoData)]
        : futuras === "false"
          ? [desc(bloqueioVestidosTable.casamentoData)]
          : undefined,
  });
  res.json(ListBloqueiosResponse.parse(bloqueios));
});

// E79: a ficha da reserva pede UM bloqueio, não a loja inteira.
router.get("/lojas/:lojaId/bloqueios/:bloqueioId", async (req, res): Promise<void> => {
  const { lojaId, bloqueioId } = req.params as { lojaId: string; bloqueioId: string };
  const bloqueio = await db.query.bloqueioVestidosTable.findFirst({
    where: and(eq(bloqueioVestidosTable.id, bloqueioId), eq(bloqueioVestidosTable.lojaId, lojaId)),
    with: { vestido: true, lead: true },
  });
  if (!bloqueio) {
    res.status(404).json({ error: "RESERVA_NAO_ENCONTRADA", detalhe: "Esta reserva de vestido não existe nesta loja." });
    return;
  }
  res.json(GetBloqueioResponse.parse(bloqueio));
});

router.post("/lojas/:lojaId/bloqueios", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateBloqueioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const dados = parsed.data;

  const [vestido] = await db.select({ id: vestidosTable.id }).from(vestidosTable)
    .where(and(eq(vestidosTable.id, dados.vestidoId), eq(vestidosTable.lojaId, lojaId)));
  if (!vestido) {
    res.status(404).json({ error: "VESTIDO_NAO_ENCONTRADO", detalhe: "Este vestido não existe nesta loja." });
    return;
  }

  // O vestido já foi validado acima; lead e reserva (ambos opcionais) precisam do
  // mesmo cuidado, senão o bloqueio referencia uma noiva/reserva de outra loja.
  if (dados.leadId && !(await leadNaLoja(dados.leadId, lojaId))) {
    res.status(404).json({ error: "REFERENCIA_INVALIDA", detalhe: "lead não é desta loja" });
    return;
  }
  if (dados.reservaId && !(await reservaNaLoja(dados.reservaId, lojaId))) {
    res.status(404).json({ error: "REFERENCIA_INVALIDA", detalhe: "reserva não é desta loja" });
    return;
  }

  if (dados.tipo === "RESERVA_CASAMENTO" && !dados.casamentoData) {
    res.status(400).json({ error: "casamentoData é obrigatória para bloqueio RESERVA_CASAMENTO" });
    return;
  }
  if (dados.tipo === "MANUTENCAO" && !dados.inicio) {
    res.status(400).json({ error: "inicio é obrigatório para bloqueio MANUTENCAO" });
    return;
  }

  const id = randomUUID();
  const candidato: BloqueioJanelasInput = {
    id,
    tipo: dados.tipo,
    casamentoData: dados.casamentoData ?? null,
    provaDataReal: null,
    retiradaDataReal: null,
    devolucaoDataReal: null,
    inicio: dados.inicio ?? null,
    fim: dados.fim ?? null,
  };

  const resultado = await verificarDisponibilidade({
    lojaId,
    vestidoId: dados.vestidoId,
    candidato,
    hoje: new Date(),
  });
  if (!resultado.disponivel) {
    res.status(409).json({ error: "VESTIDO_INDISPONIVEL", conflitos: resultado.conflitos });
    return;
  }

  const ocupacao = ocupacaoFisica(candidato, resultado.regra);

  const [bloqueio] = await db.insert(bloqueioVestidosTable).values({
    id,
    lojaId,
    vestidoId: dados.vestidoId,
    leadId: dados.leadId ?? null,
    tipo: dados.tipo,
    casamentoData: dados.casamentoData ?? null,
    inicio: dados.inicio ?? null,
    fim: dados.fim ?? null,
    observacao: dados.observacao ?? null,
    reservaId: dados.reservaId ?? null,
    ocupacaoInicio: ocupacao?.inicio ?? null,
    ocupacaoFim: ocupacao?.fim ?? null,
  }).returning();
  res.status(201).json(CreateBloqueioResponse.parse(bloqueio));
});

router.patch("/lojas/:lojaId/bloqueios/:bloqueioId", async (req, res): Promise<void> => {
  const { lojaId, bloqueioId } = req.params as { lojaId: string; bloqueioId: string };
  const parsed = UpdateBloqueioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const dados = parsed.data;

  const [existente] = await db.select().from(bloqueioVestidosTable)
    .where(and(eq(bloqueioVestidosTable.id, bloqueioId), eq(bloqueioVestidosTable.lojaId, lojaId)));
  if (!existente) {
    res.status(404).json({ error: "RESERVA_NAO_ENCONTRADA", detalhe: "Esta reserva de vestido não existe nesta loja." });
    return;
  }

  // E61: null é "desfaça" (limpa a data), ausente é "não mexa" — por isso o
  // teste é contra undefined, não o ??, que engoliria o null.
  const candidato: BloqueioJanelasInput = {
    id: existente.id,
    tipo: existente.tipo,
    casamentoData: existente.casamentoData,
    provaDataReal: dados.provaDataReal ?? existente.provaDataReal,
    retiradaDataReal:
      dados.retiradaDataReal === undefined ? existente.retiradaDataReal : dados.retiradaDataReal,
    devolucaoDataReal:
      dados.devolucaoDataReal === undefined ? existente.devolucaoDataReal : dados.devolucaoDataReal,
    inicio: dados.inicio ?? existente.inicio,
    fim: dados.fim ?? existente.fim,
  };

  // Devolução sem retirada é uma história impossível de contar.
  if (candidato.devolucaoDataReal && !candidato.retiradaDataReal) {
    res.status(400).json({ error: "Não dá para desfazer a retirada com a devolução registrada" });
    return;
  }

  const mudouJanelas =
    dados.provaDataReal !== undefined ||
    dados.retiradaDataReal !== undefined ||
    dados.devolucaoDataReal !== undefined ||
    dados.inicio !== undefined ||
    dados.fim !== undefined;

  let regra;
  if (mudouJanelas) {
    const resultado = await verificarDisponibilidade({
      lojaId,
      vestidoId: existente.vestidoId,
      candidato,
      ignorarBloqueioId: existente.id,
      hoje: new Date(),
    });
    if (!resultado.disponivel) {
      res.status(409).json({ error: "VESTIDO_INDISPONIVEL", conflitos: resultado.conflitos });
      return;
    }
    regra = resultado.regra;
  } else {
    regra = await buscarRegra(lojaId);
  }

  const ocupacao = ocupacaoFisica(candidato, regra);

  const [bloqueio] = await db.update(bloqueioVestidosTable)
    .set({
      provaDataReal: dados.provaDataReal,
      retiradaDataReal: dados.retiradaDataReal,
      devolucaoDataReal: dados.devolucaoDataReal,
      inicio: dados.inicio,
      fim: dados.fim,
      observacao: dados.observacao,
      ocupacaoInicio: ocupacao?.inicio ?? null,
      ocupacaoFim: ocupacao?.fim ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(bloqueioVestidosTable.id, bloqueioId), eq(bloqueioVestidosTable.lojaId, lojaId)))
    .returning();
  res.json(UpdateBloqueioResponse.parse(bloqueio));
});

/**
 * E115 — o mesmo defeito do DELETE de reserva, um nível abaixo: avarias,
 * atendimentos e o vínculo com contrato ATIVO caem por cascata sem que nenhuma
 * guarda de rota rode. Quem quer tirar a peça do caminho usa o soft-cancel
 * (`canceladoEm`), que é o que o cancelamento de contrato faz.
 */
router.delete("/lojas/:lojaId/bloqueios/:bloqueioId", async (req, res): Promise<void> => {
  const { lojaId, bloqueioId } = req.params as { lojaId: string; bloqueioId: string };
  const bloqueio = await db.query.bloqueioVestidosTable.findFirst({
    where: and(eq(bloqueioVestidosTable.id, bloqueioId), eq(bloqueioVestidosTable.lojaId, lojaId)),
  });
  if (!bloqueio) {
    res.status(404).json({ error: "RESERVA_NAO_ENCONTRADA", detalhe: "Esta reserva de vestido não existe nesta loja." });
    return;
  }

  const [avarias, vinculosAtivos, legadoAtivo, atendimentos] = await Promise.all([
    db.select({ id: avariasTable.id }).from(avariasTable)
      .where(eq(avariasTable.bloqueioId, bloqueioId)),
    db.select({ id: contratoBloqueiosTable.contratoId }).from(contratoBloqueiosTable)
      .innerJoin(contratosTable, eq(contratosTable.id, contratoBloqueiosTable.contratoId))
      .where(and(
        eq(contratoBloqueiosTable.bloqueioId, bloqueioId),
        eq(contratosTable.status, "ATIVO"),
      )),
    // A coluna singular legada é lida em produção (portal, PDF) — um contrato
    // ATIVO pendurado nela segura o bloqueio do mesmo jeito.
    db.select({ id: contratosTable.id }).from(contratosTable)
      .where(and(eq(contratosTable.bloqueioVestidoId, bloqueioId), eq(contratosTable.status, "ATIVO"))),
    db.select({ id: atendimentosTable.id }).from(atendimentosTable)
      .where(eq(atendimentosTable.bloqueioId, bloqueioId)),
  ]);

  const contratosAtivos = vinculosAtivos.length + legadoAtivo.length;
  if (avarias.length + contratosAtivos + atendimentos.length > 0) {
    res.status(409).json({
      error: "BLOQUEIO_COM_HISTORICO",
      detalhe:
        "Este bloqueio carrega história que sumiria junto: " +
        `${contratosAtivos} contrato(s) ativo(s), ${avarias.length} avaria(s) e ` +
        `${atendimentos.length} atendimento(s)/prova(s). Cancele o bloqueio (soft-cancel) em vez de apagá-lo.`,
      contratosAtivos,
      avarias: avarias.length,
      atendimentos: atendimentos.length,
    });
    return;
  }

  await db.transaction(async (tx) => {
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "BLOQUEIO_REMOVIDO",
      entidade: "bloqueio",
      entidadeId: bloqueioId,
      detalhe: { vestidoId: bloqueio.vestidoId, leadId: bloqueio.leadId, tipo: bloqueio.tipo },
    });
    await tx.delete(bloqueioVestidosTable).where(and(eq(bloqueioVestidosTable.id, bloqueioId), eq(bloqueioVestidosTable.lojaId, lojaId)));
  });
  res.status(204).send();
});

// ───────────────────── Avarias (E71) ─────────────────────
// A consequência da devolução: o vestido voltou manchado/rasgado e o registro
// morria numa conversa. Gate `vestidos`, junto do resto do bloqueio.
router.use("/lojas/:lojaId/avarias", requireModulo("vestidos"));

const AVARIA_FOTO_MAX_BYTES = 2 * 1024 * 1024;

/** Meta da avaria para o contrato — nunca os bytes na listagem. */
function avariaMeta(a: typeof avariasTable.$inferSelect) {
  const { fotoBytes, fotoMime, ...meta } = a;
  return { ...meta, temFoto: fotoBytes !== null };
}

/**
 * A corrida perdida, sinalizada por exceção para abortar a transação inteira.
 * Sem isto, a request perdedora sairia da transação achando que gravou.
 */
class AvariaJaCobrada extends Error {}

/**
 * O contrato da loja, com a NOIVA junto — o `leadId` é o que amarra a cobrança
 * de um reparo ao carnê certo (E110). Devolve `undefined` quando o contrato não
 * existe, não é da loja ou não está ATIVO: os três casos têm a mesma resposta.
 */
/**
 * A cobrança deste reparo ainda está DE PÉ?
 *
 * `avarias.parcela_id` preenchido significava "já cobrada", ponto — e isso
 * fechava um ciclo sem saída depois do cancelamento do contrato. A parcela do
 * reparo vira CANCELADA junto com ele, e a partir daí as três rotas se
 * recusavam mutuamente: `cobrar` respondia 409 AVARIA_JA_COBRADA (o
 * `parcelaId` não é nulo), `DELETE /parcelas/:id` respondia 422
 * PARCELA_NAO_PREVISTA e, ainda que não, 422 CONTRATO_NAO_ATIVO, e
 * `DELETE /avarias/:id` respondia 409 AVARIA_COM_COBRANCA. O reparo ficava
 * impossível de cobrar e o registro impossível de limpar — e a noiva que
 * assina um contrato novo meses depois não tem por onde ser cobrada.
 *
 * Parcela CANCELADA (ou apagada, com o `set null` da FK) não cobra ninguém, e
 * o próprio schema já dizia isto: "removida a parcela pelo caminho legítimo, a
 * avaria e a foto ficam, e o reparo volta a ser cobrável".
 */
async function cobrancaViva(parcelaId: string): Promise<boolean> {
  const [parcela] = await db
    .select({ status: parcelasTable.status })
    .from(parcelasTable)
    .where(eq(parcelasTable.id, parcelaId));
  return !!parcela && parcela.status !== "CANCELADA";
}

async function contratoAtivoDaLoja(
  contratoId: string,
  lojaId: string,
): Promise<{ leadId: string } | undefined> {
  const [c] = await db
    .select({ status: contratosTable.status, leadId: contratosTable.leadId })
    .from(contratosTable)
    .where(and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)));
  return c?.status === "ATIVO" ? { leadId: c.leadId } : undefined;
}

router.get("/lojas/:lojaId/bloqueios/:bloqueioId/avarias", async (req, res): Promise<void> => {
  const { lojaId, bloqueioId } = req.params;
  const avarias = await db
    .select()
    .from(avariasTable)
    .where(and(eq(avariasTable.lojaId, lojaId as string), eq(avariasTable.bloqueioId, bloqueioId as string)))
    .orderBy(avariasTable.criadaEm);
  res.json(ListAvariasResponse.parse(avarias.map(avariaMeta)));
});

router.post("/lojas/:lojaId/bloqueios/:bloqueioId/avarias", async (req, res): Promise<void> => {
  const { lojaId, bloqueioId } = req.params;
  const parsed = CreateAvariaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const [bloqueio] = await db
    .select({ id: bloqueioVestidosTable.id })
    .from(bloqueioVestidosTable)
    .where(and(eq(bloqueioVestidosTable.id, bloqueioId as string), eq(bloqueioVestidosTable.lojaId, lojaId as string)));
  if (!bloqueio) {
    res.status(404).json({ error: "RESERVA_NAO_ENCONTRADA", detalhe: "Esta reserva de vestido não existe nesta loja." });
    return;
  }

  // Mesma borda das fotos de vestido (E3): mime sai do BINÁRIO — um mime
  // mentiroso viraria o Content-Type servido de volta (stored-XSS).
  let fotoBytes: Buffer | null = null;
  let fotoMime: string | null = null;
  if (parsed.data.fotoBase64) {
    fotoBytes = Buffer.from(parsed.data.fotoBase64, "base64");
    if (fotoBytes.length > AVARIA_FOTO_MAX_BYTES) {
      res.status(422).json({ error: "FOTO_MUITO_GRANDE", detalhe: "Máximo 2MB" });
      return;
    }
    const info = identificarImagem(fotoBytes);
    if (!info) {
      res.status(422).json({ error: "FOTO_INVALIDA", detalhe: "Use JPEG, PNG ou WebP" });
      return;
    }
    fotoMime = info.mime;
  }

  const [avaria] = await db
    .insert(avariasTable)
    .values({
      id: randomUUID(),
      lojaId: lojaId as string,
      bloqueioId: bloqueioId as string,
      descricao: parsed.data.descricao,
      custoReparo: parsed.data.custoReparo ?? null,
      fotoBytes,
      fotoMime,
      // Autor da SESSÃO, desnormalizado como no audit_log: a linha sobrevive
      // à saída de quem registrou.
      registradoPorNome: req.usuario?.nome ?? null,
    })
    .returning();
  res.status(201).json(CreateAvariaResponse.parse(avariaMeta(avaria)));
});

/**
 * E97/F22 — cobrar o reparo, uma vez só.
 *
 * A tela criava a parcela avulsa direto pelo `POST /contratos/:id/parcelas` e
 * não guardava vínculo nenhum. O botão não mudava de estado depois do clique,
 * então dois cliques — o que acontece quando a rede demora e a pessoa insiste —
 * criavam DUAS parcelas no carnê, cobrando o mesmo conserto duas vezes, e nada
 * no sistema sabia que eram a mesma coisa.
 *
 * A criação da parcela e o vínculo acontecem na MESMA transação: a alternativa
 * (criar e depois marcar) tem exatamente a janela que o defeito explora.
 */
router.post("/lojas/:lojaId/avarias/:avariaId/cobrar", requireModulo("vestidos", "editar"), async (req, res): Promise<void> => {
  const { lojaId, avariaId } = req.params;
  const parsed = CobrarAvariaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const avaria = await db.query.avariasTable.findFirst({
    where: and(eq(avariasTable.id, avariaId as string), eq(avariasTable.lojaId, lojaId as string)),
  });
  if (!avaria) {
    res.status(404).json({ error: "AVARIA_NAO_ENCONTRADA", detalhe: "Esta avaria não existe nesta loja." });
    return;
  }
  if (avaria.parcelaId && (await cobrancaViva(avaria.parcelaId))) {
    res.status(409).json({
      error: "AVARIA_JA_COBRADA",
      detalhe: "Este reparo já virou parcela do contrato",
      campos: [{ campo: "avariaId", motivo: "Já existe uma cobrança para esta avaria" }],
    });
    return;
  }
  if (!avaria.custoReparo || avaria.custoReparo <= 0) {
    res.status(422).json({
      error: "AVARIA_SEM_CUSTO",
      detalhe: "Avalie o custo do reparo antes de cobrar",
      campos: [{ campo: "custoReparo", motivo: "Informe o custo do reparo" }],
    });
    return;
  }
  const contrato = await contratoAtivoDaLoja(parsed.data.contratoId, lojaId as string);
  if (!contrato) {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }

  /**
   * E110 — o reparo entra no carnê da noiva DELE, e não de qualquer contrato
   * ativo da loja.
   *
   * Antes daqui a rota provava três coisas do contrato (existe, é da loja, está
   * ATIVO) e NENHUMA sobre a avaria: o reparo do vestido da noiva A podia ser
   * cobrado no carnê e no extrato do portal da noiva B — e depois a avaria
   * ficava travada, porque `parcelaId` preenchido bloqueia a remoção. Todas as
   * outras rotas que aceitam id de corpo já faziam essa prova (`leadNaLoja`,
   * `usuarioNaLoja`).
   *
   * **A guarda prova quando é provável, e o limite está medido:** o `lead_id` do
   * bloqueio é NULLABLE, e no banco de desenvolvimento **61 das 63 avarias**
   * vivem em bloqueio sem noiva (61 deles `RESERVA_CASAMENTO`, o que é
   * suspeito por si — virou sobra). Recusar todos esses seria trocar um defeito
   * raro por uma parede diária. Sem noiva no bloqueio não há o que comparar, e
   * a rota segue como antes; com noiva, ela tem de ser a mesma.
   */
  const [bloqueioDaAvaria] = await db
    .select({ leadId: bloqueioVestidosTable.leadId })
    .from(bloqueioVestidosTable)
    .where(eq(bloqueioVestidosTable.id, avaria.bloqueioId));
  if (bloqueioDaAvaria?.leadId && bloqueioDaAvaria.leadId !== contrato.leadId) {
    res.status(422).json({
      error: "AVARIA_DE_OUTRA_NOIVA",
      detalhe: "Este reparo é do vestido de outra noiva — cobre no contrato dela",
      campos: [{ campo: "contratoId", motivo: "O contrato é de outra noiva" }],
    });
    return;
  }

  const parcelaId = randomUUID();
  await db.transaction(async (tx) => {
    /**
     * E110 — o próximo número LIVRE, nunca o 0.
     *
     * Aqui estava `numero: 0` fixo, com o comentário "fora da numeração do
     * carnê: é cobrança extra, não parcela do plano". O 0 não é fora da
     * numeração — **é a ENTRADA**, e está escrito no motor que monta o carnê
     * (`financeiro-core/src/plano.ts:27`, e a linha 91 é quem a insere).
     *
     * Com `unique(contratoId, numero)` em `parcelas`, cobrar um reparo num
     * contrato que TEM entrada devolvia
     * `409 { error: "REGISTRO_DUPLICADO", detalhe: "Já existe um registro com
     * estes dados." }` — e esse 409 é pior que um 500, porque se lê como "já
     * cobrei este reparo": a vendedora para de tentar e o conserto nunca é
     * cobrado. A segunda avaria de QUALQUER contrato dava o mesmo.
     *
     * É a mesma conta da rota irmã do E71 (`contratos.ts:874`), e fica DENTRO
     * da transação de propósito — a UNIQUE continua sendo a rede do duplo
     * clique, exatamente como era com o 0.
     */
    const [{ maior }] = await tx
      .select({ maior: sql<number>`coalesce(max(${parcelasTable.numero}), 0)` })
      .from(parcelasTable)
      .where(eq(parcelasTable.contratoId, parsed.data.contratoId));

    // A parcela PRIMEIRO: `avarias.parcela_id` é FK, então marcar antes de a
    // linha existir viola a integridade. A ordem inversa parece mais segura à
    // primeira vista e simplesmente não roda.
    await tx.insert(parcelasTable).values({
      id: parcelaId,
      lojaId: lojaId as string,
      contratoId: parsed.data.contratoId,
      numero: Number(maior) + 1,
      descricao: `Reparo de avaria — ${avaria.descricao}`.slice(0, 200),
      valorPrevisto: avaria.custoReparo!,
      // Dia de negócio, não instante: `new Date()` das 21h à meia-noite jogava
      // o vencimento para o dia seguinte (a mesma classe do C6).
      vencimento: ancoraDeNegocio(addDias(hojeLocal(), parsed.data.prazoDias ?? 7)),
    });

    // O vínculo é condicional ao estado que a rota LEU: vazio, ou a mesma
    // cobrança morta que ela conferiu acima. Quem perde a corrida não grava
    // nada — a exceção derruba a transação inteira e a parcela que ela acabou
    // de inserir some junto, que é exatamente a segunda cobrança que este
    // épico existe para impedir. Quem chega depois de a cobrança ter morrido
    // recobra, e o `parcela_id` passa a apontar para o carnê novo.
    const [marcada] = await tx
      .update(avariasTable)
      .set({ parcelaId })
      .where(and(
        eq(avariasTable.id, avaria.id),
        avaria.parcelaId
          ? eq(avariasTable.parcelaId, avaria.parcelaId)
          : isNull(avariasTable.parcelaId),
      ))
      .returning();
    if (!marcada) throw new AvariaJaCobrada();
  }).catch((err) => {
    if (err instanceof AvariaJaCobrada) return;
    throw err;
  });

  const depois = await db.query.avariasTable.findFirst({ where: eq(avariasTable.id, avaria.id) });
  if (depois?.parcelaId !== parcelaId) {
    res.status(409).json({ error: "AVARIA_JA_COBRADA", detalhe: "Este reparo já virou parcela do contrato" });
    return;
  }
  res.status(201).json(CobrarAvariaResponse.parse(avariaMeta(depois!)));
});

/**
 * E97/F23 — a avaria não some enquanto sustenta uma cobrança.
 *
 * A FOTO é a prova do dano. Apagá-la deixando a parcela viva faz a noiva dever
 * por algo que o sistema não consegue mais mostrar — e isso acontecia por um
 * toque num ícone de 28px, sem confirmação nenhuma.
 */
router.delete("/lojas/:lojaId/avarias/:avariaId", async (req, res): Promise<void> => {
  const { lojaId, avariaId } = req.params;
  const avaria = await db.query.avariasTable.findFirst({
    where: and(eq(avariasTable.id, avariaId as string), eq(avariasTable.lojaId, lojaId as string)),
  });
  if (!avaria) {
    // E115: era 204 — apagar o inexistente respondia "apagado", o 404
    // cosmético que o E106 consertou na loja.
    res.status(404).json({ error: "AVARIA_NAO_ENCONTRADA", detalhe: "Esta avaria não existe nesta loja." });
    return;
  }
  // Mesma régua da cobrança: o que impede apagar a avaria é uma cobrança VIVA,
  // porque a foto é a prova que sustenta a parcela. Cancelada a parcela (pelo
  // cancelamento do contrato, por exemplo), não há mais nada sustentado.
  if (avaria.parcelaId && (await cobrancaViva(avaria.parcelaId))) {
    res.status(409).json({
      error: "AVARIA_COM_COBRANCA",
      detalhe: "Esta avaria já virou parcela do contrato — remova a parcela antes",
    });
    return;
  }
  // E115: destruir a foto-prova de um dano agora deixa rastro — era o único
  // DELETE do módulo com guarda e sem trilha.
  await db.transaction(async (tx) => {
    await registrarAuditoria(tx, {
      lojaId: lojaId as string,
      usuario: req.usuario!,
      acao: "AVARIA_REMOVIDA",
      entidade: "avaria",
      entidadeId: avariaId as string,
      detalhe: {
        bloqueioId: avaria.bloqueioId,
        descricao: avaria.descricao,
        custoReparo: avaria.custoReparo,
        temFoto: avaria.fotoBytes !== null,
      },
    });
    await tx
      .delete(avariasTable)
      .where(and(eq(avariasTable.id, avariaId as string), eq(avariasTable.lojaId, lojaId as string)));
  });
  res.status(204).send();
});

router.get("/lojas/:lojaId/avarias/:avariaId/foto", async (req, res): Promise<void> => {
  const { lojaId, avariaId } = req.params;
  const [avaria] = await db
    .select({ fotoBytes: avariasTable.fotoBytes, fotoMime: avariasTable.fotoMime })
    .from(avariasTable)
    .where(and(eq(avariasTable.id, avariaId as string), eq(avariasTable.lojaId, lojaId as string)));
  if (!avaria?.fotoBytes || !avaria.fotoMime) {
    res.status(404).json({ error: "AVARIA_SEM_FOTO", detalhe: "Esta avaria não tem foto." });
    return;
  }
  res.setHeader("Content-Type", avaria.fotoMime);
  res.setHeader("Cache-Control", "private, max-age=60, must-revalidate");
  res.send(avaria.fotoBytes);
});

export default router;
