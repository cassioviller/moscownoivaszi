// Integração (Postgres real): contratos — criação pré-preenchida, edição, cancelamento.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { criarOrcamento, adicionarItem, mudarStatus } from "@/lib/orcamentos/orcamentos";
import { reservarVestido } from "@/lib/disponibilidade/reservas";
import {
  criarContratoDeOrcamento,
  criarContratoDaNoiva,
  editarContrato,
  cancelarContrato,
  obterContrato,
  listarContratosDaLoja,
  listarContratosDaNoiva,
  dadosParaPdf,
  fecharContratoDeOrcamento,
} from "@/lib/contratos/contratos";
import {
  gerarPlanoDePagamento,
  registrarRecebimento,
  listarParcelasDoContrato,
  listarContasAReceber,
  resumoReceber,
} from "@/lib/financeiro/receber";
import { agingDaLoja } from "@/lib/financeiro/cobranca";
import { fatosDaNoiva } from "@/lib/leads/leads";
import { estagioDaNoiva } from "@/lib/leads/jornada";

const MARK = "t-contr-";
let loja = "";
let lojaOutra = "";
let lead = "";
let vestido = "";
let vend = "";

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  lojaOutra = (await prisma.loja.create({ data: { nome: `${MARK}outra` } })).id;
  const db = tenantPrisma(prisma, loja);
  lead = (await db.lead.create({ data: { noivaNome: `${MARK}Ana`, whatsapp: "(11) 90000-0000", casamentoData: new Date("2026-12-12T00:00:00.000Z") } as never })).id;
  vestido = (await db.vestido.create({ data: { codigo: `${MARK}V`, nome: `${MARK}V`, precoBase: 1000 } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}Vend`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  vend = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

async function orcamentoAprovado(leadId = lead, valor = "2.000,00"): Promise<string> {
  const r = await criarOrcamento(loja, { leadId, vendedoraId: vend });
  if (!r.ok) throw new Error("criar orçamento falhou");
  await adicionarItem(loja, r.orcamentoId, { tipo: "VESTIDO", vestidoId: vestido, descricao: "Vestido Aurora", valorUnitario: valor });
  await mudarStatus(loja, r.orcamentoId, "APROVADO");
  return r.orcamentoId;
}

describe("contratos: criação pré-preenchida", () => {
  it("de orçamento aprovado: herda valor, vestido e data do casamento", async () => {
    const orcId = await orcamentoAprovado();
    const r = await criarContratoDeOrcamento(loja, orcId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const det = (await obterContrato(loja, r.contratoId))!;
    expect(det.valorTotal).toBe("2000.00");
    expect(det.vestidoDescricao).toBe("Vestido Aurora");
    expect(det.dataCasamento?.toISOString().slice(0, 10)).toBe("2026-12-12");
    expect(det.orcamentoId).toBe(orcId);
    expect(det.status).toBe("ATIVO");
  });

  it("recusa orçamento não aprovado e duplicar contrato do mesmo orçamento", async () => {
    const r = await criarOrcamento(loja, { leadId: lead, vendedoraId: vend });
    if (!r.ok) throw new Error("falhou");
    await adicionarItem(loja, r.orcamentoId, { tipo: "VESTIDO", descricao: "x", valorUnitario: "100" });
    expect(await criarContratoDeOrcamento(loja, r.orcamentoId)).toMatchObject({ ok: false, motivo: "nao_aprovado" });

    const orcId = await orcamentoAprovado();
    expect((await criarContratoDeOrcamento(loja, orcId)).ok).toBe(true);
    expect(await criarContratoDeOrcamento(loja, orcId)).toMatchObject({ ok: false, motivo: "ja_tem_contrato" });
  });

  it("com MÚLTIPLAS reservas, casa a reserva pelo vestido do item (não a primeira)", async () => {
    const db = tenantPrisma(prisma, loja);
    const noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Duda` } as never })).id;
    const vA = (await db.vestido.create({ data: { codigo: `${MARK}vA`, nome: `${MARK}Aurora`, precoBase: 1000 } as never })).id;
    const vB = (await db.vestido.create({ data: { codigo: `${MARK}vB`, nome: `${MARK}Bella`, precoBase: 1000 } as never })).id;
    // reserva A casa mais CEDO (seria a [0]); reserva B é a do orçamento.
    const rA = await reservarVestido(loja, { vestidoId: vA, leadId: noiva, casamentoData: "2027-01-10" });
    const rB = await reservarVestido(loja, { vestidoId: vB, leadId: noiva, casamentoData: "2027-09-10" });
    if (!rA.ok || !rB.ok) throw new Error("reservas falharam");

    const o = await criarOrcamento(loja, { leadId: noiva, vendedoraId: vend });
    if (!o.ok) throw new Error("orçamento falhou");
    await adicionarItem(loja, o.orcamentoId, { tipo: "VESTIDO", vestidoId: vB, descricao: "Bella", valorUnitario: "1.500,00" });
    await mudarStatus(loja, o.orcamentoId, "APROVADO");

    const r = await criarContratoDeOrcamento(loja, o.orcamentoId);
    if (!r.ok) throw new Error("contrato falhou");
    const det = (await obterContrato(loja, r.contratoId))!;
    // Deve ter casado com a reserva B (do vestido do item), não a A (mais cedo).
    expect(det.vestidoDescricao).toBe(`${MARK}vB · ${MARK}Bella`);
  });

  it("da noiva (sem orçamento): valor inicial 0; recusa lead/vendedora inválidos", async () => {
    const r = await criarContratoDaNoiva(loja, lead, vend);
    expect(r.ok).toBe(true);
    if (r.ok) expect((await obterContrato(loja, r.contratoId))!.valorTotal).toBe("0.00");
    expect(await criarContratoDaNoiva(loja, "x", vend)).toMatchObject({ ok: false, motivo: "lead_invalido" });
    expect(await criarContratoDaNoiva(loja, lead, "x")).toMatchObject({ ok: false, motivo: "vendedora_invalida" });
  });
});

describe("contratos: edição, cancelamento, PDF", () => {
  it("edita valores/datas só em ATIVO; cancelar trava edição", async () => {
    const r = await criarContratoDaNoiva(loja, lead, vend);
    if (!r.ok) throw new Error("falhou");
    const id = r.contratoId;
    expect((await editarContrato(loja, id, { valorTotal: "3.500,00", formaPagamento: "PIX", cpf: "123", dataRetirada: "2026-12-10" })).ok).toBe(true);
    const det = (await obterContrato(loja, id))!;
    expect(det.valorTotal).toBe("3500.00");
    expect(det.formaPagamento).toBe("PIX");
    expect(det.dataRetirada?.toISOString().slice(0, 10)).toBe("2026-12-10");

    expect(await editarContrato(loja, id, { valorTotal: "abc" })).toMatchObject({ ok: false, motivo: "valor_invalido" });

    expect((await cancelarContrato(loja, id, { destinoPago: "manter" })).ok).toBe(true);
    expect((await obterContrato(loja, id))!.status).toBe("CANCELADO");
    expect(await editarContrato(loja, id, { cpf: "999" })).toMatchObject({ ok: false, motivo: "nao_ativo" });
  });

  it("editarContrato valida a forma de pagamento (enum)", async () => {
    const r = await criarContratoDaNoiva(loja, lead, vend);
    if (!r.ok) throw new Error("falhou");
    const id = r.contratoId;
    expect((await editarContrato(loja, id, { formaPagamento: "PIX" })).ok).toBe(true);
    expect((await editarContrato(loja, id, { formaPagamento: "" })).ok).toBe(true); // "" limpa
    expect((await obterContrato(loja, id))!.formaPagamento).toBeNull();
    expect(await editarContrato(loja, id, { formaPagamento: "qualquer" })).toEqual({ ok: false, motivo: "forma_invalida" });
  });

  it("dadosParaPdf mapeia o contrato persistido", async () => {
    const orcId = await orcamentoAprovado();
    const r = await criarContratoDeOrcamento(loja, orcId);
    if (!r.ok) throw new Error("falhou");
    const dados = (await dadosParaPdf(loja, r.contratoId))!;
    expect(dados.lojaNome).toBe(`${MARK}loja`);
    expect(dados.noivaNome).toBe(`${MARK}Ana`);
    expect(dados.valorTotal).toContain("2.000,00");
    expect(dados.vestido).toBe("Vestido Aurora");
    // isolamento
    expect(await dadosParaPdf(lojaOutra, r.contratoId)).toBeNull();
  });
});

// Loja dedicada por teste → resumoReceber/agingDaLoja (loja-wide) ficam determinísticos.
async function semearLojaNoivaVendedora(): Promise<{ loja: string; leadId: string; vendId: string }> {
  const l = (await prisma.loja.create({ data: { nome: `${MARK}cancel-${Date.now()}-${Math.round(Math.random() * 1e6)}` } })).id;
  const leadId = (await tenantPrisma(prisma, l).lead.create({ data: { noivaNome: `${MARK}Noiva` } as never })).id;
  await prisma.usuarioLoja.create({ data: { usuarioId: vend, lojaId: l, perfilId: "perfil-vendedora" } });
  return { loja: l, leadId, vendId: vend };
}

describe("contratos: cancelar limpa as parcelas (bug de conciliação)", () => {
  it("manter: previstas viram CANCELADA e somem de receber/atraso/aging; paga continua recebida", async () => {
    const { loja: lj, leadId, vendId } = await semearLojaNoivaVendedora();
    const r = await criarContratoDaNoiva(lj, leadId, vendId);
    if (!r.ok) throw new Error("contrato falhou");
    const cid = r.contratoId;
    await editarContrato(lj, cid, { valorTotal: "3.000,00" });
    // 3 parcelas vencidas (2020) → todas atrasadas; paga a 1ª.
    await gerarPlanoDePagamento(lj, cid, { numParcelas: 3, primeiroVencimento: "2020-01-10", periodicidadeDias: 30 });
    const parcelas = await listarParcelasDoContrato(lj, cid);
    await registrarRecebimento(lj, parcelas[0].id, { valor: parcelas[0].valorPrevisto, forma: "PIX" });

    expect((await listarContasAReceber(lj, { filtro: "todas" })).total).toBe(3);

    const cc = await cancelarContrato(lj, cid, { destinoPago: "manter", motivo: "desistiu" });
    expect(cc.ok).toBe(true);

    // previstas viraram CANCELADA → somem de abertas, resumo e aging.
    expect((await listarContasAReceber(lj, { filtro: "abertas" })).total).toBe(0);
    expect((await resumoReceber(lj)).emAtraso).toBe("0.00");
    expect((await agingDaLoja(lj)).noivas.length).toBe(0);
    // a paga continua como recebida (destino "manter").
    expect((await listarContasAReceber(lj, { filtro: "recebidas" })).total).toBe(1);
    // "todas" exclui as canceladas → só a paga.
    expect((await listarContasAReceber(lj, { filtro: "todas" })).total).toBe(1);
  });

  it("estornar: a paga também vira CANCELADA (sai da receita)", async () => {
    const { loja: lj, leadId, vendId } = await semearLojaNoivaVendedora();
    const r = await criarContratoDaNoiva(lj, leadId, vendId);
    if (!r.ok) throw new Error("contrato falhou");
    const cid = r.contratoId;
    await editarContrato(lj, cid, { valorTotal: "1.000,00" });
    await gerarPlanoDePagamento(lj, cid, { numParcelas: 1, primeiroVencimento: "2026-01-10" });
    const ps = await listarParcelasDoContrato(lj, cid);
    await registrarRecebimento(lj, ps[0].id, { valor: ps[0].valorPrevisto, forma: "PIX" });

    await cancelarContrato(lj, cid, { destinoPago: "estornar" });
    expect((await listarContasAReceber(lj, { filtro: "recebidas" })).total).toBe(0);
    // a parcela ficou CANCELADA (não some do detalhe, mas sai dos recebíveis).
    const det = await listarParcelasDoContrato(lj, cid);
    expect(det[0].status).toBe("CANCELADA");
    expect(det[0].valorRecebido).toBeNull();
  });
});

describe("contratos: jornada e isolamento", () => {
  it("contrato ATIVO → contrato_fechado; cancelado regride (ao orçamento)", async () => {
    const noiva = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}Bia` } as never })).id;
    const orcId = await orcamentoAprovado(noiva);
    const r = await criarContratoDeOrcamento(loja, orcId);
    if (!r.ok) throw new Error("falhou");

    expect(estagioDaNoiva((await fatosDaNoiva(loja, noiva))!).atual).toBe("contrato_fechado");
    await cancelarContrato(loja, r.contratoId, { destinoPago: "manter" });
    // orçamento segue aprovado → regride para orcamento_aberto, não some.
    expect(estagioDaNoiva((await fatosDaNoiva(loja, noiva))!).atual).toBe("orcamento_aberto");
  });

  it("isolamento: outra loja não enxerga nem lista", async () => {
    const orcId = await orcamentoAprovado();
    const r = await criarContratoDeOrcamento(loja, orcId);
    if (!r.ok) throw new Error("falhou");
    expect(await obterContrato(lojaOutra, r.contratoId)).toBeNull();
    expect((await listarContratosDaLoja(lojaOutra)).some((c) => c.id === r.contratoId)).toBe(false);
    expect((await listarContratosDaNoiva(loja, lead)).length).toBeGreaterThan(0);
  });
});

describe("fecharContratoDeOrcamento (atômico)", () => {
  it("aprova + cria contrato ATIVO + gera parcelas, num clique", async () => {
    const r0 = await criarOrcamento(loja, { leadId: lead, vendedoraId: vend });
    if (!r0.ok) throw new Error("criar orçamento falhou");
    await adicionarItem(loja, r0.orcamentoId, { tipo: "VESTIDO", vestidoId: vestido, descricao: "Vestido Aurora", valorUnitario: "2.000,00" });
    await mudarStatus(loja, r0.orcamentoId, "ENVIADO");

    const r = await fecharContratoDeOrcamento(loja, r0.orcamentoId, {
      cpf: "123.456.789-00", formaPagamento: "PIX", entrada: "500,00", numParcelas: 3, primeiroVencimento: "2026-08-10",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const det = (await obterContrato(loja, r.contratoId))!;
    expect(det.status).toBe("ATIVO");
    expect(det.valorTotal).toBe("2000.00");
    expect(det.orcamentoId).toBe(r0.orcamentoId);

    const parcelas = await listarParcelasDoContrato(loja, r.contratoId);
    expect(parcelas).toHaveLength(4); // entrada + 3
    const soma = parcelas.reduce((s, p) => s + Math.round(Number(p.valorPrevisto) * 100), 0);
    expect(soma).toBe(200_000);
  });

  it("NÃO cria comissão (fica para o fechamento por competência)", async () => {
    const r0 = await criarOrcamento(loja, { leadId: lead, vendedoraId: vend });
    if (!r0.ok) throw new Error("criar orçamento falhou");
    await adicionarItem(loja, r0.orcamentoId, { tipo: "VESTIDO", vestidoId: vestido, descricao: "X", valorUnitario: "1.000,00" });
    const r = await fecharContratoDeOrcamento(loja, r0.orcamentoId, { numParcelas: 1, primeiroVencimento: "2026-08-10" });
    expect(r.ok).toBe(true);
    const comissoes = await prisma.contaPagar.findMany({ where: { lojaId: loja, tipo: "COMISSAO" } });
    expect(comissoes).toHaveLength(0);
  });

  it("recusa orçamento sem itens, e já-com-contrato sem criar parcelas órfãs", async () => {
    const vazio = await criarOrcamento(loja, { leadId: lead, vendedoraId: vend });
    if (!vazio.ok) throw new Error("falhou");
    expect(await fecharContratoDeOrcamento(loja, vazio.orcamentoId, { numParcelas: 1, primeiroVencimento: "2026-08-10" }))
      .toEqual({ ok: false, motivo: "orcamento_vazio" });

    const r0 = await criarOrcamento(loja, { leadId: lead, vendedoraId: vend });
    if (!r0.ok) throw new Error("falhou");
    await adicionarItem(loja, r0.orcamentoId, { tipo: "VESTIDO", vestidoId: vestido, descricao: "Y", valorUnitario: "1.000,00" });
    const ok1 = await fecharContratoDeOrcamento(loja, r0.orcamentoId, { numParcelas: 2, primeiroVencimento: "2026-08-10" });
    expect(ok1.ok).toBe(true);
    if (!ok1.ok) return;
    const antes = (await listarParcelasDoContrato(loja, ok1.contratoId)).length;
    const dup = await fecharContratoDeOrcamento(loja, r0.orcamentoId, { numParcelas: 5, primeiroVencimento: "2026-09-10" });
    expect(dup).toEqual({ ok: false, motivo: "ja_tem_contrato" });
    const depois = (await listarParcelasDoContrato(loja, ok1.contratoId)).length;
    expect(depois).toBe(antes);
  });

  it("avança a jornada da noiva para contrato_fechado (derivado)", async () => {
    const noiva = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}Bia`, casamentoData: new Date("2026-11-11T00:00:00.000Z") } as never })).id;
    const r0 = await criarOrcamento(loja, { leadId: noiva, vendedoraId: vend });
    if (!r0.ok) throw new Error("falhou");
    await adicionarItem(loja, r0.orcamentoId, { tipo: "VESTIDO", vestidoId: vestido, descricao: "Z", valorUnitario: "1.500,00" });
    await fecharContratoDeOrcamento(loja, r0.orcamentoId, { numParcelas: 2, primeiroVencimento: "2026-08-10" });
    const estagio = estagioDaNoiva((await fatosDaNoiva(loja, noiva))!);
    expect(estagio.atual).toBe("contrato_fechado");
  });
});
