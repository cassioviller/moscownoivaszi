import { Router, type IRouter } from "express";
import { db, reservasTable, bloqueioVestidosTable, vestidosTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { leadNaLoja, reservaNaLoja } from "../lib/escopo-loja";
import {
  ListReservasResponse,
  CreateReservaBody,
  CreateReservaResponse,
  UpdateReservaBody,
  UpdateReservaResponse,
  ListBloqueiosResponse,
  CreateBloqueioBody,
  CreateBloqueioResponse,
  UpdateBloqueioBody,
  UpdateBloqueioResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { randomUUID } from "node:crypto";
import {
  verificarDisponibilidade,
  ocupacaoFisica,
  buscarRegra,
  type BloqueioJanelasInput,
  type ConflitoDetalhe,
} from "../lib/disponibilidade";
import { transicaoReservaValida } from "../lib/estados";

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
    res.status(400).json({ error: parsed.error.message });
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
    res.status(400).json({ error: parsed.error.message });
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
  const vestidoId = typeof req.query.vestidoId === "string" ? req.query.vestidoId : undefined;
  // Joins: telas de reservas/provas exibem vestido "codigo · nome" e a noiva.
  const bloqueios = await db.query.bloqueioVestidosTable.findMany({
    where: vestidoId
      ? and(eq(bloqueioVestidosTable.lojaId, lojaId), eq(bloqueioVestidosTable.vestidoId, vestidoId))
      : eq(bloqueioVestidosTable.lojaId, lojaId),
    with: { vestido: true, lead: true },
  });
  res.json(ListBloqueiosResponse.parse(bloqueios));
});

router.post("/lojas/:lojaId/bloqueios", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateBloqueioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
    res.status(400).json({ error: parsed.error.message });
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

export default router;
