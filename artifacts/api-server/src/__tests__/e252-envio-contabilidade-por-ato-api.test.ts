import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { auditLogTable, db, envioContabilidadeDeRecebimentosTable, parcelasTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
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
 * **E252 (S-R6) — declarar à contabilidade é um ato, e a unidade é o ATO.**
 *
 * O A6 do lote de higiene limpou `parcelas.conciliado_em` quando chega pedaço
 * novo numa parcela e deixou o irmão `enviado_contabilidade_em` — o par que o
 * E115 declara a três linhas de distância. O buraco, com o número:
 *
 * > parcela de R$ 1.000,00 declarada com **R$ 400,00** e completada depois com
 * > **R$ 600,00**. O `isNull(parcelas.enviadoContabilidadeEm)` do próximo envio
 * > a exclui, e **os R$ 600,00 não entram em pacote nenhum** — dinheiro
 * > recebido que nunca é declarado.
 *
 * **E o conserto do irmão está ERRADO aqui.** Limpar o carimbo faz a parcela
 * INTEIRA voltar ao pacote seguinte: os R$ 400,00 são declarados duas vezes e
 * a contadora recebe **R$ 1.400,00 sobre R$ 1.000,00 recebidos**. Conferir é
 * repetível; declarar é de mão única. Por isso o desenho é o do E235 — uma
 * linha por ato em `envio_contabilidade_de_recebimentos` e o carimbo da parcela
 * DERIVADO quando todos os atos válidos dela estão declarados.
 *
 * População medida no `heliumdb` em 17/08/2026: `enviado_contabilidade_em` é
 * **NULL nas 322 parcelas** (19 PREVISTA · 101 PARCIAL · 202 PAGA) e **nenhuma
 * das 301 parcelas vivas com ato tem mais de um** — o defeito está ARMADO, e o
 * vermelho é construído, como o do E235.
 */
const DIA = (ymd: string) => `${ymd}T12:00:00-03:00`;

describe("E252 — o envio à contabilidade é por ATO", () => {
  let f: Fixture;
  let dona: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    dona = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const declarar = (de: string, ate: string) =>
    dona.post(`/api/lojas/${f.lojaId}/financeiro/contabilidade/enviar`).send({ de, ate });

  /** Uma parcela do carnê, sem recebimento — o dinheiro entra pela PORTA. */
  async function parcelaDe(valor: number, vencimento: string): Promise<string> {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: valor, fechadoEm: dataFutura(-400) });
    const id = randomUUID();
    await db.insert(parcelasTable).values({
      id,
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero: 1,
      origem: "PLANO",
      valorPrevisto: valor,
      vencimento: new Date(DIA(vencimento)),
    });
    return id;
  }

  const receber = (parcelaId: string, valorRecebido: number, dia: string) =>
    dona
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/receber`)
      .send({ valorRecebido, recebidoEm: DIA(dia), formaRecebimento: "PIX" })
      .expect(200);

  const lerParcela = async (id: string) =>
    (await db.select().from(parcelasTable).where(eq(parcelasTable.id, id)))[0]!;

  const enviosDa = (parcelaId: string) =>
    db
      .select()
      .from(envioContabilidadeDeRecebimentosTable)
      .where(eq(envioContabilidadeDeRecebimentosTable.parcelaId, parcelaId));

  /**
   * **Quanto dinheiro foi declarado desta parcela** — a soma do `valorRecebido`
   * de cada ato que tem linha de envio. É o número que separa o conserto certo
   * do conserto óbvio: o certo dá R$ 1.000,00, e limpar o carimbo daria
   * R$ 1.400,00.
   */
  async function declaradoDa(parcelaId: string): Promise<number> {
    const envios = await enviosDa(parcelaId);
    if (envios.length === 0) return 0;
    const atos = await db
      .select({ detalhe: auditLogTable.detalhe })
      .from(auditLogTable)
      .where(inArray(auditLogTable.id, envios.map((e) => e.atoId)));
    return atos.reduce((s, a) => s + Number((a.detalhe as { valorRecebido?: number }).valorRecebido ?? 0), 0);
  }

  /**
   * **O caso da sobra, com o dinheiro.** Antes do E252 o segundo `declarar`
   * devolvia zero recebimentos (o campo se chamava `parcelas` até a S-RM9) e
   * os R$ 600,00 ficavam fora de todo pacote.
   */
  it("o pedaço NOVO numa parcela já declarada entra no pacote seguinte — e o já declarado não volta", async () => {
    const pid = await parcelaDe(1000, "2028-03-10");
    await receber(pid, 400, "2028-03-05");

    const primeiro = await declarar("2028-03-01", "2028-03-31").expect(200);
    expect(primeiro.body).toEqual({ marcados: 1, recebimentos: 1, pagamentos: 0 });
    expect((await lerParcela(pid)).enviadoContabilidadeEm).not.toBeNull();
    const carimboDoPrimeiroAto = (await enviosDa(pid))[0]?.enviadoEm ?? null;

    await receber(pid, 600, "2028-03-20");

    const segundo = await declarar("2028-03-01", "2028-03-31").expect(200);
    // ANTES do E252: `{ marcados: 0, recebimentos: 0, pagamentos: 0 }` — os
    // R$ 600,00 nunca eram declarados, porque a LINHA já tinha carimbo.
    expect(segundo.body).toEqual({ marcados: 1, recebimentos: 1, pagamentos: 0 });

    const envios = await enviosDa(pid);
    expect(envios).toHaveLength(2);
    // O que limpar o carimbo faria: R$ 1.400,00 declarados sobre R$ 1.000,00
    // recebidos, com os R$ 400,00 em dois pacotes.
    expect(await declaradoDa(pid)).toBe(1000);
    // Mão única: a data em que a contadora recebeu o primeiro ato não se move.
    expect(envios.find((e) => e.enviadoEm.getTime() === carimboDoPrimeiroAto!.getTime())).toBeDefined();
    expect(new Set(envios.map((e) => e.enviadoEm.getTime())).size).toBe(2);
    expect(envios.every((e) => e.lojaId === f.lojaId && e.enviadoPor !== null)).toBe(true);
  });

  /**
   * O legado e o seed gravam parcela paga direto no banco, sem passar pela
   * porta que escreve a trilha (2 de 303 no `heliumdb`). Para elas a LINHA
   * continua sendo a unidade — declarar só os atos deixaria de fora dinheiro
   * que existe.
   */
  it("a parcela SEM ato continua sendo carimbada direto, pelo `recebido_em`", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 800, fechadoEm: dataFutura(-400) });
    const pid = randomUUID();
    await db.insert(parcelasTable).values({
      id: pid,
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero: 1,
      origem: "PLANO",
      valorPrevisto: 800,
      vencimento: new Date(DIA("2028-04-10")),
      status: "PAGA",
      valorRecebido: 800,
      recebidoEm: new Date(DIA("2028-04-08")),
    });

    const r = await declarar("2028-04-01", "2028-04-30").expect(200);

    expect(r.body.recebimentos).toBe(1);
    expect((await lerParcela(pid)).enviadoContabilidadeEm).not.toBeNull();
    expect(await enviosDa(pid)).toEqual([]);
    // Idempotente do mesmo jeito.
    expect((await declarar("2028-04-01", "2028-04-30").expect(200)).body.marcados).toBe(0);
  });

  /**
   * **A janela é a do ATO, não a do `recebido_em`** — que é só o último pedaço.
   * É a S-C52 fechada pelo lado que ela apontava: o carimbo ficava meio passo
   * atrás do CSV do fluxo, que divide por ato desde a S-C31.
   */
  it("o pedaço de MAIO entra no pacote de maio, mesmo com o `recebido_em` em junho", async () => {
    const pid = await parcelaDe(1000, "2028-05-10");
    await receber(pid, 400, "2028-05-25");
    await receber(pid, 600, "2028-06-05");
    expect((await lerParcela(pid)).recebidoEm!.toISOString()).toBe(new Date(DIA("2028-06-05")).toISOString());

    // Junho primeiro: só o ato de junho é declarado, e a parcela NÃO ganha o
    // carimbo — ela ainda tem um ato de fora de todo pacote.
    const junho = await declarar("2028-06-01", "2028-06-30").expect(200);
    expect(junho.body.recebimentos).toBe(1);
    // ANTES do E252: o carimbo da LINHA nascia aqui, e os R$ 400,00 de maio
    // ficavam para sempre fora de todo pacote.
    expect((await lerParcela(pid)).enviadoContabilidadeEm).toBeNull();
    expect(await declaradoDa(pid)).toBe(600);

    // Maio depois: o pedaço antigo entra, e aí o carimbo da parcela é DERIVADO.
    const maio = await declarar("2028-05-01", "2028-05-31").expect(200);
    expect(maio.body.recebimentos).toBe(1);
    expect(await declaradoDa(pid)).toBe(1000);
    expect((await lerParcela(pid)).enviadoContabilidadeEm).not.toBeNull();
  });

  /** Remarcar não é um fato novo: devolve zero e não escreve na trilha. */
  it("declarar de novo devolve zero e NÃO move o carimbo do ato", async () => {
    const pid = await parcelaDe(500, "2028-07-10");
    await receber(pid, 500, "2028-07-03");
    await declarar("2028-07-01", "2028-07-31").expect(200);
    const antes = (await enviosDa(pid))[0]!.enviadoEm;
    const trilhaAntes = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.lojaId, f.lojaId), eq(auditLogTable.entidadeId, "2028-07-01..2028-07-31")));

    const r = await declarar("2028-07-01", "2028-07-31").expect(200);

    expect(r.body.marcados).toBe(0);
    expect((await enviosDa(pid))[0]!.enviadoEm).toEqual(antes);
    const trilhaDepois = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.lojaId, f.lojaId), eq(auditLogTable.entidadeId, "2028-07-01..2028-07-31")));
    expect(trilhaDepois.length).toBe(trilhaAntes.length);
  });

  /**
   * O estorno é tudo-ou-nada (E49) e corta a trilha da parcela: o carimbo do
   * ato cortado deixa de ter movimento a que se referir, e o recebimento
   * re-lançado nasce como ato NOVO — que entra no pacote seguinte. É o mesmo
   * efeito que o E115 obteve limpando a coluna da parcela.
   */
  it("depois do estorno, o recebimento re-lançado entra no pacote seguinte", async () => {
    const pid = await parcelaDe(900, "2028-08-10");
    await receber(pid, 900, "2028-08-04");
    expect((await declarar("2028-08-01", "2028-08-31").expect(200)).body.recebimentos).toBe(1);

    await dona.post(`/api/lojas/${f.lojaId}/parcelas/${pid}/estornar`).send({}).expect(200);
    // O E115 limpa o carimbo da linha no estorno — e é o que faz a parcela
    // voltar a ser declarável.
    expect((await lerParcela(pid)).enviadoContabilidadeEm).toBeNull();
    await receber(pid, 900, "2028-08-20");

    const r = await declarar("2028-08-01", "2028-08-31").expect(200);

    expect(r.body.recebimentos).toBe(1);
    expect((await lerParcela(pid)).enviadoContabilidadeEm).not.toBeNull();
    // Duas linhas de envio: a do ato cortado (histórico) e a do ato válido. O
    // que a derivação conta é só o VÁLIDO — o corte é a leitura do recibo.
    expect(await enviosDa(pid)).toHaveLength(2);
  });

  /**
   * **A decisão 3 do `porRecebimento`, aqui também: o ÚLTIMO ato herda o dia
   * INFORMADO.** A trilha só passou a gravar `recebidoEm` no E221, e o ato
   * anterior a ele tem como único dia o do LANÇAMENTO — a vendedora recebe no
   * sábado e lança na segunda. O caixa data essa parcela pelo `recebido_em`
   * (30/09); datar o carimbo pelo lançamento (02/10) o poria num mês e o CSV
   * noutro, que é a S-C52 de volta.
   *
   * **É onde o sistema tem população:** no `heliumdb`, **301 dos 301 atos de
   * parcela viva** são anteriores ao E221 e não têm `recebidoEm` na trilha.
   */
  it("o ato anterior ao E221 é declarado pelo dia INFORMADO, não pelo dia do lançamento", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 700, fechadoEm: dataFutura(-400) });
    const pid = randomUUID();
    await db.insert(parcelasTable).values({
      id: pid,
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero: 1,
      origem: "PLANO",
      valorPrevisto: 700,
      vencimento: new Date(DIA("2028-09-25")),
      status: "PAGA",
      valorRecebido: 700,
      recebidoEm: new Date(DIA("2028-09-30")),
    });
    // O ato como o E221 o encontrou: sem `recebidoEm` no detalhe, lançado dois
    // dias depois — em OUTRO mês.
    await db.insert(auditLogTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      usuarioNome: "Vendedora",
      acao: "PARCELA_RECEBIDA",
      entidade: "parcela",
      entidadeId: pid,
      detalhe: { valorRecebido: 700, numero: 1 },
      criadoEm: new Date(DIA("2028-10-02")),
    });

    const setembro = await declarar("2028-09-01", "2028-09-30").expect(200);

    // ANTES da decisão 3: `0` — o ato caía em outubro e setembro fechava sem ele.
    expect(setembro.body.recebimentos).toBe(1);
    expect((await lerParcela(pid)).enviadoContabilidadeEm).not.toBeNull();
    expect(await enviosDa(pid)).toHaveLength(1);
    expect((await declarar("2028-10-01", "2028-10-31").expect(200)).body.marcados).toBe(0);
  });

  /** A parcela PREVISTA não tem dinheiro que se mova — não entra em pacote. */
  it("parcela PREVISTA não é declarada, nem pela linha nem por ato", async () => {
    const pid = await parcelaDe(600, "2028-09-10");

    const r = await declarar("2028-09-01", "2028-09-30").expect(200);

    expect(r.body.marcados).toBe(0);
    expect((await lerParcela(pid)).enviadoContabilidadeEm).toBeNull();
    expect(await enviosDa(pid)).toEqual([]);
  });
});
