import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { auditLogTable, contratosTable, db, lojasTable, parcelasTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import app from "../app";
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
import { recibosDaParcela } from "../lib/recibo-do-papel";

/**
 * **E221 — o recibo de pagamento** (contrato de locação, cláusula 7ª).
 *
 * > **CLÁUSULA 7ª** — A LOCADORA deverá fornecer **todos os recibos de
 * > pagamentos efetuados pelo LOCATÁRIO.**
 *
 * A auditoria do contrato de papel mediu o buraco em uma linha: **zero
 * ocorrências de "recibo" no código**. O sistema sempre registrou o
 * recebimento (`parcelas.valorRecebido`, `recebidoEm`, `formaRecebimento`) e a
 * noiva nunca recebeu comprovante de nada.
 *
 * A leitura da cláusula está declarada em `lib/recibo-do-papel.ts` e é o que
 * este arquivo prega: **um recibo por RECEBIMENTO, não por parcela.**
 */
describe("E221 — o recibo é do PAGAMENTO, e o pagamento pode ser um pedaço", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  const publico = () => request(app);

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    // Os dados da loja saem do CADASTRO, nunca de código — e é por isso que o
    // teste os grava aqui: o recibo tem de imprimir o que a loja preencheu.
    await db
      .update(lojasTable)
      .set({
        cnpj: "37.771.644/0001-93",
        endereco: "Rua Luis Jacinto 297, Centro, Sao Jose dos Campos",
        telefone: "(12) 99999-0000",
      })
      .where(eq(lojasTable.id, f.lojaId));
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Noiva com contrato ATIVO e uma parcela de `valor` em aberto. */
  async function noivaComParcela(valor: number, numero = 0) {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: valor,
      fechadoEm: dataFutura(-10),
    });
    const [parcela] = await db
      .insert(parcelasTable)
      .values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero,
        origem: "PLANO",
        valorPrevisto: valor,
        vencimento: dataFutura(30),
      })
      .returning();
    return { lead, contrato, parcela };
  }

  const receber = (parcelaId: string, corpo: Record<string, unknown>) =>
    agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/receber`).send(corpo);

  const listar = (contratoId: string) =>
    agent.get(`/api/lojas/${f.lojaId}/contratos/${contratoId}/recibos`);

  const portalDe = async (leadId: string) =>
    (await agent.post(`/api/lojas/${f.lojaId}/leads/${leadId}/portal`).expect(201)).body
      .token as string;

  // O texto do PDF: o mesmo desembrulho do E165 — o NBSP do `brl` e o escape
  // de parênteses do formato, para o assert comparar texto lido por gente.
  const textoDoPdf = (bytes: Buffer) =>
    bytes.toString("latin1").replace(/\u00a0/g, " ").replace(/\\([()])/g, "$1");

  /**
   * **A tese, e o vermelho que a mediu.**
   *
   * VERMELHO ANTES (a rota inexistente, medido em 2026-08-13):
   * ```
   * × dois recebimentos na MESMA parcela são DOIS recibos
   *   → expected 404 "Not Found", got 200 "OK"
   *   AssertionError: expected undefined to have a length of 2
   * ```
   */
  it("dois recebimentos na MESMA parcela são DOIS recibos", async () => {
    const { contrato, parcela } = await noivaComParcela(1000);

    await receber(parcela.id, {
      valorRecebido: 300,
      recebidoEm: "2026-03-01T12:00:00.000Z",
      formaRecebimento: "DINHEIRO",
    }).expect(200);
    await receber(parcela.id, {
      valorRecebido: 700,
      recebidoEm: "2026-03-15T12:00:00.000Z",
      formaRecebimento: "PIX",
    }).expect(200);

    const r = await listar(contrato.id).expect(200);

    // Duas linhas, com o valor de CADA pagamento — não uma de R$ 1.000,00.
    expect(r.body.recibos).toHaveLength(2);
    expect(r.body.recibos.map((x: { valor: number }) => x.valor)).toEqual([300, 700]);
    // E cada uma no DIA do seu pagamento. A parcela guarda só o último
    // (`recebidoEm` é sobrescrito), então sem esta linha o recibo de 01/03
    // sairia datado de 15/03.
    expect(r.body.recibos.map((x: { pagoEm: string }) => x.pagoEm.slice(0, 10))).toEqual([
      "2026-03-01",
      "2026-03-15",
    ]);
    expect(r.body.recibos.map((x: { forma: string }) => x.forma)).toEqual(["DINHEIRO", "PIX"]);
    // O acumulado e o saldo fazem o recibo do PARCIAL dizer o que ele é, em
    // vez de parecer a quitação da parcela.
    expect(r.body.recibos[0]).toMatchObject({ totalRecebido: 300, saldoRestante: 700 });
    expect(r.body.recibos[1]).toMatchObject({ totalRecebido: 1000, saldoRestante: 0 });
  });

  /**
   * O que faz um papel VALER como recibo: quem pagou, quanto, quando, por qual
   * forma, referente a quê, e quem emitiu — com CNPJ, e vindo do cadastro.
   */
  it("o PDF diz quem pagou, quanto, quando, referente a quê e quem emitiu", async () => {
    const { contrato, parcela } = await noivaComParcela(2000, 1);
    await receber(parcela.id, {
      valorRecebido: 2000,
      recebidoEm: "2026-04-20T12:00:00.000Z",
      formaRecebimento: "CARTAO_CREDITO",
    }).expect(200);

    const { recibos } = (await listar(contrato.id).expect(200)).body;
    const r = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/recibos/${recibos[0].id}/pdf`)
      .expect(200);

    expect(r.headers["content-type"]).toContain("application/pdf");
    const t = textoDoPdf(r.body);
    expect(t.slice(0, 5)).toBe("%PDF-");
    expect(t).toContain("RECIBO DE PAGAMENTO");
    expect(t).toContain("R$ 2.000,00"); // quanto
    expect(t).toContain("20/04/2026"); // quando
    // A forma em PT-BR, e não o enum cru: o papel é lido pela noiva.
    expect(t).toContain("Cartão de crédito");
    expect(t).not.toContain("CARTAO_CREDITO");
    expect(t).toContain("Parcela 1"); // referente a quê
    // Quem emitiu, do CADASTRO — nunca de código.
    expect(t).toContain("37.771.644/0001-93");
    expect(t).toContain("Rua Luis Jacinto 297");
  });

  /**
   * **Recibo de parcela estornada é documento falso.**
   *
   * O estorno deste repositório é tudo-ou-nada (E49: *"a parcela não tem livro
   * de recebimentos, só o acumulado"*), então ele não anula um ato: anula todos
   * os que vieram antes. E o que entra DEPOIS vale normalmente.
   */
  it("o estorno apaga os recibos anteriores, e o recebimento seguinte vale", async () => {
    const { contrato, parcela } = await noivaComParcela(500, 2);
    await receber(parcela.id, {
      valorRecebido: 500,
      recebidoEm: "2026-05-01T12:00:00.000Z",
      formaRecebimento: "PIX",
    }).expect(200);
    const antes = (await listar(contrato.id).expect(200)).body.recibos;
    expect(antes).toHaveLength(1);

    await agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/estornar`).expect(200);

    // Some da lista, e o PDF do id que existia responde 404 — não um papel.
    expect((await listar(contrato.id).expect(200)).body.recibos).toEqual([]);
    await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/recibos/${antes[0].id}/pdf`)
      .expect(404);

    await receber(parcela.id, {
      valorRecebido: 500,
      recebidoEm: "2026-05-10T12:00:00.000Z",
      formaRecebimento: "DINHEIRO",
    }).expect(200);
    const depois = (await listar(contrato.id).expect(200)).body.recibos;
    expect(depois).toHaveLength(1);
    expect(depois[0]).toMatchObject({ valor: 500, forma: "DINHEIRO" });
  });

  /**
   * O cancelamento do contrato é o SEGUNDO caminho que devolve dinheiro, e ele
   * não passa por `RECEBIMENTO_ESTORNADO`: grava `CONTRATO_CANCELADO` com
   * `destinoPago`. Com "estornar" o dinheiro voltou; com "manter" ele ficou, e
   * o recibo continua valendo — o pagamento aconteceu e não foi devolvido.
   */
  it("cancelar com 'estornar' mata os recibos; com 'manter' eles ficam", async () => {
    const a = await noivaComParcela(800, 3);
    await receber(a.parcela.id, {
      valorRecebido: 800,
      recebidoEm: "2026-06-01T12:00:00.000Z",
      formaRecebimento: "PIX",
    }).expect(200);
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${a.contrato.id}/cancelar`)
      .send({ motivo: "desistencia", destinoPago: "estornar" })
      .expect(200);
    expect((await listar(a.contrato.id).expect(200)).body.recibos).toEqual([]);

    const b = await noivaComParcela(800, 4);
    await receber(b.parcela.id, {
      valorRecebido: 800,
      recebidoEm: "2026-06-02T12:00:00.000Z",
      formaRecebimento: "PIX",
    }).expect(200);
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${b.contrato.id}/cancelar`)
      .send({ motivo: "desistencia", destinoPago: "manter" })
      .expect(200);
    expect((await listar(b.contrato.id).expect(200)).body.recibos).toHaveLength(1);
  });

  /**
   * **A falha é FECHADA.** Se a trilha diz mais dinheiro do que a parcela
   * guarda, alguma devolução passou por um caminho que o módulo não conhece —
   * e aí nenhum recibo sai. É a única falha possível que custa caro.
   */
  it("trilha somando mais que a parcela: NENHUM recibo, e não um a menos", async () => {
    const { contrato, parcela } = await noivaComParcela(1000, 5);
    await receber(parcela.id, {
      valorRecebido: 400,
      recebidoEm: "2026-07-01T12:00:00.000Z",
      formaRecebimento: "PIX",
    }).expect(200);
    await receber(parcela.id, {
      valorRecebido: 600,
      recebidoEm: "2026-07-02T12:00:00.000Z",
      formaRecebimento: "PIX",
    }).expect(200);
    expect((await listar(contrato.id).expect(200)).body.recibos).toHaveLength(2);

    // A parcela perde metade do dinheiro por fora da porta — é o que um
    // caminho de estorno desconhecido faria.
    await db
      .update(parcelasTable)
      .set({ valorRecebido: 400 })
      .where(eq(parcelasTable.id, parcela.id));

    expect((await listar(contrato.id).expect(200)).body.recibos).toEqual([]);
  });

  /**
   * O outro lado da conciliação, e ele é o do LEGADO: parcela paga que entrou
   * por migração ou seed não tem ato nenhum na trilha. O sistema não inventa
   * um — ele simplesmente não emite recibo de recebimento que não viu.
   */
  it("parcela paga SEM ato na trilha não gera recibo inventado", async () => {
    const { contrato, parcela } = await noivaComParcela(300, 6);
    await db
      .update(parcelasTable)
      .set({ status: "PAGA", valorRecebido: 300, recebidoEm: new Date(), formaRecebimento: "DINHEIRO" })
      .where(eq(parcelasTable.id, parcela.id));

    expect((await listar(contrato.id).expect(200)).body.recibos).toEqual([]);
    const [linha] = await db
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.id, parcela.id));
    // E a conciliação diz POR QUE: há dinheiro sem ato, e não ato sem dinheiro.
    const { confere, somaC, recebidoC } = recibosDaParcela(linha, []);
    expect({ confere, somaC, recebidoC }).toEqual({ confere: false, somaC: 0, recebidoC: 30_000 });
  });

  // ── O portal da noiva: onde ela PEGA o recibo ──

  it("a noiva vê os recibos dela no portal e baixa o PDF pelo token", async () => {
    const { lead, parcela } = await noivaComParcela(1200, 7);
    await receber(parcela.id, {
      valorRecebido: 1200,
      recebidoEm: "2026-08-05T12:00:00.000Z",
      formaRecebimento: "TRANSFERENCIA",
    }).expect(200);
    const token = await portalDe(lead.id);

    const portal = await publico().get(`/api/portal?token=${token}`).expect(200);
    expect(portal.body.recibos).toHaveLength(1);
    expect(portal.body.recibos[0]).toMatchObject({ valor: 1200, parcela: "Parcela 7" });
    // Quem LANÇOU não desce para o portal — a fronteira do F35: a loja sim, a
    // pessoa não.
    expect(portal.body.recibos[0].lancadoPor).toBeUndefined();

    const pdf = await publico()
      .get(`/api/portal/recibo-pdf?token=${token}&reciboId=${portal.body.recibos[0].id}`)
      .expect(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(textoDoPdf(pdf.body)).toContain("R$ 1.200,00");
  });

  /**
   * O pertencimento é por CONSTRUÇÃO: os recibos saem das parcelas do contrato
   * ativo DESTA noiva, e o id pedido é procurado dentro dessa lista.
   */
  it("o recibo de OUTRA noiva não desce pelo token dela", async () => {
    const outra = await noivaComParcela(900, 8);
    await receber(outra.parcela.id, {
      valorRecebido: 900,
      recebidoEm: "2026-08-06T12:00:00.000Z",
      formaRecebimento: "PIX",
    }).expect(200);
    const reciboAlheio = (await listar(outra.contrato.id).expect(200)).body.recibos[0].id;

    const minha = await noivaComParcela(100, 9);
    const token = await portalDe(minha.lead.id);

    await publico()
      .get(`/api/portal/recibo-pdf?token=${token}&reciboId=${reciboAlheio}`)
      .expect(404);
  });

  // G15 da conferência (16/08): o título dizia 404 e o assert media 403 — e o 403
  // é o certo: a sessão não tem essa loja (guarda de sessão), a lista nem chega
  // a ser procurada.
  it("a lista de outra loja é 403 (a sessão não tem essa loja), e não os recibos de lá", async () => {
    const { contrato } = await noivaComParcela(100, 10);
    const outraLoja = randomUUID();
    await db.insert(lojasTable).values({ id: outraLoja, nome: `Loja Alheia ${outraLoja}` });
    await agent.get(`/api/lojas/${outraLoja}/contratos/${contrato.id}/recibos`).expect(403);
    await db.delete(lojasTable).where(eq(lojasTable.id, outraLoja));
  });

  /**
   * A dívida honesta do `recebidoEm` na trilha: ele só passou a ser gravado no
   * E221. O recibo de um recebimento anterior data pelo instante do
   * LANÇAMENTO, que é o único dia que o sistema guardou daquele ato.
   */
  it("ato antigo sem `recebidoEm` na trilha data pelo lançamento, e não quebra", async () => {
    const { contrato, parcela } = await noivaComParcela(700, 11);
    await receber(parcela.id, {
      valorRecebido: 700,
      recebidoEm: "2026-09-01T12:00:00.000Z",
      formaRecebimento: "PIX",
    }).expect(200);
    // A linha como o E220 a encontraria: escrita antes desta mudança.
    const [ato] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.entidadeId, parcela.id), eq(auditLogTable.acao, "PARCELA_RECEBIDA")));
    const semData = { ...(ato.detalhe as Record<string, unknown>) };
    delete semData.recebidoEm;
    await db.update(auditLogTable).set({ detalhe: semData }).where(eq(auditLogTable.id, ato.id));

    const { recibos } = (await listar(contrato.id).expect(200)).body;
    expect(recibos).toHaveLength(1);
    expect(new Date(recibos[0].pagoEm).getTime()).toBeCloseTo(ato.criadoEm.getTime(), -3);
  });

  /**
   * O 404 tem de vir da PORTA, não da ausência dela: rota inexistente também
   * responde 404, e um teste que aceitasse isso nasceria verde (regra 34). O
   * código do erro é o que distingue os dois.
   */
  it("contrato inexistente na loja é 404 com código, não uma lista vazia", async () => {
    const semContrato = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${randomUUID()}/recibos`)
      .expect(404);
    expect(semContrato.body.error).toBe("CONTRATO_NAO_ENCONTRADO");

    // E o contrato existente com recibo inexistente também.
    const { contrato } = await noivaComParcela(100, 12);
    const semRecibo = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/recibos/${randomUUID()}/pdf`)
      .expect(404);
    expect(semRecibo.body.error).toBe("RECIBO_NAO_ENCONTRADO");
    await db.delete(contratosTable).where(eq(contratosTable.id, contrato.id));
  });
});
