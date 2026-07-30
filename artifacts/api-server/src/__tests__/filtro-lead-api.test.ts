import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarLead,
  criarOrcamento,
  criarContrato,
  dataFutura,
  type Fixture,
} from "./helpers";

/**
 * E62 — o recorte por noiva acontece no banco.
 *
 * O perfil da noiva baixava TODOS os orçamentos e contratos da loja para
 * filtrar no navegador — a tela mais visitada pagava o custo do acervo
 * inteiro. `?leadId=` devolve só o dela; sem o filtro, tudo segue como era.
 */
describe("Filtro ?leadId= em orçamentos e contratos (E62)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let leadA: Awaited<ReturnType<typeof criarLead>>;
  let leadB: Awaited<ReturnType<typeof criarLead>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    leadA = await criarLead(f);
    leadB = await criarLead(f);
    await criarOrcamento(f, { leadId: leadA.id });
    await criarOrcamento(f, { leadId: leadB.id });
    await criarContrato(f, { leadId: leadA.id, valorTotal: 5000, fechadoEm: new Date() });
    await criarContrato(f, {
      leadId: leadB.id,
      valorTotal: 7000,
      fechadoEm: new Date(),
      canceladoEm: dataFutura(0),
    });
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  // E124: a resposta virou página `{ total, itens }` (molde do listLeads);
  // sem pagina/porPagina os `itens` seguem completos.
  it("orçamentos com ?leadId= devolve só os da noiva", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/orcamentos?leadId=${leadA.id}`)
      .expect(200);
    expect(res.body.itens).toHaveLength(1);
    expect(res.body.itens[0].leadId).toBe(leadA.id);
  });

  it("orçamentos com ?status= recorta no banco e compõe com leadId (E83)", async () => {
    // A fixture cria os dois APROVADOS (default do helper).
    const aprovados = await agent
      .get(`/api/lojas/${f.lojaId}/orcamentos?status=APROVADO`)
      .expect(200);
    expect(aprovados.body.itens).toHaveLength(2);

    const enviados = await agent
      .get(`/api/lojas/${f.lojaId}/orcamentos?status=ENVIADO`)
      .expect(200);
    expect(enviados.body.itens).toHaveLength(0);

    const composto = await agent
      .get(`/api/lojas/${f.lojaId}/orcamentos?status=APROVADO&leadId=${leadA.id}`)
      .expect(200);
    expect(composto.body.itens).toHaveLength(1);

    await agent.get(`/api/lojas/${f.lojaId}/orcamentos?status=INVENTADO`).expect(400);
  });

  it("contratos com ?leadId= devolve só os da noiva", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/contratos?leadId=${leadB.id}`)
      .expect(200);
    expect(res.body.itens).toHaveLength(1);
    expect(res.body.itens[0].leadId).toBe(leadB.id);
  });

  it("sem o filtro, a lista da loja segue inteira", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/orcamentos`).expect(200);
    expect(res.body.itens.length).toBe(2);
    expect(res.body.total).toBe(2);
  });
});
