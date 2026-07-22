import { Router, type IRouter } from "express";
import { db, leadsTable, leadInteressesTable, leadInteresseAtributosTable, registrosCobrancaTable, usuariosTable, atendimentosTable, contratosTable, orcamentosTable } from "@workspace/db";
import { eq, and, desc, or, ilike, sql, count, inArray } from "drizzle-orm";
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
  ExpurgarLeadsPerdidosResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { randomUUID } from "node:crypto";
import { transicaoLeadValida, ETAPAS_CONVERTIDA, type LeadEtapa } from "../lib/estados";
import { registrarAuditoria } from "../lib/auditoria";

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

/**
 * Último contato de cada lead (E27): `max(contatoData)` de registros_cobranca.
 * É uma query agregada à parte, não uma subquery correlacionada dentro do
 * relational builder — ali o drizzle aliasa a tabela e a correlação com
 * `leads.id` sai errada em silêncio. Um SELECT a mais, limitado à página.
 *
 * Alimenta o "parada há N dias sem contato" do funil; sem isto o kanban faria
 * uma consulta de cobranças por card.
 */
async function ultimoContatoPorLead(leadIds: string[]): Promise<Map<string, Date>> {
  if (leadIds.length === 0) return new Map();
  const linhas = await db
    .select({
      leadId: registrosCobrancaTable.leadId,
      ultimo: sql<Date>`max(${registrosCobrancaTable.contatoData})`,
    })
    .from(registrosCobrancaTable)
    .where(inArray(registrosCobrancaTable.leadId, leadIds))
    .groupBy(registrosCobrancaTable.leadId);
  return new Map(linhas.map((l) => [l.leadId, l.ultimo]));
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
    res.status(404).json({ error: "Lead not found" });
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
    res.status(400).json({ error: parsed.error.message });
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

  const porOrigem = await db
    .select({
      origem: leadsTable.origem,
      total: count(),
      convertidos: sql<number>`count(*) filter (where ${inArray(leadsTable.etapa, [...ETAPAS_CONVERTIDA])})`.mapWith(Number),
    })
    .from(leadsTable)
    .where(eq(leadsTable.lojaId, lojaId))
    .groupBy(leadsTable.origem);

  const porMotivoPerda = await db
    .select({ motivo: leadsTable.perdidaMotivo, total: count() })
    .from(leadsTable)
    .where(and(eq(leadsTable.lojaId, lojaId), eq(leadsTable.etapa, "PERDIDO")))
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

// E77: dado pessoal sem propósito é passivo. Anonimiza os leads PERDIDOS com
// perda mais antiga que a janela: a linha fica (funil e conversão continuam
// contando), a PII sai. Irreversível por desenho; deixa rastro. Antes do
// :leadId para o path não virar id.
router.post("/lojas/:lojaId/leads/expurgo", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = ExpurgarLeadsPerdidosBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const meses = parsed.data.mesesInatividade ?? 24;
  const corte = new Date();
  corte.setMonth(corte.getMonth() - meses);

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
      .where(and(
        eq(leadsTable.lojaId, lojaId),
        eq(leadsTable.etapa, "PERDIDO"),
        sql`${leadsTable.perdidaEm} < ${corte}`,
        sql`${leadsTable.anonimizadaEm} is null`,
      ))
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
    res.status(404).json({ error: "Lead not found" });
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
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existente = await db.query.leadsTable.findFirst({
    where: and(eq(leadsTable.id, leadId as string), eq(leadsTable.lojaId, lojaId as string)),
  });
  if (!existente) {
    res.status(404).json({ error: "Lead not found" });
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
    res.status(404).json({ error: "Lead not found" });
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

router.delete("/lojas/:lojaId/leads/:leadId", async (req, res): Promise<void> => {
  const { lojaId, leadId } = req.params;
  await db.delete(leadsTable).where(and(eq(leadsTable.id, leadId as string), eq(leadsTable.lojaId, lojaId as string)));
  res.status(204).send();
});

router.put("/lojas/:lojaId/leads/:leadId/interesse", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const leadId = req.params.leadId as string;
  const parsed = SetLeadInteresseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const lead = await db.query.leadsTable.findFirst({
    where: and(eq(leadsTable.id, leadId), eq(leadsTable.lojaId, lojaId)),
  });
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const { atributos, ...insertData } = parsed.data;

  const [interesse] = await db.insert(leadInteressesTable)
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
    await db.delete(leadInteresseAtributosTable).where(eq(leadInteresseAtributosTable.leadInteresseId, interesse.id));
    if (atributos.length > 0) {
      await db.insert(leadInteresseAtributosTable).values(
        atributos.map(a => ({
          leadInteresseId: interesse.id,
          atributoId: a.atributoId,
          opcaoId: a.opcaoId,
        }))
      );
    }
  }

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
    res.status(404).json({ error: "Lead not found" });
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
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const lead = await db.query.leadsTable.findFirst({
    where: and(eq(leadsTable.id, leadId), eq(leadsTable.lojaId, lojaId)),
  });
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
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

export default router;
