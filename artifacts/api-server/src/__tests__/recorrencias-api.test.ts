import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * E48 — a despesa recorrente pelo mesmo motor do salário.
 *
 * O núcleo puro já está provado em `recorrencias-unit`; aqui se prova o que só
 * o banco pode desmentir: que a conta gerada carrega o rastro, que a segunda
 * geração não duplica (inclusive na corrida, onde quem responde é o índice
 * único — que ANTES do E48 não cobria despesa), e que o contrato recusa a
 * recorrência que não teria como virar conta.
 */
describe("Recorrências — despesa recorrente (E48)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  const competencia = "2029-06";

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const criar = (data: Record<string, unknown>) =>
    agent.post(`/api/lojas/${f.lojaId}/financeiro/recorrencias`).send(data);

  const gerar = (comp = competencia) =>
    agent.post(`/api/lojas/${f.lojaId}/financeiro/recorrencias/gerar`).send({ competencia: comp });

  it("recusa a recorrência que não teria como virar conta", async () => {
    // Despesa sem descrição geraria "undefined 2029-06" na lista de contas.
    const semDescricao = await criar({ tipo: "DESPESA", valor: 100, diaVencimento: 5 }).expect(400);
    expect(semDescricao.body.error).toBe("RECORRENCIA_INVALIDA");

    // Salário sem colaborador nunca geraria nada — falharia em silêncio.
    const semColaborador = await criar({ tipo: "SALARIO", valor: 100, diaVencimento: 5 }).expect(400);
    expect(semColaborador.body.error).toBe("RECORRENCIA_INVALIDA");
  });

  it("cria o aluguel e o gera como conta a pagar da competência", async () => {
    const aluguel = await criar({
      tipo: "FORNECEDOR",
      descricao: "Aluguel da loja",
      fornecedor: "Imobiliária Central",
      valor: 4500,
      diaVencimento: 10,
    }).expect(201);
    expect(aluguel.body).toMatchObject({
      tipo: "FORNECEDOR",
      descricao: "Aluguel da loja",
      fornecedor: "Imobiliária Central",
      // Despesa não tem colaborador — é o que a torna diferente do salário.
      usuarioId: null,
      ativo: true,
    });

    const res = await gerar().expect(200);
    expect(res.body.geradas).toBe(1);
    expect(res.body.contas[0]).toMatchObject({
      tipo: "FORNECEDOR",
      competencia,
      descricao: `Aluguel da loja ${competencia}`,
      valorPrevisto: 4500,
      colaboradorId: null,
      // O rastro: é o que deixa a tela separar o gerado do lançado à mão.
      recorrenciaId: aluguel.body.id,
    });
    // Data de NEGÓCIO ancorada ao meio-dia SP: o dia UTC já é o combinado.
    expect(res.body.contas[0].vencimento).toBe(`${competencia}-10T15:00:00.000Z`);
  });

  it("gerar de novo não duplica — responde geradas: 0", async () => {
    const res = await gerar().expect(200);
    expect(res.body.geradas).toBe(0);
    expect(res.body.contas).toEqual([]);
  });

  it("duas gerações simultâneas rendem UMA conta — o índice único cobre despesa", async () => {
    // ANTES do E48 este backstop tinha predicado `tipo = 'SALARIO'`: a despesa
    // recorrente nasceria sem rede, e a corrida lançaria o aluguel duas vezes.
    const outra = "2029-07";
    const [a, b] = await Promise.all([gerar(outra), gerar(outra)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.geradas + b.body.geradas).toBe(1);
  });

  it("salário e despesa saem na MESMA geração", async () => {
    await criar({
      tipo: "SALARIO",
      usuarioId: f.vendedoraId,
      valor: 3000,
      diaVencimento: 5,
    }).expect(201);

    const res = await gerar("2029-08").expect(200);
    // O aluguel (já existente) e o salário novo, de uma vez só.
    expect(res.body.geradas).toBe(2);
    expect(res.body.contas.map((c: { tipo: string }) => c.tipo).sort()).toEqual([
      "FORNECEDOR",
      "SALARIO",
    ]);
  });

  it("a comissão da vendedora não é lida como salário já feito", async () => {
    // Conta COMISSAO também tem `colaboradorId`. Se ela entrasse no dedup
    // largo do salário, a vendedora ficaria SEM folha naquele mês — calada.
    const comissao = "2029-09";
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`)
      .send({
        tipo: "COMISSAO",
        colaboradorId: f.vendedoraId,
        competencia: comissao,
        descricao: `Comissão ${comissao}`,
        valorPrevisto: 800,
        vencimento: `${comissao}-05T12:00:00-03:00`,
      })
      .expect(201);

    const res = await gerar(comissao).expect(200);
    const tipos = res.body.contas.map((c: { tipo: string }) => c.tipo).sort();
    expect(tipos).toEqual(["FORNECEDOR", "SALARIO"]);
  });

  it("recorrência desativada para de gerar, e reativar volta a gerar", async () => {
    const lista = await agent.get(`/api/lojas/${f.lojaId}/financeiro/recorrencias`).expect(200);
    const aluguel = lista.body.find((r: { tipo: string }) => r.tipo === "FORNECEDOR");

    await agent
      .patch(`/api/lojas/${f.lojaId}/financeiro/recorrencias/${aluguel.id}`)
      .send({ ativo: false })
      .expect(200);

    const semAluguel = await gerar("2029-10").expect(200);
    expect(semAluguel.body.contas.map((c: { tipo: string }) => c.tipo)).toEqual(["SALARIO"]);

    await agent
      .patch(`/api/lojas/${f.lojaId}/financeiro/recorrencias/${aluguel.id}`)
      .send({ ativo: true })
      .expect(200);

    // A competência já gerada ganha só o que faltava — o salário fica de fora.
    const comAluguel = await gerar("2029-10").expect(200);
    expect(comAluguel.body.contas.map((c: { tipo: string }) => c.tipo)).toEqual(["FORNECEDOR"]);
  });

  it("duas despesas iguais convivem — a loja com duas salas tem dois aluguéis", async () => {
    await criar({
      tipo: "FORNECEDOR",
      descricao: "Aluguel da loja",
      valor: 2000,
      diaVencimento: 10,
    }).expect(201);

    const res = await gerar("2029-11").expect(200);
    const aluguéis = res.body.contas.filter((c: { tipo: string }) => c.tipo === "FORNECEDOR");
    expect(aluguéis).toHaveLength(2);
  });
});
