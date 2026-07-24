import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  db,
  contratosTable,
  contasPagarTable,
  comissaoFechamentosTable,
  comissaoRegrasTable,
  comissaoFaixasTable,
  auditLogTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { competenciaDe, competenciasAnteriores, limitesCompetencia } from "../lib/comissao";
import { criarFixture, criarLead, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * E54 — reabrir um fechamento errado. Fechar faz TRÊS coisas (cria conta a
 * pagar, grava o fechamento, reconcilia estorno) e reabrir precisa desfazer as
 * três; desfazer duas seria pior que não desfazer nenhuma, porque deixaria o
 * dinheiro num estado que ninguém consegue explicar depois.
 */
describe("Reabrir fechamento de comissão (E54)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  const ATUAL = competenciaDe(new Date());
  const [ANTIGA, RECENTE] = competenciasAnteriores(ATUAL, 2);

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);

    const regraId = randomUUID();
    await db.insert(comissaoRegrasTable).values({
      id: regraId,
      lojaId: f.lojaId,
      vendedoraId: f.superAdminId,
      vigenciaInicio: new Date("2020-01-01T12:00:00-03:00"),
      bonusAcumulaFaixas: false,
    });
    await db.insert(comissaoFaixasTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      regraId,
      minAcumulado: 0,
      maxAcumulado: null,
      percentual: 10,
      bonusFixo: null,
    });
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Contrato ATIVO com `fechadoEm` na competência pedida. */
  async function venderEm(competencia: string, valorTotal: number): Promise<string> {
    const lead = await criarLead(f);
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: f.superAdminId, valorTotal })
      .expect(201);
    const { inicio } = limitesCompetencia(competencia);
    await db
      .update(contratosTable)
      .set({ fechadoEm: new Date(inicio.getTime() + 10 * 86_400_000) })
      .where(eq(contratosTable.id, res.body.id));
    return res.body.id;
  }

  const fechar = (competencia: string) =>
    agent.post(`/api/lojas/${f.lojaId}/comissao/fechamentos`).send({ competencia });

  const reabrir = (fechamentoId: string) =>
    agent.delete(`/api/lojas/${f.lojaId}/comissao/fechamentos/${fechamentoId}`);

  it("desfaz as três coisas: fechamento, conta a pagar e trilha", async () => {
    await venderEm(ANTIGA, 10_000);
    const fech = await fechar(ANTIGA).expect(201);
    const criado = fech.body[0];
    expect(criado.valorTotal).toBe(1000); // 10% de 10.000
    expect(criado.contaPagarId).toBeTruthy();

    const res = await reabrir(criado.id).expect(200);
    expect(res.body).toMatchObject({
      fechamentoId: criado.id,
      competencia: ANTIGA,
      contaPagarRemovida: true,
      estornosReabertos: 0,
    });

    // O fechamento sumiu…
    const sobrou = await db
      .select()
      .from(comissaoFechamentosTable)
      .where(eq(comissaoFechamentosTable.id, criado.id));
    expect(sobrou).toHaveLength(0);

    // …e a conta a pagar também: deixá-la faria a loja pagar comissão de um
    // mês que não está mais fechado.
    const conta = await db
      .select()
      .from(contasPagarTable)
      .where(eq(contasPagarTable.id, criado.contaPagarId));
    expect(conta).toHaveLength(0);

    // A trilha guarda o que sumiu — é o único lugar onde o valor sobrevive.
    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.lojaId, f.lojaId),
        eq(auditLogTable.acao, "COMISSAO_FECHAMENTO_REABERTO"),
      ));
    expect(linha).toBeTruthy();
    expect(linha.entidade).toBe("comissao_fechamento");
    expect(linha.detalhe).toMatchObject({ competencia: ANTIGA, valorTotal: 1000 });
  });

  it("a competência volta a poder ser fechada, com o mesmo resultado", async () => {
    // O ponto de reabrir: corrigir e fechar de novo. Se a competência não
    // pudesse ser refechada, a reabertura só teria destruído o registro.
    const denovo = await fechar(ANTIGA).expect(201);
    expect(denovo.body[0].valorTotal).toBe(1000);
    // E volta a aparecer como pendência enquanto estava reaberta — provado
    // pelo simples fato de fechar ter criado linha nova.
    expect(denovo.body[0].id).toBeTruthy();
  });

  it("recusa reabrir quando a comissão já foi paga", async () => {
    await venderEm(RECENTE, 20_000);
    const fech = await fechar(RECENTE).expect(201);
    const criado = fech.body[0];

    await agent
      .post(`/api/lojas/${f.lojaId}/contas-pagar/${criado.contaPagarId}/pagar`)
      .send({ data: new Date().toISOString(), valorPago: criado.valorTotal, forma: "PIX" })
      .expect(200);

    const res = await reabrir(criado.id).expect(409);
    expect(res.body.error).toBe("COMISSAO_JA_PAGA");

    // E nada foi mexido: a recusa não pode ter apagado meio caminho.
    const aindaLa = await db
      .select()
      .from(comissaoFechamentosTable)
      .where(eq(comissaoFechamentosTable.id, criado.id));
    expect(aindaLa).toHaveLength(1);
  });

  it("devolve o estorno a pendente — o mês que o absorveu deixou de existir", async () => {
    // Uma venda em ANTIGA (já fechada), cancelada depois: o estorno §6.4 fica
    // pendente e é absorvido pelo fechamento seguinte.
    const contratoId = await venderEm(ANTIGA, 3_000);
    await db.update(contratosTable).set({ status: "CANCELADO" }).where(eq(contratosTable.id, contratoId));

    await venderEm(RECENTE, 50_000);
    // RECENTE já foi fechada no teste anterior; reabre para refazer com o estorno.
    const [fechRecente] = await db
      .select()
      .from(comissaoFechamentosTable)
      .where(and(
        eq(comissaoFechamentosTable.lojaId, f.lojaId),
        eq(comissaoFechamentosTable.competencia, RECENTE),
      ));
    // A conta daquele fechamento está PAGA (teste acima), então estorna antes.
    const [pagamento] = await db
      .select()
      .from(contasPagarTable)
      .where(eq(contasPagarTable.id, fechRecente.contaPagarId!));
    expect(pagamento.status).toBe("PAGA");
    await db.update(contasPagarTable).set({ status: "PREVISTA" }).where(eq(contasPagarTable.id, pagamento.id));
    await reabrir(fechRecente.id).expect(200);

    const refeito = await fechar(RECENTE).expect(201);
    const comEstorno = refeito.body[0];
    // RECENTE já tinha 20.000 do teste do 409, mais os 50.000 de agora, menos
    // o cancelamento de 3.000 que o mês absorveu.
    expect(comEstorno.totalVendas).toBe(20_000 + 50_000 - 3_000);

    const [antesDaReabertura] = await db
      .select({ estornadaEm: contratosTable.comissaoEstornadaEm })
      .from(contratosTable)
      .where(eq(contratosTable.id, contratoId));
    expect(antesDaReabertura.estornadaEm).not.toBeNull();

    await reabrir(comEstorno.id).expect(200);

    const [depois] = await db
      .select({ estornadaEm: contratosTable.comissaoEstornadaEm })
      .from(contratosTable)
      .where(eq(contratosTable.id, contratoId));
    // Sem isto, o cancelamento sumiria da próxima apuração e a loja pagaria
    // comissão sobre uma venda desfeita.
    expect(depois.estornadaEm).toBeNull();
  });

  it("fechamento de outra loja não é alcançável", async () => {
    const outra = await criarFixture();
    try {
      const [qualquer] = await db
        .select()
        .from(comissaoFechamentosTable)
        .where(eq(comissaoFechamentosTable.lojaId, f.lojaId))
        .limit(1);
      const agentOutra = await loginComLoja(outra.superAdminEmail, outra.lojaId);
      await agentOutra
        .delete(`/api/lojas/${outra.lojaId}/comissao/fechamentos/${qualquer.id}`)
        .expect(404);
    } finally {
      await limparFixture(outra);
    }
  });
});
