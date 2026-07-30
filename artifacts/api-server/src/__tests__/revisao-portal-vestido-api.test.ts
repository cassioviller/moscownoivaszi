import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { db, contratosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  criarFixture,
  criarLead,
  criarVestido,
  criarBloqueio,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * "O seu vestido" volta a existir no portal — pelo caminho que o app usa.
 *
 * `montarVestidoDaNoiva` decidia pela coluna legada
 * `contratos.bloqueio_vestido_id`, e o ÚNICO caminho de criação de contrato do
 * app nunca a preenche: a tela do orçamento manda `bloqueioVestidoIds` e o
 * servidor grava o vínculo em `contrato_bloqueios`, deixando a coluna nula. A
 * função devolvia `null` na primeira linha, e a seção inteira (foto, retirada
 * prevista, andamento dos ajustes) estava MORTA em produção — passava nos
 * testes só porque eles preenchiam a coluna com um `db.update` à mão, sem
 * passar pela rota.
 *
 * Este teste fecha o contrato PELA ROTA, que é a diferença que importa.
 */
describe("Portal — o vestido chega à noiva pelo vínculo que a rota grava", () => {
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

  async function contratoPelaRota(opts: { canceladoEm?: Date } = {}) {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(60),
      canceladoEm: opts.canceladoEm ?? null,
    });
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 8000,
        bloqueioVestidoIds: [bloqueio.id],
        dataRetirada: dataFutura(55).toISOString(),
      })
      .expect(201);
    const tokenR = await agent.post(`/api/lojas/${f.lojaId}/leads/${lead.id}/portal`).expect(201);
    return { lead, vestido, bloqueio, contratoId: criado.body.id as string, token: tokenR.body.token as string };
  }

  it("a seção aparece com o contrato fechado pela ROTA (antes: nunca aparecia)", async () => {
    const { vestido, token, contratoId } = await contratoPelaRota();

    // A coluna legada continua nula — é justamente esse o ponto.
    const [contrato] = await db.select().from(contratosTable).where(eq(contratosTable.id, contratoId));
    expect(contrato.bloqueioVestidoId).toBeNull();

    const r = await request(app).get(`/api/portal?token=${token}`).expect(200);
    expect(r.body.vestido).not.toBeNull();
    expect(r.body.vestido.vestidoId).toBe(vestido.id);
    expect(r.body.vestido.nome).toBe(vestido.nome);
    expect(r.body.vestido.retiradaPrevista).not.toBeNull();
  });

  it("cancelado o contrato, a reserva é liberada e a seção some", async () => {
    const { token, contratoId } = await contratoPelaRota();
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/cancelar`)
      .send({ motivo: "noiva desistiu" })
      .expect(200);

    const r = await request(app).get(`/api/portal?token=${token}`).expect(200);
    expect(r.body.vestido).toBeNull();
  });

  it("contrato sem reserva física nenhuma continua sem a seção", async () => {
    const lead = await criarLead(f);
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: f.vendedoraId, valorTotal: 3000 })
      .expect(201);
    const tokenR = await agent.post(`/api/lojas/${f.lojaId}/leads/${lead.id}/portal`).expect(201);

    const r = await request(app).get(`/api/portal?token=${tokenR.body.token}`).expect(200);
    expect(r.body.vestido).toBeNull();
  });
});
