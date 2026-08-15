import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, auditLogTable, parcelasTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import {
  criarContrato,
  criarFixture,
  criarLead,

  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";

/**
 * **S-C72 — dentro de um ato, os dois destinos têm de fechar com o pago.**
 *
 * A S-C50 conferiu a soma dos ATOS contra o `valorRecebido` da parcela — um
 * andar acima. Dentro de um ato ninguém conferia: a porta divide o que entrou
 * em `aoPrincipal` (o que fica na parcela) e `aMora` (o que vira linha própria
 * da cláusula 9ª), e a igualdade `aoPrincipalC + aMoraC === entrandoC` é
 * garantida **por construção** em `contratos.ts:2550-2551`.
 *
 * Construção é de um lado; leitura é do outro, e nada as amarrava. Um terceiro
 * destino do mesmo pagamento — uma taxa, um arredondamento, uma fatia que fosse
 * para outro lugar — entraria **calado**: o recibo mostraria o valor pago
 * inteiro, a parcela receberia só a sua parte, e a diferença não apareceria em
 * lugar nenhum.
 *
 * A cena abaixo **fabrica** o terceiro destino escrevendo direto na trilha,
 * porque nenhuma porta de hoje o produz — é a única forma de medir o vermelho
 * de uma guarda contra o que ainda não existe, e é o que a torna régua e não
 * opinião. A guarda **falha FECHADA**, como a irmã da S-C50: sem conta que
 * feche, a parcela entra no caixa como uma linha só (o comportamento de antes
 * da S-C31), em vez de espalhar um erro por várias datas.
 */
describe("S-C72 — os destinos do ato fecham com o que foi pago", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const diasAtras = (n: number) => ancoraDeNegocio(addDias(hojeLocal(), -n));

  /** Uma parcela vencida há 30 dias — a 9ª incide, e o ato tem os dois destinos. */
  async function parcelaVencida(valor = 500) {
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
        vencimento: diasAtras(30),
      })
      .returning();
    return { contrato, parcela: parcela! };
  }

  const recibos = (contratoId: string) =>
    agent.get(`/api/lojas/${f.lojaId}/contratos/${contratoId}/recibos`);

  it("o ato honesto passa: R$ 515,00 = R$ 500,00 ao principal + R$ 15,00 à mora", async () => {
    const { contrato, parcela } = await parcelaVencida();
    await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/receber`)
      .send({ valorRecebido: 515, recebidoEm: new Date().toISOString(), formaRecebimento: "PIX" })
      .expect(200);

    // A conta fecha, então o recibo sai — é a linha de base da guarda nova.
    const r = await recibos(contrato.id).expect(200);
    expect(r.body.recibos).toHaveLength(1);
    expect(r.body.recibos[0].valor).toBe(515);
    expect(r.body.recibos[0].valorNaParcela).toBe(500);
    expect(r.body.recibos[0].mora).toBe(15);
  });

  it("o ato com um TERCEIRO destino não emite papel — falha fechada", async () => {
    const { contrato, parcela } = await parcelaVencida();
    await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/receber`)
      .send({ valorRecebido: 515, recebidoEm: new Date().toISOString(), formaRecebimento: "PIX" })
      .expect(200);

    /**
     * O terceiro destino, fabricado: R$ 515,00 pagos, R$ 490,00 ao principal e
     * R$ 15,00 à mora — R$ 10,00 que a trilha não sabe dizer para onde foram.
     * Nenhuma porta produz isto hoje; é exatamente por isso que a guarda existe
     * antes de existir o defeito.
     */
    await db
      .update(auditLogTable)
      .set({ detalhe: sql`jsonb_set(${auditLogTable.detalhe}, '{aoPrincipal}', '490')` })
      .where(and(
        eq(auditLogTable.acao, "PARCELA_RECEBIDA"),
        eq(auditLogTable.entidadeId, parcela.id),
      ));

    const r = await recibos(contrato.id).expect(200);
    expect(
      r.body.recibos,
      "a soma dos destinos não fecha com o pago e o papel saiu assim mesmo — S-C72",
    ).toEqual([]);
  });

  it("o ato ANTES do E213 continua passando — ele não tem divisão para conferir", async () => {
    const { contrato, parcela } = await parcelaVencida(500);
    await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/receber`)
      .send({ valorRecebido: 500, recebidoEm: new Date().toISOString(), formaRecebimento: "PIX" })
      .expect(200);

    // A história do banco: o `detalhe` sem `aoPrincipal`, porque a divisão só
    // passou a ser gravada depois do E213. Exigir a soma de campos que não
    // existem reprovaria todo recibo anterior a ele.
    await db
      .update(auditLogTable)
      .set({ detalhe: sql`${auditLogTable.detalhe} - 'aoPrincipal' - 'aMora'` })
      .where(and(
        eq(auditLogTable.acao, "PARCELA_RECEBIDA"),
        eq(auditLogTable.entidadeId, parcela.id),
      ));

    const r = await recibos(contrato.id).expect(200);
    expect(r.body.recibos).toHaveLength(1);
    expect(r.body.recibos[0].valorNaParcela).toBe(500);
  });
});
