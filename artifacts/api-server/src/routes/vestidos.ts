import { Router, type IRouter } from "express";
import { db, vestidosTable, vestidoFotosTable, vestidoAtributosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { 
  ListVestidosResponse,
  CreateVestidoBody,
  CreateVestidoResponse,
  GetVestidoResponse,
  UpdateVestidoBody,
  UpdateVestidoResponse,
  SetVestidoFotoBody,
  SetVestidoFotoResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja } from "../middlewares/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

router.use(requireSessaoComLoja);

router.get("/lojas/:lojaId/vestidos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const vestidos = await db.query.vestidosTable.findMany({
    where: eq(vestidosTable.lojaId, lojaId),
    with: {
      atributos: true,
      fotos: {
        columns: {
          ordem: true,
          mime: true,
          largura: true,
          altura: true,
        }
      }
    },
    orderBy: vestidosTable.nome,
  });

  res.json(ListVestidosResponse.parse(vestidos));
});

router.post("/lojas/:lojaId/vestidos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateVestidoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { atributos, ...vestidoData } = parsed.data;
  const vestidoId = randomUUID();
  
  const insertData = { ...vestidoData };

  await db.transaction(async (tx) => {
    await tx.insert(vestidosTable).values({
      id: vestidoId,
      lojaId,
      ...insertData,
    } as any);

    if (atributos && atributos.length > 0) {
      await tx.insert(vestidoAtributosTable).values(
        atributos.map(a => ({
          vestidoId,
          atributoId: a.atributoId,
          opcaoId: a.opcaoId,
        }))
      );
    }
  });

  const vestido = await db.query.vestidosTable.findFirst({
    where: eq(vestidosTable.id, vestidoId),
    with: { atributos: true, fotos: true }
  });

  res.status(201).json(CreateVestidoResponse.parse(vestido));
});

router.get("/lojas/:lojaId/vestidos/:vestidoId", async (req, res): Promise<void> => {
  const { lojaId, vestidoId } = req.params;
  const vestido = await db.query.vestidosTable.findFirst({
    where: and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)),
    with: {
      atributos: true,
      fotos: {
        columns: {
          ordem: true,
          mime: true,
          largura: true,
          altura: true,
        }
      }
    },
  });

  if (!vestido) {
    res.status(404).json({ error: "Vestido not found" });
    return;
  }

  res.json(GetVestidoResponse.parse(vestido));
});

router.patch("/lojas/:lojaId/vestidos/:vestidoId", async (req, res): Promise<void> => {
  const { lojaId, vestidoId } = req.params;
  const parsed = UpdateVestidoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { atributos, ...vestidoData } = parsed.data;
  const updateData = { ...vestidoData, updatedAt: new Date() };

  await db.transaction(async (tx) => {
    if (Object.keys(vestidoData).length > 0) {
      await tx.update(vestidosTable)
        .set(updateData as any)
        .where(and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)));
    }

    if (atributos !== undefined) {
      await tx.delete(vestidoAtributosTable).where(eq(vestidoAtributosTable.vestidoId, vestidoId as string));
      if (atributos.length > 0) {
        await tx.insert(vestidoAtributosTable).values(
          atributos.map(a => ({
            vestidoId: vestidoId as string,
            atributoId: a.atributoId,
            opcaoId: a.opcaoId,
          }))
        );
      }
    }
  });

  const vestido = await db.query.vestidosTable.findFirst({
    where: and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)),
    with: { atributos: true, fotos: true }
  });

  if (!vestido) {
    res.status(404).json({ error: "Vestido not found" });
    return;
  }

  res.json(UpdateVestidoResponse.parse(vestido));
});

router.delete("/lojas/:lojaId/vestidos/:vestidoId", async (req, res): Promise<void> => {
  const { lojaId, vestidoId } = req.params;
  await db.delete(vestidosTable).where(and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)));
  res.status(204).send();
});

router.put("/vestidos/:vestidoId/fotos/:ordem", async (req, res): Promise<void> => {
  const { vestidoId, ordem: ordemStr } = req.params;
  const ordem = parseInt(Array.isArray(ordemStr) ? ordemStr[0] : (ordemStr as string));
  const parsed = SetVestidoFotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const buffer = Buffer.from(parsed.data.base64, "base64");

  const [foto] = await db.insert(vestidoFotosTable)
    .values({
      id: randomUUID(),
      vestidoId: vestidoId as string,
      ordem,
      mime: parsed.data.mime,
      largura: parsed.data.largura,
      altura: parsed.data.altura,
      bytes: buffer,
    })
    .onConflictDoUpdate({
      target: [vestidoFotosTable.vestidoId, vestidoFotosTable.ordem],
      set: {
        mime: parsed.data.mime,
        largura: parsed.data.largura,
        altura: parsed.data.altura,
        bytes: buffer,
        updatedAt: new Date(),
      }
    })
    .returning();

  res.json(SetVestidoFotoResponse.parse({
    ordem: foto.ordem,
    mime: foto.mime,
    largura: foto.largura,
    altura: foto.altura,
    base64: parsed.data.base64,
  }));
});

router.delete("/vestidos/:vestidoId/fotos/:ordem", async (req, res): Promise<void> => {
  const { vestidoId, ordem: ordemStr } = req.params;
  const ordem = parseInt(Array.isArray(ordemStr) ? ordemStr[0] : (ordemStr as string));
  await db.delete(vestidoFotosTable).where(and(eq(vestidoFotosTable.vestidoId, vestidoId as string), eq(vestidoFotosTable.ordem, ordem)));
  res.status(204).send();
});

export default router;
