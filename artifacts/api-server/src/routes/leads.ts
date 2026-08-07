import { Router, type IRouter } from "express";
import { db, leadsTable, leadInteressesTable, leadInteresseAtributosTable, registrosCobrancaTable, usuariosTable, atendimentosTable, contratosTable, orcamentosTable, bloqueioVestidosTable } from "@workspace/db";
import { eq, and, desc, or, ilike, sql, count, inArray, gte, lt } from "drizzle-orm";
import { atributosDaLoja } from "../lib/escopo-loja";
import {
  ListLeadsResponse,
  ListLeadsQueryParams,
  CreateLeadBody,
  CreateLeadResponse,
  GetLeadResponse,
  UpdateLeadBody,
  UpdateLeadResponse,
  SetLeadInteresseBody,
  SetLeadInteresseResponse,
  ListRegistrosCobrancaResponse,
  CreateRegistroCobrancaBody,
  CreateRegistroCobrancaResponse,
  GetConversaoLeadsResponse,
  GetSazonalidadeCasamentosResponse,
  GetDesempenhoVendedorasResponse,
  ExpurgarLeadsPerdidosBody,
  ExpurgarLeadsPerdidosResponse,
  PreviaExpurgoLeadsPerdidosQueryParams,
  GetConversaoLeadsQueryParams,
  PreviaExpurgoLeadsPerdidosResponse,
  GetLeadsParadosResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { randomUUID } from "node:crypto";
import { transicaoLeadValida, converteu, ETAPAS_CONVERTIDA, type LeadEtapa } from "../lib/estados";
import { registrarAuditoria } from "../lib/auditoria";
import { ultimoContatoPorLead } from "../lib/ultimo-contato";
import { leadParado, ETAPAS_EM_NEGOCIACAO } from "@workspace/funil-core";
import { addDias, addMeses, hojeLocal, inicioDoDia } from "@workspace/financeiro-core";
import { erroDeValidacao } from "../lib/erros";

const router: IRouter = Router();

/** Carimba o marco temporal da etapa (só se ainda não preenchido). */
function carimboEtapa(
  etapa: LeadEtapa,
  atual: { orcamentoAbertoEm: Date | null; contratoFechadoEm: Date | null; perdidaEm: Date | null },
): Partial<{ orcamentoAbertoEm: Date; contratoFechadoEm: Date; perdidaEm: Date }> {
  const agora = new Date();
  if (etapa === "ORCAMENTO_ABERTO" && !atual.orcamentoAbertoEm) return { orcamentoAbertoEm: agora };
  if (etapa === "CONTRATO_FECHADO" && !atual.contratoFechadoEm) return { contratoFechadoEm: agora };
  if (etapa === "PERDIDO" && !atual.perdidaEm) return { perdidaEm: agora };
  return {};
}

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/leads", requireModulo("leads"));

// E77: o direito de acesso — tudo que o sistema sabe sobre a noiva, num JSON
// para download. Sem schema fechado de propósito: é um retrato, não uma API.
router.get("/lojas/:lojaId/leads/:leadId/exportar", async (req, res): Promise<void> => {
  const { lojaId, leadId } = req.params as { lojaId: string; leadId: string };
  const lead = await db.query.leadsTable.findFirst({
    where: and(eq(leadsTable.id, leadId), eq(leadsTable.lojaId, lojaId)),
    with: { interesse: { with: { atributos: true } } },
  });
  if (!lead) {
    res.status(404).json({ error: "LEAD_NAO_ENCONTRADO", detalhe: "Esta noiva não existe nesta loja." });
    return;
  }
  const [contatos, orcamentos, contratos] = await Promise.all([
    db.select().from(registrosCobrancaTable).where(eq(registrosCobrancaTable.leadId, leadId)),
    db.query.orcamentosTable.findMany({
      where: and(eq(orcamentosTable.leadId, leadId), eq(orcamentosTable.lojaId, lojaId)),
      with: { itens: true },
    }),
    db.query.contratosTable.findMany({
      where: and(eq(contratosTable.leadId, leadId), eq(contratosTable.lojaId, lojaId)),
      with: { itens: true, parcelas: true },
    }),
  ]);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="dados-${lead.noivaNome.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.json"`,
  );
  res.json({
    exportadoEm: new Date().toISOString(),
    lead,
    contatosRegistrados: contatos,
    orcamentos,
    contratos,
  });
});

router.get("/lojas/:lojaId/leads", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = ListLeadsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "FILTRO_INVALIDO" });
    return;
  }
  const { q, etapa, pagina, porPagina, ordem } = parsed.data;

  const condicoes = [eq(leadsTable.lojaId, lojaId)];
  if (etapa) condicoes.push(eq(leadsTable.etapa, etapa));
  const busca = q?.trim();
  if (busca) {
    const padrao = `%${busca}%`;
    const porCampo = [ilike(leadsTable.noivaNome, padrao), ilike(leadsTable.noivoNome, padrao)];
    // Dígitos casam contra o whatsapp SEM máscara: "11988" encontra
    // "(11) 98888-7777" — mesma expressão do índice trigram dos extras.
    const soDigitos = busca.replace(/\D/g, "");
    if (soDigitos.length >= 4) {
      porCampo.push(
        sql`regexp_replace(coalesce(${leadsTable.whatsapp}, ''), '\\D', '', 'g') LIKE ${`%${soDigitos}%`}`,
      );
    }
    condicoes.push(or(...porCampo)!);
  }
  const where = and(...condicoes);

  // `total` conta o filtro inteiro; sem pagina/porPagina a resposta segue
  // completa — os pickers (agenda, orçamentos) dependem da lista cheia.
  const paginado = pagina !== undefined || porPagina !== undefined;
  const tamanho = porPagina ?? 24;
  const [contagem, leads] = await Promise.all([
    db.select({ total: count() }).from(leadsTable).where(where),
    db.query.leadsTable.findMany({
      where,
      with: {
        interesse: {
          with: {
            atributos: true
          }
        }
      },
      // id desempata createdAt igual — sem ordem estável, página 2 repete item.
      orderBy:
        ordem === "recentes"
          ? [desc(leadsTable.createdAt), desc(leadsTable.id)]
          : [leadsTable.createdAt, leadsTable.id],
      ...(paginado ? { limit: tamanho, offset: ((pagina ?? 1) - 1) * tamanho } : {}),
    }),
  ]);

  const contatos = await ultimoContatoPorLead(leads.map((l) => l.id));

  res.json(ListLeadsResponse.parse({
    total: contagem[0]!.total,
    itens: leads.map(l => ({
      ...l,
      ultimoContatoEm: contatos.get(l.id) ?? null,
      interesse: l.interesse ?? undefined,
    })),
  }));
});

router.post("/lojas/:lojaId/leads", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const [lead] = await db.insert(leadsTable).values({
    id: randomUUID(),
    lojaId,
    ...parsed.data,
  }).returning();

  // Lead recém-criado nunca tem contato registrado — explícito para o campo
  // significar o mesmo em toda resposta que devolve um Lead.
  res.status(201).json(CreateLeadResponse.parse({ ...lead, ultimoContatoEm: null, interesse: undefined }));
});

/**
 * Relatório de conversão (E34): o consumidor que faltava para o `perdidaMotivo`
 * (E4) e a `origem` (E19). Dois agregados puros — quanto cada canal trouxe e
 * quantos fecharam, e por que as noivas se perderam. Vem ANTES de `/:leadId`
 * para "conversao" não ser lido como um id de lead.
 */
router.get("/lojas/:lojaId/leads/conversao", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  // E142/D7: `de`/`ate` recortam pelo dia de ENTRADA do lead (dia local) —
  // numerador e denominador do MESMO período por construção (o WHERE é um).
  // Sem params, a história inteira, como sempre foi.
  const query = GetConversaoLeadsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json(erroDeValidacao(query.error));
    return;
  }
  const { de, ate } = query.data;
  const janela = [
    ...(de ? [gte(leadsTable.createdAt, inicioDoDia(de))] : []),
    ...(ate ? [lt(leadsTable.createdAt, inicioDoDia(addDias(ate, 1)))] : []),
  ];

  const porOrigem = await db
    .select({
      origem: leadsTable.origem,
      total: count(),
      convertidos: sql<number>`count(*) filter (where ${inArray(leadsTable.etapa, [...ETAPAS_CONVERTIDA])})`.mapWith(Number),
    })
    .from(leadsTable)
    .where(and(eq(leadsTable.lojaId, lojaId), ...janela))
    .groupBy(leadsTable.origem);

  const porMotivoPerda = await db
    .select({ motivo: leadsTable.perdidaMotivo, total: count() })
    .from(leadsTable)
    .where(and(eq(leadsTable.lojaId, lojaId), eq(leadsTable.etapa, "PERDIDO"), ...janela))
    .groupBy(leadsTable.perdidaMotivo);

  res.json(
    GetConversaoLeadsResponse.parse({
      totalLeads: porOrigem.reduce((a, o) => a + o.total, 0),
      convertidos: porOrigem.reduce((a, o) => a + o.convertidos, 0),
      perdidos: porMotivoPerda.reduce((a, m) => a + m.total, 0),
      porOrigem,
      porMotivoPerda: porMotivoPerda.map((m) => ({ motivo: m.motivo ?? null, total: m.total })),
    }),
  );
});

// E79: a régua do funil roda no banco — o sino e o painel paravam de baixar a
// lista completa só para achar as paradas. Só leads EM NEGOCIAÇÃO entram (a
// mesma união do funil-core), e o último contato vem num agregado só.
router.get("/lojas/:lojaId/leads/parados", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const emNegociacaoLeads = await db
    .select({
      id: leadsTable.id,
      noivaNome: leadsTable.noivaNome,
      etapa: leadsTable.etapa,
      createdAt: leadsTable.createdAt,
      casamentoData: leadsTable.casamentoData,
    })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.lojaId, lojaId),
      inArray(leadsTable.etapa, [...ETAPAS_EM_NEGOCIACAO]),
    ));

  const contatos = await ultimoContatoPorLead(emNegociacaoLeads.map((l) => l.id));

  const parados = emNegociacaoLeads
    .map((l) => ({
      lead: l,
      parado: leadParado({
        etapa: l.etapa,
        createdAt: l.createdAt,
        ultimoContatoEm: contatos.get(l.id) ?? null,
      }),
    }))
    .filter(
      (x): x is typeof x & { parado: NonNullable<typeof x.parado> } =>
        x.parado !== null && x.parado.temperatura !== "ok",
    )
    .sort((a, b) => b.parado.dias - a.parado.dias);

  res.json(
    GetLeadsParadosResponse.parse({
      criticos: parados.filter((p) => p.parado.temperatura === "critico").length,
      atencao: parados.filter((p) => p.parado.temperatura === "atencao").length,
      itens: parados.slice(0, 10).map((p) => ({
        id: p.lead.id,
        noivaNome: p.lead.noivaNome,
        etapa: p.lead.etapa,
        dias: p.parado.dias,
        temperatura: p.parado.temperatura,
        casamentoData: p.lead.casamentoData,
      })),
    }),
  );
});

// E77: dado pessoal sem propósito é passivo. Anonimiza os leads PERDIDOS com
/**
 * E128: o MESMO recorte para a prévia e para o expurgo — duas escritas da
 * condição divergiriam em silêncio e a contagem do diálogo mentiria sobre a
 * ação, que é exatamente o defeito que a prévia existe para fechar.
 */
function condicaoDoExpurgo(lojaId: string, corte: Date) {
  return and(
    eq(leadsTable.lojaId, lojaId),
    eq(leadsTable.etapa, "PERDIDO"),
    sql`${leadsTable.perdidaEm} < ${corte}`,
    sql`${leadsTable.anonimizadaEm} is null`,
  );
}

// E128: a confirmação da LGPD dizia o QUE se perde mas não QUANTAS — a
// contagem só chegava no toast, DEPOIS do clique irreversível. Read-only de
// verdade: um SELECT count, nenhuma escrita. Antes do :leadId para o path não
// virar id.
router.get("/lojas/:lojaId/leads/expurgo/previa", requireModulo("leads", "editar"), async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const query = PreviaExpurgoLeadsPerdidosQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json(erroDeValidacao(query.error));
    return;
  }
  const meses = query.data.mesesInatividade ?? 24;
  const corte = inicioDoDia(addMeses(hojeLocal(), -meses));
  const [linha] = await db
    .select({ total: count() })
    .from(leadsTable)
    .where(condicaoDoExpurgo(lojaId, corte));
  res.json(PreviaExpurgoLeadsPerdidosResponse.parse({ aAnonimizar: linha?.total ?? 0 }));
});

// perda mais antiga que a janela: a linha fica (funil e conversão continuam
// contando), a PII sai. Irreversível por desenho; deixa rastro. Antes do
// :leadId para o path não virar id.
router.post("/lojas/:lojaId/leads/expurgo", requireModulo("leads", "editar"), async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = ExpurgarLeadsPerdidosBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const meses = parsed.data.mesesInatividade ?? 24;
  /**
   * `setMonth(getMonth() - meses)` TRANSBORDA quando o dia de hoje não existe
   * no mês alvo: rodado em 31/03 com 1 mês, o corte vira 03/03 — o Date corrige
   * "31/02" para frente. O expurgo é irreversível por desenho (anonimiza a
   * noiva), e um corte que anda três dias para o FUTURO anonimiza fichas que
   * ainda estavam dentro do prazo de retenção. `addMeses` grampeia ao último
   * dia do mês curto (31/03 −1 mês = 28/02), que é a régua do carnê.
   */
  const corte = inicioDoDia(addMeses(hojeLocal(), -meses));

  const anonimizadas = await db.transaction(async (tx) => {
    const linhas = await tx
      .update(leadsTable)
      .set({
        noivaNome: "(anonimizada)",
        noivoNome: null,
        whatsapp: null,
        cerimonialista: null,
        casamentoLocal: null,
        perdidaDetalhe: null,
        anonimizadaEm: new Date(),
        updatedAt: new Date(),
      })
      .where(condicaoDoExpurgo(lojaId, corte))
      .returning({ id: leadsTable.id });

    if (linhas.length > 0) {
      await registrarAuditoria(tx, {
        lojaId,
        usuario: req.usuario!,
        acao: "LEADS_ANONIMIZADOS",
        entidade: "lead",
        entidadeId: lojaId,
        detalhe: { quantidade: linhas.length, mesesInatividade: meses },
      });
    }
    return linhas.length;
  });

  res.json(ExpurgarLeadsPerdidosResponse.parse({ anonimizadas }));
});

// E73: atendimento → contrato por vendedora. A comissão media o resultado;
// isto mede o CAMINHO — desfechos (E37) cruzados com contratos. Antes do
// :leadId para o path não virar id.
router.get("/lojas/:lojaId/leads/desempenho-vendedoras", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;

  const [porAtendimento, porContrato] = await Promise.all([
    db
      .select({
        vendedoraId: atendimentosTable.vendedoraId,
        nome: usuariosTable.nome,
        atendimentosConcluidos: sql<number>`count(*) filter (where ${atendimentosTable.situacao} = 'CONCLUIDO')`.mapWith(Number),
        reservou: sql<number>`count(*) filter (where ${atendimentosTable.desfecho} = 'RESERVOU')`.mapWith(Number),
      })
      .from(atendimentosTable)
      .innerJoin(usuariosTable, eq(atendimentosTable.vendedoraId, usuariosTable.id))
      .where(eq(atendimentosTable.lojaId, lojaId))
      .groupBy(atendimentosTable.vendedoraId, usuariosTable.nome),
    db
      .select({
        vendedoraId: contratosTable.vendedoraId,
        nome: usuariosTable.nome,
        contratos: count(),
        receita: sql<number>`coalesce(sum(${contratosTable.valorTotal}), 0)`.mapWith(Number),
      })
      .from(contratosTable)
      .innerJoin(usuariosTable, eq(contratosTable.vendedoraId, usuariosTable.id))
      .where(and(eq(contratosTable.lojaId, lojaId), eq(contratosTable.status, "ATIVO")))
      .groupBy(contratosTable.vendedoraId, usuariosTable.nome),
  ]);

  const porVendedora = new Map<
    string,
    { vendedoraId: string; nome: string; atendimentosConcluidos: number; reservou: number; contratos: number; receita: number }
  >();
  for (const a of porAtendimento) {
    porVendedora.set(a.vendedoraId, { ...a, contratos: 0, receita: 0 });
  }
  for (const c of porContrato) {
    const linha = porVendedora.get(c.vendedoraId) ?? {
      vendedoraId: c.vendedoraId,
      nome: c.nome,
      atendimentosConcluidos: 0,
      reservou: 0,
      contratos: 0,
      receita: 0,
    };
    linha.contratos = c.contratos;
    linha.receita = c.receita;
    porVendedora.set(c.vendedoraId, linha);
  }

  res.json(
    GetDesempenhoVendedorasResponse.parse(
      [...porVendedora.values()].sort((a, b) => b.receita - a.receita || b.reservou - a.reservou),
    ),
  );
});

// E73: a data do casamento sempre esteve no banco e ninguém somava — a curva
// que diz quando falta vestido e quando sobra arara. Antes do :leadId para
// "sazonalidade" não ser lido como um id de lead.
router.get("/lojas/:lojaId/leads/sazonalidade", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const linhas = await db
    .select({
      competencia: sql<string>`to_char(${leadsTable.casamentoData} at time zone 'America/Sao_Paulo', 'YYYY-MM')`,
      total: count(),
      comContrato: sql<number>`count(*) filter (where ${leadsTable.contratoFechadoEm} is not null)`.mapWith(Number),
    })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.lojaId, lojaId),
      sql`${leadsTable.etapa} <> 'PERDIDO'`,
      sql`${leadsTable.casamentoData} >= now()`,
      sql`${leadsTable.casamentoData} < now() + interval '12 months'`,
    ))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  res.json(GetSazonalidadeCasamentosResponse.parse(linhas));
});

router.get("/lojas/:lojaId/leads/:leadId", async (req, res): Promise<void> => {
  const { lojaId, leadId } = req.params;
  const lead = await db.query.leadsTable.findFirst({
    where: and(eq(leadsTable.id, leadId as string), eq(leadsTable.lojaId, lojaId as string)),
    with: {
      interesse: {
        with: {
          atributos: true
        }
      }
    },
  });

  if (!lead) {
    res.status(404).json({ error: "LEAD_NAO_ENCONTRADO", detalhe: "Esta noiva não existe nesta loja." });
    return;
  }

  const contatos = await ultimoContatoPorLead([lead.id]);

  res.json(GetLeadResponse.parse({
    ...lead,
    ultimoContatoEm: contatos.get(lead.id) ?? null,
    interesse: lead.interesse ?? undefined,
  }));
});

router.patch("/lojas/:lojaId/leads/:leadId", async (req, res): Promise<void> => {
  const { lojaId, leadId } = req.params;
  const parsed = UpdateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const existente = await db.query.leadsTable.findFirst({
    where: and(eq(leadsTable.id, leadId as string), eq(leadsTable.lojaId, lojaId as string)),
  });
  if (!existente) {
    res.status(404).json({ error: "LEAD_NAO_ENCONTRADO", detalhe: "Esta noiva não existe nesta loja." });
    return;
  }

  // Mudança de etapa só por transição válida da máquina de estados.
  if (parsed.data.etapa && !transicaoLeadValida(existente.etapa, parsed.data.etapa)) {
    res.status(422).json({
      error: "TRANSICAO_INVALIDA",
      detalhe: `Lead não pode ir de ${existente.etapa} para ${parsed.data.etapa}`,
    });
    return;
  }

  // F2: corrigir a origem é permitido enquanto a noiva não CONVERTEU, e a régua
  // é `converteu()` — a mesma que /leads/conversao usa para contar. O backlog
  // dizia "enquanto não tem contrato", e não é a mesma pergunta: o relatório
  // conta por ETAPA, então um contrato cancelado continua contado e um lead em
  // EM_PROVAS que nunca passou por CONTRATO_FECHADO tem contrato e não é
  // contado. Travar pelo contrato deixaria a conversão já publicada mudar de
  // canal debaixo de quem leu o relatório.
  if (parsed.data.origem && parsed.data.origem !== existente.origem && converteu(existente.etapa)) {
    res.status(422).json({
      error: "ORIGEM_IMUTAVEL",
      detalhe: "A noiva já converteu: mudar a origem agora reescreveria um número que o relatório de conversão já contou.",
    });
    return;
  }

  // Perder EXIGE o motivo estruturado — o dado só vale se for sempre coletado.
  // Fora do PERDIDO, motivo/detalhe enviados são ignorados (não fazem sentido);
  // ao reviver, os campos ficam como histórico, mesmo espírito do perdidaEm.
  const { perdidaMotivo, perdidaDetalhe, ...resto } = parsed.data;
  const perda: Partial<{ perdidaMotivo: typeof perdidaMotivo; perdidaDetalhe: string | null }> = {};
  if (parsed.data.etapa === "PERDIDO") {
    if (!perdidaMotivo) {
      res.status(422).json({
        error: "MOTIVO_OBRIGATORIO",
        detalhe: "Marcar como perdida pede o motivo (PRECO, DATA_INDISPONIVEL, CONCORRENTE, DESISTENCIA, SEM_RETORNO ou OUTRO)",
      });
      return;
    }
    perda.perdidaMotivo = perdidaMotivo;
    perda.perdidaDetalhe = perdidaDetalhe ?? null;
  }

  const carimbo = parsed.data.etapa ? carimboEtapa(parsed.data.etapa, existente) : {};

  const [lead] = await db.update(leadsTable)
    .set({ ...resto, ...perda, ...carimbo, updatedAt: new Date() })
    .where(and(eq(leadsTable.id, leadId as string), eq(leadsTable.lojaId, lojaId as string)))
    .returning();

  if (!lead) {
    res.status(404).json({ error: "LEAD_NAO_ENCONTRADO", detalhe: "Esta noiva não existe nesta loja." });
    return;
  }

  const fullLead = await db.query.leadsTable.findFirst({
    where: eq(leadsTable.id, lead.id),
    with: { interesse: { with: { atributos: true } } }
  });

  const contatos = await ultimoContatoPorLead([lead.id]);

  res.json(UpdateLeadResponse.parse({
    ...fullLead,
    ultimoContatoEm: contatos.get(lead.id) ?? null,
    interesse: fullLead?.interesse ?? undefined,
  }));
});

/**
 * Apagar a noiva é a operação mais destrutiva do cadastro comercial — e era um
 * `delete` cru: sem 404, sem contagem do que ia junto e sem trilha, o oposto da
 * régua que o E91 aplicou ao DELETE de usuário e o E106 ao de loja.
 *
 * O que o cascade leva é atendimento, orçamento, interesse e registro de
 * cobrança. Contrato NÃO: `contratos.lead_id` é `restrict` de propósito
 * (histórico financeiro), e o banco levantava o 23503 genérico. Aqui o 409 sai
 * antes, LEGÍVEL, dizendo quantos contratos seguram a ficha.
 *
 * A trilha grava o que sumiu ANTES de sumir — depois do delete não há de onde
 * reconstituir, que é exatamente o motivo de a trilha existir.
 */
router.delete("/lojas/:lojaId/leads/:leadId", async (req, res): Promise<void> => {
  const { lojaId, leadId } = req.params;
  const [lead] = await db
    .select({ id: leadsTable.id, noivaNome: leadsTable.noivaNome, etapa: leadsTable.etapa })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId as string), eq(leadsTable.lojaId, lojaId as string)));
  if (!lead) {
    res.status(404).json({ error: "LEAD_NAO_ENCONTRADO", detalhe: "Esta noiva não existe nesta loja." });
    return;
  }

  const [[c1], [c2], [c3], [c4]] = await Promise.all([
    db.select({ n: count() }).from(contratosTable).where(eq(contratosTable.leadId, lead.id)),
    db.select({ n: count() }).from(orcamentosTable).where(eq(orcamentosTable.leadId, lead.id)),
    db.select({ n: count() }).from(atendimentosTable).where(eq(atendimentosTable.leadId, lead.id)),
    // S27 — a quarta contagem que faltava. `bloqueio_vestidos.lead_id` é
    // `set null`: sem esta guarda a noiva saía com 204, o vestido continuava
    // ocupado e o ÚNICO ponteiro para a dona era apagado, contra a promessa do
    // docblock desta rota. Conta TODAS as linhas, inclusive as canceladas — o
    // `set null` dispara nelas do mesmo jeito, e com o CHECK isso vira 23514.
    db.select({ n: count() }).from(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.leadId, lead.id)),
  ]);
  if (c4.n > 0) {
    res.status(409).json({
      error: "LEAD_COM_RESERVA",
      detalhe: `Esta noiva tem ${c4.n} reserva(s) de vestido — excluir deixaria a peça ocupada sem dona. Cancele as reservas primeiro.`,
    });
    return;
  }
  if (c1.n > 0) {
    res.status(409).json({
      error: "LEAD_COM_CONTRATO",
      detalhe: `Esta noiva tem ${c1.n} contrato(s) — excluir apagaria o histórico financeiro dela. Marque como PERDIDO, ou use o expurgo para anonimizar.`,
    });
    return;
  }

  await db.transaction(async (tx) => {
    await registrarAuditoria(tx, {
      lojaId: lojaId as string,
      usuario: req.usuario!,
      acao: "LEAD_REMOVIDO",
      entidade: "lead",
      entidadeId: lead.id,
      detalhe: {
        noivaNome: lead.noivaNome,
        etapa: lead.etapa,
        orcamentos: c2.n,
        atendimentos: c3.n,
      },
    });
    await tx.delete(leadsTable)
      .where(and(eq(leadsTable.id, lead.id), eq(leadsTable.lojaId, lojaId as string)));
  });
  res.status(204).send();
});

router.put("/lojas/:lojaId/leads/:leadId/interesse", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const leadId = req.params.leadId as string;
  const parsed = SetLeadInteresseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const lead = await db.query.leadsTable.findFirst({
    where: and(eq(leadsTable.id, leadId), eq(leadsTable.lojaId, lojaId)),
  });
  if (!lead) {
    res.status(404).json({ error: "LEAD_NAO_ENCONTRADO", detalhe: "Esta noiva não existe nesta loja." });
    return;
  }

  const { atributos, ...insertData } = parsed.data;

  // E115 — os pares (atributo, opção) vinham do corpo sem prova de loja: o
  // interesse da noiva podia apontar para o vocabulário de OUTRA loja (a mesma
  // classe que o E111 fechou no PATCH /vestidos, com a mesma régua).
  if (atributos !== undefined && !(await atributosDaLoja(atributos, lojaId))) {
    res.status(422).json({ error: "REFERENCIA_INVALIDA", detalhe: "atributo/opção não são desta loja" });
    return;
  }

  // E115 — upsert, delete e insert corriam em três statements FORA de
  // transação: uma falha no meio deixava o interesse gravado sem atributo
  // nenhum. Mesmo padrão que o E111 fechou em vestidos.
  const interesse = await db.transaction(async (tx) => {
    const [interesse] = await tx.insert(leadInteressesTable)
      .values({
        id: randomUUID(),
        leadId,
        ...insertData,
      })
      .onConflictDoUpdate({
        target: leadInteressesTable.leadId,
        set: { ...insertData, updatedAt: new Date() },
      })
      .returning();

    if (atributos !== undefined) {
      await tx.delete(leadInteresseAtributosTable).where(eq(leadInteresseAtributosTable.leadInteresseId, interesse.id));
      if (atributos.length > 0) {
        await tx.insert(leadInteresseAtributosTable).values(
          atributos.map(a => ({
            leadInteresseId: interesse.id,
            atributoId: a.atributoId,
            opcaoId: a.opcaoId,
          }))
        );
      }
    }
    return interesse;
  });

  const fullInteresse = await db.query.leadInteressesTable.findFirst({
    where: eq(leadInteressesTable.id, interesse.id),
    with: { atributos: true }
  });

  res.json(SetLeadInteresseResponse.parse(fullInteresse));
});

/**
 * A coluna é `contatoData`; o contrato expõe `data`. Traduzir é obrigação da
 * rota — o spread cru da linha do banco não tem `data` e o `parse` estourava
 * (500 em toda leitura com registro). Uma função só, usada na leitura e na
 * escrita, para os dois lados não divergirem de novo.
 */
function paraContrato(
  linha: typeof registrosCobrancaTable.$inferSelect,
  vendedorNome: string | null,
) {
  return {
    id: linha.id,
    leadId: linha.leadId,
    data: linha.contatoData,
    canal: linha.canal,
    observacao: linha.observacao,
    vendedorNome,
  };
}

router.get("/lojas/:lojaId/leads/:leadId/cobrancas", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const leadId = req.params.leadId as string;
  const lead = await db.query.leadsTable.findFirst({
    where: and(eq(leadsTable.id, leadId), eq(leadsTable.lojaId, lojaId)),
  });
  if (!lead) {
    res.status(404).json({ error: "LEAD_NAO_ENCONTRADO", detalhe: "Esta noiva não existe nesta loja." });
    return;
  }
  // Histórico lê do mais recente para o mais antigo: o último contato é o que
  // decide se vale ligar de novo hoje. O join é LEFT porque `vendedorId` é
  // ON DELETE SET NULL — quem saiu da equipe não pode sumir com o registro.
  const cobrancas = await db
    .select({ registro: registrosCobrancaTable, vendedorNome: usuariosTable.nome })
    .from(registrosCobrancaTable)
    .leftJoin(usuariosTable, eq(usuariosTable.id, registrosCobrancaTable.vendedorId))
    .where(and(eq(registrosCobrancaTable.leadId, leadId), eq(registrosCobrancaTable.lojaId, lojaId)))
    .orderBy(desc(registrosCobrancaTable.contatoData));
  res.json(
    ListRegistrosCobrancaResponse.parse(
      cobrancas.map((l) => paraContrato(l.registro, l.vendedorNome)),
    ),
  );
});

router.post("/lojas/:lojaId/leads/:leadId/cobrancas", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const leadId = req.params.leadId as string;
  const parsed = CreateRegistroCobrancaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }

  const lead = await db.query.leadsTable.findFirst({
    where: and(eq(leadsTable.id, leadId), eq(leadsTable.lojaId, lojaId)),
  });
  if (!lead) {
    res.status(404).json({ error: "LEAD_NAO_ENCONTRADO", detalhe: "Esta noiva não existe nesta loja." });
    return;
  }

  // Quem registrou vem da SESSÃO, nunca do corpo: aceitar um `vendedorId` do
  // cliente deixaria atribuir a ligação a outra pessoa.
  const vendedor = req.usuario!;

  const [cobranca] = await db.insert(registrosCobrancaTable).values({
    id: randomUUID(),
    lojaId: lead.lojaId,
    leadId,
    contatoData: parsed.data.data,
    canal: parsed.data.canal,
    observacao: parsed.data.observacao ?? null,
    vendedorId: vendedor.id,
  }).returning();

  res.status(201).json(
    CreateRegistroCobrancaResponse.parse(paraContrato(cobranca!, vendedor.nome)),
  );
});

/**
 * E123/B3 — o desfazer. O registro nasce do clique num link que abre OUTRA ABA
 * (a fila de /mensagens): errar o botão é barato, e sem esta rota o histórico
 * afirmava um contato que não houve e o relógio do "parado há N dias" zerava
 * em falso. É a mesma decisão do DELETE de contato do atendimento (E97), com a
 * diferença de que aqui some uma LINHA — então vale a régua do E91/E106/E111:
 * 404 antes de qualquer escrita, escopo por loja E lead, e trilha DENTRO da
 * transação — depois do DELETE, ela é o único registro do que existiu.
 */
router.delete("/lojas/:lojaId/leads/:leadId/cobrancas/:registroId", async (req, res): Promise<void> => {
  const { lojaId, leadId, registroId } = req.params;
  const registro = await db.query.registrosCobrancaTable.findFirst({
    where: and(
      eq(registrosCobrancaTable.id, registroId as string),
      eq(registrosCobrancaTable.leadId, leadId as string),
      eq(registrosCobrancaTable.lojaId, lojaId as string),
    ),
  });
  if (!registro) {
    res.status(404).json({
      error: "REGISTRO_DE_COBRANCA_NAO_ENCONTRADO",
      detalhe: "Este registro de contato não existe mais — talvez já tenha sido desfeito.",
    });
    return;
  }

  await db.transaction(async (tx) => {
    await registrarAuditoria(tx, {
      lojaId: lojaId as string,
      usuario: req.usuario!,
      acao: "REGISTRO_COBRANCA_DESFEITO",
      entidade: "registro_cobranca",
      entidadeId: registro.id,
      detalhe: {
        leadId: registro.leadId,
        canal: registro.canal,
        observacao: registro.observacao,
        contatoData: registro.contatoData.toISOString(),
      },
    });
    await tx.delete(registrosCobrancaTable).where(eq(registrosCobrancaTable.id, registro.id));
  });
  res.status(204).send();
});

export default router;
