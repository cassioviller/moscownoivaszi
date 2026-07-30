import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, bloqueioVestidosTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarVestido,
  criarLead,
  criarBloqueio,
  dataFutura,
  type Fixture,
} from "./helpers";

/**
 * E72 — N peças por contrato, e o cancelamento que finalmente liberta.
 *
 * O vínculo era 1:1 (`bloqueioVestidoId`) e a UI nem o enviava: o contrato
 * nascia sem prender vestido nenhum e cancelar não liberava nada. Agora
 * `bloqueioVestidoIds` prende N reservas (vestido + véu + segunda peça),
 * cada uma validada, e o cancelamento solta todas.
 */
describe("Contrato com N bloqueios (E72)", () => {
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

  async function duasReservas(leadId: string) {
    const casamento = dataFutura(90);
    const b1 = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: (await criarVestido(f)).id,
      leadId,
      casamentoData: casamento,
    });
    const b2 = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: (await criarVestido(f)).id,
      leadId,
      casamentoData: casamento,
    });
    return { b1, b2, casamento };
  }

  it("cria com duas peças, o GET expõe os vínculos, e cancelar liberta as duas", async () => {
    const lead = await criarLead(f);
    const { b1, b2 } = await duasReservas(lead.id);

    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 8000,
        bloqueioVestidoIds: [b1.id, b2.id],
      })
      .expect(201);

    const detalhe = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}`)
      .expect(200);
    expect(detalhe.body.bloqueioVestidoIds.sort()).toEqual([b1.id, b2.id].sort());

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}/cancelar`)
      .send({ manterRecebido: true, motivo: "teste" })
      .expect(200);

    const bloqueios = await db
      .select()
      .from(bloqueioVestidosTable)
      .where(inArray(bloqueioVestidosTable.id, [b1.id, b2.id]));
    expect(bloqueios.every((b) => b.canceladoEm !== null)).toBe(true);
  });

  it("o singular legado entra na mesma lista de vínculos", async () => {
    const lead = await criarLead(f);
    const { b1 } = await duasReservas(lead.id);

    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 5000,
        bloqueioVestidoId: b1.id,
      })
      .expect(201);

    const detalhe = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}`)
      .expect(200);
    expect(detalhe.body.bloqueioVestidoIds).toEqual([b1.id]);
  });

  it("bloqueio de outra loja não passa (404) — cada peça é validada", async () => {
    const lead = await criarLead(f);
    const outra = await criarFixture();
    const bloqueioAlheio = await criarBloqueio(outra, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: (await criarVestido(outra)).id,
      casamentoData: dataFutura(90),
    });

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 5000,
        bloqueioVestidoIds: [bloqueioAlheio.id],
      })
      .expect(404);
    // S-D8/E122: era `{ error: "Bloqueio not found" }` — inglês, sem código nem
    // detalhe, e o toast mostrava o cru no clique que fecha a venda.
    expect(r.body.error).toBe("RESERVA_NAO_ENCONTRADA");
    expect(r.body.detalhe).toBe("A reserva de vestido indicada não existe nesta loja.");

    await db.delete(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.id, bloqueioAlheio.id));
    await limparFixture(outra);
  });

  /**
   * S-D8/E122 — a FRASE morava no campo do CÓDIGO: o POST respondia
   * `{ error: "dataCasamento do contrato diverge da data do bloqueio" }`,
   * sem `detalhe`, enquanto o PATCH do MESMO arquivo já tinha o formato certo
   * (`DATA_DIVERGE_DA_RESERVA` + detalhe). O POST converge para o irmão.
   */
  it("data do casamento longe da reserva: código DATA_DIVERGE_DA_RESERVA e detalhe com as duas datas", async () => {
    const lead = await criarLead(f);
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: (await criarVestido(f)).id,
      leadId: lead.id,
      casamentoData: dataFutura(90),
    });

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 5000,
        bloqueioVestidoIds: [bloqueio.id],
        dataCasamento: dataFutura(120).toISOString(),
      })
      .expect(422);
    expect(r.body.error).toBe("DATA_DIVERGE_DA_RESERVA");
    // O detalhe fala em datas dd/mm/aaaa, não em nome de campo.
    expect(r.body.detalhe).toMatch(/não bate com a da reserva do vestido \(\d{2}\/\d{2}\/\d{4}\)/);
  });
});
