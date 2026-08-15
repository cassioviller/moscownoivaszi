import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E240/S-O50 (decisão da dona, 15/08/2026) — **a confecção ganha prazo
 * próprio.**
 *
 * Até aqui o prazo de todo trabalho de agulha era DERIVADO — a próxima prova
 * quando há, senão o casamento da noiva (E170) — e a costureira não tinha como
 * dizer *"esta eu preciso para o dia 10"* com o casamento em março: a coluna
 * não existia. Medido no `heliumdb` em 15/08: 7 ajustes, 5 confecções, todas
 * com o prazo saindo do casamento.
 *
 * O que este arquivo prega são as TRÊS portas do `Ajuste` (`GET`, `POST`,
 * `PATCH`) entregando `prazoProprio` — a lição da S-O111: campo que o schema
 * promete e uma porta esquece nasce `undefined` em silêncio —, e as duas
 * grafias que o contrato aceita: `AAAA-MM-DD` entra, `null` no `PATCH` limpa,
 * e qualquer outra coisa é 400 antes de tocar no banco.
 *
 * Vermelho medido antes do conserto (spec sem o campo, coluna sem existir):
 * o `POST` respondia 201 e o corpo vinha SEM `prazoProprio` —
 * `expected undefined to be '2027-03-10'` — porque o `CreateAjusteBody` do
 * codegen descartava a chave desconhecida em silêncio.
 */
describe("E240/S-O50 — o prazo próprio da confecção nas três portas do ajuste", () => {
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

  let sequencia = 0;

  /** Uma noiva com um atendimento — a confecção nasce de um. */
  async function atendimentoDaNoiva() {
    const inicio = new Date(dataFutura(60).getTime() + sequencia++ * 3_600_000);
    const lead = await criarLead(f, { casamentoData: dataFutura(90) });
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
      leadId: lead.id,
    });
    const cabine = await agent
      .post(`/api/lojas/${f.lojaId}/cabines`)
      .send({ nome: `Cabine ${bloqueio.id.slice(0, 6)}` })
      .expect(201);
    const atendimento = await agent
      .post(`/api/lojas/${f.lojaId}/atendimentos`)
      .send({
        leadId: lead.id,
        cabineId: cabine.body.id,
        vendedoraId: f.vendedoraId,
        tipo: "ATENDIMENTO",
        inicio: inicio.toISOString(),
      })
      .expect(201);
    return atendimento.body as { id: string };
  }

  it("POST grava o dia e o devolve na resposta; o GET da fila o traz igual", async () => {
    const atendimento = await atendimentoDaNoiva();
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({
        atendimentoId: atendimento.id,
        descricao: "Vestido de renda sob medida",
        tipo: "CONFECCAO",
        prazoProprio: "2027-03-10",
      })
      .expect(201);
    expect(criado.body.prazoProprio).toBe("2027-03-10");

    const fila = await agent.get(`/api/lojas/${f.lojaId}/ajustes`).expect(200);
    const naFila = fila.body.find((a: { id: string }) => a.id === criado.body.id);
    expect(naFila?.prazoProprio).toBe("2027-03-10");
  });

  it("sem o campo, nasce nulo — 'vale a régua derivada', e nada muda para o ajuste comum", async () => {
    const atendimento = await atendimentoDaNoiva();
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({ atendimentoId: atendimento.id, descricao: "Barra" })
      .expect(201);
    expect(criado.body.prazoProprio).toBeNull();
  });

  it("PATCH fixa o prazo depois, e `null` o limpa de volta", async () => {
    const atendimento = await atendimentoDaNoiva();
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({ atendimentoId: atendimento.id, descricao: "Manga", tipo: "CONFECCAO" })
      .expect(201);

    const fixado = await agent
      .patch(`/api/lojas/${f.lojaId}/ajustes/${criado.body.id}`)
      .send({ prazoProprio: "2027-02-01" })
      .expect(200);
    expect(fixado.body.prazoProprio).toBe("2027-02-01");

    const limpo = await agent
      .patch(`/api/lojas/${f.lojaId}/ajustes/${criado.body.id}`)
      .send({ prazoProprio: null })
      .expect(200);
    expect(limpo.body.prazoProprio).toBeNull();
  });

  it("grafia que não é AAAA-MM-DD é 400 nas duas portas de escrita", async () => {
    const atendimento = await atendimentoDaNoiva();
    await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({ atendimentoId: atendimento.id, descricao: "Cauda", tipo: "CONFECCAO", prazoProprio: "10/03/2027" })
      .expect(400);
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({ atendimentoId: atendimento.id, descricao: "Cauda", tipo: "CONFECCAO" })
      .expect(201);
    await agent
      .patch(`/api/lojas/${f.lojaId}/ajustes/${criado.body.id}`)
      .send({ prazoProprio: "2027-03-10T12:00:00Z" })
      .expect(400);
  });
});
