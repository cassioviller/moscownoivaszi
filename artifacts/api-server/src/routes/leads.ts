import { Router, type IRouter } from "express";
import { db, leadsTable, leadInteressesTable, leadInteresseAtributosTable, registrosCobrancaTable, usuariosTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { 
  ListLeadsResponse,
  CreateLeadBody,
  CreateLeadResponse,
  GetLeadResponse,
  UpdateLeadBody,
  UpdateLeadResponse,
  SetLeadInteresseBody,
  SetLeadInteresseResponse,
  ListRegistrosCobrancaResponse,
  CreateRegistroCobrancaBody,
  CreateRegistroCobrancaResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { randomUUID } from "node:crypto";
import { transicaoLeadValida, type LeadEtapa } from "../lib/estados";

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

router.get("/lojas/:lojaId/leads", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const leads = await db.query.leadsTable.findMany({
    where: eq(leadsTable.lojaId, lojaId),
    with: {
      interesse: {
        with: {
          atributos: true
        }
      }
    },
    orderBy: leadsTable.createdAt,
  });

  res.json(ListLeadsResponse.parse(leads.map(l => ({ ...l, interesse: l.interesse ?? undefined }))));
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

  res.status(201).json(CreateLeadResponse.parse({ ...lead, interesse: undefined }));
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

  res.json(GetLeadResponse.parse({ ...lead, interesse: lead.interesse ?? undefined }));
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

  const carimbo = parsed.data.etapa ? carimboEtapa(parsed.data.etapa, existente) : {};

  const [lead] = await db.update(leadsTable)
    .set({ ...parsed.data, ...carimbo, updatedAt: new Date() })
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

  res.json(UpdateLeadResponse.parse({ ...fullLead, interesse: fullLead?.interesse ?? undefined }));
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

  const { atributos, ...interesseData } = parsed.data;
  
  const insertData = { ...interesseData };

  const [interesse] = await db.insert(leadInteressesTable)
    .values({
      id: randomUUID(),
      leadId,
      ...insertData,
    } as any)
    .onConflictDoUpdate({
      target: leadInteressesTable.leadId,
      set: { ...insertData, updatedAt: new Date() } as any,
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
