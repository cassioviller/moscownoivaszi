import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { listarCabines, criarCabine, alternarCabineAtiva, obterHorarioLoja, salvarHorarioLoja } from "@/lib/atendimentos/cabines";

const MARK = "t-cabines-";
let loja = "";
beforeAll(async () => { loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id; });
afterAll(async () => { await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } }); });

describe("cabines + horário", () => {
  it("cria, lista e alterna ativa", async () => {
    const c = await criarCabine(loja, "  Cabine 1  ");
    expect(c.ok).toBe(true);
    const id = c.ok ? c.cabineId : "";
    let todas = await listarCabines(loja, {});
    expect(todas.find((x) => x.id === id)?.nome).toBe("Cabine 1");
    await alternarCabineAtiva(loja, id);
    const ativas = await listarCabines(loja, { ativasApenas: true });
    expect(ativas.find((x) => x.id === id)).toBeUndefined();
  });
  it("recusa cabine sem nome", async () => {
    expect(await criarCabine(loja, "   ")).toMatchObject({ ok: false, motivo: "sem_nome" });
  });
  it("horário: default 9–19, salva e valida", async () => {
    expect(await obterHorarioLoja(loja)).toEqual({ abertura: 9, fechamento: 19 });
    await salvarHorarioLoja(loja, 10, 20);
    expect(await obterHorarioLoja(loja)).toEqual({ abertura: 10, fechamento: 20 });
    expect(await salvarHorarioLoja(loja, 20, 10)).toMatchObject({ ok: false, motivo: "intervalo_invalido" });
  });
});
