import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import { diaLocal } from "../lib/disponibilidade";

/**
 * E93/D2 — `GET /financeiro/contas-pagar` ganhou janela, status e o pagamento.
 *
 * Quatro telas baixavam a carteira INTEIRA da loja para desenhar uma janela:
 * a de contas a pagar (um mês), a projeção (só as abertas), a folha (uma
 * competência) e a conciliação. A lista cresce monotonicamente com a idade da
 * loja — aluguel + salários + fornecedores + comissões ≈ 30–50 linhas/mês.
 *
 * E `pagar.tsx` baixava um SEGUNDO acervo, `listPagamentos` sem intervalo, só
 * para descobrir qual saída quitou cada conta: sem o `pagamentoId` não há
 * botão "Estornar pagamento", e sem a fatia rateada o card "Pago" mostra o
 * previsto no lugar do que de fato saiu do caixa. Recortar aquele segundo
 * acervo pela janela de VENCIMENTOS não era opção — a saída pode ter data
 * fora dela, nas duas direções. Então a conta passa a trazer a própria saída.
 */
describe("E93 — GET /contas-pagar: janela, status e a saída que quitou", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let contaJulho: string;
  let contaAgosto: string;
  let contaPagaJulho: string;
  let diaJulho: string;
  let diaAgosto: string;

  const criarConta = async (descricao: string, vencimento: Date, valorPrevisto = 100) => {
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`)
      .send({ tipo: "DESPESA", descricao, valorPrevisto, vencimento: vencimento.toISOString() })
      .expect(201);
    return res.body.id as string;
  };

  const listar = async (query = "") => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/contas-pagar${query}`)
      .expect(200);
    return res.body as Array<{
      id: string;
      status: string;
      valorPrevisto: number;
      pagamento: { id: string; valor: number; contas: number; forma: string | null } | null;
    }>;
  };

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);

    const julho = dataFutura(-40);
    const agosto = dataFutura(40);
    diaJulho = diaLocal(julho);
    diaAgosto = diaLocal(agosto);

    contaJulho = await criarConta("Aluguel da janela", julho, 300);
    contaPagaJulho = await criarConta("Fornecedor já quitado", julho, 200);
    contaAgosto = await criarConta("Aluguel de depois", agosto, 400);

    // Uma saída conjunta de R$ 450 que quita as DUAS contas de julho — o
    // rateio proporcional faz a fatia divergir do previsto de propósito.
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({
        data: dataFutura(-38).toISOString(),
        contaIds: [contaPagaJulho],
        valorPago: 180,
        forma: "PIX",
      })
      .expect(201);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("sem parâmetro continua devolvendo a carteira inteira", async () => {
    const ids = (await listar()).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([contaJulho, contaPagaJulho, contaAgosto]));
  });

  it("`de`/`ate` recortam por VENCIMENTO, inclusivo nas duas pontas", async () => {
    const ids = (await listar(`?de=${diaJulho}&ate=${diaJulho}`)).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([contaJulho, contaPagaJulho]));
    expect(ids).not.toContain(contaAgosto);
  });

  it("a janela de depois traz só a conta de depois", async () => {
    const ids = (await listar(`?de=${diaAgosto}&ate=${diaAgosto}`)).map((c) => c.id);
    expect(ids).toEqual([contaAgosto]);
  });

  it("`status=abertas` devolve só as PREVISTA — é o que a projeção precisa", async () => {
    const contas = await listar("?status=abertas");
    expect(contas.every((c) => c.status === "PREVISTA")).toBe(true);
    expect(contas.map((c) => c.id)).toEqual(expect.arrayContaining([contaJulho, contaAgosto]));
    expect(contas.map((c) => c.id)).not.toContain(contaPagaJulho);
  });

  it("a conta PAGA traz a saída que a quitou, com a fatia RATEADA e não o previsto", async () => {
    const conta = (await listar()).find((c) => c.id === contaPagaJulho);
    expect(conta?.status).toBe("PAGA");
    expect(conta?.pagamento).not.toBeNull();
    expect(conta?.pagamento?.forma).toBe("PIX");
    expect(conta?.pagamento?.contas).toBe(1);
    // O previsto era 200 e saíram 180: é o 180 que o fluxo e o DRE contam.
    expect(conta?.valorPrevisto).toBe(200);
    expect(conta?.pagamento?.valor).toBe(180);
    expect(typeof conta?.pagamento?.id).toBe("string");
  });

  it("a conta em aberto vem com `pagamento: null`", async () => {
    const conta = (await listar()).find((c) => c.id === contaJulho);
    expect(conta?.pagamento).toBeNull();
  });

  it("uma saída que quita DUAS contas conta 2 nas duas — é o aviso antes de estornar", async () => {
    const a = await criarConta("Conjunta A", dataFutura(-41), 50);
    const b = await criarConta("Conjunta B", dataFutura(-41), 50);
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: dataFutura(-39).toISOString(), contaIds: [a, b], valorPago: 100 })
      .expect(201);

    const contas = await listar();
    const linhaA = contas.find((c) => c.id === a);
    const linhaB = contas.find((c) => c.id === b);
    expect(linhaA?.pagamento?.contas).toBe(2);
    expect(linhaB?.pagamento?.contas).toBe(2);
    expect(linhaA?.pagamento?.id).toBe(linhaB?.pagamento?.id);
  });

  it("intervalo invertido é 400 INTERVALO_INVALIDO, não uma lista vazia calada", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/contas-pagar?de=${diaAgosto}&ate=${diaJulho}`)
      .expect(400);
    expect(res.body.error).toBe("INTERVALO_INVALIDO");
  });

  it("data mal formada é 400, não filtro silenciosamente ignorado", async () => {
    await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/contas-pagar?de=31/07/2026`)
      .expect(400);
  });
});
