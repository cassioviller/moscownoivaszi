import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  listarPerfis,
  salvarTemplate,
  listarOverridesDaLoja,
  salvarOverride,
  removerOverride,
} from "@/lib/permissoes/perfis";

const MARK = "t-perfis-";
let lojaA = "";
let lojaB = "";
let perfil = "";

beforeAll(async () => {
  lojaA = (await prisma.loja.create({ data: { nome: `${MARK}A` } })).id;
  lojaB = (await prisma.loja.create({ data: { nome: `${MARK}B` } })).id;
  perfil = (await prisma.perfil.create({
    data: { nome: `${MARK}vend`, acessosModulos: { vestidos: { ver: true, criar: false, editar: false } } },
  })).id;
});

afterAll(async () => {
  await prisma.perfilOverrideLoja.deleteMany({ where: { lojaId: { in: [lojaA, lojaB] } } });
  await prisma.loja.deleteMany({ where: { id: { in: [lojaA, lojaB] } } });
  await prisma.perfil.delete({ where: { id: perfil } });
  await prisma.$disconnect();
});

describe("perfis data layer", () => {
  it("salvarTemplate normaliza e grava (criar ⇒ ver)", async () => {
    await salvarTemplate(perfil, { vestidos: { criar: true } });
    const lista = await listarPerfis();
    const p = lista.find((x) => x.id === perfil)!;
    expect(p.acessosModulos.vestidos).toEqual({ ver: true, criar: true, editar: false });
  });

  it("salvarOverride cria, depois atualiza (snapshot por loja)", async () => {
    await salvarOverride(lojaA, perfil, { vestidos: { ver: true, criar: true, editar: false } });
    let m = await listarOverridesDaLoja(lojaA);
    expect(m.get(perfil)?.vestidos.criar).toBe(true);

    await salvarOverride(lojaA, perfil, { vestidos: { ver: true, criar: false, editar: false } });
    m = await listarOverridesDaLoja(lojaA);
    expect(m.get(perfil)?.vestidos.criar).toBe(false);
  });

  it("override é escopado por loja (zero-vazamento)", async () => {
    await salvarOverride(lojaA, perfil, { vestidos: { ver: true, criar: true, editar: true } });
    const mB = await listarOverridesDaLoja(lojaB);
    expect(mB.has(perfil)).toBe(false);
  });

  it("removerOverride é idempotente e volta a Padrão", async () => {
    await salvarOverride(lojaA, perfil, { vestidos: { ver: true, criar: true, editar: true } });
    await removerOverride(lojaA, perfil);
    await removerOverride(lojaA, perfil); // 2ª vez não lança
    const m = await listarOverridesDaLoja(lojaA);
    expect(m.has(perfil)).toBe(false);
  });
});
