import { Router, type IRouter } from "express";
import { db, reservasTable, bloqueioVestidosTable, vestidosTable, atendimentosTable, contratoBloqueiosTable } from "@workspace/db";
import { eq, and, isNull, gte, lt, asc, desc, sql, inArray } from "drizzle-orm";
import { registrarAuditoria } from "../lib/auditoria";
import { leadNaLoja, reservaNaLoja, reservaDaNoiva } from "../lib/escopo-loja";
import {
  ListReservasResponse,
  ListReservasQueryParams,
  GetReservaResponse,
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
  // S-C11 — a porta de correção da avaria.
  UpdateAvariaBody,
  UpdateAvariaResponse,
  CobrarAvariaBody,
  CobrarAvariaResponse,
  // E212 — a conta do atraso na devolução (cláusula 16ª).
  CobrarAtrasoDaDevolucaoBody,
  CobrarAtrasoDaDevolucaoResponse,
  PreviaDaCobrancaDeAtrasoResponse
} from "@workspace/api-zod";
import { avariasTable, parcelasTable, contratosTable, contratoItensTable } from "@workspace/db";
import { identificarImagem } from "../lib/imagem";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { randomUUID } from "node:crypto";
import {
  verificarDisponibilidade,
  ocupacaoFisica,
  buscarRegra,
  diaLocal,
  inicioDoDia,
  janelaDeProvaPrevista,
  type BloqueioJanelasInput,
  type ConflitoDetalhe,
  type DbExecutor,
} from "../lib/disponibilidade";
import { transicaoReservaValida } from "../lib/estados";
import { criarReservaDeVestido } from "../lib/reserva-do-vestido";
import { erroDeValidacao } from "../lib/erros";
// S-O56/E185: a régua do dono saiu daqui para `lib/dono-do-bloqueio.ts` — ela
// vale para as 10 operações fora deste arquivo que também aninham um bloqueio.
import {
  MAE_DO_BLOQUEIO,
  bloqueioComDono,
  donoDoBloqueio,
  reservaComDonos,
} from "../lib/dono-do-bloqueio";
import { FOTO_MAX_BYTES as AVARIA_FOTO_MAX_BYTES } from "../lib/limites";
import {
  addDias,
  ancoraDeNegocio,
  avaliarTaxaDeAvaria,
  cobrancaDoAtraso,
  diaDeNegocio,
  diasDeAtraso,
  explicacaoDaFaixa,
  explicacaoDoAtraso,
  hojeLocal,
  reajusteDaTrocaDeData,
  reancorarDataDeNegocio,
  // S-C11: a régua única do "entrou dinheiro?" (E115/S5) — nunca a lista de
  // status, que mente na PARCIAL preservada pelo `destinoPago: "manter"`.
  teveRecebimento,
  type PecaAtrasada,
  type TipoDeAvaria,
  type VeredictoDaTaxa,
} from "@workspace/financeiro-core";

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
 * E159 — A ORDEM DAS TRANCAS, a mesma que `contratos.ts:643` estabelece
 * (S-O35: a referência apontava `:521-532`, e o bloco andou — o `docs/` tem
 * régua para links envelhecidos, o comentário de código não tem):
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
const RESERVA_COM_TUDO = {
  lead: true,
  // Vestido aninhado: o livro de reservas exibe "codigo · nome".
  bloqueios: { with: { vestido: true } },
} as const;

/**
 * S-O55/E185 — a listagem que devolvia a loja inteira ganha os recortes que a
 * irmã de baixo já tinha.
 *
 * `GET /bloqueios` recorta por vestido (E45), por noiva (E79) e por casamento
 * futuro/passado (E87); esta não recortava nada. Medido no banco da loja:
 * **118 reservas, 115 bloqueios e 118 fichas de noiva aninhadas em uma
 * resposta** — a lente 3 da S-O22 um nível acima.
 *
 * O `vestidoId` não tem irmão aqui de propósito: a reserva é o AGREGADO, e a
 * pergunta "quais reservas seguram esta peça" é do bloqueio, que tem a coluna.
 */
router.get("/lojas/:lojaId/reservas", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const query = ListReservasQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "FILTRO_INVALIDO" });
    return;
  }
  const { leadId, futuras } = query.data;
  const hoje = inicioDoDia(diaLocal(new Date()));
  const reservas = await db.query.reservasTable.findMany({
    where: and(
      eq(reservasTable.lojaId, lojaId),
      ...(leadId ? [eq(reservasTable.leadId, leadId)] : []),
      ...(futuras === "true" ? [gte(reservasTable.casamentoData, hoje)] : []),
      ...(futuras === "false" ? [lt(reservasTable.casamentoData, hoje)] : []),
    ),
    with: RESERVA_COM_TUDO,
    // `casamentoData` é NOT NULL aqui — ao contrário do bloqueio, nenhuma linha
    // escapa do recorte por ser nula. Passadas saem da mais recente para a mais
    // antiga; o resto mantém a ordem histórica (asc), para não mudar o contrato
    // de quem já lia sem recorte.
    orderBy: futuras === "false" ? [desc(reservasTable.casamentoData)] : [asc(reservasTable.casamentoData)],
  });
  res.json(ListReservasResponse.parse(reservas.map(reservaComDonos)));
});

/**
 * S-O18/E179 — UMA reserva, que era a leitura que não existia.
 *
 * A única porta de leitura era a listagem da loja INTEIRA. Foi ela que tornou
 * o conserto do V14 impossível de fazer só na tela (o plano do E167 pedia um
 * conserto que não tinha de onde ler), e é a mesma fresta em que o V5 esbarra
 * do outro lado — o `casamentoData` do bloqueio que ninguém corrige.
 *
 * A forma é a do `GET /bloqueios/:bloqueioId` (E79) um nível abaixo, e o 404
 * é o da régua de sempre: id do path que não é da loja não vira 403 nem lista
 * vazia, vira "não existe nesta loja".
 */
router.get("/lojas/:lojaId/reservas/:reservaId", async (req, res): Promise<void> => {
  const { lojaId, reservaId } = req.params as { lojaId: string; reservaId: string };
  const reserva = await db.query.reservasTable.findFirst({
    where: and(eq(reservasTable.id, reservaId), eq(reservasTable.lojaId, lojaId)),
    with: RESERVA_COM_TUDO,
  });
  if (!reserva) {
    res.status(404).json({ error: "RESERVA_NAO_ENCONTRADA", detalhe: "Esta reserva não existe nesta loja." });
    return;
  }
  res.json(GetReservaResponse.parse(reservaComDonos(reserva)));
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
    // S-O117: dia de negócio ancorado ao meio-dia SP — o dia UTC e o dia local
    // passam a ser o mesmo, e o recorte `futuras` desta mesma rota acerta.
    casamentoData: reancorarDataDeNegocio(parsed.data.casamentoData),
  }).returning();

  const fullReserva = await db.query.reservasTable.findFirst({
    where: eq(reservasTable.id, reserva.id),
    with: RESERVA_COM_TUDO,
  });
  res.status(201).json(CreateReservaResponse.parse(reservaComDonos(fullReserva!)));
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
  /**
   * S-O117 — a data do casamento é dia de NEGÓCIO, e é ancorada UMA vez, aqui.
   * Daqui ela desce para cinco escritas (a reserva, o candidato de janela, o
   * bloqueio, o contrato ATIVO e a conta das provas que ficam para trás), e
   * ancorar em cada uma delas seria a quinta grafia da mesma conta.
   */
  const dados = {
    ...parsed.data,
    ...(parsed.data.casamentoData
      ? { casamentoData: reancorarDataDeNegocio(parsed.data.casamentoData) }
      : {}),
  };

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
        /**
         * S-O5/R8 — **as provas que perdem o vestido aqui, contadas aqui.**
         *
         * Este soft-cancel devolve as peças ao acervo e não toca em
         * `atendimentos`: a prova segue AGENDADO apontando um bloqueio que a
         * disponibilidade e o EXCLUDE do banco já não enxergam. Medido em
         * 2026-08-12: a peça foi reservada por outra noiva (201) com a prova da
         * primeira ainda de pé.
         *
         * A ironia é a âncora: o `DELETE /bloqueios` (`:867`) **recusa com 409**
         * porque os atendimentos sumiriam junto (E115), e o comentário dele
         * manda usar o soft-cancel — a única saída sem guarda nenhuma.
         *
         * Decisão da dona em 2026-08-12: **a prova FICA** e a tela a marca como
         * órfã (`lib/prova-orfa.ts`), porque o sistema não sabe se a noiva
         * desistiu ou está trocando de vestido, e cancelar sozinho perderia o
         * horário dela. O que a trilha ganha é o NÚMERO: sem ele, "quantas
         * noivas ficaram com prova marcada para um vestido que não é mais
         * delas" não se responde depois do fato.
         */
        const provasQuePerderamOVestido = bloqueiosDaReserva.length > 0
          ? await tx.select({ id: atendimentosTable.id })
              .from(atendimentosTable)
              .where(and(
                inArray(atendimentosTable.bloqueioId, bloqueiosDaReserva.map((b) => b.id)),
                eq(atendimentosTable.tipo, "PROVA"),
                inArray(atendimentosTable.situacao, ["AGENDADO", "EM_ATENDIMENTO"]),
              ))
          : [];

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
            provasQuePerderamOVestido: provasQuePerderamOVestido.length,
            provasIds: provasQuePerderamOVestido.map((p) => p.id),
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

      /**
       * S-O4/R6 — **"todos os bloqueios vinculados" não era todo mundo: o
       * CONTRATO ficava para trás.**
       *
       * O comentário acima declara a doutrina — *"reserva é a fonte da verdade
       * da data operacional"* — e ela para no bloqueio. O contrato ATIVO
       * preso àquelas peças guarda a própria `dataCasamento`
       * (`schema/contratos.ts:42`), e é ELA que o PDF assinado
       * (`lib/contrato-pdf.ts`) e o portal da noiva (`portal.ts:259`) mostram.
       *
       * **Medido em 2026-08-12:** reserva movida para 2028-04-02, contrato
       * parado em 2028-03-13 — **20 dias**, em silêncio, com o papel da noiva
       * dizendo o dia errado.
       *
       * Uma correção ao diagnóstico da sobra, que dizia que as duas portas
       * mandavam a pessoa para a outra: **não mandam**. O `PATCH /contratos`
       * confere a data contra o BLOQUEIO (`contratos.ts:1017-1027`), e o
       * bloqueio já se moveu junto — medido, ele responde **200**. O beco não
       * existe; o que existe é a divergência calada, que é pior, porque
       * ninguém vai procurar.
       *
       * Só contrato **ATIVO**: cancelado é história, e reescrever a data de um
       * contrato encerrado falsificaria o que foi assinado.
       */
      const idsVinculados = vinculados.map((b) => b.id);
      const contratosAtualizados = idsVinculados.length > 0
        ? await tx.update(contratosTable)
            .set({ dataCasamento: dados.casamentoData, updatedAt: new Date() })
            .where(and(
              eq(contratosTable.status, "ATIVO"),
              eq(contratosTable.lojaId, lojaId),
              inArray(
                contratosTable.id,
                tx.select({ id: contratoBloqueiosTable.contratoId })
                  .from(contratoBloqueiosTable)
                  .where(inArray(contratoBloqueiosTable.bloqueioId, idsVinculados)),
              ),
            ))
            .returning({
              id: contratosTable.id,
              valorTotal: contratosTable.valorTotal,
              reajustesDeData: contratosTable.reajustesDeData,
            })
        : [];


      /**
       * S-O97 — **mover a data move a peça e o contrato, e a PROVA fica onde
       * estava.**
       *
       * A propagação acima alcança `bloqueio_vestidos` e `contratos`;
       * `atendimentos` só é tocado no ramo CANCELADA, e lá apenas para CONTAR
       * (S-O5). A prova marcada para a janela do casamento ANTIGO continua
       * marcada, e ninguém é avisado.
       *
       * **Movendo a data para trás fica pior: a prova cai depois do
       * casamento** — a noiva vem experimentar um vestido que ela já usou.
       *
       * Não há régua que recuse depois: o `POST /atendimentos` aceita prova em
       * qualquer dia de propósito (G1/E161), e recusar aqui seria pior — quem
       * move a data não é quem decide o horário da noiva. **É aviso, como o
       * selo da prova órfã**: a tela marca (`lib/prova-fora-da-janela.ts`) e a
       * trilha CONTA, que é o que responde "quantas provas ficaram para trás"
       * depois do fato.
       *
       * A janela sai de `janelaDeProvaPrevista` — a mesma função que
       * `janelasDoBloqueio` usa para decidir disponibilidade. Uma segunda cópia
       * da conta divergiria no dia em que a loja mexesse na regra.
       */
      const diaDeCasamentoNovo = diaLocal(dados.casamentoData);
      const mudouDeDia = diaLocal(reserva.casamentoData) !== diaDeCasamentoNovo;

      /**
       * **E211 — a data que muda tem PREÇO** (contrato, cláusula 17ª §§2º e 3º).
       *
       * > *"As trocas de datas para o ano seguinte sofrerão reajuste automático
       * > de 10% do valor total do contrato"* — e 20% na segunda troca, 30% na
       * > terceira.
       *
       * Era a única regra do contrato que fazia o ateliê **perder dinheiro** por
       * não estar no sistema: o gesto de mover a data existe desde o E193 e
       * deixa rastro (`RESERVA_DATA_MOVIDA`, abaixo), e ninguém contava nem
       * cobrava.
       *
       * Mora AQUI, junto da propagação, porque é o mesmo fato: quem move a data
       * da reserva move a do contrato, e é a do contrato que a cláusula
       * reajusta. Uma rota separada de "cobrar reajuste" deixaria os dois
       * gestos desalinhados no dia em que alguém movesse a data por outra porta.
       *
       * O reajuste vira **parcela**, não aumento de `valorTotal`: mesmo desenho
       * da avaria (`:1588`), para aparecer na cobrança e na comissão como
       * qualquer dinheiro — e para a base do próximo reajuste continuar sendo o
       * que foi ASSINADO, não o que já foi reajustado.
       */
      const reajustes: { contratoId: string; percentual: number; valor: number }[] = [];
      if (mudouDeDia && contratosAtualizados.length > 0) {
        for (const contrato of contratosAtualizados) {
          const reajuste = reajusteDaTrocaDeData({
            deDia: diaDeNegocio(reserva.casamentoData),
            paraDia: diaDeNegocio(dados.casamentoData),
            trocasCobradasAntes: contrato.reajustesDeData,
            valorTotal: contrato.valorTotal,
          });
          // `null` é a resposta certa da maioria das trocas — mesmo ano não
          // incide. A porta só cobra o que a cláusula manda cobrar.
          if (!reajuste) continue;

          const [{ maior }] = await tx
            .select({ maior: sql<number>`coalesce(max(${parcelasTable.numero}), 0)` })
            .from(parcelasTable)
            .where(eq(parcelasTable.contratoId, contrato.id));

          await tx.insert(parcelasTable).values({
            id: randomUUID(),
            lojaId,
            contratoId: contrato.id,
            numero: Number(maior) + 1,
            origem: "REAJUSTE_DATA",
            descricao:
              `Reajuste por troca de data (${reajuste.percentual}%) — ` +
              `casamento movido para ${diaDeNegocio(dados.casamentoData)}`,
            valorPrevisto: reajuste.valor,
            // Dia de negócio, e não `new Date()`: das 21h à meia-noite o
            // instante cru joga o vencimento para o dia seguinte (S-O117).
            vencimento: ancoraDeNegocio(hojeLocal()),
          });

          await tx.update(contratosTable)
            .set({ reajustesDeData: contrato.reajustesDeData + 1, updatedAt: new Date() })
            .where(eq(contratosTable.id, contrato.id));

          reajustes.push({
            contratoId: contrato.id,
            percentual: reajuste.percentual,
            valor: reajuste.valor,
          });
        }
      }
      let provasParaTras: { id: string }[] = [];
      if (mudouDeDia && idsVinculados.length > 0) {
        const regra = await buscarRegra(lojaId, tx);
        const janela = janelaDeProvaPrevista(diaDeCasamentoNovo, regra);
        const provasDePe = await tx.select({ id: atendimentosTable.id, inicio: atendimentosTable.inicio })
          .from(atendimentosTable)
          .where(and(
            inArray(atendimentosTable.bloqueioId, idsVinculados),
            eq(atendimentosTable.tipo, "PROVA"),
            inArray(atendimentosTable.situacao, ["AGENDADO", "EM_ATENDIMENTO"]),
          ));
        provasParaTras = provasDePe
          .filter((p) => {
            const dia = diaLocal(p.inicio);
            return janela === null || dia < janela.inicio || dia > janela.fim;
          })
          .map((p) => ({ id: p.id }));
      }

      if (mudouDeDia) {
        /**
         * A trilha da data em si — que não existia. Até aqui, mover o
         * casamento só deixava rastro quando um CONTRATO seguia junto
         * (`CONTRATO_DATA_SEGUIU_RESERVA`, abaixo): reserva sem contrato mudava
         * de dia sem uma linha dizendo quem mudou, de quando para quando.
         */
        await registrarAuditoria(tx, {
          lojaId,
          usuario: req.usuario!,
          acao: "RESERVA_DATA_MOVIDA",
          entidade: "reserva",
          entidadeId: reserva.id,
          detalhe: {
            de: reserva.casamentoData,
            para: dados.casamentoData,
            bloqueios: idsVinculados.length,
            provasForaDaJanela: provasParaTras.length,
            provasIds: provasParaTras.map((p) => p.id),
          },
        });
      }

      if (contratosAtualizados.length > 0) {
        /**
         * A trilha porque **o papel da noiva mudou**. Um contrato assinado que
         * passa a dizer outra data sem rastro é a classe que o E94 fechou para
         * o dinheiro: todo movimento deixa marca, e a data do casamento é o
         * dado que a noiva confere primeiro.
         */
        await registrarAuditoria(tx, {
          lojaId,
          usuario: req.usuario!,
          acao: "CONTRATO_DATA_SEGUIU_RESERVA",
          entidade: "reserva",
          entidadeId: reserva.id,
          detalhe: {
            de: reserva.casamentoData,
            para: dados.casamentoData,
            contratos: contratosAtualizados.map((c) => c.id),
          },
        });
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
    with: RESERVA_COM_TUDO,
  });
  res.json(UpdateReservaResponse.parse(reservaComDonos(fullReserva!)));
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
  const contarHistoria = async (executor: DbExecutor, ids: string[]) =>
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

    const agora = await contarHistoria(tx, idsAgora);
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
    // S-O17/E179: a reserva-mãe entra por UMA coluna, e é ela que faz o
    // `donoLeadId` que o schema declara deixar de vir `undefined` aqui.
    // S-O56/E185: o fragmento virou `MAE_DO_BLOQUEIO`, o mesmo que a agenda e a
    // fila da costureira usam agora — era a segunda grafia da mesma coluna.
    with: { vestido: true, lead: true, ...MAE_DO_BLOQUEIO },
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
  res.json(ListBloqueiosResponse.parse(bloqueios.map((b) => bloqueioComDono(b))));
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
  res.json(GetBloqueioResponse.parse({ ...bloqueio, donoLeadId: await donoDoBloqueio(bloqueio) }));
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
  // S-O17/E179: a quinta porta da família. Ela não é dispensável por o
  // chamador "já saber o dono" — quem cria o véu manda `reservaId` e NÃO manda
  // `leadId`, e é justamente esse caso que herda a dona da reserva-mãe.
  res.status(201).json(
    CreateBloqueioResponse.parse({
      ...criado.bloqueio,
      donoLeadId: await donoDoBloqueio(criado.bloqueio),
    }),
  );
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

  /**
   * S-O11 — **a reserva aberta na noiva ERRADA passa a ter conserto.**
   *
   * A adoção do E162 (A02.4) só alcança a reserva SEM dona: ela entra nas
   * candidatas do contrato e é adotada no fechamento. Quem escolheu a noiva
   * errada no combobox ficava com a peça presa no nome de outra, e o único
   * caminho era apagar — que o E115 recusa quando a reserva carrega prova,
   * avaria ou contrato. Era a metade do A02.4 que não entrou.
   *
   * Duas guardas, e as duas são sobre não desmentir papel já assinado:
   *
   * 1. **Contrato ATIVO preso** — ali o nome da noiva está no contrato e no
   *    PDF. Trocar a dona por baixo dele venderia a peça de uma para outra sem
   *    que o contrato soubesse. 409 legível, apontando o caminho (cancelar o
   *    contrato).
   * 2. **Reserva-mãe de outra noiva** — o bloqueio pendurado numa reserva-mãe
   *    herda o dono dela (`donoDoBloqueio`, E167/V14). Deixar as duas pontas
   *    discordarem criaria o estado que a S-O11 existe para desfazer.
   */
  if (dados.leadId !== undefined && dados.leadId !== existente.leadId) {
    if (dados.leadId !== null && !(await leadNaLoja(dados.leadId, lojaId))) {
      res.status(422).json({
        error: "REFERENCIA_INVALIDA",
        detalhe: "Esta noiva não é desta loja.",
        campos: [{ campo: "leadId", motivo: "A noiva não existe nesta loja" }],
      });
      return;
    }

    const presos = await db.select({ contratoId: contratoBloqueiosTable.contratoId })
      .from(contratoBloqueiosTable)
      .innerJoin(contratosTable, eq(contratosTable.id, contratoBloqueiosTable.contratoId))
      .where(and(
        eq(contratoBloqueiosTable.bloqueioId, bloqueioId),
        eq(contratosTable.status, "ATIVO"),
      ));
    const legado = await db.select({ id: contratosTable.id }).from(contratosTable)
      .where(and(
        eq(contratosTable.bloqueioVestidoId, bloqueioId),
        eq(contratosTable.status, "ATIVO"),
      ));
    if (presos.length + legado.length > 0) {
      res.status(409).json({
        error: "RESERVA_COM_CONTRATO",
        detalhe:
          `${presos.length + legado.length} contrato(s) ativo(s) preso(s) a esta reserva — ` +
          "o nome da noiva já está no contrato assinado. Cancele o contrato antes de trocar a noiva.",
        contratosAtivos: presos.length + legado.length,
      });
      return;
    }

    if (existente.reservaId) {
      const [mae] = await db.select({ leadId: reservasTable.leadId }).from(reservasTable)
        .where(and(eq(reservasTable.id, existente.reservaId), eq(reservasTable.lojaId, lojaId)));
      if (mae && mae.leadId !== dados.leadId) {
        res.status(422).json({
          error: "RESERVA_MAE_DE_OUTRA_NOIVA",
          detalhe:
            "Este vestido está pendurado na reserva de outra noiva. Troque a noiva na reserva inteira, " +
            "ou solte o vestido dela antes.",
          campos: [{ campo: "leadId", motivo: "A reserva-mãe é de outra noiva" }],
        });
        return;
      }
    }
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
        // S-O11: `undefined` continua sendo "não mexa" — a troca de dona só
        // acontece quando o corpo traz `leadId`, e `null` a devolve a SEM DONA,
        // que é o estado que a adoção do E162 já sabe resolver.
        leadId: dados.leadId,
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

    /**
     * S-O11 — trocar a dona de uma reserva é mexer em de quem é a peça, e a
     * pergunta "por que esta reserva mudou de noiva?" só tem uma resposta
     * possível depois do fato: esta linha. O detalhe guarda as DUAS pontas,
     * porque `de` não existe em lugar nenhum depois da escrita.
     */
    if (dados.leadId !== undefined && dados.leadId !== existente.leadId) {
      await registrarAuditoria(tx, {
        lojaId,
        usuario: req.usuario!,
        acao: "RESERVA_DONA_TROCADA",
        entidade: "bloqueio",
        entidadeId: bloqueioId,
        detalhe: {
          de: existente.leadId,
          para: dados.leadId,
          vestidoId: existente.vestidoId,
        },
      });
    }
    return { bloqueio: bloqueio! };
  });
  if ("conflitos" in atualizado) {
    res.status(409).json({ error: "VESTIDO_INDISPONIVEL", conflitos: atualizado.conflitos });
    return;
  }
  // V14/E167: o PATCH devolve o MESMO payload do GET. A ficha invalida e relê
  // depois de cada movimentação, mas um campo que só uma das duas portas
  // preenche é armadilha para quem ler o schema depois.
  res.json(
    UpdateBloqueioResponse.parse({
      ...atualizado.bloqueio,
      donoLeadId: await donoDoBloqueio(atualizado.bloqueio),
    }),
  );
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

// S-O19: o teto vem de `lib/limites.ts` (importado no topo, como
// `AVARIA_FOTO_MAX_BYTES`) — a foto de avaria e a de vestido sempre foram a
// mesma régua, escrita duas vezes.

/**
 * Meta da avaria para o contrato — nunca os bytes na listagem.
 *
 * V2/E167: o `parcelaStatus` entra junto. `parcelaId` preenchido NÃO é o mesmo
 * que cobrança viva — é a distinção inteira que o `cobrancaViva` abaixo
 * documenta —, e sem o status a tela não tinha como fazer a mesma conta que o
 * servidor faz. Ela decidia por `parcelaId` e o servidor por `cobrancaViva`:
 * cancelado o contrato de R$ 5.000,00, a parcela do reparo de **R$ 800,00**
 * vira CANCELADA, o servidor volta a aceitar cobrar e remover, e a tela
 * mostrava "Cobrado — ver parcela" para sempre, com os dois botões escondidos.
 * Os R$ 800,00 não entram no carnê novo e a avaria fica impossível de limpar.
 *
 * **S-C47: o `aluguelDaPeca` entra pelo mesmo motivo, uma camada acima.** O
 * `parcelaStatus` existe porque a tela decidia "cobrada" por uma régua e o
 * servidor por outra; o `aluguelDaPeca` existe porque ela decidia o TETO da 15ª
 * por uma régua (o contrato ATIVO da noiva) e o servidor por outra (o contrato
 * que COBRA). Os dois parâmetros são obrigatórios de propósito — quem serializa
 * uma avaria tem de dizer de qual contrato aquele teto saiu, e um default aqui
 * transformaria "não perguntei" em "não tem teto".
 */
function avariaMeta(
  a: typeof avariasTable.$inferSelect,
  parcelaStatus: string | null,
  aluguelDaPeca: number | null,
) {
  const { fotoBytes, fotoMime, ...meta } = a;
  return { ...meta, temFoto: fotoBytes !== null, parcelaStatus, aluguelDaPeca };
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
async function cobrancaViva(parcelaId: string, executor: DbExecutor = db): Promise<boolean> {
  const status = await statusDaCobranca(parcelaId, executor);
  return status !== null && status !== "CANCELADA";
}

/**
 * V2/E167 — o mesmo estado que `cobrancaViva` lê, em vez de o booleano.
 *
 * A tela precisa dizer POR QUE o botão mudou ("Cobrado" × "recobrar"), e a
 * régua de vivacidade tem de ser a MESMA das duas pontas: quem responde o
 * payload e quem responde o 409. Nulo = parcela apagada (o `set null` da FK
 * já zerou o `parcela_id`) ou sem cobrança nenhuma.
 */
async function statusDaCobranca(
  parcelaId: string | null,
  executor: DbExecutor = db,
): Promise<string | null> {
  if (!parcelaId) return null;
  const [parcela] = await executor
    .select({ status: parcelasTable.status })
    .from(parcelasTable)
    .where(eq(parcelasTable.id, parcelaId));
  return parcela?.status ?? null;
}

/**
 * **E214 — quanto vale o aluguel DESTA peça neste contrato** (cláusula 15ª).
 *
 * > *"…não excedendo cinco vezes o valor do aluguel de cada peça danificada."*
 *
 * O sistema tem esse valor desde sempre e não o usava: `contrato_itens` é o
 * snapshot do que foi vendido, e `valor_unitario` é o que a noiva pagou para
 * usar a peça. Sem ele, o teto da 15ª não é calculável por máquina nenhuma — e
 * era essa a colisão que a auditoria registrou.
 *
 * `null` significa **a peça não está entre os itens deste contrato**: ou é o
 * véu que entrou depois, ou a avaria é de um bloqueio que nenhum contrato
 * comprou. Sem aluguel não há cinco aluguéis, e o que a régua faz nesse caso
 * está declarado em `financeiro-core/avaria.ts` — exige a razão escrita.
 *
 * Duas linhas para a MESMA peça devolvem a maior: o snapshot nasce do orçamento,
 * onde cada peça é uma linha (a identidade das peças é conferida no fechamento,
 * `contratos.ts`), então o caso não é uma forma que o sistema produz. Escolher a
 * maior é a leitura que não estreita um teto por um dado duplicado.
 */
async function aluguelDaPecaNoContrato(
  params: { contratoId: string; vestidoId: string | null },
  executor: DbExecutor = db,
): Promise<number | null> {
  if (!params.vestidoId) return null;
  const [item] = await executor
    .select({ valorUnitario: contratoItensTable.valorUnitario })
    .from(contratoItensTable)
    .where(and(
      eq(contratoItensTable.contratoId, params.contratoId),
      eq(contratoItensTable.vestidoId, params.vestidoId),
    ))
    .orderBy(desc(contratoItensTable.valorUnitario))
    .limit(1);
  return item?.valorUnitario ?? null;
}

/**
 * O mesmo aluguel, para quem ainda não escolheu contrato — o REGISTRO da avaria.
 *
 * A avaria nasce presa ao bloqueio, não ao contrato: quem devolve o vestido
 * rasgado registra ali, e só depois alguém decide em qual carnê cobrar. Então o
 * contrato é DERIVADO — o ATIVO da dona do bloqueio, pela mesma régua que a
 * cobrança usa para saber de quem é o reparo (`donoDoBloqueio`, V3/E163).
 *
 * `contratos_lead_ativo_unico` (E158) garante que há no máximo um ativo por
 * noiva, então não há empate a desfazer.
 */
async function aluguelDaPecaDoBloqueio(
  bloqueio: { vestidoId: string | null; leadId: string | null; reservaId: string | null },
  lojaId: string,
  // S-C11: o `executor` existe porque a EDIÇÃO chama esta conta de dentro da
  // transação que já segura a avaria e a parcela. Pedir uma segunda conexão do
  // pool com locks na mão é como se esgota um pool — e o `donoDoBloqueio` e o
  // `aluguelDaPecaNoContrato` já aceitavam o `tx` desde que nasceram.
  executor: DbExecutor = db,
): Promise<number | null> {
  if (!bloqueio.vestidoId) return null;
  const dono = await donoDoBloqueio(bloqueio, executor);
  if (!dono) return null;
  const [contrato] = await executor
    .select({ id: contratosTable.id })
    .from(contratosTable)
    .where(and(
      eq(contratosTable.lojaId, lojaId),
      eq(contratosTable.leadId, dono),
      eq(contratosTable.status, "ATIVO"),
    ));
  if (!contrato) return null;
  return aluguelDaPecaNoContrato({ contratoId: contrato.id, vestidoId: bloqueio.vestidoId }, executor);
}

/**
 * **S-C47 — de qual contrato sai o teto DESTA avaria. A pergunta é uma só.**
 *
 * As duas contas acima respondem à mesma pergunta por caminhos diferentes, e
 * quem escolhe entre elas é o estado da cobrança:
 *
 * - **há cobrança viva** → o teto sai do contrato que COBRA o reparo. É ali que
 *   o dinheiro está, e é a decisão que o E214 tomou no `POST /cobrar` e o S-C11
 *   herdou para o `PATCH`;
 * - **não há** → o contrato é DERIVADO, o ATIVO da dona do bloqueio, porque a
 *   avaria nasce presa ao bloqueio e ninguém escolheu carnê ainda.
 *
 * A escolha morava escrita à mão dentro do `PATCH`, e a TELA a refazia por um
 * terceiro caminho (`faixa-da-avaria.ts`: o contrato ATIVO da noiva, sempre).
 * Hoje ela mora aqui, e o payload da avaria carrega o resultado — a tela LÊ o
 * teto que a porta usou em vez de recalculá-lo. É a lição do E187 (cinco
 * grafias da mesma conta, duas errando) aplicada antes de a segunda errar.
 *
 * **O que a segunda grafia escondia, medido:** os dois caminhos coincidem
 * enquanto três invariantes se sustentam — `contratos_lead_ativo_unico` (E158,
 * no máximo um ATIVO por noiva), o cancelamento cancelando as parcelas em
 * ABERTO (E49/E94, então cobrança viva implica contrato ATIVO) e a guarda
 * `AVARIA_DE_OUTRA_NOIVA` (E110/V3). O terceiro só vale **quando o bloqueio tem
 * dona**, e bloqueio sem dona é 102 de 227 no `heliumdb`: por ali um reparo é
 * cobrado no contrato de qualquer noiva da loja, e a tela — que sem dona não
 * tem contrato para perguntar — anunciava "esta peça não está em contrato
 * nenhum" sobre um véu com teto de R$ 2.000,00.
 */
async function aluguelQueRegeAAvaria(
  params: {
    bloqueio: { vestidoId: string | null; leadId: string | null; reservaId: string | null } | undefined;
    /** O contrato da parcela VIVA do reparo, ou `null` quando não há cobrança de pé. */
    contratoQueCobra: string | null;
  },
  lojaId: string,
  executor: DbExecutor = db,
): Promise<number | null> {
  if (!params.bloqueio) return null;
  if (params.contratoQueCobra) {
    return aluguelDaPecaNoContrato(
      { contratoId: params.contratoQueCobra, vestidoId: params.bloqueio.vestidoId },
      executor,
    );
  }
  return aluguelDaPecaDoBloqueio(params.bloqueio, lojaId, executor);
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
  // V2/E167: o status da parcela vem no MESMO SELECT — a tela decide "cobrado"
  // pela mesma régua do servidor, e não por `parcelaId` não-nulo.
  // S-C47: o `contratoId` da parcela entra no MESMO SELECT — é ele que decide
  // de qual contrato sai o teto da 15ª de cada avaria, e é por avaria, não por
  // bloqueio: duas avarias do mesmo vestido podem ter ido para carnês
  // diferentes (a primeira cobrada, a segunda ainda não).
  const avarias = await db
    .select({
      avaria: avariasTable,
      parcelaStatus: parcelasTable.status,
      parcelaContratoId: parcelasTable.contratoId,
    })
    .from(avariasTable)
    .leftJoin(parcelasTable, eq(parcelasTable.id, avariasTable.parcelaId))
    .where(and(eq(avariasTable.lojaId, lojaId as string), eq(avariasTable.bloqueioId, bloqueioId as string)))
    .orderBy(avariasTable.criadaEm);
  const [bloqueioDaLista] = avarias.length
    ? await db
        .select({
          vestidoId: bloqueioVestidosTable.vestidoId,
          leadId: bloqueioVestidosTable.leadId,
          reservaId: bloqueioVestidosTable.reservaId,
        })
        .from(bloqueioVestidosTable)
        .where(eq(bloqueioVestidosTable.id, bloqueioId as string))
    : [undefined];
  const linhas = await Promise.all(
    avarias.map(async (l) =>
      avariaMeta(
        l.avaria,
        l.parcelaStatus,
        await aluguelQueRegeAAvaria(
          {
            bloqueio: bloqueioDaLista,
            // V2/E167 de novo: cobrança viva é status ≠ CANCELADA, nunca
            // `parcelaId` preenchido. Cancelado o contrato, o teto volta a sair
            // do ATIVO da dona — que é onde o reparo será recobrado.
            contratoQueCobra:
              l.parcelaStatus !== null && l.parcelaStatus !== "CANCELADA" ? l.parcelaContratoId : null,
          },
          lojaId as string,
        ),
      ),
    ),
  );
  res.json(ListAvariasResponse.parse(linhas));
});

router.post("/lojas/:lojaId/bloqueios/:bloqueioId/avarias", async (req, res): Promise<void> => {
  const { lojaId, bloqueioId } = req.params;
  const parsed = CreateAvariaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const [bloqueio] = await db
    .select({
      id: bloqueioVestidosTable.id,
      // E214: a peça e a dona, para achar o aluguel que dá o teto da 15ª.
      vestidoId: bloqueioVestidosTable.vestidoId,
      leadId: bloqueioVestidosTable.leadId,
      reservaId: bloqueioVestidosTable.reservaId,
    })
    .from(bloqueioVestidosTable)
    .where(and(eq(bloqueioVestidosTable.id, bloqueioId as string), eq(bloqueioVestidosTable.lojaId, lojaId as string)));
  if (!bloqueio) {
    res.status(404).json({ error: "RESERVA_NAO_ENCONTRADA", detalhe: "Esta reserva de vestido não existe nesta loja." });
    return;
  }

  /**
   * **E214 — a taxa ganha faixa** (contrato, cláusulas 14ª e 15ª).
   *
   * `custo_reparo` era campo LIVRE: R$ 50,00 e R$ 9.000,00 entravam iguais, e o
   * número não dizia de qual cláusula tinha saído. Agora o `tipo` diz, e cada
   * cláusula tem a sua régua — a da limpeza é absoluta (350 a 2.500), a do dano
   * é 5× o aluguel DAQUELA peça, que `contrato_itens.valor_unitario` guarda
   * desde sempre e ninguém lia.
   *
   * A conta mora no `financeiro-core` e a TELA usa a mesma: duas grafias da
   * mesma faixa divergiriam no dia em que a dona mudasse o número, e a
   * vendedora leria na tela um limite que esta porta não pratica.
   *
   * **A régua não vira parede.** O que VIOLA um número do papel entra — com a
   * razão por escrito, que é gravada na avaria e vai para a trilha. Quem decide
   * continua sendo a dona; o que mudou é que a decisão deixa rastro. E onde o
   * papel é silente (dano em peça sem contrato, logo sem aluguel), a régua diz
   * que não conferiu em vez de inventar um número — ver `avaliarTaxaDeAvaria`.
   */
  const tipoDaAvaria = (parsed.data.tipo ?? "DANO") as TipoDeAvaria;
  // S-C47: o mesmo número que decide aqui viaja no payload — a avaria nasce
  // sem cobrança, então quem rege é o contrato ATIVO da dona do bloqueio.
  const aluguelNoRegistro = await aluguelQueRegeAAvaria(
    { bloqueio, contratoQueCobra: null },
    lojaId as string,
  );
  const veredicto = avaliarTaxaDeAvaria({
    tipo: tipoDaAvaria,
    valor: parsed.data.custoReparo,
    aluguelDaPeca: aluguelNoRegistro,
  });
  const justificativa = parsed.data.justificativaDaTaxa?.trim() || null;
  if (veredicto.exigeJustificativa && !justificativa) {
    res.status(422).json({
      error: "TAXA_FORA_DA_FAIXA",
      detalhe: `${explicacaoDaFaixa(veredicto)} Para cobrar fora dela, escreva a razão.`,
      campos: [{ campo: "justificativaDaTaxa", motivo: "Diga por que a taxa sai da faixa do contrato" }],
    });
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

  /**
   * A linha e a TRILHA na mesma transação (E10): a razão de uma taxa fora da
   * faixa não pode sobreviver sem a avaria, nem a avaria sem a razão. Sem custo
   * fora da faixa não há trilha — o registro comum continua sendo um `INSERT`.
   */
  const avaria = await db.transaction(async (tx) => {
    const [linha] = await tx
      .insert(avariasTable)
      .values({
        id: randomUUID(),
        lojaId: lojaId as string,
        bloqueioId: bloqueioId as string,
        descricao: parsed.data.descricao,
        tipo: tipoDaAvaria,
        custoReparo: parsed.data.custoReparo ?? null,
        // Só guarda a razão quando ela explica alguma coisa: justificativa
        // colada numa taxa que cabe na faixa viraria selo permanente na tela.
        justificativaDaTaxa: veredicto.exigeJustificativa ? justificativa : null,
        fotoBytes,
        fotoMime,
        // Autor da SESSÃO, desnormalizado como no audit_log: a linha sobrevive
        // à saída de quem registrou.
        registradoPorNome: req.usuario?.nome ?? null,
      })
      .returning();
    // A trilha cobre os DOIS casos notáveis: a violação com a razão escrita, e
    // a conta que não pôde ser conferida. O segundo é o que impede a decisão
    // "não barra" de virar silêncio.
    if (veredicto.mereceTrilha) {
      await registrarAuditoria(tx, {
        lojaId: lojaId as string,
        usuario: req.usuario!,
        acao: "AVARIA_FORA_DA_FAIXA",
        entidade: "avaria",
        entidadeId: linha!.id,
        detalhe: {
          tipo: veredicto.tipo,
          clausula: veredicto.clausula,
          valor: veredicto.valor,
          piso: veredicto.piso,
          teto: veredicto.teto,
          conferida: veredicto.conferida,
          motivo: veredicto.motivo,
          justificativa,
        },
      });
    }
    return linha!;
  });
  res.status(201).json(CreateAvariaResponse.parse(avariaMeta(avaria, null, aluguelNoRegistro)));
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
   * **A guarda prova quando é possível, e o limite está medido.** O `lead_id`
   * do bloqueio é NULLABLE: sem dona não há o que comparar, e a rota segue como
   * antes; com dona, ela tem de ser a mesma.
   *
   * **S-C10 (13/08/2026) — a régua era "quando é PROVÁVEL", e o provável virou
   * o contrário.** Este comentário afirmava que 61 das 63 avarias do dev viviam
   * em bloqueio sem noiva (97%). Remedido: **ZERO avarias** em `heliumdb` e em
   * `moscow_base`, e o bloqueio sem dona é **0 de 116 na loja, 2 de 127 no
   * dev** (os 2 sem reserva-mãe, resíduo de fixture de 12/08). A guarda continua
   * de pé pela POSSIBILIDADE — `POST /lojas/:lojaId/bloqueios` ainda aceita
   * `RESERVA_CASAMENTO` sem `leadId` e sem `reservaId`, logo abaixo nesta mesma
   * rota. Exigir dona na porta virou barato e é a **S-C60**. A conta inteira
   * está em `lib/dono-do-bloqueio.ts`.
   */
  const [bloqueioDaAvaria] = await db
    .select({
      leadId: bloqueioVestidosTable.leadId,
      reservaId: bloqueioVestidosTable.reservaId,
      // E214: a peça, para o teto da 15ª sair do aluguel DESTE contrato.
      vestidoId: bloqueioVestidosTable.vestidoId,
    })
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
   *
   * V14 (E167): a derivação virou `donoDoBloqueio`, e a FICHA passou a ler o
   * mesmo campo pelo payload do bloqueio. Enquanto ela morava só aqui, a tela
   * não desenhava o botão nos 61 bloqueios sem noiva — a régua existia e não
   * chegava a quem clica.
   */
  const donoDaAvaria = bloqueioDaAvaria
    ? await donoDoBloqueio(bloqueioDaAvaria)
    : null;
  if (donoDaAvaria && donoDaAvaria !== contrato.leadId) {
    res.status(422).json({
      error: "AVARIA_DE_OUTRA_NOIVA",
      detalhe: "Este reparo é do vestido de outra noiva — cobre no contrato dela",
      campos: [{ campo: "contratoId", motivo: "O contrato é de outra noiva" }],
    });
    return;
  }

  /**
   * **E214 — o teto da 15ª é conferido AQUI também, e é aqui que ele é certo.**
   *
   * A cláusula fala do *"valor do aluguel de cada peça danificada"*, e aluguel
   * só existe dentro de um contrato. No registro, o contrato é DERIVADO (o ativo
   * da dona) e pode não existir ainda; aqui ele é ESCOLHIDO, e o teto sai do
   * item daquele contrato. É o momento em que nasce dinheiro — e a régua tem de
   * estar no nascimento do dinheiro, não só no do registro.
   *
   * **A justificativa pode vir no corpo, e isso evita um beco.** A avaria que
   * nasceu dentro de um teto e vai ser cobrada em OUTRO contrato, com peça mais
   * barata, estouraria — e a única saída seria APAGAR a avaria, cuja foto é a
   * prova que sustenta a cobrança (E97/F23). É o mesmo ciclo sem saída que o
   * E167 fechou do outro lado; aqui ele não chega a existir.
   *
   * E quando a peça não é item DESTE contrato, a 15ª não alcança o caso: a
   * cobrança segue, e a trilha diz que **nasceu dinheiro contra um teto que
   * ninguém pôde conferir**. É a metade da decisão que a impede de ser silêncio.
   */
  // S-C47: cobrada, a avaria passa a responder a ESTE contrato — e é este o
  // número que o payload devolve, para a tela não voltar a perguntar o teto ao
  // contrato ATIVO da noiva depois do clique.
  const aluguelNaCobranca = await aluguelQueRegeAAvaria(
    { bloqueio: bloqueioDaAvaria, contratoQueCobra: parsed.data.contratoId },
    lojaId as string,
  );
  const veredictoDaCobranca = avaliarTaxaDeAvaria({
    tipo: avaria.tipo,
    valor: avaria.custoReparo,
    aluguelDaPeca: aluguelNaCobranca,
  });
  const justificativaDaCobranca =
    parsed.data.justificativaDaTaxa?.trim() || avaria.justificativaDaTaxa?.trim() || null;
  if (veredictoDaCobranca.exigeJustificativa && !justificativaDaCobranca) {
    res.status(422).json({
      error: "TAXA_FORA_DA_FAIXA",
      detalhe: `${explicacaoDaFaixa(veredictoDaCobranca)} Para cobrar fora dela, escreva a razão.`,
      campos: [{ campo: "justificativaDaTaxa", motivo: "Diga por que a taxa sai da faixa do contrato" }],
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
      .set({
        parcelaId,
        // E214: a razão que a cobrança trouxe fica GRAVADA na avaria. Se ficasse
        // só na trilha, a próxima leitura da ficha veria um valor fora do teto
        // sem explicação ao lado — e a tela decide o selo por este campo.
        ...(veredictoDaCobranca.exigeJustificativa
          ? { justificativaDaTaxa: justificativaDaCobranca }
          : {}),
      })
      .where(and(
        eq(avariasTable.id, avaria.id),
        avaria.parcelaId
          ? eq(avariasTable.parcelaId, avaria.parcelaId)
          : isNull(avariasTable.parcelaId),
      ))
      .returning();
    if (!marcada) throw new AvariaJaCobrada();
    if (veredictoDaCobranca.mereceTrilha) {
      await registrarAuditoria(tx, {
        lojaId: lojaId as string,
        usuario: req.usuario!,
        acao: "AVARIA_FORA_DA_FAIXA",
        entidade: "avaria",
        entidadeId: avaria.id,
        detalhe: {
          momento: "COBRANCA",
          contratoId: parsed.data.contratoId,
          tipo: veredictoDaCobranca.tipo,
          clausula: veredictoDaCobranca.clausula,
          valor: veredictoDaCobranca.valor,
          teto: veredictoDaCobranca.teto,
          conferida: veredictoDaCobranca.conferida,
          motivo: veredictoDaCobranca.motivo,
          justificativa: justificativaDaCobranca,
        },
      });
    }
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
  // V2/E167: o status sai LIDO da parcela recém-criada, não presumido — é a
  // mesma resposta que a listagem dará no próximo GET.
  res.status(201).json(
    CobrarAvariaResponse.parse(
      avariaMeta(depois!, await statusDaCobranca(depois!.parcelaId), aluguelNaCobranca),
    ),
  );
});

/**
 * **E212 — as peças deste contrato que não voltaram na data** (cláusula 16ª).
 *
 * O atraso já era VISÍVEL e nunca foi CONTÁVEL: `janelasDoBloqueio` pinta a
 * janela física como `ATRASO_DEVOLUCAO` quando há retirada sem devolução depois
 * do fim do uso previsto, e essa é a única leitura do fato em todo o sistema.
 * Aqui ele vira número.
 *
 * A régua do fim do uso é a MESMA de `disponibilidade.ts` — `casamento +
 * usoDiasDepois`, em dia de NEGÓCIO (S-O117) —, e tem de continuar sendo: se as
 * duas divergirem, a tela mostra a peça em dia e a porta cobra o atraso dela.
 *
 * **A peça que nunca saiu não atrasa.** Sem `retiradaDataReal` não houve
 * locação daquela peça, e a 16ª fala de *"não devolução"* — o que nunca foi
 * retirado não tem o que devolver.
 *
 * `semAluguel` são as peças atrasadas que não estão no rol de itens do
 * contrato. A 16ª cobra sobre *"o valor do aluguel de cada peça"*: sem aluguel
 * não há diária nem múltiplo, e a régua diz que não conferiu em vez de inventar
 * um número — a mesma escolha que o E214 fez para o dano em peça fora de
 * contrato.
 */
async function pecasAtrasadasDoContrato(
  contratoId: string,
  lojaId: string,
  executor: DbExecutor = db,
): Promise<{ pecas: PecaAtrasada[]; semAluguel: string[] }> {
  const regra = await buscarRegra(lojaId, executor);
  // A janela de uso INTEIRA é o divisor da diária: os dias antes, o dia do
  // casamento e os dias depois. No padrão da loja são 3 + 1 + 2 = 6.
  const diasDeAluguel = regra.usoDiasAntes + regra.usoDiasDepois + 1;
  const hoje = hojeLocal();

  const bloqueios = await executor
    .select({
      id: bloqueioVestidosTable.id,
      vestidoId: bloqueioVestidosTable.vestidoId,
      casamentoData: bloqueioVestidosTable.casamentoData,
      retiradaDataReal: bloqueioVestidosTable.retiradaDataReal,
      devolucaoDataReal: bloqueioVestidosTable.devolucaoDataReal,
      nome: vestidosTable.nome,
    })
    .from(contratoBloqueiosTable)
    .innerJoin(bloqueioVestidosTable, eq(bloqueioVestidosTable.id, contratoBloqueiosTable.bloqueioId))
    .innerJoin(vestidosTable, eq(vestidosTable.id, bloqueioVestidosTable.vestidoId))
    .where(and(
      eq(contratoBloqueiosTable.contratoId, contratoId),
      eq(bloqueioVestidosTable.lojaId, lojaId),
    ));

  const pecas: PecaAtrasada[] = [];
  const semAluguel: string[] = [];
  for (const b of bloqueios) {
    if (!b.casamentoData || !b.retiradaDataReal) continue;
    const fimUsoPrevisto = addDias(diaDeNegocio(b.casamentoData), regra.usoDiasDepois);
    // Devolvida: conta até o dia da volta. Ainda fora: conta até HOJE, e o
    // número cresce sozinho — que é o comportamento certo para o extravio, o
    // caso em que a peça nunca volta e nenhum evento nasce para disparar a
    // conta.
    const diaDaVolta = b.devolucaoDataReal ? diaLocal(b.devolucaoDataReal) : hoje;
    const dias = diasDeAtraso(fimUsoPrevisto, diaDaVolta);
    if (dias <= 0) continue;

    const aluguel = await aluguelDaPecaNoContrato({ contratoId, vestidoId: b.vestidoId }, executor);
    if (aluguel === null) {
      semAluguel.push(b.nome);
      continue;
    }
    pecas.push({ descricao: b.nome, aluguel, diasDeAluguel, dias });
  }
  return { pecas, semAluguel };
}

/** O envelope que as duas portas devolvem — a mesma conta, cobrada ou não. */
function envelopeDoAtraso(
  cobranca: ReturnType<typeof cobrancaDoAtraso>,
  semAluguel: string[],
  vinculo: { jaCobrada: boolean; parcelaId: string | null },
) {
  return {
    devida: cobranca !== null,
    linhas: cobranca?.linhas ?? [],
    multa: cobranca?.multa ?? 0,
    valor: cobranca?.valor ?? 0,
    temExtravio: cobranca?.temExtravio ?? false,
    maiorAtraso: cobranca?.maiorAtraso ?? 0,
    explicacao: cobranca ? explicacaoDoAtraso(cobranca) : null,
    semAluguel,
    jaCobrada: vinculo.jaCobrada,
    parcelaId: vinculo.parcelaId,
  };
}

/**
 * **A conta antes do clique** — mesma razão do aviso do reajuste (E211).
 *
 * Quem recebe a peça de volta precisa saber que ela custa R$ 1.750,00 de atraso
 * ANTES de dizer à noiva que está tudo certo. Descobrir a cobrança depois é o
 * defeito que o E211 fechou do lado da troca de data, e ele entra igual por
 * aqui.
 *
 * **O módulo é `contratos`, e a régua me fez voltar atrás.** A irmã desta rota
 * — a cobrança do reparo (`/avarias/:id/cobrar`, E97/F22) — também cria parcela
 * no carnê e pede `vestidos.editar`, e o primeiro instinto foi copiá-la: as
 * duas nascem no balcão que recebe a peça de volta. A
 * `s36-gate-da-tela-unit` acusou o desencontro
 * (*"[bloqueioId].tsx — gateia por [vestidos,agenda] e escreve em
 * [contratos]"*) e o comentário dela decide a direção: *"o conserto é quase
 * sempre na TELA — o servidor é a autoridade —, e mudar o servidor para caber
 * na tela é a saída errada: ela afrouxa a permissão para calar um teste."*
 *
 * A diferença com a avaria não é de gesto, é de VALOR: o reparo é uma taxa que
 * a peça danificada explica, e o extravio da 16ª é **4× o aluguel** — R$
 * 12.000,00 num vestido de R$ 3.000,00 — decidido sobre o contrato, sem peça
 * nenhuma para mostrar. Quem lança isso no carnê da noiva decide dinheiro de
 * contrato, e é `contratos.editar` que diz quem pode. A TELA passou a gatear
 * pelo mesmo módulo.
 */
router.get(
  "/lojas/:lojaId/contratos/:contratoId/cobranca-de-atraso",
  requireModulo("contratos"),
  async (req, res): Promise<void> => {
    const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
    const [contrato] = await db
      .select({ id: contratosTable.id, atrasoParcelaId: contratosTable.atrasoParcelaId })
      .from(contratosTable)
      .where(and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)));
    if (!contrato) {
      res.status(404).json({ error: "CONTRATO_NAO_ENCONTRADO", detalhe: "Este contrato não existe nesta loja." });
      return;
    }
    const { pecas, semAluguel } = await pecasAtrasadasDoContrato(contratoId, lojaId);
    // V2/E167 aplicado a este vínculo: `atraso_parcela_id` preenchido NÃO é o
    // mesmo que cobrança viva. Cancelado o contrato, a parcela do atraso morre
    // junto, e a tela mostraria "Cobrado" para sempre sobre um carnê que não
    // cobra mais nada.
    const viva = contrato.atrasoParcelaId ? await cobrancaViva(contrato.atrasoParcelaId) : false;
    res.json(
      PreviaDaCobrancaDeAtrasoResponse.parse(
        envelopeDoAtraso(cobrancaDoAtraso(pecas), semAluguel, {
          jaCobrada: viva,
          parcelaId: viva ? contrato.atrasoParcelaId : null,
        }),
      ),
    );
  },
);

/** O atraso já virou parcela — o 409 que impede o segundo clique de cobrar de novo. */
class AtrasoJaCobrado extends Error {}

/**
 * **E212 — o atraso vira parcela, uma vez só** (cláusula 16ª e seus dois §§).
 *
 * Mesmo desenho do E97/F22 para a avaria, e pela mesma razão medida: a parcela
 * e o vínculo nascem na MESMA transação, e o `UPDATE` do vínculo é condicional
 * ao estado que a rota LEU. Quem perde a corrida não grava nada — a exceção
 * derruba a transação inteira e a parcela que ela acabou de inserir some junto,
 * que é exatamente a segunda cobrança que esta guarda existe para impedir.
 *
 * **Uma parcela para todas as peças, e não uma por peça.** É o §2º quem manda:
 * ele reparte os valores entre os trajes e acessórios que não voltaram, e a
 * multa do §1º é do EVENTO — a devolução que passou da data —, não de cada
 * vestido. Três peças atrasadas pagam três diárias e uma multa de R$ 250,00.
 */
router.post(
  "/lojas/:lojaId/contratos/:contratoId/cobranca-de-atraso",
  requireModulo("contratos", "editar"),
  async (req, res): Promise<void> => {
    const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
    const parsed = CobrarAtrasoDaDevolucaoBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json(erroDeValidacao(parsed.error));
      return;
    }

    const [contrato] = await db
      .select({
        id: contratosTable.id,
        status: contratosTable.status,
        atrasoParcelaId: contratosTable.atrasoParcelaId,
      })
      .from(contratosTable)
      .where(and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)));
    if (!contrato) {
      res.status(404).json({ error: "CONTRATO_NAO_ENCONTRADO", detalhe: "Este contrato não existe nesta loja." });
      return;
    }
    if (contrato.status !== "ATIVO") {
      res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
      return;
    }
    if (contrato.atrasoParcelaId && (await cobrancaViva(contrato.atrasoParcelaId))) {
      res.status(409).json({
        error: "ATRASO_JA_COBRADO",
        detalhe: "O atraso deste contrato já virou parcela",
        campos: [{ campo: "contratoId", motivo: "Já existe uma cobrança para este atraso" }],
      });
      return;
    }

    const { pecas, semAluguel } = await pecasAtrasadasDoContrato(contratoId, lojaId);
    const cobranca = cobrancaDoAtraso(pecas);
    if (!cobranca) {
      // Peça atrasada que não está no rol é o único caso em que "sem conta" não
      // significa "sem atraso" — e dizer só `SEM_ATRASO` esconderia o defeito de
      // cadastro atrás de uma resposta tranquilizadora.
      if (semAluguel.length > 0) {
        res.status(422).json({
          error: "ATRASO_SEM_ALUGUEL",
          detalhe:
            `${semAluguel.join(", ")} — esta(s) peça(s) atrasou(aram) e não está(ão) no rol de itens ` +
            "do contrato. A cláusula 16ª cobra sobre o aluguel de cada peça, e não há de onde tirá-lo.",
        });
        return;
      }
      res.status(422).json({
        error: "SEM_ATRASO",
        detalhe: "Nenhuma peça deste contrato passou da data prevista de devolução",
      });
      return;
    }

    const parcelaId = randomUUID();
    const desfecho = await db.transaction(async (tx) => {
      // Mesma conta da rota irmã do E97: `numero: 0` é a ENTRADA do carnê, e
      // com `unique(contratoId, numero)` um zero fixo devolveria
      // `REGISTRO_DUPLICADO` — um 409 que se lê como "já cobrei isso".
      const [{ maior }] = await tx
        .select({ maior: sql<number>`coalesce(max(${parcelasTable.numero}), 0)` })
        .from(parcelasTable)
        .where(eq(parcelasTable.contratoId, contratoId));

      await tx.insert(parcelasTable).values({
        id: parcelaId,
        lojaId,
        contratoId,
        numero: Number(maior) + 1,
        origem: "ATRASO_DEVOLUCAO",
        // A MESMA frase que a tela imprimiu antes do clique. Duas grafias da
        // mesma conta divergiriam no dia em que a régua mudasse (E214).
        descricao: `Atraso na devolução — ${explicacaoDoAtraso(cobranca)}`.slice(0, 200),
        valorPrevisto: cobranca.valor,
        // Dia de negócio, e não `new Date()`: das 21h à meia-noite o instante
        // cru joga o vencimento para o dia seguinte (S-O117).
        vencimento: ancoraDeNegocio(addDias(hojeLocal(), parsed.data.prazoDias ?? 7)),
      });

      const [marcado] = await tx
        .update(contratosTable)
        .set({ atrasoParcelaId: parcelaId, updatedAt: new Date() })
        .where(and(
          eq(contratosTable.id, contratoId),
          contrato.atrasoParcelaId
            ? eq(contratosTable.atrasoParcelaId, contrato.atrasoParcelaId)
            : isNull(contratosTable.atrasoParcelaId),
        ))
        .returning();
      if (!marcado) throw new AtrasoJaCobrado();

      /**
       * A trilha, e ela não é opcional aqui.
       *
       * Esta é a única cobrança do sistema cujo VALOR depende do dia em que
       * alguém clicou: a peça que não voltou soma uma diária por dia, então a
       * mesma peça cobrada na terça e na quinta dá números diferentes. Sem a
       * linha, "por que este atraso custou R$ 4.750,00?" não tem resposta
       * depois do fato — nem para a dona, nem para a noiva que contestar.
       */
      await registrarAuditoria(tx, {
        lojaId,
        usuario: req.usuario!,
        acao: "ATRASO_COBRADO",
        entidade: "contrato",
        entidadeId: contratoId,
        detalhe: {
          parcelaId,
          valor: cobranca.valor,
          multa: cobranca.multa,
          maiorAtraso: cobranca.maiorAtraso,
          temExtravio: cobranca.temExtravio,
          linhas: cobranca.linhas,
          semAluguel,
        },
      });
      return { ok: true as const };
    }).catch((err) => {
      if (err instanceof AtrasoJaCobrado) return { jaCobrada: true as const };
      throw err;
    });

    if ("jaCobrada" in desfecho) {
      res.status(409).json({
        error: "ATRASO_JA_COBRADO",
        detalhe: "O atraso deste contrato já virou parcela",
      });
      return;
    }

    res.status(201).json(
      CobrarAtrasoDaDevolucaoResponse.parse(
        envelopeDoAtraso(cobranca, semAluguel, { jaCobrada: true, parcelaId }),
      ),
    );
  },
);

/**
 * **S-C11 — o zero a mais tem conserto.**
 *
 * `descricao`, `tipo`, `custo_reparo` e `justificativa_da_taxa` só entravam no
 * `POST` de nascimento. Quem digitou **R$ 1.500,00** onde eram **R$ 150,00** só
 * tinha um caminho: apagar a linha e refazer. E o `DELETE` logo abaixo RECUSA
 * apagar quando a avaria sustenta cobrança viva (E97/F23) — e mesmo quando
 * aceita, leva a **foto-prova** junto. O erro de digitação mais comum do
 * sistema, o de dez vezes o valor, era o único sem conserto.
 *
 * ## As três decisões desta porta
 *
 * **1. A régua do E214 vale na edição INTEIRA.** As cláusulas 14ª e 15ª são
 * conferidas de novo sobre o valor final, e quem violar um número do papel
 * escreve a razão — que fica gravada na linha e vai para a trilha com
 * `momento: "EDICAO"`. Sem isto a edição seria a porta dos fundos da régua que
 * o E214 pôs na frente: bastaria nascer com R$ 400,00 e corrigir para
 * R$ 9.000,00.
 *
 * **2. A cobrança VIVA segue o número, e o teto conferido é o DELA.**
 * `parcelas.valor_previsto` nasceu de `avarias.custo_reparo` no
 * `POST /cobrar`; deixar os dois divergirem é dois números para uma decisão só
 * (a lição do E186) — a ficha diria R$ 150,00 e o carnê cobraria R$ 1.500,00,
 * com o portal da noiva do lado do carnê. Pela mesma razão, o teto da 15ª sai
 * do contrato que **cobra** o reparo e não do derivado: é ali que o dinheiro
 * está, exatamente como o `POST /cobrar` decidiu no E214.
 *
 * **3. Dinheiro que ENTROU congela a linha** — 409 `AVARIA_COM_RECEBIMENTO`.
 * Com `recebidoEm` na parcela, o extrato, o fluxo e o DRE já contaram aquele
 * real no dia em que ele chegou, e baixar o previsto por baixo deles reescreve
 * o passado. **O caminho de volta existe e é o de sempre**: estornar a parcela
 * (que zera `valorRecebido`/`recebidoEm`, E115/S5) e então corrigir. A assimetria
 * com o `DELETE` é de propósito e é o julgamento deste épico: apagar recusa em
 * QUALQUER cobrança viva, porque a foto sustenta a parcela; corrigir recusa só
 * onde houve recebimento, porque mexer no previsto de uma parcela que ninguém
 * pagou não move um centavo de caixa — e é exatamente o gesto que faltava.
 *
 * A FOTO não entra no corpo. Trocar a prova não é corrigir um número; quem
 * precisar de outra evidência registra outra avaria.
 */
// O gate é o do PREFIXO (`:1376`, `requireModulo("vestidos")`), que deriva a
// ação do método: PATCH é `editar`. Escrevi um `requireModulo` explícito aqui
// primeiro, por ter lido só o topo do arquivo e concluído que `/avarias` não
// tinha gate nenhum — **medi, e tinha**: sem `vestidos` no perfil, as três
// portas respondem 403. Dois lugares declarando a mesma permissão é a marca de
// que a decisão não foi tomada (E186), e o que sobra é este comentário para
// quem repetir a leitura.
router.patch(
  "/lojas/:lojaId/avarias/:avariaId",
  async (req, res): Promise<void> => {
    const { lojaId, avariaId } = req.params;
    const parsed = UpdateAvariaBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(erroDeValidacao(parsed.error));
      return;
    }

    /**
     * **Tudo decidido SOB a tranca, e é por isso que não há releitura à parte.**
     *
     * A alternativa — ler no pool, decidir, trancar e conferir — tem a janela
     * que o V15 mediu no `DELETE` logo abaixo: entre a leitura e a escrita cabe
     * o `POST /cobrar` inteiro, e a avaria passaria a ter uma parcela que esta
     * conta não viu. Aqui a linha é trancada ANTES da primeira pergunta, e a
     * ordem é a do módulo: **avaria → parcela**, os degraus 3 e 6 da cadeia
     * declarada em `__tests__/portas-de-escrita.ts`.
     */
    const desfecho = await db.transaction(async (tx) => {
      const [avaria] = await tx
        .select({
          id: avariasTable.id,
          bloqueioId: avariasTable.bloqueioId,
          descricao: avariasTable.descricao,
          tipo: avariasTable.tipo,
          custoReparo: avariasTable.custoReparo,
          justificativaDaTaxa: avariasTable.justificativaDaTaxa,
          parcelaId: avariasTable.parcelaId,
        })
        .from(avariasTable)
        .where(and(eq(avariasTable.id, avariaId as string), eq(avariasTable.lojaId, lojaId as string)))
        .for("update");
      if (!avaria) return { naoEncontrada: true as const };

      // A parcela do reparo, sob a MESMA transação: é ela que diz se há
      // cobrança viva, se alguém já pagou, e em qual contrato o teto vive.
      const [parcela] = avaria.parcelaId
        ? await tx
            .select({
              id: parcelasTable.id,
              status: parcelasTable.status,
              contratoId: parcelasTable.contratoId,
              recebidoEm: parcelasTable.recebidoEm,
              valorRecebido: parcelasTable.valorRecebido,
            })
            .from(parcelasTable)
            .where(eq(parcelasTable.id, avaria.parcelaId))
            .for("update")
        : [undefined];
      // V2/E167 — "cobrada" é cobrança VIVA, não `parcelaId` preenchido. Com o
      // contrato cancelado a parcela vira CANCELADA junto, e a partir daí ela é
      // história: não há número que ela sustente.
      const cobrancaViva = parcela !== undefined && parcela.status !== "CANCELADA";
      if (cobrancaViva && teveRecebimento(parcela)) return { comRecebimento: true as const };

      // Campo ausente é "não mexi"; `null` APAGA (a gramática do S-M10).
      const descricao = parsed.data.descricao ?? avaria.descricao;
      const tipo = (parsed.data.tipo ?? avaria.tipo) as TipoDeAvaria;
      const custoReparo =
        parsed.data.custoReparo !== undefined ? parsed.data.custoReparo : avaria.custoReparo;

      // Apagar o custo de uma cobrança viva deixaria a parcela sem número — é o
      // mesmo `AVARIA_SEM_CUSTO` que o `POST /cobrar` já devolve, na direção
      // contrária.
      if (cobrancaViva && (custoReparo === null || custoReparo <= 0)) {
        return { semCusto: true as const };
      }

      const [bloqueio] = await tx
        .select({
          vestidoId: bloqueioVestidosTable.vestidoId,
          leadId: bloqueioVestidosTable.leadId,
          reservaId: bloqueioVestidosTable.reservaId,
        })
        .from(bloqueioVestidosTable)
        .where(eq(bloqueioVestidosTable.id, avaria.bloqueioId));

      // S-C47: a escolha entre "o contrato que cobra" e "o ATIVO da dona" morava
      // escrita aqui, e a tela a refazia por um terceiro caminho. Hoje é uma
      // função só, e o número que decide este 422 é o mesmo que o payload leva.
      const aluguel = await aluguelQueRegeAAvaria(
        {
          bloqueio,
          contratoQueCobra: cobrancaViva && parcela ? parcela.contratoId : null,
        },
        lojaId as string,
        tx,
      );

      const veredicto = avaliarTaxaDeAvaria({ tipo, valor: custoReparo, aluguelDaPeca: aluguel });
      const justificativaPedida =
        parsed.data.justificativaDaTaxa !== undefined
          ? parsed.data.justificativaDaTaxa
          : avaria.justificativaDaTaxa;
      const justificativa = justificativaPedida?.trim() || null;
      if (veredicto.exigeJustificativa && !justificativa) {
        return { foraDaFaixa: veredicto as VeredictoDaTaxa };
      }

      /**
       * A parcela segue o número ANTES de a avaria mudar, e sob o CAS do
       * recebimento: se alguém receber entre a tranca e esta linha — não pode,
       * a tranca o impede —, zero linhas voltam e o `returning()` vazio derruba
       * a transação inteira. É a mesma cinta e suspensório do `cobrar`.
       */
      let parcelaSeguiu: string | null = null;
      if (cobrancaViva && parcela && custoReparo !== null && custoReparo !== avaria.custoReparo) {
        await tx
          .update(parcelasTable)
          .set({ valorPrevisto: custoReparo })
          .where(and(eq(parcelasTable.id, parcela.id), isNull(parcelasTable.recebidoEm)));
        parcelaSeguiu = parcela.id;
      }

      // Justificativa colada numa taxa que CABE não vira selo permanente — a
      // mesma decisão do nascimento (E214). Corrigido o valor para dentro da
      // faixa, o vermelho da ficha some junto com o motivo dele.
      const justificativaFinal = veredicto.exigeJustificativa ? justificativa : null;
      const [linha] = await tx
        .update(avariasTable)
        .set({ descricao, tipo, custoReparo, justificativaDaTaxa: justificativaFinal })
        .where(and(eq(avariasTable.id, avaria.id), eq(avariasTable.lojaId, lojaId as string)))
        .returning();

      /**
       * O DE e o PARA, porque o valor anterior deixa de existir nesta escrita.
       * *"Quem baixou este reparo de R$ 1.500,00 para R$ 150,00, e quando?"* não
       * tem outra resposta depois do fato — e quando `parcelaSeguiu` está
       * preenchido a pergunta vale dinheiro no carnê da noiva.
       */
      await registrarAuditoria(tx, {
        lojaId: lojaId as string,
        usuario: req.usuario!,
        acao: "AVARIA_EDITADA",
        entidade: "avaria",
        entidadeId: avaria.id,
        detalhe: {
          de: {
            descricao: avaria.descricao,
            tipo: avaria.tipo,
            custoReparo: avaria.custoReparo,
            justificativaDaTaxa: avaria.justificativaDaTaxa,
          },
          para: {
            descricao,
            tipo,
            custoReparo,
            justificativaDaTaxa: justificativaFinal,
          },
          parcelaSeguiu,
        },
      });
      // A MESMA linha do E214, com o momento dito: a violação escrita com razão,
      // e a conta que não pôde ser conferida. É o que impede a decisão "não
      // barra" de virar silêncio na edição, como já impedia no nascimento.
      if (veredicto.mereceTrilha) {
        await registrarAuditoria(tx, {
          lojaId: lojaId as string,
          usuario: req.usuario!,
          acao: "AVARIA_FORA_DA_FAIXA",
          entidade: "avaria",
          entidadeId: avaria.id,
          detalhe: {
            momento: "EDICAO",
            contratoId: cobrancaViva && parcela ? parcela.contratoId : null,
            tipo: veredicto.tipo,
            clausula: veredicto.clausula,
            valor: veredicto.valor,
            piso: veredicto.piso,
            teto: veredicto.teto,
            conferida: veredicto.conferida,
            motivo: veredicto.motivo,
            justificativa,
          },
        });
      }
      return { linha: linha!, status: parcela?.status ?? null, aluguel };
    });

    if ("naoEncontrada" in desfecho) {
      res.status(404).json({ error: "AVARIA_NAO_ENCONTRADA", detalhe: "Esta avaria não existe nesta loja." });
      return;
    }
    if ("comRecebimento" in desfecho) {
      res.status(409).json({
        error: "AVARIA_COM_RECEBIMENTO",
        detalhe: "Este reparo já recebeu dinheiro — estorne a parcela antes de corrigir o valor.",
      });
      return;
    }
    if ("semCusto" in desfecho) {
      res.status(422).json({
        error: "AVARIA_SEM_CUSTO",
        detalhe: "Este reparo já virou parcela do contrato — a parcela ficaria sem valor.",
        campos: [{ campo: "custoReparo", motivo: "Informe o custo do reparo" }],
      });
      return;
    }
    if ("foraDaFaixa" in desfecho) {
      res.status(422).json({
        error: "TAXA_FORA_DA_FAIXA",
        detalhe: `${explicacaoDaFaixa(desfecho.foraDaFaixa!)} Para cobrar fora dela, escreva a razão.`,
        campos: [{ campo: "justificativaDaTaxa", motivo: "Diga por que a taxa sai da faixa do contrato" }],
      });
      return;
    }
    res
      .status(200)
      .json(UpdateAvariaResponse.parse(avariaMeta(desfecho.linha, desfecho.status, desfecho.aluguel)));
  },
);

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
    if (sobTranca.parcelaId && (await cobrancaViva(sobTranca.parcelaId, tx))) {
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
