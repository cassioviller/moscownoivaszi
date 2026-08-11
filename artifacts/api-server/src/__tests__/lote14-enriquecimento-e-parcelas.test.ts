import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, contratosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { diaDeNegocio } from "@workspace/financeiro-core";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

describe("Lote 14 — enriquecimento relacional, checklist e operações de parcela", () => {
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

  // Cada prova num horário distinto: atendimentos têm UNIQUE (loja, vendedora, inicio).
  let sequenciaProva = 0;

  async function criarProvaComAjuste() {
    const inicioProva = new Date(dataFutura(60).getTime() + sequenciaProva++ * 3_600_000);
    const lead = await criarLead(f, { casamentoData: dataFutura(90) });
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
      leadId: lead.id,
    });
    const cabine = await agent.post(`/api/lojas/${f.lojaId}/cabines`).send({ nome: `Cabine ${bloqueio.id.slice(0, 6)}` }).expect(201);
    const atendimento = await agent
      .post(`/api/lojas/${f.lojaId}/atendimentos`)
      .send({
        leadId: lead.id,
        cabineId: cabine.body.id,
        vendedoraId: f.vendedoraId,
        tipo: "PROVA",
        bloqueioId: bloqueio.id,
        inicio: inicioProva.toISOString(),
      })
      .expect(201);
    const ajuste = await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({ atendimentoId: atendimento.body.id, descricao: "Barra da saia" })
      .expect(201);
    return { lead, vestido, bloqueio, atendimento: atendimento.body, ajuste: ajuste.body };
  }

  it("GET /atendimentos devolve noiva, cabine, vendedora, vestido via bloqueio e ajustes com checklist", async () => {
    const { lead, vestido, atendimento, ajuste } = await criarProvaComAjuste();
    await agent
      .post(`/api/lojas/${f.lojaId}/ajustes/${ajuste.id}/checklist`)
      .send({ descricao: "Alinhavar" })
      .expect(201);

    const lista = await agent.get(`/api/lojas/${f.lojaId}/atendimentos`).expect(200);
    const item = lista.body.find((a: any) => a.id === atendimento.id);
    expect(item.lead.noivaNome).toBe(lead.noivaNome);
    expect(item.cabine.nome).toContain("Cabine");
    expect(item.vendedora.nome).toBeTruthy();
    expect(item.bloqueio.vestido.codigo).toBe(vestido.codigo);
    expect(item.ajustes[0].descricao).toBe("Barra da saia");
    expect(item.ajustes[0].checklist[0].descricao).toBe("Alinhavar");
  });

  it("GET /ajustes devolve a cadeia ajuste → atendimento → bloqueio → noiva/vestido + checklist", async () => {
    const { lead, vestido, ajuste } = await criarProvaComAjuste();
    const lista = await agent.get(`/api/lojas/${f.lojaId}/ajustes`).expect(200);
    const item = lista.body.find((a: any) => a.id === ajuste.id);
    expect(item.atendimento.lead.noivaNome).toBe(lead.noivaNome);
    expect(item.atendimento.bloqueio.vestido.nome).toBe(vestido.nome);
    expect(item.atendimento.bloqueio.casamentoData).toBeTruthy();
    expect(Array.isArray(item.checklist)).toBe(true);
  });

  it("GET /bloqueios devolve vestido e noiva; manutenção vem com lead null", async () => {
    const vestido = await criarVestido(f);
    const manutencao = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "MANUTENCAO",
      inicio: dataFutura(300),
      fim: dataFutura(302),
    });
    const lista = await agent.get(`/api/lojas/${f.lojaId}/bloqueios`).expect(200);
    const item = lista.body.find((b: any) => b.id === manutencao.id);
    expect(item.vestido.codigo).toBe(vestido.codigo);
    expect(item.lead).toBeNull();
  });

  it("checklist: cria com ordem incremental, alterna feito, remove; item de outra loja → 404", async () => {
    const { ajuste } = await criarProvaComAjuste();
    const i1 = await agent.post(`/api/lojas/${f.lojaId}/ajustes/${ajuste.id}/checklist`).send({ descricao: "Marcar barra" }).expect(201);
    const i2 = await agent.post(`/api/lojas/${f.lojaId}/ajustes/${ajuste.id}/checklist`).send({ descricao: "Costurar" }).expect(201);
    expect(i2.body.ordem).toBe(i1.body.ordem + 1);

    const feito = await agent.patch(`/api/lojas/${f.lojaId}/ajustes/checklist/${i1.body.id}`).send({ feito: true }).expect(200);
    expect(feito.body.feito).toBe(true);

    const outra = await criarFixture();
    try {
      const agentOutra = await loginComLoja(outra.vendedoraEmail, outra.lojaId);
      await agentOutra.patch(`/api/lojas/${outra.lojaId}/ajustes/checklist/${i1.body.id}`).send({ feito: false }).expect(404);
      await agentOutra.delete(`/api/lojas/${outra.lojaId}/ajustes/checklist/${i1.body.id}`).expect(404);
    } finally {
      await limparFixture(outra);
    }

    await agent.delete(`/api/lojas/${f.lojaId}/ajustes/checklist/${i1.body.id}`).expect(204);
    await agent.delete(`/api/lojas/${f.lojaId}/ajustes/checklist/${i1.body.id}`).expect(404);
  });

  it("gerar-plano: entrada numero 0, última parcela absorve o resto, 409 ao regenerar, 422 entrada maior", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 1000, fechadoEm: dataFutura(-10) });

    const plano = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({
        entrada: 100,
        numParcelas: 3,
        primeiroVencimento: dataFutura(10).toISOString(),
        vencimentoEntrada: dataFutura(0).toISOString(),
      })
      .expect(201);

    expect(plano.body).toHaveLength(4);
    expect(plano.body[0].numero).toBe(0);
    expect(plano.body[0].descricao).toBe("Entrada");
    expect(plano.body[0].valorPrevisto).toBe(100);
    // 900 / 3 = 300 exato; soma tem de bater com o total.
    const soma = plano.body.reduce((acc: number, p: any) => acc + p.valorPrevisto, 0);
    expect(soma).toBe(1000);
    // E95 mudou esta asserção de propósito — é a decisão do épico, não um
    // ajuste de teste. ANTES: a entrada era carimbada com `primeiroVencimento`
    // e a parcela 1 caía trinta dias corridos DEPOIS dela, então este bloco
    // afirmava `venc1 − venc0 === 30 dias`. O mesmo campo significava a entrada
    // aqui e a parcela 1 na tela, e o dia do vencimento andava para trás todo
    // mês. AGORA: a entrada tem data própria, `primeiroVencimento` é sempre a
    // parcela 1, e o dia se repete mês a mês (a âncora é 25/09/2027).
    expect(plano.body.map((p: any) => diaDeNegocio(new Date(p.vencimento)))).toEqual([
      "2027-09-15", // entrada, com data própria
      "2027-09-25",
      "2027-10-25",
      "2027-11-25",
    ]);

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 2, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(409);

    // E158: outra noiva, e não a mesma. O índice `contratos_lead_ativo_unico`
    // passou a proibir dois contratos ATIVOS para a mesma noiva — a fixture
    // montava exatamente o estado que a S-M3 mede como R$ 10.000,00 a receber
    // sobre uma venda de R$ 5.000,00. Este caso só quer um contrato de
    // R$ 50,00 para provar o 422 da entrada maior; a dona dele é indiferente.
    const outraNoiva = await criarLead(f);
    const outro = await criarContrato(f, { leadId: outraNoiva.id, valorTotal: 50, fechadoEm: dataFutura(-5) });
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${outro.id}/parcelas/gerar-plano`)
      .send({ entrada: 60, numParcelas: 1, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(422);
  });

  it("S-D13/S-D37: a lista de parcelas embute o recorte da noiva com o último contato — não o Lead inteiro", async () => {
    const lead = await criarLead(f, { whatsapp: "11988887777" });
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 300, fechadoEm: dataFutura(-10) });
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 3, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(201);

    // O módulo financeiro é da dona: a vendedora da fixture não o tem.
    const dona = await loginComLoja(f.superAdminEmail, f.lojaId);

    // Antes de qualquer contato: o recorte existe e o agregado é null.
    const antes = await dona.get(`/api/lojas/${f.lojaId}/financeiro/parcelas?status=abertas`).expect(200);
    const daNoiva = antes.body.filter((p: any) => p.contrato?.leadId === lead.id);
    expect(daNoiva).toHaveLength(3);
    expect(daNoiva[0].contrato.lead.noivaNome).toBe(lead.noivaNome);
    expect(daNoiva[0].contrato.lead.whatsapp).toBe("11988887777");
    expect(daNoiva[0].contrato.lead.ultimoContatoEm).toBeNull();
    // S-D37: o Lead inteiro ficou para trás — etapa, casamento, interesse não
    // viajam mais em cada parcela; a fila consome exatamente estes três.
    expect(Object.keys(daNoiva[0].contrato.lead).sort()).toEqual([
      "noivaNome",
      "ultimoContatoEm",
      "whatsapp",
    ]);

    // O contato registrado aparece no agregado da MESMA listagem — é o que
    // deixa a marca de "cobrada hoje" da fila sobreviver ao F5 (S-D13).
    const quando = new Date().toISOString();
    await dona
      .post(`/api/lojas/${f.lojaId}/leads/${lead.id}/cobrancas`)
      .send({ data: quando, canal: "WHATSAPP", observacao: "cobrança do teste S-D13" })
      .expect(201);
    const depois = await dona.get(`/api/lojas/${f.lojaId}/financeiro/parcelas?status=abertas`).expect(200);
    const linha = depois.body.find((p: any) => p.contrato?.leadId === lead.id);
    expect(new Date(linha.contrato.lead.ultimoContatoEm).toISOString()).toBe(quando);
  });

  it("gerar-plano sem divisão exata: última parcela absorve o resto (sem drift)", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 100, fechadoEm: dataFutura(-10) });
    const plano = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 3, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(201);
    expect(plano.body.map((p: any) => p.valorPrevisto)).toEqual([33.33, 33.33, 33.34]);
  });

  it("estornar parcela: PAGA volta a PREVISTA zerando recebimento; PREVISTA → 422", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 500, fechadoEm: dataFutura(-10) });
    const plano = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 2, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(201);
    const parcela = plano.body[0];

    await agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/estornar`).expect(422);

    await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/receber`)
      .send({ valorRecebido: 250, recebidoEm: dataFutura(11).toISOString(), formaRecebimento: "PIX" })
      .expect(200);

    const estornada = await agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/estornar`).expect(200);
    expect(estornada.body.status).toBe("PREVISTA");
    expect(estornada.body.valorRecebido).toBeNull();
    expect(estornada.body.recebidoEm).toBeNull();
    expect(estornada.body.formaRecebimento).toBeNull();
  });

  it("gerar-plano concorrente não dobra o plano (I6)", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 900, fechadoEm: dataFutura(-10) });
    const body = { numParcelas: 3, primeiroVencimento: dataFutura(10).toISOString() };

    // Dois POSTs ao mesmo tempo: antes, ambos liam "sem parcelas" e inseriam.
    // A unique (contrato, numero) faz o segundo colidir → 409.
    const [r1, r2] = await Promise.all([
      agent.post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`).send(body),
      agent.post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`).send(body),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);

    // O plano ficou com 3 parcelas, não 6 (detalhe do contrato é módulo leads).
    const detalhe = await agent.get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`).expect(200);
    expect(detalhe.body.parcelas).toHaveLength(3);
  });

  it("contrato cancelado bloqueia receber e estornar de parcela (I7)", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 500, fechadoEm: dataFutura(-10) });
    const plano = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 2, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(201);
    const p0 = plano.body[0];
    const p1 = plano.body[1];

    // Recebe a p0 (fica PAGA) e cancela o contrato direto no banco (isola o fix
    // da semântica do cancelamento).
    await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${p0.id}/receber`)
      .send({ valorRecebido: 250, recebidoEm: dataFutura(11).toISOString(), formaRecebimento: "PIX" })
      .expect(200);
    await db.update(contratosTable).set({ status: "CANCELADO" }).where(eq(contratosTable.id, contrato.id));

    // Estornar ressuscitaria uma cobrança de contrato morto; receber, idem.
    const est = await agent.post(`/api/lojas/${f.lojaId}/parcelas/${p0.id}/estornar`).expect(422);
    expect(est.body.error).toBe("CONTRATO_NAO_ATIVO");
    const rec = await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${p1.id}/receber`)
      .send({ valorRecebido: 250, recebidoEm: dataFutura(11).toISOString(), formaRecebimento: "PIX" })
      .expect(422);
    expect(rec.body.error).toBe("CONTRATO_NAO_ATIVO");
  });

  it("remover parcela: só PREVISTA (PAGA → 422); some da listagem", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 500, fechadoEm: dataFutura(-10) });
    const plano = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 2, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(201);
    const [p1, p2] = plano.body;

    await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${p1.id}/receber`)
      .send({ valorRecebido: 250, recebidoEm: dataFutura(11).toISOString() })
      .expect(200);
    await agent.delete(`/api/lojas/${f.lojaId}/parcelas/${p1.id}`).expect(422);

    await agent.delete(`/api/lojas/${f.lojaId}/parcelas/${p2.id}`).expect(204);
    // A8/E104: as parcelas vêm do GET do CONTRATO, que é de onde a tela as lê.
    // A rota dedicada foi removida — nunca esteve no spec, nunca teve hook, e
    // este era o seu único consumidor. Trocar por /financeiro/parcelas daria
    // 403: o agente deste arquivo é a vendedora, que não tem o módulo.
    const lista = await agent.get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`).expect(200);
    expect(lista.body.parcelas.find((p: any) => p.id === p2.id)).toBeUndefined();
  });

  it("cancelar contrato com destinoPago=manter preserva PAGAs; estornar cancela e zera as PAGAs", async () => {
    const lead = await criarLead(f);

    // manter (default): a PAGA fica intacta no caixa.
    const c1 = await criarContrato(f, { leadId: lead.id, valorTotal: 400, fechadoEm: dataFutura(-10) });
    const plano1 = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${c1.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 2, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${plano1.body[0].id}/receber`)
      .send({ valorRecebido: 200, recebidoEm: dataFutura(11).toISOString() })
      .expect(200);
    const cancel1 = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${c1.id}/cancelar`)
      .send({ motivo: "Desistiu", destinoPago: "manter" })
      .expect(200);
    const pagas1 = cancel1.body.parcelas.filter((p: any) => p.status === "PAGA");
    const canceladas1 = cancel1.body.parcelas.filter((p: any) => p.status === "CANCELADA");
    expect(pagas1).toHaveLength(1);
    expect(pagas1[0].valorRecebido).toBe(200);
    expect(canceladas1).toHaveLength(1);

    // estornar: a PAGA vira CANCELADA com recebimento zerado.
    const c2 = await criarContrato(f, { leadId: lead.id, valorTotal: 400, fechadoEm: dataFutura(-10) });
    const plano2 = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${c2.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 2, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${plano2.body[0].id}/receber`)
      .send({ valorRecebido: 200, recebidoEm: dataFutura(11).toISOString() })
      .expect(200);
    const cancel2 = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${c2.id}/cancelar`)
      .send({ motivo: "Devolvido", destinoPago: "estornar" })
      .expect(200);
    expect(cancel2.body.parcelas.every((p: any) => p.status === "CANCELADA")).toBe(true);
    expect(cancel2.body.parcelas.every((p: any) => p.valorRecebido === null)).toBe(true);
  });
});
