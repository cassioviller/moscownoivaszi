// Integração: definirSaldoReferencia grava a âncora; ancoraAtiva pega a mais recente ≤ hoje;
// saldoDeHoje = âncora + realizado(âncora→hoje). Escopo de loja.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC, ymd } from "@/lib/tempo";
import { definirSaldoReferencia, ancoraAtiva, saldoDeHoje } from "@/lib/financeiro/saldo-referencia";

const MARK = "t-saldo-ref-";
let loja = "";
let noiva = "";
let vendedora = "";

const hoje = hojeUTC();
const menos = (n: number) => { const d = new Date(hoje.getTime()); d.setUTCDate(d.getUTCDate() - n); return d; };
const ymdMenos = (n: number) => ymd(menos(n))!;

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Noiva`, etapa: "NOVO" } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}Vend`, email: `${MARK}${noiva}@x.local`, senhaHash: "x" } });
  vendedora = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  // Âncora: saldo 5000 em (hoje-5).
  await definirSaldoReferencia(loja, { data: ymdMenos(5), valor: "5000,00" });
  // Realizado entre a âncora e hoje: uma parcela PAGA de 1000 recebida em (hoje-2).
  const contrato = await db.contrato.create({ data: { leadId: noiva, vendedoraId: vendedora, valorTotal: 1000 } as never });
  await db.parcela.create({
    data: { contratoId: contrato.id, numero: 1, valorPrevisto: 1000, vencimento: menos(2), status: "PAGA", valorRecebido: 1000, recebidoEm: menos(2) } as never,
  });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("saldo-referencia", () => {
  it("ancoraAtiva pega a âncora mais recente ≤ hoje", async () => {
    const a = await ancoraAtiva(loja);
    expect(a).not.toBeNull();
    expect(a!.valor).toBe("5000.00");
  });

  it("definirSaldoReferencia rejeita data futura", async () => {
    const r = await definirSaldoReferencia(loja, { data: ymd(new Date(hoje.getTime() + 86_400_000))!, valor: "100" });
    expect(r).toEqual({ ok: false, motivo: "data_invalida" });
  });

  it("definirSaldoReferencia rejeita valor inválido", async () => {
    const r = await definirSaldoReferencia(loja, { data: ymdMenos(1), valor: "abc" });
    expect(r).toEqual({ ok: false, motivo: "valor_invalido" });
  });

  it("saldoDeHoje = âncora + realizado(âncora→hoje)", async () => {
    const s = await saldoDeHoje(loja);
    expect(s.ancora).not.toBeNull();
    expect(s.valor).toBe("6000.00"); // 5000 + 1000 recebido
  });

  it("sem âncora: saldoDeHoje devolve valor null", async () => {
    const outra = (await prisma.loja.create({ data: { nome: `${MARK}vazia` } })).id;
    const s = await saldoDeHoje(outra);
    expect(s).toEqual({ valor: null, ancora: null });
  });
});
