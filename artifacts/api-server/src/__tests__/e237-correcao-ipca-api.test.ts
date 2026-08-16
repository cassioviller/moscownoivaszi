import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { auditLogTable, db, parcelasTable } from "@workspace/db";
import { addDias, ancoraDeNegocio, hojeLocal, mesesCheiosDeMora } from "@workspace/financeiro-core";
import { and, eq } from "drizzle-orm";
import { criarContrato, criarFixture, criarLead, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * **P4/E237 — a correção monetária da cláusula 9ª é pelo IPCA, com o índice
 * INFORMADO por competência (decidido em 15/08/2026).**
 *
 * Até aqui a mora dizia *"Sem correção monetária — o contrato não nomeia
 * índice"*. Agora a dona grava o IPCA do mês (PUT /financeiro/indices) e a
 * mora corrige o saldo pelos meses CHEIOS entre o vencimento e hoje; mês sem
 * índice continua sem correção, e a frase diz QUAL mês falta.
 *
 * A régua roda em qualquer dia: os meses cheios são calculados pelo mesmo
 * helper que a conta usa (`mesesCheiosDeMora`), e o índice é gravado para
 * exatamente esses meses — o número esperado sai do produto, não de uma
 * constante que envelhece.
 */
describe("E237 — a mora corrige pelo IPCA informado", () => {
  let f: Fixture;
  let dona: Awaited<ReturnType<typeof loginComLoja>>;
  const hoje = hojeLocal();
  // Vencida há ~150 dias: entre 4 e 5 meses cheios, conforme o dia de hoje.
  const vencimento = addDias(hoje, -150);
  const meses = mesesCheiosDeMora(vencimento, hoje);

  beforeAll(async () => {
    f = await criarFixture();
    dona = await loginComLoja(f.superAdminEmail, f.lojaId);
  });
  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const gravar = (competencia: string, variacaoPct: number) =>
    dona.put(`/api/lojas/${f.lojaId}/financeiro/indices`).send({ competencia, variacaoPct });

  async function parcelaVencida(valor = 1000) {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: valor, fechadoEm: new Date() });
    const [p] = await db
      .insert(parcelasTable)
      .values({ id: randomUUID(), lojaId: f.lojaId, contratoId: contrato.id, numero: 1, origem: "PLANO", valorPrevisto: valor, vencimento: ancoraDeNegocio(vencimento) })
      .returning();
    return { contrato, parcela: p! };
  }
  const naFila = async (parcelaId: string) => {
    const r = await dona.get(`/api/lojas/${f.lojaId}/financeiro/parcelas`).query({ status: "abertas" }).expect(200);
    return (r.body as { id: string; mora: Record<string, unknown> }[]).find((p) => p.id === parcelaId)!.mora;
  };

  it("sem índice informado, a mora não corrige e DIZ o mês que falta", async () => {
    const { parcela } = await parcelaVencida();
    const mora = await naFila(parcela.id);
    expect(meses.length).toBeGreaterThanOrEqual(4);
    expect(mora.correcao).toBe(0);
    expect(mora.explicacao).toContain(`o IPCA de ${meses[0]!.slice(5, 7)}/${meses[0]!.slice(0, 4)} não foi informado`);
    // Multa e juros seguem como no E213 — a correção é um TERCEIRO termo, não uma troca.
    expect(mora.multa).toBe(20);
  });

  it("gravar o IPCA de cada mês cheio corrige o saldo pelo produto — na fila e no carnê (o portal lê o mesmo helper e não é aberto aqui); a trilha guarda quem gravou", async () => {
    // Um índice diferente por mês, para o produto não ser uma soma disfarçada.
    const pcts = meses.map((_, i) => Math.round((0.3 + i * 0.1) * 100) / 100);
    for (const [i, m] of meses.entries()) {
      const r = await gravar(m, pcts[i]!).expect(200);
      expect(r.body.competencia).toBe(m);
      expect(r.body.variacaoPct).toBe(pcts[i]);
    }
    const listados = (await dona.get(`/api/lojas/${f.lojaId}/financeiro/indices`).expect(200)).body as { competencia: string }[];
    expect(listados.map((l) => l.competencia).sort()).toEqual([...meses].sort());

    const fator = pcts.reduce((acc, p) => acc * (1 + p / 100), 1);
    const esperadoC = Math.round(100_000 * (fator - 1)); // saldo R$ 1.000,00 em centavos
    const { contrato, parcela } = await parcelaVencida();
    const mora = await naFila(parcela.id);
    expect(mora.correcao).toBe(esperadoC / 100);
    expect(mora.correcao as number).toBeGreaterThan(10);
    expect(mora.acrescimo).toBe(Number(mora.multa) + Number(mora.juros) + Number(mora.correcao));
    expect(mora.explicacao).toContain("Correção pelo IPCA de");

    // O carnê (GET /contratos/:id) e a fila leem o MESMO número (a lição do E187).
    const c = await dona.get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`).expect(200);
    const doCarne = (c.body.parcelas as { id: string; mora: { correcao: number } }[]).find((p) => p.id === parcela.id)!.mora;
    expect(doCarne.correcao).toBe(esperadoC / 100);

    // Corrigir o índice de um mês é gravar de novo (UPSERT), e a trilha diz quem.
    await gravar(meses[0]!, 0.9).expect(200);
    const trilha = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.lojaId, f.lojaId), eq(auditLogTable.acao, "INDICE_GRAVADO")));
    expect(trilha.length).toBe(meses.length + 1);
    expect((await naFila(parcela.id)).correcao as number).toBeGreaterThan(esperadoC / 100);
  });

  it("competência torta e variação absurda são recusadas — 400", async () => {
    await gravar("2026-13", 0.5).expect(400);
    await gravar("2026/07", 0.5).expect(400);
    await gravar("2026-07", 99).expect(400);
  });
});
