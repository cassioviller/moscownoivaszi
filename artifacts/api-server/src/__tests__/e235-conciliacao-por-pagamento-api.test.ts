import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { conciliacaoDeRecebimentosTable, db, parcelasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { conciliarExtrato, type MovimentoSistema, type TransacaoExtrato } from "@workspace/financeiro-core";
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
 * **E235 (S-C51, respondida em 15/08/2026: por PAGAMENTO) — a conciliação
 * enxerga cada pagamento, e o carimbo é por ato.**
 *
 * O vermelho, CONSTRUÍDO (lição da S-C242 — no banco ele não existe: 0 de 303
 * parcelas foram pagas em pedaços): uma parcela de R$ 1.000,00 recebida
 * R$ 300,00 em 01/03 e R$ 700,00 em 15/03, contra um extrato com as duas
 * linhas. A tela montava UM movimento por parcela (`conciliacao.tsx:147-158`,
 * datado pelo `recebidoEm`, o último pedaço) e o motor devolvia **três
 * divergências falsas** — duas "só no banco", uma "só no sistema". Com os
 * movimentos por ato: **duas casadas, zero divergências**.
 *
 * E o carimbo: marcar UM pedaço não carimba a parcela (era o que
 * `parcelas.conciliado_em`, coluna por linha, fazia); marcar o último DERIVA o
 * carimbo da parcela.
 */
const DIA = (ymd: string) => `${ymd}T12:00:00-03:00`;
const semCarimbo = ({ conciliadoEm: _c, ...m }: { conciliadoEm: string | null } & MovimentoSistema): MovimentoSistema => m;

describe("E235 — a conciliação enxerga cada pagamento", () => {
  let f: Fixture;
  let outra: Fixture;
  let dona: Awaited<ReturnType<typeof loginComLoja>>;
  let parcelaId: string;

  beforeAll(async () => {
    f = await criarFixture();
    outra = await criarFixture();
    dona = await loginComLoja(f.superAdminEmail, f.lojaId);
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 1000, fechadoEm: dataFutura(-400) });
    parcelaId = randomUUID();
    await db.insert(parcelasTable).values({
      id: parcelaId,
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero: 1,
      origem: "PLANO",
      valorPrevisto: 1000,
      vencimento: new Date(DIA("2027-03-10")),
    });
    // Os dois PIX, pela PORTA — é ela que escreve a linha da trilha (E221).
    await dona.post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/receber`)
      .send({ valorRecebido: 300, recebidoEm: DIA("2027-03-01"), formaRecebimento: "PIX" }).expect(200);
    await dona.post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/receber`)
      .send({ valorRecebido: 700, recebidoEm: DIA("2027-03-15"), formaRecebimento: "PIX" }).expect(200);
  });

  afterAll(async () => {
    await limparFixture(f);
    await limparFixture(outra);
    await fecharPool();
  });

  const movimentos = async (de = "2027-03-01", ate = "2027-03-31") =>
    (await dona.get(`/api/lojas/${f.lojaId}/financeiro/conciliacao/movimentos?de=${de}&ate=${ate}`).expect(200))
      .body as ({ conciliadoEm: string | null } & MovimentoSistema)[];

  const EXTRATO: TransacaoExtrato[] = [
    { data: "2027-03-01", descricao: "PIX RECEBIDO", valor: 300 },
    { data: "2027-03-15", descricao: "PIX RECEBIDO", valor: 700 },
  ];

  it("a parcela paga em dois PIX vira DOIS movimentos, cada um no seu dia e com o seu valor", async () => {
    const ms = await movimentos();
    const daParcela = ms.filter((m) => m.tipo === "recebimento");
    expect(daParcela.map((m) => [m.id.split(":")[0], m.data, m.valor])).toEqual([
      ["recibo", "2027-03-01", 300],
      ["recibo", "2027-03-15", 700],
    ]);
    expect(daParcela.every((m) => m.conciliadoEm === null)).toBe(true);
    // A janela recorta por dia LOCAL, nas duas pontas.
    expect((await movimentos("2027-03-02", "2027-03-14")).filter((m) => m.tipo === "recebimento")).toEqual([]);
    expect((await movimentos("2027-03-15", "2027-03-15")).map((m) => m.valor)).toEqual([700]);
  });

  it("EFEITO: contra as duas linhas do banco, duas casadas e ZERO divergências — por parcela eram TRÊS falsas", async () => {
    const porAto = (await movimentos()).map(semCarimbo);
    const depois = conciliarExtrato(EXTRATO, porAto);
    expect([depois.casadas.length, depois.soExtrato.length, depois.soSistema.length]).toEqual([2, 0, 0]);

    // O que a tela montava ANTES do E235 — um movimento por parcela, datado pelo
    // último pedaço — sobre o MESMO extrato. É o número da sobra, medido.
    const [p] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcelaId));
    const porParcela: MovimentoSistema[] = [
      { id: `parcela:${p!.id}`, data: "2027-03-15", valor: Number(p!.valorRecebido), tipo: "recebimento", descricao: "Parcela 1" },
    ];
    const antes = conciliarExtrato(EXTRATO, porParcela);
    expect([antes.casadas.length, antes.soExtrato.length, antes.soSistema.length]).toEqual([0, 2, 1]);
  });

  it("marcar UM pedaço carimba só ele; marcar o último DERIVA o carimbo da parcela; remarcar é zero", async () => {
    const [a1, a2] = (await movimentos()).filter((m) => m.tipo === "recebimento").map((m) => m.id.split(":")[1]!);
    const marcar = (corpo: object) => dona.post(`/api/lojas/${f.lojaId}/financeiro/conciliacao/marcar`).send(corpo);

    const r1 = await marcar({ reciboIds: [a1] }).expect(200);
    expect(r1.body).toEqual({ parcelas: 0, pagamentos: 0, recibos: 1 });
    let ms = (await movimentos()).filter((m) => m.tipo === "recebimento");
    expect(ms.map((m) => m.conciliadoEm !== null)).toEqual([true, false]);
    let [p] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcelaId));
    expect(p!.conciliadoEm, "um pedaço conferido NÃO carimba a parcela inteira").toBeNull();

    // A tela filtra "só o não conciliado" pelo carimbo de cada movimento: o
    // segundo pedaço continua aparecendo como pendente.
    const r2 = await marcar({ reciboIds: [a2] }).expect(200);
    expect(r2.body.recibos).toBe(1);
    ms = (await movimentos()).filter((m) => m.tipo === "recebimento");
    expect(ms.every((m) => m.conciliadoEm !== null)).toBe(true);
    [p] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcelaId));
    expect(p!.conciliadoEm, "todos os atos carimbados → a parcela deriva o carimbo").not.toBeNull();

    // Idempotente, como o carimbo de parcela e o da contabilidade.
    const r3 = await marcar({ reciboIds: [a1, a2] }).expect(200);
    expect(r3.body.recibos).toBe(0);
    const linhas = await db.select().from(conciliacaoDeRecebimentosTable).where(eq(conciliacaoDeRecebimentosTable.parcelaId, parcelaId));
    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.lojaId === f.lojaId)).toBe(true);
  });

  it("id de ato de OUTRA loja não é marcado — a trilha é a prova de loja", async () => {
    const outraDona = await loginComLoja(outra.superAdminEmail, outra.lojaId);
    const lead = await criarLead(outra);
    const contrato = await criarContrato(outra, { leadId: lead.id, valorTotal: 500, fechadoEm: dataFutura(-400) });
    const pid = randomUUID();
    await db.insert(parcelasTable).values({ id: pid, lojaId: outra.lojaId, contratoId: contrato.id, numero: 1, origem: "PLANO", valorPrevisto: 500, vencimento: new Date(DIA("2027-04-10")) });
    await outraDona.post(`/api/lojas/${outra.lojaId}/parcelas/${pid}/receber`).send({ valorRecebido: 200, recebidoEm: DIA("2027-04-01") }).expect(200);
    await outraDona.post(`/api/lojas/${outra.lojaId}/parcelas/${pid}/receber`).send({ valorRecebido: 300, recebidoEm: DIA("2027-04-02") }).expect(200);
    const dela = (await outraDona.get(`/api/lojas/${outra.lojaId}/financeiro/conciliacao/movimentos?de=2027-04-01&ate=2027-04-30`).expect(200)).body as { id: string }[];
    const atos = dela.map((m) => m.id.split(":")[1]!);
    expect(atos).toHaveLength(2);
    const r = await dona.post(`/api/lojas/${f.lojaId}/financeiro/conciliacao/marcar`).send({ reciboIds: atos }).expect(200);
    expect(r.body.recibos).toBe(0);
    expect(await db.select().from(conciliacaoDeRecebimentosTable).where(eq(conciliacaoDeRecebimentosTable.parcelaId, pid))).toEqual([]);
  });

  it("um ato só NÃO se divide (é `parcela:`), e a parcela sem ato continua sendo um movimento", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 800, fechadoEm: dataFutura(-400) });
    const umAto = randomUUID();
    await db.insert(parcelasTable).values({ id: umAto, lojaId: f.lojaId, contratoId: contrato.id, numero: 1, origem: "PLANO", valorPrevisto: 500, vencimento: new Date(DIA("2027-05-10")) });
    await dona.post(`/api/lojas/${f.lojaId}/parcelas/${umAto}/receber`).send({ valorRecebido: 500, recebidoEm: DIA("2027-05-03") }).expect(200);
    // O legado: paga direto no banco, sem linha na trilha (2 de 303 no heliumdb).
    const semAto = randomUUID();
    await db.insert(parcelasTable).values({
      id: semAto, lojaId: f.lojaId, contratoId: contrato.id, numero: 2, origem: "PLANO", valorPrevisto: 300,
      vencimento: new Date(DIA("2027-05-20")), status: "PAGA", valorRecebido: 300, recebidoEm: new Date(DIA("2027-05-20")),
    });
    const ms = await movimentos("2027-05-01", "2027-05-31");
    expect(ms.map((m) => [m.id, m.data, m.valor])).toEqual([
      [`parcela:${umAto}`, "2027-05-03", 500],
      [`parcela:${semAto}`, "2027-05-20", 300],
    ]);
  });
});
