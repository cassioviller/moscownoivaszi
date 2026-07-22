import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarContrato,
  criarFixture,
  criarLead,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import { diaLocal } from "../lib/disponibilidade";

/**
 * Follow-up do I12: `GET /parcelas` devolvia a loja inteira, sempre, e sem a
 * noiva — a cobrança rebuscava TODOS os contratos só para juntar nome e
 * WhatsApp por contratoId. Agora a parcela carrega `contrato.leadId/lead` e a
 * lista aceita o recorte `de`/`ate` por vencimento (dia local SP, inclusivo
 * nas duas pontas), no mesmo padrão do GET /pagamentos.
 */
describe("I12 — GET /parcelas: janela de vencimento e noiva embutida", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let leadNome: string;
  let contratoId: string;
  // Vencimentos do plano: entrada +10d, parcelas +40d e +70d.
  let dias: string[];

  beforeAll(async () => {
    f = await criarFixture();
    // O perfil da vendedora não tem o módulo financeiro — a janela é testada
    // com o superadmin, como no lote 8.
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);

    const lead = await criarLead(f);
    leadNome = lead.noivaNome;
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 900,
      fechadoEm: dataFutura(-5),
    });
    contratoId = contrato.id;
    const plano = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({
        entrada: 100,
        numParcelas: 2,
        primeiroVencimento: dataFutura(10).toISOString(),
        periodicidadeDias: 30,
      })
      .expect(201);
    dias = plano.body.map((p: { vencimento: string }) => diaLocal(new Date(p.vencimento)));
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const minhas = (body: Array<{ contratoId: string }>) =>
    body.filter((p) => p.contratoId === contratoId);

  it("a parcela diz quem é a noiva: contrato.leadId e contrato.lead vêm na lista", async () => {
    const lista = await agent.get(`/api/lojas/${f.lojaId}/financeiro/parcelas`).expect(200);
    const parcela = minhas(lista.body)[0] as {
      contrato?: { leadId: string; lead?: { noivaNome: string } | null } | null;
    };
    expect(parcela.contrato?.leadId).toBeTruthy();
    expect(parcela.contrato?.lead?.noivaNome).toBe(leadNome);
  });

  it("de/ate recortam por vencimento, inclusivos nas duas pontas (dia local)", async () => {
    // Só o dia da parcela do meio: as outras duas ficam fora.
    const meio = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/parcelas?de=${dias[1]}&ate=${dias[1]}`)
      .expect(200);
    expect(minhas(meio.body).map((p: any) => diaLocal(new Date(p.vencimento)))).toEqual([dias[1]]);

    // Janela cobrindo as duas primeiras, inclusiva na ponta final.
    const duas = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/parcelas?de=${dias[0]}&ate=${dias[1]}`)
      .expect(200);
    expect(minhas(duas.body)).toHaveLength(2);

    // Sem janela, vem tudo — o comportamento antigo continua valendo.
    const tudo = await agent.get(`/api/lojas/${f.lojaId}/financeiro/parcelas`).expect(200);
    expect(minhas(tudo.body)).toHaveLength(3);
  });

  it("janela invertida é 400 INTERVALO_INVALIDO; formato errado é 400", async () => {
    const invertida = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/parcelas?de=${dias[1]}&ate=${dias[0]}`)
      .expect(400);
    expect(invertida.body.error).toBe("INTERVALO_INVALIDO");

    await agent.get(`/api/lojas/${f.lojaId}/financeiro/parcelas?de=hoje`).expect(400);
  });

  // E79: os recortes que cobrança e projeção usam no lugar da lista completa.
  // Roda por último de propósito — recebe parcelas e muda o status da fixture.
  it("status=abertas e recebidasDe recortam pela régua do E49", async () => {
    const tudo = await agent.get(`/api/lojas/${f.lojaId}/financeiro/parcelas`).expect(200);
    const [primeira, segunda] = minhas(tudo.body) as Array<{ id: string }>;

    // Quita a primeira e recebe metade da segunda: PAGA + PARCIAL + PREVISTA.
    const agora = new Date().toISOString();
    await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${primeira.id}/receber`)
      .send({ valorRecebido: 100, recebidoEm: agora, formaRecebimento: "PIX" })
      .expect(200);
    await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${segunda.id}/receber`)
      .send({ valorRecebido: 150, recebidoEm: agora, formaRecebimento: "DINHEIRO" })
      .expect(200);

    // Abertas: a PARCIAL segue na fila (ainda deve 250) — sumir seria perdoar.
    const abertas = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/parcelas?status=abertas`)
      .expect(200);
    const statusAbertas = minhas(abertas.body).map((p: any) => p.status).sort();
    expect(statusAbertas).toEqual(["PARCIAL", "PREVISTA"]);

    // Recebidas de hoje: a PAGA e a PARCIAL — a PREVISTA nunca viu dinheiro.
    const hoje = diaLocal(new Date());
    const recebidas = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/parcelas?recebidasDe=${hoje}`)
      .expect(200);
    expect(minhas(recebidas.body).map((p: any) => p.status).sort()).toEqual(["PAGA", "PARCIAL"]);

    // A partir de amanhã: ninguém recebeu no futuro.
    const amanha = diaLocal(dataFutura(1));
    const nada = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/parcelas?recebidasDe=${amanha}`)
      .expect(200);
    expect(minhas(nada.body)).toHaveLength(0);

    // Valor fora do enum é 400, como os irmãos.
    await agent.get(`/api/lojas/${f.lojaId}/financeiro/parcelas?status=pagas`).expect(400);
  });
});
