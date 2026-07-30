import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, parcelasTable, pagamentosTable, auditLogTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
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
 * E103/F34 — fechar o mês carimba os DOIS lados, e deixa rastro.
 *
 * Até aqui só as saídas eram carimbadas: o lado das entradas não tinha ONDE,
 * porque `parcelas.enviado_contabilidade_em` não existia. Declarar metade do mês
 * e chamar isso de fechado é o defeito que o F34 nomeia.
 */
describe("E103/F34 — declarar o mês à contabilidade", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  /** Um mês só deste teste, longe de qualquer semente. */
  const DE = "2029-03-01";
  const ATE = "2029-03-31";
  const DENTRO = new Date("2029-03-15T12:00:00-03:00");
  const FORA = new Date("2029-04-15T12:00:00-03:00");

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const declarar = (de = DE, ate = ATE) =>
    agent.post(`/api/lojas/${f.lojaId}/financeiro/contabilidade/enviar`).send({ de, ate });

  /** Um recebimento — o lado que NÃO existia antes do F34. */
  async function recebimento(quando: Date, valor = 500): Promise<string> {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: valor,
      fechadoEm: new Date("2029-01-10T12:00:00-03:00"),
    });
    const id = randomUUID();
    await db.insert(parcelasTable).values({
      id,
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero: 0,
      valorPrevisto: valor,
      vencimento: quando,
      status: "PAGA",
      valorRecebido: valor,
      recebidoEm: quando,
      formaRecebimento: "PIX",
    });
    return id;
  }

  async function saida(quando: Date, valor = 300): Promise<string> {
    const id = randomUUID();
    await db.insert(pagamentosTable).values({
      id,
      lojaId: f.lojaId,
      data: quando,
      valorPago: valor,
    });
    return id;
  }

  const lerParcela = async (id: string) =>
    (await db.select().from(parcelasTable).where(eq(parcelasTable.id, id)))[0];
  const lerPagamento = async (id: string) =>
    (await db.select().from(pagamentosTable).where(eq(pagamentosTable.id, id)))[0];

  /**
   * O caso do épico. Antes, o recebimento ficava de fora **porque não havia
   * coluna** — a loja declarava as saídas e achava o mês fechado.
   */
  it("carimba os DOIS lados, e o resultado diz quantos de cada", async () => {
    const rec = await recebimento(DENTRO);
    const pag = await saida(DENTRO);

    const r = await declarar().expect(200);

    expect(r.body.parcelas).toBe(1);
    expect(r.body.pagamentos).toBe(1);
    expect(r.body.marcados).toBe(2);
    expect((await lerParcela(rec)).enviadoContabilidadeEm).not.toBeNull();
    expect((await lerPagamento(pag)).enviadoContabilidadeEm).not.toBeNull();
  });

  /**
   * A régua de cada lado é a do CAIXA — `pagamentos.data` e
   * `parcelas.recebido_em`. Recortar a entrada por VENCIMENTO produziria um
   * pacote em regime misto, que não fecha com o DRE nem com o fluxo.
   */
  it("o recorte é por quando o dinheiro SE MOVEU, não por vencimento", async () => {
    // Vence em março, mas só foi recebida em abril: fica FORA do mês de março.
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 700,
      fechadoEm: new Date("2029-01-10T12:00:00-03:00"),
    });
    const id = randomUUID();
    await db.insert(parcelasTable).values({
      id,
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero: 0,
      valorPrevisto: 700,
      vencimento: DENTRO,
      status: "PAGA",
      valorRecebido: 700,
      recebidoEm: FORA,
      formaRecebimento: "PIX",
    });

    await declarar().expect(200);

    expect((await lerParcela(id)).enviadoContabilidadeEm).toBeNull();
  });

  it("parcela PREVISTA não entra — declarar é sobre dinheiro que se moveu", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 400,
      fechadoEm: new Date("2029-01-10T12:00:00-03:00"),
    });
    const id = randomUUID();
    await db.insert(parcelasTable).values({
      id,
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero: 0,
      valorPrevisto: 400,
      vencimento: DENTRO,
      status: "PREVISTA",
    });

    await declarar().expect(200);

    expect((await lerParcela(id)).enviadoContabilidadeEm).toBeNull();
  });

  /**
   * O carimbo é de MÃO ÚNICA — não existe rota que o limpe. Remarcar não pode
   * reescrever a data em que a contadora recebeu aquele movimento.
   */
  it("declarar de novo devolve zero e NÃO move o carimbo original", async () => {
    const rec = await recebimento(DENTRO, 111);
    await declarar().expect(200);
    const primeiro = (await lerParcela(rec)).enviadoContabilidadeEm;

    const r = await declarar().expect(200);

    expect(r.body.marcados).toBe(0);
    expect((await lerParcela(rec)).enviadoContabilidadeEm).toEqual(primeiro);
  });

  /**
   * Fechar o mês é a segunda escrita mais irreversível do financeiro e era a
   * ÚNICA sem autor. É a tese do E107 aplicada onde ela ainda não valia.
   */
  it("a declaração deixa rastro, com a janela e os dois números", async () => {
    await recebimento(new Date("2029-05-10T12:00:00-03:00"), 222);
    await saida(new Date("2029-05-10T12:00:00-03:00"), 333);

    await declarar("2029-05-01", "2029-05-31").expect(200);

    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.lojaId, f.lojaId),
        eq(auditLogTable.acao, "CONTABILIDADE_ENVIADA"),
        eq(auditLogTable.entidadeId, "2029-05-01..2029-05-31"),
      ));
    expect(linha).toBeDefined();
    expect(linha.usuarioNome).toBeTruthy();
    const d = linha.detalhe as { parcelas: number; pagamentos: number; de: string };
    expect(d.parcelas).toBe(1);
    expect(d.pagamentos).toBe(1);
    expect(d.de).toBe("2029-05-01");
  });

  /** Clique que não carimbou nada não é um fato — não polui a trilha. */
  it("declarar um mês vazio NÃO grava na trilha", async () => {
    const antes = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.lojaId, f.lojaId),
        eq(auditLogTable.acao, "CONTABILIDADE_ENVIADA"),
      ));

    await declarar("2031-08-01", "2031-08-31").expect(200);

    const depois = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.lojaId, f.lojaId),
        eq(auditLogTable.acao, "CONTABILIDADE_ENVIADA"),
      ));
    expect(depois.length).toBe(antes.length);
  });

  /**
   * Declarar e conciliar são fatos DIFERENTES na mesma linha. Sem este teste, a
   * primeira pessoa a mexer num dos dois pode "aproveitar" o outro.
   */
  it("declarar NÃO concilia — são dois carimbos independentes", async () => {
    const rec = await recebimento(new Date("2029-06-10T12:00:00-03:00"), 444);

    await declarar("2029-06-01", "2029-06-30").expect(200);

    const p = await lerParcela(rec);
    expect(p.enviadoContabilidadeEm).not.toBeNull();
    expect(p.conciliadoEm).toBeNull();
  });
});
