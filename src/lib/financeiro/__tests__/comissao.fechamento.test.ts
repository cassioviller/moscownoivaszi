// Integração: fechamento da comissão (gera ContaPagar) + estorno §6.4 + cruzamento S5.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { definirRegra, fecharCompetencia, listarFechamentos, type FaixaInput } from "@/lib/financeiro/comissao";
import { listarContasAPagar, resumoPorCompetencia } from "@/lib/financeiro/pagar";

const MARK = "t-fech-";
let loja = "";
let vera = "";
let bia = "";

async function novoUsuario(nome: string): Promise<string> {
  const u = await prisma.usuario.create({ data: { nome: `${MARK}${nome}`, email: `${MARK}${nome}${Date.now()}@x.local`, senhaHash: "x" } });
  return u.id;
}
async function venda(vendedoraId: string, valorReais: number, competenciaDia: string, status: "ATIVO" | "CANCELADO" = "ATIVO") {
  const leadId = (await prisma.lead.create({ data: { lojaId: loja, noivaNome: `${MARK}noiva` } })).id;
  return prisma.contrato.create({
    data: { lojaId: loja, leadId, vendedoraId, valorTotal: valorReais.toFixed(2), status, fechadoEm: new Date(`${competenciaDia}T12:00:00.000Z`) },
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
  bia = await novoUsuario("Bia");
  await prisma.usuarioLoja.createMany({
    data: [
      { usuarioId: vera, lojaId: loja, perfilId: "perfil-vendedora" },
      { usuarioId: bia, lojaId: loja, perfilId: "perfil-vendedora" },
    ],
  });
  // regra vigente desde 2025-01 p/ ambas
  await definirRegra(loja, vera, { vigenciaInicio: "2025-01-01", bonusAcumulaFaixas: false, faixas: escada });
  await definirRegra(loja, bia, { vigenciaInicio: "2025-01-01", bonusAcumulaFaixas: false, faixas: escada });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("fecharCompetencia: regras de guarda", () => {
  it("recusa competência inválida, corrente e futura", async () => {
    expect(await fecharCompetencia(loja, "2025-13")).toMatchObject({ ok: false, motivo: "competencia_invalida" });
    expect(await fecharCompetencia(loja, "2099-01")).toMatchObject({ ok: false, motivo: "competencia_corrente" });
  });
});

describe("fecharCompetencia: fechamento + ContaPagar + idempotência", () => {
  it("fecha o mês, gera 1 ContaPagar COMISSAO por vendedora e não duplica ao repetir", async () => {
    await venda(vera, 50000, "2025-03-10"); // 50k → 5% → 2500
    const r1 = await fecharCompetencia(loja, "2025-03");
    expect(r1).toMatchObject({ ok: true, fechadas: 1 });

    const fechs = await listarFechamentos(loja, { competencia: "2025-03" });
    expect(fechs).toHaveLength(1);
    expect(fechs[0]).toMatchObject({ vendedoraId: vera, totalVendas: "50000.00", percentualAplicado: "5.00", valorComissao: "2500.00", valorTotal: "2500.00" });
    expect(fechs[0].contaPagarId).toBeTruthy();

    // a ContaPagar COMISSAO existe, ligada ao fechamento, vence 05/04
    const contas = await listarContasAPagar(loja, { tipo: "COMISSAO", filtro: "todas" });
    const conta = contas.find((c) => c.competencia === "2025-03");
    expect(conta).toMatchObject({ tipo: "COMISSAO", colaboradorId: vera, valorPrevisto: "2500.00" });
    expect(conta!.vencimento.toISOString().slice(0, 10)).toBe("2025-04-05");

    // idempotente: 2ª chamada não fecha de novo nem duplica conta
    const r2 = await fecharCompetencia(loja, "2025-03");
    expect(r2).toMatchObject({ ok: true, fechadas: 0 });
    expect((await listarFechamentos(loja, { competencia: "2025-03" }))).toHaveLength(1);
    expect((await listarContasAPagar(loja, { tipo: "COMISSAO", filtro: "todas" })).filter((c) => c.competencia === "2025-03")).toHaveLength(1);
  });

  it("cruzamento S5: a comissão aparece no resumo por competência", async () => {
    const resumo = await resumoPorCompetencia(loja, "2025-03");
    const linhaVera = resumo.find((x) => x.colaboradorId === vera);
    expect(linhaVera).toMatchObject({ salario: "0.00", comissao: "2500.00", total: "2500.00" });
  });
});

describe("fecharCompetencia: estorno §6.4", () => {
  it("cancelar contrato após o fechamento abate na competência seguinte e marca o contrato", async () => {
    const c = await venda(vera, 30000, "2025-04-10"); // 30k → faixa 5% → 1500
    expect(await fecharCompetencia(loja, "2025-04")).toMatchObject({ ok: true, fechadas: 1 });

    // cancela o contrato JÁ fechado
    await prisma.contrato.update({ where: { id: c.id }, data: { status: "CANCELADO" } });

    // vende 50k em 2025-05 → bruto 50k − estorno 30k = net 20k → faixa 3% → 600
    await venda(vera, 50000, "2025-05-10");
    expect(await fecharCompetencia(loja, "2025-05")).toMatchObject({ ok: true, fechadas: 1 });

    const fech = (await listarFechamentos(loja, { competencia: "2025-05" })).find((f) => f.vendedoraId === vera);
    expect(fech).toMatchObject({ totalVendas: "20000.00", percentualAplicado: "3.00", valorComissao: "600.00" });

    // contrato cancelado foi reconciliado
    const reconc = await prisma.contrato.findUnique({ where: { id: c.id }, select: { comissaoEstornadaEm: true } });
    expect(reconc?.comissaoEstornadaEm).not.toBeNull();
  });

  it("estorno maior que as vendas do mês: comissão zero e o cancelado CARREGA (sem marca)", async () => {
    const c = await venda(bia, 10000, "2025-04-12"); // 10k → 3% → 300
    expect(await fecharCompetencia(loja, "2025-04")).toMatchObject({ ok: true }); // fecha bia em 04 também

    await prisma.contrato.update({ where: { id: c.id }, data: { status: "CANCELADO" } });

    await venda(bia, 5000, "2025-05-13"); // 5k < estorno 10k → net negativo → 0, carrega
    await fecharCompetencia(loja, "2025-05");

    const fech = (await listarFechamentos(loja, { competencia: "2025-05" })).find((f) => f.vendedoraId === bia);
    expect(fech).toMatchObject({ totalVendas: "0.00", valorComissao: "0.00", valorTotal: "0.00" });

    // o cancelado NÃO foi marcado (segue pendente p/ carregar)
    const aindaPendente = await prisma.contrato.findUnique({ where: { id: c.id }, select: { comissaoEstornadaEm: true } });
    expect(aindaPendente?.comissaoEstornadaEm).toBeNull();
  });
});
