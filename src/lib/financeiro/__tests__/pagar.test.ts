// Integração (Postgres real): contas a pagar — lançar, recorrência, pagamento, resumo.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import {
  lancarConta,
  editarConta,
  removerConta,
  definirSalarioRecorrente,
  listarSalariosRecorrentes,
  gerarFolhaDoMes,
  registrarPagamento,
  estornarPagamento,
  marcarEnviadoContabilidade,
  listarContasAPagar,
  listarPagamentos,
  resumoPagar,
  resumoPorCompetencia,
} from "@/lib/financeiro/pagar";

const MARK = "t-pagar-";
let loja = "";
let colaborador = "";
let colaborador2 = "";
let foraDaLoja = "";

async function novoUsuario(nome: string): Promise<string> {
  const u = await prisma.usuario.create({ data: { nome: `${MARK}${nome}`, email: `${MARK}${nome}${Date.now()}@x.local`, senhaHash: "x" } });
  return u.id;
}

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  colaborador = await novoUsuario("Vera");
  await prisma.usuarioLoja.create({ data: { usuarioId: colaborador, lojaId: loja, perfilId: "perfil-vendedora" } });
  colaborador2 = await novoUsuario("Ana");
  await prisma.usuarioLoja.create({ data: { usuarioId: colaborador2, lojaId: loja, perfilId: "perfil-vendedora" } });
  foraDaLoja = await novoUsuario("Fora"); // sem UsuarioLoja
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("pagar: lançar conta", () => {
  it("lança despesa; salário valida membro; valor/data inválidos", async () => {
    expect((await lancarConta(loja, { tipo: "DESPESA", descricao: "Lavanderia", valorPrevisto: "150,00", vencimento: "2027-05-10" })).ok).toBe(true);
    expect(await lancarConta(loja, { tipo: "SALARIO", colaboradorId: foraDaLoja, descricao: "x", valorPrevisto: "100", vencimento: "2027-05-10" })).toMatchObject({ ok: false, motivo: "colaborador_invalido" });
    // SALARIO/COMISSAO exigem colaborador (não pode ser órfão — sumiria da folha)
    expect(await lancarConta(loja, { tipo: "SALARIO", descricao: "x", valorPrevisto: "100", vencimento: "2027-05-10" })).toMatchObject({ ok: false, motivo: "colaborador_invalido" });
    expect(await lancarConta(loja, { tipo: "DESPESA", descricao: "x", valorPrevisto: "abc", vencimento: "2027-05-10" })).toMatchObject({ ok: false, motivo: "valor_invalido" });
    expect(await lancarConta(loja, { tipo: "DESPESA", descricao: "x", valorPrevisto: "10", vencimento: "xx" })).toMatchObject({ ok: false, motivo: "data_invalida" });
  });

  it("editar/remover só PREVISTA", async () => {
    const r = await lancarConta(loja, { tipo: "DESPESA", descricao: "Ajuste", valorPrevisto: "50", vencimento: "2027-06-01" });
    if (!r.ok) throw new Error("falhou");
    expect((await editarConta(loja, r.contaId, { valorPrevisto: "75,00" })).ok).toBe(true);
    expect((await removerConta(loja, r.contaId)).ok).toBe(true);
    expect(await removerConta(loja, r.contaId)).toMatchObject({ ok: false, motivo: "conta_invalida" });
  });
});

describe("pagar: salário recorrente (motor)", () => {
  it("define recorrência e gera a folha do mês — idempotente", async () => {
    expect((await definirSalarioRecorrente(loja, colaborador, { valorBase: "2.000,00", diaVencimento: 5 })).ok).toBe(true);
    expect(await definirSalarioRecorrente(loja, foraDaLoja, { valorBase: "1000", diaVencimento: 5 })).toMatchObject({ ok: false, motivo: "colaborador_invalido" });
    expect((await listarSalariosRecorrentes(loja))[0].valorBase).toBe("2000.00");

    const g1 = await gerarFolhaDoMes(loja, "2027-08");
    expect(g1).toMatchObject({ ok: true, geradas: 1 });
    const g2 = await gerarFolhaDoMes(loja, "2027-08"); // de novo → não duplica
    expect(g2).toMatchObject({ ok: true, geradas: 0 });

    const salarios = await listarContasAPagar(loja, { tipo: "SALARIO", filtro: "todas" });
    const doMes = salarios.filter((c) => c.competencia === "2027-08");
    expect(doMes).toHaveLength(1);
    expect(doMes[0].valorPrevisto).toBe("2000.00");
    expect(doMes[0].vencimento.toISOString().slice(0, 10)).toBe("2027-08-05");
    expect(await gerarFolhaDoMes(loja, "2027-13")).toMatchObject({ ok: false, motivo: "competencia_invalida" });
  });
});

describe("pagar: pagamento (quita N contas, transacional)", () => {
  it("um pagamento quita salário + comissão do colaborador; valorPago = soma; baixa em cada conta", async () => {
    // O cruzamento da spec §3: salário + comissão da MESMA pessoa numa saída só.
    const c1 = await lancarConta(loja, { tipo: "SALARIO", colaboradorId: colaborador, competencia: "2027-09", descricao: "Salário", valorPrevisto: "2.000,00", vencimento: "2027-09-05" });
    const c2 = await lancarConta(loja, { tipo: "COMISSAO", colaboradorId: colaborador, competencia: "2027-09", descricao: "Comissão", valorPrevisto: "300,00", vencimento: "2027-09-05" });
    if (!c1.ok || !c2.ok) throw new Error("falhou");
    const pg = await registrarPagamento(loja, {
      colaboradorId: colaborador,
      data: "2027-09-06",
      forma: "Pix",
      itens: [{ contaPagarId: c1.contaId, valor: "1.900,00" }, { contaPagarId: c2.contaId, valor: "300,00" }], // salário ajustado (falta)
    });
    expect(pg.ok).toBe(true);
    if (!pg.ok) return;

    const pagas = await listarContasAPagar(loja, { filtro: "pagas" });
    expect(pagas.some((c) => c.id === c1.contaId)).toBe(true);
    expect(pagas.some((c) => c.id === c2.contaId)).toBe(true);
    const pagamento = await tenantPrisma(prisma, loja).pagamento.findUnique({ where: { id: pg.pagamentoId } });
    expect(Number(pagamento!.valorPago).toFixed(2)).toBe("2200.00"); // 1900 + 300

    // não dá pra quitar conta já paga
    expect(await registrarPagamento(loja, { data: "2027-09-07", itens: [{ contaPagarId: c1.contaId, valor: "10" }] })).toMatchObject({ ok: false, motivo: "nao_previsto" });

    // estorno devolve as contas a PREVISTA
    expect((await estornarPagamento(loja, pg.pagamentoId)).ok).toBe(true);
    const abertas = await listarContasAPagar(loja, { filtro: "abertas" });
    expect(abertas.some((c) => c.id === c1.contaId)).toBe(true);
  });

  it("recusa lista vazia, item ≤ 0 e conta inexistente", async () => {
    expect(await registrarPagamento(loja, { data: "2027-09-06", itens: [] })).toMatchObject({ ok: false, motivo: "vazio" });
    const c = await lancarConta(loja, { tipo: "DESPESA", descricao: "x", valorPrevisto: "10", vencimento: "2027-09-05" });
    if (!c.ok) throw new Error("falhou");
    expect(await registrarPagamento(loja, { data: "2027-09-06", itens: [{ contaPagarId: c.contaId, valor: "0" }] })).toMatchObject({ ok: false, motivo: "valor_invalido" });
    expect(await registrarPagamento(loja, { data: "2027-09-06", itens: [{ contaPagarId: "nao-existe", valor: "10" }] })).toMatchObject({ ok: false, motivo: "conta_invalida" });
  });

  it("pagamento de um colaborador recusa conta de OUTRO colaborador (spec §6)", async () => {
    const cAna = await lancarConta(loja, { tipo: "SALARIO", colaboradorId: colaborador2, competencia: "2027-11", descricao: "Salário Ana", valorPrevisto: "1.000,00", vencimento: "2027-11-05" });
    if (!cAna.ok) throw new Error("falhou");
    // tenta quitar a conta da Ana dentro de um pagamento da Vera → recusado, e a conta da Ana segue PREVISTA
    expect(await registrarPagamento(loja, { colaboradorId: colaborador, data: "2027-11-06", itens: [{ contaPagarId: cAna.contaId, valor: "1.000,00" }] })).toMatchObject({ ok: false, motivo: "conta_invalida" });
    const abertas = await listarContasAPagar(loja, { filtro: "abertas", colaboradorId: colaborador2 });
    expect(abertas.some((c) => c.id === cAna.contaId)).toBe(true);
  });
});

describe("pagar: resumo, atraso e contabilidade", () => {
  it("resumo (loja isolada), atraso derivado e resumo por competência", async () => {
    const l2 = (await prisma.loja.create({ data: { nome: `${MARK}resumo` } })).id;
    const col = colaborador;
    await prisma.usuarioLoja.create({ data: { usuarioId: col, lojaId: l2, perfilId: "perfil-vendedora" } });

    await lancarConta(l2, { tipo: "SALARIO", colaboradorId: col, competencia: "2027-10", descricao: "Salário", valorPrevisto: "2.000,00", vencimento: "2020-01-01" }); // vencida → atraso
    await lancarConta(l2, { tipo: "COMISSAO", colaboradorId: col, competencia: "2027-10", descricao: "Comissão", valorPrevisto: "500,00", vencimento: "2027-10-05" });
    const cpaga = await lancarConta(l2, { tipo: "DESPESA", descricao: "Luz", valorPrevisto: "100,00", vencimento: "2027-10-05" });
    if (!cpaga.ok) throw new Error("falhou");
    const pg = await registrarPagamento(l2, { data: "2027-10-06", itens: [{ contaPagarId: cpaga.contaId, valor: "100,00" }] });
    if (!pg.ok) throw new Error("falhou");

    const r = await resumoPagar(l2);
    expect(r.totalAPagar).toBe("2500.00"); // salário 2000 + comissão 500 (a despesa foi paga)
    expect(r.pagoTotal).toBe("100.00");
    expect(r.emAtraso).toBe("2000.00"); // salário vence em 2020

    const folha = await resumoPorCompetencia(l2, "2027-10");
    expect(folha).toHaveLength(1);
    expect(folha[0]).toMatchObject({ salario: "2000.00", comissao: "500.00", total: "2500.00" });

    // contabilidade: lista o pagamento, marca enviado e reflete o flag
    const antes = await listarPagamentos(l2, { colaboradorId: col });
    expect(antes.every((p) => !p.enviadoContabilidade)).toBe(true);
    const pgLuz = (await listarPagamentos(l2)).find((p) => p.id === pg.pagamentoId);
    expect(pgLuz?.contas).toEqual([{ descricao: "Luz", valor: "100.00" }]);
    expect((await marcarEnviadoContabilidade(l2, pg.pagamentoId, true)).ok).toBe(true);
    expect((await listarPagamentos(l2)).find((p) => p.id === pg.pagamentoId)?.enviadoContabilidade).toBe(true);
    // re-marcar NÃO sobrescreve o carimbo original (preserva a data do envio)
    const carimbo1 = (await tenantPrisma(prisma, l2).pagamento.findUnique({ where: { id: pg.pagamentoId } }))!.enviadoContabilidadeEm;
    await marcarEnviadoContabilidade(l2, pg.pagamentoId, true);
    const carimbo2 = (await tenantPrisma(prisma, l2).pagamento.findUnique({ where: { id: pg.pagamentoId } }))!.enviadoContabilidadeEm;
    expect(carimbo2?.getTime()).toBe(carimbo1?.getTime());
    expect((await listarPagamentos(loja)).some((p) => p.id === pg.pagamentoId)).toBe(false); // isolamento

    // isolamento
    expect((await listarContasAPagar(loja, { filtro: "todas" })).some((c) => c.competencia === "2027-10" && c.descricao === "Comissão")).toBe(false);
  });
});

describe("pagar: filtro por intervalo de vencimento", () => {
  it("escopa a lista e o resumo por vencimento; sem intervalo, retorna tudo; atrasadas combina o lt mais restritivo", async () => {
    const l4 = (await prisma.loja.create({ data: { nome: `${MARK}intervalo` } })).id;
    // 3 despesas vencidas (no passado, p/ atraso): jan, fev, mar de 2020.
    await lancarConta(l4, { tipo: "DESPESA", descricao: "Jan", valorPrevisto: "100,00", vencimento: "2020-01-15" });
    await lancarConta(l4, { tipo: "DESPESA", descricao: "Fev", valorPrevisto: "200,00", vencimento: "2020-02-15" });
    await lancarConta(l4, { tipo: "DESPESA", descricao: "Mar", valorPrevisto: "300,00", vencimento: "2020-03-15" });

    // sem intervalo: todas as 3.
    expect(await listarContasAPagar(l4, { filtro: "todas" })).toHaveLength(3);

    // intervalo cobrindo só fevereiro (2020-02-01..2020-03-01 exclusivo).
    const gte = new Date("2020-02-01T00:00:00.000Z");
    const lt = new Date("2020-03-01T00:00:00.000Z");
    const dentro = await listarContasAPagar(l4, { filtro: "todas", intervalo: { gte, lt } });
    expect(dentro).toHaveLength(1);
    expect(dentro[0].descricao).toBe("Fev");

    // resumo escopado a fevereiro: só os 200,00 contam como a pagar.
    const rDentro = await resumoPagar(l4, { intervalo: { gte, lt } });
    expect(rDentro.totalAPagar).toBe("200.00");
    // resumo sem intervalo: as 3 (600,00).
    expect((await resumoPagar(l4)).totalAPagar).toBe("600.00");

    // atrasadas: as 3 estão vencidas (2020 < hoje). Sem intervalo, as 3 aparecem.
    expect(await listarContasAPagar(l4, { filtro: "atrasadas" })).toHaveLength(3);
    // Com intervalo de fevereiro, combina o lt mais restritivo (vencido E dentro): só Fev.
    const atrasadasFev = await listarContasAPagar(l4, { filtro: "atrasadas", intervalo: { gte, lt } });
    expect(atrasadasFev.map((c) => c.descricao)).toEqual(["Fev"]);
    // o resumo "em atraso" escopado a fevereiro = 200,00 (de 600,00 sem intervalo).
    expect((await resumoPagar(l4)).emAtraso).toBe("600.00");
    expect((await resumoPagar(l4, { intervalo: { gte, lt } })).emAtraso).toBe("200.00");
  });
});
