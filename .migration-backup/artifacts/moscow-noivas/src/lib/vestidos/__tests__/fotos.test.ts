// src/lib/vestidos/__tests__/fotos.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { criarVestido } from "@/lib/vestidos/vestidos";
import { listarFotosMeta, obterFotoBytes, removerFoto, salvarFoto } from "@/lib/vestidos/fotos";

const MARK = "t-fotos-";
let lojaA = "";
let lojaB = "";
let vestidoId = "";
let imagemGrande: Buffer;

beforeAll(async () => {
  lojaA = (await prisma.loja.create({ data: { nome: `${MARK}A` } })).id;
  lojaB = (await prisma.loja.create({ data: { nome: `${MARK}B` } })).id;
  vestidoId = (await criarVestido(lojaA, { codigo: "F1", nome: "Com foto", precoBase: "1000" })).id;
  // PNG 2000×1600 (maior que o teto de 1400) p/ exercitar o redimensionamento.
  imagemGrande = await sharp({
    create: { width: 2000, height: 1600, channels: 3, background: { r: 210, g: 190, b: 170 } },
  })
    .png()
    .toBuffer();
});

afterAll(async () => {
  await prisma.vestido.deleteMany({ where: { lojaId: { in: [lojaA, lojaB] } } }); // cascade VestidoFoto
  await prisma.loja.deleteMany({ where: { id: { in: [lojaA, lojaB] } } });
  await prisma.$disconnect();
});

describe("fotos do vestido (otimização + escopo)", () => {
  it("salvarFoto otimiza para WebP e redimensiona ao teto de 1400px (FT1)", async () => {
    await salvarFoto(lojaA, vestidoId, 0, imagemGrande);
    const meta = await listarFotosMeta(lojaA, vestidoId);
    expect(meta).toHaveLength(1);
    expect(meta[0].ordem).toBe(0);
    expect(meta[0].largura).toBe(1400); // 2000→1400 (fit inside)
    expect(meta[0].altura).toBe(1120); // proporção mantida

    const bytes = await obterFotoBytes(lojaA, vestidoId, 0);
    expect(bytes?.mime).toBe("image/webp");
    expect(bytes!.bytes.byteLength).toBeGreaterThan(0);
    expect(bytes!.bytes.byteLength).toBeLessThan(imagemGrande.byteLength); // menor que o bruto
  });

  it("substituir a foto troca a versão e mantém uma só na posição (FT2)", async () => {
    const antes = (await listarFotosMeta(lojaA, vestidoId))[0].versao;
    await salvarFoto(lojaA, vestidoId, 0, imagemGrande);
    const depois = await listarFotosMeta(lojaA, vestidoId);
    expect(depois).toHaveLength(1);
    expect(depois[0].versao).toBeGreaterThanOrEqual(antes);
  });

  it("aceita 2 posições e remove de forma idempotente (FT3)", async () => {
    await salvarFoto(lojaA, vestidoId, 1, imagemGrande);
    expect(await listarFotosMeta(lojaA, vestidoId)).toHaveLength(2);
    await removerFoto(lojaA, vestidoId, 0);
    const meta = await listarFotosMeta(lojaA, vestidoId);
    expect(meta.map((m) => m.ordem)).toEqual([1]);
    await removerFoto(lojaA, vestidoId, 0); // idempotente
    expect(await listarFotosMeta(lojaA, vestidoId)).toHaveLength(1);
  });

  it("posição inválida é rejeitada (FT4)", async () => {
    await expect(salvarFoto(lojaA, vestidoId, 2, imagemGrande)).rejects.toThrow("Posição de foto inválida");
  });

  it("vestido de outra loja é rejeitado — falha fechada (FT5)", async () => {
    await expect(salvarFoto(lojaB, vestidoId, 0, imagemGrande)).rejects.toThrow(
      "Vestido não encontrado nesta loja",
    );
    await expect(obterFotoBytes(lojaB, vestidoId, 1)).rejects.toThrow("não encontrado nesta loja");
    await expect(listarFotosMeta(lojaB, vestidoId)).rejects.toThrow("não encontrado nesta loja");
  });
});
