import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import {
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E98/F2 — a origem da noiva deixa de ser um chute irreversível.
 *
 * O cadastro nascia com `origem: "LOJA"` já escolhida (default do formulário E
 * default da coluna), e `LeadUpdate` não tinha o campo: quem clicasse "Adicionar
 * noiva" sem olhar aquele select criava uma noiva de canal LOJA para sempre, e
 * `/leads/conversao` — o relatório que existe para dizer quanto cada canal
 * traz — passava a somar uma noiva do Instagram na coluna da loja física, sem
 * caminho de correção em nenhuma tela.
 *
 * A janela de correção fecha na CONVERSÃO, e a régua é `converteu(etapa)`, a
 * mesma que o relatório usa para contar. O backlog dizia "enquanto o lead não
 * tem contrato" — não é a mesma pergunta, e os dois casos em que elas divergem
 * estão testados aqui embaixo.
 */
describe("E98/F2 — a origem é corrigível até a conversão", () => {
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

  it("corrige a origem de uma noiva que ainda não converteu", async () => {
    const lead = await criarLead(f, { origem: "LOJA", etapa: "EM_ATENDIMENTO" });

    const res = await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ origem: "INSTAGRAM" });

    expect(res.status, res.text).toBe(200);
    expect(res.body.origem).toBe("INSTAGRAM");
  });

  it("a correção move a noiva de coluna no relatório de conversão", async () => {
    const lead = await criarLead(f, { origem: "LOJA", etapa: "NOVO" });

    const antes = await agent.get(`/api/lojas/${f.lojaId}/leads/conversao`);
    const naLojaAntes =
      antes.body.porOrigem.find((o: { origem: string }) => o.origem === "LOJA")?.total ?? 0;
    const noSiteAntes =
      antes.body.porOrigem.find((o: { origem: string }) => o.origem === "SITE")?.total ?? 0;

    await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ origem: "SITE" })
      .expect(200);

    const depois = await agent.get(`/api/lojas/${f.lojaId}/leads/conversao`);
    const naLojaDepois =
      depois.body.porOrigem.find((o: { origem: string }) => o.origem === "LOJA")?.total ?? 0;
    const noSiteDepois =
      depois.body.porOrigem.find((o: { origem: string }) => o.origem === "SITE")?.total ?? 0;

    expect(naLojaDepois).toBe(naLojaAntes - 1);
    expect(noSiteDepois).toBe(noSiteAntes + 1);
  });

  it("recusa a troca depois da conversão — o número já foi contado", async () => {
    const lead = await criarLead(f, { origem: "LOJA", etapa: "CONTRATO_FECHADO" });

    const res = await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ origem: "INSTAGRAM" });

    expect(res.status, res.text).toBe(422);
    expect(res.body.error).toBe("ORIGEM_IMUTAVEL");

    const conferida = await agent.get(`/api/lojas/${f.lojaId}/leads/${lead.id}`).expect(200);
    expect(conferida.body.origem).toBe("LOJA");
  });

  it("recusa também nas etapas DEPOIS do contrato, não só nele", async () => {
    // `converteu` é "CONTRATO_FECHADO ou além" — uma noiva EM_PROVAS já entrou
    // na conta de convertidas, e travar só em CONTRATO_FECHADO deixaria a
    // maioria das convertidas editável.
    const lead = await criarLead(f, { origem: "LOJA", etapa: "EM_PROVAS" });

    const res = await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ origem: "WHATSAPP" });

    expect(res.status, res.text).toBe(422);
    expect(res.body.error).toBe("ORIGEM_IMUTAVEL");
  });

  it("reenviar a MESMA origem de uma convertida não é uma troca, e passa", async () => {
    // A tela manda o formulário inteiro no PATCH. Recusar o campo idêntico
    // impediria de corrigir o NOME de uma noiva já convertida — um 422 no lugar
    // errado, e a pessoa não teria como adivinhar qual campo ofendeu.
    const lead = await criarLead(f, { origem: "SITE", etapa: "CASAMENTO_REALIZADO" });

    const res = await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ origem: "SITE", noivaNome: "Nome Corrigido" });

    expect(res.status, res.text).toBe(200);
    expect(res.body.noivaNome).toBe("Nome Corrigido");
  });

  it("a origem continua atrás da sessão, como o resto do PATCH", async () => {
    const lead = await criarLead(f, { origem: "LOJA", etapa: "NOVO" });

    const res = await request(app)
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ origem: "SITE" });

    expect(res.status).toBe(401);
  });
});
