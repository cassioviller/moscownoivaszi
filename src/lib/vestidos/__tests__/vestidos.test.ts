// src/lib/vestidos/__tests__/vestidos.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  listarVestidos,
  obterVestido,
  criarVestido,
  editarVestido,
} from "@/lib/vestidos/vestidos";

const MARK = "t-vest-";
let lojaA = "";
let lojaB = "";

beforeAll(async () => {
  lojaA = (await prisma.loja.create({ data: { nome: `${MARK}A` } })).id;
  lojaB = (await prisma.loja.create({ data: { nome: `${MARK}B` } })).id;
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { id: { in: [lojaA, lojaB] } } }); // cascade Vestido
  await prisma.$disconnect();
});

describe("data layer de vestidos", () => {
  it("criarVestido carimba o lojaId da sessão (V1)", async () => {
    const v = await criarVestido(lojaA, { codigo: "V1", nome: "Serena", precoBase: "2400,00" });
    expect(v.lojaId).toBe(lojaA);
    expect(v.precoBase.toString()).toBe("2400");
  });

  it("código duplicado na loja vira erro amigável (V2)", async () => {
    await criarVestido(lojaA, { codigo: "DUP", nome: "Um", precoBase: "100" });
    await expect(criarVestido(lojaA, { codigo: "DUP", nome: "Dois", precoBase: "200" })).rejects.toThrow(
      "Já existe um vestido com esse código",
    );
  });

  it("validação: código/nome vazio e preço inválido (V3)", async () => {
    await expect(criarVestido(lojaA, { codigo: " ", nome: "X", precoBase: "100" })).rejects.toThrow("Código é obrigatório");
    await expect(criarVestido(lojaA, { codigo: "Y", nome: " ", precoBase: "100" })).rejects.toThrow("Nome é obrigatório");
    await expect(criarVestido(lojaA, { codigo: "Z", nome: "Z", precoBase: "abc" })).rejects.toThrow("Informe um preço válido");
    await expect(criarVestido(lojaA, { codigo: "Z2", nome: "Z", precoBase: "0" })).rejects.toThrow("Informe um preço válido");
  });

  it("listarVestidos é escopado e ordenado por nome (V4)", async () => {
    await criarVestido(lojaB, { codigo: "B1", nome: "ZZZ-loja-b", precoBase: "300" });
    const daA = await listarVestidos(lojaA);
    expect(daA.every((v) => v.lojaId === lojaA)).toBe(true);
    expect(daA.some((v) => v.nome === "ZZZ-loja-b")).toBe(false);
    const nomes = daA.map((v) => v.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b)));
  });

  it("obterVestido de outra loja retorna null (V5)", async () => {
    const doB = await criarVestido(lojaB, { codigo: "B2", nome: "Aurora", precoBase: "500" });
    expect(await obterVestido(lojaA, doB.id)).toBeNull();
    expect(await obterVestido(lojaB, doB.id)).not.toBeNull();
  });

  it("editarVestido altera campos e não re-tenanta (V6)", async () => {
    const v = await criarVestido(lojaA, { codigo: "EDT", nome: "Antes", precoBase: "100" });
    const e = await editarVestido(lojaA, v.id, { codigo: "EDT", nome: "Depois", precoBase: "150,50" });
    expect(e.nome).toBe("Depois");
    expect(e.precoBase.toString()).toBe("150.5");
    expect(e.lojaId).toBe(lojaA);
    // não dá pra editar pela loja errada (guard injeta lojaId no where → P2025):
    await expect(editarVestido(lojaB, v.id, { codigo: "EDT", nome: "X", precoBase: "100" })).rejects.toThrow();
  });
});
