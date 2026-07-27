import { Router, type IRouter } from "express";
import { db, orcamentosTable, orcamentoItensTable, leadsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListOrcamentosResponse,
  ListOrcamentosQueryParams,
  CreateOrcamentoBody,
  CreateOrcamentoResponse,
  GetOrcamentoResponse,
  UpdateOrcamentoBody,
  UpdateOrcamentoResponse,
  DeleteOrcamentoResponse,
  AddOrcamentoItemBody,
  AddOrcamentoItemResponse,
  UpdateOrcamentoItemBody,
  UpdateOrcamentoItemResponse,
  RemoveOrcamentoItemResponse,
  CriarLinkOrcamentoResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { leadNaLoja } from "../lib/escopo-loja";
import { randomUUID, createHash } from "node:crypto";
import { orcamentoVersoesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { gerarTokenConvite, CONVITE_TTL_MS } from "../lib/auth";
import { avancarEtapaLead, transicaoOrcamentoValida } from "../lib/estados";
import {
  addDias,
  ancoraDeNegocio,
  brutoEmCentavos,
  hojeLocal,
  liquidoEmCentavos,
  reais,
} from "@workspace/financeiro-core";
import { erroDeValidacao } from "../lib/erros";

const router: IRouter = Router();

/** Avança o lead para ORCAMENTO_ABERTO (só se for à frente no funil). */
async function marcarOrcamentoAberto(lojaId: string, leadId: string): Promise<void> {
  const lead = await db.query.leadsTable.findFirst({
    where: and(eq(leadsTable.id, leadId), eq(leadsTable.lojaId, lojaId)),
  });
  if (!lead) return;
  const nova = avancarEtapaLead(lead.etapa, "ORCAMENTO_ABERTO");
  if (nova === lead.etapa) return;
  await db.update(leadsTable)
    .set({ etapa: nova, orcamentoAbertoEm: lead.orcamentoAbertoEm ?? new Date(), updatedAt: new Date() })
    .where(eq(leadsTable.id, lead.id));
}

/**
 * F18/E95: quantos dias um orçamento vale quando ninguém disse.
 *
 * Trinta é o ciclo do resto do sistema (competência, folha, carnê) e o prazo
 * comercial usual. Decidido pelo dono em 2026-07-27; virar configuração por
 * loja é épico próprio, não uma coluna nova enfiada aqui.
 */
const VALIDADE_PADRAO_DIAS = 30;

/** Aceita o `db` global ou a transação em curso — mesmo idioma do E56/E94. */
type Cliente = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * E75: marcar ENVIADO congela uma versão — itens, desconto e totais, com hash
 * sha256 do conteúdo canônico. É a esta versão que o link público e o aceite
 * da noiva (E74) apontam; a edição posterior não muda o que ela viu.
 *
 * B11/E95: roda na MESMA transação que marca ENVIADO. Antes eram duas
 * escritas soltas, e entre elas cabia uma falha: o orçamento ficava ENVIADO
 * sem versão congelada, e o portal caía no ramo de fallback que mostra o
 * conteúdo VIVO — a noiva via o rascunho de agora em vez do que lhe foi
 * enviado, em silêncio, e o aceite dela congelaria outra coisa.
 */
async function criarVersaoEnviada(tx: Cliente, lojaId: string, orcamentoId: string): Promise<void> {
  const orcamento = await tx.query.orcamentosTable.findFirst({
    where: and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)),
    with: { itens: true },
  });
  if (!orcamento) return;

  const itens = orcamento.itens
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((it) => ({
      tipo: it.tipo,
      descricao: it.descricao,
      valorUnitario: it.valorUnitario,
      quantidade: it.quantidade,
    }));
  // E95/C1: a MESMA régua que o `POST /contratos` usa para validar. O que se
  // congela aqui é o número que a noiva aceita e que o contrato terá de bater.
  const totalBruto = reais(brutoEmCentavos(itens));
  const totalLiquido = reais(
    liquidoEmCentavos(brutoEmCentavos(itens), orcamento.descontoTipo, orcamento.descontoValor),
  );

  const conteudo = {
    itens,
    descontoTipo: orcamento.descontoTipo,
    descontoValor: orcamento.descontoValor,
    totalBruto,
    totalLiquido,
  };
  const hash = createHash("sha256").update(JSON.stringify(conteudo)).digest("hex");

  const [{ maior }] = await tx
    .select({ maior: sql<number>`coalesce(max(${orcamentoVersoesTable.numero}), 0)`.mapWith(Number) })
    .from(orcamentoVersoesTable)
    .where(eq(orcamentoVersoesTable.orcamentoId, orcamentoId));

  // O `numero` é derivado dentro da transação, e o índice único
  // (orcamentoId, numero) é a rede embaixo: dois envios simultâneos leriam o
  // mesmo `maior`, e o segundo insert falha em vez de gravar duas versões 1.
  await tx.insert(orcamentoVersoesTable).values({
    id: randomUUID(),
    lojaId,
    orcamentoId,
    numero: maior + 1,
    itens,
    descontoTipo: orcamento.descontoTipo,
    descontoValor: orcamento.descontoValor,
    totalBruto,
    totalLiquido,
    hash,
  });
}

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/orcamentos", requireModulo("leads"));

router.get("/lojas/:lojaId/orcamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const query = ListOrcamentosQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "FILTRO_INVALIDO" });
    return;
  }
  // E62: o perfil da noiva pede `?leadId=`; E83: mensagens pede `?status=` —
  // os recortes acontecem no banco.
  const orcamentos = await db.query.orcamentosTable.findMany({
    where: and(
      eq(orcamentosTable.lojaId, lojaId),
      ...(query.data.leadId ? [eq(orcamentosTable.leadId, query.data.leadId)] : []),
      ...(query.data.status ? [eq(orcamentosTable.status, query.data.status)] : []),
    ),
    with: {
      lead: true,
      vendedora: true,
      itens: true
    },
    orderBy: orcamentosTable.createdAt,
  });
  res.json(ListOrcamentosResponse.parse(orcamentos));
});

router.post("/lojas/:lojaId/orcamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateOrcamentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  
  // B4 — o `leadId` vem do CORPO e precisa ser desta loja. Sem isto, um
  // `POST /lojas/A/orcamentos` com a noiva da loja B criava a linha em A, e o
  // `GET /lojas/A/orcamentos` (que faz `with: { lead: true }`) devolvia a ficha
  // inteira dela — nome, whatsapp, data e local do casamento — para a loja A.
  if (!(await leadNaLoja(parsed.data.leadId, lojaId))) {
    res.status(422).json({ error: "REFERENCIA_INVALIDA", detalhe: "Noiva não é desta loja" });
    return;
  }

  // Quem abriu vem da SESSÃO, nunca do corpo: aceitar um `vendedoraId` do
  // cliente deixava atribuir o orçamento (e a comissão que nasce dele) a
  // outra pessoa — mesma regra do vendedorId da cobrança.
  const [orcamento] = await db.insert(orcamentosTable).values({
    id: randomUUID(),
    lojaId,
    ...parsed.data,
    // F18/E95: validade por construção. Os dois atalhos naturais de criar
    // orçamento (a ficha da noiva e o desfecho do atendimento) nunca a
    // mandavam, e sem ela o orçamento não entra na fila de lembrete do E69 —
    // justamente as propostas feitas no calor da venda ficavam sem cobrança.
    // O default é do SERVIDOR de propósito: um cliente novo não pode nascer
    // com o buraco de novo.
    validade: parsed.data.validade ?? ancoraDeNegocio(addDias(hojeLocal(), VALIDADE_PADRAO_DIAS)),
    vendedoraId: req.usuario!.id,
  }).returning();

  // Abrir um orçamento avança o funil do lead (evento de negócio).
  await marcarOrcamentoAberto(lojaId, orcamento.leadId);

  const fullOrcamento = await db.query.orcamentosTable.findFirst({
    where: eq(orcamentosTable.id, orcamento.id),
    with: { lead: true, vendedora: true, itens: true }
  });
  res.status(201).json(CreateOrcamentoResponse.parse(fullOrcamento));
});

router.get("/lojas/:lojaId/orcamentos/:orcamentoId", async (req, res): Promise<void> => {
  const { lojaId, orcamentoId } = req.params;
  const orcamento = await db.query.orcamentosTable.findFirst({
    where: and(eq(orcamentosTable.id, orcamentoId as string), eq(orcamentosTable.lojaId, lojaId as string)),
    with: {
      lead: true,
      vendedora: true,
      itens: true
    },
  });
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }
  res.json(GetOrcamentoResponse.parse(orcamento));
});

router.patch("/lojas/:lojaId/orcamentos/:orcamentoId", async (req, res): Promise<void> => {
  const { lojaId, orcamentoId } = req.params;
  const parsed = UpdateOrcamentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  
  const existente = await db.query.orcamentosTable.findFirst({
    where: and(eq(orcamentosTable.id, orcamentoId as string), eq(orcamentosTable.lojaId, lojaId as string)),
  });
  if (!existente) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }

  // Mudança de status via PATCH também passa pela máquina de estados.
  if (parsed.data.status && !transicaoOrcamentoValida(existente.status, parsed.data.status)) {
    res.status(422).json({
      error: "TRANSICAO_INVALIDA",
      detalhe: `Orçamento não pode ir de ${existente.status} para ${parsed.data.status}`,
    });
    return;
  }

  const virandoAprovado = parsed.data.status === "APROVADO" && existente.status !== "APROVADO";
  const virandoEnviado = parsed.data.status === "ENVIADO" && existente.status !== "ENVIADO";
  // B11/E95: a marca de ENVIADO e a versão congelada nascem juntas ou não
  // nascem — ver `criarVersaoEnviada`.
  const orcamento = await db.transaction(async (tx) => {
    const [atualizado] = await tx.update(orcamentosTable)
      .set({
        ...parsed.data,
        ...(virandoAprovado ? { aprovadoEm: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(orcamentosTable.id, orcamentoId as string), eq(orcamentosTable.lojaId, lojaId as string)))
      .returning();
    if (!atualizado) return null;
    if (virandoEnviado) {
      await criarVersaoEnviada(tx, lojaId as string, orcamentoId as string);
    }
    return atualizado;
  });
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }
  const fullOrcamento = await db.query.orcamentosTable.findFirst({
    where: eq(orcamentosTable.id, orcamento.id),
    with: { lead: true, vendedora: true, itens: true }
  });
  res.json(UpdateOrcamentoResponse.parse(fullOrcamento));
});

router.delete("/lojas/:lojaId/orcamentos/:orcamentoId", async (req, res): Promise<void> => {
  const { lojaId, orcamentoId } = req.params;
  await db.delete(orcamentosTable).where(and(eq(orcamentosTable.id, orcamentoId as string), eq(orcamentosTable.lojaId, lojaId as string)));
  res.status(204).send();
});

router.post("/lojas/:lojaId/orcamentos/:orcamentoId/itens", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const orcamentoId = req.params.orcamentoId as string;
  const parsed = AddOrcamentoItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const orcamento = await db.query.orcamentosTable.findFirst({ where: and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)) });
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }

  const [item] = await db.insert(orcamentoItensTable).values({
    id: randomUUID(),
    lojaId: orcamento.lojaId,
    orcamentoId,
    ...parsed.data,
  }).returning();

  res.status(201).json(AddOrcamentoItemResponse.parse(item));
});

router.patch("/lojas/:lojaId/orcamentos/itens/:itemId", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const itemId = req.params.itemId as string;
  const parsed = UpdateOrcamentoItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const [item] = await db.update(orcamentoItensTable)
    .set(parsed.data)
    .where(and(eq(orcamentoItensTable.id, itemId), eq(orcamentoItensTable.lojaId, lojaId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  res.json(UpdateOrcamentoItemResponse.parse(item));
});

router.delete("/lojas/:lojaId/orcamentos/itens/:itemId", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const itemId = req.params.itemId as string;
  await db.delete(orcamentoItensTable).where(and(eq(orcamentoItensTable.id, itemId), eq(orcamentoItensTable.lojaId, lojaId)));
  res.status(204).send();
});

/**
 * Link público (E13): gera/regenera o token de leitura da noiva. Token novo
 * mata o anterior (coluna única, mesmo modelo do reenvio de convite E6) e a
 * validade recomeça. Gerar link de um RASCUNHO marca ENVIADO — compartilhar
 * É enviar; RECUSADO não gera (não há o que a noiva rever de um não).
 */
router.post("/lojas/:lojaId/orcamentos/:orcamentoId/link", requireModulo("leads", "editar"), async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const orcamentoId = req.params.orcamentoId as string;
  const orcamento = await db.query.orcamentosTable.findFirst({
    where: and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)),
  });
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }
  if (orcamento.status === "RECUSADO") {
    res.status(422).json({ error: "ORCAMENTO_RECUSADO", detalhe: "Orçamento recusado não gera link" });
    return;
  }

  const token = gerarTokenConvite();
  const expiraEm = new Date(Date.now() + CONVITE_TTL_MS);
  // B11/E95: o link, a marca de ENVIADO e a versão congelada, na mesma
  // transação. Esta rota é a mais exposta ao buraco: ela ENTREGA o link no
  // mesmo instante, então uma falha entre as duas escritas mandava a noiva
  // direto para o ramo de fallback do portal.
  await db.transaction(async (tx) => {
    await tx.update(orcamentosTable)
      .set({
        publicoToken: token,
        publicoExpiraEm: expiraEm,
        ...(orcamento.status === "RASCUNHO" ? { status: "ENVIADO" as const } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orcamentosTable.id, orcamento.id));

    // E75: compartilhar É enviar — e enviar congela a versão que a noiva verá.
    if (orcamento.status === "RASCUNHO") {
      await criarVersaoEnviada(tx, lojaId, orcamentoId);
    }
  });

  res.json(CriarLinkOrcamentoResponse.parse({ token, expiraEm }));
});

router.post("/lojas/:lojaId/orcamentos/:orcamentoId/aprovar", requireModulo("leads", "editar"), async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const orcamentoId = req.params.orcamentoId as string;
  const orcamento = await db.query.orcamentosTable.findFirst({
    where: and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)),
  });
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }
  if (orcamento.status === "APROVADO" || orcamento.status === "RECUSADO") {
    res.status(422).json({ error: "TRANSICAO_INVALIDA", detalhe: `Orçamento já está ${orcamento.status}` });
    return;
  }

  // Aprovar NÃO mexe na etapa do lead — o funil só avança para
  // CONTRATO_FECHADO quando um contrato é efetivamente fechado.
  await db.update(orcamentosTable)
    .set({ status: "APROVADO", aprovadoEm: new Date(), updatedAt: new Date() })
    .where(and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)));

  res.status(204).send();
});

router.post("/lojas/:lojaId/orcamentos/:orcamentoId/recusar", requireModulo("leads", "editar"), async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const orcamentoId = req.params.orcamentoId as string;
  const orcamento = await db.query.orcamentosTable.findFirst({
    where: and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)),
  });
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }
  if (orcamento.status === "APROVADO" || orcamento.status === "RECUSADO") {
    res.status(422).json({ error: "TRANSICAO_INVALIDA", detalhe: `Orçamento já está ${orcamento.status}` });
    return;
  }

  await db.update(orcamentosTable)
    .set({ status: "RECUSADO", updatedAt: new Date() })
    .where(and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)));

  res.status(204).send();
});

export default router;
