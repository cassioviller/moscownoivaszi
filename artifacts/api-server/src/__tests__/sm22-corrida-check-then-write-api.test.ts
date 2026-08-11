import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, pool, parcelasTable, cabinesTable, atendimentosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

/**
 * S-M22 — a família check-then-write, provada em dois representantes.
 *
 * A rodada 2 enumerou DEZ sítios com a mesma anatomia da S-M7: a guarda lida
 * no pool global e a escrita na transação sem reconferir. Este arquivo prova
 * o conserto nos dois de maior estrago — o de DINHEIRO (DELETE /parcelas ×
 * receber, achado 3#2) e o que nasceu NO CONSERTO da S-M1 (DELETE /cabines ×
 * POST /atendimentos, achado 11#1) — com a corrida determinística do S33: a
 * segunda conexão segura a escrita NÃO COMMITADA, a rota fica pendurada na
 * tranca nova, e o commit decide. Antes do conserto os dois cenários davam
 * 204 com o dado do vencedor destruído; a mecânica dos outros oito sítios é a
 * MESMA reconferência, aplicada no mesmo commit.
 */
describe("S-M22 — a guarda relida sob tranca vê o que commitou na janela", () => {
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

  it("DELETE /parcelas × receber: o recebimento commitado na janela SEGURA a parcela (era 204 com o dinheiro sumindo)", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 500 });
    const parcelaId = randomUUID();
    await db.insert(parcelasTable).values({
      id: parcelaId,
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero: 1,
      valorPrevisto: 500,
      vencimento: dataFutura(30),
      status: "PREVISTA",
      origem: "PLANO",
    });

    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      // O receber da recepção, NÃO COMMITADO: o UPDATE segura a tranca da
      // linha — o FOR UPDATE do DELETE vai ficar pendurado nela.
      await cliente.query(
        `UPDATE parcelas SET status = 'PAGA', valor_recebido = 500, recebido_em = now() WHERE id = $1`,
        [parcelaId],
      );

      // O `Test` do supertest é LAZY (S33): o Promise.resolve dispara AGORA.
      const respostaP = Promise.resolve(
        agent.delete(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}`),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      // VERMELHO ANTES: 204 — os R$ 500,00 estavam na gaveta e o caixa dizia
      // que nunca entraram.
      const resposta = await respostaP;
      expect(resposta.status).toBe(422);
      expect(resposta.body.error).toBe("PARCELA_NAO_PREVISTA");
    } finally {
      cliente.release();
    }

    // O invariante: a parcela recebida continua no banco, PAGA.
    const [viva] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcelaId));
    expect(viva).toBeDefined();
    expect(viva!.status).toBe("PAGA");
    expect(viva!.valorRecebido).toBe(500);
  });

  it("DELETE /cabines × POST /atendimentos: a prova marcada na janela SEGURA a cabine (era 204 com a agenda cascateada)", async () => {
    const lead = await criarLead(f);
    const [cabine] = await db.insert(cabinesTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      nome: `Cabine corrida ${randomUUID().slice(0, 8)}`,
      ativo: true,
    }).returning();

    const atendimentoId = randomUUID();
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      // O agendamento concorrente, NÃO COMMITADO: o INSERT toma FOR KEY SHARE
      // na linha da cabine — conflita com o FOR UPDATE novo do DELETE.
      await cliente.query(
        `INSERT INTO atendimentos (id, loja_id, lead_id, cabine_id, vendedora_id, inicio, tipo)
         VALUES ($1, $2, $3, $4, $5, $6, 'PROVA')`,
        [atendimentoId, f.lojaId, lead.id, cabine!.id, f.vendedoraId, dataFutura(7)],
      );

      const respostaP = Promise.resolve(
        agent.delete(`/api/lojas/${f.lojaId}/cabines/${cabine!.id}`),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      // VERMELHO ANTES: 204 — a prova da noiva descia pela cascata sem rastro
      // próprio, o exato estrago que fez a S-M1 ser 🔴.
      const resposta = await respostaP;
      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toBe("CABINE_COM_AGENDA");
    } finally {
      cliente.release();
    }

    // O invariante: a cabine e a prova continuam existindo.
    const [provaViva] = await db.select().from(atendimentosTable)
      .where(eq(atendimentosTable.id, atendimentoId));
    expect(provaViva).toBeDefined();
    const [cabineViva] = await db.select().from(cabinesTable)
      .where(eq(cabinesTable.id, cabine!.id));
    expect(cabineViva).toBeDefined();
  });
});
