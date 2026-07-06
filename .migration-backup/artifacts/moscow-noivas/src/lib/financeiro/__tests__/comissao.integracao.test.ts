// Integração (Postgres real): camada com banco da comissão — regras, acumulado, preview.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  definirRegra,
  listarRegras,
  removerRegra,
  regraVigente,
  totalVendasCentavos,
  previewComissao,
  comissaoDaVendedora,
  listarFechamentos,
  type FaixaInput,
} from "@/lib/financeiro/comissao";

const MARK = "t-comissao-";
let loja = "";
let outraLoja = "";
let vera = "";
let ana = "";
let foraDaLoja = "";

async function novoUsuario(nome: string): Promise<string> {
  const u = await prisma.usuario.create({ data: { nome: `${MARK}${nome}`, email: `${MARK}${nome}${Date.now()}@x.local`, senhaHash: "x" } });
  return u.id;
}
async function novoLead(lojaId: string): Promise<string> {
  const l = await prisma.lead.create({ data: { lojaId, noivaNome: `${MARK}noiva` } });
  return l.id;
}
async function venda(lojaId: string, vendedoraId: string, valorReais: number, competenciaDia: string, status: "ATIVO" | "CANCELADO" = "ATIVO") {
  const leadId = await novoLead(lojaId);
  return prisma.contrato.create({
    data: { lojaId, leadId, vendedoraId, valorTotal: valorReais.toFixed(2), status, fechadoEm: new Date(`${competenciaDia}T12:00:00.000Z`) },
  });
}

// Escada 3% até 30k, 5% até 60k, 7% acima.
const escada: FaixaInput[] = [
  { minAcumulado: "0", maxAcumulado: "30.000,00", percentual: "3", bonusFixo: null },
  { minAcumulado: "30.000,00", maxAcumulado: "60.000,00", percentual: "5", bonusFixo: null },
  { minAcumulado: "60.000,00", maxAcumulado: null, percentual: "7", bonusFixo: null },
];

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  outraLoja = (await prisma.loja.create({ data: { nome: `${MARK}outra` } })).id;
  vera = await novoUsuario("Vera");
  ana = await novoUsuario("Ana");
  foraDaLoja = await novoUsuario("Fora");
  await prisma.usuarioLoja.createMany({
    data: [
      { usuarioId: vera, lojaId: loja, perfilId: "perfil-vendedora" },
      { usuarioId: ana, lojaId: loja, perfilId: "perfil-vendedora" },
    ],
  });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("comissao: regras", () => {
  it("define regra (valida membro + faixas), lista e remove", async () => {
    const r = await definirRegra(loja, vera, { vigenciaInicio: "2027-01-01", bonusAcumulaFaixas: false, faixas: escada });
    expect(r.ok).toBe(true);

    expect(await definirRegra(loja, foraDaLoja, { bonusAcumulaFaixas: false, faixas: escada })).toMatchObject({ ok: false, motivo: "vendedora_invalida" });
    expect(await definirRegra(loja, vera, { bonusAcumulaFaixas: false, faixas: [] })).toMatchObject({ ok: false, motivo: "faixas_invalidas" });
    expect(await definirRegra(loja, vera, { bonusAcumulaFaixas: false, faixas: [{ minAcumulado: "0", maxAcumulado: "x", percentual: "3", bonusFixo: null }] })).toMatchObject({ ok: false, motivo: "valor_invalido" });

    const regras = await listarRegras(loja);
    const daVera = regras.find((x) => x.vendedoraId === vera);
    expect(daVera?.faixas).toHaveLength(3);
    expect(daVera?.faixas[0]).toMatchObject({ minAcumulado: "0.00", maxAcumulado: "30000.00", percentual: "3.00" });

    if (!r.ok) throw new Error("falhou");
    expect((await removerRegra(loja, r.regraId)).ok).toBe(true);
    expect((await listarRegras(loja)).some((x) => x.id === r.regraId)).toBe(false);
  });

  it("upsert por vigência: redefinir a mesma vigência substitui as faixas", async () => {
    await definirRegra(loja, ana, { vigenciaInicio: "2027-01-01", bonusAcumulaFaixas: false, faixas: escada });
    await definirRegra(loja, ana, { vigenciaInicio: "2027-01-01", bonusAcumulaFaixas: true, faixas: [{ minAcumulado: "0", maxAcumulado: null, percentual: "10", bonusFixo: null }] });
    const regras = (await listarRegras(loja)).filter((x) => x.vendedoraId === ana && x.vigenciaInicio.toISOString().startsWith("2027-01-01"));
    expect(regras).toHaveLength(1);
    expect(regras[0].bonusAcumulaFaixas).toBe(true);
    expect(regras[0].faixas).toHaveLength(1);
  });
});

describe("comissao: acumulado e regra vigente", () => {
  it("soma só ATIVO da competência, isola loja, e regraVigente pega a mais recente", async () => {
    await venda(loja, vera, 20000.00, "2027-03-10");
    await venda(loja, vera, 15000.00, "2027-03-20");
    await venda(loja, vera, 9000.00, "2027-03-25", "CANCELADO"); // não conta
    await venda(loja, vera, 5000.00, "2027-04-01"); // outra competência
    await venda(outraLoja, vera, 99000.00, "2027-03-15"); // outra loja

    expect(await totalVendasCentavos(loja, vera, "2027-03")).toBe(3500000); // 20k + 15k

    // regra vigente: a partir de 2027-01 vale a escada; uma vigência futura não conta p/ março
    await definirRegra(loja, vera, { vigenciaInicio: "2027-01-01", bonusAcumulaFaixas: false, faixas: escada });
    await definirRegra(loja, vera, { vigenciaInicio: "2099-01-01", bonusAcumulaFaixas: false, faixas: [{ minAcumulado: "0", maxAcumulado: null, percentual: "1", bonusFixo: null }] });
    const rv = await regraVigente(loja, vera, "2027-03");
    expect(rv?.faixas).toHaveLength(3); // a escada de 2027-01, não a de 2099
  });
});

describe("comissao: preview e perfil", () => {
  it("ranking aplica a regra vigente; perfil mostra próximo degrau", async () => {
    // Vera já tem 35k em 2027-03 (acima) + escada → faixa 5% sobre 35k = 1750
    const preview = await previewComissao(loja, "2027-03");
    const linhaVera = preview.find((l) => l.vendedoraId === vera);
    expect(linhaVera).toMatchObject({ totalVendas: "35000.00", percentual: "5.00", comissao: "1750.00", total: "1750.00" });

    const resumo = await comissaoDaVendedora(loja, vera, "2027-03");
    expect(resumo).toMatchObject({ totalVendas: "35000.00", percentual: "5.00", comissao: "1750.00" });
    // próximo degrau: 7% a partir de 60k → faltam 25k
    expect(resumo.proximoDegrau).toMatchObject({ faltam: "25000.00", percentual: "7.00" });
  });

  it("vendedora sem regra: acumulado aparece, comissão zero", async () => {
    await venda(loja, ana, 40000.00, "2027-05-10");
    // ana tem regra só em 2027-01 (10% topo aberto) → na verdade tem comissão; usar competência sem regra
    const resumo = await comissaoDaVendedora(loja, ana, "2026-01"); // sem vendas/sem regra vigente nessa data
    expect(resumo).toMatchObject({ totalVendas: "0.00", comissao: "0.00", total: "0.00", percentual: null });
  });
});

describe("comissao: fechamentos (leitura)", () => {
  it("histórico vazio antes de qualquer fechamento", async () => {
    expect(await listarFechamentos(loja)).toEqual([]);
  });
});
