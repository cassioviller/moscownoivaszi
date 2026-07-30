import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, contasPagarTable } from "@workspace/db";
import {
  criarFixture,
  criarLead,
  criarContrato,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

// Datas literais ancoradas por competência (meio-dia São Paulo — offset fixo).
// Competências PASSADAS de propósito: só se fecha mês encerrado, e uma data
// absoluta no passado continua no passado por mais tempo que este código viva.
const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

describe("Lote 9 — comissão por vendedora (regras, preview e fechamento)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    // Escada da vendedora: 5k→5%, 10k→8% (aberta no topo).
    await agent
      .post(`/api/lojas/${f.lojaId}/comissao/regras`)
      .send({
        vendedoraId: f.vendedoraId,
        vigenciaInicio: dia("2020-01-01").toISOString(),
        faixas: [
          { minAcumulado: 5000, maxAcumulado: 10000, percentual: 5 },
          { minAcumulado: 10000, maxAcumulado: null, percentual: 8 },
        ],
      })
      .expect(201);
  });

  afterAll(async () => {
    await limparFixture(f);
  });

  it("GET regras devolve a escada aninhada e ordenada", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/comissao/regras`).expect(200);
    expect(res.body).toHaveLength(1);
    const regra = res.body[0];
    expect(regra.vendedoraId).toBe(f.vendedoraId);
    expect(regra.vendedoraNome).toBeTruthy();
    expect(regra.faixas.map((x: { minAcumulado: number }) => x.minAcumulado)).toEqual([5000, 10000]);
    expect(regra.faixas[1].maxAcumulado).toBeNull();
  });

  it("recusa escada incoerente com o motivo — 422, não 500", async () => {
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/regras`)
      .send({
        vendedoraId: f.vendedoraId,
        faixas: [
          { minAcumulado: 0, maxAcumulado: 5000, percentual: 3 },
          { minAcumulado: 4000, maxAcumulado: null, percentual: 8 },
        ],
      })
      .expect(422);
    expect(res.body.error).toBe("FAIXAS_INVALIDAS");
    expect(res.body.detalhe).toBe("sobreposicao");
  });

  it("omitir maxAcumulado é topo aberto, não erro", async () => {
    // Ausente e nulo dizem a mesma coisa: "sem teto". Tratar só o nulo mandava
    // undefined para a conversão de centavos e recusava a escada com o motivo
    // errado (intervalo_invalido).
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/regras`)
      .send({
        vendedoraId: f.vendedoraId,
        vigenciaInicio: dia("2022-01-01").toISOString(),
        faixas: [{ minAcumulado: 0, percentual: 5 }],
      })
      .expect(201);
    expect(res.body.faixas[0].maxAcumulado).toBeNull();
    await agent.delete(`/api/lojas/${f.lojaId}/comissao/regras/${res.body.id}`).expect(204);
  });

  it("recusa faixa que não paga nada, mesmo com os campos omitidos", async () => {
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/regras`)
      .send({
        vendedoraId: f.vendedoraId,
        vigenciaInicio: dia("2022-02-01").toISOString(),
        faixas: [{ minAcumulado: 0 }],
      })
      .expect(422);
    expect(res.body.detalhe).toBe("faixa_vazia");
  });

  it("recusa vendedora que não é da loja", async () => {
    const outra = await criarFixture();
    try {
      const res = await agent
        .post(`/api/lojas/${f.lojaId}/comissao/regras`)
        .send({
          vendedoraId: outra.vendedoraId,
          faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual: 5 }],
        })
        .expect(422);
      expect(res.body.error).toBe("VENDEDORA_INVALIDA");
    } finally {
      await limparFixture(outra);
    }
  });

  it("redefinir a mesma vigência substitui a escada inteira, sem duplicar", async () => {
    const vigencia = dia("2021-06-01").toISOString();
    const enviar = (percentual: number) =>
      agent
        .post(`/api/lojas/${f.lojaId}/comissao/regras`)
        .send({
          vendedoraId: f.vendedoraId,
          vigenciaInicio: vigencia,
          faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual }],
        })
        .expect(201);

    await enviar(4);
    const segunda = await enviar(9);
    expect(segunda.body.faixas).toHaveLength(1);
    expect(segunda.body.faixas[0].percentual).toBe(9);

    const regras = await agent.get(`/api/lojas/${f.lojaId}/comissao/regras`).expect(200);
    const naVigencia = regras.body.filter(
      (r: { vigenciaInicio: string }) => new Date(r.vigenciaInicio).toISOString() === vigencia,
    );
    expect(naVigencia).toHaveLength(1);

    await agent.delete(`/api/lojas/${f.lojaId}/comissao/regras/${segunda.body.id}`).expect(204);
  });

  it("preview mostra o mês ao vivo e o quanto falta para o próximo degrau", async () => {
    const lead = await criarLead(f);
    await criarContrato(f, { leadId: lead.id, valorTotal: 6000, fechadoEm: dia("2025-02-10") });

    const res = await agent
      .get(`/api/lojas/${f.lojaId}/comissao/preview`)
      .query({ competencia: "2025-02" })
      .expect(200);

    expect(res.body).toHaveLength(1);
    const linha = res.body[0];
    expect(linha.totalVendas).toBe(6000);
    expect(linha.percentualAplicado).toBe(5);
    expect(linha.valorTotal).toBe(300);
    // Está na faixa dos 5k; faltam 4k para a de 8%.
    expect(linha.faltaProximoDegrau).toBe(4000);
  });

  it("fechamento aplica a faixa ao total e gera a conta a pagar vinculada", async () => {
    const lead1 = await criarLead(f);
    const lead2 = await criarLead(f);
    // 3000 + 7000 = 10000 em 2025-03 → faixa de 8% sobre o TOTAL = 800.
    await criarContrato(f, { leadId: lead1.id, valorTotal: 3000, fechadoEm: dia("2025-03-05") });
    await criarContrato(f, { leadId: lead2.id, valorTotal: 7000, fechadoEm: dia("2025-03-20") });

    const res = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2025-03" })
      .expect(201);

    expect(res.body).toHaveLength(1);
    const fechamento = res.body[0];
    expect(fechamento.vendedoraId).toBe(f.vendedoraId);
    expect(fechamento.totalVendas).toBe(10000);
    expect(fechamento.percentualAplicado).toBe(8);
    expect(fechamento.valorComissao).toBe(800);
    expect(fechamento.valorBonus).toBe(0);
    expect(fechamento.valorTotal).toBe(800);
    expect(fechamento.contaPagarId).toBeTruthy();

    const [conta] = await db
      .select()
      .from(contasPagarTable)
      .where(eq(contasPagarTable.id, fechamento.contaPagarId));
    expect(conta.tipo).toBe("COMISSAO");
    expect(conta.valorPrevisto).toBe(800);
    expect(conta.competencia).toBe("2025-03");
    expect(conta.colaboradorId).toBe(f.vendedoraId);
    expect(conta.origemComissaoFechamentoId).toBe(fechamento.id);
    // Vencimento: dia 5 do mês seguinte.
    expect(conta.vencimento.toISOString()).toBe("2025-04-05T15:00:00.000Z");
  });

  it("regra sem vigência explícita vale do próximo mês, não retroage (I9)", async () => {
    // A tela não envia vigenciaInicio. Antes, o default era "agora" e a escada
    // reprecificava o mês corrente. Agora nasce no 1º dia do mês seguinte.
    const nova = await criarFixture();
    try {
      const ag = await loginComLoja(nova.superAdminEmail, nova.lojaId);
      const res = await ag
        .post(`/api/lojas/${nova.lojaId}/comissao/regras`)
        .send({ vendedoraId: nova.vendedoraId, faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual: 5 }] })
        .expect(201);

      const vig = new Date(res.body.vigenciaInicio);
      // É um primeiro-dia-de-mês e está no futuro (não pega o mês corrente).
      expect(vig.getTime()).toBeGreaterThan(Date.now());
      expect(vig.toISOString().slice(8, 10)).toBe("01");
    } finally {
      await limparFixture(nova);
    }
  });

  it("fechar concorrente devolve 409, não 500, e paga uma vez só (I8)", async () => {
    const lead = await criarLead(f);
    await criarContrato(f, { leadId: lead.id, valorTotal: 6000, fechadoEm: dia("2025-12-10") });

    // Dois fechamentos ao mesmo tempo: a unique protege o dinheiro (2ª faz
    // rollback), mas a violação vinha embrulhada e escapava como 500.
    const [r1, r2] = await Promise.all([
      agent.post(`/api/lojas/${f.lojaId}/comissao/fechamentos`).send({ competencia: "2025-12" }),
      agent.post(`/api/lojas/${f.lojaId}/comissao/fechamentos`).send({ competencia: "2025-12" }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const oResultado409 = r1.status === 409 ? r1 : r2;
    expect(oResultado409.body.error).toBe("COMPETENCIA_JA_FECHADA");

    // Uma conta de comissão só — ninguém foi pago em dobro.
    const contas = await db
      .select()
      .from(contasPagarTable)
      .where(and(eq(contasPagarTable.lojaId, f.lojaId), eq(contasPagarTable.competencia, "2025-12")));
    expect(contas).toHaveLength(1);
  });

  it("refechar a competência é idempotente: 409 e nada é regravado", async () => {
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2025-03" })
      .expect(409);
    expect(res.body.error).toBe("COMPETENCIA_JA_FECHADA");

    const contas = await db
      .select()
      .from(contasPagarTable)
      .where(and(eq(contasPagarTable.lojaId, f.lojaId), eq(contasPagarTable.competencia, "2025-03")));
    expect(contas).toHaveLength(1);
  });

  it("contrato cancelado antes de fechar nunca entra na base", async () => {
    // A base só soma ATIVO: um cancelamento no mês aberto some sozinho, sem
    // precisar de estorno.
    const lead = await criarLead(f);
    await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 9000,
      fechadoEm: dia("2025-05-10"),
      canceladoEm: dia("2025-05-20"),
    });

    const res = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2025-05" })
      .expect(422);
    expect(res.body.error).toBe("SEM_MOVIMENTO");
  });

  it("estorno §6.4: cancelar venda de mês já fechado abate o mês seguinte", async () => {
    const leadA = await criarLead(f);
    const leadB = await criarLead(f);
    // A: vendido e FECHADO em 2025-06 (a comissão já foi paga lá).
    const contratoA = await criarContrato(f, {
      leadId: leadA.id,
      valorTotal: 12000,
      fechadoEm: dia("2025-06-10"),
    });

    const junho = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2025-06" })
      .expect(201);
    expect(junho.body[0].valorTotal).toBe(960); // 12000 × 8%

    // Agora A é cancelado. A comissão de junho já saiu: o dinheiro volta
    // abatendo julho.
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoA.id}/cancelar`)
      .send({ motivo: "Desistência" })
      .expect(200);

    // Julho vende 14000; 14000 − 12000 = 2000 → abaixo da menor faixa → 0.
    await criarContrato(f, { leadId: leadB.id, valorTotal: 14000, fechadoEm: dia("2025-07-15") });

    const previa = await agent
      .get(`/api/lojas/${f.lojaId}/comissao/preview`)
      .query({ competencia: "2025-07" })
      .expect(200);
    expect(previa.body[0].estornoPendente).toBe(12000);
    expect(previa.body[0].totalVendas).toBe(2000);
    expect(previa.body[0].valorTotal).toBe(0);

    const julho = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2025-07" })
      .expect(201);
    expect(julho.body[0].totalVendas).toBe(2000);
    expect(julho.body[0].valorTotal).toBe(0);
    expect(julho.body[0].contaPagarId).toBeNull();

    // Absorvido (net ≥ 0) → o estorno foi reconciliado e não cobra de novo.
    const agosto = await agent
      .get(`/api/lojas/${f.lojaId}/comissao/preview`)
      .query({ competencia: "2025-08" })
      .expect(200);
    expect(agosto.body).toEqual([]);
  });

  /**
   * E102/C5 — ESTE TESTE MUDOU DE ASSERÇÃO, e a mudança é a decisão do dono
   * (2026-07-25), não um ajuste de conveniência.
   *
   * ANTES ele se chamava "estorno maior que o mês CARREGA" e afirmava que
   * novembro ainda via os **20.000 cheios** depois de outubro ter zerado. Isso
   * era o defeito: outubro consumiu a base dele (5.000 de venda viraram
   * comissão zero) e o estorno voltou inteiro, então o mesmo dinheiro era
   * descontado duas, três vezes. No caso medido pela trilha C a vendedora
   * recebia R$ 500 em vez de R$ 1.800.
   *
   * AGORA o mês absorve `min(bruto, pendente)` e carrega só o resto.
   */
  it("estorno maior que o mês é absorvido em PARTE — o resto carrega, sem descontar duas vezes", async () => {
    const outra = await criarFixture();
    try {
      const ag = await loginComLoja(outra.superAdminEmail, outra.lojaId);
      await ag
        .post(`/api/lojas/${outra.lojaId}/comissao/regras`)
        .send({
          vendedoraId: outra.vendedoraId,
          vigenciaInicio: dia("2020-01-01").toISOString(),
          faixas: [{ minAcumulado: 1000, maxAcumulado: null, percentual: 10 }],
        })
        .expect(201);

      const leadA = await criarLead(outra);
      const contratoA = await criarContrato(outra, {
        leadId: leadA.id,
        valorTotal: 20000,
        fechadoEm: dia("2025-09-10"),
      });
      await ag
        .post(`/api/lojas/${outra.lojaId}/comissao/fechamentos`)
        .send({ competencia: "2025-09" })
        .expect(201);

      await ag
        .post(`/api/lojas/${outra.lojaId}/contratos/${contratoA.id}/cancelar`)
        .send({ motivo: "Desistência" })
        .expect(200);

      // Outubro vende só 5000 contra um estorno de 20000 → net −15000.
      const leadB = await criarLead(outra);
      await criarContrato(outra, { leadId: leadB.id, valorTotal: 5000, fechadoEm: dia("2025-10-15") });
      const outubro = await ag
        .post(`/api/lojas/${outra.lojaId}/comissao/fechamentos`)
        .send({ competencia: "2025-10" })
        .expect(201);
      // Outubro absorve os 5.000 que tinha e zera a própria comissão.
      expect(outubro.body[0].totalVendas).toBe(0);
      expect(outubro.body[0].valorTotal).toBe(0);
      expect(outubro.body[0].estornoAbsorvido).toBe(5000);

      // E novembro vê 15.000, não 20.000: o que outubro pagou não volta a
      // pesar. Era exatamente aqui que o mesmo dinheiro era cobrado de novo.
      const leadC = await criarLead(outra);
      await criarContrato(outra, { leadId: leadC.id, valorTotal: 8000, fechadoEm: dia("2025-11-15") });
      const novembro = await ag
        .get(`/api/lojas/${outra.lojaId}/comissao/preview`)
        .query({ competencia: "2025-11" })
        .expect(200);
      expect(novembro.body[0].estornoPendente).toBe(15000);

      // Fechando novembro, ele absorve os 8.000 dele e sobram 7.000.
      const nov = await ag
        .post(`/api/lojas/${outra.lojaId}/comissao/fechamentos`)
        .send({ competencia: "2025-11" })
        .expect(201);
      expect(nov.body[0].estornoAbsorvido).toBe(8000);

      const leadD = await criarLead(outra);
      await criarContrato(outra, { leadId: leadD.id, valorTotal: 30000, fechadoEm: dia("2025-12-15") });
      const dezembro = await ag
        .get(`/api/lojas/${outra.lojaId}/comissao/preview`)
        .query({ competencia: "2025-12" })
        .expect(200);
      expect(dezembro.body[0].estornoPendente).toBe(7000);
      // 5.000 + 8.000 + 7.000 = 20.000: o estorno foi cobrado UMA vez.
    } finally {
      await limparFixture(outra);
    }
  });

  it("a regra usada é a VIGENTE naquele mês, não a de hoje", async () => {
    const outra = await criarFixture();
    try {
      const ag = await loginComLoja(outra.superAdminEmail, outra.lojaId);
      // Até 2025-04 a vendedora ganhava 2%; de 2025-05 em diante, 10%.
      await ag.post(`/api/lojas/${outra.lojaId}/comissao/regras`).send({
        vendedoraId: outra.vendedoraId,
        vigenciaInicio: dia("2020-01-01").toISOString(),
        faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual: 2 }],
      }).expect(201);
      await ag.post(`/api/lojas/${outra.lojaId}/comissao/regras`).send({
        vendedoraId: outra.vendedoraId,
        vigenciaInicio: dia("2025-05-01").toISOString(),
        faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual: 10 }],
      }).expect(201);

      const leadVelho = await criarLead(outra);
      await criarContrato(outra, { leadId: leadVelho.id, valorTotal: 10000, fechadoEm: dia("2025-04-10") });
      const abril = await ag
        .post(`/api/lojas/${outra.lojaId}/comissao/fechamentos`)
        .send({ competencia: "2025-04" })
        .expect(201);
      // Fechar abril hoje ainda paga os 2% que valiam em abril.
      expect(abril.body[0].percentualAplicado).toBe(2);
      expect(abril.body[0].valorTotal).toBe(200);

      const leadNovo = await criarLead(outra);
      await criarContrato(outra, { leadId: leadNovo.id, valorTotal: 10000, fechadoEm: dia("2025-06-10") });
      const junho = await ag
        .post(`/api/lojas/${outra.lojaId}/comissao/fechamentos`)
        .send({ competencia: "2025-06" })
        .expect(201);
      expect(junho.body[0].percentualAplicado).toBe(10);
      expect(junho.body[0].valorTotal).toBe(1000);
    } finally {
      await limparFixture(outra);
    }
  });

  it("bônus por degrau entra no total e vira conta a pagar", async () => {
    const outra = await criarFixture();
    try {
      const ag = await loginComLoja(outra.superAdminEmail, outra.lojaId);
      await ag.post(`/api/lojas/${outra.lojaId}/comissao/regras`).send({
        vendedoraId: outra.vendedoraId,
        vigenciaInicio: dia("2020-01-01").toISOString(),
        bonusAcumulaFaixas: true,
        faixas: [
          { minAcumulado: 1000, maxAcumulado: 5000, percentual: 2, bonusFixo: 100 },
          { minAcumulado: 5000, maxAcumulado: null, percentual: 4, bonusFixo: 300 },
        ],
      }).expect(201);

      const lead = await criarLead(outra);
      await criarContrato(outra, { leadId: lead.id, valorTotal: 6000, fechadoEm: dia("2025-03-10") });
      const res = await ag
        .post(`/api/lojas/${outra.lojaId}/comissao/fechamentos`)
        .send({ competencia: "2025-03" })
        .expect(201);

      // 6000 × 4% = 240; bônus acumulados = 100 + 300 = 400.
      expect(res.body[0].valorComissao).toBe(240);
      expect(res.body[0].valorBonus).toBe(400);
      expect(res.body[0].valorTotal).toBe(640);

      const [conta] = await db
        .select()
        .from(contasPagarTable)
        .where(eq(contasPagarTable.id, res.body[0].contaPagarId));
      expect(conta.valorPrevisto).toBe(640);
    } finally {
      await limparFixture(outra);
    }
  });

  it("vendedora sem regra aparece no preview com zero — não some da lista", async () => {
    const outra = await criarFixture();
    try {
      const ag = await loginComLoja(outra.superAdminEmail, outra.lojaId);
      const lead = await criarLead(outra);
      await criarContrato(outra, { leadId: lead.id, valorTotal: 9000, fechadoEm: dia("2025-02-10") });

      const res = await ag
        .get(`/api/lojas/${outra.lojaId}/comissao/preview`)
        .query({ competencia: "2025-02" })
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].totalVendas).toBe(9000);
      expect(res.body[0].percentualAplicado).toBeNull();
      expect(res.body[0].valorTotal).toBe(0);
    } finally {
      await limparFixture(outra);
    }
  });

  it("vendedora que PAROU de vender ainda aparece com o estorno pendente", async () => {
    // O buraco: o preview listava as vendedoras a partir das VENDAS do mês, e
    // quem parou de vender sumia levando o estorno junto — a loja nunca saberia
    // que aquele dinheiro não voltou.
    const outra = await criarFixture();
    try {
      const ag = await loginComLoja(outra.superAdminEmail, outra.lojaId);
      await ag.post(`/api/lojas/${outra.lojaId}/comissao/regras`).send({
        vendedoraId: outra.vendedoraId,
        vigenciaInicio: dia("2020-01-01").toISOString(),
        faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual: 10 }],
      }).expect(201);

      const lead = await criarLead(outra);
      const contrato = await criarContrato(outra, {
        leadId: lead.id,
        valorTotal: 10000,
        fechadoEm: dia("2025-06-10"),
      });
      await ag
        .post(`/api/lojas/${outra.lojaId}/comissao/fechamentos`)
        .send({ competencia: "2025-06" })
        .expect(201);

      await ag
        .post(`/api/lojas/${outra.lojaId}/contratos/${contrato.id}/cancelar`)
        .send({ motivo: "Desistência" })
        .expect(200);

      // Julho: nenhuma venda dela. Antes, a lista vinha vazia.
      const julho = await ag
        .get(`/api/lojas/${outra.lojaId}/comissao/preview`)
        .query({ competencia: "2025-07" })
        .expect(200);
      expect(julho.body).toHaveLength(1);
      expect(julho.body[0].vendedoraId).toBe(outra.vendedoraId);
      expect(julho.body[0].estornoPendente).toBe(10000);
      expect(julho.body[0].totalVendas).toBe(0);
      expect(julho.body[0].valorTotal).toBe(0);
    } finally {
      await limparFixture(outra);
    }
  });

  it("cancelamento de mês NUNCA fechado não vira estorno visível", async () => {
    // Ela entra como candidata (cancelou e não reconciliou), mas a comissão
    // daquele mês jamais foi paga: não há o que estornar, e mostrá-la zerada
    // seria ruído.
    const outra = await criarFixture();
    try {
      const ag = await loginComLoja(outra.superAdminEmail, outra.lojaId);
      const lead = await criarLead(outra);
      const contrato = await criarContrato(outra, {
        leadId: lead.id,
        valorTotal: 8000,
        fechadoEm: dia("2025-06-10"),
      });
      // Cancela SEM nunca ter fechado junho.
      await ag
        .post(`/api/lojas/${outra.lojaId}/contratos/${contrato.id}/cancelar`)
        .send({ motivo: "Desistência" })
        .expect(200);

      const julho = await ag
        .get(`/api/lojas/${outra.lojaId}/comissao/preview`)
        .query({ competencia: "2025-07" })
        .expect(200);
      expect(julho.body).toEqual([]);
    } finally {
      await limparFixture(outra);
    }
  });

  it("competência corrente não fecha — o mês ainda pode vender", async () => {
    const agora = new Date();
    const corrente = `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: corrente })
      .expect(422);
    expect(res.body.error).toBe("COMPETENCIA_CORRENTE");
  });

  it("competência sem movimento → 422", async () => {
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2024-01" })
      .expect(422);
    expect(res.body.error).toBe("SEM_MOVIMENTO");
  });
});

/**
 * E102/C7 — a escada de comissão é POR MÊS, e o sistema recusa o meio dele.
 *
 * **Decisão do dono em 2026-07-25.** A vigência sempre foi resolvida por
 * competência inteira: uma escada criada dia 20 reprecificava os 19 dias
 * anteriores, e o preview saltava de R$ 2.000 para R$ 6.400 no instante em que
 * ela era salva. O docstring prometia "a regra que valia naquele mês" e o único
 * teste usava virada de mês — **o caso do meio do mês nunca foi exercitado**,
 * que é por que ninguém tinha visto.
 */
describe("E102/C7 — a vigência tem granularidade de MÊS", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("vigência no meio do mês é recusada, dizendo qual data usar", async () => {
    const ag = await loginComLoja(f.superAdminEmail, f.lojaId);
    const r = await ag
      .post(`/api/lojas/${f.lojaId}/comissao/regras`)
      .send({
        vendedoraId: f.vendedoraId,
        vigenciaInicio: dia("2025-06-20").toISOString(),
        faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual: 10 }],
      })
      .expect(422);

    expect(r.body.error).toBe("VIGENCIA_FORA_DA_COMPETENCIA");
    expect(r.body.campos[0].campo).toBe("vigenciaInicio");
    expect(r.body.campos[0].motivo).toContain("2025-06");
  });

  it("o primeiro dia passa, em qualquer hora do dia", async () => {
    const ag = await loginComLoja(f.superAdminEmail, f.lojaId);
    // `dia()` ancora ao meio-dia SP; `limitesCompetencia` à meia-noite. São o
    // mesmo primeiro dia — comparar o instante reprovaria um deles.
    await ag
      .post(`/api/lojas/${f.lojaId}/comissao/regras`)
      .send({
        vendedoraId: f.vendedoraId,
        vigenciaInicio: dia("2025-07-01").toISOString(),
        faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual: 10 }],
      })
      .expect(201);
  });

  it("o último dia do mês também é recusado — não é começo de nada", async () => {
    const ag = await loginComLoja(f.superAdminEmail, f.lojaId);
    await ag
      .post(`/api/lojas/${f.lojaId}/comissao/regras`)
      .send({
        vendedoraId: f.vendedoraId,
        vigenciaInicio: dia("2025-08-31").toISOString(),
        faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual: 10 }],
      })
      .expect(422);
  });
});
