// Unit (puro) + integração: rotuloCategoria (fallback no tipo) e dreDoMes (receitas − despesas
// por categoria, regime de caixa, por competência).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC } from "@/lib/tempo";
import { competenciaAtual } from "@/lib/financeiro/datas";
import { rotuloCategoria, dreDoMes } from "@/lib/financeiro/dre";

describe("rotuloCategoria", () => {
  it("usa a categoria livre quando houver", () => {
    expect(rotuloCategoria("Aluguel", "DESPESA")).toBe("Aluguel");
  });
  it("vazio/null cai no rótulo do tipo", () => {
    expect(rotuloCategoria("   ", "SALARIO")).toBe("Salários");
    expect(rotuloCategoria(null, "FORNECEDOR")).toBe("Fornecedores");
    expect(rotuloCategoria(null, "COMISSAO")).toBe("Comissões");
    expect(rotuloCategoria(null, "DESPESA")).toBe("Despesas");
  });
});

const MARK = "t-dre-";
let loja = "";
let noiva = "";
let vend = "";
const hoje = hojeUTC();
const comp = competenciaAtual();

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Ana`, etapa: "NOVO" } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}V`, email: `${MARK}${noiva}@x.local`, senhaHash: "x" } });
  vend = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  const contrato = await db.contrato.create({ data: { leadId: noiva, vendedoraId: vend, valorTotal: 9999 } as never });
  await db.parcela.create({ data: { contratoId: contrato.id, numero: 1, valorPrevisto: 2000, vencimento: hoje, status: "PAGA", valorRecebido: 2000, recebidoEm: hoje } as never });
  const fora = new Date(hoje.getTime()); fora.setUTCDate(fora.getUTCDate() - 40);
  await db.parcela.create({ data: { contratoId: contrato.id, numero: 2, valorPrevisto: 999, vencimento: fora, status: "PAGA", valorRecebido: 999, recebidoEm: fora } as never });
  const ap1 = await db.contaPagar.create({ data: { tipo: "DESPESA", descricao: `${MARK}aluguel`, categoria: "Aluguel", valorPrevisto: 800, vencimento: hoje } as never });
  const ap2 = await db.contaPagar.create({ data: { tipo: "SALARIO", descricao: `${MARK}salario`, valorPrevisto: 1200, vencimento: hoje } as never });
  const pg = await db.pagamento.create({ data: { data: hoje, valorPago: 2000 } as never });
  await db.pagamentoItem.create({ data: { pagamentoId: pg.id, contaPagarId: ap1.id, valor: 800 } as never });
  await db.pagamentoItem.create({ data: { pagamentoId: pg.id, contaPagarId: ap2.id, valor: 1200 } as never });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("dreDoMes", () => {
  it("receitas do mês ignoram recebimentos de outra competência", async () => {
    const d = await dreDoMes(loja, comp);
    expect(d.receitas).toBe("2000.00");
  });
  it("despesas agrupadas por categoria (fallback no tipo), maior primeiro", async () => {
    const d = await dreDoMes(loja, comp);
    expect(d.despesas).toEqual([
      { rotulo: "Salários", total: "1200.00" },
      { rotulo: "Aluguel", total: "800.00" },
    ]);
    expect(d.totalDespesas).toBe("2000.00");
  });
  it("resultado = receitas − despesas", async () => {
    const d = await dreDoMes(loja, comp);
    expect(d.resultado).toBe("0.00");
  });
  it("competência inválida → DRE zerado", async () => {
    const d = await dreDoMes(loja, "abc");
    expect(d).toEqual({ competencia: "abc", receitas: "0.00", despesas: [], totalDespesas: "0.00", resultado: "0.00" });
  });
});
