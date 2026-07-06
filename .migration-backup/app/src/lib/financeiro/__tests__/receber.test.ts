// Integração (Postgres real): contas a receber — plano, baixa, atraso, resumo.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { criarContratoDaNoiva, editarContrato, cancelarContrato } from "@/lib/contratos/contratos";
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

  it("recusa número de parcelas fora do teto (1..360)", async () => {
    const c = await contrato("1.000,00");
    expect(await gerarPlanoDePagamento(loja, c, { numParcelas: 100000, primeiroVencimento: "2027-03-01" })).toMatchObject({ ok: false, motivo: "num_invalido" });
    expect(await gerarPlanoDePagamento(loja, c, { numParcelas: 0, primeiroVencimento: "2027-03-01" })).toMatchObject({ ok: false, motivo: "num_invalido" });
  });
});

describe("receber: baixa, ajuste e atraso", () => {
  it("registrar recebimento (default = previsto) e estornar", async () => {
    const c = await contrato("300,00");
    await gerarPlanoDePagamento(loja, c, { numParcelas: 1, primeiroVencimento: "2027-04-01" });
    const [p] = await listarParcelasDoContrato(loja, c);
    expect((await registrarRecebimento(loja, p.id, { forma: "PIX" })).ok).toBe(true);
    const depois = (await listarParcelasDoContrato(loja, c))[0];
    expect(depois.status).toBe("PAGA");
    expect(depois.valorRecebido).toBe("300.00");
    expect(depois.formaRecebimento).toBe("PIX");
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
    expect(atrasadas.itens.some((x) => x.id === p.id)).toBe(true);
  });

  it("recusa recebimento de R$0 (baixa fantasma)", async () => {
    const c = await contrato("300,00");
    await gerarPlanoDePagamento(loja, c, { numParcelas: 1, primeiroVencimento: "2027-06-01" });
    const [p] = await listarParcelasDoContrato(loja, c);
    expect(await registrarRecebimento(loja, p.id, { valor: "0" })).toMatchObject({ ok: false, motivo: "valor_invalido" });
  });

  it("registrarRecebimento valida a forma (enum)", async () => {
    const c = await contrato("200,00");
    await gerarPlanoDePagamento(loja, c, { numParcelas: 2, primeiroVencimento: "2027-08-01" });
    const ps = await listarParcelasDoContrato(loja, c);
    expect((await registrarRecebimento(loja, ps[0].id, { valor: "100", forma: "CARTAO_CREDITO" })).ok).toBe(true);
    expect(await registrarRecebimento(loja, ps[1].id, { valor: "100", forma: "qualquer" })).toEqual({ ok: false, motivo: "forma_invalida" });
  });

  it("contrato CANCELADO: bloqueia receber/remover, mas permite estornar", async () => {
    const c = await contrato("300,00");
    await gerarPlanoDePagamento(loja, c, { numParcelas: 1, primeiroVencimento: "2027-07-01" });
    const [p] = await listarParcelasDoContrato(loja, c);
    // recebe antes de cancelar
    await registrarRecebimento(loja, p.id, {});
    await cancelarContrato(loja, c, { destinoPago: "manter" });
    // estornar AINDA funciona (corrigir erro), mas receber/remover não
    expect((await estornarRecebimento(loja, p.id)).ok).toBe(true);
    expect(await registrarRecebimento(loja, p.id, {})).toMatchObject({ ok: false, motivo: "contrato_nao_ativo" });
    expect(await removerParcela(loja, p.id)).toMatchObject({ ok: false, motivo: "contrato_nao_ativo" });
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
    expect((await listarContasAReceber(loja, { filtro: "todas" })).itens.some((x) => x.contratoId === c)).toBe(false);
  });
});

describe("receber: filtro por intervalo de vencimento", () => {
  it("escopa a lista e o resumo por vencimento; sem intervalo, retorna tudo", async () => {
    const l3 = (await prisma.loja.create({ data: { nome: `${MARK}intervalo` } })).id;
    const db3 = tenantPrisma(prisma, l3);
    const noiva3 = (await db3.lead.create({ data: { noivaNome: `${MARK}Cida` } as never })).id;
    await prisma.usuarioLoja.create({ data: { usuarioId: vend, lojaId: l3, perfilId: "perfil-vendedora" } });
    const c = await contrato("900,00", l3, noiva3);
    // 3 parcelas mensais a partir de 2027-03-15 → 03-15, 04-14, 05-14 (periodicidade 30d).
    await gerarPlanoDePagamento(l3, c, { numParcelas: 3, primeiroVencimento: "2027-03-15", periodicidadeDias: 30 });
    const todas = await listarContasAReceber(l3, { filtro: "todas" });
    expect(todas.itens).toHaveLength(3);

    // intervalo cobrindo só março (2027-03-01..2027-03-31).
    const gte = new Date("2027-03-01T00:00:00.000Z");
    const lt = new Date("2027-04-01T00:00:00.000Z");
    const dentro = await listarContasAReceber(l3, { filtro: "todas", intervalo: { gte, lt } });
    expect(dentro.itens).toHaveLength(1);
    expect(dentro.itens[0].vencimento.toISOString().slice(0, 10)).toBe("2027-03-15");

    // sem intervalo: todas as 3.
    expect((await listarContasAReceber(l3, { filtro: "todas" })).itens).toHaveLength(3);

    // paginação: tamanho 1 retorna 1 item mas total reflete as 3.
    const pag1 = await listarContasAReceber(l3, { filtro: "todas", tamanho: 1 });
    expect(pag1.total).toBe(3);
    expect(pag1.itens).toHaveLength(1);

    // resumo escopado ao intervalo de março: só a 1ª parcela conta como a receber.
    const rDentro = await resumoReceber(l3, { intervalo: { gte, lt } });
    expect(rDentro.totalAReceber).toBe("300.00");
    // resumo sem intervalo: as 3 (900,00) a receber.
    const rTudo = await resumoReceber(l3);
    expect(rTudo.totalAReceber).toBe("900.00");
  });
});
