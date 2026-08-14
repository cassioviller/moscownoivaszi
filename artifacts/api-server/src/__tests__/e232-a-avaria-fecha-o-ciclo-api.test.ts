import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRAZO_DA_COBRANCA_DE_REPARO_DIAS, diaDeNegocio, addDias, hojeLocal } from "@workspace/financeiro-core";
import { db, contratoBloqueiosTable, parcelasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

/**
 * **E232 — a avaria fecha o ciclo** (Bloco 4 da proposta de 14/08).
 *
 * - **S-C1 · 5ª §3º** — o dano constatado NA ENTREGA não tinha onde existir: o
 *   sistema só conhecia avaria na devolução, e a cláusula manda a LOCADORA
 *   substituir a peça quando o defeito é visto no ato da locação. Sem o
 *   registro, a noiva pagava pelo dano que recebeu pronto. Nasce
 *   `constatadaEm: ENTREGA | DEVOLUCAO` (default DEVOLUCAO — o caminho de
 *   sempre não muda), e **cobrar dano de entrega é 422**: a porta não deixa a
 *   5ª §3º virar carnê da noiva.
 * - **S-C98** — o prazo dos 7 dias era `?? 7` cru em dois sítios; vira a
 *   constante nomeada `PRAZO_DA_COBRANCA_DE_REPARO_DIAS` (número sem nome é
 *   invisível para a régua — S-C95), que a tela passa a oferecer.
 */
describe("E232 — a avaria fecha o ciclo", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  async function cenaComContrato() {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      leadId: lead.id,
      casamentoData: dataFutura(60),
    });
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 3000, fechadoEm: new Date() });
    await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });
    return { lead, bloqueio, contrato };
  }

  const registrar = (bloqueioId: string, body: Record<string, unknown>) =>
    agent.post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueioId}/avarias`).send({
      descricao: "Renda solta na cauda",
      tipo: "DANO",
      custoReparo: 400,
      ...body,
    });

  describe("S-C1 — o dano da entrega existe, e não vira carnê", () => {
    it("a avaria nasce dizendo ONDE foi constatada — e o default é a devolução", async () => {
      const { bloqueio } = await cenaComContrato();

      const semDizer = await registrar(bloqueio.id, {});
      expect(semDizer.status, JSON.stringify(semDizer.body)).toBe(201);
      expect(semDizer.body).toHaveProperty("constatadaEm");
      expect(semDizer.body.constatadaEm).toBe("DEVOLUCAO");

      const naEntrega = await registrar(bloqueio.id, { constatadaEm: "ENTREGA" });
      expect(naEntrega.status, JSON.stringify(naEntrega.body)).toBe(201);
      expect(naEntrega.body.constatadaEm).toBe("ENTREGA");
    });

    it("cobrar o dano da ENTREGA é 422 — a 5ª §3º manda a loja substituir, não a noiva pagar", async () => {
      const { bloqueio, contrato } = await cenaComContrato();
      const avaria = await registrar(bloqueio.id, { constatadaEm: "ENTREGA" });
      expect(avaria.status).toBe(201);

      const r = await agent
        .post(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}/cobrar`)
        .send({ contratoId: contrato.id });

      expect(r.status, JSON.stringify(r.body)).toBe(422);
      expect(r.body.error).toBe("DANO_DA_ENTREGA");
      expect(r.body.detalhe).toMatch(/5ª/);
    });

    it("a da DEVOLUÇÃO segue cobrável como sempre — o caminho comum não muda", async () => {
      const { bloqueio, contrato } = await cenaComContrato();
      const avaria = await registrar(bloqueio.id, {});
      const r = await agent
        .post(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}/cobrar`)
        .send({ contratoId: contrato.id });
      // 201: a cobrança CRIA a parcela — e a resposta é a avaria relida.
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.parcelaId).toBeTruthy();
    });
  });

  describe("S-C98 — o prazo da cobrança tem NOME, e a porta o pratica", () => {
    it("sem prazo no corpo, o vencimento é a constante — não um 7 cru", async () => {
      const { bloqueio, contrato } = await cenaComContrato();
      const avaria = await registrar(bloqueio.id, {});
      const r = await agent
        .post(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}/cobrar`)
        .send({ contratoId: contrato.id })
        .expect(201);

      const [parcela] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, r.body.parcelaId));
      expect(diaDeNegocio(parcela!.vencimento)).toBe(
        addDias(hojeLocal(), PRAZO_DA_COBRANCA_DE_REPARO_DIAS),
      );
    });

    it("com prazo escolhido, vale o escolhido — a tela agora tem onde escolher", async () => {
      const { bloqueio, contrato } = await cenaComContrato();
      const avaria = await registrar(bloqueio.id, {});
      const r = await agent
        .post(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}/cobrar`)
        .send({ contratoId: contrato.id, prazoDias: 15 })
        .expect(201);

      const [parcela] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, r.body.parcelaId));
      expect(diaDeNegocio(parcela!.vencimento)).toBe(addDias(hojeLocal(), 15));
    });
  });
});
