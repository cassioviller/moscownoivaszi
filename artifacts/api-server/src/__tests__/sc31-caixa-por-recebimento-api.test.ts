import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, parcelasTable } from "@workspace/db";
import {
  criarContrato,
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **S-C31 — o recebimento PARCIAL é datado pelo dia em que ELE entrou.**
 *
 * `parcelas.recebido_em` guarda só o ÚLTIMO recebimento, e o caixa realizado
 * datava tudo por ele: **R$ 300,00 que entraram em 01/03 eram contados no dia
 * 15/03**, quando os R$ 700,00 quitaram a parcela. O dinheiro aparecia no dia
 * — e, cruzando o mês, na COMPETÊNCIA — errado.
 *
 * Desde o E221 a trilha sabe o dia de cada ato (`PARCELA_RECEBIDA` carrega o
 * `recebidoEm` daquele pagamento, escrita na mesma transação do dinheiro). Este
 * arquivo prega que as três leituras do realizado — fluxo, CSV do fluxo e DRE —
 * passaram a lê-lo, **sem mudar um centavo do total**.
 *
 * Cada caso vive num MÊS próprio porque a loja da fixture é uma só e as rotas
 * recortam por janela: é o que faz cinco cenários caberem numa loja.
 */
describe("S-C31 — o caixa realizado data cada recebimento pelo dia dele", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    // O superadmin, e não a vendedora: o mesmo agente recebe a parcela
    // (`contratos.editar`) e lê o fluxo (`financeiro`), e a vendedora da
    // fixture não tem o segundo — medido, `expected 200 "OK", got 403`.
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Noiva com contrato ATIVO e uma parcela de `valor` em aberto. */
  async function noivaComParcela(valor: number, vencimento: string) {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: valor,
      fechadoEm: new Date(`${vencimento}T12:00:00-03:00`),
    });
    const [parcela] = await db
      .insert(parcelasTable)
      .values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 0,
        origem: "PLANO",
        valorPrevisto: valor,
        vencimento: new Date(`${vencimento}T12:00:00-03:00`),
      })
      .returning();
    return { lead, contrato, parcela };
  }

  const receber = (parcelaId: string, valorRecebido: number, dia: string, forma: string) =>
    agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/receber`)
      .send({ valorRecebido, recebidoEm: `${dia}T12:00:00-03:00`, formaRecebimento: forma })
      .expect(200);

  const fluxo = (ini: string, fim: string) =>
    agent.get(`/api/lojas/${f.lojaId}/financeiro/fluxo?ini=${ini}&fim=${fim}`).expect(200);

  const dre = (competencia: string) =>
    agent.get(`/api/lojas/${f.lojaId}/financeiro/dre?competencia=${competencia}`).expect(200);

  /**
   * **A tese, com o número da sobra.**
   *
   * VERMELHO ANTES (`recebido_em` datando os dois pedaços, medido em
   * 2026-08-13):
   * ```
   * × os R$ 300,00 de 01/03 entram no caixa de 01/03, não no de 15/03
   *   AssertionError: expected +0 to be 300 // Object.is equality
   *     - Expected   300
   *     + Received   0
   * ```
   */
  it("os R$ 300,00 de 01/03 entram no caixa de 01/03, não no de 15/03", async () => {
    const { parcela } = await noivaComParcela(1000, "2026-03-10");
    await receber(parcela.id, 300, "2026-03-01", "DINHEIRO");
    await receber(parcela.id, 700, "2026-03-15", "PIX");

    const dia1 = await fluxo("2026-03-01", "2026-03-01");
    expect(dia1.body.resumo.entradas).toBe(300);
    expect(dia1.body.movimentos).toHaveLength(1);
    expect(dia1.body.movimentos[0].valor).toBe(300);

    const dia15 = await fluxo("2026-03-15", "2026-03-15");
    expect(dia15.body.resumo.entradas).toBe(700);

    // O mês inteiro continua fechando R$ 1.000,00: o conserto move a DATA de
    // cada pedaço, nunca o total.
    const mes = await fluxo("2026-03-01", "2026-03-31");
    expect(mes.body.resumo.entradas).toBe(1000);
    expect(mes.body.movimentos).toHaveLength(2);
    // Dois movimentos, dois ids — o id é o da linha da trilha (o mesmo número
    // que o recibo do E221 cita), e sem ele os dois pedaços colidiriam.
    expect(new Set(mes.body.movimentos.map((m: { id: string }) => m.id)).size).toBe(2);

    // E o MEIO segue o pedaço: a forma da coluna também é a do último, então
    // antes disto o "por meio" dava PIX R$ 1.000,00 · Dinheiro R$ 0,00.
    const porForma = Object.fromEntries(
      mes.body.porMeio.linhas.map((l: { forma: string; total: number }) => [l.forma, l.total]),
    );
    expect(porForma).toMatchObject({ DINHEIRO: 300, PIX: 700 });
    expect(mes.body.porMeio.total).toBe(mes.body.resumo.entradas);
  });

  /**
   * VERMELHO ANTES:
   * ```
   * × o pedaço de 28/01 fica em JANEIRO, e o DRE de fevereiro só leva o dele
   *   AssertionError: expected +0 to be 300 // Object.is equality
   * ```
   * (e fevereiro vinha com 1000 — a competência inteira errada nos dois lados).
   */
  it("o pedaço de 28/01 fica em JANEIRO, e o DRE de fevereiro só leva o dele", async () => {
    const { parcela } = await noivaComParcela(1000, "2026-01-28");
    await receber(parcela.id, 300, "2026-01-28", "DINHEIRO");
    await receber(parcela.id, 700, "2026-02-15", "PIX");

    const janeiro = await dre("2026-01");
    expect(janeiro.body.receitas).toBe(300);

    const fevereiro = await dre("2026-02");
    expect(fevereiro.body.receitas).toBe(700);

    // A régua do E50 continua valendo em cada competência.
    expect(janeiro.body.porMeio.total).toBe(300);
    expect(fevereiro.body.porMeio.total).toBe(700);
  });

  /**
   * A decisão 1 declarada em `lib/recebimentos-do-caixa.ts`: o total nunca
   * muda. Parcela com dinheiro no banco e NENHUM ato na trilha — o caso do
   * legado e do seed — continua datada pelo `recebidoEm`, e não some do caixa.
   *
   * Este é o caso de TODAS as parcelas do banco hoje: a medição da sobra achou
   * 301 parcelas vivas com trilha em `heliumdb`, cada uma com exatamente UM
   * ato, e zero em `moscow_base`.
   */
  it("parcela com dinheiro e sem ato na trilha continua no caixa, datada pelo recebidoEm", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 500,
      fechadoEm: new Date("2026-04-10T12:00:00-03:00"),
    });
    await db.insert(parcelasTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero: 0,
      origem: "PLANO",
      valorPrevisto: 500,
      vencimento: new Date("2026-04-10T12:00:00-03:00"),
      status: "PAGA",
      valorRecebido: 500,
      recebidoEm: new Date("2026-04-10T12:00:00-03:00"),
      formaRecebimento: "BOLETO",
    });

    const abril = await fluxo("2026-04-01", "2026-04-30");
    expect(abril.body.resumo.entradas).toBe(500);
    expect(abril.body.movimentos).toHaveLength(1);
  });

  /**
   * O estorno é tudo-ou-nada (E49) e anula por CORTE, não por ato — a mesma
   * régua do recibo do E221, porque é a mesma leitura da trilha. O que entrou
   * antes do estorno saiu do caixa; os que entraram depois valem, cada um no
   * dia dele.
   *
   * VERMELHO ANTES:
   * ```
   * × o estorno corta o que foi devolvido, e os recebimentos seguintes valem
   *   cada um no dia dele
   *   AssertionError: expected +0 to be 200 // Object.is equality
   * ```
   */
  it("o estorno corta o que foi devolvido, e os recebimentos seguintes valem cada um no dia dele", async () => {
    const { parcela } = await noivaComParcela(1000, "2026-05-05");
    await receber(parcela.id, 300, "2026-05-05", "DINHEIRO");
    await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/estornar`)
      .send({ motivo: "cheque devolvido" })
      .expect(200);
    await receber(parcela.id, 200, "2026-05-20", "PIX");
    await receber(parcela.id, 500, "2026-05-25", "PIX");

    // O pedaço devolvido não está no caixa de dia nenhum.
    const dia5 = await fluxo("2026-05-05", "2026-05-05");
    expect(dia5.body.resumo.entradas).toBe(0);

    // E os dois posteriores ao corte se dividem, cada um no seu dia — sem o
    // corte a soma dos atos (300+200+500) não fecharia com os R$ 700,00 da
    // parcela e nada se dividiria.
    expect((await fluxo("2026-05-20", "2026-05-20")).body.resumo.entradas).toBe(200);
    expect((await fluxo("2026-05-25", "2026-05-25")).body.resumo.entradas).toBe(500);

    const maio = await fluxo("2026-05-01", "2026-05-31");
    expect(maio.body.resumo.entradas).toBe(700);
    expect(maio.body.movimentos).toHaveLength(2);
  });

  /**
   * A janela do SQL tinha de crescer junto com a régua. As três consultas
   * recortam por `parcelas.recebido_em` — o dia do ÚLTIMO pedaço —, então a
   * parcela cujo último pedaço caiu DEPOIS da janela não chegava ao motor: o
   * mês do pedaço antigo continuaria vazio por mais que o motor soubesse
   * dividir. Este caso prega o passo 1 (`recebidasNaJanela`) sozinho.
   */
  it("o mês do primeiro pedaço enxerga a parcela cujo último pedaço caiu fora dele", async () => {
    const { parcela } = await noivaComParcela(1000, "2026-06-20");
    await receber(parcela.id, 400, "2026-06-20", "PIX");
    // O último recebimento é de JULHO: em junho, `recebido_em` já aponta para
    // fora da janela, e é exatamente aí que a consulta antiga perdia a linha.
    await receber(parcela.id, 600, "2026-07-05", "PIX");

    const junho = await fluxo("2026-06-01", "2026-06-30");
    expect(junho.body.resumo.entradas).toBe(400);
    expect(junho.body.movimentos).toHaveLength(1);

    const julho = await fluxo("2026-07-01", "2026-07-31");
    expect(julho.body.resumo.entradas).toBe(600);
  });
});
