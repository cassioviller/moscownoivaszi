// Integração: preview de comissão por INTERVALO (lente de visualização da semana/período).
// A janela de datas passa a ser arbitrária; as faixas/degraus acumulam sobre o total do
// intervalo (aproximação intencional — ver comentário em comissao.ts). O wrapper por
// competência deve continuar idêntico ao preview clássico.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  definirRegra,
  previewComissao,
  previewComissaoIntervalo,
  type FaixaInput,
} from "@/lib/financeiro/comissao";
import { competenciaRange } from "@/lib/financeiro/datas";

const MARK = "t-com-int-";
let loja = "";
let vera = "";

async function novoUsuario(nome: string): Promise<string> {
  const u = await prisma.usuario.create({ data: { nome: `${MARK}${nome}`, email: `${MARK}${nome}${Date.now()}@x.local`, senhaHash: "x" } });
  return u.id;
}
async function venda(vendedoraId: string, valorReais: number, dia: string) {
  const leadId = (await prisma.lead.create({ data: { lojaId: loja, noivaNome: `${MARK}noiva` } })).id;
  return prisma.contrato.create({
    data: { lojaId: loja, leadId, vendedoraId, valorTotal: valorReais.toFixed(2), status: "ATIVO", fechadoEm: new Date(`${dia}T12:00:00.000Z`) },
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
  vera = await novoUsuario("Vera");
  await prisma.usuarioLoja.create({ data: { usuarioId: vera, lojaId: loja, perfilId: "perfil-vendedora" } });
  await definirRegra(loja, vera, { vigenciaInicio: "2027-01-01", bonusAcumulaFaixas: false, faixas: escada });

  // Em março: 10k (semana 1) + 25k (semana 2) dentro; 50k fora do intervalo (fim do mês);
  // e uma venda em abril (fora da competência por completo).
  await venda(vera, 10000.0, "2027-03-03");
  await venda(vera, 25000.0, "2027-03-10");
  await venda(vera, 50000.0, "2027-03-28");
  await venda(vera, 9999.0, "2027-04-02");
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("comissao: preview por intervalo", () => {
  it("só considera vendas dentro da janela escolhida", async () => {
    // Janela 01..15 de março → 35k (10k + 25k). Faixa de 5% sobre 35k = 1750.
    const r = await previewComissaoIntervalo(loja, {
      gte: new Date("2027-03-01T00:00:00.000Z"),
      lt: new Date("2027-03-16T00:00:00.000Z"),
    });
    const linha = r.find((l) => l.vendedoraId === vera);
    expect(linha).toMatchObject({ totalVendas: "35000.00", percentual: "5.00", comissao: "1750.00", total: "1750.00" });
  });

  it("janela só na semana final pega a venda de 50k (faixa 5% sobre 50k = 2500)", async () => {
    const r = await previewComissaoIntervalo(loja, {
      gte: new Date("2027-03-22T00:00:00.000Z"),
      lt: new Date("2027-03-29T00:00:00.000Z"),
    });
    const linha = r.find((l) => l.vendedoraId === vera);
    expect(linha).toMatchObject({ totalVendas: "50000.00", percentual: "5.00", comissao: "2500.00" });
  });

  it("wrapper por competência continua idêntico ao preview por intervalo do mês inteiro", async () => {
    const porComp = await previewComissao(loja, "2027-03");
    const { gte, lt } = competenciaRange("2027-03");
    const porIntervalo = await previewComissaoIntervalo(loja, { gte, lt });
    expect(porIntervalo).toEqual(porComp);
    // total do mês: 10k + 25k + 50k = 85k → faixa 7% (topo aberto) → 5950
    const linha = porComp.find((l) => l.vendedoraId === vera);
    expect(linha).toMatchObject({ totalVendas: "85000.00", percentual: "7.00", comissao: "5950.00" });
  });
});
