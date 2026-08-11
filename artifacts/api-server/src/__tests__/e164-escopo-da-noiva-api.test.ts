import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
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

/**
 * E164 — o escopo da noiva: loja E dona, em toda porta.
 *
 * O menor épico da Faixa C, e é menor porque o E161 chegou primeiro: o G2 e o
 * A05.3 (a prova apontando a reserva de outra noiva) fecharam lá, com o
 * `bloqueioDaNoiva` que este épico ia criar. O que restava: o R5/V4 — o POST
 * de bloqueio provava `leadId` e `reservaId` cada um contra a LOJA e nunca um
 * contra o OUTRO. Nasce `reservaDaNoiva`, irmã sem o ramo do nulo
 * (`reservas.lead_id` é NOT NULL — toda reserva tem dona).
 */
describe("E164 — leadId e reservaId conferidos um contra o outro", () => {
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

  it("R5/V4 · bloqueio da noiva A pendurado na reserva da noiva B é 422", async () => {
    const noivaA = await criarLead(f);
    const noivaB = await criarLead(f);
    const vestido = await criarVestido(f);
    const reservaDaB = await criarReserva(f, { leadId: noivaB.id, casamentoData: dataFutura(120) });

    /**
     * VERMELHO ANTES: 201 — cada id provado só contra a loja. A consequência
     * é de dinheiro via V3: a guarda de avaria cai para `reservas.lead_id`,
     * então o reparo do vestido que A alugou só poderia ser cobrado no carnê
     * de B, e cobrá-lo em A devolveria AVARIA_DE_OUTRA_NOIVA — o escopo
     * cruzado na criação virava beco na cobrança.
     */
    const r = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: vestido.id,
      leadId: noivaA.id,
      reservaId: reservaDaB.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(120),
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("RESERVA_DE_OUTRA_NOIVA");
  });

  it("R5/V4 · com a dona certa (ou sem dona declarada) o bloqueio nasce normalmente", async () => {
    const noiva = await criarLead(f);
    const vestido = await criarVestido(f);
    const reserva = await criarReserva(f, { leadId: noiva.id, casamentoData: dataFutura(150) });

    const certo = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: vestido.id,
      leadId: noiva.id,
      reservaId: reserva.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(150),
    });
    expect(certo.status).toBe(201);

    // Sem `leadId` no corpo não há o que comparar — o bloqueio herda a dona
    // pela reserva (é o caminho que o V3 passou a ler).
    const outroVestido = await criarVestido(f);
    const semDona = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: outroVestido.id,
      reservaId: reserva.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(150),
    });
    expect(semDona.status).toBe(201);
  });
});
