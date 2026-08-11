import { Router, type IRouter } from "express";
import { db, reservasTable, bloqueioVestidosTable, vestidosTable, atendimentosTable, contratoBloqueiosTable } from "@workspace/db";
import { eq, and, isNull, gte, lt, asc, desc, sql, inArray } from "drizzle-orm";
import { registrarAuditoria } from "../lib/auditoria";
import { leadNaLoja, reservaNaLoja, reservaDaNoiva } from "../lib/escopo-loja";
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
import { criarReservaDeVestido } from "../lib/reserva-do-vestido";
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

/** S-M24: cancelar a reserva de um contrato ATIVO soltaria a peça da noiva. */
class ReservaPresaAContrato extends Error {
  constructor(public readonly contratos: number) {
    super("RESERVA_COM_CONTRATO");
  }
}

/**
 * E159 — A ORDEM DAS TRANCAS, a mesma que `contratos.ts:521-532` estabelece:
 *
 *     linha-pai da rota (lead · reserva · avaria) → contrato → parcelas
 *       → bloqueios (ORDENADOS por id) → vestidos (ORDENADOS por id)
 *
 * Os bloqueios vão ordenados porque `POST /contratos` também os tranca: sem
 * ordem comum, um cancelamento de reserva segurando b1 e esperando b2, e um
 * contrato segurando b2 e esperando b1, se matariam em ciclo em vez de fila.
 */

/**
 * V12 — `casamentoData: null` virava **01/01/1970**, e o zod dizia que estava bom.
 *
 * `zod.coerce.date()` chama `new Date(null)`, que é uma data VÁLIDA (a época
 * Unix): `UpdateReservaBody.safeParse({ casamentoData: null })` devolve
 * `success: true` com `1970-01-01T00:00:00.000Z` — medido. O `.optional()` só
 * curto-circuita em `undefined`, nunca em `null`.
 *
 * O estrago: o casamento some da lente "Reservas" (que recorta por data futura)
 * e reaparece sob "janeiro de 1970", com o vestido LIVRE no calendário para a
 * data real — outra noiva o reserva sem conflito nenhum.
 *
 * A guarda mora aqui e não no schema porque o zod é GERADO a partir do
 * `openapi.yaml`: editar o arquivo gerado seria apagado na próxima geração, e
 * o spec não tem como dizer "aceite a chave, recuse o valor nulo". A régua é
 * olhar o corpo CRU, antes da coerção.
 */
function mandouDataNula(body: unknown): boolean {
  return typeof body === "object" && body !== null && (body as Record<string, unknown>).casamentoData === null;
}

const ERRO_DATA_NULA = {
  error: "DATA_DE_CASAMENTO_INVALIDA",
  detalhe: "A data do casamento não pode ser vazia — é ela que decide quando o vestido fica reservado.",
  campos: [{ campo: "casamentoData", motivo: "Informe a data do casamento" }],
};

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
  // V12: a mesma armadilha do PATCH, e aqui o campo é OBRIGATÓRIO — o que a
  // torna pior: a reserva NASCIA em 1970, sem nunca ter tido data.
  if (mandouDataNula(req.body)) {
    res.status(422).json(ERRO_DATA_NULA);
    return;
  }
  const parsed = CreateReservaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  if (!(await leadNaLoja(parsed.data.leadId, lojaId))) {
    res.status(422).json({ error: "REFERENCIA_INVALIDA", detalhe: "lead não é desta loja" });
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
  // V12: `casamentoData: null` atravessava o zod como 01/01/1970 e a reserva
  // sumia da lente de datas futuras, com o vestido livre na data real.
  if (mandouDataNula(req.body)) {
    res.status(422).json(ERRO_DATA_NULA);
    return;
  }
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

  // A guarda rápida FICA: ela dá o 422 certo sem custo de transação para o
  // caminho errado. O que muda (R4/V10) é que ela deixou de ser a última
  // palavra — a reconferência sob tranca está lá dentro.
  if (dados.status && !transicaoReservaValida(reserva.status, dados.status)) {
    res.status(422).json({
      error: "TRANSICAO_INVALIDA",
      detalhe: `Reserva não pode ir de ${reserva.status} para ${dados.status}`,
    });
    return;
  }

  const hoje = new Date();

  try {
    const desfecho = await db.transaction(async (tx) => {
      /**
       * R4/V10 — o PATCH era a ÚNICA rota de escrita do módulo que não trancava
       * nada, e a máquina de estados era validada fora da transação.
       *
       * `CANCELADA` é terminal (`TRANSICOES_RESERVA.CANCELADA = []`) e ainda
       * assim virava CONCLUIDA: duas requisições leem CONFIRMADA no pool, as
       * duas passam pela guarda acima, a primeira cancela e solta os vestidos,
       * a segunda grava CONCLUIDA por cima. **A reserva fica CONCLUIDA com
       * todos os vestidos soltos e uma trilha dizendo que ela foi cancelada** —
       * a peça anunciada livre para outra noiva enquanto a ficha diz que a
       * reserva foi concluída com sucesso.
       *
       * A releitura sob `FOR UPDATE` refaz a MESMA pergunta da guarda rápida.
       * É a régua da S-M24 — estado terminal é terminal em toda porta — que
       * esta porta não tinha.
       */
      const [sobTranca] = await tx.select().from(reservasTable)
        .where(and(eq(reservasTable.id, reservaId), eq(reservasTable.lojaId, lojaId)))
        .for("update");
      if (!sobTranca) return { sumiu: true as const };
      if (dados.status && !transicaoReservaValida(sobTranca.status, dados.status)) {
        return { transicaoInvalida: sobTranca.status };
      }

      await tx.update(reservasTable)
        .set({
          status: dados.status,
          casamentoData: dados.casamentoData,
          updatedAt: new Date(),
        })
        .where(eq(reservasTable.id, reserva.id));

      if (dados.status === "CANCELADA") {
        /**
         * S-M24 (rodada 2, achado 6#2): esta porta soltava os vestidos de um
         * contrato ATIVO — os dois DELETEs contam o vínculo e recusam com 409,
         * e o 409 deles ainda apontava para CÁ como saída. Cancelar a reserva
         * enquanto o contrato de R$ 5.000,00 segue cobrando parcelas devolvia
         * a peça ao mercado: outra noiva a reservava para a MESMA data, e a
         * dupla promessa só aparecia na retirada. Agora a mesma pergunta dos
         * DELETEs roda aqui (dentro da transação, achado 3#7), e o
         * cancelamento deixa trilha — não deixava nenhuma.
         */
        const bloqueiosDaReserva = await tx.select({ id: bloqueioVestidosTable.id })
          .from(bloqueioVestidosTable)
          .where(and(
            eq(bloqueioVestidosTable.reservaId, reserva.id),
            isNull(bloqueioVestidosTable.canceladoEm),
          ));
        if (bloqueiosDaReserva.length > 0) {
          /**
           * R1 — a contagem de contratos ATIVOS que a S-M24 pôs aqui rodava
           * SEM tranca nas linhas de bloqueio.
           *
           * O `POST /contratos` tranca b1 (`contratos.ts:543`) e commita no
           * meio; este cancelamento, que já tinha lido zero, grava
           * `canceladoEm` por cima. **Medido:** contrato ATIVO de R$ 5.000,00
           * cobrando as 9 parcelas com o vestido solto de volta ao mercado —
           * o bloqueio soft-cancelado sai da disponibilidade
           * (`disponibilidade.ts:409`) E do EXCLUDE do banco
           * (`WHERE cancelado_em IS NULL`), então outra noiva reserva a MESMA
           * peça para a MESMA data. A dupla promessa só aparece na retirada.
           *
           * A tranca vai ORDENADA por id — a mesma ordem do `POST /contratos`,
           * porque as duas portas disputam as mesmas linhas.
           */
          for (const b of [...bloqueiosDaReserva].sort((x, y) => (x.id < y.id ? -1 : 1))) {
            await tx.select({ id: bloqueioVestidosTable.id })
              .from(bloqueioVestidosTable)
              .where(eq(bloqueioVestidosTable.id, b.id))
              .for("update");
          }
          const presos = await tx.select({ contratoId: contratoBloqueiosTable.contratoId })
            .from(contratoBloqueiosTable)
            .innerJoin(contratosTable, eq(contratosTable.id, contratoBloqueiosTable.contratoId))
            .where(and(
              inArray(contratoBloqueiosTable.bloqueioId, bloqueiosDaReserva.map((b) => b.id)),
              eq(contratosTable.status, "ATIVO"),
            ));
          if (presos.length > 0) {
            throw new ReservaPresaAContrato(presos.length);
          }
        }
        await registrarAuditoria(tx, {
          lojaId,
          usuario: req.usuario!,
          acao: "RESERVA_CANCELADA",
          entidade: "reserva",
          entidadeId: reserva.id,
          detalhe: {
            leadId: reserva.leadId,
            casamentoData: reserva.casamentoData,
            bloqueiosSoltos: bloqueiosDaReserva.length,
          },
        });
        // A constraint EXCLUDE do banco não enxerga o status da reserva —
        // soft-cancela os bloqueios vinculados para liberar os vestidos.
        await tx.update(bloqueioVestidosTable)
          .set({ canceladoEm: new Date(), updatedAt: new Date() })
          .where(and(
            eq(bloqueioVestidosTable.reservaId, reserva.id),
            isNull(bloqueioVestidosTable.canceladoEm),
          ));
        return { ok: true as const };
      }

      if (dados.casamentoData === undefined) return { ok: true as const };

      // Reserva é a fonte da verdade da data operacional → propaga a nova
      // data a todos os bloqueios vinculados, revalidando cada um.
      const vinculados = await tx.select().from(bloqueioVestidosTable)
        .where(and(
          eq(bloqueioVestidosTable.reservaId, reserva.id),
          isNull(bloqueioVestidosTable.canceladoEm),
        ));

      /**
       * R3 — a propagação de data revalidava SEM `FOR UPDATE` no vestido.
       *
       * O `POST /bloqueios` (`:493`) e o `PATCH /bloqueios` (`:604`) trancam a
       * linha do VESTIDO justamente porque a verificação precisa enxergar os
       * criadores concorrentes; esta porta refazia a mesma verificação sem a
       * mesma tranca. E o EXCLUDE do banco não cobre o buraco: ele só compara
       * envelopes FÍSICOS, então o par PROVA×FÍSICA que `conflitos()` acusa
       * — a prova da noiva A dentro do uso da noiva B — passa sem 23P01.
       *
       * A tranca vai ORDENADA por `vestidoId`: uma reserva com duas peças e
       * outra com as mesmas duas em ordem inversa se serializariam em deadlock.
       * Ordenar aqui basta porque as portas irmãs trancam um vestido só.
       */
      for (const vestidoId of [...new Set(vinculados.map((b) => b.vestidoId))].sort()) {
        await tx.select({ id: vestidosTable.id }).from(vestidosTable)
          .where(eq(vestidosTable.id, vestidoId))
          .for("update");
      }

      for (const bloqueio of vinculados) {
        const candidato: BloqueioJanelasInput = {
          id: bloqueio.id,
          tipo: bloqueio.tipo,
          casamentoData: dados.casamentoData,
          provaDataReal: bloqueio.provaDataReal,
          retiradaDataReal: bloqueio.retiradaDataReal,
          devolucaoDataReal: bloqueio.devolucaoDataReal,
          lavagemConcluidaEm: bloqueio.lavagemConcluidaEm,
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
      return { ok: true as const };
    });

    if ("sumiu" in desfecho) {
      res.status(404).json({ error: "RESERVA_NAO_ENCONTRADA", detalhe: "Esta reserva não existe nesta loja." });
      return;
    }
    // R4/V10: perder a corrida dá o MESMO 422 da guarda rápida, com o status
    // que o VENCEDOR deixou — a frase diz de onde para onde não dá, e é essa a
    // informação que falta para a pessoa entender que alguém mexeu antes dela.
    if ("transicaoInvalida" in desfecho) {
      res.status(422).json({
        error: "TRANSICAO_INVALIDA",
        detalhe: `Reserva não pode ir de ${desfecho.transicaoInvalida} para ${dados.status}`,
      });
      return;
    }
  } catch (err) {
    if (err instanceof ConflitoDisponibilidadeError) {
      res.status(409).json({ error: "VESTIDO_INDISPONIVEL", conflitos: err.conflitos });
      return;
    }
    if (err instanceof ReservaPresaAContrato) {
      res.status(409).json({
        error: "RESERVA_COM_CONTRATO",
        detalhe:
          `${err.contratos} contrato(s) ativo(s) preso(s) ao vestido desta reserva — ` +
          "cancele o contrato primeiro, ou o vestido da noiva voltaria ao mercado.",
        contratosAtivos: err.contratos,
      });
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

  /**
   * V13 — o DELETE de reserva ignorava a coluna legada que o DELETE irmão conta
   * DE PROPÓSITO.
   *
   * `DELETE /bloqueios` (`:674`) conta `contratos.bloqueio_vestido_id` além do
   * N:N, com o comentário dizendo por quê: a coluna singular é LIDA em produção
   * (portal, PDF), e um contrato ATIVO pendurado nela segura o bloqueio do
   * mesmo jeito. Este DELETE, um nível acima e com cascata mais funda, não a
   * contava. **O contrato ficava com o vínculo nulo (`set null` da FK) e as
   * parcelas seguiam sendo cobradas sobre um vestido que voltou ao mercado.**
   */
  const contarHistoria = async (executor: typeof db, ids: string[]) =>
    ids.length === 0
      ? { avarias: 0, contratosAtivos: 0, atendimentos: 0 }
      : await Promise.all([
          executor.select({ id: avariasTable.id }).from(avariasTable)
            .where(inArray(avariasTable.bloqueioId, ids)),
          executor.select({ id: contratoBloqueiosTable.contratoId }).from(contratoBloqueiosTable)
            .innerJoin(contratosTable, eq(contratosTable.id, contratoBloqueiosTable.contratoId))
            .where(and(
              inArray(contratoBloqueiosTable.bloqueioId, ids),
              eq(contratosTable.status, "ATIVO"),
            )),
          executor.select({ id: contratosTable.id }).from(contratosTable)
            .where(and(
              inArray(contratosTable.bloqueioVestidoId, ids),
              eq(contratosTable.status, "ATIVO"),
            )),
          // Atendimento não aponta para a reserva: ele chega a ela pelo
          // bloqueio (`atendimentos.bloqueio_id`), e é por esse caminho que a
          // cascata o leva.
          executor.select({ id: atendimentosTable.id }).from(atendimentosTable)
            .where(inArray(atendimentosTable.bloqueioId, ids)),
        ]).then(([av, vinc, legado, at]) => ({
          avarias: av.length,
          contratosAtivos: vinc.length + legado.length,
          atendimentos: at.length,
        }));

  const historia = await contarHistoria(db, bloqueioIds);

  if (historia.avarias + historia.contratosAtivos + historia.atendimentos > 0) {
    res.status(409).json({
      error: "RESERVA_COM_HISTORICO",
      detalhe:
        "Esta reserva carrega história que sumiria junto: " +
        `${historia.contratosAtivos} contrato(s) ativo(s) preso(s) ao vestido, ` +
        `${historia.avarias} avaria(s) registrada(s) e ${historia.atendimentos} atendimento(s)/prova(s). ` +
        "Cancele os bloqueios (soft-cancel) em vez de apagar a reserva.",
      contratosAtivos: historia.contratosAtivos,
      avarias: historia.avarias,
      atendimentos: historia.atendimentos,
    });
    return;
  }

  /**
   * S-M22 (rodada 2, achado 3#7): as três contagens acima rodaram no POOL —
   * entre elas e o delete cabe um POST inteiro (avaria com foto-prova, prova
   * agendada, contrato prendendo o bloqueio), e o filho nascido na janela
   * caía pela cascata que a guarda existe para impedir. `FOR UPDATE` na
   * linha-pai + recontagem como statement novo, a forma da S33.
   */
  const resultado = await db.transaction(async (tx) => {
    await tx.select({ id: reservasTable.id }).from(reservasTable)
      .where(eq(reservasTable.id, reservaId))
      .for("update");
    /**
     * R2/V8 — a recontagem usava o `bloqueioIds` lido no POOL, e por isso não
     * recontava nada.
     *
     * O `FOR UPDATE` acima tranca a RESERVA; o `POST /bloqueios` tranca a linha
     * do **VESTIDO** (`:493`) e nunca a da reserva — então o bloqueio nascido
     * na janela não conflita com esta tranca, não aparece na lista velha, e
     * `if (bloqueioIds.length)` pulava a recontagem INTEIRA quando a lista
     * estava vazia. O `ON DELETE CASCADE` o levava junto: **a API responde 201
     * para quem criou e 204 para quem apagou**, e a auditoria grava
     * `bloqueios: 0`.
     *
     * A lista é relida DENTRO da transação. Ela é o que a recontagem enumera e
     * o que a trilha declara — as duas passam a falar do mesmo conjunto.
     */
    const idsAgora = (await tx
      .select({ id: bloqueioVestidosTable.id })
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.reservaId, reservaId))
    ).map((b) => b.id);

    const agora = await contarHistoria(tx as unknown as typeof db, idsAgora);
    if (agora.avarias + agora.contratosAtivos + agora.atendimentos > 0) {
      return { corrida: true as const };
    }
    // ANTES do delete: depois dele não há linha de onde reconstituir.
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "RESERVA_REMOVIDA",
      entidade: "reserva",
      entidadeId: reservaId,
      detalhe: { leadId: reserva.leadId, casamentoData: reserva.casamentoData, bloqueios: idsAgora.length },
    });
    await tx.delete(reservasTable).where(and(eq(reservasTable.id, reservaId), eq(reservasTable.lojaId, lojaId)));
    return { ok: true as const };
  });
  if ("corrida" in resultado) {
    res.status(409).json({
      error: "RESERVA_COM_HISTORICO",
      detalhe:
        "Esta reserva acabou de ganhar história (avaria, prova ou contrato) — recarregue e confira antes de remover.",
    });
    return;
  }
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
    res.status(422).json({ error: "REFERENCIA_INVALIDA", detalhe: "lead não é desta loja" });
    return;
  }
  if (dados.reservaId && !(await reservaNaLoja(dados.reservaId, lojaId))) {
    res.status(422).json({ error: "REFERENCIA_INVALIDA", detalhe: "reserva não é desta loja" });
    return;
  }
  /**
   * R5/V4 (E164) — `leadId` e `reservaId` eram provados cada um contra a LOJA,
   * e nunca um contra o outro.
   *
   * O bloqueio da noiva A pendurava na reserva da noiva B, e a consequência é
   * de dinheiro: com o V3, a guarda de avaria cai para `reservas.lead_id` —
   * o reparo do vestido que A alugou só poderia ser cobrado no carnê de B, e
   * cobrá-lo em A devolveria 422. Mesma classe do S2/E107, que
   * `escopo-loja.ts` já documenta.
   */
  if (dados.reservaId && dados.leadId && !(await reservaDaNoiva(dados.reservaId, lojaId, dados.leadId))) {
    res.status(422).json({
      error: "RESERVA_DE_OUTRA_NOIVA",
      detalhe: "Esta reserva agrupadora é de outra noiva — o bloqueio não pode apontar as duas.",
      campos: [{ campo: "reservaId", motivo: "A reserva pertence a outra noiva" }],
    });
    return;
  }
  /**
   * R7 — o POST aceitava pendurar um bloqueio numa reserva CANCELADA.
   *
   * `reservaNaLoja` prova a LOJA e para aí. O bloqueio nascia num estado que o
   * sistema lê de dois jeitos opostos: **invisível para a disponibilidade**
   * (o PATCH que cancelou a reserva soft-cancela os bloqueios dela, mas este
   * nasceu depois e fica vivo apontando uma reserva morta) e **visível para o
   * EXCLUDE** do banco. A tela mostra o vestido livre, a vendedora tenta
   * reservá-lo para a próxima noiva, e o INSERT morre em 23P01 com um 409 que
   * não diz qual reserva está no caminho — sem saída a não ser apagar na mão.
   *
   * A S-M24 mandou estado terminal ser terminal em TODA porta. Esta ficou de
   * fora da enumeração dela.
   */
  if (dados.reservaId) {
    const [reservaMae] = await db.select({ status: reservasTable.status }).from(reservasTable)
      .where(and(eq(reservasTable.id, dados.reservaId), eq(reservasTable.lojaId, lojaId)));
    if (reservaMae?.status === "CANCELADA") {
      res.status(422).json({
        error: "RESERVA_CANCELADA",
        detalhe: "Esta reserva foi cancelada — não dá para pendurar um vestido nela. Abra uma reserva nova.",
        campos: [{ campo: "reservaId", motivo: "A reserva está cancelada" }],
      });
      return;
    }
  }

  if (dados.tipo === "RESERVA_CASAMENTO" && !dados.casamentoData) {
    res.status(400).json({
      error: "RESERVA_SEM_DATA_DE_CASAMENTO",
      detalhe: "Reserva de casamento precisa da data do casamento.",
    });
    return;
  }
  if (dados.tipo === "MANUTENCAO" && !dados.inicio) {
    res.status(400).json({
      error: "MANUTENCAO_SEM_INICIO",
      detalhe: "Manutenção precisa da data de início.",
    });
    return;
  }

  /**
   * S-M22 (rodada 2, achado 3#4): a verificação rodava no POOL e o INSERT
   * solto — dois bloqueios do MESMO vestido criados no mesmo segundo não se
   * enxergavam, e o EXCLUDE do banco só compara envelopes FÍSICOS: o par
   * PROVA×FÍSICA que `conflitos()` acusa (prova da noiva A dentro do uso da
   * noiva B) commitava sem 23P01 nenhum. `FOR UPDATE` na linha do VESTIDO
   * serializa os criadores concorrentes; a verificação relê pelo executor da
   * transação e enxerga o que o vencedor commitou.
   *
   * E162: a transação virou `criarReservaDeVestido` (lib) porque o criador
   * ganhou uma segunda porta — o `POST /orcamentos/:id/reservar`, com gate
   * `leads.criar` (decisão R10). Uma régua, duas permissões.
   */
  const criado = await criarReservaDeVestido({
    lojaId,
    vestidoId: dados.vestidoId,
    leadId: dados.leadId ?? null,
    tipo: dados.tipo,
    casamentoData: dados.casamentoData ?? null,
    inicio: dados.inicio ?? null,
    fim: dados.fim ?? null,
    observacao: dados.observacao ?? null,
    reservaId: dados.reservaId ?? null,
  });
  if ("conflitos" in criado) {
    res.status(409).json({ error: "VESTIDO_INDISPONIVEL", conflitos: criado.conflitos });
    return;
  }
  res.status(201).json(CreateBloqueioResponse.parse(criado.bloqueio));
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
    // E152: a última data real do ciclo, com a mesma régua de null-desfaz.
    lavagemConcluidaEm:
      dados.lavagemConcluidaEm === undefined ? existente.lavagemConcluidaEm : dados.lavagemConcluidaEm,
    inicio: dados.inicio ?? existente.inicio,
    fim: dados.fim ?? existente.fim,
  };

  // Devolução sem retirada é uma história impossível de contar.
  if (candidato.devolucaoDataReal && !candidato.retiradaDataReal) {
    res.status(400).json({
      error: "DEVOLUCAO_SEM_RETIRADA",
      detalhe: "Não dá para desfazer a retirada com a devolução já registrada.",
    });
    return;
  }
  /**
   * E152 — e a lavagem sem devolução é a mesma história, um passo à frente: a
   * peça não pode ter voltado da lavanderia sem ter voltado da noiva.
   *
   * Morde nos dois sentidos, e o segundo é o que importa: desfazer a devolução
   * com a lavagem registrada deixaria uma data real órfã, apontando um fato
   * que o próprio sistema passou a negar.
   */
  if (candidato.lavagemConcluidaEm && !candidato.devolucaoDataReal) {
    res.status(400).json({
      error: "LAVAGEM_SEM_DEVOLUCAO",
      detalhe:
        "A peça não pode ter voltado da lavanderia sem ter sido devolvida — desfaça a volta da lavanderia primeiro.",
      campos: [{ campo: "devolucaoDataReal", motivo: "Há volta da lavanderia registrada" }],
    });
    return;
  }

  const mudouJanelas =
    dados.provaDataReal !== undefined ||
    dados.retiradaDataReal !== undefined ||
    dados.devolucaoDataReal !== undefined ||
    dados.lavagemConcluidaEm !== undefined ||
    dados.inicio !== undefined ||
    dados.fim !== undefined;

  // S-M22 (rodada 2, achado 3#4): mesma janela do POST — verificação no pool,
  // escrita solta. A tranca vai na linha do VESTIDO, a mesma dos criadores
  // concorrentes, e a verificação relê pelo executor da transação.
  const atualizado = await db.transaction(async (tx) => {
    let regra;
    if (mudouJanelas) {
      await tx.select({ id: vestidosTable.id }).from(vestidosTable)
        .where(eq(vestidosTable.id, existente.vestidoId))
        .for("update");
      const resultado = await verificarDisponibilidade({
        lojaId,
        vestidoId: existente.vestidoId,
        candidato,
        ignorarBloqueioId: existente.id,
        hoje: new Date(),
        executor: tx,
      });
      if (!resultado.disponivel) return { conflitos: resultado.conflitos };
      regra = resultado.regra;
    } else {
      regra = await buscarRegra(lojaId, tx);
    }

    const ocupacao = ocupacaoFisica(candidato, regra);

    const [bloqueio] = await tx.update(bloqueioVestidosTable)
      .set({
        provaDataReal: dados.provaDataReal,
        retiradaDataReal: dados.retiradaDataReal,
        devolucaoDataReal: dados.devolucaoDataReal,
        lavagemConcluidaEm: dados.lavagemConcluidaEm,
        inicio: dados.inicio,
        fim: dados.fim,
        observacao: dados.observacao,
        ocupacaoInicio: ocupacao?.inicio ?? null,
        ocupacaoFim: ocupacao?.fim ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(bloqueioVestidosTable.id, bloqueioId), eq(bloqueioVestidosTable.lojaId, lojaId)))
      .returning();
    return { bloqueio: bloqueio! };
  });
  if ("conflitos" in atualizado) {
    res.status(409).json({ error: "VESTIDO_INDISPONIVEL", conflitos: atualizado.conflitos });
    return;
  }
  res.json(UpdateBloqueioResponse.parse(atualizado.bloqueio));
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

  // S-M22 (rodada 2, achado 3#7): a recontagem entra na transação, sob a
  // tranca da linha-pai — o filho que nasceu entre a contagem do pool e o
  // delete não cai mais na cascata em silêncio.
  const resultado = await db.transaction(async (tx) => {
    await tx.select({ id: bloqueioVestidosTable.id }).from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueioId))
      .for("update");
    const [avariasAgora, vinculosAgora, legadoAgora, atendimentosAgora] = await Promise.all([
      tx.select({ id: avariasTable.id }).from(avariasTable)
        .where(eq(avariasTable.bloqueioId, bloqueioId)),
      tx.select({ id: contratoBloqueiosTable.contratoId }).from(contratoBloqueiosTable)
        .innerJoin(contratosTable, eq(contratosTable.id, contratoBloqueiosTable.contratoId))
        .where(and(
          eq(contratoBloqueiosTable.bloqueioId, bloqueioId),
          eq(contratosTable.status, "ATIVO"),
        )),
      tx.select({ id: contratosTable.id }).from(contratosTable)
        .where(and(eq(contratosTable.bloqueioVestidoId, bloqueioId), eq(contratosTable.status, "ATIVO"))),
      tx.select({ id: atendimentosTable.id }).from(atendimentosTable)
        .where(eq(atendimentosTable.bloqueioId, bloqueioId)),
    ]);
    if (avariasAgora.length + vinculosAgora.length + legadoAgora.length + atendimentosAgora.length > 0) {
      return { corrida: true as const };
    }
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "BLOQUEIO_REMOVIDO",
      entidade: "bloqueio",
      entidadeId: bloqueioId,
      detalhe: { vestidoId: bloqueio.vestidoId, leadId: bloqueio.leadId, tipo: bloqueio.tipo },
    });
    await tx.delete(bloqueioVestidosTable).where(and(eq(bloqueioVestidosTable.id, bloqueioId), eq(bloqueioVestidosTable.lojaId, lojaId)));
    return { ok: true as const };
  });
  if ("corrida" in resultado) {
    res.status(409).json({
      error: "BLOQUEIO_COM_HISTORICO",
      detalhe:
        "Este bloqueio acabou de ganhar história (avaria, prova ou contrato) — recarregue e confira antes de apagá-lo.",
    });
    return;
  }
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
async function cobrancaViva(parcelaId: string, executor: typeof db = db): Promise<boolean> {
  const [parcela] = await executor
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
    .select({ leadId: bloqueioVestidosTable.leadId, reservaId: bloqueioVestidosTable.reservaId })
    .from(bloqueioVestidosTable)
    .where(eq(bloqueioVestidosTable.id, avaria.bloqueioId));
  /**
   * V3 (E163) — a guarda comparava só o `leadId` NULÁVEL do bloqueio, e nunca
   * caía para `reservaId → reservas.lead_id`, que é NOT NULL.
   *
   * **O dono existia e não era perguntado:** um bloqueio sem noiva pendurado
   * numa reserva (que SEMPRE tem noiva) deixava o reparo de R$ 1.500,00 cair
   * no carnê da noiva B por um dano que ela não causou — e o extrato do portal
   * dela mostrava a cobrança. A régua continua a mesma do comentário acima
   * ("prova quando é provável"): sem noiva em NENHUMA das duas pontas, não há
   * o que comparar e a rota segue; com noiva em qualquer uma, tem de ser a
   * mesma.
   */
  let donoDaAvaria = bloqueioDaAvaria?.leadId ?? null;
  if (!donoDaAvaria && bloqueioDaAvaria?.reservaId) {
    const [reservaMae] = await db
      .select({ leadId: reservasTable.leadId })
      .from(reservasTable)
      .where(eq(reservasTable.id, bloqueioDaAvaria.reservaId));
    donoDaAvaria = reservaMae?.leadId ?? null;
  }
  if (donoDaAvaria && donoDaAvaria !== contrato.leadId) {
    res.status(422).json({
      error: "AVARIA_DE_OUTRA_NOIVA",
      detalhe: "Este reparo é do vestido de outra noiva — cobre no contrato dela",
      campos: [{ campo: "contratoId", motivo: "O contrato é de outra noiva" }],
    });
    return;
  }

  const parcelaId = randomUUID();
  const desfecho = await db.transaction(async (tx) => {
    /**
     * R9/V11 — o contrato era lido no POOL e a parcela nascia depois.
     *
     * `contratoAtivoDaLoja` (`:907`) roda fora desta transação. O cancelamento
     * em massa do contrato passa no meio, e a parcela de **R$ 480,00** nasce
     * FORA dele: contrato CANCELADO com parcela viva no carnê, no aging e no
     * extrato do portal da noiva — cobrança de uma venda que não existe.
     *
     * A mesma tranca fecha o V11: sem ela, duas cobranças simultâneas liam o
     * mesmo `max(numero)` e colidiam na UNIQUE (contratoId, numero). A
     * perdedora lia **"Já existe um registro com estes dados"**, que se lê como
     * *já cobrei este reparo* — a vendedora para de tentar e **os R$ 500,00 da
     * segunda avaria nunca entram**. Sob a tranca os números saem em série e a
     * colisão deixa de existir, em vez de virar mensagem.
     *
     * A ordem é a do módulo: contrato → parcelas.
     */
    const [contratoSobTranca] = await tx
      .select({ status: contratosTable.status })
      .from(contratosTable)
      .where(and(eq(contratosTable.id, parsed.data.contratoId), eq(contratosTable.lojaId, lojaId as string)))
      .for("update");
    if (contratoSobTranca?.status !== "ATIVO") return { contratoNaoAtivo: true as const };

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
      // S26: o reparo NÃO é carnê — é o que permite ao contrato ainda gerar o dele.
      origem: "AVARIA",
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
    return { ok: true as const };
  }).catch((err) => {
    if (err instanceof AvariaJaCobrada) return { jaCobrada: true as const };
    throw err;
  });

  if (desfecho && "contratoNaoAtivo" in desfecho) {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }

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
  const resultado = await db.transaction(async (tx) => {
    /**
     * V15 — este era o ÚNICO DELETE do arquivo sem `FOR UPDATE`.
     *
     * A guarda de `cobrancaViva` roda no pool; entre ela e o delete cabe o
     * `POST /avarias/:id/cobrar` inteiro. A avaria some enquanto a cobrança
     * nasce, e sobra **parcela viva de R$ 1.500,00 sem foto, sem descrição e
     * sem avaria que a sustente** — o cenário literal que o cabeçalho do
     * E97/F23 logo acima diz existir para impedir. A FK é `set null`, então
     * nem o banco reclama.
     *
     * `FOR UPDATE` na linha da avaria + releitura do `parcelaId` DENTRO da
     * transação: o `cobrar` toma a mesma linha no `UPDATE avarias SET
     * parcela_id`, então a tranca os serializa.
     */
    const [sobTranca] = await tx.select({ parcelaId: avariasTable.parcelaId })
      .from(avariasTable)
      .where(and(eq(avariasTable.id, avariaId as string), eq(avariasTable.lojaId, lojaId as string)))
      .for("update");
    if (!sobTranca) return { sumiu: true as const };
    if (sobTranca.parcelaId && (await cobrancaViva(sobTranca.parcelaId, tx as unknown as typeof db))) {
      return { comCobranca: true as const };
    }
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
    return { ok: true as const };
  });
  if ("sumiu" in resultado) {
    res.status(404).json({ error: "AVARIA_NAO_ENCONTRADA", detalhe: "Esta avaria não existe nesta loja." });
    return;
  }
  if ("comCobranca" in resultado) {
    res.status(409).json({
      error: "AVARIA_COM_COBRANCA",
      detalhe: "Esta avaria acabou de virar parcela do contrato — remova a parcela antes.",
    });
    return;
  }
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
