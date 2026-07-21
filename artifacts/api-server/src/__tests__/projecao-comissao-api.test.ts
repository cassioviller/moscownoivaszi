import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, comissaoRegrasTable, comissaoFaixasTable } from "@workspace/db";
import { randomUUID } from "node:crypto";
import {
  MIN_DIAS_PROJECAO,
  competenciaDe,
  limitesCompetencia,
} from "../lib/comissao";
import { criarFixture, criarLead, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * E51 — a projeção pela API. A matemática está provada em
 * `projecao-comissao-unit`; aqui se prova a LIGAÇÃO: que a projeção nasce das
 * vendas reais da competência, que passa pela escada da vendedora e que some
 * onde não faz sentido (mês passado).
 */

const COMPETENCIA_ATUAL = competenciaDe(new Date());
const DIA_DE_HOJE = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCDate();
/**
 * A projeção só existe a partir do dia `MIN_DIAS_PROJECAO` — é regra de
 * produto, não acaso do calendário. Rodar a suíte no dia 3 não deve reprovar
 * o que está certo, então estas asserções ficam de fora até lá.
 */
const cedoDemais = DIA_DE_HOJE < MIN_DIAS_PROJECAO;

describe("Projeção de comissão (E51)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);

    // Escada com dois degraus: é a troca de faixa entre o realizado e o
    // projetado que dá sentido ao épico.
    const regraId = randomUUID();
    await db.insert(comissaoRegrasTable).values({
      id: regraId,
      lojaId: f.lojaId,
      vendedoraId: f.superAdminId,
      vigenciaInicio: new Date("2020-01-01T12:00:00-03:00"),
      bonusAcumulaFaixas: false,
    });
    await db.insert(comissaoFaixasTable).values([
      { id: randomUUID(), lojaId: f.lojaId, regraId, minAcumulado: 0, maxAcumulado: 500_000, percentual: 3, bonusFixo: null },
      { id: randomUUID(), lojaId: f.lojaId, regraId, minAcumulado: 500_000, maxAcumulado: null, percentual: 6, bonusFixo: null },
    ]);

    // Uma venda no PRIMEIRO dia da competência corrente: dentro do mês, com
    // data estável (não depende da hora em que a suíte roda).
    const lead = await criarLead(f);
    const { inicio } = limitesCompetencia(COMPETENCIA_ATUAL);
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.superAdminId,
        valorTotal: 3000,
        fechadoEm: new Date(inicio.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      })
      .expect(201);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const minhaComissao = (competencia: string) =>
    agent.get(`/api/lojas/${f.lojaId}/minha-comissao?competencia=${competencia}`);

  it("competência passada não tem projeção — o total já é o total", async () => {
    const res = await minhaComissao("2020-01").expect(200);
    expect(res.body.projecao ?? null).toBeNull();
  });

  it.skipIf(cedoDemais)("a projeção sai das vendas reais e diz o tamanho do mês", async () => {
    const res = await minhaComissao(COMPETENCIA_ATUAL).expect(200);
    const { projecao, totalVendas } = res.body;

    expect(projecao).toBeTruthy();
    expect(projecao.diasDecorridos).toBe(DIA_DE_HOJE);
    expect(projecao.diasNoMes).toBe(
      Math.round(
        (limitesCompetencia(COMPETENCIA_ATUAL).fim.getTime() -
          limitesCompetencia(COMPETENCIA_ATUAL).inicio.getTime()) /
          86_400_000,
      ),
    );
    // O que já foi vendido é PISO da projeção: o mês não pode fechar com menos
    // do que já entrou.
    expect(projecao.baseProjetada).toBeGreaterThanOrEqual(totalVendas);
  });

  it.skipIf(cedoDemais)("o projetado passa pela MESMA escada — e pode mudar de faixa", async () => {
    const res = await minhaComissao(COMPETENCIA_ATUAL).expect(200);
    const { projecao, percentualAplicado, valorTotal } = res.body;

    // 3.000 vendidos ficam na faixa de 3%; esticados para o mês inteiro
    // passam de 5.000 e caem na de 6% — a menos que a suíte rode no fim do
    // mês, quando o ritmo já não estica o bastante. As duas leituras usam o
    // mesmo calcularComissao, e é isso que o teste fixa.
    expect(percentualAplicado).toBe(3);
    if (projecao.baseProjetada >= 5000) {
      expect(projecao.percentualProjetado).toBe(6);
      expect(projecao.valorTotalProjetado).toBeCloseTo(projecao.baseProjetada * 0.06, 2);
      expect(projecao.valorTotalProjetado).toBeGreaterThan(valorTotal);
    } else {
      expect(projecao.percentualProjetado).toBe(3);
    }
  });

  it.skipIf(cedoDemais)("o preview da gestão traz a mesma projeção", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/comissao/preview?competencia=${COMPETENCIA_ATUAL}`)
      .expect(200);

    const linha = res.body.find((l: { vendedoraId: string }) => l.vendedoraId === f.superAdminId);
    expect(linha).toBeTruthy();
    const minha = (await minhaComissao(COMPETENCIA_ATUAL)).body;
    // Ranking e extrato pessoal não podem discordar sobre o mesmo mês.
    expect(linha.projecao.valorTotalProjetado).toBe(minha.projecao.valorTotalProjetado);
    expect(linha.projecao.baseProjetada).toBe(minha.projecao.baseProjetada);
  });

  it("sem escada vigente não há projeção — não há como converter base em comissão", async () => {
    // A vendedora da fixture não tem regra; o campo some para ela.
    const outra = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const res = await outra.get(`/api/lojas/${f.lojaId}/minha-comissao?competencia=${COMPETENCIA_ATUAL}`).expect(200);
    expect(res.body.temRegra).toBe(false);
    expect(res.body.projecao ?? null).toBeNull();
  });
});
