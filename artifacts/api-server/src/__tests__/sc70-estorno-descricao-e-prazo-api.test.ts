import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { auditLogTable, db, parcelasTable } from "@workspace/db";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";
import { and, asc, eq } from "drizzle-orm";
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
 * **As três portas de `contratos.ts` que a cláusula 9ª e o § único deixaram
 * abertas** — S-C70 🟠, S-C71 🟡 e S-C90 🟡.
 *
 * As três nasceram de épicos diferentes e caem no mesmo arquivo, e a linha que
 * as une é a do E172: **fechar uma porta sem medir a porta ao lado dela é meio
 * conserto**.
 *
 * - **S-C70** — o E213 fez o que entra além do principal virar linha própria
 *   (`origem: MORA`, nascida PAGA). O estorno AVULSO devolve o dinheiro e
 *   **não desfaz essa linha**: a loja devolve R$ 515,00 e o carnê continua
 *   dizendo que R$ 15,00 foram pagos. O cancelamento do contrato NÃO tem o
 *   defeito, porque seleciona por `contratoId` (`:1546`) — o avulso é o único
 *   caminho que enxerga uma parcela e não o pagamento.
 * - **S-C71** — a descrição da linha de MORA era cortada em 200 caracteres
 *   sobre uma frase de 209, e o que o corte comia era **a declaração de que a
 *   correção monetária não é calculada** — escrita pelo E213 justamente para a
 *   régua não esconder o próprio alcance. A noiva lê essa linha no portal.
 * - **S-C90** — `POST /contratos` e `gerar-plano` conferem o carnê contra a
 *   `dataRetirada` (E218). O `PATCH /contratos/:id`, que desde o E224 é a porta
 *   por onde a retirada se MOVE, não conferia nada.
 */
describe("S-C70/S-C71/S-C90 — o estorno, a frase e o prazo nas portas do contrato", () => {
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

  const diasAtras = (n: number) => ancoraDeNegocio(addDias(hojeLocal(), -n));

  /**
   * O caso da sobra, e o mesmo do S-C50: R$ 500,00 vencidos há 30 dias — multa
   * de 2% = R$ 10,00, juros de 1% ao mês *pro rata die* (30/30) = R$ 5,00.
   * A noiva paga R$ 515,00.
   */
  async function contratoComParcelaVencida(params?: { valor?: number; dias?: number }) {
    const valor = params?.valor ?? 500;
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: valor,
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
        valorPrevisto: valor,
        vencimento: diasAtras(params?.dias ?? 30),
      })
      .returning();
    return { lead, contrato, parcela: parcela! };
  }

  const receber = (parcelaId: string, valor: number) =>
    agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/receber`).send({
      valorRecebido: valor,
      recebidoEm: new Date().toISOString(),
      formaRecebimento: "PIX",
    });

  const estornar = (parcelaId: string) =>
    agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/estornar`).send({});

  const parcelasDo = (contratoId: string) =>
    db
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.contratoId, contratoId))
      .orderBy(asc(parcelasTable.numero));

  const moraDo = async (contratoId: string) =>
    (
      await db
        .select()
        .from(parcelasTable)
        .where(and(eq(parcelasTable.contratoId, contratoId), eq(parcelasTable.origem, "MORA")))
    )[0]!;

  // ------------------------------------------------------------------ S-C70

  describe("S-C70 — o estorno avulso devolve o pagamento INTEIRO", () => {
    it("**estornar R$ 515,00 não pode deixar R$ 15,00 de multa PAGA no carnê**", async () => {
      const { contrato, parcela } = await contratoComParcelaVencida();
      expect((await receber(parcela.id, 515)).status).toBe(200);

      // O retrato do defeito, medido com sonda na S-C50.
      const antes = await parcelasDo(contrato.id);
      expect(antes.map((p) => [p.origem, p.status, p.valorRecebido])).toEqual([
        ["PLANO", "PAGA", 500],
        ["MORA", "PAGA", 15],
      ]);

      expect((await estornar(parcela.id)).status).toBe(200);

      const depois = await parcelasDo(contrato.id);
      expect(depois.map((p) => [p.origem, p.status, p.valorRecebido])).toEqual([
        ["PLANO", "PREVISTA", null],
        ["MORA", "CANCELADA", null],
      ]);
    });

    it("o dinheiro devolvido é o dinheiro que entrou — R$ 515,00, não R$ 500,00", async () => {
      const { contrato, parcela } = await contratoComParcelaVencida();
      await receber(parcela.id, 515);
      await estornar(parcela.id);
      const soma = (await parcelasDo(contrato.id)).reduce(
        (acc, p) => acc + (p.valorRecebido ?? 0),
        0,
      );
      expect(soma).toBe(0);
    });

    it("os dois carimbos da linha de MORA saem junto, como no estorno em massa", async () => {
      const { contrato, parcela } = await contratoComParcelaVencida();
      await receber(parcela.id, 515);
      const mora = await moraDo(contrato.id);
      await db
        .update(parcelasTable)
        .set({ conciliadoEm: new Date(), enviadoContabilidadeEm: new Date() })
        .where(eq(parcelasTable.id, mora.id));

      await estornar(parcela.id);

      const depois = (await db.select().from(parcelasTable).where(eq(parcelasTable.id, mora.id)))[0]!;
      expect(depois.recebidoEm).toBeNull();
      expect(depois.formaRecebimento).toBeNull();
      expect(depois.conciliadoEm).toBeNull();
      expect(depois.enviadoContabilidadeEm).toBeNull();
    });

    it("**a trilha diz quanto da multa foi desfeito, e de qual linha**", async () => {
      const { contrato, parcela } = await contratoComParcelaVencida();
      await receber(parcela.id, 515);
      const mora = await moraDo(contrato.id);
      await estornar(parcela.id);

      const [linha] = await db
        .select()
        .from(auditLogTable)
        .where(and(eq(auditLogTable.acao, "MORA_ESTORNADA"), eq(auditLogTable.entidadeId, mora.id)));
      expect(linha).toBeDefined();
      expect(linha!.detalhe).toMatchObject({
        contratoId: contrato.id,
        parcelaDeOrigemId: parcela.id,
        valor: 15,
      });
    });

    it("estornar parcela SEM multa não mexe em linha nenhuma", async () => {
      const { contrato, parcela } = await contratoComParcelaVencida();
      await receber(parcela.id, 500);
      expect((await estornar(parcela.id)).status).toBe(200);
      const depois = await parcelasDo(contrato.id);
      expect(depois.map((p) => [p.origem, p.status])).toEqual([["PLANO", "PREVISTA"]]);
    });

    it("**só a multa DAQUELA parcela cai — a da parcela vizinha continua paga**", async () => {
      const { contrato, parcela } = await contratoComParcelaVencida({ valor: 500 });
      const [outra] = await db
        .insert(parcelasTable)
        .values({
          id: randomUUID(),
          lojaId: f.lojaId,
          contratoId: contrato.id,
          numero: 2,
          origem: "PLANO",
          descricao: "Parcela 2",
          valorPrevisto: 500,
          vencimento: diasAtras(30),
        })
        .returning();
      await receber(parcela.id, 515);
      await receber(outra!.id, 515);

      await estornar(parcela.id);

      const moras = (await parcelasDo(contrato.id)).filter((p) => p.origem === "MORA");
      expect(moras).toHaveLength(2);
      expect(moras.filter((p) => p.status === "CANCELADA")).toHaveLength(1);
      expect(moras.filter((p) => p.status === "PAGA")).toHaveLength(1);
      const viva = moras.find((p) => p.status === "PAGA")!;
      expect(viva.valorRecebido).toBe(15);
    });
  });

  // ------------------------------------------------------------------ S-C71

  describe("S-C71 — a conta da multa chega inteira ao carnê", () => {
    it("**a declaração da correção monetária não é cortada no meio da palavra**", async () => {
      const { contrato, parcela } = await contratoComParcelaVencida();
      await receber(parcela.id, 515);
      const mora = await moraDo(contrato.id);
      // P4/E237: a frase da ausência mudou de "o contrato não nomeia índice" para o MÊS que falta.
      expect(mora.descricao).toMatch(/Sem correção monetária — (o IPCA de \d{2}\/\d{4} não foi informado|ainda não há mês cheio de atraso)/);
      expect(mora.descricao!.length).toBeGreaterThan(200);
    });

    it("a frase é a MESMA que a fila de cobrança mostra — um lugar só", async () => {
      const { contrato, parcela } = await contratoComParcelaVencida();
      const fila = await agent
        .get(`/api/lojas/${f.lojaId}/financeiro/parcelas`)
        .query({ status: "abertas" })
        .expect(200);
      const naFila = (fila.body as { id: string; mora: { explicacao: string } | null }[]).find(
        (p) => p.id === parcela.id,
      )!;
      await receber(parcela.id, 515);
      const mora = await moraDo(contrato.id);
      expect(mora.descricao).toBe(`Multa e juros (cláusula 9ª) — ${naFila.mora!.explicacao}`);
    });

    it("números maiores empurrariam mais texto para fora, e não empurram", async () => {
      // R$ 12.500,00 vencidos há 120 dias: dias de três algarismos e saldo na
      // casa dos milhares — o pior caso que a S-C71 previu.
      const { contrato, parcela } = await contratoComParcelaVencida({ valor: 12_500, dias: 120 });
      // multa 2% = 250,00 · juros 1% × 120/30 = 500,00 · total 13.250,00
      expect((await receber(parcela.id, 13_250)).status).toBe(200);
      const mora = await moraDo(contrato.id);
      expect(mora.valorPrevisto).toBe(750);
      // P4/E237: a frase da ausência mudou de "o contrato não nomeia índice" para o MÊS que falta.
      expect(mora.descricao).toMatch(/Sem correção monetária — (o IPCA de \d{2}\/\d{4} não foi informado|ainda não há mês cheio de atraso)/);
      // O tamanho é PREGADO, e não só "maior que 200": é ele que diz quanto o
      // corte antigo comia, e é ele que reprova se a frase encolher de novo.
      // E237: era 221 com "— o contrato não nomeia índice."; a frase nova nomeia o mês que falta e o caminho
      // ("— o IPCA de mm/aaaa não foi informado (Configurações → Índices).") — 254, e o mês tem sempre 7 caracteres.
      expect(mora.descricao!.length).toBe(254);
    });
  });

  // ------------------------------------------------------------------ S-C90

  describe("S-C90 — o § único vale também no PATCH que MOVE a retirada", () => {
    // Sexta às 14h, dentro do expediente da 4ª (E222). O limite do § único
    // (20 dias antes) cai em 15/08/2026.
    const RETIRADA = "2026-09-04T14:00:00-03:00";

    async function contratoComCarne(vencimentos: string[]) {
      const lead = await criarLead(f);
      const r = await agent
        .post(`/api/lojas/${f.lojaId}/contratos`)
        .send({
          leadId: lead.id,
          vendedoraId: f.vendedoraId,
          valorTotal: 1000 * vencimentos.length,
          parcelas: vencimentos.map((v, i) => ({
            numero: i,
            valorPrevisto: 1000,
            vencimento: ancoraDeNegocio(v),
          })),
        });
      expect(r.status).toBe(201);
      return r.body as { id: string };
    }

    const mover = (contratoId: string, body: Record<string, unknown>) =>
      agent.patch(`/api/lojas/${f.lojaId}/contratos/${contratoId}`).send(body);

    it("**mover a retirada para perto do carnê é recusado, e a frase diz as duas datas**", async () => {
      const contrato = await contratoComCarne(["2026-07-10", "2026-08-20"]);
      const r = await mover(contrato.id, { dataRetirada: RETIRADA });
      expect(r.status).toBe(422);
      expect(r.body.error).toBe("CARNE_DEPOIS_DO_PRAZO");
      expect(r.body.detalhe).toContain("15/08/2026");
      expect(r.body.detalhe).toContain("20/08/2026");
      expect(r.body.detalhe).toContain("parágrafo único");
      expect(r.body.campos[0].campo).toBe("dataRetirada");
    });

    it("a recusa não grava nada — a retirada continua vazia", async () => {
      const contrato = await contratoComCarne(["2026-07-10", "2026-08-20"]);
      await mover(contrato.id, { dataRetirada: RETIRADA });
      const r = await agent.get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`).expect(200);
      expect(r.body.dataRetirada).toBeFalsy();
    });

    it("no próprio dia-limite passa — 'até 20 dias antes' inclui o vigésimo", async () => {
      const contrato = await contratoComCarne(["2026-07-10", "2026-08-15"]);
      const r = await mover(contrato.id, { dataRetirada: RETIRADA });
      expect(r.status).toBe(200);
    });

    it("**a régua é do CARNÊ — a avulsa de reparo vence depois e não segura**", async () => {
      const contrato = await contratoComCarne(["2026-07-10", "2026-08-10"]);
      await db.insert(parcelasTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 99,
        origem: "AVULSA",
        descricao: "Reparo de avaria",
        valorPrevisto: 350,
        vencimento: ancoraDeNegocio("2026-10-10"),
      });
      const r = await mover(contrato.id, { dataRetirada: RETIRADA });
      expect(r.status).toBe(200);
    });

    it("carnê já PAGO não segura a correção — o dinheiro já entrou", async () => {
      const contrato = await contratoComCarne(["2026-07-10", "2026-08-20"]);
      await db
        .update(parcelasTable)
        .set({ status: "PAGA", valorRecebido: 1000, recebidoEm: new Date() })
        .where(eq(parcelasTable.contratoId, contrato.id));
      const r = await mover(contrato.id, { dataRetirada: RETIRADA });
      expect(r.status).toBe(200);
    });

    it("PATCH que não toca na retirada não é conferido", async () => {
      const contrato = await contratoComCarne(["2026-07-10", "2026-08-20"]);
      const r = await mover(contrato.id, { observacoes: "a noiva pediu prova extra" });
      expect(r.status).toBe(200);
    });
  });
});
