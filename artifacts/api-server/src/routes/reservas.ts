import { Router, type IRouter } from "express";
import { db, reservasTable, bloqueioVestidosTable, vestidosTable } from "@workspace/db";
import { eq, and, isNull, gte, lt, asc, desc, sql } from "drizzle-orm";
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
    res.status(404).json({ error: "Reserva not found" });
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

router.delete("/lojas/:lojaId/reservas/:reservaId", async (req, res): Promise<void> => {
  const { lojaId, reservaId } = req.params;
  await db.delete(reservasTable).where(and(eq(reservasTable.id, reservaId as string), eq(reservasTable.lojaId, lojaId as string)));
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
    res.status(404).json({ error: "Bloqueio not found" });
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
    res.status(404).json({ error: "Vestido not found" });
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
    res.status(404).json({ error: "Bloqueio not found" });
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

router.delete("/lojas/:lojaId/bloqueios/:bloqueioId", async (req, res): Promise<void> => {
  const { lojaId, bloqueioId } = req.params;
  await db.delete(bloqueioVestidosTable).where(and(eq(bloqueioVestidosTable.id, bloqueioId as string), eq(bloqueioVestidosTable.lojaId, lojaId as string)));
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
    res.status(404).json({ error: "Bloqueio not found" });
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
    res.status(404).json({ error: "Avaria not found" });
    return;
  }
  if (avaria.parcelaId) {
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

    // O vínculo é condicional a ele AINDA estar vazio. Quem perde a corrida não
    // grava nada: a exceção derruba a transação inteira, e a parcela que ela
    // acabou de inserir some junto — que é exatamente a segunda cobrança que
    // este épico existe para impedir.
    const [marcada] = await tx
      .update(avariasTable)
      .set({ parcelaId })
      .where(and(eq(avariasTable.id, avaria.id), isNull(avariasTable.parcelaId)))
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
    res.status(204).send();
    return;
  }
  if (avaria.parcelaId) {
    res.status(409).json({
      error: "AVARIA_COM_COBRANCA",
      detalhe: "Esta avaria já virou parcela do contrato — remova a parcela antes",
    });
    return;
  }
  await db
    .delete(avariasTable)
    .where(and(eq(avariasTable.id, avariaId as string), eq(avariasTable.lojaId, lojaId as string)));
  res.status(204).send();
});

router.get("/lojas/:lojaId/avarias/:avariaId/foto", async (req, res): Promise<void> => {
  const { lojaId, avariaId } = req.params;
  const [avaria] = await db
    .select({ fotoBytes: avariasTable.fotoBytes, fotoMime: avariasTable.fotoMime })
    .from(avariasTable)
    .where(and(eq(avariasTable.id, avariaId as string), eq(avariasTable.lojaId, lojaId as string)));
  if (!avaria?.fotoBytes || !avaria.fotoMime) {
    res.status(404).json({ error: "Avaria sem foto" });
    return;
  }
  res.setHeader("Content-Type", avaria.fotoMime);
  res.setHeader("Cache-Control", "private, max-age=60, must-revalidate");
  res.send(avaria.fotoBytes);
});

export default router;
