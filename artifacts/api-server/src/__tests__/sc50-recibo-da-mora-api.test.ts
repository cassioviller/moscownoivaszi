import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { auditLogTable, db, lojasTable, parcelasTable } from "@workspace/db";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";
import { and, eq } from "drizzle-orm";
import app from "../app";
import {
  criarContrato,
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import { recibosDaParcela } from "../lib/recibo-do-papel";
import { trilhaDosRecebimentos } from "../lib/recibos-do-banco";
import { porRecebimento } from "../lib/recebimentos-do-caixa";

/**
 * **S-C50 — a multa da cláusula 9ª é paga e não gera recibo.**
 *
 * O E213 fez o que entra ALÉM do principal virar linha própria (`origem: MORA`,
 * nascida PAGA na mesma transação) e a batizou `MORA_RECEBIDA` na trilha. O
 * E221 emite recibo a partir de `PARCELA_RECEBIDA`, e concilia antes de emitir:
 * **soma dos atos maior que o `valorRecebido` da parcela, nenhum papel sai** —
 * falha fechada de propósito, porque recibo de dinheiro estornado é documento
 * falso.
 *
 * Os dois estão certos separados e erram juntos. A noiva que paga **R$ 515,00**
 * de uma parcela de **R$ 500,00 vencida há 30 dias** (R$ 10,00 de multa +
 * R$ 5,00 de juros) faz UM pagamento, e a trilha grava `valorRecebido: 515` no
 * ato enquanto a parcela guarda `valorRecebido: 500` — os R$ 15,00 foram para a
 * linha de MORA. A conciliação vê **515 > 500** e cala **os dois** papéis: nem
 * o dos R$ 500,00 do principal, nem o dos R$ 15,00 da multa.
 *
 * ## A decisão, e ela é a do E221 aplicada sem exceção
 *
 * **Um recibo por RECEBIMENTO, não por parcela.** Os R$ 515,00 entraram num
 * gesto só — uma forma de pagamento, um dia, uma vendedora — e quitaram duas
 * linhas. É **UM** papel, de R$ 515,00, que DIZ o que quitou: R$ 500,00 da
 * parcela e R$ 15,00 de multa e juros. Dois papéis para um pagamento seriam a
 * cláusula 7ª lida como "um recibo por linha do carnê", que é exatamente a
 * leitura que o E221 recusou.
 *
 * ## A conciliação não afrouxa: ela passa a comparar o que é comparável
 *
 * O que o ato pôs NA PARCELA é `aoPrincipal`, e é ele que tem de fechar com o
 * `valorRecebido` dela. O `valorRecebido` do ato é o que a NOIVA pagou, e parte
 * dele foi para outra linha do carnê. Eram dois números com um nome só.
 */
describe("S-C50 — o pagamento com multa é UM recibo, e ele diz a multa", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  const publico = () => request(app);

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
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

  const diasAtras = (n: number) => ancoraDeNegocio(addDias(hojeLocal(), -n));

  /**
   * O caso da sobra: R$ 500,00 vencidos há 30 dias — multa de 2% = R$ 10,00,
   * juros de 1% ao mês *pro rata die* (30/30) = R$ 5,00, total R$ 515,00.
   */
  async function parcelaVencida(valor = 500, dias = 30) {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: valor,
      fechadoEm: new Date(),
    });
    const [parcela] = await db
      .insert(parcelasTable)
      .values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 1,
        origem: "PLANO",
        descricao: "Parcela 1",
        valorPrevisto: valor,
        vencimento: diasAtras(dias),
      })
      .returning();
    return { lead, contrato, parcela: parcela! };
  }

  const receber = (parcelaId: string, valor: number, forma = "PIX") =>
    agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/receber`).send({
      valorRecebido: valor,
      recebidoEm: new Date().toISOString(),
      formaRecebimento: forma,
    });

  const listar = (contratoId: string) =>
    agent.get(`/api/lojas/${f.lojaId}/contratos/${contratoId}/recibos`);

  const parcelaDaMora = async (contratoId: string) =>
    (
      await db
        .select()
        .from(parcelasTable)
        .where(and(eq(parcelasTable.contratoId, contratoId), eq(parcelasTable.origem, "MORA")))
    )[0];

  // O mesmo desembrulho do E165/E221: o NBSP do `brl` (escapado, S-C30) e o
  // escape de parênteses do formato, para o assert comparar texto de gente.
  const textoDoPdf = (bytes: Buffer) =>
    bytes.toString("latin1").replace(/\u00a0/g, " ").replace(/\\([()])/g, "$1");

  /**
   * **A tese.** Um pagamento, um papel — e o papel vale o que a noiva pagou.
   */
  it("R$ 515,00 pagos numa parcela de R$ 500,00 saem em UM recibo de R$ 515,00", async () => {
    const { contrato, parcela } = await parcelaVencida();
    await receber(parcela.id, 515).expect(200);

    // A linha de MORA nasceu (E213) — é o que torna a conciliação divergente.
    expect(Number((await parcelaDaMora(contrato.id))!.valorPrevisto)).toBe(15);

    const { recibos } = (await listar(contrato.id).expect(200)).body;
    expect(recibos).toHaveLength(1);
    expect(recibos[0]).toMatchObject({
      parcelaId: parcela.id,
      // O que a noiva pagou naquele gesto.
      valor: 515,
      // O que este pagamento pôs NA parcela, e o que foi multa e juros.
      valorNaParcela: 500,
      mora: 15,
      totalRecebido: 500,
      saldoRestante: 0,
    });
  });

  /**
   * A linha de MORA **não** gera papel próprio: o dinheiro dela já está no
   * recibo do pagamento que a criou. Dois papéis para um pagamento fariam a
   * mesma quantia ser comprovada duas vezes.
   */
  it("a linha de MORA não emite recibo próprio — o dinheiro dela já está no do pagamento", async () => {
    const { contrato } = await (async () => {
      const c = await parcelaVencida();
      await receber(c.parcela.id, 515).expect(200);
      return c;
    })();

    const mora = (await parcelaDaMora(contrato.id))!;
    const { recibos } = (await listar(contrato.id).expect(200)).body;
    expect(recibos).toHaveLength(1);
    expect(recibos.map((r: { parcelaId: string }) => r.parcelaId)).not.toContain(mora.id);
    // E a soma dos papéis é o dinheiro que entrou no contrato — 500 + 15.
    expect(recibos.reduce((s: number, r: { valor: number }) => s + r.valor, 0)).toBe(515);
  });

  /**
   * **A guarda continua fechada, e agora ela compara o que é comparável.** O
   * que fecha com o `valorRecebido` da parcela é o que o ato pôs NELA.
   */
  it("a conciliação FECHA: os R$ 500,00 do ato são os R$ 500,00 da parcela", async () => {
    const { contrato, parcela } = await parcelaVencida();
    await receber(parcela.id, 515).expect(200);

    const [linha] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcela.id));
    const trilha = await trilhaDosRecebimentos(f.lojaId, [linha!.id, contrato.id]);
    const { confere, somaC, recebidoC } = recibosDaParcela(linha!, trilha);
    expect({ confere, somaC, recebidoC }).toEqual({ confere: true, somaC: 50_000, recebidoC: 50_000 });
  });

  /** O papel diz a conta, e não só o total: senão o R$ 515,00 gera a ligação. */
  it("o PDF separa a quitação da parcela da multa da cláusula 9ª", async () => {
    const { contrato, parcela } = await parcelaVencida();
    await receber(parcela.id, 515, "DINHEIRO").expect(200);

    const { recibos } = (await listar(contrato.id).expect(200)).body;
    const pdf = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/recibos/${recibos[0].id}/pdf`)
      .expect(200);

    const t = textoDoPdf(pdf.body);
    expect(t).toContain("R$ 515,00"); // a quantia paga
    expect(t).toContain("R$ 500,00"); // o que quitou a parcela
    expect(t).toContain("R$ 15,00"); // multa e juros
    expect(t).toContain("cláusula 9");
  });

  /** A noiva pega o papel dela, com o mesmo número. */
  it("o portal entrega o recibo de R$ 515,00 com a multa dita", async () => {
    const { lead, parcela } = await parcelaVencida();
    await receber(parcela.id, 515).expect(200);
    const token = (
      await agent.post(`/api/lojas/${f.lojaId}/leads/${lead.id}/portal`).expect(201)
    ).body.token as string;

    const portal = await publico().get(`/api/portal?token=${token}`).expect(200);
    expect(portal.body.recibos).toHaveLength(1);
    expect(portal.body.recibos[0]).toMatchObject({ valor: 515, mora: 15 });

    const pdf = await publico()
      .get(`/api/portal/recibo-pdf?token=${token}&reciboId=${portal.body.recibos[0].id}`)
      .expect(200);
    expect(textoDoPdf(pdf.body)).toContain("R$ 515,00");
  });

  /**
   * **O estorno continua anulando por CORTE.** Desfeito o recebimento, o papel
   * dos R$ 515,00 some — recibo de dinheiro devolvido é documento falso, e a
   * conciliação que passou a fechar não pode ter afrouxado isso.
   */
  it("estornar o recebimento apaga o recibo do pagamento com multa", async () => {
    const { contrato, parcela } = await parcelaVencida();
    await receber(parcela.id, 515).expect(200);
    const antes = (await listar(contrato.id).expect(200)).body.recibos;
    expect(antes).toHaveLength(1);

    await agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/estornar`).expect(200);

    expect((await listar(contrato.id).expect(200)).body.recibos).toEqual([]);
    await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/recibos/${antes[0].id}/pdf`)
      .expect(404);
  });

  /**
   * **O caixa não conta a multa duas vezes.** `porRecebimento` só divide a
   * parcela quando a trilha FECHA com ela — e ela passou a fechar. Se o pedaço
   * levasse o valor PAGO (R$ 309,00) em vez do que entrou na parcela
   * (R$ 300,00), os R$ 9,00 da linha de MORA entrariam no caixa duas vezes.
   */
  it("o caixa divide pelo que entrou NA parcela, e a linha de MORA segue sozinha", async () => {
    const { contrato, parcela } = await parcelaVencida();
    // R$ 200,00 primeiro: cabe no principal, nenhuma linha de mora nasce.
    await receber(parcela.id, 200).expect(200);
    // Sobram R$ 300,00 de principal; a mora sobre eles é 2% + 1%×30/30 = R$ 9,00.
    await receber(parcela.id, 309).expect(200);

    const [linha] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcela.id));
    expect(Number(linha!.valorRecebido)).toBe(500);
    expect(Number((await parcelaDaMora(contrato.id))!.valorRecebido)).toBe(9);

    const trilha = await trilhaDosRecebimentos(f.lojaId, [linha!.id, contrato.id]);
    const pedacos = porRecebimento([linha!], trilha);
    expect(pedacos).toHaveLength(2);
    expect(pedacos.map((p) => Number(p.valorRecebido))).toEqual([200, 300]);
  });

  /**
   * **Os atos escritos antes desta linha não têm a divisão, e o papel deles não
   * muda.** Medido no `heliumdb` em 2026-08-13: **1048** linhas
   * `PARCELA_RECEBIDA`, **0** parcelas de origem `MORA` e **0**
   * `MORA_RECEBIDA` — para todas elas o pagamento foi inteiro para a parcela, e
   * é isso que a queda para `valorRecebido` diz.
   */
  it("ato antigo, sem a divisão na trilha, vale pelo valor recebido", async () => {
    const { contrato, parcela } = await parcelaVencida(400, 0);
    await receber(parcela.id, 400).expect(200);

    const [ato] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.entidadeId, parcela.id), eq(auditLogTable.acao, "PARCELA_RECEBIDA")));
    const semDivisao = { ...(ato!.detalhe as Record<string, unknown>) };
    delete semDivisao.aoPrincipal;
    delete semDivisao.aMora;
    await db.update(auditLogTable).set({ detalhe: semDivisao }).where(eq(auditLogTable.id, ato!.id));

    const { recibos } = (await listar(contrato.id).expect(200)).body;
    expect(recibos).toHaveLength(1);
    expect(recibos[0]).toMatchObject({ valor: 400, valorNaParcela: 400, mora: 0 });
  });
});
