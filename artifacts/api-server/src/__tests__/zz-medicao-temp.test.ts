import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contratosTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarReserva,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/** S-O4 (R6) — a data muda na reserva e o contrato ATIVO fica para trás. */
describe("medição — a data que diverge", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("mover a data da reserva deixa o contrato ATIVO na data velha", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const dataVelha = dataFutura(180);
    const dataNova = dataFutura(200);

    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: dataVelha });
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataVelha,
    });

    const contrato = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      valorTotal: 5000,
      dataCasamento: dataVelha.toISOString(),
      bloqueioVestidoIds: [bloqueio.id],
    });
    console.log("\n>>> MEDIÇÃO S-O4");
    console.log("    POST /contratos            :", contrato.status, contrato.body?.error ?? "");
    if (contrato.status !== 201) {
      console.log("    corpo:", JSON.stringify(contrato.body).slice(0, 400));
    }

    const mover = await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ casamentoData: dataNova.toISOString() });
    console.log("    PATCH /reservas (data nova):", mover.status, mover.body?.error ?? "");

    const [c] = await db
      .select()
      .from(contratosTable)
      .where(eq(contratosTable.id, contrato.body?.id ?? "-"));
    console.log("    reserva.casamentoData      :", dataNova.toISOString().slice(0, 10));
    console.log("    contrato.dataCasamento     :", c?.dataCasamento?.toISOString().slice(0, 10));

    // E o remédio que a outra ponta oferece:
    const arrumar = await agent
      .patch(`/api/lojas/${f.lojaId}/contratos/${contrato.body?.id}`)
      .send({ dataCasamento: dataNova.toISOString() });
    console.log("    PATCH /contratos (arrumar) :", arrumar.status, arrumar.body?.error ?? "");
    console.log("    detalhe                    :", arrumar.body?.detalhe ?? "");

    expect(
      c?.dataCasamento?.toISOString().slice(0, 10),
      "o contrato acompanhou a reserva",
    ).toBe(dataNova.toISOString().slice(0, 10));
  });
});
