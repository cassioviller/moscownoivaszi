import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import { db, bloqueioVestidosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
 * **E230/S-C92 — a devolução chega ao portal.**
 *
 * `VestidoDaNoiva` trazia `retiradaPrevista` e `retiradaFeitaEm` — e nenhum
 * campo de devolução, embora `contratos.dataDevolucao` já saísse no PDF que a
 * noiva assina. **Era a única data que ela não via, e é dela que a multa da
 * 16ª corre**: a cobrança do atraso conta da devolução pactuada, e a noiva não
 * tinha onde conferir o dia. Achada no E224 e de novo pelo agente do manual da
 * noiva (S-C201, fundida) — o manual passou a explicar a 16ª e a tela seguia
 * calada sobre a data que a dispara.
 */
describe("E230 — o portal aprende a devolução", () => {
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

  async function portalComContrato(opts: { dataDevolucao?: Date } = {}) {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(60),
    });
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 8000,
        bloqueioVestidoIds: [bloqueio.id],
        dataRetirada: dataFutura(55).toISOString(),
        ...(opts.dataDevolucao ? { dataDevolucao: opts.dataDevolucao.toISOString() } : {}),
      })
      .expect(201);
    const tokenR = await agent.post(`/api/lojas/${f.lojaId}/leads/${lead.id}/portal`).expect(201);
    return { lead, bloqueio, contratoId: criado.body.id as string, token: tokenR.body.token as string };
  }

  it("a devolução combinada aparece ao lado da retirada — a data da 16ª tem onde ser lida", async () => {
    const { token } = await portalComContrato({ dataDevolucao: dataFutura(63) });

    const r = await request(app).get(`/api/portal?token=${token}`).expect(200);

    // `toBeTruthy`, não `.not.toBeNull()`: o campo AUSENTE (o defeito) vem
    // `undefined`, e `undefined !== null` passaria — foi o primeiro verde
    // falso deste arquivo, medido com o conserto guardado no stash.
    expect(r.body.vestido.retiradaPrevista).toBeTruthy();
    expect(r.body.vestido.devolucaoPrevista).toBeTruthy();
    expect(r.body.vestido.devolucaoFeitaEm ?? null).toBeNull();
  });

  it("devolvida a peça, a promessa vira registro — como a retirada já fazia", async () => {
    const { token, bloqueio } = await portalComContrato({ dataDevolucao: dataFutura(63) });
    await db
      .update(bloqueioVestidosTable)
      .set({ retiradaDataReal: new Date(), devolucaoDataReal: new Date() })
      .where(eq(bloqueioVestidosTable.id, bloqueio.id));

    const r = await request(app).get(`/api/portal?token=${token}`).expect(200);
    expect(r.body.vestido.devolucaoFeitaEm).toBeTruthy();
  });

  it("sem data combinada, o campo vem null — o portal silencia em vez de prometer", async () => {
    const { token } = await portalComContrato();

    const r = await request(app).get(`/api/portal?token=${token}`).expect(200);
    expect(r.body.vestido).not.toBeNull();
    // A chave EXISTE e vale null — ausência de chave é a porta velha, não
    // silêncio combinado.
    expect(r.body.vestido).toHaveProperty("devolucaoPrevista");
    expect(r.body.vestido.devolucaoPrevista).toBeNull();
  });
});
