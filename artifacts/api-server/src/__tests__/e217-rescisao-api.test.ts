import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { auditLogTable, contasPagarTable, contratoItensTable, contratosTable, db, parcelasTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";
import {
  criarContrato,
  criarFixture,
  criarLead,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **E217 — a rescisão calcula** (8ª §2º, 11ª, 12ª, 13ª §3º, 18ª).
 *
 * O módulo puro (`rescisao.test.ts`, do lado do frontend) prega a conta.
 * Este arquivo prega a PORTA: o `POST /cancelar` monta a entrada certa a
 * partir dos itens e das parcelas do banco, e o que a cláusula manda devolver
 * vira `contas_pagar` (tipo `DEVOLUCAO`), vencendo em 30 dias (13ª §3º).
 */
describe("E217 — a rescisão do contrato (POST /cancelar)", () => {
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

  async function contratoComItemEParcelas(params: {
    valorItem: number;
    exclusiva?: boolean;
    reservaPaga: number;
    restantePago?: number;
    prazoDevolucaoReservaDias?: number | null;
    dataRetirada?: Date | null;
  }) {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f, { exclusiva: params.exclusiva ?? false });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: params.valorItem,
      fechadoEm: new Date(),
    });
    if (params.prazoDevolucaoReservaDias !== undefined || params.dataRetirada !== undefined) {
      await db.update(contratosTable)
        .set({
          prazoDevolucaoReservaDias: params.prazoDevolucaoReservaDias ?? null,
          dataRetirada: params.dataRetirada ?? null,
        })
        .where(eq(contratosTable.id, contrato.id));
    }
    await db.insert(contratoItensTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId: contrato.id,
      tipo: "VESTIDO",
      vestidoId: vestido.id,
      descricao: vestido.nome,
      valorUnitario: params.valorItem,
      quantidade: 1,
    });
    await db.insert(parcelasTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero: 0,
      origem: "PLANO",
      descricao: "Entrada",
      valorPrevisto: params.reservaPaga,
      valorRecebido: params.reservaPaga,
      status: "PAGA",
      recebidoEm: new Date(),
      vencimento: new Date(),
    });
    if (params.restantePago) {
      await db.insert(parcelasTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 1,
        origem: "PLANO",
        descricao: "Parcela 1",
        valorPrevisto: params.restantePago,
        valorRecebido: params.restantePago,
        status: "PAGA",
        recebidoEm: new Date(),
        vencimento: new Date(),
      });
    }
    return { contrato, vestido };
  }

  const cancelar = (contratoId: string, body: Record<string, unknown> = {}) =>
    agent.post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/cancelar`).send({
      motivo: "A noiva desistiu",
      ...body,
    });

  const contasPagarDoContrato = (contratoId: string) =>
    db.select().from(contasPagarTable).where(eq(contasPagarTable.origemContratoId, contratoId));

  it("**11ª — só a reserva paga: retém tudo, não nasce conta a pagar**", async () => {
    const { contrato } = await contratoComItemEParcelas({ valorItem: 3000, reservaPaga: 1200 });
    const r = await cancelar(contrato.id).expect(200);
    expect(r.body.rescisao.devolucaoTotal).toBe(0);
    expect(r.body.rescisao.retencaoTotal).toBe(1200);
    expect(await contasPagarDoContrato(contrato.id)).toHaveLength(0);
  });

  it("**11ª — R$ 1.000 pagos além da reserva devolvem R$ 400 (60% de multa), e a conta a pagar nasce em 30 dias**", async () => {
    const { contrato } = await contratoComItemEParcelas({
      valorItem: 3000,
      reservaPaga: 1200,
      restantePago: 1000,
    });
    const r = await cancelar(contrato.id).expect(200);
    expect(r.body.rescisao.devolucaoTotal).toBe(400);
    expect(r.body.rescisao.retencaoTotal).toBe(1800);

    const [conta] = await contasPagarDoContrato(contrato.id);
    expect(conta).toBeDefined();
    expect(conta!.tipo).toBe("DEVOLUCAO");
    expect(Number(conta!.valorPrevisto)).toBe(400);
    const dias = Math.round((conta!.vencimento.getTime() - Date.now()) / 86_400_000);
    expect(dias).toBeGreaterThanOrEqual(29);
    expect(dias).toBeLessThanOrEqual(30);
  });

  it("**12ª — peça exclusiva de primeiro aluguel: sua fração vira multa integral, não os 60%**", async () => {
    const { contrato } = await contratoComItemEParcelas({
      valorItem: 3000,
      exclusiva: true,
      reservaPaga: 1200,
      restantePago: 1000,
    });
    const r = await cancelar(contrato.id).expect(200);
    // Item único e exclusivo: TODO o restante (R$ 1.000) vira multa da 12ª.
    expect(r.body.rescisao.devolucaoTotal).toBe(0);
    expect(r.body.rescisao.retencaoTotal).toBe(2200);
    const linha12a = (r.body.rescisao.linhas as { clausula: string }[]).find((l) => l.clausula === "12ª");
    expect(linha12a).toBeDefined();
  });

  it("**18ª — pago o total, cancela dentro do prazo pactuado: devolve sem a multa de 60%**", async () => {
    // E247 (G10): era `2027-12-01` cravado contra `hoje` — a partir de
    // 02/11/2027 a 18ª deixaria de valer e o teste reprovaria sem defeito. A
    // retirada é sempre 60 dias à frente do dia em que a suíte roda.
    const dataRetirada = ancoraDeNegocio(addDias(hojeLocal(), 60));
    const { contrato } = await contratoComItemEParcelas({
      valorItem: 3000,
      reservaPaga: 1200,
      restantePago: 1800,
      prazoDevolucaoReservaDias: 30,
      dataRetirada,
    });
    const r = await cancelar(contrato.id).expect(200);
    expect(r.body.rescisao.aplicou18a).toBe(true);
    expect(r.body.rescisao.devolucaoTotal).toBe(1800);
    expect(r.body.rescisao.retencaoTotal).toBe(1200);
  });

  it("**13ª — a loja cancela: devolve tudo, reserva incluída**", async () => {
    const { contrato } = await contratoComItemEParcelas({
      valorItem: 3000,
      reservaPaga: 1200,
      restantePago: 1000,
    });
    const r = await cancelar(contrato.id, { iniciativa: "LOJA" }).expect(200);
    expect(r.body.rescisao.devolucaoTotal).toBe(2200);
    expect(r.body.rescisao.retencaoTotal).toBe(0);
    const [conta] = await contasPagarDoContrato(contrato.id);
    expect(Number(conta!.valorPrevisto)).toBe(2200);
  });

  /**
   * **E241 — a rescisão devolve UMA vez.**
   *
   * A conta a pagar `DEVOLUCAO` (13ª §3º) e o `destinoPago: "estornar"` são
   * dois caminhos para o MESMO dinheiro voltar. Antes deste épico a porta
   * abria os dois: inseria a conta sempre que `devolucaoTotal > 0` e, no
   * passo seguinte, zerava o recebido de tudo — R$ 400,00 de conta MAIS
   * R$ 2.200,00 de estorno, R$ 2.600,00 devolvidos sobre R$ 2.200,00
   * recebidos. Sob `estornar` o caixa já devolveu tudo, e a conta não nasce.
   */
  it("**E241 — noiva desiste + `estornar`: o caixa devolve R$ 2.200 e a conta a pagar de R$ 400 NÃO nasce**", async () => {
    const { contrato } = await contratoComItemEParcelas({
      valorItem: 3000,
      reservaPaga: 1200,
      restantePago: 1000,
    });
    const r = await cancelar(contrato.id, { destinoPago: "estornar" }).expect(200);
    // A conta da rescisão continua sendo a da cláusula — o que muda é por
    // onde o dinheiro sai.
    expect(r.body.rescisao.devolucaoTotal).toBe(400);
    expect(await contasPagarDoContrato(contrato.id)).toHaveLength(0);
    const parcelas = await db.select().from(parcelasTable).where(eq(parcelasTable.contratoId, contrato.id));
    expect(parcelas.every((p) => p.valorRecebido === null)).toBe(true);
    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.acao, "CONTRATO_CANCELADO"), eq(auditLogTable.entidadeId, contrato.id)));
    expect(linha!.detalhe).toMatchObject({
      totalEstornado: 2200,
      rescisaoDevolucaoTotal: 400,
      devolucaoPorContaAPagar: 0,
    });
  });

  it("**E241 — a loja cancela + `estornar`: 100% pelo caixa, e não MAIS 100% em conta a pagar**", async () => {
    const { contrato } = await contratoComItemEParcelas({
      valorItem: 3000,
      reservaPaga: 1200,
      restantePago: 1000,
    });
    const r = await cancelar(contrato.id, { iniciativa: "LOJA", destinoPago: "estornar" }).expect(200);
    expect(r.body.rescisao.devolucaoTotal).toBe(2200);
    expect(await contasPagarDoContrato(contrato.id)).toHaveLength(0);
    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.acao, "CONTRATO_CANCELADO"), eq(auditLogTable.entidadeId, contrato.id)));
    expect(linha!.detalhe).toMatchObject({ totalEstornado: 2200, devolucaoPorContaAPagar: 0 });
  });

  it("**E241 — sob `manter` a conta a pagar continua sendo o único caminho da devolução, e a trilha diz o valor**", async () => {
    const { contrato } = await contratoComItemEParcelas({
      valorItem: 3000,
      reservaPaga: 1200,
      restantePago: 1000,
    });
    await cancelar(contrato.id).expect(200);
    const [conta] = await contasPagarDoContrato(contrato.id);
    expect(Number(conta!.valorPrevisto)).toBe(400);
    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.acao, "CONTRATO_CANCELADO"), eq(auditLogTable.entidadeId, contrato.id)));
    expect(linha!.detalhe).toMatchObject({ totalEstornado: 0, devolucaoPorContaAPagar: 400 });
  });

  it("a trilha guarda a iniciativa e os dois totais da rescisão", async () => {
    const { contrato } = await contratoComItemEParcelas({
      valorItem: 3000,
      reservaPaga: 1200,
      restantePago: 1000,
    });
    await cancelar(contrato.id).expect(200);
    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.acao, "CONTRATO_CANCELADO"), eq(auditLogTable.entidadeId, contrato.id)));
    expect(linha!.detalhe).toMatchObject({
      iniciativa: "LOCATARIA",
      rescisaoDevolucaoTotal: 400,
      rescisaoRetencaoTotal: 1800,
    });
  });
});
