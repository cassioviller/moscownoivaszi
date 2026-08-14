import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import { db, parcelasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";
import {
  criarContrato,
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **E226 — a mora aparece onde se decide sobre ela.**
 *
 * O E213 ligou a cláusula 9ª e escreveu, na nota do próprio helper
 * (`lib/mora-da-parcela.ts:6-12`), que *"toda porta que devolve parcela passa
 * por aqui"* — e nomeou quatro leituras: a fila de cobrança, **o carnê do
 * contrato**, o extrato do portal e a resposta do recebimento.
 *
 * Medido treze épicos depois: são **três** portas escrevendo `mora: moraDe(p)`
 * — `financeiro.ts:167`, `portal.ts:270` e `contratos.ts:182` (as rotas de
 * PARCELA). **O carnê do contrato é a quarta e não passa por lá**: o
 * `GET /contratos/:id` monta as parcelas com `with: { parcelas: true }` cru
 * (`contratos.ts:1207`) e as espalha com `...contrato`. `Parcela.mora` é
 * `optional` no spec, então nada reprovava.
 *
 * **Isso é a S-C190 na sua forma real, e ela é maior do que a sobra dizia.** A
 * sobra afirmava *"o dado CHEGA e a tela imprime só `valorPrevisto`"* — o dado
 * NÃO chega, e é a única tela de dinheiro que a Vendedora abre (ela tem
 * `financeiro: NADA`). É o **E186 outra vez**: a nota do módulo descrevia uma
 * capacidade que o código não tinha, e a régua não a cobrava.
 *
 * E a **S-C200** é a mesma conta pelo outro lado: no portal, o extrato da
 * parcela já mostra o total com mora (`portal.ts:270`), e o resumo em cima dele
 * soma só o principal (`abertoEmCentavos`, `portal.ts:227`) — **R$ 500,00 em
 * cima e R$ 515,00 embaixo, para a mesma dívida, na mesma tela**.
 *
 * Carnê de referência: R$ 500,00 vencidos há 30 dias = R$ 515,00 (2% + 1%/mês).
 */
describe("E226 — a mora aparece onde se decide sobre ela", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  const publico = () => request(app);

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const diasAtras = (n: number) => ancoraDeNegocio(addDias(hojeLocal(), -n));

  /**
   * Uma noiva com contrato ATIVO, portal vivo e UMA parcela de R$ 500,00 com o
   * vencimento pedido. A parcela é inserida direta porque a data no passado é o
   * ponto do teste — gerar plano com vencimento vencido não é caminho de tela.
   */
  async function noivaComParcela(params: { vencimento: Date; recebido?: number }) {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 500,
      fechadoEm: new Date(),
    });
    const [parcela] = await db
      .insert(parcelasTable)
      .values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 1,
        origem: "PLANO",
        descricao: "Parcela 1",
        valorPrevisto: 500,
        vencimento: params.vencimento,
        status: params.recebido ? "PARCIAL" : "PREVISTA",
        valorRecebido: params.recebido ?? null,
      })
      .returning();
    const portal = await agent.post(`/api/lojas/${f.lojaId}/leads/${lead.id}/portal`).expect(201);
    return { lead, contrato, parcela: parcela!, token: portal.body.token as string };
  }

  const carne = async (contratoId: string) => {
    const r = await agent.get(`/api/lojas/${f.lojaId}/contratos/${contratoId}`).expect(200);
    return r.body as { parcelas: Record<string, unknown>[] };
  };

  describe("S-C190 — o carnê do contrato, a única tela de dinheiro da Vendedora", () => {
    it("a parcela vencida há 30 dias chega ao carnê valendo R$ 515,00", async () => {
      const { contrato } = await noivaComParcela({ vencimento: diasAtras(30) });

      const mora = (await carne(contrato.id)).parcelas[0]!.mora as Record<string, unknown>;

      expect(mora).not.toBeNull();
      expect(mora.total).toBe(515);
      expect(mora.multa).toBe(10);
      expect(mora.juros).toBe(5);
      expect(mora.perdoada).toBe(false);
    });

    it("a parcela a vencer chega com `mora: null` — e `null` não é ausência", async () => {
      const { contrato } = await noivaComParcela({
        vencimento: ancoraDeNegocio(addDias(hojeLocal(), 10)),
      });

      const parcela = (await carne(contrato.id)).parcelas[0]!;

      // A distinção que a tela precisa fazer: `null` é "a cláusula não incide",
      // `undefined` seria "esta porta não sabe". Enquanto o carnê não entregava,
      // as duas eram indistinguíveis e a tela só podia calar.
      expect(parcela).toHaveProperty("mora");
      expect(parcela.mora).toBeNull();
    });

    it("o carnê e a fila de cobrança dizem o MESMO número", async () => {
      const { contrato, parcela } = await noivaComParcela({ vencimento: diasAtras(30) });

      const doCarne = (await carne(contrato.id)).parcelas[0]!.mora as Record<string, unknown>;
      const daFila = (
        (
          await agent
            .get(`/api/lojas/${f.lojaId}/financeiro/parcelas`)
            .query({ status: "abertas" })
            .expect(200)
        ).body as { id: string; mora: Record<string, unknown> }[]
      ).find((p) => p.id === parcela.id)!.mora;

      expect(doCarne.total).toBe(daFila.total);
    });

    it("a mora PERDOADA chega ao carnê como perdão, não como ausência", async () => {
      const { contrato, parcela } = await noivaComParcela({ vencimento: diasAtras(30) });
      await agent
        .post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/perdoar-mora`)
        .send({ motivo: "A noiva avisou da internação do pai" })
        .expect(200);

      const mora = (await carne(contrato.id)).parcelas[0]!.mora as Record<string, unknown>;

      // O selo tem de sobreviver à leitura do carnê: uma parcela vencida sem
      // acréscimo e sem explicação ao lado é o que o E213 existiu para evitar.
      expect(mora.perdoada).toBe(true);
      expect(mora.total).toBe(500);
    });
  });

  describe("S-C200 — o portal não mostra dois números para a mesma dívida", () => {
    it("`faltaPagar` inclui a mora que a linha da parcela já mostra", async () => {
      const { token } = await noivaComParcela({ vencimento: diasAtras(30) });

      const r = await publico().get(`/api/portal?token=${token}`).expect(200);
      const linha = (r.body.parcelas as { mora: { total: number } | null }[])[0]!;

      // O defeito literal: R$ 500,00 em cima, R$ 515,00 embaixo.
      expect(linha.mora!.total).toBe(515);
      expect(r.body.resumoPagamento.faltaPagar).toBe(515);
    });

    it("`proximaValor` também — é o número que a noiva leva para o PIX", async () => {
      const { token } = await noivaComParcela({ vencimento: diasAtras(30) });

      const r = await publico().get(`/api/portal?token=${token}`).expect(200);

      expect(r.body.resumoPagamento.proximaValor).toBe(515);
    });

    it("perdoada a mora, o resumo volta aos R$ 500,00 — os dois números juntos de novo", async () => {
      const { token, parcela } = await noivaComParcela({ vencimento: diasAtras(30) });
      await agent
        .post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/perdoar-mora`)
        .send({ motivo: "Perdão combinado com a dona" })
        .expect(200);

      const r = await publico().get(`/api/portal?token=${token}`).expect(200);

      expect(r.body.resumoPagamento.faltaPagar).toBe(500);
      expect(r.body.resumoPagamento.proximaValor).toBe(500);
    });

    it("sem atraso, o resumo é o principal e nada muda", async () => {
      const { token } = await noivaComParcela({
        vencimento: ancoraDeNegocio(addDias(hojeLocal(), 10)),
      });

      const r = await publico().get(`/api/portal?token=${token}`).expect(200);

      expect(r.body.resumoPagamento.faltaPagar).toBe(500);
      expect(r.body.resumoPagamento.proximaValor).toBe(500);
    });

    it("a PARCIAL soma a mora do SALDO, não do previsto cheio", async () => {
      // R$ 500,00 com R$ 300,00 pagos: a mora incide sobre R$ 200,00 e o total
      // devido é 200 + 4 + 2 = R$ 206,00.
      const { token } = await noivaComParcela({ vencimento: diasAtras(30), recebido: 300 });

      const r = await publico().get(`/api/portal?token=${token}`).expect(200);

      expect(r.body.resumoPagamento.faltaPagar).toBe(206);
    });
  });

  describe("S-C210 — o gesto de perdoar, e o que ele deixa gravado", () => {
    it("perdoar grava o motivo NA PARCELA, e é dele que a tela desenha o selo", async () => {
      const { parcela } = await noivaComParcela({ vencimento: diasAtras(30) });

      await agent
        .post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/perdoar-mora`)
        .send({ motivo: "Atraso do repasse do pai da noiva" })
        .expect(200);

      const [linha] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcela.id));
      expect(linha!.moraPerdoadaEm).not.toBeNull();
      expect(linha!.moraPerdoadaMotivo).toBe("Atraso do repasse do pai da noiva");
    });

    it("desfazer o perdão devolve a cobrança ao carnê", async () => {
      const { contrato, parcela } = await noivaComParcela({ vencimento: diasAtras(30) });
      await agent
        .post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/perdoar-mora`)
        .send({ motivo: "Engano meu" })
        .expect(200);

      await agent.delete(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/perdoar-mora`).expect(200);

      const mora = (await carne(contrato.id)).parcelas[0]!.mora as Record<string, unknown>;
      expect(mora.perdoada).toBe(false);
      expect(mora.total).toBe(515);
    });
  });
});
