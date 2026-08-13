import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, regraDisponibilidadeTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **E222 — as portas que gravam retirada e devolução conhecem o expediente**
 * (cláusula 4ª do instrumento de locação).
 *
 * Antes deste épico as duas datas eram gravadas **como vieram**
 * (`routes/contratos.ts:845`): o sistema aceitava **retirada num domingo às
 * 23h** sem uma palavra. Não era contradição com o horário que já existia — o
 * de lá governa ATENDIMENTO (provas, sete dias até as 20h, vindo do caderno pela
 * S-A8 e certo para provas). São dois expedientes, e o modelo conhecia um.
 *
 * As datas continuam **opcionais**, e é decisão medida: 723 contratos no banco,
 * **1** com data de retirada e **nenhum** com data de devolução.
 */
describe("E222 — o expediente de retirada nas portas", () => {
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

  // 2026-08-11 é terça; 15 é sábado; 16, domingo. O offset -03:00 é de
  // propósito: o expediente é do ateliê, e a hora só existe num fuso — lido em
  // UTC, um sábado às 18h vira 21h e cai fora sem que ninguém entenda por quê.
  const terca = (hhmm: string) => `2026-08-11T${hhmm}:00-03:00`;
  const sabado = (hhmm: string) => `2026-08-15T${hhmm}:00-03:00`;
  const domingo = (hhmm: string) => `2026-08-16T${hhmm}:00-03:00`;

  /** Fecha um contrato para uma noiva nova e devolve a resposta crua. */
  async function fechar(body: Record<string, unknown> = {}) {
    const lead = await criarLead(f);
    return await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: f.vendedoraId, valorTotal: 5000, ...body });
  }

  const regras = (body: Record<string, unknown>) =>
    agent.put(`/api/lojas/${f.lojaId}/disponibilidade/regras`).send(body);

  describe("POST /contratos — o fecho", () => {
    it("**retirada num domingo às 23h é recusada — o caso que passava calado**", async () => {
      const r = await fechar({ dataRetirada: domingo("23:00") });
      expect(r.status).toBe(422);
      expect(r.body.error).toBe("RETIRADA_FORA_DO_EXPEDIENTE");
      // O recado cita o expediente por extenso: quem lê é a vendedora com a
      // noiva na frente, e um código não diz a que horas voltar.
      expect(r.body.detalhe).toContain("domingo");
      expect(r.body.detalhe).toContain("terça a sexta, das 10:30 às 19:00");
      expect(r.body.detalhe).toContain("cláusula 4ª");
      expect(r.body.campos[0].campo).toBe("dataRetirada");
    });

    it("a devolução tem a sua recusa, e diz o campo dela", async () => {
      const r = await fechar({ dataRetirada: terca("11:00"), dataDevolucao: domingo("11:00") });
      expect(r.status).toBe(422);
      expect(r.body.error).toBe("DEVOLUCAO_FORA_DO_EXPEDIENTE");
      expect(r.body.campos[0].campo).toBe("dataDevolucao");
    });

    it("sábado às 18:30 é recusado, e a mesma hora numa terça passa", async () => {
      const fora = await fechar({ dataRetirada: sabado("18:30") });
      expect(fora.status).toBe(422);
      expect(fora.body.detalhe).toContain("10:30 às 18:00");
      expect((await fechar({ dataRetirada: terca("18:30") })).status).toBe(201);
    });

    it("as duas dentro do expediente fecham o contrato", async () => {
      const r = await fechar({ dataRetirada: terca("10:30"), dataDevolucao: sabado("18:00") });
      expect(r.status).toBe(201);
      expect(r.body.dataRetirada).toBeTruthy();
    });

    it("**contrato sem as datas continua fechando** — elas são opcionais", async () => {
      expect((await fechar()).status).toBe(201);
    });
  });

  describe("PATCH /contratos/:id — a porta ao lado, que o meio conserto deixaria aberta", () => {
    it("corrigir a retirada para um domingo é recusado", async () => {
      const criado = await fechar({ dataRetirada: terca("11:00") });
      expect(criado.status).toBe(201);
      const r = await agent
        .patch(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}`)
        .send({ dataRetirada: domingo("11:00") });
      expect(r.status).toBe(422);
      expect(r.body.error).toBe("RETIRADA_FORA_DO_EXPEDIENTE");
    });

    it("e corrigir para dentro do expediente grava", async () => {
      const criado = await fechar({ dataRetirada: terca("11:00") });
      expect(criado.status).toBe(201);
      await agent
        .patch(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}`)
        .send({ dataRetirada: sabado("17:00") })
        .expect(200);
    });
  });

  describe("o expediente é da LOJA, e a régua o segue", () => {
    it("**loja SEM linha de regra recebe o do papel** — régua ausente não vira régua que aceita tudo", async () => {
      const [antes] = await db
        .select()
        .from(regraDisponibilidadeTable)
        .where(eq(regraDisponibilidadeTable.lojaId, f.lojaId));
      expect(antes).toBeUndefined();
      expect((await fechar({ dataRetirada: domingo("11:00") })).status).toBe(422);
    });

    it("a linha nasce com o expediente do papel, sem ninguém digitar hora nenhuma", async () => {
      await regras({ provaDiasAntes: 14 }).expect(200);
      const [regra] = await db
        .select()
        .from(regraDisponibilidadeTable)
        .where(eq(regraDisponibilidadeTable.lojaId, f.lojaId));
      expect(regra?.retiradaAberturaMinutos).toBe(630);
      expect(regra?.retiradaFechamentoMinutos).toBe(1140);
      expect(regra?.retiradaFechamentoSabadoMinutos).toBe(1080);
      expect(regra?.retiradaDias).toEqual([2, 3, 4, 5, 6]);
    });

    it("a loja que abre domingo passa a aceitar domingo", async () => {
      await regras({ retiradaDias: [0, 2, 3, 4, 5, 6] }).expect(200);
      expect((await fechar({ dataRetirada: domingo("11:00") })).status).toBe(201);

      // E volta ao do contrato, para não contaminar os testes seguintes.
      await regras({ retiradaDias: [2, 3, 4, 5, 6] }).expect(200);
      expect((await fechar({ dataRetirada: domingo("11:00") })).status).toBe(422);
    });
  });

  describe("PUT /disponibilidade/regras — as duas paredes do expediente novo", () => {
    it("fechamento antes da abertura é recusado, e o recado mostra as duas horas", async () => {
      const r = await regras({ retiradaAberturaMinutos: 1200 });
      expect(r.status).toBe(422);
      expect(r.body.error).toBe("HORARIO_DE_RETIRADA_INVALIDO");
      expect(r.body.detalhe).toContain("20:00");
    });

    it("**a parede vale para o SÁBADO também** — 18:30 de abertura passaria pela outra", async () => {
      // 1110 = 18:30: depois do fechamento do sábado (18:00) e antes do de
      // terça (19:00). Conferir só o fechamento longo deixaria o sábado sem
      // nenhum horário possível.
      const r = await regras({ retiradaAberturaMinutos: 1110 });
      expect(r.status).toBe(422);
      expect(r.body.error).toBe("HORARIO_DE_RETIRADA_INVALIDO");
    });

    it("semana sem nenhum dia de retirada é recusada", async () => {
      const r = await regras({ retiradaDias: [] });
      expect(r.status).toBe(422);
      expect(r.body.error).toBe("SEM_DIA_DE_RETIRADA");
    });
  });
});
