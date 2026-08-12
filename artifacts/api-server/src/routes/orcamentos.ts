import { Router, type IRouter } from "express";
import { db, orcamentosTable, orcamentoItensTable, leadsTable, contratosTable, bloqueioVestidosTable } from "@workspace/db";
import { registrarAuditoria } from "../lib/auditoria";
import { eq, and, inArray, desc, count, isNull, or } from "drizzle-orm";
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
  CriarLinkOrcamentoResponse,
  ListAceitosSemContratoResponse,
  DesfazerAceiteOrcamentoResponse,
  ReservarPecaDoOrcamentoBody,
  ReservarPecaDoOrcamentoResponse,
  ListReservasCandidatasResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { leadNaLoja, itemEstoqueNaLoja, ajusteDaNoiva, vestidoNaLoja, atendimentoNaLoja } from "../lib/escopo-loja";
import { randomUUID } from "node:crypto";
import { orcamentoVersoesTable } from "@workspace/db";
import { conteudoEnviado, identidadeDasPecas } from "../lib/conteudo-orcamento";
import { criarReservaDeVestido } from "../lib/reserva-do-vestido";
import { sql } from "drizzle-orm";
import { gerarTokenConvite, CONVITE_TTL_MS } from "../lib/auth";
import { avancarEtapaLead, transicaoOrcamentoValida } from "../lib/estados";
import {
  addDias,
  ancoraDeNegocio,
  hojeLocal,
  brutoEmCentavos,
  liquidoEmCentavos,
  recusaDeDesconto,
  reais as reaisFinanceiro,
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
 *
 * A07.3 (E169): o S-M23 fechou UMA das duas linhas do clamp. A de baixo — o
 * ramo VALOR — faz exatamente a mesma coisa, e a mensagem do 422 mandava a
 * vendedora para lá na letra. A régua agora é `recusaDeDesconto`, no
 * financeiro-core, e a MESMA função roda na tela antes do clique.
 */

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
    // O7/C5 (E166): o que a página dela mostra acima do comprovante congela
    // JUNTO — antes, observações e validade eram lidas da linha viva.
    observacoes: orcamento.observacoes,
    validade: orcamento.validade,
    // S-O29: a IDENTIDADE das peças, fora do hash e na mesma ordem dos itens.
    // O hash prende o que a proposta diz; esta lista prende o que ela é.
    itensVestidoIds: identidadeDasPecas(orcamento.itens),
  });
}

router.use(requireSessaoComLoja);
/**
 * E172/S-O40 — a proposta tem módulo próprio desde 2026-08-12.
 *
 * Esta linha dizia `requireModulo("leads")`, e o efeito era que a AÇÃO que
 * corrige o telefone de uma noiva era a mesma que **aprova a proposta de
 * R$ 5.000,00 dela**: `aprovar`, `recusar` e `link` pedem `editar`, e `editar`
 * em `leads` é o que a Recepção precisa para consertar o que digitou (S-O41).
 *
 * O contrato saiu de `leads` no mesmo commit, e fechar só ele teria sido meio
 * conserto: o aceite congela a versão que o gate do E115 confere contra o
 * contrato, então **quem aprova decide o preço que o contrato cobra**. Medido
 * antes de mexer, com o perfil novo da Recepção: `POST /aprovar` respondia
 * **404**, não 403 — ela atravessava o gate.
 */
router.use("/lojas/:lojaId/orcamentos", requireModulo("orcamentos"));

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
  // S-M27 (rodada 2, achado 9#4): no recorte `?leadId=` o relational builder
  // JÁ trouxe os itens para a resposta — a segunda consulta baixava as mesmas
  // linhas de novo só para o valorTotal. Quando a relação veio, o cálculo a
  // consome; a consulta só roda no ramo da listagem geral, onde é a única.
  const itensDaPagina = ids.length
    ? leadId
      ? orcamentos.flatMap((o) => (o as { itens?: (typeof orcamentoItensTable.$inferSelect)[] }).itens ?? [])
      : await db.select().from(orcamentoItensTable).where(inArray(orcamentoItensTable.orcamentoId, ids))
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

  /**
   * A07.3 — bruto `null` no POST porque o corpo de criação **não aceita
   * itens**: o orçamento nasce sempre com bruto zero, e comparar o desconto em
   * reais com esse zero proibiria o caminho legítimo "crio já com o desconto
   * combinado, lanço as peças em seguida". A regra do percentual, que não
   * depende de item nenhum, vale aqui igual.
   */
  const descontoInvalido = recusaDeDesconto(
    parsed.data.descontoTipo,
    parsed.data.descontoValor,
    null,
  );
  if (descontoInvalido) {
    res.status(422).json(descontoInvalido);
    return;
  }

  /**
   * O3 — o `atendimentoId` entrava no insert pelo spread, SEM prova de loja.
   *
   * Era a sexta FK de corpo do módulo sem conferência, e a função que faltava
   * **já existia**: `atendimentoNaLoja` (`escopo-loja.ts:101`), escrita no E115
   * com o comentário "era a única FK de corpo do módulo sem prova". O E115
   * fechou cinco; esta ficou — um `atendimentoId` da loja B carimbava o
   * orçamento de A, e a ficha do atendimento de outra loja passava a apontar
   * para dentro desta.
   */
  if (parsed.data.atendimentoId && !(await atendimentoNaLoja(parsed.data.atendimentoId, lojaId))) {
    res.status(422).json({
      error: "REFERENCIA_INVALIDA",
      detalhe: "Este atendimento não é desta loja.",
      campos: [{ campo: "atendimentoId", motivo: "Atendimento não encontrado nesta loja" }],
    });
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

/**
 * E162 (A01.5/A04.1/A04.2) — a fila do gate: aceitos que não viraram contrato.
 *
 * A primeira consulta do sistema que cruza orçamento com contrato. O ângulo 04
 * mediu a ausência com três greps registrados no achado: nenhuma tela, nenhum
 * card, nenhuma agregação — o aceite tirava o orçamento da única fila proativa
 * (a de ENVIADOs vencendo) e o punha num estado que NENHUMA tela vigiava. O
 * tempo até alguém notar era ilimitado.
 *
 * ANTES do `/:orcamentoId` de propósito: o Express casa na ordem de registro,
 * e "aceitos-sem-contrato" viraria um id de orçamento.
 */
router.get("/lojas/:lojaId/orcamentos/aceitos-sem-contrato", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;

  // APROVADO sem NENHUM contrato apontando (nem cancelado: orçamento com
  // contrato cancelado não pode ser re-vinculado — ORCAMENTO_JA_VINCULADO —
  // então ele não é "esperando contrato", é história).
  const aceitos = await db
    .select({
      orcamento: orcamentosTable,
      noivaNome: leadsTable.noivaNome,
    })
    .from(orcamentosTable)
    .innerJoin(leadsTable, eq(leadsTable.id, orcamentosTable.leadId))
    .leftJoin(contratosTable, eq(contratosTable.orcamentoId, orcamentosTable.id))
    .where(and(
      eq(orcamentosTable.lojaId, lojaId),
      eq(orcamentosTable.status, "APROVADO"),
      sql`${contratosTable.id} is null`,
    ))
    .orderBy(orcamentosTable.aprovadoEm);

  if (aceitos.length === 0) {
    res.json(ListAceitosSemContratoResponse.parse([]));
    return;
  }

  const ids = aceitos.map((a) => a.orcamento.id);
  const [versoes, itens] = await Promise.all([
    // A versão mais alta de cada um — o valor que a noiva ACEITOU.
    db.select().from(orcamentoVersoesTable)
      .where(inArray(orcamentoVersoesTable.orcamentoId, ids))
      .orderBy(orcamentoVersoesTable.orcamentoId, desc(orcamentoVersoesTable.numero)),
    db.select().from(orcamentoItensTable)
      .where(inArray(orcamentoItensTable.orcamentoId, ids)),
  ]);
  const versaoPorOrcamento = new Map<string, typeof orcamentoVersoesTable.$inferSelect>();
  for (const v of versoes) {
    if (!versaoPorOrcamento.has(v.orcamentoId)) versaoPorOrcamento.set(v.orcamentoId, v);
  }

  // As peças de acervo vendidas que AINDA não têm reserva viva utilizável
  // (da noiva ou sem dona) — o tamanho do risco de cada linha.
  const vestidoIds = [...new Set(itens.map((it) => it.vestidoId).filter((v): v is string => !!v))];
  const bloqueiosVivos = vestidoIds.length
    ? await db.select({
        vestidoId: bloqueioVestidosTable.vestidoId,
        leadId: bloqueioVestidosTable.leadId,
      })
        .from(bloqueioVestidosTable)
        .where(and(
          inArray(bloqueioVestidosTable.vestidoId, vestidoIds),
          eq(bloqueioVestidosTable.tipo, "RESERVA_CASAMENTO"),
          isNull(bloqueioVestidosTable.canceladoEm),
        ))
    : [];

  const linhas = aceitos.map(({ orcamento, noivaNome }) => {
    const versao = versaoPorOrcamento.get(orcamento.id);
    const itensDele = itens.filter((it) => it.orcamentoId === orcamento.id);
    const valor = versao
      ? versao.totalLiquido
      : reaisFinanceiro(
          liquidoEmCentavos(brutoEmCentavos(itensDele), orcamento.descontoTipo, orcamento.descontoValor),
        );
    const pecas = itensDele.filter(
      (it) => (it.tipo === "VESTIDO" || it.tipo === "ACESSORIO") && it.vestidoId,
    );
    const pecasSemReserva = pecas.filter(
      (it) =>
        !bloqueiosVivos.some(
          (b) => b.vestidoId === it.vestidoId && (b.leadId === null || b.leadId === orcamento.leadId),
        ),
    ).length;
    return {
      orcamentoId: orcamento.id,
      leadId: orcamento.leadId,
      noivaNome,
      valor,
      aceitoEm: orcamento.aceitoEm,
      // O `?? createdAt` cobre linha legada aprovada antes de `aprovadoEm`
      // existir — a idade fica conservadora em vez de a linha quebrar o parse.
      aprovadoEm: orcamento.aprovadoEm ?? orcamento.createdAt,
      pecasSemReserva,
    };
  });

  res.json(ListAceitosSemContratoResponse.parse(linhas));
});

/**
 * E162 (A01.2 🔴) — a porta gerencial do beco.
 *
 * As quatro guardas em volta de um APROVADO são individualmente corretas e
 * coletivamente fechavam TODAS as saídas de um aceite cuja peça ficou
 * indisponível: reservar → 409, trocar item → 422, voltar status → 422
 * (`TRANSICOES_ORCAMENTO.APROVADO = []`), contratar → 422 ITEM_SEM_RESERVA. E
 * apagar também não (409). O acordo aceito virava um registro que o sistema se
 * recusava a converter — R$ 5.000,00 de compromisso gravado e zero de venda.
 *
 * A saída volta para RASCUNHO (e não ENVIADO) DE PROPÓSITO: em RASCUNHO os
 * itens são editáveis E o próximo `POST /link` congela uma versão NOVA
 * (`criarVersaoEnviada` roda no RASCUNHO→ENVIADO) — a noiva re-aceita o que
 * ela VAI ver, não o que tinha visto. É o gatilho real que a guarda
 * `versaoVista` do E160 esperava (S-O8). A máquina de estados não tem esta
 * transição de propósito — este é um gesto GERENCIAL, com auditoria própria,
 * não um PATCH de status.
 */
router.post(
  "/lojas/:lojaId/orcamentos/:orcamentoId/desfazer-aceite",
  requireModulo("orcamentos", "editar"),
  async (req, res): Promise<void> => {
    const { lojaId, orcamentoId } = req.params as { lojaId: string; orcamentoId: string };

    const desfecho = await db.transaction(async (tx) => {
      const [orcamento] = await tx.select().from(orcamentosTable)
        .where(and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)))
        .for("update");
      if (!orcamento) return { sumiu: true as const };
      if (orcamento.status !== "APROVADO") return { naoAprovado: orcamento.status };
      // Já virou contrato (mesmo cancelado): o aceite é a origem dele e não se
      // desfaz — o caminho é cancelar o contrato / criar novo orçamento.
      const [contrato] = await tx.select({ id: contratosTable.id }).from(contratosTable)
        .where(eq(contratosTable.orcamentoId, orcamentoId));
      if (contrato) return { temContrato: true as const };

      const [limpo] = await tx.update(orcamentosTable)
        .set({
          status: "RASCUNHO",
          aceitoEm: null,
          aceiteVersao: null,
          aceiteHash: null,
          aprovadoEm: null,
          updatedAt: new Date(),
        })
        .where(eq(orcamentosTable.id, orcamentoId))
        .returning();

      // O aceite desfeito NÃO some da história: a trilha guarda o que havia.
      await registrarAuditoria(tx, {
        lojaId,
        usuario: req.usuario!,
        acao: "ORCAMENTO_ACEITE_DESFEITO",
        entidade: "orcamento",
        entidadeId: orcamentoId,
        detalhe: {
          leadId: orcamento.leadId,
          aceitoEm: orcamento.aceitoEm,
          aceiteVersao: orcamento.aceiteVersao,
          aceiteHash: orcamento.aceiteHash,
          aprovadoEm: orcamento.aprovadoEm,
        },
      });
      return { orcamento: limpo };
    });

    if ("sumiu" in desfecho) {
      res.status(404).json({ error: "ORCAMENTO_NAO_ENCONTRADO", detalhe: "Este orçamento não existe nesta loja." });
      return;
    }
    if ("naoAprovado" in desfecho) {
      res.status(422).json({
        error: "TRANSICAO_INVALIDA",
        detalhe: `Só um orçamento aprovado tem aceite a desfazer — este está ${desfecho.naoAprovado}.`,
      });
      return;
    }
    if ("temContrato" in desfecho) {
      res.status(409).json({
        error: "ORCAMENTO_JA_VINCULADO",
        detalhe: "Este orçamento já virou contrato — o aceite é a origem dele. Cancele o contrato ou crie um novo orçamento.",
      });
      return;
    }
    res.json(DesfazerAceiteOrcamentoResponse.parse(desfecho.orcamento));
  },
);

/**
 * E162 (R10, decisão registrada) — reservar DE DENTRO do fluxo de venda exige
 * `leads.criar`, não `vestidos.criar`.
 *
 * O perfil Recepção real tem `leads` ver+criar e `vestidos` só ver: ela montava
 * a venda, o contrato morria em 422 mandando reservar, ela clicava em reservar
 * e levava 403 — e nenhuma mensagem dizia que o problema era permissão. A
 * decisão: a venda é de quem vende. O alcance é estreito de propósito — só
 * peças que são ITEM deste orçamento, sempre em nome da noiva DELE — para a
 * porta não virar um `POST /bloqueios` sem gate de acervo.
 */
router.post(
  "/lojas/:lojaId/orcamentos/:orcamentoId/reservar",
  requireModulo("orcamentos", "criar"),
  async (req, res): Promise<void> => {
    const { lojaId, orcamentoId } = req.params as { lojaId: string; orcamentoId: string };
    // V12: `casamentoData: null` atravessa o zod como 01/01/1970 — a mesma
    // guarda de corpo cru de `reservas.ts`.
    if (
      typeof req.body === "object" && req.body !== null &&
      (req.body as Record<string, unknown>).casamentoData === null
    ) {
      res.status(422).json({
        error: "DATA_DE_CASAMENTO_INVALIDA",
        detalhe: "A data do casamento não pode ser vazia — é ela que decide quando o vestido fica reservado.",
        campos: [{ campo: "casamentoData", motivo: "Informe a data do casamento" }],
      });
      return;
    }
    const parsed = ReservarPecaDoOrcamentoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(erroDeValidacao(parsed.error));
      return;
    }

    const orcamento = await db.query.orcamentosTable.findFirst({
      where: and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)),
      with: { itens: true },
    });
    if (!orcamento) {
      res.status(404).json({ error: "ORCAMENTO_NAO_ENCONTRADO", detalhe: "Este orçamento não existe nesta loja." });
      return;
    }
    const ehItem = orcamento.itens.some(
      (it) => (it.tipo === "VESTIDO" || it.tipo === "ACESSORIO") && it.vestidoId === parsed.data.vestidoId,
    );
    if (!ehItem) {
      res.status(422).json({
        error: "PECA_FORA_DO_ORCAMENTO",
        detalhe: "Esta porta só reserva peça que o orçamento vende — para outras reservas, use a tela de reservas.",
        campos: [{ campo: "vestidoId", motivo: "A peça não é item deste orçamento" }],
      });
      return;
    }

    const criado = await criarReservaDeVestido({
      lojaId,
      vestidoId: parsed.data.vestidoId,
      // Sempre em nome da noiva do orçamento — é o que fecha o A02.4 na origem:
      // a reserva já nasce com dona, e o diálogo a oferece na hora.
      leadId: orcamento.leadId,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: parsed.data.casamentoData,
    });
    if ("conflitos" in criado) {
      res.status(409).json({ error: "VESTIDO_INDISPONIVEL", conflitos: criado.conflitos });
      return;
    }
    res.status(201).json(ReservarPecaDoOrcamentoResponse.parse(criado.bloqueio));
  },
);

/**
 * E162 (A02.4/K6) — as reservas que o contrato deste orçamento PODE prender.
 *
 * A tela filtrava por `leadId=` e a reserva SEM DONA — que o servidor de
 * contratos chama de "legítimo e comum" (61 de 63 no dev) e aceita com adoção
 * no fechamento — ficava invisível: o diálogo nem desenhava a caixa. Uma
 * consulta só, do lado que sabe a resposta: as vivas da noiva MAIS as sem dona
 * das peças vendidas pelos itens.
 */
router.get("/lojas/:lojaId/orcamentos/:orcamentoId/reservas-candidatas", async (req, res): Promise<void> => {
  const { lojaId, orcamentoId } = req.params as { lojaId: string; orcamentoId: string };
  const orcamento = await db.query.orcamentosTable.findFirst({
    where: and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)),
    with: { itens: true },
  });
  if (!orcamento) {
    res.status(404).json({ error: "ORCAMENTO_NAO_ENCONTRADO", detalhe: "Este orçamento não existe nesta loja." });
    return;
  }
  const vestidoIds = [
    ...new Set(
      orcamento.itens
        .filter((it) => (it.tipo === "VESTIDO" || it.tipo === "ACESSORIO") && it.vestidoId)
        .map((it) => it.vestidoId as string),
    ),
  ];
  const candidatas = await db.query.bloqueioVestidosTable.findMany({
    where: and(
      eq(bloqueioVestidosTable.lojaId, lojaId),
      eq(bloqueioVestidosTable.tipo, "RESERVA_CASAMENTO"),
      isNull(bloqueioVestidosTable.canceladoEm),
      or(
        eq(bloqueioVestidosTable.leadId, orcamento.leadId),
        ...(vestidoIds.length
          ? [and(isNull(bloqueioVestidosTable.leadId), inArray(bloqueioVestidosTable.vestidoId, vestidoIds))]
          : []),
      ),
    ),
    with: { vestido: true, lead: true },
  });
  // Da noiva primeiro — são as que o E72 sempre marcou por padrão.
  candidatas.sort((a, b) => Number(b.leadId === orcamento.leadId) - Number(a.leadId === orcamento.leadId));
  res.json(ListReservasCandidatasResponse.parse(candidatas));
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
    // A07.3: os itens entram porque o teto do desconto em VALOR é o BRUTO —
    // não há teto a cobrar sem saber quanto o orçamento vale.
    with: { itens: true },
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
  // A07.3: e o par efetivo do tipo VALOR se mede contra o bruto dos itens.
  const descontoInvalido = recusaDeDesconto(
    parsed.data.descontoTipo ?? existente.descontoTipo,
    parsed.data.descontoValor ?? existente.descontoValor,
    brutoEmCentavos(existente.itens),
  );
  if (descontoInvalido && (parsed.data.descontoTipo !== undefined || parsed.data.descontoValor !== undefined)) {
    res.status(422).json(descontoInvalido);
    return;
  }

  const virandoAprovado = parsed.data.status === "APROVADO" && existente.status !== "APROVADO";
  const virandoEnviado = parsed.data.status === "ENVIADO" && existente.status !== "ENVIADO";
  // O1 (E166): "marcar como enviado" é a segunda porta que congela versão — e
  // congelar o vazio cria o aceite de R$ 0,00 que trava a venda inteira.
  if (virandoEnviado) {
    const [temItem] = await db.select({ id: orcamentoItensTable.id })
      .from(orcamentoItensTable)
      .where(eq(orcamentoItensTable.orcamentoId, orcamentoId as string))
      .limit(1);
    if (!temItem) {
      res.status(422).json({
        error: "ORCAMENTO_VAZIO",
        detalhe: "A proposta não tem nenhum item — lance o vestido antes de marcar como enviada.",
        campos: [{ campo: "itens", motivo: "Lance ao menos um item" }],
      });
      return;
    }
  }
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
    /**
     * O2 — a tranca existia e relia o status, mas a releitura só decidia
     * `mexeNoDesconto`. Com o desconto intocado, o `.set({...parsed.data})`
     * gravava o `status` do corpo **por cima do que a tranca acabou de ler**:
     * o aceite da noiva era sobrescrito por RECUSADO, ou o RECUSADO da loja
     * por APROVADO.
     *
     * O achado A08.3 afirmava que "o PATCH ao lado tem `FOR UPDATE` +
     * reconferência desde a S-M22". **Tem a tranca; não cobria o campo que
     * decide o estado** — foi a correção mais útil que uma segunda lente
     * produziu na revisão.
     *
     * A máquina de estados é reperguntada aqui dentro, com o status RELIDO.
     * `transicaoOrcamentoValida` já trata `de === para` como no-op, então o
     * PATCH que não mexe em status atravessa sem ruído.
     */
    if (parsed.data.status && !transicaoOrcamentoValida(agora.status, parsed.data.status)) {
      return { transicaoInvalida: agora.status };
    }
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
  if (orcamento && "transicaoInvalida" in orcamento) {
    res.status(422).json({
      error: "TRANSICAO_INVALIDA",
      detalhe: `Orçamento não pode ir de ${orcamento.transicaoInvalida} para ${parsed.data.status}`,
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

/**
 * C4 — as três portas de item liam o status do pai no POOL e escreviam soltas,
 * e **o CAS do aceite não participava de tranca nenhuma**.
 *
 * A S-M22 escolheu `FOR UPDATE` + reconferência para serializar contra o
 * aceite e aplicou o padrão no PATCH do orçamento — as portas de item ficaram
 * de fora. **Medido:** o aceite grava o hash de R$ 5.000,00 às 14:02:00; o
 * `POST /itens` que leu ENVIADO um instante antes insere um véu de R$ 1.500,00
 * às 14:02:00,1. O vivo vira R$ 6.500,00 e o orçamento entra em **beco
 * permanente** — 422 para sempre no contrato (o hash não bate mais), e as três
 * portas de item agora recusam com `ORCAMENTO_APROVADO`. Só refazendo tudo e
 * pedindo novo aceite à noiva.
 *
 * A tranca é a linha do ORÇAMENTO, a mesma que o CAS do aceite atualiza — é
 * ela que serializa os dois. A guarda rápida de cada rota fica: ela dá o 422
 * certo sem custo de transação para o caminho errado.
 */
async function sobPaiTrancado<T>(
  orcamentoId: string,
  escrever: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<{ valor: T } | { congelado: ReturnType<typeof recusaConteudoCongelado> } | { sumiu: true }> {
  return await db.transaction(async (tx) => {
    const [pai] = await tx
      .select({ status: orcamentosTable.status })
      .from(orcamentosTable)
      .where(eq(orcamentosTable.id, orcamentoId))
      .for("update");
    if (!pai) return { sumiu: true as const };
    const recusa = recusaConteudoCongelado(pai.status);
    if (recusa) return { congelado: recusa };
    return { valor: await escrever(tx) };
  });
}

/**
 * S-O25 — **o teto do desconto em VALOR também se rompe pelo lado dos ITENS.**
 *
 * O A07.3 (E169) fechou a porta do desconto: `recusaDeDesconto` recusa
 * R$ 4.000,00 de desconto sobre R$ 3.000,00 de itens, porque o líquido sairia
 * clampado em R$ 0,00. Mas ela só roda quando o DESCONTO muda — e o teto é uma
 * relação entre dois números. Mexer no outro rompe a mesma invariante:
 *
 * ```
 * desconto R$ 4.000,00 sobre R$ 5.000,00 : 200   ← passa, e deve
 * DELETE do item de R$ 2.000,00          : 204   ← bruto vira R$ 3.000,00
 * desconto gravado                       : R$ 4000 VALOR
 * PATCH item 5→1 (bruto 5000→1000)       : 200
 * ```
 *
 * Medido em 2026-08-12. As duas portas de item não perguntavam nada sobre
 * desconto, e o orçamento voltava a valer R$ 0,00 em silêncio — que é
 * exatamente o estado que o S-M23 e o A07.3 existem para impedir.
 *
 * **Recusar é o certo, e não é beco.** A frase diz os dois números e o que
 * fazer; quem quer mesmo tirar o item baixa o desconto primeiro, que é uma
 * decisão de dinheiro e tem de ser consciente. Reduzir o desconto sozinho
 * seria mudar o preço da noiva sem ninguém pedir.
 *
 * Roda DENTRO da transação que já tranca o pai: o bruto é lido depois da
 * escrita, e a recusa desfaz tudo.
 */
class DescontoMaiorQueOsItens extends Error {
  constructor(readonly recusa: { error: string; detalhe: string }) {
    super(recusa.detalhe);
  }
}

async function exigirDescontoCabendoNosItens(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orcamentoId: string,
): Promise<void> {
  const [pai] = await tx
    .select({ descontoTipo: orcamentosTable.descontoTipo, descontoValor: orcamentosTable.descontoValor })
    .from(orcamentosTable)
    .where(eq(orcamentosTable.id, orcamentoId));
  if (!pai || pai.descontoTipo !== "VALOR") return;
  const itens = await tx
    .select()
    .from(orcamentoItensTable)
    .where(eq(orcamentoItensTable.orcamentoId, orcamentoId));
  const recusa = recusaDeDesconto(pai.descontoTipo, pai.descontoValor, brutoEmCentavos(itens));
  if (recusa) throw new DescontoMaiorQueOsItens(recusa);
}

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

  // C4: a escrita entra na transação que tranca o pai — ver `sobPaiTrancado`.
  const criado = await sobPaiTrancado(orcamentoId, async (tx) => {
    const [item] = await tx.insert(orcamentoItensTable).values({
      id: randomUUID(),
      lojaId: orcamento.lojaId,
      orcamentoId,
      ...parsed.data,
    }).returning();
    return item;
  });
  if ("congelado" in criado) {
    res.status(422).json(criado.congelado);
    return;
  }
  if ("sumiu" in criado) {
    res.status(404).json({ error: "ORCAMENTO_NAO_ENCONTRADO", detalhe: "Este orçamento não existe nesta loja." });
    return;
  }

  res.status(201).json(AddOrcamentoItemResponse.parse(criado.valor));
});

router.patch("/lojas/:lojaId/orcamentos/itens/:itemId", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const itemId = req.params.itemId as string;
  const parsed = UpdateOrcamentoItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  /**
   * S-O48 — corpo sem NENHUM campo conhecido dava **500**.
   *
   * `UpdateOrcamentoItemBody` só conhece `descricao`, `valorUnitario` e
   * `quantidade`; o zod descarta o resto e devolve `{}`, e `.set({})` estoura
   * no drizzle (*"No values to set"*). Medido em 2026-08-12 mandando
   * `{ vestidoId }` — que é justamente o campo que alguém tentaria para trocar
   * a peça (S-O29), e que esta rota **não** aceita de propósito.
   *
   * 400 com a lista do que ela aceita: quem chamou errado precisa saber o que
   * pode mandar, e um 500 não diz nem que o pedido era inválido.
   */
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({
      error: "CORPO_VAZIO",
      detalhe: "Nada para alterar neste item — mande descrição, valor unitário ou quantidade.",
    });
    return;
  }

  // E115 — mesma guarda do POST de item: acordo fechado não muda.
  const [pai] = await db
    .select({ status: orcamentosTable.status, orcamentoId: orcamentosTable.id })
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

  // C4: a escrita entra na transação que tranca o pai.
  let alterado;
  try {
    alterado = await sobPaiTrancado(pai.orcamentoId, async (tx) => {
      const [item] = await tx.update(orcamentoItensTable)
        .set(parsed.data)
        .where(and(eq(orcamentoItensTable.id, itemId), eq(orcamentoItensTable.lojaId, lojaId)))
        .returning();
      // S-O25: baixar o valor ou a quantidade encolhe o bruto — o teto do
      // desconto em VALOR se rompe pelo lado do item, não só pelo do desconto.
      await exigirDescontoCabendoNosItens(tx, pai.orcamentoId);
      return item;
    });
  } catch (err) {
    if (err instanceof DescontoMaiorQueOsItens) {
      res.status(422).json(err.recusa);
      return;
    }
    throw err;
  }
  if ("congelado" in alterado) {
    res.status(422).json(alterado.congelado);
    return;
  }
  if ("sumiu" in alterado || !alterado.valor) {
    res.status(404).json({ error: "ITEM_NAO_ENCONTRADO", detalhe: "Este item não existe nesta loja." });
    return;
  }

  res.json(UpdateOrcamentoItemResponse.parse(alterado.valor));
});

router.delete("/lojas/:lojaId/orcamentos/itens/:itemId", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const itemId = req.params.itemId as string;
  // E115 — mesma guarda do POST/PATCH de item, e o 404 que o delete cru não tinha.
  const [pai] = await db
    .select({ status: orcamentosTable.status, orcamentoId: orcamentosTable.id })
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
  // C4: a escrita entra na transação que tranca o pai.
  let removido;
  try {
    removido = await sobPaiTrancado(pai.orcamentoId, async (tx) => {
      await tx.delete(orcamentoItensTable)
        .where(and(eq(orcamentoItensTable.id, itemId), eq(orcamentoItensTable.lojaId, lojaId)));
      // S-O25: tirar o item que sustentava o desconto o deixaria maior que o
      // total, e o líquido voltaria a clampar em R$ 0,00.
      await exigirDescontoCabendoNosItens(tx, pai.orcamentoId);
      return true;
    });
  } catch (err) {
    if (err instanceof DescontoMaiorQueOsItens) {
      res.status(422).json(err.recusa);
      return;
    }
    throw err;
  }
  if ("congelado" in removido) {
    res.status(422).json(removido.congelado);
    return;
  }
  if ("sumiu" in removido) {
    res.status(404).json({ error: "ITEM_NAO_ENCONTRADO", detalhe: "Este item não existe nesta loja." });
    return;
  }
  res.status(204).send();
});

/**
 * Link público (E13): gera/regenera o token de leitura da noiva. Token novo
 * mata o anterior (coluna única, mesmo modelo do reenvio de convite E6) e a
 * validade recomeça. Gerar link de um RASCUNHO marca ENVIADO — compartilhar
 * É enviar; RECUSADO não gera (não há o que a noiva rever de um não).
 */
router.post("/lojas/:lojaId/orcamentos/:orcamentoId/link", requireModulo("orcamentos", "editar"), async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const orcamentoId = req.params.orcamentoId as string;

  const token = gerarTokenConvite();

  /**
   * B11/E95: o link, a marca de ENVIADO e a versão congelada, na mesma
   * transação. Esta rota é a mais exposta ao buraco: ela ENTREGA o link no
   * mesmo instante, então uma falha entre as duas escritas mandava a noiva
   * direto para o ramo de fallback do portal.
   *
   * **S-O31 (achada pela varredura do E171, dentro do próprio E166): a linha é
   * a TRANCA, e tudo que decide é relido aqui dentro.** As três perguntas
   * (existe nesta loja? está RECUSADO? tem item?) e as duas decisões (marcar
   * ENVIADO, congelar versão) liam o POOL, antes de qualquer tranca. Dois
   * cliques em "gerar link" no mesmo instante — o duplo-clique da vendedora, ou
   * a rede lenta que a faz clicar de novo — liam os dois `RASCUNHO`, e as duas
   * transações congelavam: o UPDATE serializa as escritas, mas não desfaz a
   * decisão tomada com o valor velho. **Medido: duas versões da MESMA
   * proposta**, e é a versão congelada que a noiva vê pelo número e que o gate
   * do E115 confere contra o contrato.
   *
   * É o mesmo desfecho do C8 pela outra ponta: pergunta feita UMA vez, sob a
   * tranca, e esta rota só traduz para HTTP.
   */
  const desfecho = await db.transaction(async (tx) => {
    const [sobTranca] = await tx
      .select({ status: orcamentosTable.status, validade: orcamentosTable.validade })
      .from(orcamentosTable)
      .where(and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)))
      .for("update");
    if (!sobTranca) return { erro: "SUMIU", expiraEm: null } as const;
    if (sobTranca.status === "RECUSADO") return { erro: "RECUSADO", expiraEm: null } as const;

    /**
     * O1 (E166) — o link congelava um orçamento VAZIO, e era a ação primária
     * da tela de um orçamento novo.
     *
     * A versão 1 nascia com `totalLiquido: 0` e hash do conteúdo vazio; a
     * página da noiva imprimia **Total R$ 0,00** com o botão "Aceitar" aceso.
     * Ela aceitava, o orçamento ia para APROVADO — terminal — e a vendedora
     * não conseguia mais lançar o vestido de R$ 5.000,00: 422 no item, 422 no
     * contrato. Uma venda inteira sem contrato possível, e o aceite gravado
     * era de zero. A versão nunca mais congela vazia — e a pergunta mora sob a
     * tranca, que é a mesma que as portas de item tomam (`sobPaiTrancado`),
     * então "tinha item quando eu perguntei" não envelhece entre a guarda e o
     * congelamento.
     */
    const [temItem] = await tx.select({ id: orcamentoItensTable.id })
      .from(orcamentoItensTable)
      .where(eq(orcamentoItensTable.orcamentoId, orcamentoId))
      .limit(1);
    if (!temItem) return { erro: "VAZIO", expiraEm: null } as const;

    /**
     * D3 (E166, decisão da dona) — o link regenerado de uma proposta VENCIDA
     * re-abre a validade EXPLICITAMENTE, em vez de por acidente.
     *
     * O aceite passou a barrar proposta vencida (C6): sem isto, regenerar o
     * link entregaria à noiva uma página que só sabe dizer "venceu". Reenviar
     * É reabrir a negociação: a validade recomeça (30 dias, a régua da casa) e
     * uma versão NOVA congela com ela — a noiva aceita o que está vendo, prazo
     * incluído, e a aba velha esbarra na guarda de versão do E160.
     *
     * Relida sob a tranca, ela também para de dobrar: o segundo clique lê a
     * validade JÁ reaberta pelo primeiro, não a vencida.
     */
    const validadeVencida = !!sobTranca.validade && sobTranca.validade < new Date();
    const validadeNova = validadeVencida
      ? ancoraDeNegocio(addDias(hojeLocal(), VALIDADE_PADRAO_DIAS))
      : null;

    /**
     * S-O39 (decisão da dona, 2026-08-12) — **o link dura o que a proposta
     * durar.**
     *
     * O `expiraEm` era `Date.now() + CONVITE_TTL_MS` — **sete dias**, o prazo
     * do CONVITE DE EQUIPE (`lib/auth.ts:11`), enquanto a proposta vale trinta
     * (`VALIDADE_PADRAO_DIAS`). A noiva que abria o WhatsApp no décimo dia lia
     * *"link expirado"* numa proposta de pé, e o remédio — gerar o link de
     * novo — só a vendedora conhecia.
     *
     * O prazo curto nunca foi uma escolha sobre propostas: veio emprestado do
     * convite, que é outra coisa (uma senha por definir, e que se quer curta).
     * A escolha sobre propostas é a VALIDADE, e a vendedora já a define por
     * orçamento. Agora as duas são a mesma data.
     *
     * O piso de um dia existe para a proposta que vence hoje: o link tem de
     * durar o dia inteiro em que ainda vale, e não morrer no instante em que
     * foi gerado.
     */
    const validadeVigente = validadeNova ?? sobTranca.validade;
    const umDia = 24 * 60 * 60 * 1000;
    const expiraEm = validadeVigente
      ? new Date(Math.max(validadeVigente.getTime(), Date.now() + umDia))
      : new Date(Date.now() + CONVITE_TTL_MS);

    await tx.update(orcamentosTable)
      .set({
        publicoToken: token,
        publicoExpiraEm: expiraEm,
        ...(sobTranca.status === "RASCUNHO" ? { status: "ENVIADO" as const } : {}),
        ...(validadeNova ? { validade: validadeNova } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orcamentosTable.id, orcamentoId));

    // E75: compartilhar É enviar — e enviar congela a versão que a noiva verá.
    // D3: reabrir uma proposta vencida também congela — a validade nova entra
    // no snapshot que ela vai ler.
    if (sobTranca.status === "RASCUNHO" || validadeNova) {
      await criarVersaoEnviada(tx, lojaId, orcamentoId);
    }
    return { erro: null, expiraEm } as const;
  });

  if (desfecho.erro === "SUMIU") {
    res.status(404).json({ error: "ORCAMENTO_NAO_ENCONTRADO", detalhe: "Este orçamento não existe nesta loja." });
    return;
  }
  if (desfecho.erro === "RECUSADO") {
    res.status(422).json({ error: "ORCAMENTO_RECUSADO", detalhe: "Orçamento recusado não gera link" });
    return;
  }
  if (desfecho.erro === "VAZIO") {
    res.status(422).json({
      error: "ORCAMENTO_VAZIO",
      detalhe: "A proposta não tem nenhum item — lance o vestido antes de mandar o link para a noiva.",
      campos: [{ campo: "itens", motivo: "Lance ao menos um item" }],
    });
    return;
  }

  res.json(CriarLinkOrcamentoResponse.parse({ token, expiraEm: desfecho.expiraEm }));
});

router.post("/lojas/:lojaId/orcamentos/:orcamentoId/aprovar", requireModulo("orcamentos", "editar"), async (req, res): Promise<void> => {
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

  /**
   * C1/A08.3 — `/aprovar` e `/recusar` escreviam a MESMA linha do CAS do
   * aceite, sem transação e sem condição de status.
   *
   * A guarda acima lê o pool; entre ela e este UPDATE cabe o aceite público
   * inteiro — que roda SEM sessão, pela pessoa que menos pode conferir o
   * resultado. **Medido:** orçamento de R$ 12.400,00 recusado às 14:00:00
   * volta a APROVADO às 14:00:00,2 pelo aceite que leu o pool às 13:59:59,8;
   * na ordem inversa, o orçamento fica RECUSADO carregando o comprovante do
   * aceite, com o badge "Aceito pela noiva" na tela da vendedora.
   *
   * O conserto é a condição no `where`: só escreve quem ainda encontra o
   * estado que leu. Zero linhas = alguém chegou primeiro, e a resposta é o
   * mesmo 422 da guarda lenta.
   *
   * Aprovar NÃO mexe na etapa do lead — o funil só avança para
   * CONTRATO_FECHADO quando um contrato é efetivamente fechado.
   */
  /**
   * C7/O5 (E163) — o `/aprovar` manual desligava o gate do E115.
   *
   * O gate em `contratos.ts` é `if (hashEsperado)` — e aprovar à mão um
   * ENVIADO (caminho comum, oferecido pela tela) deixava o hash NULO: a página
   * da noiva afirmava R$ 5.000,00 aprovado e o contrato nascia dos itens vivos
   * em R$ 5.500,00, sem 422 em porta nenhuma. Agora a aprovação manual carimba
   * o hash da versão VIGENTE (a que a noiva vê): o contrato tem de nascer
   * dela. Orçamento sem versão (nunca enviado, aprovado direto do rascunho)
   * segue sem hash — não há "o que ela viu" para certificar, e o gate do
   * contrato também conferirá a versão congelada quando ela existir.
   *
   * A contagem C1 da Fase 0 matou o ramo legado: ZERO APROVADOs com hash nulo
   * e versão congelada no `moscow_base` — sem backfill.
   */
  const [versaoVigente] = await db
    .select({ numero: orcamentoVersoesTable.numero, hash: orcamentoVersoesTable.hash })
    .from(orcamentoVersoesTable)
    .where(eq(orcamentoVersoesTable.orcamentoId, orcamentoId))
    .orderBy(desc(orcamentoVersoesTable.numero))
    .limit(1);

  const [aprovado] = await db.update(orcamentosTable)
    .set({
      status: "APROVADO",
      aprovadoEm: new Date(),
      ...(versaoVigente ? { aceiteVersao: versaoVigente.numero, aceiteHash: versaoVigente.hash } : {}),
      updatedAt: new Date(),
    })
    .where(and(
      eq(orcamentosTable.id, orcamentoId),
      eq(orcamentosTable.lojaId, lojaId),
      inArray(orcamentosTable.status, ["RASCUNHO", "ENVIADO"]),
    ))
    .returning({ status: orcamentosTable.status });
  if (!aprovado) {
    res.status(422).json({
      error: "TRANSICAO_INVALIDA",
      detalhe: "Este orçamento mudou de estado enquanto você decidia — recarregue a tela.",
    });
    return;
  }

  // A04.6 (E162): aprovar também prova que a proposta existiu — a noiva
  // avança até ORCAMENTO_ABERTO se estava atrás, como no aceite público.
  await marcarOrcamentoAberto(lojaId, orcamento.leadId);

  res.status(204).send();
});

router.post("/lojas/:lojaId/orcamentos/:orcamentoId/recusar", requireModulo("orcamentos", "editar"), async (req, res): Promise<void> => {
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

  // C1/A08.3: a mesma condição do `/aprovar` — a irmã em que o estrago é
  // maior, porque RECUSADO é terminal e o aceite da noiva o sobrescrevia.
  const [recusado] = await db.update(orcamentosTable)
    .set({ status: "RECUSADO", updatedAt: new Date() })
    .where(and(
      eq(orcamentosTable.id, orcamentoId),
      eq(orcamentosTable.lojaId, lojaId),
      inArray(orcamentosTable.status, ["RASCUNHO", "ENVIADO"]),
    ))
    .returning({ status: orcamentosTable.status });
  if (!recusado) {
    res.status(422).json({
      error: "TRANSICAO_INVALIDA",
      detalhe: "Este orçamento mudou de estado enquanto você decidia — recarregue a tela.",
    });
    return;
  }

  res.status(204).send();
});

export default router;
