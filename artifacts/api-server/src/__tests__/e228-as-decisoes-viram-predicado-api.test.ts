import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
 * **E228 — duas decisões da dona (14/08/2026, na recomendação) viram
 * predicado.**
 *
 * - **S-C60** — *"a loja pode segurar um vestido antes de saber de qual noiva
 *   é?"* → **pode, com validade de 7 dias.** O bloqueio órfão
 *   (RESERVA_CASAMENTO sem `leadId` e sem `reservaId`) continua nascendo por
 *   201, mas expira: passado o prazo, a régua de disponibilidade o solta e a
 *   tela o mostra vencido. Antes ele segurava a peça para sempre — 2 dos 127
 *   do dev nasceram assim e ninguém tinha como saber.
 * - **S-C233** — *"a peça devolvida de contrato cancelado passa pela
 *   lavanderia?"* → **passa.** O braço "na rua" do E225 soltava no instante da
 *   devolução; agora a cauda de lavagem ocupa os mesmos dias que no contrato
 *   vivo — a peça de contrato morto não é prometida para o dia seguinte.
 */
describe("E228 — as decisões da dona viram predicado", () => {
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

  const diasReais = (n: number) => new Date(Date.now() + n * 86_400_000);

  // O casamento da candidata é um Date EXPLÍCITO: as cenas da lavagem
  // precisam de dias REAIS (a lição do E225 — `dataFutura` soma sobre a base
  // fixa de 2027, e uma candidata em 2027 nunca conflita com lavagem de hoje).
  const reservarPara = (vestidoId: string, leadId: string, casamento: Date) =>
    agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId,
      leadId,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: casamento.toISOString(),
    });

  /** Um órfão com a idade pedida — o `createdAt` é reescrito porque o helper insere com `now()`. */
  async function orfaoComIdade(vestidoId: string, idadeDias: number, casamentoEmDias = 30) {
    const bloqueio = await criarBloqueio(f, {
      vestidoId,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(casamentoEmDias),
    });
    await db
      .update(bloqueioVestidosTable)
      .set({ createdAt: diasReais(-idadeDias) })
      .where(eq(bloqueioVestidosTable.id, bloqueio.id));
    return bloqueio;
  }

  describe("S-C60 — o órfão segura por 7 dias, e depois solta", () => {
    it("órfão de 2 dias ainda segura — a noiva B leva 409", async () => {
      const vestido = await criarVestido(f);
      await orfaoComIdade(vestido.id, 2);
      const noivaB = await criarLead(f);

      const r = await reservarPara(vestido.id, noivaB.id, dataFutura(30));
      expect(r.status, JSON.stringify(r.body)).toBe(409);
    });

    it("órfão de 8 dias venceu — a peça está livre e a noiva B leva 201", async () => {
      const vestido = await criarVestido(f);
      await orfaoComIdade(vestido.id, 8);
      const noivaB = await criarLead(f);

      const r = await reservarPara(vestido.id, noivaB.id, dataFutura(30));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    });

    it("com NOIVA não há validade — reserva de 8 dias segura como sempre segurou", async () => {
      const noivaA = await criarLead(f);
      const vestido = await criarVestido(f);
      const bloqueio = await criarBloqueio(f, {
        vestidoId: vestido.id,
        tipo: "RESERVA_CASAMENTO",
        leadId: noivaA.id,
        casamentoData: dataFutura(30),
      });
      await db
        .update(bloqueioVestidosTable)
        .set({ createdAt: diasReais(-8) })
        .where(eq(bloqueioVestidosTable.id, bloqueio.id));
      const noivaB = await criarLead(f);

      const r = await reservarPara(vestido.id, noivaB.id, dataFutura(30));
      expect(r.status, JSON.stringify(r.body)).toBe(409);
    });

    it("MANUTENCAO não é órfã — é da loja, e não expira", async () => {
      const vestido = await criarVestido(f);
      const bloqueio = await criarBloqueio(f, {
        vestidoId: vestido.id,
        tipo: "MANUTENCAO",
        inicio: diasReais(-10),
        fim: dataFutura(60),
      });
      await db
        .update(bloqueioVestidosTable)
        .set({ createdAt: diasReais(-10) })
        .where(eq(bloqueioVestidosTable.id, bloqueio.id));
      const noivaB = await criarLead(f);

      const r = await reservarPara(vestido.id, noivaB.id, dataFutura(30));
      expect(r.status, JSON.stringify(r.body)).toBe(409);
    });

    it("o órfão que já SAIU não expira — física ganha de prazo (o braço do E225)", async () => {
      const vestido = await criarVestido(f);
      const bloqueio = await orfaoComIdade(vestido.id, 10, 30);
      await db
        .update(bloqueioVestidosTable)
        .set({ retiradaDataReal: diasReais(-3) })
        .where(eq(bloqueioVestidosTable.id, bloqueio.id));
      const noivaB = await criarLead(f);

      const r = await reservarPara(vestido.id, noivaB.id, dataFutura(30));
      expect(r.status, JSON.stringify(r.body)).toBe(409);
    });

    it("a lista diz até quando o órfão segura — e cala sobre quem tem dona", async () => {
      const vestido = await criarVestido(f);
      const orfao = await orfaoComIdade(vestido.id, 2);

      const r = await agent.get(`/api/lojas/${f.lojaId}/bloqueios`).expect(200);
      const linha = (r.body as { id: string; orfaoSeguraAte?: string | null }[]).find(
        (b) => b.id === orfao.id,
      );

      expect(linha, "o órfão nem veio na lista").toBeDefined();
      // createdAt foi reescrito para 2 dias atrás: segura até daqui a 5.
      const seguraAte = new Date(linha!.orfaoSeguraAte!);
      const esperado = diasReais(5);
      expect(Math.abs(seguraAte.getTime() - esperado.getTime())).toBeLessThan(60_000);

      const comDona = (r.body as { leadId: string | null; orfaoSeguraAte?: string | null }[]).find(
        (b) => b.leadId !== null,
      );
      if (comDona) expect(comDona.orfaoSeguraAte ?? null).toBeNull();
    });
  });

  describe("S-C233 — a lavagem ocupa também no contrato cancelado", () => {
    /** Peça de contrato cancelado, retirada e DEVOLVIDA há `devolvidaHaDias`. */
    async function canceladaDevolvida(vestidoId: string, devolvidaHaDias: number) {
      const noivaA = await criarLead(f);
      return await criarBloqueio(f, {
        vestidoId,
        tipo: "RESERVA_CASAMENTO",
        leadId: noivaA.id,
        casamentoData: diasReais(-devolvidaHaDias - 3),
        retiradaDataReal: diasReais(-devolvidaHaDias - 5),
        devolucaoDataReal: diasReais(-devolvidaHaDias),
        canceladoEm: diasReais(-devolvidaHaDias - 4),
      });
    }

    it("devolvida ONTEM, a lavagem ainda ocupa — reservar para dentro dela leva 409", async () => {
      const vestido = await criarVestido(f);
      await canceladaDevolvida(vestido.id, 1);
      const noivaB = await criarLead(f);

      // A regra default lava por 7 dias: o casamento daqui a 3 cai com a
      // janela de USO da candidata dentro da lavagem da peça.
      const r = await reservarPara(vestido.id, noivaB.id, diasReais(3));
      expect(r.status, JSON.stringify(r.body)).toBe(409);
      expect((r.body.conflitos as { motivo: string }[]).map((c) => c.motivo)).toContain("LAVAGEM");
    });

    it("devolvida há 10 dias, a lavagem passou — a peça está livre", async () => {
      const vestido = await criarVestido(f);
      await canceladaDevolvida(vestido.id, 10);
      const noivaB = await criarLead(f);

      // Casamento a 30 dias: a janela de PROVA da candidata ([D−14, D−4]) fica
      // toda no futuro. Com D a 3 dias ela varreria o PASSADO e esbarraria no
      // USO/LAVAGEM históricos — comportamento pré-existente (PROVA×FISICA
      // conflita mesmo em dias já vividos), que não é deste épico.
      const r = await reservarPara(vestido.id, noivaB.id, diasReais(30));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    });
  });
});
