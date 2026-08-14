import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, parcelasTable } from "@workspace/db";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";
import { eq } from "drizzle-orm";
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
 * **S-C101 — estornar a PRÓPRIA linha de MORA a devolve a PREVISTA, e ela
 * passa a render multa e juros de si mesma.**
 *
 * Irmã da S-C70 pelo lado que ela não fechou: aquela guarda cascateia o
 * estorno do PRINCIPAL para a linha de MORA que ele criou. Esta é a porta ao
 * lado — o estorno avulso não distingue `parcelaId`, e nada impede a
 * vendedora de estornar a linha `MORA` diretamente (ela é uma parcela PAGA
 * como qualquer outra).
 *
 * Antes do conserto: `moraDe` só recusava CANCELADA. A linha de MORA
 * estornada volta a PREVISTA, e como toda parcela vencida ela passa a
 * incidir a cláusula 9ª — **sobre si mesma**: R$ 15,00 de multa e juros
 * viram R$ 15,45 no dia seguinte, crescendo enquanto ninguém notar.
 */
describe("S-C101 — a linha de MORA não deve mora de si mesma", () => {
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

  const diasAtras = (n: number) => ancoraDeNegocio(addDias(hojeLocal(), -n));

  /** R$ 500,00 vencidos há 30 dias: multa 2% = R$ 10,00, juros 1% = R$ 5,00. */
  async function contratoComParcelaVencida() {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 500, fechadoEm: new Date() });
    const [parcela] = await db
      .insert(parcelasTable)
      .values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 1,
        origem: "PLANO",
        descricao: "Parcela 1",
        valorPrevisto: 500,
        vencimento: diasAtras(30),
      })
      .returning();
    return { contrato, parcela: parcela! };
  }

  const receber = (parcelaId: string, valor: number) =>
    agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/receber`).send({
      valorRecebido: valor,
      recebidoEm: new Date().toISOString(),
      formaRecebimento: "PIX",
    });

  const estornar = (parcelaId: string) =>
    agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/estornar`).send({});

  const moraDo = async (contratoId: string) =>
    (
      await db
        .select()
        .from(parcelasTable)
        .where(eq(parcelasTable.contratoId, contratoId))
    ).find((p) => p.origem === "MORA")!;

  it("**estornar a linha de MORA diretamente não a faz render mora sobre si mesma**", async () => {
    const { contrato, parcela } = await contratoComParcelaVencida();
    await receber(parcela.id, 515).expect(200);
    const mora = await moraDo(contrato.id);
    expect(mora.status).toBe("PAGA");

    expect((await estornar(mora.id)).status).toBe(200);

    const naFila = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/parcelas`)
      .query({ status: "abertas" })
      .expect(200);
    const achada = (naFila.body as { id: string; mora: unknown }[]).find((p) => p.id === mora.id)!;
    // Vermelho antes do conserto: `achada.mora` vinha com `{ acrescimo: 0.45,
    // total: 15.45, ... }` — a linha de R$ 15,00 rendendo 2% + 1% sobre si
    // mesma. `moraDe` agora recusa `origem: "MORA"`, no molde da CANCELADA.
    expect(achada.mora).toBeNull();
  });

  it("a linha de MORA estornada volta a PREVISTA, cobrável, mas sem a conta da 9ª embutida", async () => {
    const { contrato, parcela } = await contratoComParcelaVencida();
    await receber(parcela.id, 515).expect(200);
    const mora = await moraDo(contrato.id);
    await estornar(mora.id).expect(200);

    const depois = (await db.select().from(parcelasTable).where(eq(parcelasTable.id, mora.id)))[0]!;
    expect(depois.status).toBe("PREVISTA");
    expect(Number(depois.valorPrevisto)).toBe(15);
    // Recebe-se o previsto exato — nem mais (sem mora) nem 422 por saldo.
    await receber(mora.id, 15).expect(200);
  });
});
