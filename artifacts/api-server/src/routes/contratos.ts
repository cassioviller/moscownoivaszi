import { Router, type IRouter } from "express";
import {
  db,
  contratosTable,
  contratoItensTable,
  parcelasTable,
  bloqueioVestidosTable,
  orcamentosTable,
  orcamentoItensTable,
  leadsTable,
  contratoBloqueiosTable,
  type InsertContratoItem,
} from "@workspace/db";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { verificarDisponibilidade, diaLocal } from "../lib/disponibilidade";
import { registrarAuditoria } from "../lib/auditoria";
import { avancarEtapaLead } from "../lib/estados";
import { pdfDoContrato, nomeDoArquivo } from "../lib/contrato-do-papel";
import {
  EstornarParcelaResponse,
  GerarPlanoParcelasBody,
  GerarPlanoParcelasResponse,
  ListContratosResponse,
  ListContratosQueryParams,
  CreateParcelaAvulsaBody,
  CreateParcelaAvulsaResponse,
  CreateContratoBody,
  CreateContratoResponse,
  GetContratoResponse,
  UpdateContratoBody,
  UpdateContratoResponse,
  CancelarContratoBody,
  CancelarContratoResponse,
  ListParcelasResponse,
  ReceberParcelaBody,
  ReceberParcelaResponse
} from "@workspace/api-zod";
import {
  ancoraDeNegocio,
  brutoEmCentavos,
  diaDeNegocio,
  estaAberta,
  liquidoEmCentavos,
  montarPlanoParcelas,
  STATUS_ABERTO,
} from "@workspace/financeiro-core";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { vendedoraNaLoja } from "../lib/escopo-loja";
import { conteudoEnviado } from "../lib/conteudo-orcamento";
import { randomUUID } from "node:crypto";
import { erroDeValidacao } from "../lib/erros";

const router: IRouter = Router();

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/contratos", requireModulo("leads"));

/**
 * B9/E101 — **receber pertence a quem vende**, e por isso as parcelas vivem sob
 * `leads` e não sob `financeiro`.
 *
 * Decisão do dono em 2026-07-27, e o valor está em ela existir escrita: esta
 * linha não explicava nada, e o resultado era a vendedora que o teste de
 * permissões cria *justamente para provar que ela não entra no financeiro*
 * podendo escrever no caixa realizado. Parecia buraco; é regra.
 *
 * A razão: a noiva paga na mão de quem a atendeu. Exigir alguém do financeiro
 * disponível para registrar cada Pix recebido no balcão trocaria um risco de
 * permissão por um atrito diário — e o dinheiro entraria no sistema com atraso,
 * que é a forma mais cara de estar errado sobre caixa.
 *
 * O que o E101 apertou foi a AÇÃO, não o módulo: `receber` e `estornar` exigem
 * `editar` (B5), então o perfil só-leitura de `leads` não escreve mais no caixa.
 * VER o financeiro continua sendo outro gate — quem recebe não passa a enxergar
 * o fluxo, o DRE nem a folha.
 */
router.use("/lojas/:lojaId/parcelas", requireModulo("leads"));

/** Dinheiro soma em CENTAVOS inteiros — reais é float e não fecha na soma. */
const cent = (reais: number) => Math.round(reais * 100);
const reais = (centavos: number) => centavos / 100;

// O líquido do orçamento é `liquidoEmCentavos`, do financeiro-core. Ele morava
// aqui, e o comentário desta função afirmava que a conta era feita "EXATAMENTE
// como o frontend" — não era: a tela, a rota de orçamento e a visão da noiva
// calculavam em reais float. A função documentava o invariante que quebrava,
// e por isso o E95 a tirou daqui em vez de consertar o comentário.

type ItemSnapshot = Pick<
  InsertContratoItem,
  "tipo" | "vestidoId" | "descricao" | "valorUnitario" | "quantidade"
>;

/** True se o contrato existe, é da loja e está ATIVO. */
async function contratoAtivo(contratoId: string, lojaId: string): Promise<boolean> {
  const [c] = await db.select({ status: contratosTable.status }).from(contratosTable)
    .where(and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)));
  return c?.status === "ATIVO";
}

router.get("/lojas/:lojaId/contratos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const query = ListContratosQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "FILTRO_INVALIDO" });
    return;
  }
  // E62: mesmo recorte do listOrcamentos — o perfil da noiva pede só o dela.
  const contratos = await db.query.contratosTable.findMany({
    where: query.data.leadId
      ? and(eq(contratosTable.lojaId, lojaId), eq(contratosTable.leadId, query.data.leadId))
      : eq(contratosTable.lojaId, lojaId),
    with: {
      lead: true,
      vendedora: true,
    },
    orderBy: contratosTable.fechadoEm,
  });
  res.json(ListContratosResponse.parse(contratos));
});

router.post("/lojas/:lojaId/contratos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateContratoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const { parcelas: parcelasInput, ...contratoData } = parsed.data;

  // 1. Lead precisa existir e pertencer à loja.
  const [lead] = await db.select({
    id: leadsTable.id,
    etapa: leadsTable.etapa,
    contratoFechadoEm: leadsTable.contratoFechadoEm,
  }).from(leadsTable)
    .where(and(eq(leadsTable.id, contratoData.leadId), eq(leadsTable.lojaId, lojaId)));
  if (!lead) {
    res.status(422).json({ error: "LEAD_INVALIDO", detalhe: "Lead não encontrado nesta loja" });
    return;
  }

  // 1b. B4 — a vendedora do CORPO precisa ser desta loja. A FK só garante que o
  // id existe; sem esta linha, um contrato de A nascia com a vendedora de B, o
  // `GET /contratos` devolvia `with: { vendedora: true }` (e-mail, isSuperAdmin)
  // para dentro de A, e o fechamento de comissão gerava conta a pagar nominal a
  // quem nunca teve regra na loja.
  if (!(await vendedoraNaLoja(contratoData.vendedoraId, lojaId))) {
    res.status(422).json({ error: "REFERENCIA_INVALIDA", detalhe: "Vendedora não é desta loja" });
    return;
  }

  // 2. Um lead não pode ter dois contratos ATIVOS ao mesmo tempo.
  const [ativoExistente] = await db.select({ id: contratosTable.id }).from(contratosTable)
    .where(and(
      eq(contratosTable.leadId, contratoData.leadId),
      eq(contratosTable.lojaId, lojaId),
      eq(contratosTable.status, "ATIVO"),
    ));
  if (ativoExistente) {
    res.status(409).json({ error: "CONTRATO_ATIVO_DUPLICADO", detalhe: "Este lead já possui um contrato ativo" });
    return;
  }

  // 3. Orçamento (se informado): da loja, do mesmo lead, APROVADO, ainda não
  // vinculado a outro contrato. Seus itens viram snapshot do contrato.
  let itensSnapshot: ItemSnapshot[] = [];
  let descontoTipo: "PERCENTUAL" | "VALOR" | null = null;
  let descontoValor: number | null = null;
  if (contratoData.orcamentoId) {
    const orcamento = await db.query.orcamentosTable.findFirst({
      where: and(eq(orcamentosTable.id, contratoData.orcamentoId), eq(orcamentosTable.lojaId, lojaId)),
    });
    if (!orcamento) {
      res.status(422).json({ error: "ORCAMENTO_INVALIDO", detalhe: "Orçamento não encontrado nesta loja" });
      return;
    }
    if (orcamento.leadId !== contratoData.leadId) {
      res.status(422).json({ error: "ORCAMENTO_INVALIDO", detalhe: "Orçamento pertence a outro lead" });
      return;
    }
    if (orcamento.status !== "APROVADO") {
      res.status(422).json({ error: "ORCAMENTO_NAO_APROVADO", detalhe: `Orçamento está ${orcamento.status}` });
      return;
    }
    const [jaVinculado] = await db.select({ id: contratosTable.id }).from(contratosTable)
      .where(eq(contratosTable.orcamentoId, contratoData.orcamentoId));
    if (jaVinculado) {
      res.status(409).json({ error: "ORCAMENTO_JA_VINCULADO", detalhe: "Orçamento já pertence a outro contrato" });
      return;
    }
    const itens = await db.select().from(orcamentoItensTable)
      .where(eq(orcamentoItensTable.orcamentoId, contratoData.orcamentoId));

    // E115 — quando há aceite, o contrato tem de nascer do que a noiva VIU.
    // O E75 deixa editar os itens vivos depois do envio (a noiva vê a versão
    // congelada); se ela aceitou e o vivo divergiu do enviado, criar o
    // contrato pelos itens vivos faria a noiva assinar R$ 5.500 tendo aceite
    // registrado de R$ 5.000. A conferência é pelo MESMO hash do aceite
    // (`conteudoEnviado`, a régua única do congelamento).
    if (orcamento.aceiteHash) {
      const vivo = conteudoEnviado(itens, orcamento.descontoTipo, orcamento.descontoValor);
      if (vivo.hash !== orcamento.aceiteHash) {
        res.status(422).json({
          error: "ORCAMENTO_DIVERGE_DO_ACEITE",
          detalhe:
            "Os itens mudaram depois do envio que a noiva aceitou — o contrato tem de nascer do que ela viu. " +
            "Refaça os itens como estavam, ou crie e envie um novo orçamento para novo aceite.",
        });
        return;
      }
    }

    itensSnapshot = itens.map((it) => ({
      tipo: it.tipo,
      vestidoId: it.vestidoId,
      descricao: it.descricao,
      valorUnitario: it.valorUnitario,
      quantidade: it.quantidade,
    }));

    // Congela o desconto do orçamento e VALIDA o valorTotal contra os itens: o
    // líquido derivado (itens − desconto, em centavos) tem que bater exatamente
    // com o total informado. Sem isto, um total digitado errado — ou o desconto
    // que se perdia no snapshot — passava batido e virava a base de comissão,
    // parcelas e PDF, com a soma dos itens sem fechar com o total.
    descontoTipo = orcamento.descontoTipo;
    descontoValor = orcamento.descontoValor;
    const brutoC = brutoEmCentavos(itens);
    const liquidoC = liquidoEmCentavos(brutoC, orcamento.descontoTipo, orcamento.descontoValor);
    if (liquidoC !== cent(contratoData.valorTotal)) {
      res.status(422).json({
        error: "VALOR_TOTAL_NAO_BATE",
        detalhe: `Itens menos desconto (${reais(liquidoC)}) difere do valor total (${contratoData.valorTotal})`,
        // D6/E96: o número sozinho não diz onde mexer. Depois do E95 este 422
        // deixou de ser alcançável por arredondamento, mas continua valendo
        // para total digitado à mão — e aí o campo é o endereço do conserto.
        campos: [{ campo: "valorTotal", motivo: `O orçamento fecha em ${reais(liquidoC)}` }],
      });
      return;
    }
  }

  // 4. Se houver parcelas, a soma precisa bater com o valorTotal. Em CENTAVOS
  // inteiros, com igualdade EXATA — a regra de ouro do repo. Somar os reais em
  // float e comparar com tolerância (o que estava aqui) aceita um plano com um
  // centavo de folga e recusa um plano válido por erro de ponto flutuante.
  if (parcelasInput && parcelasInput.length > 0) {
    const somaC = parcelasInput.reduce((acc, p) => acc + cent(p.valorPrevisto), 0);
    if (somaC !== cent(contratoData.valorTotal)) {
      res.status(422).json({
        error: "PARCELAS_NAO_BATEM",
        detalhe: `Soma das parcelas (${reais(somaC)}) difere do valor total (${contratoData.valorTotal})`,
        campos: [{ campo: "entrada", motivo: `As parcelas somam ${reais(somaC)}` }],
      });
      return;
    }
  }

  // 5. Bloqueios (E72): da loja, com data coerente e sem conflito — cada um.
  // O singular legado entra na mesma lista; o vínculo vivo é o N:N.
  const bloqueioIds = [
    ...new Set([
      ...(contratoData.bloqueioVestidoId ? [contratoData.bloqueioVestidoId] : []),
      ...(contratoData.bloqueioVestidoIds ?? []),
    ]),
  ];
  for (const bloqueioId of bloqueioIds) {
    const [bloqueio] = await db.select().from(bloqueioVestidosTable)
      .where(and(
        eq(bloqueioVestidosTable.id, bloqueioId),
        eq(bloqueioVestidosTable.lojaId, lojaId),
      ));
    if (!bloqueio) {
      res.status(404).json({ error: "Bloqueio not found" });
      return;
    }
    /**
     * S2/E107 — a reserva tem de ser DESTA noiva.
     *
     * A conferência acima prova a LOJA e parava aí: um contrato da noiva A
     * podia prender o `bloqueio_vestido` da noiva B da mesma loja, e o vestido
     * que B provou e reservou passava a responder pelo contrato de A. Não é
     * vazamento entre lojas — por isso ficou fora do E91 —, mas é a mesma
     * família: **um id entrou sem prova de a quem pertence.**
     *
     * `bloqueio.leadId` NULO é o caso legítimo e comum: a reserva nasceu sem
     * dona (a loja segurou a peça antes de saber de quem seria) e este contrato
     * é justamente quem lhe dá dono. Só o vínculo com OUTRA noiva é recusado.
     */
    if (bloqueio.leadId && bloqueio.leadId !== contratoData.leadId) {
      res.status(422).json({
        error: "REFERENCIA_INVALIDA",
        detalhe: "Esta reserva de vestido é de outra noiva — escolha uma reserva desta noiva ou uma sem dona.",
        campos: [{ campo: "bloqueioVestidoIds", motivo: "A reserva pertence a outra noiva" }],
      });
      return;
    }
    /**
     * E107 fechou a metade fácil e deixou a outra aberta: a guarda acima só
     * morde quando o bloqueio JÁ tem dona, e **nenhuma rota escrevia
     * `bloqueio.lead_id`** — o campo nascia nulo e continuava nulo. O caso
     * comum era justamente o descoberto: 61 das 63 avarias do banco de
     * desenvolvimento vivem em bloqueio sem noiva.
     *
     * O que passava: contrato da noiva A prende o bloqueio B (leadId nulo,
     * `ignorarBloqueioId` faz B não conflitar consigo mesmo); dias depois, o
     * contrato da noiva C — com `dataCasamento` nulo, que pula a conferência
     * de data — prende o MESMO B. A PK de `contrato_bloqueios` é
     * (contratoId, bloqueioId) e não impede o segundo par. O vestido ficava
     * prometido a duas noivas para a mesma data, o portal das duas desenhava
     * "O seu vestido" com a mesma peça, e a loja só descobria na retirada.
     *
     * A prova que faltava é sobre o VÍNCULO, não sobre a dona: uma reserva é
     * de no máximo um contrato ATIVO. Contrato cancelado não conta — ele
     * libera a peça (soft-cancel do bloqueio) e a reserva volta ao mercado.
     */
    const [presoPor] = await db
      .select({ contratoId: contratoBloqueiosTable.contratoId })
      .from(contratoBloqueiosTable)
      .innerJoin(contratosTable, eq(contratosTable.id, contratoBloqueiosTable.contratoId))
      .where(and(
        eq(contratoBloqueiosTable.bloqueioId, bloqueioId),
        eq(contratosTable.status, "ATIVO"),
      ));
    if (presoPor) {
      res.status(409).json({
        error: "RESERVA_JA_CONTRATADA",
        detalhe: "Esta reserva de vestido já está presa por outro contrato ativo.",
        campos: [{ campo: "bloqueioVestidoIds", motivo: "A reserva já é de outro contrato" }],
      });
      return;
    }
    if (
      contratoData.dataCasamento &&
      bloqueio.casamentoData &&
      diaLocal(contratoData.dataCasamento) !== diaLocal(bloqueio.casamentoData)
    ) {
      res.status(422).json({ error: "dataCasamento do contrato diverge da data do bloqueio" });
      return;
    }
    const resultado = await verificarDisponibilidade({
      lojaId,
      vestidoId: bloqueio.vestidoId,
      candidato: bloqueio,
      ignorarBloqueioId: bloqueio.id,
      hoje: new Date(),
    });
    if (!resultado.disponivel) {
      res.status(409).json({ error: "VESTIDO_INDISPONIVEL", conflitos: resultado.conflitos });
      return;
    }
  }

  // Persistência atômica: contrato + parcelas + snapshot de itens.
  const result = await db.transaction(async (tx) => {
    const [contrato] = await tx.insert(contratosTable).values({
      id: randomUUID(),
      lojaId,
      leadId: contratoData.leadId,
      orcamentoId: contratoData.orcamentoId ?? null,
      bloqueioVestidoId: contratoData.bloqueioVestidoId ?? null,
      vendedoraId: contratoData.vendedoraId,
      cpf: contratoData.cpf ?? null,
      vestidoDescricao: contratoData.vestidoDescricao ?? null,
      valorTotal: contratoData.valorTotal,
      descontoTipo,
      descontoValor,
      formaPagamento: contratoData.formaPagamento ?? null,
      dataCasamento: contratoData.dataCasamento ?? null,
      dataRetirada: contratoData.dataRetirada ?? null,
      dataDevolucao: contratoData.dataDevolucao ?? null,
      observacoes: contratoData.observacoes ?? null,
      fechadoEm: new Date(),
    }).returning();

    if (parcelasInput && parcelasInput.length > 0) {
      await tx.insert(parcelasTable).values(
        parcelasInput.map((p) => ({
          id: randomUUID(),
          lojaId,
          contratoId: contrato.id,
          numero: p.numero,
          descricao: p.descricao ?? `Parcela ${p.numero}`,
          valorPrevisto: p.valorPrevisto,
          vencimento: p.vencimento,
          status: "PREVISTA" as const,
        }))
      );
    }

    if (itensSnapshot.length > 0) {
      await tx.insert(contratoItensTable).values(
        itensSnapshot.map((it) => ({
          id: randomUUID(),
          lojaId,
          contratoId: contrato.id,
          ...it,
        }))
      );
    }

    // E72: o vínculo vivo — todas as reservas físicas presas pelo contrato.
    if (bloqueioIds.length > 0) {
      await tx.insert(contratoBloqueiosTable).values(
        bloqueioIds.map((bloqueioId) => ({ contratoId: contrato.id, bloqueioId })),
      );
      // E o contrato DÁ DONO à reserva que não tinha — o que o comentário da
      // guarda S2/E107 já afirmava ("este contrato é justamente quem lhe dá
      // dono") e nenhuma linha fazia. Sem isto, `bloqueio.lead_id` seguia nulo
      // para sempre e a guarda de noiva nunca tinha o que comparar: nem aqui,
      // nem em `POST /avarias/:id/cobrar`, que depende do mesmo campo para
      // mandar o reparo ao carnê certo. Só as sem dona são tocadas — as com
      // dona já foram recusadas acima.
      await tx.update(bloqueioVestidosTable)
        .set({ leadId: contratoData.leadId, updatedAt: new Date() })
        .where(and(
          inArray(bloqueioVestidosTable.id, bloqueioIds),
          eq(bloqueioVestidosTable.lojaId, lojaId),
          isNull(bloqueioVestidosTable.leadId),
        ));
    }

    // Fechar contrato avança o funil do lead (nunca regride).
    const etapaNova = avancarEtapaLead(lead.etapa, "CONTRATO_FECHADO");
    if (etapaNova !== lead.etapa) {
      await tx.update(leadsTable)
        .set({
          etapa: etapaNova,
          contratoFechadoEm: lead.contratoFechadoEm ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(leadsTable.id, lead.id));
    }

    return contrato;
  });

  const fullContrato = await db.query.contratosTable.findFirst({
    where: eq(contratosTable.id, result.id),
    with: { lead: true, vendedora: true, parcelas: true, itens: true }
  });

  res.status(201).json(CreateContratoResponse.parse(fullContrato));
});

router.get("/lojas/:lojaId/contratos/:contratoId", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params;
  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId as string), eq(contratosTable.lojaId, lojaId as string)),
    with: { lead: true, vendedora: true, parcelas: true, itens: true }
  });
  if (!contrato) {
    res.status(404).json({ error: "Contrato not found" });
    return;
  }
  // E72: as reservas físicas presas por este contrato.
  const vinculos = await db
    .select({ bloqueioId: contratoBloqueiosTable.bloqueioId })
    .from(contratoBloqueiosTable)
    .where(eq(contratoBloqueiosTable.contratoId, contratoId as string));
  res.json(
    GetContratoResponse.parse({
      ...contrato,
      bloqueioVestidoIds: vinculos.map((v) => v.bloqueioId),
    }),
  );
});

// PDF do contrato. Escopado por loja (contrato de outra loja → 404) e gerado na
// hora a partir do estado atual — nada é persistido.
router.get("/lojas/:lojaId/contratos/:contratoId/pdf", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
    with: { loja: true, lead: true, parcelas: true, itens: true },
  });
  if (!contrato) {
    res.status(404).json({ error: "Contrato not found" });
    return;
  }

  // E100/F21: a montagem do papel saiu daqui e virou régua — o portal serve o
  // MESMO documento pelo token da noiva. O escopo (a loja da URL) fica na rota.
  res.status(200)
    .type("application/pdf")
    .setHeader("Content-Disposition", `inline; filename="${nomeDoArquivo(contrato)}"`);
  res.send(Buffer.from(pdfDoContrato(contrato)));
});

router.patch("/lojas/:lojaId/contratos/:contratoId", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params;
  const parsed = UpdateContratoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  /**
   * O PATCH grava `dataCasamento` sem repetir NENHUMA das duas provas que o
   * POST faz sobre ela: a coerência com `bloqueio.casamentoData` e o
   * `verificarDisponibilidade` da peça. Fechar o contrato para 10/05 e depois
   * mover a data por aqui era o caminho aberto para o mesmo estrago que a
   * criação recusa — o vestido reservado para uma data e o contrato prometendo
   * outra, ou a peça já ocupada na data nova.
   *
   * As reservas presas vêm do vínculo vivo (E72), e a conferência é a mesma
   * função do POST — a régua é uma só.
   */
  if (parsed.data.dataCasamento) {
    const vinculos = await db
      .select({ bloqueioId: contratoBloqueiosTable.bloqueioId })
      .from(contratoBloqueiosTable)
      .where(eq(contratoBloqueiosTable.contratoId, contratoId as string));
    for (const { bloqueioId } of vinculos) {
      const [bloqueio] = await db.select().from(bloqueioVestidosTable)
        .where(and(
          eq(bloqueioVestidosTable.id, bloqueioId),
          eq(bloqueioVestidosTable.lojaId, lojaId as string),
          isNull(bloqueioVestidosTable.canceladoEm),
        ));
      if (!bloqueio) continue;
      if (
        bloqueio.casamentoData &&
        diaLocal(parsed.data.dataCasamento) !== diaLocal(bloqueio.casamentoData)
      ) {
        res.status(422).json({
          error: "DATA_DIVERGE_DA_RESERVA",
          detalhe: "A data do casamento diverge da data da reserva do vestido — mude a reserva primeiro.",
          campos: [{ campo: "dataCasamento", motivo: "Diverge da reserva do vestido" }],
        });
        return;
      }
    }
  }

  const [contrato] = await db.update(contratosTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(contratosTable.id, contratoId as string), eq(contratosTable.lojaId, lojaId as string)))
    .returning();

  if (!contrato) {
    res.status(404).json({ error: "Contrato not found" });
    return;
  }
  res.json(UpdateContratoResponse.parse(contrato));
});

router.post("/lojas/:lojaId/contratos/:contratoId/cancelar", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
  const parsed = CancelarContratoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
  });
  if (!contrato) {
    res.status(404).json({ error: "Contrato not found" });
    return;
  }
  if (contrato.status === "CANCELADO") {
    res.status(409).json({ error: "CONTRATO_JA_CANCELADO", detalhe: "Contrato já está cancelado" });
    return;
  }

  const agora = new Date();
  // Lidas ANTES de qualquer escrita: é o único momento em que ainda dá para
  // saber o que o cancelamento vai desfazer, e é isso que a trilha guarda (B3).
  const parcelasAntes = await db
    .select()
    .from(parcelasTable)
    .where(eq(parcelasTable.contratoId, contrato.id));

  // Dinheiro que já entrou nesta venda, venha de parcela quitada ou meio paga.
  const comRecebimento = parcelasAntes.filter((p) => (p.valorRecebido ?? 0) > 0);
  const idsComRecebimento = comRecebimento.map((p) => p.id);
  const totalRecebidoAntes = reais(
    comRecebimento.reduce((s, p) => s + cent(p.valorRecebido ?? 0), 0),
  );
  const abertasAntes = parcelasAntes.filter((p) => estaAberta(p));
  const totalAbertoAntes = reais(
    abertasAntes.reduce(
      (s, p) => s + Math.max(0, cent(p.valorPrevisto) - cent(p.valorRecebido ?? 0)),
      0,
    ),
  );

  await db.transaction(async (tx) => {
    // `comissaoEstornadaEm` NÃO é gravado aqui: ele marca quando o estorno foi
    // RECONCILIADO num fechamento, e não quando o contrato caiu (isso é o
    // `canceladoEm`). Deixá-lo nulo é o que mantém o estorno §6.4 pendente para
    // o próximo fechamento abater; preenchê-lo agora faria a comissão já paga
    // sobre esta venda nunca voltar.
    await tx.update(contratosTable)
      .set({
        status: "CANCELADO",
        canceladoEm: agora,
        canceladoMotivo: parsed.data.motivo,
        updatedAt: agora,
      })
      .where(and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)));

    // Parcelas em ABERTO sempre são canceladas — PREVISTA e PARCIAL (E49).
    //
    // E94: aqui estava `eq(status, "PREVISTA")`, a mesma omissão do C4 uma
    // rota adiante. A parcela meio recebida sobrevivia ao cancelamento como
    // PARCIAL, isto é: seguia ABERTA (`estaAberta`), continuava no horizonte,
    // no aging e na cobrança de um contrato que não existe mais. O saldo que
    // falta nela morreu junto com o contrato, sob qualquer `destinoPago`.
    await tx.update(parcelasTable)
      .set({ status: "CANCELADA" })
      .where(and(
        eq(parcelasTable.contratoId, contrato.id),
        inArray(parcelasTable.status, [...STATUS_ABERTO]),
      ));

    // Sobre o que JÁ ENTROU decide o destinoPago: "manter" (default — noiva
    // perdeu o sinal, valor fica no caixa) ou "estornar" (valor devolvido — os
    // campos de recebimento são zerados e a receita devolve o dinheiro).
    //
    // A PARCIAL entra aqui também: sob "estornar" a loja está dizendo que
    // devolveu o dinheiro, e os R$ 4.000 de uma parcela meio paga são tão
    // devolvidos quanto os R$ 10.000 de uma quitada. Ela já virou CANCELADA no
    // UPDATE acima; este segundo passo zera o que ela tinha recebido.
    if (parsed.data.destinoPago === "estornar" && idsComRecebimento.length > 0) {
      await tx.update(parcelasTable)
        .set({
          status: "CANCELADA",
          valorRecebido: null,
          recebidoEm: null,
          formaRecebimento: null,
          // E115 — o estorno em massa esquecia os dois carimbos que o avulso
          // limpa. `conciliadoEm` é o invariante da própria coluna ("movimento
          // que deixou de existir não pode continuar conferido"); e
          // `enviadoContabilidadeEm` é OPERACIONAL — alimenta o isNull do
          // próximo envio, então mantê-lo deixaria um recebimento re-lançado
          // fora de todo pacote futuro da contadora.
          conciliadoEm: null,
          enviadoContabilidadeEm: null,
        })
        .where(and(
          eq(parcelasTable.contratoId, contrato.id),
          inArray(parcelasTable.id, idsComRecebimento),
        ));
    }

    // Libera as peças: soft-cancela TODOS os bloqueios vinculados (E72) —
    // o N:N e o singular legado, se ainda existir fora dele.
    const vinculos = await tx
      .select({ bloqueioId: contratoBloqueiosTable.bloqueioId })
      .from(contratoBloqueiosTable)
      .where(eq(contratoBloqueiosTable.contratoId, contratoId));
    const idsALiberar = [
      ...new Set([
        ...vinculos.map((v) => v.bloqueioId),
        ...(contrato.bloqueioVestidoId ? [contrato.bloqueioVestidoId] : []),
      ]),
    ];
    if (idsALiberar.length > 0) {
      await tx.update(bloqueioVestidosTable)
        .set({ canceladoEm: agora, updatedAt: agora })
        .where(and(
          inArray(bloqueioVestidosTable.id, idsALiberar),
          eq(bloqueioVestidosTable.lojaId, lojaId),
          isNull(bloqueioVestidosTable.canceladoEm),
        ));
    }

    /**
     * B3/E94 — a trilha do cancelamento, DENTRO da transação.
     *
     * Esta é a maior ação de dinheiro do sistema e era a única sem rastro: ela
     * anula as parcelas em aberto e, com `destinoPago: "estornar"`, zera o
     * recebido das que já tinham entrado — tirando da receita dinheiro que a
     * loja contou. A ação irmã e MENOR, estornar uma parcela sozinha, sempre
     * gravou. Quem conferisse o caixa via a receita cair sem uma linha que
     * explicasse por quê, e o `motivo` digitado morria no contrato, invisível
     * para a trilha e para o CSV da contadora.
     *
     * Os totais são lidos ANTES das escritas de propósito: depois delas o
     * `valorRecebido` já é nulo, e o que o cancelamento desfez seria
     * irrecuperável — que é exatamente o que a trilha existe para impedir.
     */
    await registrarAuditoria(tx, {
      lojaId: lojaId as string,
      usuario: req.usuario!,
      acao: "CONTRATO_CANCELADO",
      entidade: "contrato",
      entidadeId: contrato.id,
      detalhe: {
        motivo: parsed.data.motivo,
        destinoPago: parsed.data.destinoPago ?? "manter",
        valorTotal: contrato.valorTotal,
        // O que o cancelamento desfez, nas duas pernas: o que já tinha entrado
        // (e voltou, se estornou) e o que deixou de ser cobrável.
        totalRecebido: totalRecebidoAntes,
        totalEstornado: parsed.data.destinoPago === "estornar" ? totalRecebidoAntes : 0,
        parcelasEstornadas:
          parsed.data.destinoPago === "estornar" ? idsComRecebimento.length : 0,
        parcelasAnuladas: abertasAntes.length,
        totalAnulado: totalAbertoAntes,
      },
    });
  });

  const fullContrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
    with: { lead: true, vendedora: true, parcelas: true, itens: true }
  });
  res.json(CancelarContratoResponse.parse(fullContrato));
});

// Parcelas
//
// A8/E104 — `GET /contratos/:id/parcelas` foi REMOVIDA. Ela não estava no spec,
// não tinha hook gerado, nenhuma tela a chamava e nenhum E2E a tocava: o único
// consumidor era um teste. E era redundante mesmo para quem só tem `leads` —
// `GET /contratos/:id` devolve `with: { parcelas: true }` no mesmo gate.
//
// Com ela some a última entrada viva da allowlist do `lote2`, e o invariante
// **spec = servidor** passa a ser total, não "total menos uma".

router.post("/lojas/:lojaId/parcelas/:parcelaId/receber", requireModulo("leads", "editar"), async (req, res): Promise<void> => {
  const { lojaId, parcelaId } = req.params;
  const parsed = ReceberParcelaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const [existente] = await db.select().from(parcelasTable)
    .where(and(eq(parcelasTable.id, parcelaId as string), eq(parcelasTable.lojaId, lojaId as string)));
  if (!existente) {
    res.status(404).json({ error: "Parcela not found" });
    return;
  }
  if (existente.status === "PAGA") {
    res.status(409).json({ error: "PARCELA_JA_RECEBIDA", detalhe: "Esta parcela já foi recebida" });
    return;
  }
  if (existente.status === "CANCELADA") {
    res.status(422).json({ error: "PARCELA_CANCELADA", detalhe: "Parcela cancelada não pode ser recebida" });
    return;
  }
  if (!(await contratoAtivo(existente.contratoId, lojaId as string))) {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }

  /**
   * `valorRecebido` do corpo é o que entrou AGORA, não o total (E49): uma
   * parcela pode ser recebida em partes, e o acumulado é que decide o status.
   * Quitou? PAGA. Sobrou? PARCIAL — o dinheiro entra no caixa e o resto segue
   * cobrável, em vez de sumir do "a receber" (marcada PAGA faltando dinheiro)
   * ou de ficar 100% aberta (o que entrou não apareceria no caixa).
   */
  const jaRecebidoC = cent(existente.valorRecebido ?? 0);
  const entrandoC = cent(parsed.data.valorRecebido);
  const saldoC = cent(existente.valorPrevisto) - jaRecebidoC;

  // Receber mais que o saldo é recusado, e não clampado: o caso comum é dígito
  // a mais, e aceitar inflaria o caixa REALIZADO com dinheiro que não entrou —
  // um erro que só aparece na conciliação. A mensagem diz quanto falta, que é
  // o que a vendedora precisa para digitar de novo.
  if (entrandoC > saldoC) {
    res.status(422).json({
      error: "VALOR_ACIMA_DO_SALDO",
      detalhe: `Faltam R$ ${reais(saldoC).toFixed(2)} nesta parcela — o valor informado é maior.`,
    });
    return;
  }

  const totalRecebidoC = jaRecebidoC + entrandoC;
  const quitada = totalRecebidoC >= cent(existente.valorPrevisto);

  const parcela = await db.transaction(async (tx) => {
    /**
     * B6/E94 — UPDATE condicional ao estado LIDO, o mesmo idioma de
     * `convites.ts:111` e `portal.ts:255`.
     *
     * Tudo acima desta linha — `jaRecebidoC`, a checagem do saldo, o
     * `totalRecebidoC` — foi calculado a partir de um SELECT feito fora da
     * transação. Entre aquele SELECT e este UPDATE cabe outro recebimento
     * inteiro: a recepção lança R$ 300 e a vendedora R$ 700 no mesmo segundo,
     * as duas leem `valorRecebido = 0`, uma grava 300 e a outra 700, e a
     * última a escrever vence. R$ 300 entraram na gaveta e não existem no
     * sistema.
     *
     * Nenhuma constraint do banco resolve isto — o valor certo depende do que
     * foi lido, não de uma unicidade. O que resolve é escrever apenas se a
     * parcela ainda estiver como a lemos: `IS NOT DISTINCT FROM` porque
     * `valorRecebido` é nulo enquanto nada entrou, e `= NULL` nunca é
     * verdadeiro. O `status` entra junto para fechar a janela em que um
     * cancelamento de contrato passa por aqui no meio.
     */
    const [atualizada] = await tx.update(parcelasTable)
      .set({
        status: quitada ? "PAGA" : "PARCIAL",
        // O instante do ÚLTIMO recebimento: é por ele que o caixa realizado
        // data a entrada, e a última parcela do acordo é o que fecha a conta.
        recebidoEm: parsed.data.recebidoEm,
        valorRecebido: reais(totalRecebidoC),
        formaRecebimento: parsed.data.formaRecebimento,
      })
      .where(and(
        eq(parcelasTable.id, existente.id),
        eq(parcelasTable.status, existente.status),
        sql`${parcelasTable.valorRecebido} is not distinct from ${existente.valorRecebido}::numeric`,
      ))
      .returning();
    // Zero linhas: alguém recebeu nesta parcela entre o nosso SELECT e agora.
    // Sair sem auditar é parte do conserto — trilha de um recebimento que não
    // aconteceu faz a conferência bater com dinheiro inexistente.
    if (!atualizada) return null;
    await registrarAuditoria(tx, {
      lojaId: lojaId as string,
      usuario: req.usuario!,
      acao: "PARCELA_RECEBIDA",
      entidade: "parcela",
      entidadeId: existente.id,
      detalhe: {
        contratoId: existente.contratoId,
        numero: existente.numero,
        // O que entrou NESTE recebimento (a trilha é por ação), mais o
        // acumulado e o que sobrou — sem eles um recebimento parcial na
        // trilha não diz se quitou.
        valorRecebido: parsed.data.valorRecebido,
        totalRecebido: reais(totalRecebidoC),
        saldoRestante: reais(cent(existente.valorPrevisto) - totalRecebidoC),
        formaRecebimento: parsed.data.formaRecebimento ?? null,
      },
    });
    return atualizada;
  });
  if (!parcela) {
    res.status(409).json({
      error: "PARCELA_MUDOU",
      detalhe: "Esta parcela mudou enquanto você digitava — confira o valor e tente de novo.",
    });
    return;
  }
  res.json(ReceberParcelaResponse.parse(parcela));
});

// Estorno avulso: PAGA volta a PREVISTA (volta a ser cobrável), zerando os
// campos de recebimento. Distinto do estorno em massa do cancelamento com
// destinoPago=estornar, que marca as pagas como CANCELADA.
router.post("/lojas/:lojaId/parcelas/:parcelaId/estornar", async (req, res): Promise<void> => {
  const { lojaId, parcelaId } = req.params;

  const [existente] = await db.select().from(parcelasTable)
    .where(and(eq(parcelasTable.id, parcelaId as string), eq(parcelasTable.lojaId, lojaId as string)));
  if (!existente) {
    res.status(404).json({ error: "Parcela not found" });
    return;
  }
  // PARCIAL também estorna (E49). O estorno é tudo-ou-nada: a parcela não tem
  // livro de recebimentos, só o acumulado — desfazer "o último pagamento" não
  // é uma operação que o dado sustente. Volta a PREVISTA, zerada, e a trilha
  // guarda quanto foi desfeito.
  if (existente.status !== "PAGA" && existente.status !== "PARCIAL") {
    res.status(422).json({ error: "PARCELA_NAO_PAGA", detalhe: "Só parcelas com recebimento podem ser estornadas" });
    return;
  }
  // Estornar devolve a parcela a PREVISTA (cobrável). Num contrato cancelado
  // isso ressuscitaria uma cobrança de um contrato morto — a receita/DRE leem
  // PREVISTA. Só contrato ativo pode ter parcela mexida.
  if (!(await contratoAtivo(existente.contratoId, lojaId as string))) {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }

  /**
   * S6/E107 — a última leitura-fora-da-transação do módulo.
   *
   * As guardas acima leem a parcela FORA da transação e o `SET` de dentro é
   * absoluto (sempre PREVISTA/null). Dois cliques simultâneos convergem no
   * banco — o estado final é o mesmo —, e por isso o achado é 🔵 e não 🟠: não
   * se perde dinheiro. **O que se perde é a verdade da trilha.**
   *
   * Os dois leem `valorRecebido: 1.000` e os dois gravam
   * `RECEBIMENTO_ESTORNADO` com 1.000 no detalhe: a auditoria passa a dizer que
   * R$ 2.000 foram estornados de uma parcela de R$ 1.000. Quem for reconstituir
   * o caixa pela trilha — que é exatamente para isso que ela existe — encontra
   * um buraco que nunca houve.
   *
   * O conserto é o do B6: o `UPDATE` é CONDICIONAL ao status ainda ser
   * recebido. Só um dos dois casa, e só ele audita. O perdedor não recebe erro:
   * ele pediu "estornada" e a parcela está estornada.
   */
  const parcela = await db.transaction(async (tx) => {
    const [atualizada] = await tx.update(parcelasTable)
      .set({
        status: "PREVISTA",
        valorRecebido: null,
        recebidoEm: null,
        formaRecebimento: null,
        // F32/E103: o movimento deixou de existir, então não pode continuar
        // "conferido com o extrato". Sem esta linha o carimbo fica órfão e a
        // conciliação seguinte pula uma linha que voltou a ser divergência.
        conciliadoEm: null,
        // E115: o carimbo da contadora sai junto. Ele não guarda história (a
        // trilha guarda) — ele alimenta o `isNull` do próximo envio, e mantê-lo
        // faria o recebimento re-lançado nunca entrar em pacote nenhum.
        enviadoContabilidadeEm: null,
      })
      .where(and(
        eq(parcelasTable.id, existente.id),
        inArray(parcelasTable.status, ["PAGA", "PARCIAL"]),
      ))
      .returning();
    if (!atualizada) {
      const [atual] = await tx.select().from(parcelasTable)
        .where(eq(parcelasTable.id, existente.id));
      return atual;
    }
    await registrarAuditoria(tx, {
      lojaId: lojaId as string,
      usuario: req.usuario!,
      acao: "RECEBIMENTO_ESTORNADO",
      entidade: "parcela",
      entidadeId: existente.id,
      detalhe: {
        contratoId: existente.contratoId,
        numero: existente.numero,
        // O que o estorno desfez — some da parcela, fica na trilha.
        valorRecebido: existente.valorRecebido,
        recebidoEm: existente.recebidoEm,
      },
    });
    return atualizada;
  });
  res.json(EstornarParcelaResponse.parse(parcela));
});

router.delete("/lojas/:lojaId/parcelas/:parcelaId", async (req, res): Promise<void> => {
  const { lojaId, parcelaId } = req.params;

  const [existente] = await db.select().from(parcelasTable)
    .where(and(eq(parcelasTable.id, parcelaId as string), eq(parcelasTable.lojaId, lojaId as string)));
  if (!existente) {
    res.status(404).json({ error: "Parcela not found" });
    return;
  }
  if (existente.status !== "PREVISTA") {
    res.status(422).json({ error: "PARCELA_NAO_PREVISTA", detalhe: "Só parcelas previstas podem ser removidas" });
    return;
  }
  const [contrato] = await db.select({ status: contratosTable.status }).from(contratosTable)
    .where(eq(contratosTable.id, existente.contratoId));
  if (!contrato || contrato.status !== "ATIVO") {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }

  // A trilha vem ANTES do delete, na mesma transação — é a operação espelho do
  // `CONTA_PAGAR_REMOVIDA` que o E107 criou do lado das contas a pagar, pelo
  // mesmo motivo: some com uma obrigação, não move caixa realizado (a parcela
  // paga é recusada acima), e depois do DELETE não há linha para consultar.
  // O que não estiver no detalhe está perdido.
  await db.transaction(async (tx) => {
    await registrarAuditoria(tx, {
      lojaId: lojaId as string,
      usuario: req.usuario!,
      acao: "PARCELA_REMOVIDA",
      entidade: "parcela",
      entidadeId: existente.id,
      detalhe: {
        contratoId: existente.contratoId,
        numero: existente.numero,
        descricao: existente.descricao,
        valorPrevisto: existente.valorPrevisto,
        vencimento: existente.vencimento,
      },
    });
    await tx.delete(parcelasTable).where(eq(parcelasTable.id, existente.id));
  });
  res.status(204).send();
});

// Gera o plano de pagamento de um contrato sem parcelas. Valores e datas saem
// de `montarPlanoParcelas` (financeiro-core) — a mesma função que a tela de
// orçamento usa para montar o carnê e para mostrar a prévia dele.
// Entrada (se > 0) vira a linha `numero 0` no primeiro vencimento e as N
// parcelas começam um período depois.
// E71: cobrança que nasce DEPOIS do plano — multa por devolução atrasada,
// reparo de avaria, ajuste extra. Entra como parcela do contrato e a régua de
// cobrança, o extrato e o caixa a tratam como qualquer outra.
router.post("/lojas/:lojaId/contratos/:contratoId/parcelas", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
  const parsed = CreateParcelaAvulsaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
    with: { parcelas: true },
  });
  if (!contrato) {
    res.status(422).json({ error: "CONTRATO_INVALIDO", detalhe: "Contrato não encontrado nesta loja" });
    return;
  }
  if (contrato.status !== "ATIVO") {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: `Contrato está ${contrato.status}` });
    return;
  }

  // Próximo número livre; a UNIQUE (contrato, numero) segura o duplo POST.
  const numero = contrato.parcelas.reduce((maior, p) => Math.max(maior, p.numero), 0) + 1;
  const [parcela] = await db
    .insert(parcelasTable)
    .values({
      id: randomUUID(),
      lojaId,
      contratoId,
      numero,
      descricao: parsed.data.descricao,
      valorPrevisto: parsed.data.valorPrevisto,
      vencimento: parsed.data.vencimento,
    })
    .returning();
  res.status(201).json(CreateParcelaAvulsaResponse.parse(parcela));
});

router.post("/lojas/:lojaId/contratos/:contratoId/parcelas/gerar-plano", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
  const parsed = GerarPlanoParcelasBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
    with: { parcelas: true },
  });
  if (!contrato) {
    res.status(404).json({ error: "Contrato not found" });
    return;
  }
  if (contrato.status !== "ATIVO") {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }
  if (contrato.parcelas.length > 0) {
    res.status(409).json({ error: "JA_TEM_PLANO", detalhe: "Contrato já possui parcelas" });
    return;
  }

  const totalCentavos = cent(Number(contrato.valorTotal));
  const entradaCentavos = cent(parsed.data.entrada ?? 0);
  if (entradaCentavos > totalCentavos) {
    res.status(422).json({ error: "ENTRADA_MAIOR", detalhe: "Entrada maior que o valor total do contrato" });
    return;
  }

  // E95: o carnê sai do MESMO `montarPlanoParcelas` que a tela de orçamento
  // usa. Antes esta rota espaçava por 30 dias corridos e a tela por mês, e
  // `primeiroVencimento` significava a ENTRADA aqui e a PARCELA 1 lá — o mesmo
  // campo mudando de sentido conforme houvesse entrada. A régua agora é uma:
  // mensal por dia fixo, e `primeiroVencimento` é sempre a parcela 1.
  const plano = montarPlanoParcelas({
    totalCentavos,
    entradaCentavos,
    numParcelas: parsed.data.numParcelas,
    primeiroVencimento: diaDeNegocio(parsed.data.primeiroVencimento),
    vencimentoEntrada: parsed.data.vencimentoEntrada
      ? diaDeNegocio(parsed.data.vencimentoEntrada)
      : undefined,
  });

  const linhas: (typeof parcelasTable.$inferInsert)[] = plano.map((p) => ({
    id: randomUUID(),
    lojaId,
    contratoId: contrato.id,
    numero: p.numero,
    descricao: p.descricao,
    valorPrevisto: reais(p.valorCentavos),
    vencimento: ancoraDeNegocio(p.vencimento),
  }));

  // createMany atômico: sem plano parcial.
  const criadas = await db.insert(parcelasTable).values(linhas).returning();
  criadas.sort((a, b) => a.numero - b.numero);
  res.status(201).json(GerarPlanoParcelasResponse.parse(criadas));
});

export default router;
