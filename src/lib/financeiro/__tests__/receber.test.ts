// Integração (Postgres real): contas a receber — plano, baixa, atraso, resumo.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { criarContratoDaNoiva, editarContrato } from "@/lib/contratos/contratos";
import {
  gerarPlanoDePagamento,
  adicionarParcela,
  editarParcela,
  removerParcela,
  registrarRecebimento,
  estornarRecebimento,
  listarParcelasDoContrato,
  listarContasAReceber,
  resumoReceber,
} from "@/lib/financeiro/receber";

const MARK = "t-receber-";
let loja = "";
let lead = "";
let vend = "";

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  lead = (await db.lead.create({ data: { noivaNome: `${MARK}Ana` } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}V`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  vend = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

async function contrato(valor: string, lojaId = loja, leadId = lead): Promise<string> {
  const r = await criarContratoDaNoiva(lojaId, leadId, vend);
  if (!r.ok) throw new Error("contrato falhou: " + r.motivo);
  await editarContrato(lojaId, r.contratoId, { valorTotal: valor });
  return r.contratoId;
}
const somaPrevisto = (ps: { valorPrevisto: string }[]) => ps.reduce((s, p) => s + Math.round(Number(p.valorPrevisto) * 100), 0);

describe("receber: geração do plano", () => {
  it("sem entrada: 1000 em 3 → soma exata, última absorve o resto", async () => {
    const c = await contrato("1.000,00");
    expect((await gerarPlanoDePagamento(loja, c, { numParcelas: 3, primeiroVencimento: "2027-01-10" })).ok).toBe(true);
    const ps = await listarParcelasDoContrato(loja, c);
    expect(ps).toHaveLength(3);
    expect(somaPrevisto(ps)).toBe(100000); // bate o total exato
    expect(ps.map((p) => p.valorPrevisto)).toEqual(["333.33", "333.33", "333.34"]);
  });

  it("com entrada: 1000 = 400 + 2×300", async () => {
    const c = await contrato("1.000,00");
    expect((await gerarPlanoDePagamento(loja, c, { entrada: "400", numParcelas: 2, primeiroVencimento: "2027-02-01" })).ok).toBe(true);
    const ps = await listarParcelasDoContrato(loja, c);
    expect(ps).toHaveLength(3);
    expect(ps[0].descricao).toBe("Entrada");
    expect(somaPrevisto(ps)).toBe(100000);
    expect(ps.map((p) => p.valorPrevisto)).toEqual(["400.00", "300.00", "300.00"]);
  });

  it("recusa entrada > total e gerar plano 2×", async () => {
    const c = await contrato("500,00");
    expect(await gerarPlanoDePagamento(loja, c, { entrada: "600", numParcelas: 1, primeiroVencimento: "2027-03-01" })).toMatchObject({ ok: false, motivo: "entrada_maior" });
    expect((await gerarPlanoDePagamento(loja, c, { numParcelas: 1, primeiroVencimento: "2027-03-01" })).ok).toBe(true);
    expect(await gerarPlanoDePagamento(loja, c, { numParcelas: 2, primeiroVencimento: "2027-03-01" })).toMatchObject({ ok: false, motivo: "ja_tem_plano" });
  });
});

describe("receber: baixa, ajuste e atraso", () => {
  it("registrar recebimento (default = previsto) e estornar", async () => {
    const c = await contrato("300,00");
    await gerarPlanoDePagamento(loja, c, { numParcelas: 1, primeiroVencimento: "2027-04-01" });
    const [p] = await listarParcelasDoContrato(loja, c);
    expect((await registrarRecebimento(loja, p.id, { forma: "Pix" })).ok).toBe(true);
    const depois = (await listarParcelasDoContrato(loja, c))[0];
    expect(depois.status).toBe("PAGA");
    expect(depois.valorRecebido).toBe("300.00");
    expect(depois.formaRecebimento).toBe("Pix");
    // editar/remover travados após pago
    expect(await editarParcela(loja, p.id, { valorPrevisto: "10" })).toMatchObject({ ok: false, motivo: "nao_previsto" });
    expect(await removerParcela(loja, p.id)).toMatchObject({ ok: false, motivo: "nao_previsto" });
    // estorna
    expect((await estornarRecebimento(loja, p.id)).ok).toBe(true);
    expect((await listarParcelasDoContrato(loja, c))[0].status).toBe("PREVISTA");
  });

  it("atrasada é derivada (vencimento passado + PREVISTA)", async () => {
    const c = await contrato("100,00");
    await gerarPlanoDePagamento(loja, c, { numParcelas: 1, primeiroVencimento: "2020-01-01" });
    const [p] = await listarParcelasDoContrato(loja, c);
    expect(p.atrasada).toBe(true);
    const atrasadas = await listarContasAReceber(loja, { filtro: "atrasadas" });
    expect(atrasadas.some((x) => x.id === p.id)).toBe(true);
  });

  it("adicionar parcela manual e editar valor", async () => {
    const c = await contrato("0,00");
    const r = await adicionarParcela(loja, c, { descricao: "Extra", valorPrevisto: "150,00", vencimento: "2027-05-01" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await editarParcela(loja, r.parcelaId, { valorPrevisto: "200" })).ok).toBe(true);
    const ps = await listarParcelasDoContrato(loja, c);
    expect(ps.find((p) => p.id === r.parcelaId)!.valorPrevisto).toBe("200.00");
  });
});

describe("receber: resumo e isolamento", () => {
  it("resumo soma a receber / recebido / em atraso (loja isolada)", async () => {
    // loja dedicada p/ resumo determinístico.
    const l2 = (await prisma.loja.create({ data: { nome: `${MARK}resumo` } })).id;
    const db2 = tenantPrisma(prisma, l2);
    const noiva2 = (await db2.lead.create({ data: { noivaNome: `${MARK}Bia` } as never })).id;
    await prisma.usuarioLoja.create({ data: { usuarioId: vend, lojaId: l2, perfilId: "perfil-vendedora" } });
    const c = await contrato("1.000,00", l2, noiva2);
    // 1 atrasada (venc 2020) + 1 futura (2027); paga a futura.
    await gerarPlanoDePagamento(l2, c, { numParcelas: 2, primeiroVencimento: "2020-01-01", periodicidadeDias: 3000 });
    const ps = await listarParcelasDoContrato(l2, c);
    await registrarRecebimento(l2, ps[1].id, {}); // paga a 2ª (500)

    const r = await resumoReceber(l2);
    expect(r.recebidoTotal).toBe("500.00");
    expect(r.totalAReceber).toBe("500.00"); // a 1ª segue prevista
    expect(r.emAtraso).toBe("500.00"); // a 1ª vence em 2020 → atrasada

    // outra loja não enxerga
    expect((await listarContasAReceber(loja, { filtro: "todas" })).some((x) => x.contratoId === c)).toBe(false);
  });
});
