import { Router, type IRouter } from "express";
import { db, orcamentosTable, orcamentoItensTable, leadsTable, contratosTable } from "@workspace/db";
import { registrarAuditoria } from "../lib/auditoria";
import { eq, and, inArray, desc, count } from "drizzle-orm";
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
import { leadNaLoja, itemEstoqueNaLoja, ajusteDaNoiva, vestidoNaLoja } from "../lib/escopo-loja";
import { randomUUID } from "node:crypto";
import { orcamentoVersoesTable } from "@workspace/db";
import { conteudoEnviado } from "../lib/conteudo-orcamento";
import { sql } from "drizzle-orm";
import { gerarTokenConvite, CONVITE_TTL_MS } from "../lib/auth";
import { avancarEtapaLead, transicaoOrcamentoValida } from "../lib/estados";
import {
  addDias,
  ancoraDeNegocio,
  hojeLocal,
  brutoEmCentavos,
  liquidoEmCentavos,
} from "@workspace/financeiro-core";
import { leadsQueCasam } from "../lib/busca-lead";
import { erroDeValidacao } from "../lib/erros";

const router: IRouter = Router();

/**
 * S-M24 (rodada 2, achado 6#4) — os DOIS estados que congelam conteúdo.
 *
 * As quatro portas de conteúdo (item POST/PATCH/DELETE e desconto) só
 * perguntavam por APROVADO — mas RECUSADO também é terminal
 * (`TRANSICOES_ORCAMENTO`: nenhuma saída), e um orçamento recusado de
 * R$ 3.500,00 podia virar R$ 500,00 depois do não: quem relesse a proposta, ou
 * comparasse com o motivo de perda do lead, encontrava outra história. Sem uso
 * legítimo possível — recusado nunca reenvia nem aprova.
 */
/**
 * S-M23 (rodada 2, achado 1#2): o clamp de `liquidoEmCentavos` engole qualquer
 * percentual acima de 100 — "150" digitado pensando em R$ 150,00 zerava o
 * orçamento em silêncio, a versão ENVIADA congelava R$ 0,00 no snapshot E no
 * hash, e o aceite da noiva assinava zero. Desconto de mais de 100% não é
 * desconto, é erro de digitação — e a borda é quem o diz.
 */
function recusaDescontoPercentual(
  tipo: string | undefined | null,
  valor: number | undefined | null,
): { error: string; detalhe: string } | null {
  if (tipo === "PERCENTUAL" && typeof valor === "number" && valor > 100) {
    return {
      error: "DESCONTO_INVALIDO",
      detalhe: "Desconto percentual não passa de 100 — para um valor em reais, troque o tipo para VALOR.",
    };
  }
  return null;
}

function recusaConteudoCongelado(status: string): { error: string; detalhe: string } | null {
  if (status === "APROVADO") {
    return {
      error: "ORCAMENTO_APROVADO",
      detalhe: "Orçamento aprovado não muda mais — crie um novo orçamento para renegociar",
    };
  }
  if (status === "RECUSADO") {
    return {
      error: "ORCAMENTO_RECUSADO",
      detalhe: "O que a noiva recusou é registro — crie um novo orçamento em vez de reescrever o não.",
    };
  }
  return null;
}

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

  // E95/C1 + E115: a MESMA régua que o `POST /contratos` usa — congelamento e
  // conferência do aceite saem de `conteudoEnviado`, um lugar só.
  const { itens, totalBruto, totalLiquido, hash } = conteudoEnviado(
    orcamento.itens,
    orcamento.descontoTipo,
    orcamento.descontoValor,
  );

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
  // os recortes acontecem no banco. E124/D1: busca por noiva, página e
  // recentes-primeiro (P2); e a listagem geral parou de embutir `itens`
  // (S-D5 — 222 orçamentos desciam com a história inteira e nenhuma tela os
  // lia): desce só o `valorTotal`, agregado aqui pela régua única.
  const { leadId, status, q, pagina, porPagina, ordem } = query.data;
  const condicoes = [eq(orcamentosTable.lojaId, lojaId)];
  if (leadId) condicoes.push(eq(orcamentosTable.leadId, leadId));
  if (status) condicoes.push(eq(orcamentosTable.status, status));
  const busca = q?.trim();
  if (busca) condicoes.push(inArray(orcamentosTable.leadId, leadsQueCasam(lojaId, busca)));
  const where = and(...condicoes);

  const paginado = pagina !== undefined || porPagina !== undefined;
  const tamanho = porPagina ?? 24;
  const [contagem, orcamentos] = await Promise.all([
    db.select({ total: count() }).from(orcamentosTable).where(where),
    db.query.orcamentosTable.findMany({
      where,
      with: {
        lead: true,
        // `vendedora` NÃO entra: o schema `Orcamento` nunca a teve e o parse
        // da resposta a descartava — a rota pagava o join para jogar fora
        // (medido no mapeamento: as chaves da resposta não tinham `vendedora`).
        // O recorte `?leadId=` mantém os itens (contrato do E62); a listagem
        // geral manda só o agregado.
        ...(leadId ? { itens: true as const } : {}),
      },
      // id desempata createdAt igual — sem ordem estável, página 2 repete item.
      orderBy:
        ordem === "antigos"
          ? [orcamentosTable.createdAt, orcamentosTable.id]
          : [desc(orcamentosTable.createdAt), desc(orcamentosTable.id)],
      ...(paginado ? { limit: tamanho, offset: ((pagina ?? 1) - 1) * tamanho } : {}),
    }),
  ]);

  // O líquido de cada orçamento da página, em centavos, pela MESMA régua do
  // `POST /contratos` (`liquidoEmCentavos`) — nunca uma segunda fórmula.
  const ids = orcamentos.map((o) => o.id);
  const itensDaPagina = ids.length
    ? await db.select().from(orcamentoItensTable).where(inArray(orcamentoItensTable.orcamentoId, ids))
    : [];
  const itensPorOrcamento = new Map<string, typeof itensDaPagina>();
  for (const item of itensDaPagina) {
    const doOrcamento = itensPorOrcamento.get(item.orcamentoId);
    if (doOrcamento) doOrcamento.push(item);
    else itensPorOrcamento.set(item.orcamentoId, [item]);
  }
  const comValor = orcamentos.map((o) => ({
    ...o,
    valorTotal:
      liquidoEmCentavos(
        brutoEmCentavos(itensPorOrcamento.get(o.id) ?? []),
        o.descontoTipo,
        o.descontoValor,
      ) / 100,
  }));

  res.json(ListOrcamentosResponse.parse({ total: contagem[0]!.total, itens: comValor }));
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

  const descontoInvalido = recusaDescontoPercentual(parsed.data.descontoTipo, parsed.data.descontoValor);
  if (descontoInvalido) {
    res.status(422).json(descontoInvalido);
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
    res.status(404).json({ error: "ORCAMENTO_NAO_ENCONTRADO", detalhe: "Este orçamento não existe nesta loja." });
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
    res.status(404).json({ error: "ORCAMENTO_NAO_ENCONTRADO", detalhe: "Este orçamento não existe nesta loja." });
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

  // E115 — o desconto muda o líquido tanto quanto um item: em APROVADO ele
  // também congela, senão a guarda dos itens tem uma porta dos fundos.
  {
    const recusa = recusaConteudoCongelado(existente.status);
    if (recusa && (parsed.data.descontoTipo !== undefined || parsed.data.descontoValor !== undefined)) {
      res.status(422).json(recusa);
      return;
    }
  }

  // S-M23: o par EFETIVO (o que fica valendo depois do PATCH) é o que se valida
  // — mandar só o tipo PERCENTUAL com um valor antigo de 150 é o mesmo erro.
  const descontoInvalido = recusaDescontoPercentual(
    parsed.data.descontoTipo ?? existente.descontoTipo,
    parsed.data.descontoValor ?? existente.descontoValor,
  );
  if (descontoInvalido && (parsed.data.descontoTipo !== undefined || parsed.data.descontoValor !== undefined)) {
    res.status(422).json(descontoInvalido);
    return;
  }

  const virandoAprovado = parsed.data.status === "APROVADO" && existente.status !== "APROVADO";
  const virandoEnviado = parsed.data.status === "ENVIADO" && existente.status !== "ENVIADO";
  const mexeNoDesconto =
    parsed.data.descontoTipo !== undefined || parsed.data.descontoValor !== undefined;
  // B11/E95: a marca de ENVIADO e a versão congelada nascem juntas ou não
  // nascem — ver `criarVersaoEnviada`.
  //
  // S-M22 (rodada 2, achado 3#6): a guarda de APROVADO acima leu no POOL, e o
  // aceite é um CAS por link público, SEM sessão — a noiva aceitando no mesmo
  // segundo do PATCH mudava o líquido de um orçamento JÁ aceito. `FOR UPDATE`
  // + reconferência dentro da transação: o CAS do aceite atualiza esta mesma
  // linha, a tranca serializa os dois.
  const orcamento = await db.transaction(async (tx) => {
    const [agora] = await tx.select({ status: orcamentosTable.status }).from(orcamentosTable)
      .where(eq(orcamentosTable.id, orcamentoId as string))
      .for("update");
    if (!agora) return null;
    if (recusaConteudoCongelado(agora.status) && mexeNoDesconto) return { corrida: true as const };
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
  if (orcamento && "corrida" in orcamento) {
    res.status(422).json({
      error: "ORCAMENTO_APROVADO",
      detalhe: "Orçamento aprovado não muda mais — crie um novo orçamento para renegociar",
    });
    return;
  }
  if (!orcamento) {
    res.status(404).json({ error: "ORCAMENTO_NAO_ENCONTRADO", detalhe: "Este orçamento não existe nesta loja." });
    return;
  }
  const fullOrcamento = await db.query.orcamentosTable.findFirst({
    where: eq(orcamentosTable.id, orcamento.id),
    with: { lead: true, vendedora: true, itens: true }
  });
  res.json(UpdateOrcamentoResponse.parse(fullOrcamento));
});

/**
 * E115 — o DELETE era cru, e `orcamento_versoes` (que carrega a versão
 * CONGELADA e o hash que a noiva aceitou — E74/E75) cai em cascata: apagar um
 * APROVADO destruía o comprovante do aceite; apagar um com contrato deixava o
 * contrato sem proveniência (`contratos.orcamento_id` é SET NULL).
 */
router.delete("/lojas/:lojaId/orcamentos/:orcamentoId", async (req, res): Promise<void> => {
  const { lojaId, orcamentoId } = req.params as { lojaId: string; orcamentoId: string };
  const orcamento = await db.query.orcamentosTable.findFirst({
    where: and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)),
  });
  if (!orcamento) {
    res.status(404).json({ error: "ORCAMENTO_NAO_ENCONTRADO", detalhe: "Este orçamento não existe nesta loja." });
    return;
  }
  if (orcamento.status === "APROVADO") {
    res.status(409).json({
      error: "ORCAMENTO_APROVADO",
      detalhe: "O aceite da noiva (versão e hash) mora neste orçamento — ele não se apaga.",
    });
    return;
  }
  const [contrato] = await db
    .select({ id: contratosTable.id })
    .from(contratosTable)
    .where(eq(contratosTable.orcamentoId, orcamentoId));
  if (contrato) {
    res.status(409).json({
      error: "ORCAMENTO_COM_CONTRATO",
      detalhe: "Este orçamento virou contrato — apagá-lo deixaria o contrato sem origem.",
    });
    return;
  }
  // S-M22 (rodada 2, achado 3#6): a guarda de APROVADO leu no POOL e o aceite
  // chega por link público, sem sessão — a noiva aceitando na janela via o
  // comprovante (versão + hash, em cascata) ser destruído com a tela dela
  // dizendo "aceito às 14h02". `FOR UPDATE` + reconferência do status e do
  // contrato dentro da transação.
  const resultado = await db.transaction(async (tx) => {
    const [agora] = await tx.select({ status: orcamentosTable.status }).from(orcamentosTable)
      .where(eq(orcamentosTable.id, orcamentoId))
      .for("update");
    if (!agora) return { corrida: "sumiu" as const };
    if (agora.status === "APROVADO") return { corrida: "aprovado" as const };
    const [contratoAgora] = await tx
      .select({ id: contratosTable.id })
      .from(contratosTable)
      .where(eq(contratosTable.orcamentoId, orcamentoId));
    if (contratoAgora) return { corrida: "contrato" as const };
    await registrarAuditoria(tx, {
      lojaId,
      usuario: req.usuario!,
      acao: "ORCAMENTO_REMOVIDO",
      entidade: "orcamento",
      entidadeId: orcamentoId,
      detalhe: { leadId: orcamento.leadId, status: orcamento.status },
    });
    await tx.delete(orcamentosTable).where(and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)));
    return { ok: true as const };
  });
  if ("corrida" in resultado) {
    if (resultado.corrida === "sumiu") {
      res.status(404).json({ error: "ORCAMENTO_NAO_ENCONTRADO", detalhe: "Este orçamento não existe nesta loja." });
    } else if (resultado.corrida === "aprovado") {
      res.status(409).json({
        error: "ORCAMENTO_APROVADO",
        detalhe: "O aceite da noiva (versão e hash) mora neste orçamento — ele não se apaga.",
      });
    } else {
      res.status(409).json({
        error: "ORCAMENTO_COM_CONTRATO",
        detalhe: "Este orçamento virou contrato — apagá-lo deixaria o contrato sem origem.",
      });
    }
    return;
  }
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
    res.status(404).json({ error: "ORCAMENTO_NAO_ENCONTRADO", detalhe: "Este orçamento não existe nesta loja." });
    return;
  }
  // E115 — um orçamento APROVADO é um acordo fechado: o aceite (ou a
  // aprovação manual) congelou o conteúdo, e mexer nos itens depois deixaria
  // aceite, portal e contrato falando de números diferentes. ENVIADO continua
  // editável de propósito (E75): a noiva vê a versão congelada, não o vivo.
  {
    const recusa = recusaConteudoCongelado(orcamento.status);
    if (recusa) {
      res.status(422).json(recusa);
      return;
    }
  }

  /**
   * E154 — o item aponta a peça de UM dos dois jeitos, nunca dos dois.
   *
   * `vestidoId` é peça do acervo, que se RESERVA (E150); `itemEstoqueId` é peça
   * de estoque, que se CONTA. O par não é redundância: um item ESTOQUE levando
   * `vestidoId` passaria pela guarda do E150 sem ser cobrado — ela só olha
   * VESTIDO e ACESSORIO — e venderia um bolero sem reserva com o rótulo de
   * saiote. O caminho contrário some com a peça da conta do dia.
   */
  const { tipo, vestidoId, itemEstoqueId, ajusteId } = parsed.data;
  const apontaEstoque = tipo === "ESTOQUE";
  if (apontaEstoque && vestidoId) {
    res.status(422).json({
      error: "ITEM_APONTA_DUAS_PECAS",
      detalhe: "Item de estoque é contado, não reservado — ele não aponta uma peça do acervo.",
      campos: [{ campo: "vestidoId", motivo: "Item de estoque não tem peça do acervo" }],
    });
    return;
  }
  if (!apontaEstoque && itemEstoqueId) {
    res.status(422).json({
      error: "ITEM_APONTA_DUAS_PECAS",
      detalhe: "Só item do tipo Estoque aponta uma peça de estoque.",
      campos: [{ campo: "itemEstoqueId", motivo: `Tipo ${tipo} não usa peça de estoque` }],
    });
    return;
  }
  // A FK prova que o saiote existe; `itens_estoque.loja_id` é quem diz de quem
  // ele é (família E91).
  if (itemEstoqueId && !(await itemEstoqueNaLoja(itemEstoqueId, lojaId))) {
    res.status(404).json({
      error: "ITEM_ESTOQUE_NAO_ENCONTRADO",
      detalhe: "Este item de estoque não existe nesta loja.",
      campos: [{ campo: "itemEstoqueId", motivo: "Item de estoque não encontrado nesta loja" }],
    });
    return;
  }
  // S-M12 — dos três ids que o item pode apontar, o `vestidoId` era o único
  // sem prova de loja: o `itemEstoqueId` tem a de cima, o `ajusteId` tem a
  // dupla do E155 logo abaixo, e a peça do acervo entrava só com a FK. O item
  // com a peça da loja B passava, e a venda virava beco sem saída: a reserva
  // do E150 responde 422 apontando uma peça que ESTA loja nunca poderá
  // reservar.
  if (vestidoId && !(await vestidoNaLoja(vestidoId, lojaId))) {
    res.status(404).json({
      error: "VESTIDO_NAO_ENCONTRADO",
      detalhe: "Esta peça não existe nesta loja.",
      campos: [{ campo: "vestidoId", motivo: "Peça não encontrada nesta loja" }],
    });
    return;
  }

  /**
   * E155 — o item que COBRA uma confecção aponta o trabalho na fila.
   *
   * Só `AJUSTE`: é o tipo que já existia para trabalho de agulha, e cobrar uma
   * manga como VESTIDO faria a peça nova entrar na conta do acervo.
   *
   * E a prova é dupla, pela lição do S2/E107 (a reserva tinha de ser DESTA
   * noiva): o ajuste é da loja E do mesmo lead do orçamento. Sem a segunda, o
   * orçamento da noiva A cobraria a manga que a costureira faz para a B — e as
   * duas leriam, cada uma na sua tela, que a peça está paga.
   */
  if (ajusteId) {
    if (tipo !== "AJUSTE") {
      res.status(422).json({
        error: "ITEM_APONTA_DUAS_PECAS",
        detalhe: "Só item do tipo Ajuste aponta um trabalho da costureira.",
        campos: [{ campo: "ajusteId", motivo: `Tipo ${tipo} não usa trabalho da fila` }],
      });
      return;
    }
    if (!(await ajusteDaNoiva(ajusteId, lojaId, orcamento.leadId))) {
      res.status(404).json({
        error: "AJUSTE_NAO_ENCONTRADO",
        detalhe: "Este trabalho da costureira não é desta noiva.",
        campos: [{ campo: "ajusteId", motivo: "Trabalho não encontrado para esta noiva" }],
      });
      return;
    }
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

  // E115 — mesma guarda do POST de item: acordo fechado não muda.
  const [pai] = await db
    .select({ status: orcamentosTable.status })
    .from(orcamentoItensTable)
    .innerJoin(orcamentosTable, eq(orcamentosTable.id, orcamentoItensTable.orcamentoId))
    .where(and(eq(orcamentoItensTable.id, itemId), eq(orcamentoItensTable.lojaId, lojaId)));
  if (!pai) {
    res.status(404).json({ error: "ITEM_NAO_ENCONTRADO", detalhe: "Este item não existe nesta loja." });
    return;
  }
  {
    const recusa = recusaConteudoCongelado(pai.status);
    if (recusa) {
      res.status(422).json(recusa);
      return;
    }
  }

  const [item] = await db.update(orcamentoItensTable)
    .set(parsed.data)
    .where(and(eq(orcamentoItensTable.id, itemId), eq(orcamentoItensTable.lojaId, lojaId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "ITEM_NAO_ENCONTRADO", detalhe: "Este item não existe nesta loja." });
    return;
  }

  res.json(UpdateOrcamentoItemResponse.parse(item));
});

router.delete("/lojas/:lojaId/orcamentos/itens/:itemId", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const itemId = req.params.itemId as string;
  // E115 — mesma guarda do POST/PATCH de item, e o 404 que o delete cru não tinha.
  const [pai] = await db
    .select({ status: orcamentosTable.status })
    .from(orcamentoItensTable)
    .innerJoin(orcamentosTable, eq(orcamentosTable.id, orcamentoItensTable.orcamentoId))
    .where(and(eq(orcamentoItensTable.id, itemId), eq(orcamentoItensTable.lojaId, lojaId)));
  if (!pai) {
    res.status(404).json({ error: "ITEM_NAO_ENCONTRADO", detalhe: "Este item não existe nesta loja." });
    return;
  }
  {
    const recusa = recusaConteudoCongelado(pai.status);
    if (recusa) {
      res.status(422).json(recusa);
      return;
    }
  }
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
    res.status(404).json({ error: "ORCAMENTO_NAO_ENCONTRADO", detalhe: "Este orçamento não existe nesta loja." });
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
    res.status(404).json({ error: "ORCAMENTO_NAO_ENCONTRADO", detalhe: "Este orçamento não existe nesta loja." });
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
    res.status(404).json({ error: "ORCAMENTO_NAO_ENCONTRADO", detalhe: "Este orçamento não existe nesta loja." });
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
