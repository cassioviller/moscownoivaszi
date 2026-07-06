import { Router, type IRouter } from "express";
import { db, leadsTable, leadInteressesTable, leadInteresseAtributosTable, registrosCobrancaTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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
import { requireSessaoComLoja } from "../middlewares/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

router.use(requireSessaoComLoja);

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

  const [lead] = await db.update(leadsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
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

router.put("/leads/:leadId/interesse", async (req, res): Promise<void> => {
  const leadId = req.params.leadId as string;
  const parsed = SetLeadInteresseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

router.get("/leads/:leadId/cobrancas", async (req, res): Promise<void> => {
  const leadId = req.params.leadId as string;
  const cobrancas = await db.select().from(registrosCobrancaTable)
    .where(eq(registrosCobrancaTable.leadId, leadId))
    .orderBy(registrosCobrancaTable.contatoData);
  res.json(ListRegistrosCobrancaResponse.parse(cobrancas));
});

router.post("/leads/:leadId/cobrancas", async (req, res): Promise<void> => {
  const leadId = req.params.leadId as string;
  const parsed = CreateRegistroCobrancaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Find lead to get lojaId
  const lead = await db.query.leadsTable.findFirst({ where: eq(leadsTable.id, leadId) });
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

    const [cobranca] = await db.insert(registrosCobrancaTable).values({
    id: randomUUID(),
    lojaId: lead.lojaId,
    leadId,
    // @ts-ignore
    ...parsed.data,
  }).returning();

  res.status(201).json(CreateRegistroCobrancaResponse.parse(cobranca));
});

export default router;
