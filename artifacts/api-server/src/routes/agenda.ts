import { Router, type IRouter } from "express";
import { db, cabinesTable, atendimentosTable, ajustesTable, ajusteChecklistItensTable, regraDisponibilidadeTable, bloqueioVestidosTable } from "@workspace/db";
import { registrarAuditoria } from "../lib/auditoria";
import { eq, and, max, inArray, gte, lt, lte } from "drizzle-orm";
import { leadNaLoja, cabineNaLoja, vendedoraNaLoja, atendimentoNaLoja, bloqueioNaLoja } from "../lib/escopo-loja";
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
  DesfazerContatoAtendimentoResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import {
  recusaDeMover,
  DETALHE_RECUSA,
  EXPEDIENTE_PADRAO,
  type MotivoRecusa,
} from "@workspace/agenda-core";
import { addDias, inicioDoDia } from "../lib/disponibilidade";
import { randomUUID } from "node:crypto";
import { erroDeValidacao } from "../lib/erros";

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
async function recusaDeMoverAtendimento(
  lojaId: string,
  existente: { id: string; cabineId: string; vendedoraId: string; inicio: Date; tipo: "ATENDIMENTO" | "PROVA" },
  mudanca: { cabineId?: string; vendedoraId?: string; inicio?: Date },
): Promise<MotivoRecusa | null> {
  const regra = await db.query.regraDisponibilidadeTable.findFirst({
    where: eq(regraDisponibilidadeTable.lojaId, lojaId),
  });
  const expediente = regra
    ? {
        aberturaHora: regra.atendimentoAberturaHora,
        fechamentoHora: regra.atendimentoFechamentoHora,
        dias: regra.diasFuncionamento,
        provaDuracao: regra.provaDuracao,
      }
    : EXPEDIENTE_PADRAO;

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
  const janelaMs = Math.max(1, regra?.provaDuracao ?? 1) * 30 * 60_000;
  const destinoMs = new Date(destino.inicio).getTime();
  const concorrentes = await db
    .select({
      id: atendimentosTable.id,
      cabineId: atendimentosTable.cabineId,
      vendedoraId: atendimentosTable.vendedoraId,
      inicio: atendimentosTable.inicio,
      tipo: atendimentosTable.tipo,
    })
    .from(atendimentosTable)
    .where(and(
      eq(atendimentosTable.lojaId, lojaId),
      gte(atendimentosTable.inicio, new Date(destinoMs - janelaMs)),
      lte(atendimentosTable.inicio, new Date(destinoMs + janelaMs)),
    ));

  return recusaDeMover(movida, destino, concorrentes, expediente);
}

// Joins padrão dos atendimentos: as telas de fila/agenda/provas precisam de
// noiva, cabine, vendedora e — nas provas — vestido via bloqueio + ajustes
// com checklist. Os schemas de resposta expõem essas relações.
const ATENDIMENTO_WITH = {
  lead: true,
  cabine: true,
  vendedora: true,
  bloqueio: { with: { vestido: true } },
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

router.delete("/lojas/:lojaId/cabines/:cabineId", async (req, res): Promise<void> => {
  const params = DeleteCabineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(erroDeValidacao(params.error));
    return;
  }
  await db.delete(cabinesTable).where(and(eq(cabinesTable.id, params.data.cabineId), eq(cabinesTable.lojaId, params.data.lojaId)));
  res.status(204).send();
});

// Atendimentos
router.get("/lojas/:lojaId/atendimentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  // E79: recortes opcionais — a ficha da reserva pede as provas do bloqueio,
  // a tela de provas pede só PROVA; ninguém baixa a agenda inteira para filtrar.
  // E83: janela de/ate sobre `inicio` (dia local, inclusivo) — o poll do sino
  // e as telas do dia pedem a janela, não a história.
  const query = ListAtendimentosQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "FILTRO_INVALIDO" });
    return;
  }
  // E125: recorte por noiva — a ficha pergunta pela próxima prova DELA e não
  // tem por que baixar a agenda da loja inteira (a classe do E62).
  const { leadId, bloqueioId, tipo, de, ate } = query.data;
  if (de && ate && de > ate) {
    res.status(400).json({ error: "INTERVALO_INVALIDO", detalhe: "'de' não pode ser depois de 'ate'" });
    return;
  }
  const atendimentos = await db.query.atendimentosTable.findMany({
    where: and(
      eq(atendimentosTable.lojaId, lojaId),
      ...(leadId ? [eq(atendimentosTable.leadId, leadId)] : []),
      ...(bloqueioId ? [eq(atendimentosTable.bloqueioId, bloqueioId)] : []),
      ...(tipo ? [eq(atendimentosTable.tipo, tipo)] : []),
      ...(de ? [gte(atendimentosTable.inicio, inicioDoDia(de))] : []),
      ...(ate ? [lt(atendimentosTable.inicio, inicioDoDia(addDias(ate, 1)))] : []),
    ),
    with: ATENDIMENTO_WITH,
    orderBy: atendimentosTable.inicio,
  });
  res.json(ListAtendimentosResponse.parse(atendimentos));
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
    res.status(404).json({ error: "REFERENCIA_INVALIDA", detalhe: "lead, cabine, vendedora ou bloqueio não são desta loja" });
    return;
  }

  // E115 — a criação só barrava o DIA fechado (E38), enquanto o reagendamento
  // roda as QUATRO recusas do agenda-core: uma prova às 17h30 ocupava a cabine
  // até 19h e o POST às 18h respondia 201 no mesmo lugar de onde o arrastar
  // levava 422 CABINE_OCUPADA; e o POST às 22h criava um atendimento sem
  // célula na grade — nascia invisível. A régua é a MESMA função do PATCH,
  // com o atendimento novo no papel de "movido para onde quer nascer".
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
  );
  if (recusa) {
    res.status(422).json({ error: recusa, detalhe: DETALHE_RECUSA[recusa] });
    return;
  }

  const [atendimento] = await db.insert(atendimentosTable).values({
    id: randomUUID(),
    lojaId,
    ...parsed.data,
  }).returning();
  
  const fullAtendimento = await db.query.atendimentosTable.findFirst({
    where: eq(atendimentosTable.id, atendimento.id),
    with: ATENDIMENTO_WITH,
  });

  res.status(201).json(CreateAtendimentoResponse.parse(fullAtendimento));
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
    res.status(404).json({ error: "REFERENCIA_INVALIDA", detalhe: "cabine ou vendedora não são desta loja" });
    return;
  }

  // Só vale checar movimento quando algo do movimento mudou.
  if (parsed.data.inicio !== undefined || parsed.data.cabineId !== undefined) {
    const recusa = await recusaDeMoverAtendimento(lojaId as string, existente, parsed.data);
    if (recusa) {
      res.status(422).json({ error: recusa, detalhe: DETALHE_RECUSA[recusa] });
      return;
    }
  }

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

  const [atendimento] = await db.update(atendimentosTable)
    .set({ ...parsed.data, ...carimbo, ...limpeza, updatedAt: new Date() })
    .where(and(eq(atendimentosTable.id, atendimentoId as string), eq(atendimentosTable.lojaId, lojaId as string)))
    .returning();
    
  if (!atendimento) {
    res.status(404).json({ error: "ATENDIMENTO_NAO_ENCONTRADO", detalhe: "Este atendimento não existe nesta loja." });
    return;
  }

  // E37: concluir uma PROVA carimba a data real no bloqueio, fechando o loop
  // agenda↔disponibilidade — a janela de prova (disponibilidade.ts) colapsa
  // para o dia em que a prova de fato aconteceu. Antes só a edição manual da
  // reserva fazia isso; a conclusão do atendimento é a fonte da verdade.
  // Usa o início real (E36); cai no horário marcado se a prova foi concluída
  // sem passar por "iniciar". Colapsar a janela só reduz ocupação — nunca cria
  // conflito, então não precisa revalidar disponibilidade.
  if (parsed.data.situacao === "CONCLUIDO" && existente.tipo === "PROVA" && existente.bloqueioId) {
    await db.update(bloqueioVestidosTable)
      .set({ provaDataReal: atendimento.atendidoEm ?? atendimento.inicio, updatedAt: new Date() })
      .where(and(
        eq(bloqueioVestidosTable.id, existente.bloqueioId),
        eq(bloqueioVestidosTable.lojaId, lojaId as string),
      ));
  }

  const fullAtendimento = await db.query.atendimentosTable.findFirst({
    where: eq(atendimentosTable.id, atendimento.id),
    with: ATENDIMENTO_WITH,
  });

  res.json(UpdateAtendimentoResponse.parse(fullAtendimento));
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
  res.json(RegistrarContatoAtendimentoResponse.parse(full));
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
  res.json(DesfazerContatoAtendimentoResponse.parse(full));
});

// Ajustes
// Contexto relacional da fila da costureira: ajuste → atendimento →
// bloqueio → {noiva, vestido, casamentoData} + checklist ordenado.
const AJUSTE_WITH = {
  // Ver a nota do ATENDIMENTO_WITH: sem anotação de parâmetro (E104/A13).
  checklist: { orderBy: (t: any, { asc }: any) => [asc(t.ordem)] },
  atendimento: { with: { lead: true, bloqueio: { with: { vestido: true } } } },
} as const;

router.get("/lojas/:lojaId/ajustes", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const ajustes = await db.query.ajustesTable.findMany({
    where: eq(ajustesTable.lojaId, lojaId),
    with: AJUSTE_WITH,
  });

  // O prazo real da costureira (E14): a PRÓXIMA prova do mesmo bloqueio depois
  // da prova que criou o ajuste. Uma query pelas provas dos bloqueios em cena —
  // não a agenda inteira — e o pareamento em memória.
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

  const comPrazo = ajustes.map((a) => {
    const bloqueioId = a.atendimento?.bloqueioId;
    const aposEsta = a.atendimento?.inicio;
    const proxima = bloqueioId && aposEsta
      ? provas
          .filter((p) => p.bloqueioId === bloqueioId && p.inicio > aposEsta)
          .reduce<Date | null>((min, p) => (min === null || p.inicio < min ? p.inicio : min), null)
      : null;
    return { ...a, proximaProva: proxima };
  });

  res.json(ListAjustesResponse.parse(comPrazo));
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
  res.status(201).json(CreateAjusteResponse.parse(fullAjuste));
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
  res.json(UpdateAjusteResponse.parse(fullAjuste));
});

router.delete("/lojas/:lojaId/ajustes/:ajusteId", async (req, res): Promise<void> => {
  const { lojaId, ajusteId } = req.params;
  await db.delete(ajustesTable).where(and(eq(ajustesTable.id, ajusteId as string), eq(ajustesTable.lojaId, lojaId as string)));
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

  res.json(SetDisponibilidadeResponse.parse(regra));
});

export default router;
