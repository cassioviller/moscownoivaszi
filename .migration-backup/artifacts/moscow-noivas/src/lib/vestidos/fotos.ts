// src/lib/vestidos/fotos.ts
//
// Fotos do vestido (até 2). Guardadas JÁ otimizadas (WebP) como bytes no Postgres
// — sem object storage. "Otimização de espaço para não demorar a abrir": no
// upload, sharp reorienta (EXIF), redimensiona (lado máx 1400px) e comprime para
// WebP q80 → cada foto fica ~100–250KB.
//
// SEGURANÇA: VestidoFoto não tem lojaId. Como manda o tenant.ts, só a tocamos
// DEPOIS de confirmar que o Vestido pai é da loja (via tenantPrisma).
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";

const MAX_LADO = 1400;
const QUALIDADE = 80;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12 MB de entrada (bruto)

export type FotoMeta = { ordem: number; largura: number; altura: number; versao: number };

function exigirOrdem(ordem: number): void {
  if (ordem !== 0 && ordem !== 1) throw new Error("Posição de foto inválida (use 0 ou 1)");
}

// Confirma o pai escopado antes de tocar a filha sem lojaId (falha fechada).
async function exigirVestidoDaLoja(lojaId: string, vestidoId: string): Promise<void> {
  const dono = await tenantPrisma(prisma, lojaId).vestido.findUnique({
    where: { id: vestidoId },
    select: { id: true },
  });
  if (!dono) throw new Error("Vestido não encontrado nesta loja");
}

/** Metadados das fotos (sem os bytes) — pra UI saber quais slots estão preenchidos. */
export async function listarFotosMeta(lojaId: string, vestidoId: string): Promise<FotoMeta[]> {
  await exigirVestidoDaLoja(lojaId, vestidoId);
  const fotos = await prisma.vestidoFoto.findMany({
    where: { vestidoId },
    orderBy: { ordem: "asc" },
    select: { ordem: true, largura: true, altura: true, updatedAt: true },
  });
  return fotos.map((f) => ({
    ordem: f.ordem,
    largura: f.largura,
    altura: f.altura,
    versao: f.updatedAt.getTime(), // cache-busting na URL ao trocar a foto
  }));
}

/** Bytes de uma foto (pro route handler servir). null se não existir. */
export async function obterFotoBytes(
  lojaId: string,
  vestidoId: string,
  ordem: number,
): Promise<{ bytes: Buffer; mime: string; versao: number } | null> {
  exigirOrdem(ordem);
  await exigirVestidoDaLoja(lojaId, vestidoId);
  const f = await prisma.vestidoFoto.findUnique({
    where: { vestidoId_ordem: { vestidoId, ordem } },
    select: { bytes: true, mime: true, updatedAt: true },
  });
  if (!f) return null;
  return { bytes: Buffer.from(f.bytes), mime: f.mime, versao: f.updatedAt.getTime() };
}

/** Otimiza e grava (cria/substitui) a foto na posição `ordem`. */
export async function salvarFoto(
  lojaId: string,
  vestidoId: string,
  ordem: number,
  entrada: ArrayBuffer | Buffer | Uint8Array,
): Promise<void> {
  exigirOrdem(ordem);
  await exigirVestidoDaLoja(lojaId, vestidoId);

  const bruto = Buffer.from(entrada as ArrayBuffer);
  if (bruto.byteLength === 0) throw new Error("Arquivo de imagem vazio");
  if (bruto.byteLength > MAX_UPLOAD_BYTES) throw new Error("Imagem muito grande (máximo 12 MB)");

  let otimizada: Buffer;
  let info: sharp.OutputInfo;
  try {
    const out = await sharp(bruto)
      .rotate() // respeita a orientação EXIF (fotos de celular)
      .resize({ width: MAX_LADO, height: MAX_LADO, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALIDADE })
      .toBuffer({ resolveWithObject: true });
    otimizada = out.data;
    info = out.info;
  } catch {
    throw new Error("Não foi possível ler a imagem. Envie um JPG, PNG ou WebP.");
  }

  const dados = {
    // Uint8Array sobre ArrayBuffer "puro" — o campo Bytes do Prisma 7 não aceita
    // o tipo Buffer<ArrayBufferLike> direto (mismatch SharedArrayBuffer).
    bytes: new Uint8Array(otimizada),
    mime: "image/webp",
    largura: info.width,
    altura: info.height,
  };
  await prisma.vestidoFoto.upsert({
    where: { vestidoId_ordem: { vestidoId, ordem } },
    create: { vestidoId, ordem, ...dados },
    update: dados,
  });
}

/** Remove a foto da posição `ordem` (idempotente). */
export async function removerFoto(lojaId: string, vestidoId: string, ordem: number): Promise<void> {
  exigirOrdem(ordem);
  await exigirVestidoDaLoja(lojaId, vestidoId);
  await prisma.vestidoFoto.deleteMany({ where: { vestidoId, ordem } });
}
