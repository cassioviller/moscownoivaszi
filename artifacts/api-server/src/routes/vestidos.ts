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
  SetVestidoFotoResponse,
  GetVestidoFotoQueryParams,
  CheckDisponibilidadeVestidosQueryParams,
  CheckDisponibilidadeVestidosResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { randomUUID } from "node:crypto";
import {
  buscarRegra,
  buscarBloqueiosAtivos,
  janelasDoBloqueio,
  conflitos,
  detalharConflitos,
  diaLocal,
  type BloqueioJanelasInput,
  type BloqueioAtivoComContexto,
  type ConflitoDetalhe,
  type Janela,
} from "../lib/disponibilidade";
import { identificarImagem } from "../lib/imagem";

const router: IRouter = Router();

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/vestidos", requireModulo("vestidos"));

// Fotos nas respostas de vestido: só a META (nunca bytes — `fotos: true`
// arrastava o bytea inteiro do banco para o zod descartar). `updatedAt` sai
// como `atualizadaEm`: é a versão que alimenta o cache-busting das URLs.
const FOTOS_META = {
  columns: { ordem: true, mime: true, largura: true, altura: true, updatedAt: true },
} as const;

type FotoMetaRow = { ordem: number; mime: string; largura: number; altura: number; updatedAt: Date };

function comFotosMeta<V extends { fotos: FotoMetaRow[] }>(vestido: V) {
  return {
    ...vestido,
    fotos: vestido.fotos.map(({ updatedAt, ...f }) => ({ ...f, atualizadaEm: updatedAt })),
  };
}

router.get("/lojas/:lojaId/vestidos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const vestidos = await db.query.vestidosTable.findMany({
    where: eq(vestidosTable.lojaId, lojaId),
    with: {
      atributos: true,
      fotos: FOTOS_META
    },
    orderBy: vestidosTable.nome,
  });

  res.json(ListVestidosResponse.parse(vestidos.map(comFotosMeta)));
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
    });

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
    with: { atributos: true, fotos: FOTOS_META }
  });

  res.status(201).json(CreateVestidoResponse.parse(comFotosMeta(vestido!)));
});

// ── Disponibilidade em lote ──
// ATENÇÃO de roteamento: esta rota PRECISA vir antes de
// /lojas/:lojaId/vestidos/:vestidoId, senão "disponibilidade" casa como id.

function ddMM(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

function fraseMotivo(conflito: ConflitoDetalhe): string {
  const periodo = conflito.fim
    ? `${ddMM(conflito.inicio)}–${ddMM(conflito.fim)}`
    : `a partir de ${ddMM(conflito.inicio)}`;
  if (conflito.tipo === "MANUTENCAO") {
    return `Em manutenção ${periodo}`;
  }
  return conflito.noivaNome
    ? `Reservado ${periodo} — noiva ${conflito.noivaNome}`
    : `Reservado ${periodo}`;
}

router.get("/lojas/:lojaId/vestidos/disponibilidade", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsedQuery = CheckDisponibilidadeVestidosQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: "Parâmetro 'data' inválido (esperado YYYY-MM-DD)" });
    return;
  }
  const { data } = parsedQuery.data;

  const hojeDia = diaLocal(new Date());

  // 3 queries fixas — nunca N+1 (bloqueios de TODOS os vestidos em 1 query,
  // com noivaNome do lead via JOIN).
  const [vestidos, regra, ativos] = await Promise.all([
    db.select({ id: vestidosTable.id, status: vestidosTable.status })
      .from(vestidosTable)
      .where(eq(vestidosTable.lojaId, lojaId))
      .orderBy(vestidosTable.nome),
    buscarRegra(lojaId),
    buscarBloqueiosAtivos({ lojaId }),
  ]);

  // "Se eu criar uma RESERVA_CASAMENTO com casamentoData = data, quais
  // vestidos conflitam?" — meio-dia São Paulo (fuso fixo -03:00).
  const candidato: BloqueioJanelasInput = {
    id: "__candidato__",
    tipo: "RESERVA_CASAMENTO",
    casamentoData: new Date(`${data}T12:00:00-03:00`),
    provaDataReal: null,
    retiradaDataReal: null,
    devolucaoDataReal: null,
    inicio: null,
    fim: null,
  };
  const janelasCandidato = janelasDoBloqueio(candidato, regra, hojeDia);

  const porVestido = new Map<
    string,
    { janelas: Janela[]; contexto: Map<string, BloqueioAtivoComContexto> }
  >();
  for (const ativo of ativos) {
    let grupo = porVestido.get(ativo.bloqueio.vestidoId);
    if (!grupo) {
      grupo = { janelas: [], contexto: new Map() };
      porVestido.set(ativo.bloqueio.vestidoId, grupo);
    }
    grupo.janelas.push(...janelasDoBloqueio(ativo.bloqueio, regra, hojeDia));
    grupo.contexto.set(ativo.bloqueio.id, ativo);
  }

  const itens = vestidos.map((vestido) => {
    if (vestido.status !== "ativo") {
      return {
        vestidoId: vestido.id,
        disponivel: false,
        status: "INATIVO" as const,
        motivo: "Vestido inativo",
        conflito: null,
      };
    }
    const grupo = porVestido.get(vestido.id);
    const pares = grupo ? conflitos(janelasCandidato, grupo.janelas) : [];
    if (!grupo || pares.length === 0) {
      return {
        vestidoId: vestido.id,
        disponivel: true,
        status: "DISPONIVEL" as const,
        motivo: null,
        conflito: null,
      };
    }
    const [principal] = detalharConflitos(pares, grupo.contexto);
    return {
      vestidoId: vestido.id,
      disponivel: false,
      status: principal.tipo === "MANUTENCAO" ? ("MANUTENCAO" as const) : ("RESERVADO" as const),
      motivo: fraseMotivo(principal),
      conflito: principal,
    };
  });

  res.json(CheckDisponibilidadeVestidosResponse.parse({ data, itens }));
});

router.get("/lojas/:lojaId/vestidos/:vestidoId", async (req, res): Promise<void> => {
  const { lojaId, vestidoId } = req.params;
  const vestido = await db.query.vestidosTable.findFirst({
    where: and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)),
    with: {
      atributos: true,
      fotos: FOTOS_META
    },
  });

  if (!vestido) {
    res.status(404).json({ error: "Vestido not found" });
    return;
  }

  res.json(GetVestidoResponse.parse(comFotosMeta(vestido)));
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
        .set(updateData)
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
    with: { atributos: true, fotos: FOTOS_META }
  });

  if (!vestido) {
    res.status(404).json({ error: "Vestido not found" });
    return;
  }

  res.json(UpdateVestidoResponse.parse(comFotosMeta(vestido)));
});

router.delete("/lojas/:lojaId/vestidos/:vestidoId", async (req, res): Promise<void> => {
  const { lojaId, vestidoId } = req.params;
  await db.delete(vestidosTable).where(and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)));
  res.status(204).send();
});

// Serve o bytea da foto como imagem binária (consumido por <img src>).
// Escopo de loja garantido pelo JOIN com o vestido (404 se a foto for de
// outra loja). `variante=thumb` serve a miniatura quando existe (fallback na
// cheia — nunca 404 por falta de thumb). Com `?v=` a URL é versionada por
// updatedAt e o cache pode ser immutable; sem, revalidação barata por ETag.
router.get("/lojas/:lojaId/vestidos/:vestidoId/fotos/:ordem", async (req, res): Promise<void> => {
  const { lojaId, vestidoId, ordem: ordemStr } = req.params;
  const ordem = parseInt(Array.isArray(ordemStr) ? ordemStr[0] : (ordemStr as string));
  if (Number.isNaN(ordem)) {
    res.status(400).json({ error: "Ordem inválida" });
    return;
  }
  const query = GetVestidoFotoQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { variante = "cheia", v } = query.data;

  const foto = await db.query.vestidoFotosTable.findFirst({
    where: and(eq(vestidoFotosTable.vestidoId, vestidoId as string), eq(vestidoFotosTable.ordem, ordem)),
    with: { vestido: { columns: { lojaId: true } } },
  });

  if (!foto || foto.vestido.lojaId !== lojaId) {
    res.status(404).json({ error: "Foto not found" });
    return;
  }

  const servirThumb = variante === "thumb" && foto.thumbBytes != null;
  // A variante entra no ETag: thumb e cheia da mesma foto não podem trocar 304.
  const etag = `"${vestidoId}-${ordem}-${servirThumb ? "t" : "c"}-${foto.updatedAt.getTime()}"`;
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }

  res.setHeader("Content-Type", servirThumb ? foto.thumbMime ?? foto.mime : foto.mime);
  res.setHeader(
    "Cache-Control",
    v ? "private, max-age=31536000, immutable" : "private, max-age=60, must-revalidate",
  );
  res.setHeader("ETag", etag);
  res.send(servirThumb ? foto.thumbBytes : foto.bytes);
});

// Limites da foto: o que o cliente DEVERIA mandar depois do downscale por
// canvas. Acima disso é bug do cliente ou má-fé — recusa, não acomoda.
const FOTO_MAX_BYTES = 2 * 1024 * 1024;
const THUMB_MAX_BYTES = 512 * 1024;

router.put("/lojas/:lojaId/vestidos/:vestidoId/fotos/:ordem", async (req, res): Promise<void> => {
  const { lojaId, vestidoId, ordem: ordemStr } = req.params;
  const ordem = parseInt(Array.isArray(ordemStr) ? ordemStr[0] : (ordemStr as string));
  const parsed = SetVestidoFotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const vestido = await db.query.vestidosTable.findFirst({
    where: and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)),
  });
  if (!vestido) {
    res.status(404).json({ error: "Vestido not found" });
    return;
  }

  // Mime e dimensões saem do BINÁRIO, nunca da palavra do cliente — um mime
  // mentiroso viraria o Content-Type servido de volta (stored-XSS).
  const buffer = Buffer.from(parsed.data.base64, "base64");
  if (buffer.length > FOTO_MAX_BYTES) {
    res.status(422).json({ error: "FOTO_MUITO_GRANDE", detalhe: "Máximo 2MB — a foto deveria ter sido reduzida antes do envio" });
    return;
  }
  const info = identificarImagem(buffer);
  if (!info) {
    res.status(422).json({ error: "FOTO_INVALIDA", detalhe: "Use JPEG, PNG ou WebP" });
    return;
  }

  let thumbBuffer: Buffer | null = null;
  let thumbInfo: ReturnType<typeof identificarImagem> = null;
  if (parsed.data.thumbBase64) {
    thumbBuffer = Buffer.from(parsed.data.thumbBase64, "base64");
    if (thumbBuffer.length > THUMB_MAX_BYTES) {
      res.status(422).json({ error: "FOTO_MUITO_GRANDE", detalhe: "Miniatura acima de 512KB" });
      return;
    }
    thumbInfo = identificarImagem(thumbBuffer);
    if (!thumbInfo) {
      res.status(422).json({ error: "FOTO_INVALIDA", detalhe: "Miniatura precisa ser JPEG, PNG ou WebP" });
      return;
    }
  }

  // Sem thumb no corpo, as colunas são ANULADAS: nunca servir a miniatura de
  // uma foto que já não existe.
  const valores = {
    mime: info.mime,
    largura: info.largura,
    altura: info.altura,
    bytes: buffer,
    thumbBytes: thumbBuffer,
    thumbMime: thumbInfo?.mime ?? null,
  };
  const [foto] = await db.insert(vestidoFotosTable)
    .values({ id: randomUUID(), vestidoId: vestidoId as string, ordem, ...valores })
    .onConflictDoUpdate({
      target: [vestidoFotosTable.vestidoId, vestidoFotosTable.ordem],
      set: { ...valores, updatedAt: new Date() },
    })
    .returning();

  res.json(SetVestidoFotoResponse.parse({
    ordem: foto.ordem,
    mime: foto.mime,
    largura: foto.largura,
    altura: foto.altura,
    atualizadaEm: foto.updatedAt,
  }));
});

router.delete("/lojas/:lojaId/vestidos/:vestidoId/fotos/:ordem", async (req, res): Promise<void> => {
  const { lojaId, vestidoId, ordem: ordemStr } = req.params;
  const ordem = parseInt(Array.isArray(ordemStr) ? ordemStr[0] : (ordemStr as string));
  const vestido = await db.query.vestidosTable.findFirst({
    where: and(eq(vestidosTable.id, vestidoId as string), eq(vestidosTable.lojaId, lojaId as string)),
  });
  if (!vestido) {
    res.status(404).json({ error: "Vestido not found" });
    return;
  }
  await db.delete(vestidoFotosTable).where(and(eq(vestidoFotosTable.vestidoId, vestidoId as string), eq(vestidoFotosTable.ordem, ordem)));
  res.status(204).send();
});

export default router;
