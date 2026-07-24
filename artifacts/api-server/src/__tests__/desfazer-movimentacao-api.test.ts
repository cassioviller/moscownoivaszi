import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
 * E61 — a movimentação registrada errada tem conserto.
 *
 * O PATCH /bloqueios coagia null com `??`: uma retirada carimbada no bloqueio
 * errado ficava lá para sempre, segurando o vestido "fora da loja" e a
 * disponibilidade errada. Agora null explícito desfaz; campo ausente segue
 * significando "não mexa". E devolução sem retirada continua impossível.
 */
describe("Desfazer retirada/devolução (E61)", () => {
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

  async function bloqueioComRetirada() {
    const vestido = await criarVestido(f);
    const lead = await criarLead(f);
    return criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      casamentoData: dataFutura(60),
      retiradaDataReal: dataFutura(57),
    });
  }

  it("null explícito desfaz a retirada e fecha a janela aberta", async () => {
    const bloqueio = await bloqueioComRetirada();
    // Retirada sem devolução = janela física em ABERTO (sem fim conhecido).
    expect(bloqueio.ocupacaoFim).toBeNull();

    const res = await agent
      .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
      .send({ retiradaDataReal: null })
      .expect(200);
    expect(res.body.retiradaDataReal).toBeNull();
    // A ocupação volta à régua derivada da data do casamento.
    expect(res.body.ocupacaoInicio).not.toBeNull();
    expect(res.body.ocupacaoFim).not.toBeNull();
  });

  it("campo ausente não mexe na data registrada", async () => {
    const bloqueio = await bloqueioComRetirada();
    const res = await agent
      .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
      .send({ observacao: "só uma nota" })
      .expect(200);
    expect(res.body.retiradaDataReal).not.toBeNull();
  });

  it("desfazer a retirada com devolução registrada é 400 — e desfazer a devolução libera", async () => {
    const bloqueio = await bloqueioComRetirada();
    await agent
      .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
      .send({ devolucaoDataReal: dataFutura(59).toISOString() })
      .expect(200);

    // Devolução sem retirada é história impossível.
    await agent
      .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
      .send({ retiradaDataReal: null })
      .expect(400);

    // O caminho certo: primeiro desfaz a devolução…
    const semDevolucao = await agent
      .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
      .send({ devolucaoDataReal: null })
      .expect(200);
    expect(semDevolucao.body.devolucaoDataReal).toBeNull();
    expect(semDevolucao.body.retiradaDataReal).not.toBeNull();

    // …e então a retirada.
    const semRetirada = await agent
      .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
      .send({ retiradaDataReal: null })
      .expect(200);
    expect(semRetirada.body.retiradaDataReal).toBeNull();
  });
});
