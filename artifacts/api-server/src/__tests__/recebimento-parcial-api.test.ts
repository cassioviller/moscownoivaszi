import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarFixture, criarLead, dataFutura, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * E49 — a noiva paga metade. O núcleo puro já prova as réguas de leitura; aqui
 * se prova o que só a rota decide: que o valor ACUMULA, que o acumulado é quem
 * escolhe entre PARCIAL e PAGA, que receber a mais é recusado (e não clampado),
 * e que o estorno também alcança a parcela meio recebida.
 */
describe("Recebimento parcial (E49)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Um contrato com uma parcela de 1000. Devolve o id da parcela. */
  async function parcelaDe1000(): Promise<string> {
    const lead = await criarLead(f);
    const contrato = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 1000,
        parcelas: [{ numero: 0, valorPrevisto: 1000, vencimento: dataFutura(10).toISOString() }],
      })
      .expect(201);
    return contrato.body.parcelas[0].id;
  }

  const receber = (parcelaId: string, valor: number) =>
    agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/receber`)
      .send({ valorRecebido: valor, recebidoEm: dataFutura(1).toISOString(), formaRecebimento: "PIX" });

  it("meio pagamento deixa a parcela PARCIAL, com o que entrou registrado", async () => {
    const parcelaId = await parcelaDe1000();
    const res = await receber(parcelaId, 400).expect(200);

    expect(res.body.status).toBe("PARCIAL");
    expect(res.body.valorRecebido).toBe(400);
    // O previsto não muda: é a dívida combinada, não o que entrou.
    expect(res.body.valorPrevisto).toBe(1000);
  });

  it("o segundo recebimento ACUMULA, e quitar vira PAGA", async () => {
    const parcelaId = await parcelaDe1000();
    await receber(parcelaId, 400).expect(200);

    const meio = await receber(parcelaId, 300).expect(200);
    expect(meio.body.status).toBe("PARCIAL");
    expect(meio.body.valorRecebido).toBe(700); // 400 + 300, não 300

    const fim = await receber(parcelaId, 300).expect(200);
    expect(fim.body.status).toBe("PAGA");
    expect(fim.body.valorRecebido).toBe(1000);
  });

  it("receber acima do que falta é recusado — e a mensagem diz quanto falta", async () => {
    const parcelaId = await parcelaDe1000();
    await receber(parcelaId, 900).expect(200);

    // Aceitar inflaria o caixa REALIZADO com dinheiro que não entrou; o caso
    // comum é dígito a mais, e a vendedora precisa saber o número certo.
    const res = await receber(parcelaId, 200).expect(422);
    expect(res.body.error).toBe("VALOR_ACIMA_DO_SALDO");
    expect(res.body.detalhe).toContain("100.00");

    // Recusar não pode ter mexido no acumulado.
    const lista = await agent.get(`/api/lojas/${f.lojaId}/financeiro/parcelas`).expect(200);
    const parcela = lista.body.find((p: { id: string }) => p.id === parcelaId);
    expect(parcela.valorRecebido).toBe(900);
    expect(parcela.status).toBe("PARCIAL");
  });

  it("parcela já quitada recusa novo recebimento", async () => {
    const parcelaId = await parcelaDe1000();
    await receber(parcelaId, 1000).expect(200);
    const res = await receber(parcelaId, 50).expect(409);
    expect(res.body.error).toBe("PARCELA_JA_RECEBIDA");
  });

  it("estornar a parcela meio recebida devolve tudo a PREVISTA", async () => {
    const parcelaId = await parcelaDe1000();
    await receber(parcelaId, 400).expect(200);

    const res = await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/estornar`)
      .expect(200);

    // Tudo-ou-nada: a parcela não tem livro de recebimentos, só o acumulado —
    // desfazer "o último pagamento" não é operação que o dado sustente.
    expect(res.body.status).toBe("PREVISTA");
    expect(res.body.valorRecebido).toBeNull();
    expect(res.body.recebidoEm).toBeNull();
  });

  it("a trilha guarda o que entrou, o acumulado e o que sobrou", async () => {
    const parcelaId = await parcelaDe1000();
    await receber(parcelaId, 250).expect(200);

    const trilha = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/auditoria?acao=PARCELA_RECEBIDA`)
      .expect(200);
    const linha = trilha.body.find((l: { entidadeId: string }) => l.entidadeId === parcelaId);
    expect(linha).toBeTruthy();
    // Sem o saldo restante, um recebimento parcial na trilha não diz se quitou.
    expect(linha.detalhe).toMatchObject({
      valorRecebido: 250,
      totalRecebido: 250,
      saldoRestante: 750,
    });
  });
});
