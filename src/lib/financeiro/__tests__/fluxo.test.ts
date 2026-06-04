// Integração (Postgres real): motor de fluxo de caixa (S7). Leitura pura sobre parcelas
// pagas (entrada) e pagamentos (saída), por competência do MOVIMENTO.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { resumoCaixa, movimentosDoMes, tendenciaCaixa, horizonteAberto } from "@/lib/financeiro/fluxo";

const MARK = "t-fluxo-";
let loja = "";
let outraLoja = "";
let colaborador = "";

async function novoLead(lojaId: string): Promise<string> {
  return (await prisma.lead.create({ data: { lojaId, noivaNome: `${MARK}Noiva Bela` } })).id;
}

/** Cria um contrato + uma parcela e, se `recebidoEm`, marca como PAGA (= entrada de caixa). */
async function entrada(lojaId: string, valor: number, recebidoEm: string | null, descricao?: string, numero = 1) {
  const leadId = await novoLead(lojaId);
  const contrato = await prisma.contrato.create({
    data: { lojaId, leadId, vendedoraId: colaborador, valorTotal: valor.toFixed(2), fechadoEm: new Date(`${recebidoEm ?? "2027-01-01"}T12:00:00Z`) },
  });
  return prisma.parcela.create({
    data: {
      lojaId,
      contratoId: contrato.id,
      numero,
      descricao: descricao ?? null,
      valorPrevisto: valor.toFixed(2),
      vencimento: new Date(`${recebidoEm ?? "2027-01-01"}T00:00:00Z`),
      status: recebidoEm ? "PAGA" : "PREVISTA",
      valorRecebido: recebidoEm ? valor.toFixed(2) : null,
      recebidoEm: recebidoEm ? new Date(`${recebidoEm}T12:00:00Z`) : null,
    },
  });
}

/** Cria uma saída de caixa: uma ContaPagar quitada por um Pagamento na data dada. */
async function saida(lojaId: string, valor: number, data: string, descricao = `${MARK}Despesa`, fornecedor?: string) {
  const conta = await prisma.contaPagar.create({
    data: { lojaId, tipo: "DESPESA", descricao, fornecedor: fornecedor ?? null, valorPrevisto: valor.toFixed(2), vencimento: new Date(`${data}T00:00:00Z`), status: "PAGA" },
  });
  const pg = await prisma.pagamento.create({ data: { lojaId, data: new Date(`${data}T12:00:00Z`), valorPago: valor.toFixed(2) } });
  await prisma.pagamentoItem.create({ data: { lojaId, pagamentoId: pg.id, contaPagarId: conta.id, valor: valor.toFixed(2) } });
  return pg;
}

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  outraLoja = (await prisma.loja.create({ data: { nome: `${MARK}outra` } })).id;
  colaborador = (await prisma.usuario.create({ data: { nome: `${MARK}Vera`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } })).id;

  // 2027-03: entradas 5k (dia 10) + 3k (dia 31, borda) = 8k; saídas 2k (dia 15) = 2k → saldo 6k.
  await entrada(loja, 5000, "2027-03-10", "Parcela 1");
  await entrada(loja, 3000, "2027-03-31", "Parcela 2", 2);
  await saida(loja, 2000, "2027-03-15", `${MARK}Aluguel`, "Imobiliária X");
  // ruídos que NÃO entram em 2027-03:
  await entrada(loja, 9999, null); // PREVISTA → não é caixa
  await entrada(loja, 1000, "2027-07-05"); // outra competência (isolada de mar/abr)
  await entrada(outraLoja, 7777, "2027-03-12"); // outra loja

  // 2027-04: só saída 4k → saldo negativo.
  await saida(loja, 4000, "2027-04-20", `${MARK}Fornecedor`);
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("resumoCaixa", () => {
  it("soma só parcelas PAGA e pagamentos no mês; isola loja; competência inválida → zero", async () => {
    expect(await resumoCaixa(loja, "2027-03")).toEqual({ entradas: "8000.00", saidas: "2000.00", saldo: "6000.00" });
    expect(await resumoCaixa(loja, "x")).toEqual({ entradas: "0.00", saidas: "0.00", saldo: "0.00" });
    // outra loja só tem a entrada de 7777 em março
    expect(await resumoCaixa(outraLoja, "2027-03")).toEqual({ entradas: "7777.00", saidas: "0.00", saldo: "7777.00" });
  });

  it("saldo negativo quando as saídas superam as entradas", async () => {
    expect(await resumoCaixa(loja, "2027-04")).toEqual({ entradas: "0.00", saidas: "4000.00", saldo: "-4000.00" });
  });
});

describe("movimentosDoMes", () => {
  it("mistura entradas e saídas ordenadas por data desc, com rótulo e href", async () => {
    const movs = await movimentosDoMes(loja, "2027-03");
    expect(movs).toHaveLength(3);
    // ordem: 31 (entrada 3k), 15 (saída 2k), 10 (entrada 5k)
    expect(movs.map((m) => m.tipo)).toEqual(["ENTRADA", "SAIDA", "ENTRADA"]);
    expect(movs[0]).toMatchObject({ tipo: "ENTRADA", valor: "3000.00", descricao: "Parcela 2", rotulo: `${MARK}Noiva Bela` });
    expect(movs[0].href).toContain("/contratos/");
    const saidaMov = movs.find((m) => m.tipo === "SAIDA")!;
    expect(saidaMov).toMatchObject({ valor: "2000.00", descricao: `${MARK}Aluguel`, rotulo: "Imobiliária X" });
    expect(saidaMov.href).toContain("/financeiro/pagar");
  });

  it("competência sem movimento → lista vazia", async () => {
    expect(await movimentosDoMes(loja, "2026-01")).toEqual([]);
  });
});

describe("tendenciaCaixa", () => {
  it("N meses em ordem ascendente, mês sem movimento = zeros (não some)", async () => {
    const t = await tendenciaCaixa(loja, { meses: 3, ate: "2027-04" });
    expect(t.map((p) => p.competencia)).toEqual(["2027-02", "2027-03", "2027-04"]);
    expect(t[0]).toMatchObject({ competencia: "2027-02", saldo: "0.00" }); // sem movimento
    expect(t[1]).toMatchObject({ competencia: "2027-03", saldo: "6000.00" });
    expect(t[2]).toMatchObject({ competencia: "2027-04", saldo: "-4000.00" });
  });

  it("vira o ano para trás corretamente", async () => {
    const t = await tendenciaCaixa(loja, { meses: 3, ate: "2027-01" });
    expect(t.map((p) => p.competencia)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});

describe("horizonteAberto", () => {
  it("traz a receber/a pagar em aberto (previsão), não o caixa realizado", async () => {
    const h = await horizonteAberto(loja);
    // a entrada PREVISTA de 9999 ainda está em aberto a receber
    expect(Number(h.aReceber)).toBeGreaterThanOrEqual(9999);
    expect(h).toHaveProperty("aPagar");
    expect(h).toHaveProperty("aReceberAtraso");
    expect(h).toHaveProperty("aPagarAtraso");
  });
});
