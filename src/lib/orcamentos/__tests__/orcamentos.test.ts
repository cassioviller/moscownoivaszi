// Integração (Postgres real): orçamentos — criação, itens, desconto, status, totais.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import {
  criarOrcamento,
  adicionarItem,
  editarItem,
  removerItem,
  definirDesconto,
  mudarStatus,
  listarOrcamentosDaLoja,
  listarOrcamentosDaNoiva,
  obterOrcamento,
} from "@/lib/orcamentos/orcamentos";
import { fatosDaNoiva } from "@/lib/leads/leads";
import { estagioDaNoiva } from "@/lib/leads/jornada";

const MARK = "t-orc-";
let loja = "";
let lojaOutra = "";
let lead = "";
let vestido = "";
let vend = "";

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  lojaOutra = (await prisma.loja.create({ data: { nome: `${MARK}outra` } })).id;
  const db = tenantPrisma(prisma, loja);
  lead = (await db.lead.create({ data: { noivaNome: `${MARK}Ana` } as never })).id;
  vestido = (await db.vestido.create({ data: { codigo: `${MARK}V`, nome: `${MARK}V`, precoBase: 1000 } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}Vend`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  vend = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

async function novoOrcamentoComItens(): Promise<string> {
  const r = await criarOrcamento(loja, { leadId: lead, vendedoraId: vend });
  if (!r.ok) throw new Error("criar falhou: " + r.motivo);
  await adicionarItem(loja, r.orcamentoId, { tipo: "VESTIDO", vestidoId: vestido, descricao: "Vestido X", valorUnitario: "1.000,00", quantidade: 2 });
  await adicionarItem(loja, r.orcamentoId, { tipo: "SERVICO", descricao: "Véu", valorUnitario: "500.50" });
  return r.orcamentoId;
}

describe("orçamentos: criação e validação", () => {
  it("cria com lead/vendedora da loja; recusa inválidos", async () => {
    const ok = await criarOrcamento(loja, { leadId: lead, vendedoraId: vend });
    expect(ok.ok).toBe(true);
    expect(await criarOrcamento(loja, { leadId: "x", vendedoraId: vend })).toMatchObject({ ok: false, motivo: "lead_invalido" });
    expect(await criarOrcamento(loja, { leadId: lead, vendedoraId: "x" })).toMatchObject({ ok: false, motivo: "vendedora_invalida" });
    expect(await criarOrcamento(loja, { leadId: lead, atendimentoId: "x", vendedoraId: vend })).toMatchObject({ ok: false, motivo: "atendimento_invalido" });
  });
});

describe("orçamentos: itens e totais", () => {
  it("soma itens (subtotal) e aceita pt-BR e ponto decimal", async () => {
    const id = await novoOrcamentoComItens();
    const det = (await obterOrcamento(loja, id))!;
    expect(det.itens).toHaveLength(2);
    expect(det.totais.subtotal).toBe("2500.50"); // 1000*2 + 500.50
    expect(det.totais.total).toBe("2500.50"); // sem desconto
    expect(det.itens[0].subtotal).toBe("2000.00");
  });

  it("desconto PERCENTUAL e VALOR; total nunca negativo (piso 0)", async () => {
    const id = await novoOrcamentoComItens();
    expect((await definirDesconto(loja, id, { tipo: "PERCENTUAL", valor: "10" })).ok).toBe(true);
    expect((await obterOrcamento(loja, id))!.totais).toMatchObject({ desconto: "250.05", total: "2250.45" });

    await definirDesconto(loja, id, { tipo: "VALOR", valor: "100,00" });
    expect((await obterOrcamento(loja, id))!.totais).toMatchObject({ desconto: "100.00", total: "2400.50" });

    await definirDesconto(loja, id, { tipo: "VALOR", valor: "999999" });
    expect((await obterOrcamento(loja, id))!.totais).toMatchObject({ total: "0.00" });

    expect(await definirDesconto(loja, id, { tipo: "PERCENTUAL", valor: "150" })).toMatchObject({ ok: false, motivo: "desconto_invalido" });
  });

  it("parsing de dinheiro: ponto sem vírgula é MILHAR; vazio/negativo recusados", async () => {
    const r = await criarOrcamento(loja, { leadId: lead, vendedoraId: vend });
    if (!r.ok) throw new Error("falhou");
    const id = r.orcamentoId;
    // "1.234" deve ser R$ 1.234,00 (e não R$ 1,23) — o BUG do review.
    expect((await adicionarItem(loja, id, { tipo: "SERVICO", descricao: "milhar", valorUnitario: "1.234" })).ok).toBe(true);
    // "1.000,50" pt-BR completo.
    expect((await adicionarItem(loja, id, { tipo: "SERVICO", descricao: "ptbr", valorUnitario: "1.000,50" })).ok).toBe(true);
    const det = (await obterOrcamento(loja, id))!;
    expect(det.itens.find((i) => i.descricao === "milhar")!.valorUnitario).toBe("1234.00");
    expect(det.itens.find((i) => i.descricao === "ptbr")!.valorUnitario).toBe("1000.50");
    // entradas inválidas
    expect(await adicionarItem(loja, id, { tipo: "SERVICO", descricao: "x", valorUnitario: "" })).toMatchObject({ ok: false, motivo: "valor_invalido" });
    expect(await adicionarItem(loja, id, { tipo: "SERVICO", descricao: "x", valorUnitario: "-5" })).toMatchObject({ ok: false, motivo: "valor_invalido" });
  });

  it("editar e remover item; valor inválido recusado", async () => {
    const id = await novoOrcamentoComItens();
    const det = (await obterOrcamento(loja, id))!;
    const item = det.itens[1].id;
    expect((await editarItem(loja, item, { valorUnitario: "600,00", quantidade: 3 })).ok).toBe(true);
    const det2 = (await obterOrcamento(loja, id))!;
    expect(det2.itens.find((i) => i.id === item)!.subtotal).toBe("1800.00");
    expect(await editarItem(loja, item, { quantidade: 0 })).toMatchObject({ ok: false, motivo: "valor_invalido" });
    expect((await removerItem(loja, item)).ok).toBe(true);
    expect((await obterOrcamento(loja, id))!.itens).toHaveLength(1);
  });
});

describe("orçamentos: status", () => {
  it("RASCUNHO→ENVIADO→APROVADO carimba aprovadoEm e trava edição", async () => {
    const id = await novoOrcamentoComItens();
    expect((await mudarStatus(loja, id, "ENVIADO")).ok).toBe(true);
    expect((await mudarStatus(loja, id, "APROVADO")).ok).toBe(true);
    const det = (await obterOrcamento(loja, id))!;
    expect(det.status).toBe("APROVADO");
    expect(det.aprovadoEm).not.toBeNull();
    expect(det.editavel).toBe(false);
    // edição travada
    expect(await adicionarItem(loja, id, { tipo: "SERVICO", descricao: "x", valorUnitario: "10" })).toMatchObject({ ok: false, motivo: "nao_editavel" });
    expect(await definirDesconto(loja, id, { tipo: "VALOR", valor: "5" })).toMatchObject({ ok: false, motivo: "nao_editavel" });
    // terminal
    expect(await mudarStatus(loja, id, "RASCUNHO")).toMatchObject({ ok: false, motivo: "transicao_invalida" });
  });

  it("não aprova orçamento vazio", async () => {
    const r = await criarOrcamento(loja, { leadId: lead, vendedoraId: vend });
    if (!r.ok) throw new Error("falhou");
    expect(await mudarStatus(loja, r.orcamentoId, "APROVADO")).toMatchObject({ ok: false, motivo: "orcamento_vazio" });
  });
});

describe("orçamentos: jornada", () => {
  it("orçamento não-recusado promove a 'orcamento_aberto'; recusado regride", async () => {
    // lead próprio (sem outros fatos) p/ isolar o efeito.
    const noiva = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}Cida` } as never })).id;
    const r = await criarOrcamento(loja, { leadId: noiva, vendedoraId: vend });
    if (!r.ok) throw new Error("falhou");

    // rascunho (mesmo vazio) já abre a negociação.
    expect(estagioDaNoiva((await fatosDaNoiva(loja, noiva))!).atual).toBe("orcamento_aberto");

    // recusado não sustenta a etapa → regride (sem outros fatos → cadastrada).
    await mudarStatus(loja, r.orcamentoId, "RECUSADO");
    expect(estagioDaNoiva((await fatosDaNoiva(loja, noiva))!).atual).toBe("cadastrada");
  });
});

describe("orçamentos: leitura e isolamento", () => {
  it("lista por noiva e por loja com total; detalhe de outra loja é null", async () => {
    const id = await novoOrcamentoComItens();
    const daNoiva = await listarOrcamentosDaNoiva(loja, lead);
    expect(daNoiva.some((o) => o.id === id)).toBe(true);
    expect(daNoiva.find((o) => o.id === id)!.total).toBe("2500.50");

    const daLoja = await listarOrcamentosDaLoja(loja);
    expect(daLoja.some((o) => o.id === id)).toBe(true);

    // outra loja não enxerga
    expect(await obterOrcamento(lojaOutra, id)).toBeNull();
    expect((await listarOrcamentosDaLoja(lojaOutra)).some((o) => o.id === id)).toBe(false);
  });
});
