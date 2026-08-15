import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, parcelasTable, pagamentosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarContrato,
  criarFixture,
  criarLead,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E103/F32 — a conciliação passa a ter memória.
 *
 * Ela era uma fotografia: a tela não tinha uma única mutation, o resultado
 * morria com a aba, e todo mês se refazia o mesmo trabalho — com as divergências
 * já olhadas e perdoadas voltando indistinguíveis das novas.
 */
describe("E103/F32 — marcar conciliado", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let outra: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
    outra = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await limparFixture(outra);
    await fecharPool();
  });

  const marcar = (corpo: { parcelaIds?: string[]; pagamentoIds?: string[] }) =>
    agent.post(`/api/lojas/${f.lojaId}/financeiro/conciliacao/marcar`).send(corpo);

  /** Uma parcela recebida, que é o que a conciliação enxerga como movimento. */
  async function parcelaRecebida(fx: Fixture, valor = 1000): Promise<string> {
    const lead = await criarLead(fx);
    const contrato = await criarContrato(fx, {
      leadId: lead.id,
      valorTotal: valor,
      fechadoEm: dataFutura(-5),
    });
    const id = randomUUID();
    await db.insert(parcelasTable).values({
      id,
      lojaId: fx.lojaId,
      contratoId: contrato.id,
      numero: 0,
      valorPrevisto: valor,
      vencimento: dataFutura(-3),
      status: "PAGA",
      valorRecebido: valor,
      recebidoEm: dataFutura(-3),
      formaRecebimento: "PIX",
    });
    return id;
  }

  async function pagamentoFeito(fx: Fixture, valor = 500): Promise<string> {
    const id = randomUUID();
    await db.insert(pagamentosTable).values({
      id,
      lojaId: fx.lojaId,
      data: dataFutura(-3),
      valorPago: valor,
    });
    return id;
  }

  const lerParcela = async (id: string) =>
    (await db.select().from(parcelasTable).where(eq(parcelasTable.id, id)))[0];
  const lerPagamento = async (id: string) =>
    (await db.select().from(pagamentosTable).where(eq(pagamentosTable.id, id)))[0];

  /**
   * O lote é HETEROGÊNEO, e é o caso que dá forma à rota: o que a tela chama de
   * "movimento" vem de duas tabelas, com ids sintéticos. Uma rota que aceitasse
   * uma lista só teria de inventar uma entidade "movimento" para caber no verbo.
   */
  it("marca parcela e pagamento no MESMO lote — duas tabelas, uma chamada", async () => {
    const parcelaId = await parcelaRecebida(f);
    const pagamentoId = await pagamentoFeito(f);

    const r = await marcar({ parcelaIds: [parcelaId], pagamentoIds: [pagamentoId] }).expect(200);

    expect(r.body).toEqual({ parcelas: 1, pagamentos: 1, recibos: 0 });
    expect((await lerParcela(parcelaId)).conciliadoEm).not.toBeNull();
    expect((await lerPagamento(pagamentoId)).conciliadoEm).not.toBeNull();
  });

  /**
   * Idempotente por construção (`conciliadoEm IS NULL` no WHERE), e o assert que
   * importa não é o zero: é o carimbo ANTIGO não se mover. Remarcar não pode
   * reescrever a data de quando a conferência aconteceu de verdade.
   */
  it("remarcar o mesmo lote devolve zero e NÃO mexe no carimbo antigo", async () => {
    const parcelaId = await parcelaRecebida(f);
    await marcar({ parcelaIds: [parcelaId] }).expect(200);
    const primeiro = (await lerParcela(parcelaId)).conciliadoEm;

    const r = await marcar({ parcelaIds: [parcelaId] }).expect(200);

    expect(r.body.parcelas).toBe(0);
    expect((await lerParcela(parcelaId)).conciliadoEm).toEqual(primeiro);
  });

  /**
   * E91: o `lojaId` vai no WHERE, não numa conferência posterior. Id de outra
   * loja não é erro — simplesmente não é marcado, e o número devolvido conta o
   * que de fato mudou.
   */
  it("id de OUTRA loja não é marcado, e o resultado conta só o que mudou", async () => {
    const daOutra = await parcelaRecebida(outra);
    const minha = await parcelaRecebida(f);

    const r = await marcar({ parcelaIds: [daOutra, minha] }).expect(200);

    expect(r.body.parcelas).toBe(1);
    expect((await lerParcela(daOutra)).conciliadoEm).toBeNull();
    expect((await lerParcela(minha)).conciliadoEm).not.toBeNull();
  });

  it("corpo vazio é 200 com zero, não erro — a tela pode não ter casado nada", async () => {
    const r = await marcar({}).expect(200);
    expect(r.body).toEqual({ parcelas: 0, pagamentos: 0, recibos: 0 });
  });

  /**
   * A guarda que o mapeamento levantou e que o plano não previa: **o estorno
   * limpa o carimbo**. Um movimento que deixou de existir não pode continuar
   * "conferido com o extrato" — se ficasse, a conciliação seguinte pularia uma
   * linha que voltou a ser divergência, e pularia em silêncio.
   */
  it("estornar a parcela LIMPA o conciliadoEm — o movimento deixou de existir", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 800,
      fechadoEm: dataFutura(-5),
    });
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 1, primeiroVencimento: dataFutura(5).toISOString() })
      .expect(201);
    const [parcela] = await db
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.contratoId, contrato.id));
    await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/receber`)
      .send({ valorRecebido: 800, recebidoEm: new Date().toISOString(), formaRecebimento: "PIX" })
      .expect(200);
    await marcar({ parcelaIds: [parcela.id] }).expect(200);
    expect((await lerParcela(parcela.id)).conciliadoEm).not.toBeNull();

    await agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/estornar`).expect(200);

    expect((await lerParcela(parcela.id)).conciliadoEm).toBeNull();
  });

  /**
   * `conciliadoEm` e `enviadoContabilidadeEm` são fatos DIFERENTES, e o schema
   * tinha de deixar isso possível: conciliar não declara à contabilidade, e
   * declarar não confere com o banco. Um existe sem o outro nas duas direções.
   */
  it("conciliar NÃO carimba a contabilidade — são dois fatos", async () => {
    const pagamentoId = await pagamentoFeito(f);

    await marcar({ pagamentoIds: [pagamentoId] }).expect(200);

    const pg = await lerPagamento(pagamentoId);
    expect(pg.conciliadoEm).not.toBeNull();
    expect(pg.enviadoContabilidadeEm).toBeNull();
  });

  it("o conciliadoEm chega às telas — sem isso o carimbo fica só no banco", async () => {
    const parcelaId = await parcelaRecebida(f);
    await marcar({ parcelaIds: [parcelaId] }).expect(200);

    const r = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/parcelas`)
      .expect(200);

    const linha = (r.body as { id: string; conciliadoEm: string | null }[]).find(
      (p) => p.id === parcelaId,
    );
    expect(linha?.conciliadoEm).toBeTruthy();
  });
});
