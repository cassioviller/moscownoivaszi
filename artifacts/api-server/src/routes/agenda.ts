import { Router, type IRouter } from "express";
import { db, cabinesTable, atendimentosTable, ajustesTable, ajusteChecklistItensTable, regraDisponibilidadeTable, bloqueioVestidosTable, ausenciasTable, usuariosTable, vestidosTable, orcamentoItensTable } from "@workspace/db";
import { registrarAuditoria } from "../lib/auditoria";
import { eq, and, count, max, inArray, gte, lt, lte } from "drizzle-orm";
import { leadNaLoja, cabineNaLoja, vendedoraNaLoja, atendimentoNaLoja, bloqueioNaLoja, bloqueioDaNoiva } from "../lib/escopo-loja";
// S-O56/E185 — de quem é o bloqueio que a prova carrega, dito também aqui.
import { MAE_DO_BLOQUEIO, atendimentoComDono, ajusteComDono } from "../lib/dono-do-bloqueio";
import {
  ListCabinesResponse,
  CreateCabineBody,
  CreateCabineResponse,
  UpdateCabineParams,
  UpdateCabineBody,
  UpdateCabineResponse,
  DeleteCabineParams,
  ListAtendimentosResponse,
  ListAtendimentosQueryParams,
  CreateAtendimentoBody,
  CreateAtendimentoResponse,
  UpdateAtendimentoParams,
  UpdateAtendimentoBody,
  UpdateAtendimentoResponse,
  DeleteAtendimentoParams,
  ListAjustesResponse,
  CreateAjusteBody,
  CreateAjusteResponse,
  UpdateAjusteBody,
  UpdateAjusteResponse,
  AddChecklistItemBody,
  AddChecklistItemResponse,
  UpdateChecklistItemBody,
  UpdateChecklistItemResponse,
  GetDisponibilidadeResponse,
  SetDisponibilidadeBody,
  SetDisponibilidadeResponse,
  RegistrarContatoAtendimentoResponse,
  DesfazerContatoAtendimentoResponse,
  ListAusenciasResponse,
  ListAusenciasQueryParams,
  CreateAusenciaBody,
  CreateAusenciaResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
// S-C221 — a pergunta do middleware, feita à mão no único ponto em que um
// corpo de agenda carrega uma cláusula de CONTRATO (o expediente da 4ª).
import { getPermissoes } from "../lib/auth";
import { podeNoModulo } from "../lib/permissoes";
// S-C89 — a regra de disponibilidade carrega a janela de uso que a fila de
// atrasos lê; o PUT dela derruba o cache da loja.
import { derrubarFilaDeAtrasos } from "../lib/fila-de-atrasos-cache";
import {
  recusaDeMover,
  ausenciaQueCobre,
  diaLocalYMD,
  expedienteDaRegra,
  // E222 — o segundo expediente, o de retirada e devolução (cláusula 4ª).
  expedienteDeRetirada,
  DETALHE_RECUSA,
  SLOT_MINUTOS,
  type MotivoRecusa,
} from "@workspace/agenda-core";
import {
  addDias,
  inicioDoDia,
  verificarDisponibilidade,
  ocupacaoFisica,
  type DbExecutor,
} from "../lib/disponibilidade";
import { randomUUID } from "node:crypto";
import { erroDeValidacao } from "../lib/erros";
import { intervaloValidado } from "../lib/intervalo";

const router: IRouter = Router();

/**
 * Pré-checagem amigável do reagendamento (E28). Traduz o movimento pedido em
 * "pode ou não, e por quê" usando a MESMA função que a grade usa para apagar a
 * célula — sem isso, a tela ofereceria um destino que o banco recusa.
 *
 * Não é a garantia: entre este SELECT e o UPDATE cabe outra requisição. Quem
 * segura de verdade continua sendo a UNIQUE (cabine, inicio) / (loja, vendedora,
 * inicio), como o lote17 provou sob concorrência. Isto existe para a mensagem
 * ser específica em vez de um 409 que não diz o que colidiu.
 */
/**
 * G5 (E161) — o `FOR UPDATE` trancava a CABINE, e o conflito de vendedora
 * atravessa cabines.
 *
 * A S-M22 fechou o eixo da cabine e deixou o eixo da vendedora vivo: duas
 * requisições pondo a MESMA vendedora no mesmo horário em cabines DIFERENTES
 * trancavam linhas diferentes, não se enxergavam, e as duas respondiam 201. A
 * UNIQUE `(loja, vendedora, inicio)` só pega o instante EXATO — e desde o E40 o
 * conflito é de INTERVALO, então a prova das 14:00 e o atendimento das 14:30
 * com a mesma vendedora passavam pelos dois lados. É o achado A06.2 dos
 * ângulos, agora com a causa.
 *
 * **A ordem é cabine → vendedora, sempre**, nas duas portas. Como são tabelas
 * diferentes com ordem fixa, não há ciclo possível entre elas.
 */
/**
 * G1 (E161): aborta a transação da conclusão da prova com rollback — o mesmo
 * idioma do `ConflitoDisponibilidadeError` de `reservas.ts:49`.
 */
class ConflitoDaProvaError extends Error {
  constructor(public readonly conflitos: unknown[]) {
    super("VESTIDO_INDISPONIVEL");
  }
}

async function trancarEixos(
  tx: DbExecutor,
  cabineId: string,
  vendedoraId: string,
): Promise<void> {
  await tx.select({ id: cabinesTable.id }).from(cabinesTable)
    .where(eq(cabinesTable.id, cabineId))
    .for("update");
  await tx.select({ id: usuariosTable.id }).from(usuariosTable)
    .where(eq(usuariosTable.id, vendedoraId))
    .for("update");
}

async function recusaDeMoverAtendimento(
  lojaId: string,
  existente: { id: string; cabineId: string; vendedoraId: string; inicio: Date; tipo: "ATENDIMENTO" | "PROVA" },
  mudanca: { cabineId?: string; vendedoraId?: string; inicio?: Date },
  // S-M22: dentro da transação de POST/PATCH, o executor é a própria tx — a
  // busca de concorrentes enxerga o que o vencedor da corrida commitou. A nota
  // do docbloco ("quem segura é a UNIQUE") valia até o E40: a UNIQUE é do
  // instante EXATO, e o conflito virou de INTERVALO — sob concorrência a
  // pré-checagem era a única guarda, e rodava no pool.
  executor: DbExecutor = db,
): Promise<{ motivo: MotivoRecusa; detalhe: string } | null> {
  const [regra] = await executor
    .select()
    .from(regraDisponibilidadeTable)
    .where(eq(regraDisponibilidadeTable.lojaId, lojaId));
  // G8 (E168): o montador é um só — `expedienteDaRegra` do agenda-core. As três
  // cópias à mão divergiam, e a da grade do dia esquecia `provaDuracao`.
  const expediente = expedienteDaRegra(regra);

  const destino = {
    cabineId: mudanca.cabineId ?? existente.cabineId,
    inicio: mudanca.inicio ?? existente.inicio,
  };
  const movida = {
    id: existente.id,
    cabineId: existente.cabineId,
    vendedoraId: mudanca.vendedoraId ?? existente.vendedoraId,
    inicio: existente.inicio,
    tipo: existente.tipo,
  };

  // E40: uma prova ocupa vários slots, então o conflito não é mais só do instante
  // exato — busca-se uma JANELA em torno do destino (± a duração máxima de prova)
  // e o `recusaDeMover` decide a sobreposição de intervalo. A janela é curta:
  // longe do desperdício de carregar o dia inteiro.
  //
  // S-A7: o passo é SLOT_MINUTOS, do agenda-core — a MESMA fonte que rege a
  // grade e o `recusaDeMover`. O `30` vivia cravado aqui como literal: mudar a
  // constante corrigia a grade e não corrigia esta busca, e as duas divergiam
  // em silêncio.
  //
  // G4 (E161): era `regra?.provaDuracao ?? 1` — a janela lia UMA duração e a
  // régua da sobreposição lia OUTRA, o `expediente` montado dez linhas acima.
  // A ironia está medida: `EXPEDIENTE_PADRAO` traz `provaDuracao: 2`, então a
  // loja SEM regra tinha janela de 30 min contra ocupação de 60 — **a prova das
  // 14:10 ficava fora do SELECT** e duas noivas entravam na mesma cabine às
  // 14:50, sem UNIQUE que pegasse (a UNIQUE é do instante EXATO, e o conflito
  // virou de INTERVALO no E40). Uma fonte só: o expediente efetivo.
  // O `?? 1` é o MESMO fallback de `duracaoSlots` (`agenda-core/mover.ts:80`) —
  // a janela e a régua passam a aplicar a mesma expressão sobre a mesma fonte.
  const janelaMs = Math.max(1, expediente.provaDuracao ?? 1) * SLOT_MINUTOS * 60_000;
  const destinoMs = new Date(destino.inicio).getTime();
  const concorrentes = await executor
    .select({
      id: atendimentosTable.id,
      cabineId: atendimentosTable.cabineId,
      vendedoraId: atendimentosTable.vendedoraId,
      inicio: atendimentosTable.inicio,
      tipo: atendimentosTable.tipo,
      // G9 (E168): a situação entra no SELECT porque a régua passou a
      // consultá-la. Sem esta coluna o núcleo trataria tudo como vivo — o
      // comportamento de antes — e a tela de agendar continuaria discordando.
      situacao: atendimentosTable.situacao,
    })
    .from(atendimentosTable)
    .where(and(
      eq(atendimentosTable.lojaId, lojaId),
      gte(atendimentosTable.inicio, new Date(destinoMs - janelaMs)),
      lte(atendimentosTable.inicio, new Date(destinoMs + janelaMs)),
    ));

  /**
   * E151 — as ausências que tocam o DIA do destino.
   *
   * Recorte pelo dia e não pela loja inteira: férias antigas não interessam a
   * um agendamento de amanhã, e a tabela cresce com o tempo. O `usuarioNome`
   * vem junto porque a frase da recusa precisa dele — sem ele a vendedora
   * leria "a vendedora está ausente" sem saber qual nem até quando.
   */
  const diaDestino = diaLocalYMD(destino.inicio);
  const ausencias = await executor
    .select({
      usuarioId: ausenciasTable.usuarioId,
      inicio: ausenciasTable.inicio,
      fim: ausenciasTable.fim,
      motivo: ausenciasTable.motivo,
      nome: usuariosTable.nome,
    })
    .from(ausenciasTable)
    .innerJoin(usuariosTable, eq(usuariosTable.id, ausenciasTable.usuarioId))
    .where(and(
      eq(ausenciasTable.lojaId, lojaId),
      lte(ausenciasTable.inicio, diaDestino),
      gte(ausenciasTable.fim, diaDestino),
    ));

  const motivo = recusaDeMover(movida, destino, concorrentes, expediente, ausencias);
  if (!motivo) return null;
  if (motivo !== "VENDEDORA_AUSENTE") return { motivo, detalhe: DETALHE_RECUSA[motivo] };

  // A frase nomeia a pessoa e o período — é o que a vendedora precisa para
  // decidir o que fazer (remarcar? outra vendedora?) sem sair da tela.
  const ausente = ausenciaQueCobre(ausencias, movida.vendedoraId, destino.inicio) as
    | { inicio: string; fim: string; motivo: string | null; nome: string }
    | null;
  const ddmm = (ymd: string) => ymd.slice(8, 10) + "/" + ymd.slice(5, 7);
  return {
    motivo,
    detalhe: ausente
      ? `${ausente.nome} está ausente de ${ddmm(ausente.inicio)} a ${ddmm(ausente.fim)}` +
        (ausente.motivo ? ` (${ausente.motivo})` : "") + "."
      : DETALHE_RECUSA[motivo],
  };
}

// Joins padrão dos atendimentos: as telas de fila/agenda/provas precisam de
// noiva, cabine, vendedora e — nas provas — vestido via bloqueio + ajustes
// com checklist. Os schemas de resposta expõem essas relações.
const ATENDIMENTO_WITH = {
  lead: true,
  cabine: true,
  vendedora: true,
  // S-O56/E185: a reserva-mãe entra por UMA coluna do mesmo SELECT relacional
  // — é ela que faz o `donoLeadId` do schema `BloqueioVestido` parar de vir
  // `undefined` nas cinco portas de atendimento. O motivo escrito na sobra
  // ("aqui o dono sai de consulta por linha") não se confirmou: o `with`
  // aninhado do drizzle é o mesmo join, um nível mais fundo.
  bloqueio: { with: { vestido: true, ...MAE_DO_BLOQUEIO } },
  ajustes: {
    // E104/A13: sem anotação explícita nos parâmetros. Com `strictFunctionTypes`
    // ligado, um callback com parâmetro anotado é checado de forma
    // CONTRAVARIANTE contra o que o drizzle espera, e a query relacional inteira
    // deixa de tipar. Deixar o TS inferir é o que faz a flag valer sem
    // desligá-la de novo.
    with: { checklist: { orderBy: (t: any, { asc }: any) => [asc(t.ordem)] } },
  },
} as const;

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/cabines", requireModulo("agenda"));
router.use("/lojas/:lojaId/atendimentos", requireModulo("agenda"));
router.use("/lojas/:lojaId/ajustes", requireModulo("agenda"));
router.use("/lojas/:lojaId/disponibilidade", requireModulo("agenda"));
// E151: a ausência é da agenda — quem marca o dia é quem sabe quem falta.
router.use("/lojas/:lojaId/ausencias", requireModulo("agenda"));

// Cabines
router.get("/lojas/:lojaId/cabines", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const cabines = await db.select().from(cabinesTable).where(eq(cabinesTable.lojaId, lojaId)).orderBy(cabinesTable.nome);
  res.json(ListCabinesResponse.parse(cabines));
});

router.post("/lojas/:lojaId/cabines", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateCabineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const [cabine] = await db.insert(cabinesTable).values({
    id: randomUUID(),
    lojaId,
    ...parsed.data,
  }).returning();
  res.status(201).json(CreateCabineResponse.parse(cabine));
});

router.patch("/lojas/:lojaId/cabines/:cabineId", async (req, res): Promise<void> => {
  const params = UpdateCabineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const parsed = UpdateCabineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const [cabine] = await db.update(cabinesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(cabinesTable.id, params.data.cabineId), eq(cabinesTable.lojaId, params.data.lojaId)))
    .returning();
  if (!cabine) {
    res.status(404).json({ error: "CABINE_NAO_ENCONTRADA", detalhe: "Esta cabine não existe nesta loja." });
    return;
  }
  res.json(UpdateCabineResponse.parse(cabine));
});

/**
 * S-M1 — a cabine era o sexto DELETE cru, e o E115 não o alcançou.
 *
 * Cinco linhas: 204 mesmo sem apagar nada, nenhuma pergunta sobre uso, nenhum
 * rastro e nenhuma transação. E `atendimentos.cabine_id` é CASCADE
 * (`schema/atendimentos.ts:82`), então apagar a cabine **leva a agenda dela
 * inteira** — as provas marcadas, as concluídas que são a história da ficha da
 * noiva, e a fila de costura que desce dos atendimentos por outro CASCADE. A
 * mesma cascata que o E115 fechou em `DELETE /atendimentos`, um nível acima e
 * sem nenhuma das guardas.
 *
 * A régua é a do `DELETE /vestidos` (S-A25): quem tem história não se apaga,
 * se DESATIVA — `cabines.ativo` existe desde sempre e a tela de Cabines &
 * horário já o edita. Contamos a agenda inteira, passada e futura: o que dói
 * na cascata é justamente o passado, que não se remarca.
 */
router.delete("/lojas/:lojaId/cabines/:cabineId", async (req, res): Promise<void> => {
  const params = DeleteCabineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  const { lojaId, cabineId } = params.data;
  const [cabine] = await db.select({ id: cabinesTable.id, nome: cabinesTable.nome, ativo: cabinesTable.ativo })
    .from(cabinesTable)
    .where(and(eq(cabinesTable.id, cabineId), eq(cabinesTable.lojaId, lojaId)));
  if (!cabine) {
    res.status(404).json({ error: "CABINE_NAO_ENCONTRADA", detalhe: "Esta cabine não existe nesta loja." });
    return;
  }

  const [agenda] = await db.select({ n: count() }).from(atendimentosTable)
    .where(and(eq(atendimentosTable.cabineId, cabineId), eq(atendimentosTable.lojaId, lojaId)));
  if (agenda!.n > 0) {
    res.status(409).json({
      error: "CABINE_COM_AGENDA",
      detalhe: `Esta cabine tem ${agenda!.n} atendimento${agenda!.n === 1 ? "" : "s"} na agenda e não pode ser apagada — apagá-la levaria essa história junto. Desative-a se ela saiu de uso.`,
    });
    return;
  }

  /**
   * S-M22 (rodada 2, achado 11#1): a guarda da S-M1 nasceu com a contagem no
   * POOL — o POST /atendimentos que commitasse na janela era cascateado em
   * silêncio, o exato estrago que fez a S-M1 ser 🔴. `FOR UPDATE` na linha da
   * cabine (o INSERT de atendimento toma `FOR KEY SHARE` nela — conflita) e a
   * recontagem como statement novo. O delete confere linhas afetadas: dois
   * DELETEs simultâneos gravavam DUAS auditorias para uma remoção.
   */
  const resultado = await db.transaction(async (tx) => {
    const [trancada] = await tx.select({ id: cabinesTable.id }).from(cabinesTable)
      .where(and(eq(cabinesTable.id, cabineId), eq(cabinesTable.lojaId, lojaId)))
      .for("update");
    if (!trancada) return { corrida: "sumiu" as const };
    const [agendaAgora] = await tx.select({ n: count() }).from(atendimentosTable)
      .where(and(eq(atendimentosTable.cabineId, cabineId), eq(atendimentosTable.lojaId, lojaId)));
    if (agendaAgora!.n > 0) return { corrida: "agenda" as const };
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "CABINE_REMOVIDA",
      entidade: "cabine",
      entidadeId: cabineId,
      // Depois do DELETE não sobra linha nenhuma de onde reconstituir a cabine:
      // o nome é o que alguém procura ao perguntar "cadê a Cabine 3?".
      detalhe: { nome: cabine.nome, ativo: cabine.ativo },
    });
    await tx.delete(cabinesTable).where(and(eq(cabinesTable.id, cabineId), eq(cabinesTable.lojaId, lojaId)));
    return { ok: true as const };
  });
  if ("corrida" in resultado) {
    if (resultado.corrida === "sumiu") {
      res.status(404).json({ error: "CABINE_NAO_ENCONTRADA", detalhe: "Esta cabine não existe nesta loja." });
    } else {
      res.status(409).json({
        error: "CABINE_COM_AGENDA",
        detalhe: "Esta cabine acabou de ganhar um atendimento — recarregue a agenda antes de apagá-la.",
      });
    }
    return;
  }
  res.status(204).send();
});

// Atendimentos
router.get("/lojas/:lojaId/atendimentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  // E79: recortes opcionais — a ficha da reserva pede as provas do bloqueio,
  // a tela de provas pede só PROVA; ninguém baixa a agenda inteira para filtrar.
  // E83: janela de/ate sobre `inicio` (dia local, inclusivo) — o poll do sino
  // e as telas do dia pedem a janela, não a história.
  // O parse recusado responde o corpo histórico DESTA rota (só o código).
  const query = intervaloValidado(res, ListAtendimentosQueryParams.safeParse(req.query), {
    error: "FILTRO_INVALIDO",
  });
  if (!query) return;
  // E125: recorte por noiva — a ficha pergunta pela próxima prova DELA e não
  // tem por que baixar a agenda da loja inteira (a classe do E62).
  const { leadId, bloqueioId, cabineId, tipo, de, ate } = query;
  const atendimentos = await db.query.atendimentosTable.findMany({
    where: and(
      eq(atendimentosTable.lojaId, lojaId),
      ...(leadId ? [eq(atendimentosTable.leadId, leadId)] : []),
      ...(bloqueioId ? [eq(atendimentosTable.bloqueioId, bloqueioId)] : []),
      // S-O22: o recorte por cabine — a tela de cabines conta a agenda da que
      // vai ser desativada, e baixava a loja inteira para isso.
      ...(cabineId ? [eq(atendimentosTable.cabineId, cabineId)] : []),
      ...(tipo ? [eq(atendimentosTable.tipo, tipo)] : []),
      ...(de ? [gte(atendimentosTable.inicio, inicioDoDia(de))] : []),
      ...(ate ? [lt(atendimentosTable.inicio, inicioDoDia(addDias(ate, 1)))] : []),
    ),
    with: ATENDIMENTO_WITH,
    orderBy: atendimentosTable.inicio,
  });
  res.json(ListAtendimentosResponse.parse(atendimentos.map((a) => atendimentoComDono(a))));
});

router.post("/lojas/:lojaId/atendimentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateAtendimentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  // As FKs vêm do corpo: garantir que lead, cabine e vendedora são DESTA loja,
  // senão o atendimento nasce referenciando outra (vazamento de tenant).
  // E115: o `bloqueioId` opcional entrava sem a mesma prova — uma prova
  // agendada sobre o vestido reservado de OUTRA loja.
  const [okLead, okCabine, okVend, okBloqueio] = await Promise.all([
    leadNaLoja(parsed.data.leadId, lojaId),
    cabineNaLoja(parsed.data.cabineId, lojaId),
    vendedoraNaLoja(parsed.data.vendedoraId, lojaId),
    parsed.data.bloqueioId ? bloqueioNaLoja(parsed.data.bloqueioId, lojaId) : true,
  ]);
  if (!okLead || !okCabine || !okVend || !okBloqueio) {
    res.status(422).json({ error: "REFERENCIA_INVALIDA", detalhe: "lead, cabine, vendedora ou bloqueio não são desta loja" });
    return;
  }

  /**
   * G7/A06.3 — o POST aceitava `tipo: PROVA` SEM `bloqueioId`.
   *
   * O comentário de `agenda/index.tsx:154-159` **diz que isso foi consertado**
   * ao matar o diálogo antigo. Foi consertado na TELA; a rota nunca soube — e
   * uma prova sem vestido é uma prova de nada: a noiva vem ao ateliê, a cabine
   * fica ocupada, e no dia não há peça reservada para ela experimentar. O
   * carimbo do E37 (`provaDataReal`) também não tem onde cair, então a janela
   * de disponibilidade nunca colapsa.
   *
   * O spec `e115-portal-agenda:119`, que pregava o defeito criando PROVA sem
   * bloqueio, muda junto — é o caso do E170: teste que fixa comportamento
   * descoberto defeituoso é achado, não cobertura.
   */
  if (parsed.data.tipo === "PROVA" && !parsed.data.bloqueioId) {
    res.status(422).json({
      error: "PROVA_SEM_VESTIDO",
      detalhe: "Uma prova precisa da reserva do vestido que vai ser provado.",
      campos: [{ campo: "bloqueioId", motivo: "Escolha a reserva de vestido desta prova" }],
    });
    return;
  }

  /**
   * G2 — o `bloqueioId` era provado contra a LOJA, não contra a NOIVA.
   *
   * O pareamento noiva↔vestido só o formulário garantia. Prova na ficha da Ana
   * com o vestido da Beatriz: ao concluir, o carimbo do E37 cai **no bloqueio
   * da Beatriz** — a janela dela colapsa para um dia em que ela não provou
   * nada, e a peça é liberada antes da hora. Confirma o A05.3 e o A06.5 pelos
   * dois lados.
   *
   * `bloqueioDaNoiva` é irmã do `ajusteDaNoiva` que o E155 escreveu para
   * exatamente esta pergunta, e nasce aqui em vez de no E164 porque este épico
   * chega primeiro — o E164 a reusa para o R5/V4 em vez de escrever outra.
   * Bloqueio SEM DONA passa, porque sem dona não há o que comparar.
   * **S-C10 (13/08/2026):** este comentário dizia "é o caso comum (61 de 63 no
   * dev)"; remedido, o sem dona é **0 de 116 em `moscow_base` e 2 de 127 no
   * dev**. O que sustenta o `passa` é o nulo ser alcançável, não frequente —
   * `lib/dono-do-bloqueio.ts`. **S-O56/E185: "sem
   * dona" passou a ser `donoDoBloqueio`** — o véu pendurado na reserva-mãe de
   * outra noiva não tem `lead_id` próprio e TEM dona, e era por essa fresta
   * que o caso do parágrafo acima entrava mesmo com a guarda em pé.
   */
  if (parsed.data.bloqueioId && !(await bloqueioDaNoiva(parsed.data.bloqueioId, lojaId, parsed.data.leadId))) {
    res.status(422).json({
      error: "RESERVA_DE_OUTRA_NOIVA",
      detalhe: "Esta reserva de vestido é de outra noiva — escolha uma reserva desta noiva.",
      campos: [{ campo: "bloqueioId", motivo: "A reserva pertence a outra noiva" }],
    });
    return;
  }

  // E115 — a criação só barrava o DIA fechado (E38), enquanto o reagendamento
  // roda as QUATRO recusas do agenda-core: uma prova às 17h30 ocupava a cabine
  // até 19h e o POST às 18h respondia 201 no mesmo lugar de onde o arrastar
  // levava 422 CABINE_OCUPADA; e o POST às 22h criava um atendimento sem
  // célula na grade — nascia invisível. A régua é a MESMA função do PATCH,
  // com o atendimento novo no papel de "movido para onde quer nascer".
  // S-M22 (rodada 2, achado 3#5): a pré-checagem rodava no POOL e o INSERT
  // solto — a prova das 17h30 e o atendimento das 18h00 na MESMA cabine,
  // postados no mesmo segundo, têm `inicio` diferentes (a UNIQUE não casa) e
  // nenhum via o outro: os dois respondiam 201. `FOR UPDATE` na linha da
  // CABINE serializa os criadores; a recusa relê pela tx e enxerga o que o
  // vencedor commitou.
  const criado = await db.transaction(async (tx) => {
    // G5: os DOIS eixos — o conflito de vendedora atravessa cabines.
    await trancarEixos(tx, parsed.data.cabineId, parsed.data.vendedoraId);
    const recusa = await recusaDeMoverAtendimento(
      lojaId,
      {
        id: "novo",
        cabineId: parsed.data.cabineId,
        vendedoraId: parsed.data.vendedoraId,
        inicio: parsed.data.inicio,
        tipo: parsed.data.tipo ?? "ATENDIMENTO",
      },
      {},
      tx,
    );
    if (recusa) return { recusa } as const;
    const [atendimento] = await tx.insert(atendimentosTable).values({
      id: randomUUID(),
      lojaId,
      ...parsed.data,
    }).returning();
    return { atendimento: atendimento! };
  });
  if ("recusa" in criado && criado.recusa) {
    res.status(422).json({ error: criado.recusa.motivo, detalhe: criado.recusa.detalhe });
    return;
  }

  const fullAtendimento = await db.query.atendimentosTable.findFirst({
    where: eq(atendimentosTable.id, criado.atendimento.id),
    with: ATENDIMENTO_WITH,
  });

  res.status(201).json(CreateAtendimentoResponse.parse(atendimentoComDono(fullAtendimento)));
});

router.patch("/lojas/:lojaId/atendimentos/:atendimentoId", async (req, res): Promise<void> => {
  const { lojaId, atendimentoId } = req.params;
  const parsed = UpdateAtendimentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  // Arrastar na grade (E28) reagenda por AQUI, então este endpoint deixou de ser
  // só "editar observação": ele move cabine e horário. Até o E28 não conferia
  // nem o escopo de tenant das FKs (que o POST já conferia) nem o expediente.
  const existente = await db.query.atendimentosTable.findFirst({
    where: and(
      eq(atendimentosTable.id, atendimentoId as string),
      eq(atendimentosTable.lojaId, lojaId as string),
    ),
  });
  if (!existente) {
    res.status(404).json({ error: "ATENDIMENTO_NAO_ENCONTRADO", detalhe: "Este atendimento não existe nesta loja." });
    return;
  }

  // Mesma guarda do POST: um cabineId/vendedoraId de outra loja entraria aqui e
  // o GET enriquecido puxaria os dados dela para dentro desta.
  const [okCabine, okVend] = await Promise.all([
    parsed.data.cabineId ? cabineNaLoja(parsed.data.cabineId, lojaId as string) : true,
    parsed.data.vendedoraId ? vendedoraNaLoja(parsed.data.vendedoraId, lojaId as string) : true,
  ]);
  if (!okCabine || !okVend) {
    res.status(422).json({ error: "REFERENCIA_INVALIDA", detalhe: "cabine ou vendedora não são desta loja" });
    return;
  }

  /**
   * G3 (E161) — trocar SÓ a vendedora pulava o `recusaDeMover` inteiro.
   *
   * `mudouMovimento` olhava `inicio` e `cabineId` e nada mais: nem
   * VENDEDORA_AUSENTE nem VENDEDORA_OCUPADA eram consultados. **A vendedora de
   * férias recebia atendimento com 200** — e a grade, que consulta a MESMA
   * função com as ausências, nunca teria aceitado o mesmo gesto.
   *
   * Trocar o responsável É movimento: muda quem tem de estar na loja naquela
   * hora, e é exatamente sobre isso que as duas recusas de vendedora falam.
   */
  const mudouMovimento =
    parsed.data.inicio !== undefined ||
    parsed.data.cabineId !== undefined ||
    parsed.data.vendedoraId !== undefined;

  // E36: carimbar o início REAL na primeira entrada em EM_ATENDIMENTO. A coluna
  // `atendidoEm` existia e ninguém a escrevia; é do relógio do servidor, não do
  // corpo. Uma vez só — reabrir e reentrar não reescreve o primeiro início, para
  // a espera medida (atendidoEm − inicio) continuar sendo a do atendimento real.
  const carimbo: Partial<typeof atendimentosTable.$inferInsert> =
    parsed.data.situacao === "EM_ATENDIMENTO" && !existente.atendidoEm
      ? { atendidoEm: new Date() }
      : {};

  /**
   * E97/F15 — o dado fantasma. **A medição que o backlog mandou fazer antes de
   * escrever código deu o resultado oposto ao que ele supunha**: este PATCH
   * NUNCA limpou `atendidoEm` nem `desfecho`. O `set` aplica só o que veio no
   * corpo, e voltar para agendado manda `{situacao: "AGENDADO"}` e mais nada.
   *
   * O efeito é uma contradição de estado que sobrevive para sempre: um
   * atendimento AGENDADO — que por definição ainda não aconteceu — carregando
   * "começou às 14h" e "desfecho: RESERVOU" de uma vida passada. A espera
   * medida pelo E36 (`atendidoEm − inicio`) conta um atendimento que o sistema
   * diz não ter ocorrido, e o funil lê um desfecho de quem ainda nem chegou.
   *
   * A régua segue a máquina de estados, não o gosto:
   *   - **AGENDADO** = não aconteceu → limpa os dois.
   *   - **EM_ATENDIMENTO** vindo de CONCLUIDO = está acontecendo de novo →
   *     limpa só o desfecho; `atendidoEm` fica, que é o que o E36 quis
   *     preservar ("reabrir e reentrar não reescreve o primeiro início").
   */
  const limpeza: Partial<typeof atendimentosTable.$inferInsert> =
    parsed.data.situacao === "AGENDADO" && existente.situacao !== "AGENDADO"
      ? { atendidoEm: null, desfecho: null }
      : parsed.data.situacao === "EM_ATENDIMENTO" && existente.situacao === "CONCLUIDO"
        ? { desfecho: null }
        : {};

  /**
   * G10 (E168) — mudar a HORA torna a confirmação mentira, e ela cai.
   *
   * A noiva confirmou pelo portal às 14:00, a recepção arrastou o card para as
   * 17:00, e a tela seguia contando *"1 confirmou pelo portal"* — sobre um
   * horário que ela nunca viu. Ninguém a avisava, e ela chegava às 14:00. O
   * mesmo com `remarcacaoPedidaEm`: quem pediu para remarcar continuava na
   * tela de Mensagens **depois de ter sido remarcada**, para sempre.
   *
   * `contatadoEm` cai junto porque é o que devolve a noiva à fila — a régua de
   * `mensagens-do-dia.ts:65` tira da fila quem tem qualquer um dos três, e
   * zerar dois de três deixaria a linha invisível: procurada sobre um horário
   * que não existe mais, e nunca mais oferecida.
   *
   * **O gatilho é o INSTANTE, e só ele.** `mudouMovimento` também é verdadeiro
   * ao trocar cabine ou vendedora, e nenhum dos dois aparece na mensagem que a
   * noiva recebeu (`msgConfirmacaoAtendimento` carrega tipo, início, nome e
   * endereço da loja): apagar a confirmação porque a prova passou da Cabine 1
   * para a 2 seria pedir à noiva que confirmasse de novo o mesmo horário.
   */
  const mudouOInstante =
    parsed.data.inicio !== undefined &&
    new Date(parsed.data.inicio).getTime() !== existente.inicio.getTime();
  const reconfirmar: Partial<typeof atendimentosTable.$inferInsert> = mudouOInstante
    ? { confirmadoEm: null, contatadoEm: null, remarcacaoPedidaEm: null }
    : {};

  /**
   * S-M22 (rodada 2, achados 3#5 e 3#8): tudo numa transação só. A recusa de
   * movimento relê sob a tranca da CABINE de destino (a mesma corrida do
   * POST), e o carimbo de `provaDataReal` no bloqueio — que era um segundo
   * UPDATE independente no pool — deixa de poder se separar da conclusão da
   * prova: ou os dois commitam, ou nenhum.
   */
  let atualizado;
  try {
    atualizado = await db.transaction(async (tx) => {
    if (mudouMovimento) {
      await trancarEixos(
        tx,
        parsed.data.cabineId ?? existente.cabineId,
        parsed.data.vendedoraId ?? existente.vendedoraId,
      );
      const recusa = await recusaDeMoverAtendimento(lojaId as string, existente, parsed.data, tx);
      if (recusa) return { recusa } as const;
    }

    const [atendimento] = await tx.update(atendimentosTable)
      .set({ ...parsed.data, ...carimbo, ...limpeza, ...reconfirmar, updatedAt: new Date() })
      .where(and(eq(atendimentosTable.id, atendimentoId as string), eq(atendimentosTable.lojaId, lojaId as string)))
      .returning();

    if (!atendimento) return { sumiu: true as const };

    // E37: concluir uma PROVA carimba a data real no bloqueio, fechando o loop
    // agenda↔disponibilidade — a janela de prova (disponibilidade.ts) colapsa
    // para o dia em que a prova de fato aconteceu. Antes só a edição manual da
    // reserva fazia isso; a conclusão do atendimento é a fonte da verdade.
    // Usa o início real (E36); cai no horário marcado se a prova foi concluída
    // sem passar por "iniciar". Colapsar a janela só reduz ocupação — nunca cria
    // conflito, então não precisa revalidar disponibilidade.
    /**
     * G1 (E161) — a justificativa do comentário acima só vale metade das vezes.
     *
     * "Colapsar a janela só reduz ocupação — nunca cria conflito" é verdade
     * **se a data real cair DENTRO da janela derivada**. E o POST aceita a prova
     * em qualquer dia: `provaDataReal` fora da janela de prova não colapsa nada,
     * ela MOVE a ocupação para um lugar novo. **Medido:** a prova da noiva A
     * concluída em 14/10 sobrepõe a janela FÍSICA da noiva B — exatamente o
     * estado que o `PATCH /reservas` recusa com 409, entrando por um UPDATE que
     * não tinha nem a tranca do vestido.
     *
     * O conserto é a régua da porta irmã: `FOR UPDATE` na linha do vestido (a
     * mesma tranca que `reservas.ts:493` e `:604` tomam) e
     * `verificarDisponibilidade` pelo executor da transação. Quando o carimbo
     * cai dentro da janela — o caso normal, a prova concluída no dia marcado —
     * a verificação passa e o custo é uma consulta a mais numa ação que já
     * escreve em duas tabelas.
     */
    if (parsed.data.situacao === "CONCLUIDO" && existente.tipo === "PROVA" && existente.bloqueioId) {
      const [bloqueio] = await tx.select().from(bloqueioVestidosTable)
        .where(and(
          eq(bloqueioVestidosTable.id, existente.bloqueioId),
          eq(bloqueioVestidosTable.lojaId, lojaId as string),
        ))
        .for("update");
      if (bloqueio) {
        await tx.select({ id: vestidosTable.id }).from(vestidosTable)
          .where(eq(vestidosTable.id, bloqueio.vestidoId))
          .for("update");
        const provaDataReal = atendimento.atendidoEm ?? atendimento.inicio;
        const candidato = {
          id: bloqueio.id,
          tipo: bloqueio.tipo,
          casamentoData: bloqueio.casamentoData,
          provaDataReal,
          retiradaDataReal: bloqueio.retiradaDataReal,
          devolucaoDataReal: bloqueio.devolucaoDataReal,
          lavagemConcluidaEm: bloqueio.lavagemConcluidaEm,
          inicio: bloqueio.inicio,
          fim: bloqueio.fim,
        };
        const resultado = await verificarDisponibilidade({
          lojaId: lojaId as string,
          vestidoId: bloqueio.vestidoId,
          candidato,
          ignorarBloqueioId: bloqueio.id,
          hoje: new Date(),
          executor: tx,
        });
        // Por EXCEÇÃO, não por retorno: o UPDATE do atendimento já rodou nesta
        // transação, e um `return` normal COMMITARIA a conclusão sem o carimbo
        // — a separação exata que a S-M22 diz não poder existir ("ou os dois
        // commitam, ou nenhum"). O throw derruba a transação inteira.
        if (!resultado.disponivel) throw new ConflitoDaProvaError(resultado.conflitos);
        const ocupacao = ocupacaoFisica(candidato, resultado.regra);
        await tx.update(bloqueioVestidosTable)
          .set({
            provaDataReal,
            ocupacaoInicio: ocupacao?.inicio ?? null,
            ocupacaoFim: ocupacao?.fim ?? null,
            updatedAt: new Date(),
          })
          .where(eq(bloqueioVestidosTable.id, bloqueio.id));
      }
    }
    return { atendimento };
    });
  } catch (err) {
    // G1: o mesmo 409 que o `PATCH /reservas` devolve para o mesmo estado — a
    // régua é uma, e a resposta também. O rollback já desfez a conclusão: o
    // atendimento segue como estava, sem a metade órfã.
    if (err instanceof ConflitoDaProvaError) {
      res.status(409).json({
        error: "VESTIDO_INDISPONIVEL",
        detalhe:
          "A data real desta prova cai em cima de outro compromisso deste vestido — confira a agenda da peça antes de concluir.",
        conflitos: err.conflitos,
      });
      return;
    }
    throw err;
  }
  if ("recusa" in atualizado && atualizado.recusa) {
    res.status(422).json({ error: atualizado.recusa.motivo, detalhe: atualizado.recusa.detalhe });
    return;
  }
  if ("sumiu" in atualizado) {
    res.status(404).json({ error: "ATENDIMENTO_NAO_ENCONTRADO", detalhe: "Este atendimento não existe nesta loja." });
    return;
  }

  const fullAtendimento = await db.query.atendimentosTable.findFirst({
    where: eq(atendimentosTable.id, atualizado.atendimento.id),
    with: ATENDIMENTO_WITH,
  });

  res.json(UpdateAtendimentoResponse.parse(atendimentoComDono(fullAtendimento)));
});

/**
 * E115 — o cancelamento da agenda era um delete cru: 204 mesmo sem apagar
 * nada, `ajustes.atendimento_id` em CASCADE levava a fila de costura junto, e
 * um CONCLUÍDO — que é O QUE ACONTECEU com a noiva (a razão do restrict do
 * E91/B2 na vendedora) — sumia da ficha sem rastro.
 */
router.delete("/lojas/:lojaId/atendimentos/:atendimentoId", async (req, res): Promise<void> => {
  const { lojaId, atendimentoId } = req.params as { lojaId: string; atendimentoId: string };
  const atendimento = await db.query.atendimentosTable.findFirst({
    where: and(eq(atendimentosTable.id, atendimentoId), eq(atendimentosTable.lojaId, lojaId)),
  });
  if (!atendimento) {
    res.status(404).json({ error: "ATENDIMENTO_NAO_ENCONTRADO", detalhe: "Este atendimento não existe nesta loja." });
    return;
  }
  if (atendimento.situacao === "CONCLUIDO") {
    res.status(409).json({
      error: "ATENDIMENTO_CONCLUIDO",
      detalhe: "Um atendimento concluído é a história da ficha da noiva — ele não se apaga.",
    });
    return;
  }
  const ajustes = await db
    .select({ id: ajustesTable.id })
    .from(ajustesTable)
    .where(eq(ajustesTable.atendimentoId, atendimentoId));
  if (ajustes.length > 0) {
    res.status(409).json({
      error: "ATENDIMENTO_COM_AJUSTES",
      detalhe: `Este atendimento tem ${ajustes.length} ajuste${ajustes.length === 1 ? "" : "s"} de costura que sumiriam junto — remova-os antes.`,
    });
    return;
  }
  await db.transaction(async (tx) => {
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "ATENDIMENTO_REMOVIDO",
      entidade: "atendimento",
      entidadeId: atendimentoId,
      detalhe: {
        leadId: atendimento.leadId,
        inicio: atendimento.inicio,
        tipo: atendimento.tipo,
        situacao: atendimento.situacao,
      },
    });
    await tx.delete(atendimentosTable).where(and(eq(atendimentosTable.id, atendimentoId), eq(atendimentosTable.lojaId, lojaId)));
  });
  res.status(204).send();
});

/**
 * E97/F6 — a loja registra que MANDOU mensagem. Carimba `contatadoEm`, do
 * relógio do servidor, idempotente.
 *
 * Esta rota se chamava `/confirmar` e escrevia em `confirmadoEm` — o MESMO
 * campo que `POST /portal/provas/:id/confirmar` usa quando a noiva clica. Os
 * dois fatos ficavam indistinguíveis depois de gravados: a linha sumia da fila
 * do dia e da contagem do sino tanto quando a recepção abriu o WhatsApp (sem
 * escrever nada ainda) quanto quando a noiva respondeu de verdade. E é sobre o
 * segundo que o ateliê toma decisão física.
 *
 * O carimbo continua acontecendo no clique, e continua sendo honesto — porque
 * agora ele afirma só o que aconteceu: a loja procurou.
 */
router.post("/lojas/:lojaId/atendimentos/:atendimentoId/contato", requireModulo("agenda", "editar"), async (req, res): Promise<void> => {
  const { lojaId, atendimentoId } = req.params;
  const existente = await db.query.atendimentosTable.findFirst({
    where: and(
      eq(atendimentosTable.id, atendimentoId as string),
      eq(atendimentosTable.lojaId, lojaId as string),
    ),
  });
  if (!existente) {
    res.status(404).json({ error: "ATENDIMENTO_NAO_ENCONTRADO", detalhe: "Este atendimento não existe nesta loja." });
    return;
  }
  if (!existente.contatadoEm) {
    await db.update(atendimentosTable)
      .set({ contatadoEm: new Date(), updatedAt: new Date() })
      .where(eq(atendimentosTable.id, atendimentoId as string));
  }
  const full = await db.query.atendimentosTable.findFirst({
    where: eq(atendimentosTable.id, atendimentoId as string),
    with: ATENDIMENTO_WITH,
  });
  res.json(RegistrarContatoAtendimentoResponse.parse(atendimentoComDono(full)));
});

/**
 * O desfazer. O carimbo nasce do clique num link que abre OUTRA ABA, então
 * errar o botão é barato — e sem esta rota a noiva saía da fila do dia sem
 * ninguém ter falado com ela, silenciosamente.
 *
 * Não toca `confirmadoEm`: desfazer o que a loja fez não pode apagar o que a
 * noiva respondeu.
 */
router.delete("/lojas/:lojaId/atendimentos/:atendimentoId/contato", async (req, res): Promise<void> => {
  const { lojaId, atendimentoId } = req.params;
  const [atualizado] = await db.update(atendimentosTable)
    .set({ contatadoEm: null, updatedAt: new Date() })
    .where(and(
      eq(atendimentosTable.id, atendimentoId as string),
      eq(atendimentosTable.lojaId, lojaId as string),
    ))
    .returning();
  if (!atualizado) {
    res.status(404).json({ error: "ATENDIMENTO_NAO_ENCONTRADO", detalhe: "Este atendimento não existe nesta loja." });
    return;
  }
  const full = await db.query.atendimentosTable.findFirst({
    where: eq(atendimentosTable.id, atendimentoId as string),
    with: ATENDIMENTO_WITH,
  });
  res.json(DesfazerContatoAtendimentoResponse.parse(atendimentoComDono(full)));
});

/**
 * Ausências (E151) — os dias em que alguém da equipe não atende.
 *
 * No papel é a primeira coisa que a página do caderno declara: 7 das 14
 * páginas anunciam quem está fora (*"Volta da Marilza 15 dias"*), e nas
 * semanas de férias a agenda esvazia. No sistema não existia nada — a agenda
 * sabia de cabine e de vendedora, e oferecia alegremente o dia inteiro de
 * quem estava viajando.
 */
router.get("/lojas/:lojaId/ausencias", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const query = ListAusenciasQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json(erroDeValidacao(query.error));
    return;
  }
  // `?desde=` é o recorte que a agenda usa: férias de 2024 não interessam a
  // quem marca amanhã, e a tabela só cresce.
  const filtros = [eq(ausenciasTable.lojaId, lojaId)];
  if (query.data.desde) filtros.push(gte(ausenciasTable.fim, query.data.desde));

  const linhas = await db
    .select({
      id: ausenciasTable.id,
      lojaId: ausenciasTable.lojaId,
      usuarioId: ausenciasTable.usuarioId,
      inicio: ausenciasTable.inicio,
      fim: ausenciasTable.fim,
      motivo: ausenciasTable.motivo,
      usuarioNome: usuariosTable.nome,
    })
    .from(ausenciasTable)
    .innerJoin(usuariosTable, eq(usuariosTable.id, ausenciasTable.usuarioId))
    .where(and(...filtros))
    .orderBy(ausenciasTable.inicio);

  res.json(ListAusenciasResponse.parse(linhas));
});

router.post("/lojas/:lojaId/ausencias", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateAusenciaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const { usuarioId, inicio, fim, motivo } = parsed.data;

  const dia = /^\d{4}-\d{2}-\d{2}$/;
  if (!dia.test(inicio) || !dia.test(fim)) {
    res.status(400).json({
      error: "DATA_INVALIDA",
      detalhe: "Informe os dias no formato AAAA-MM-DD.",
      campos: [{ campo: "inicio", motivo: "Formato esperado: AAAA-MM-DD" }],
    });
    return;
  }
  // Período invertido é erro de digitação, e passaria em silêncio: a ausência
  // existiria no banco sem cobrir dia nenhum, e ninguém entenderia por que a
  // agenda continua oferecendo a vendedora que está de férias.
  if (fim < inicio) {
    res.status(422).json({
      error: "PERIODO_INVERTIDO",
      detalhe: "O último dia da ausência é anterior ao primeiro.",
      campos: [{ campo: "fim", motivo: "O fim precisa ser igual ou depois do início" }],
    });
    return;
  }
  // A FK prova que a pessoa existe; `usuarios_lojas` é quem diz que ela é
  // DESTA loja (família E91 — `usuarios` é tabela global).
  if (!(await vendedoraNaLoja(usuarioId, lojaId))) {
    // S41: era 404 — a régua do E91 reserva 404 para o recurso da URL; id
    // inválido no CORPO é 422, como o guard do ajuste (:755) já respondia.
    res.status(422).json({
      error: "REFERENCIA_INVALIDA",
      detalhe: "Esta pessoa não é da equipe desta loja.",
      campos: [{ campo: "usuarioId", motivo: "Pessoa não encontrada nesta loja" }],
    });
    return;
  }

  const [ausencia] = await db.insert(ausenciasTable).values({
    id: randomUUID(),
    lojaId,
    usuarioId,
    inicio,
    fim,
    motivo: motivo ?? null,
  }).returning();

  const [usuario] = await db.select({ nome: usuariosTable.nome })
    .from(usuariosTable).where(eq(usuariosTable.id, usuarioId));

  res.status(201).json(CreateAusenciaResponse.parse({ ...ausencia, usuarioNome: usuario?.nome ?? null }));
});

router.delete("/lojas/:lojaId/ausencias/:ausenciaId", async (req, res): Promise<void> => {
  const { lojaId, ausenciaId } = req.params as { lojaId: string; ausenciaId: string };
  // Ausência apagada volta a liberar o dia — e é o caminho de quem digitou
  // errado ou de quem voltou antes. Não há histórico a preservar aqui: o que
  // ficou agendado no período nunca foi tocado (a ausência só impede o novo).
  await db.delete(ausenciasTable)
    .where(and(eq(ausenciasTable.id, ausenciaId), eq(ausenciasTable.lojaId, lojaId)));
  res.status(204).send();
});

// Ajustes
// Contexto relacional da fila da costureira: ajuste → atendimento →
// bloqueio → {noiva, vestido, casamentoData} + checklist ordenado.
const AJUSTE_WITH = {
  // Ver a nota do ATENDIMENTO_WITH: sem anotação de parâmetro (E104/A13).
  checklist: { orderBy: (t: any, { asc }: any) => [asc(t.ordem)] },
  // S-O56/E185: o mesmo `MAE_DO_BLOQUEIO` das cinco portas de atendimento, um
  // nível mais fundo — a fila da costureira chega ao bloqueio por
  // `ajuste → atendimento`.
  atendimento: { with: { lead: true, bloqueio: { with: { vestido: true, ...MAE_DO_BLOQUEIO } } } },
} as const;

/**
 * S-O111 — **`proximaProva` e `pecaDoAcervo` eram do `GET`, e o schema as
 * promete nas três portas.**
 *
 * As duas nascem de consulta PRÓPRIA, não do `with`: a próxima prova do mesmo
 * bloqueio e a peça de acervo que cita a confecção. Estavam escritas dentro do
 * `GET /ajustes`, então `POST /ajustes` e `PATCH /ajustes/:id` devolviam
 * `undefined` nos dois campos que o `Ajuste` declara — medido pela
 * `varredura-schemas-aninhados` do E192: a aresta `Ajuste.pecaDoAcervo` era
 * prometida em **3** portas e entregue em **1**.
 *
 * Quem cria um trabalho de costura pela tela recebe a resposta e desenha o card
 * com ela; sem o prazo, o card nasce sem a data que a costureira usa para se
 * organizar, e só a aparece depois de um F5.
 *
 * Extrair em vez de copiar (regra 26): a conta do prazo é a régua do E14, e uma
 * segunda escrita dela na porta de criação divergiria da da fila no primeiro
 * ajuste da regra.
 */
async function enriquecerAjustes<T extends { id: string; tipo: string; atendimento?: { bloqueioId?: string | null; inicio?: Date | null } | null }>(
  lojaId: string,
  ajustes: T[],
): Promise<(T & { proximaProva: Date | null; pecaDoAcervo: { id: string; codigo: string; nome: string } | null })[]> {
  const bloqueioIds = [
    ...new Set(ajustes.map((a) => a.atendimento?.bloqueioId).filter((b): b is string => !!b)),
  ];
  const provas = bloqueioIds.length
    ? await db
        .select({
          bloqueioId: atendimentosTable.bloqueioId,
          inicio: atendimentosTable.inicio,
        })
        .from(atendimentosTable)
        .where(and(
          eq(atendimentosTable.lojaId, lojaId),
          eq(atendimentosTable.tipo, "PROVA"),
          inArray(atendimentosTable.bloqueioId, bloqueioIds),
        ))
    : [];

  const confeccaoIds = ajustes.filter((a) => a.tipo === "CONFECCAO").map((a) => a.id);
  const pecas = confeccaoIds.length
    ? await db
        .select({
          id: vestidosTable.id,
          codigo: vestidosTable.codigo,
          nome: vestidosTable.nome,
          origemAjusteId: vestidosTable.origemAjusteId,
        })
        .from(vestidosTable)
        .where(and(
          eq(vestidosTable.lojaId, lojaId),
          inArray(vestidosTable.origemAjusteId, confeccaoIds),
        ))
    : [];
  const pecaPorAjuste = new Map(pecas.map(({ origemAjusteId, ...peca }) => [origemAjusteId!, peca]));

  return ajustes.map((a) => {
    const bloqueioId = a.atendimento?.bloqueioId;
    const aposEsta = a.atendimento?.inicio;
    const proxima = bloqueioId && aposEsta
      ? provas
          .filter((p) => p.bloqueioId === bloqueioId && p.inicio > aposEsta)
          .reduce<Date | null>((min, p) => (min === null || p.inicio < min ? p.inicio : min), null)
      : null;
    return { ...a, proximaProva: proxima, pecaDoAcervo: pecaPorAjuste.get(a.id) ?? null };
  });
}

router.get("/lojas/:lojaId/ajustes", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const ajustes = await db.query.ajustesTable.findMany({
    where: eq(ajustesTable.lojaId, lojaId),
    with: AJUSTE_WITH,
  });

  // O prazo real da costureira (E14) e a peça que a confecção virou (E156) —
  // as duas contas moram em `enriquecerAjustes`, porque as três portas as
  // prometem (S-O111).
  const comPrazo = await enriquecerAjustes(lojaId, ajustes);

  res.json(ListAjustesResponse.parse(comPrazo.map(ajusteComDono)));
});

router.post("/lojas/:lojaId/ajustes", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateAjusteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  
  const { atendimentoId, ...ajusteData } = parsed.data;

  // E115 — o POST /atendimentos deste arquivo prova lead/cabine/vendedora e o
  // checklist prova o pai; o ajuste não provava NADA: um `atendimentoId` da
  // loja B punha a ficha da noiva dela (nome, WhatsApp, vestido) na fila de
  // costura de A, e o conserto forjado aparecia no portal da noiva de B.
  if (!(await atendimentoNaLoja(atendimentoId, lojaId))) {
    res.status(422).json({ error: "REFERENCIA_INVALIDA", detalhe: "atendimento não é desta loja" });
    return;
  }

  const [ajuste] = await db.insert(ajustesTable).values({
    id: randomUUID(),
    lojaId,
    atendimentoId,
    ...ajusteData,
  }).returning();
  const fullAjuste = await db.query.ajustesTable.findFirst({
    where: eq(ajustesTable.id, ajuste.id),
    with: AJUSTE_WITH,
  });
  // S-O111: o prazo e a peça de acervo entram aqui também — o schema os promete
  // nas três portas, e quem cria pela tela desenha o card com esta resposta.
  const [comPrazo] = fullAjuste ? await enriquecerAjustes(lojaId, [fullAjuste]) : [];
  res.status(201).json(CreateAjusteResponse.parse(comPrazo && ajusteComDono(comPrazo)));
});

router.patch("/lojas/:lojaId/ajustes/:ajusteId", async (req, res): Promise<void> => {
  const { lojaId, ajusteId } = req.params;
  const parsed = UpdateAjusteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const [ajuste] = await db.update(ajustesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(ajustesTable.id, ajusteId as string), eq(ajustesTable.lojaId, lojaId as string)))
    .returning();
  if (!ajuste) {
    res.status(404).json({ error: "AJUSTE_NAO_ENCONTRADO", detalhe: "Este ajuste não existe nesta loja." });
    return;
  }
  const fullAjuste = await db.query.ajustesTable.findFirst({
    where: eq(ajustesTable.id, ajuste.id),
    with: AJUSTE_WITH,
  });
  const [comPrazo] = fullAjuste ? await enriquecerAjustes(lojaId as string, [fullAjuste]) : [];
  res.json(UpdateAjusteResponse.parse(comPrazo && ajusteComDono(comPrazo)));
});

/**
 * S-M16 — era um dos três deletes crus que sobraram fora da régua do E115.
 * O checklist desce por cascade (ele não existe fora do ajuste) e a peça que
 * a confecção virou fica (`origem_ajuste_id` set null — decisão escrita do
 * E156: perde-se a proveniência, não o acervo). O que NÃO pode sair calado é
 * o trabalho JÁ COBRADO: o item de orçamento que o cobra (E155) ficaria com
 * `ajuste_id` nulo em silêncio, e a noiva leria uma cobrança apontando um
 * trabalho que ninguém mais costura.
 */
router.delete("/lojas/:lojaId/ajustes/:ajusteId", async (req, res): Promise<void> => {
  const { lojaId, ajusteId } = req.params as { lojaId: string; ajusteId: string };
  const [ajuste] = await db.select().from(ajustesTable)
    .where(and(eq(ajustesTable.id, ajusteId), eq(ajustesTable.lojaId, lojaId)));
  if (!ajuste) {
    res.status(404).json({ error: "AJUSTE_NAO_ENCONTRADO", detalhe: "Este ajuste não existe nesta loja." });
    return;
  }
  const [cobrancas] = await db.select({ n: count() }).from(orcamentoItensTable)
    .where(eq(orcamentoItensTable.ajusteId, ajusteId));
  if (cobrancas!.n > 0) {
    res.status(409).json({
      error: "AJUSTE_COBRADO",
      detalhe: "Este trabalho já foi cobrado num orçamento — remova o item de lá antes, ou o valor cobrado ficaria apontando o nada.",
    });
    return;
  }
  // S-M22 (rodada 2, achado 11#2): a contagem de cobranças rodava no POOL — o
  // item de orçamento que cobrasse este ajuste na janela ficava órfão (a FK é
  // set null DE PROPÓSITO, E155), o exato estado que o 409 diz impedir.
  // `FOR UPDATE` na linha do ajuste + recontagem dentro da transação.
  const resultado = await db.transaction(async (tx) => {
    await tx.select({ id: ajustesTable.id }).from(ajustesTable)
      .where(eq(ajustesTable.id, ajusteId))
      .for("update");
    const [cobrancasAgora] = await tx.select({ n: count() }).from(orcamentoItensTable)
      .where(eq(orcamentoItensTable.ajusteId, ajusteId));
    if (cobrancasAgora!.n > 0) return { corrida: true as const };
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "AJUSTE_REMOVIDO",
      entidade: "ajuste",
      entidadeId: ajusteId,
      detalhe: { descricao: ajuste.descricao, tipo: ajuste.tipo, status: ajuste.status, custo: ajuste.custo },
    });
    await tx.delete(ajustesTable).where(and(eq(ajustesTable.id, ajusteId), eq(ajustesTable.lojaId, lojaId)));
    return { ok: true as const };
  });
  if ("corrida" in resultado) {
    res.status(409).json({
      error: "AJUSTE_COBRADO",
      detalhe: "Este trabalho acabou de ser cobrado num orçamento — remova o item de lá antes.",
    });
    return;
  }
  res.status(204).send();
});

// Checklist de costura (sub-recurso do ajuste). A tabela não tem lojaId —
// o escopo de loja vem sempre do ajuste pai.
router.post("/lojas/:lojaId/ajustes/:ajusteId/checklist", async (req, res): Promise<void> => {
  const { lojaId, ajusteId } = req.params;
  const parsed = AddChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const ajuste = await db.query.ajustesTable.findFirst({
    where: and(eq(ajustesTable.id, ajusteId as string), eq(ajustesTable.lojaId, lojaId as string)),
  });
  if (!ajuste) {
    res.status(404).json({ error: "AJUSTE_NAO_ENCONTRADO", detalhe: "Este ajuste não existe nesta loja." });
    return;
  }

  let ordem = parsed.data.ordem;
  if (ordem === undefined) {
    const [{ maxOrdem }] = await db
      .select({ maxOrdem: max(ajusteChecklistItensTable.ordem) })
      .from(ajusteChecklistItensTable)
      .where(eq(ajusteChecklistItensTable.ajusteId, ajuste.id));
    ordem = (maxOrdem ?? -1) + 1;
  }

  const [item] = await db.insert(ajusteChecklistItensTable).values({
    id: randomUUID(),
    ajusteId: ajuste.id,
    descricao: parsed.data.descricao,
    ordem,
  }).returning();

  res.status(201).json(AddChecklistItemResponse.parse(item));
});

/** Carrega o item confirmando que o ajuste pai pertence à loja da URL. */
async function itemChecklistDaLoja(itemId: string, lojaId: string) {
  const item = await db.query.ajusteChecklistItensTable.findFirst({
    where: eq(ajusteChecklistItensTable.id, itemId),
    with: { ajuste: true },
  });
  if (!item || item.ajuste.lojaId !== lojaId) return null;
  return item;
}

router.patch("/lojas/:lojaId/ajustes/checklist/:itemId", async (req, res): Promise<void> => {
  const { lojaId, itemId } = req.params;
  const parsed = UpdateChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const existente = await itemChecklistDaLoja(itemId as string, lojaId as string);
  if (!existente) {
    res.status(404).json({ error: "ITEM_NAO_ENCONTRADO", detalhe: "Este item não existe nesta loja." });
    return;
  }

  const [item] = await db.update(ajusteChecklistItensTable)
    .set(parsed.data)
    .where(eq(ajusteChecklistItensTable.id, existente.id))
    .returning();

  res.json(UpdateChecklistItemResponse.parse(item));
});

router.delete("/lojas/:lojaId/ajustes/checklist/:itemId", async (req, res): Promise<void> => {
  const { lojaId, itemId } = req.params;
  const existente = await itemChecklistDaLoja(itemId as string, lojaId as string);
  if (!existente) {
    res.status(404).json({ error: "ITEM_NAO_ENCONTRADO", detalhe: "Este item não existe nesta loja." });
    return;
  }
  await db.delete(ajusteChecklistItensTable).where(eq(ajusteChecklistItensTable.id, existente.id));
  res.status(204).send();
});

// Disponibilidade (Regras)
router.get("/lojas/:lojaId/disponibilidade/regras", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const regra = await db.query.regraDisponibilidadeTable.findFirst({
    where: eq(regraDisponibilidadeTable.lojaId, lojaId),
  });
  if (!regra) {
    res.status(404).json({ error: "REGRA_NAO_ENCONTRADA", detalhe: "Esta regra não existe nesta loja." });
    return;
  }
  res.json(GetDisponibilidadeResponse.parse(regra));
});

router.put("/lojas/:lojaId/disponibilidade/regras", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = SetDisponibilidadeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  /**
   * **S-C221 — o expediente da cláusula 4ª exige `contratos.editar`, e o resto
   * da regra continua sendo da agenda** (decisão da dona, 14/08/2026:
   * restringir — quem muda o expediente de retirada muda o que o contrato
   * PROMETE, porque é contra ele que o `POST`/`PATCH` de contrato recusam data
   * desde o E222).
   *
   * Medido antes: o prefixo (`:262`, `requireModulo("agenda")`) deriva
   * `editar` do PUT, e a **Costureira** do seed (`agenda: TUDO,
   * contratos: NADA` — `configuracao-inicial.ts:159`) e a **Recepção**
   * (`:153`, o mesmo par) gravavam os quatro campos da 4ª. A sobra citava só a
   * Costureira; a Recepção passava pela mesma porta.
   *
   * O fecho é pela PERMISSÃO, não por perfil: a mesma pergunta do middleware
   * (`getPermissoes` + `podeNoModulo`), feita aqui porque o gate por prefixo
   * não tem grão de CAMPO — e mover o PUT inteiro para `contratos` tiraria da
   * Recepção o expediente de ATENDIMENTO, que é trabalho dela. Nenhuma
   * migração de perfil: os perfis ficam como estão, a porta é que passa a
   * perguntar a coisa certa. Recusa ANTES de validar/gravar qualquer campo:
   * corpo misto não grava a metade da agenda e cala a outra.
   */
  const CAMPOS_DA_CLAUSULA_4A = [
    "retiradaAberturaMinutos",
    "retiradaFechamentoMinutos",
    "retiradaFechamentoSabadoMinutos",
    "retiradaDias",
  ] as const;
  const mexeNaClausula4a = CAMPOS_DA_CLAUSULA_4A.some((c) => parsed.data[c] !== undefined);
  if (mexeNaClausula4a && !req.usuario!.isSuperAdmin) {
    const permissoes = await getPermissoes(req.usuario!.id, lojaId, false);
    if (!permissoes || !podeNoModulo(permissoes, "contratos", "editar")) {
      res.status(403).json({
        error: "ACESSO_NEGADO_MODULO",
        modulo: "contratos",
        acao: "editar",
        detalhe:
          "O expediente de retirada e devolução é a cláusula 4ª do contrato de locação — " +
          "mudá-lo muda o que o contrato aceita, e isso pede permissão de editar contratos.",
      });
      return;
    }
  }

  /**
   * G12 (E168) — a ordem e a faixa do expediente eram conferidas SÓ no
   * formulário (`atendimentos/config.tsx:231`), e este PUT aceitava qualquer
   * par.
   *
   * Com abertura 9 e fechamento 5, `slotsDoDia` devolve `[]` — o guarda é
   * `if (!(fechamentoHora > aberturaHora)) return []` (`agenda-core/slots.ts:54`)
   * — e a grade do dia nasce SEM NENHUMA linha; `dentroDoFuncionamento` recusa
   * todo instante, então o POST responde 422 FORA_DO_HORARIO para as 24 horas
   * do dia. **A loja inteira para de agendar e nenhuma tela diz por quê**: a
   * grade fica vazia como um dia sem atendimento, e o erro do agendamento fala
   * de "fora do expediente" sem dizer qual expediente.
   *
   * A conferência é sobre o valor EFETIVO, não sobre o corpo: este é um upsert
   * parcial, e mandar só `atendimentoFechamentoHora: 5` sobre uma regra que
   * abre às 9 produz exatamente o mesmo estado — por isso o par é montado
   * contra a regra que já está gravada (ou contra os defaults do schema, via
   * `EXPEDIENTE_PADRAO`, quando ainda não há linha).
   */
  const [atual] = await db
    .select()
    .from(regraDisponibilidadeTable)
    .where(eq(regraDisponibilidadeTable.lojaId, lojaId));
  const efetivo = expedienteDaRegra(atual);
  const abertura = parsed.data.atendimentoAberturaHora ?? efetivo.aberturaHora;
  const fechamento = parsed.data.atendimentoFechamentoHora ?? efetivo.fechamentoHora;
  const foraDaFaixa =
    !Number.isInteger(abertura) ||
    !Number.isInteger(fechamento) ||
    abertura < 0 ||
    abertura > 23 ||
    fechamento < 1 ||
    fechamento > 24;
  if (foraDaFaixa || abertura >= fechamento) {
    res.status(422).json({
      error: "HORARIO_INVALIDO",
      detalhe: foraDaFaixa
        ? `O horário de atendimento vai de 0h a 24h — ${abertura}h às ${fechamento}h está fora dessa faixa.`
        : `A loja abriria às ${abertura}h e fecharia às ${fechamento}h: sem nenhum horário entre os dois, a agenda ficaria fechada o dia inteiro.`,
      campos: [
        {
          campo: "atendimentoFechamentoHora",
          motivo: "O fechamento tem de ser depois da abertura, dentro de 0h–24h",
        },
      ],
    });
    return;
  }
  /**
   * G12 — e a semana sem NENHUM dia é a mesma parede pelo outro eixo: com
   * `diasFuncionamento: []`, `recusaDeMover` devolve LOJA_FECHADA para os sete
   * dias (`agenda-core/mover.ts:153`) e a loja não agenda nunca mais. O
   * formulário já recusa (`config.tsx:239`); o servidor passa a recusar também.
   */
  if (parsed.data.diasFuncionamento && parsed.data.diasFuncionamento.length === 0) {
    res.status(422).json({
      error: "SEM_DIA_DE_FUNCIONAMENTO",
      detalhe: "Sem nenhum dia aberto, a agenda fica fechada a semana inteira — escolha ao menos um.",
      campos: [{ campo: "diasFuncionamento", motivo: "Escolha ao menos um dia da semana" }],
    });
    return;
  }

  /**
   * **E222 — as mesmas duas paredes, agora no expediente de RETIRADA.**
   *
   * A conferência é sobre o valor EFETIVO e não sobre o corpo, pela razão que o
   * bloco de cima já paga: este é um upsert parcial, e mandar só o fechamento
   * sobre uma regra que já tem abertura produz o mesmo estado que mandar os
   * dois. Sem isso, o expediente de retirada podia ser salvo invertido — e aí
   * `foraDoExpedienteDeRetirada` recusaria as 24 horas do dia, com o contrato
   * inteiro travado e nenhuma tela dizendo por quê.
   */
  const retiradaEfetiva = expedienteDeRetirada(atual);
  const rAbertura = parsed.data.retiradaAberturaMinutos ?? retiradaEfetiva.aberturaMinutos;
  const rFechamento = parsed.data.retiradaFechamentoMinutos ?? retiradaEfetiva.fechamentoMinutos;
  const rSabado = parsed.data.retiradaFechamentoSabadoMinutos ?? retiradaEfetiva.fechamentoSabadoMinutos;
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  if (rAbertura >= rFechamento || rAbertura >= rSabado) {
    res.status(422).json({
      error: "HORARIO_DE_RETIRADA_INVALIDO",
      detalhe:
        `A loja retiraria a partir das ${hhmm(rAbertura)} e fecharia às ${hhmm(rFechamento)} ` +
        `(${hhmm(rSabado)} no sábado): sem nenhum horário entre os dois, nenhuma retirada seria aceita.`,
      campos: [
        {
          campo: "retiradaFechamentoMinutos",
          motivo: "O fechamento tem de ser depois da abertura, no sábado também",
        },
      ],
    });
    return;
  }
  if (parsed.data.retiradaDias && parsed.data.retiradaDias.length === 0) {
    res.status(422).json({
      error: "SEM_DIA_DE_RETIRADA",
      detalhe:
        "Sem nenhum dia de retirada, nenhuma data de retirada ou devolução seria aceita — escolha ao menos um.",
      campos: [{ campo: "retiradaDias", motivo: "Escolha ao menos um dia da semana" }],
    });
    return;
  }

  const [regra] = await db.insert(regraDisponibilidadeTable)
    .values({
      id: randomUUID(),
      lojaId,
      ...parsed.data,
    })
    .onConflictDoUpdate({
      target: regraDisponibilidadeTable.lojaId,
      set: parsed.data,
    })
    .returning();

  // S-C89: `usoDiasDepois` é a janela de uso que a fila de atrasos usa para
  // contar os dias — mudar a regra muda a fila inteira da loja.
  derrubarFilaDeAtrasos(lojaId);
  res.json(SetDisponibilidadeResponse.parse(regra));
});

export default router;
