import { Router, type IRouter } from "express";
import { db, cabinesTable, atendimentosTable, ajustesTable, ajusteChecklistItensTable, regraDisponibilidadeTable } from "@workspace/db";
import { eq, and, max, inArray } from "drizzle-orm";
import { leadNaLoja, cabineNaLoja, vendedoraNaLoja } from "../lib/escopo-loja";
import {
  ListCabinesResponse,
  CreateCabineBody,
  CreateCabineResponse,
  UpdateCabineParams,
  UpdateCabineBody,
  UpdateCabineResponse,
  DeleteCabineParams,
  ListAtendimentosResponse,
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
  SetDisponibilidadeResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import {
  recusaDeMover,
  DETALHE_RECUSA,
  EXPEDIENTE_PADRAO,
  type MotivoRecusa,
} from "@workspace/agenda-core";
import { randomUUID } from "node:crypto";

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
  existente: { id: string; cabineId: string; vendedoraId: string; inicio: Date },
  mudanca: { cabineId?: string; vendedoraId?: string; inicio?: Date },
): Promise<MotivoRecusa | null> {
  const regra = await db.query.regraDisponibilidadeTable.findFirst({
    where: eq(regraDisponibilidadeTable.lojaId, lojaId),
  });
  const expediente = regra
    ? {
        aberturaHora: regra.atendimentoAberturaHora,
        fechamentoHora: regra.atendimentoFechamentoHora,
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
  };

  // Só quem disputa exatamente aquele instante concorre — é o que as UNIQUE
  // enxergam, e carregar o dia inteiro para comparar seria desperdício.
  const concorrentes = await db
    .select({
      id: atendimentosTable.id,
      cabineId: atendimentosTable.cabineId,
      vendedoraId: atendimentosTable.vendedoraId,
      inicio: atendimentosTable.inicio,
    })
    .from(atendimentosTable)
    .where(and(eq(atendimentosTable.lojaId, lojaId), eq(atendimentosTable.inicio, destino.inicio)));

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
    with: { checklist: { orderBy: (t: typeof ajusteChecklistItensTable, { asc }: any) => [asc(t.ordem)] } },
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
    res.status(400).json({ error: parsed.error.message });
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
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCabineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [cabine] = await db.update(cabinesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(cabinesTable.id, params.data.cabineId), eq(cabinesTable.lojaId, params.data.lojaId)))
    .returning();
  if (!cabine) {
    res.status(404).json({ error: "Cabine not found" });
    return;
  }
  res.json(UpdateCabineResponse.parse(cabine));
});

router.delete("/lojas/:lojaId/cabines/:cabineId", async (req, res): Promise<void> => {
  const params = DeleteCabineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(cabinesTable).where(and(eq(cabinesTable.id, params.data.cabineId), eq(cabinesTable.lojaId, params.data.lojaId)));
  res.status(204).send();
});

// Atendimentos
router.get("/lojas/:lojaId/atendimentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const atendimentos = await db.query.atendimentosTable.findMany({
    where: eq(atendimentosTable.lojaId, lojaId),
    with: ATENDIMENTO_WITH,
    orderBy: atendimentosTable.inicio,
  });
  res.json(ListAtendimentosResponse.parse(atendimentos));
});

router.post("/lojas/:lojaId/atendimentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateAtendimentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // As FKs vêm do corpo: garantir que lead, cabine e vendedora são DESTA loja,
  // senão o atendimento nasce referenciando outra (vazamento de tenant).
  const [okLead, okCabine, okVend] = await Promise.all([
    leadNaLoja(parsed.data.leadId, lojaId),
    cabineNaLoja(parsed.data.cabineId, lojaId),
    vendedoraNaLoja(parsed.data.vendedoraId, lojaId),
  ]);
  if (!okLead || !okCabine || !okVend) {
    res.status(404).json({ error: "REFERENCIA_INVALIDA", detalhe: "lead, cabine ou vendedora não são desta loja" });
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
    res.status(400).json({ error: parsed.error.message });
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
    res.status(404).json({ error: "Atendimento not found" });
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

  const [atendimento] = await db.update(atendimentosTable)
    .set({ ...parsed.data, ...carimbo, updatedAt: new Date() })
    .where(and(eq(atendimentosTable.id, atendimentoId as string), eq(atendimentosTable.lojaId, lojaId as string)))
    .returning();
    
  if (!atendimento) {
    res.status(404).json({ error: "Atendimento not found" });
    return;
  }
  
  const fullAtendimento = await db.query.atendimentosTable.findFirst({
    where: eq(atendimentosTable.id, atendimento.id),
    with: ATENDIMENTO_WITH,
  });

  res.json(UpdateAtendimentoResponse.parse(fullAtendimento));
});

router.delete("/lojas/:lojaId/atendimentos/:atendimentoId", async (req, res): Promise<void> => {
  const { lojaId, atendimentoId } = req.params;
  await db.delete(atendimentosTable).where(and(eq(atendimentosTable.id, atendimentoId as string), eq(atendimentosTable.lojaId, lojaId as string)));
  res.status(204).send();
});

// Ajustes
// Contexto relacional da fila da costureira: ajuste → atendimento →
// bloqueio → {noiva, vestido, casamentoData} + checklist ordenado.
const AJUSTE_WITH = {
  checklist: { orderBy: (t: typeof ajusteChecklistItensTable, { asc }: any) => [asc(t.ordem)] },
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
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const { atendimentoId, ...ajusteData } = parsed.data;

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
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [ajuste] = await db.update(ajustesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(ajustesTable.id, ajusteId as string), eq(ajustesTable.lojaId, lojaId as string)))
    .returning();
  if (!ajuste) {
    res.status(404).json({ error: "Ajuste not found" });
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
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const ajuste = await db.query.ajustesTable.findFirst({
    where: and(eq(ajustesTable.id, ajusteId as string), eq(ajustesTable.lojaId, lojaId as string)),
  });
  if (!ajuste) {
    res.status(404).json({ error: "Ajuste not found" });
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
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existente = await itemChecklistDaLoja(itemId as string, lojaId as string);
  if (!existente) {
    res.status(404).json({ error: "Item not found" });
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
    res.status(404).json({ error: "Item not found" });
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
    res.status(404).json({ error: "Regra not found" });
    return;
  }
  res.json(GetDisponibilidadeResponse.parse(regra));
});

router.put("/lojas/:lojaId/disponibilidade/regras", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = SetDisponibilidadeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
