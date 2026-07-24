import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, contasPagarTable, parcelasTable } from "@workspace/db";
import {
  criarFixture,
  criarLead,
  criarContrato,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Exportação CSV de pagar/receber (E5): a contadora deixa de redigitar. As
 * regras que valem dinheiro: janela por dia local inclusivo, injeção de
 * fórmula neutralizada (a prova do C5 vale para todo consumidor de
 * lib/csv.ts) e gate do módulo financeiro.
 */

const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

describe("Exportação CSV — pagar e receber", () => {
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

  it("contas a pagar: linhas na janela, fornecedor malicioso escapado, fora da janela não sai", async () => {
    await db.insert(contasPagarTable).values([
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        tipo: "FORNECEDOR",
        descricao: "Aluguel, sala 2",
        fornecedor: "=cmd|'/c calc'!A1",
        valorPrevisto: 1234.5,
        vencimento: dia("2025-04-10"),
      },
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        tipo: "FORNECEDOR",
        descricao: "Fora da janela",
        valorPrevisto: 99,
        vencimento: dia("2025-05-02"),
      },
    ]);

    const res = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/contas-pagar/exportar`)
      .query({ de: "2025-04-01", ate: "2025-04-30" })
      .expect(200);

    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("contas-pagar-2025-04-01-a-2025-04-30.csv");
    const csv = res.text;
    expect(csv).toContain("Vencimento,Descrição,Tipo");
    // Vírgula na descrição não desloca coluna; fórmula vira texto.
    expect(csv).toContain('"Aluguel, sala 2"');
    expect(csv).toContain("'=cmd|'/c calc'!A1");
    expect(csv).toContain("1234.50");
    expect(csv).not.toContain("Fora da janela");
  });

  it("parcelas: a noiva sai na linha e a janela é por dia local inclusivo", async () => {
    const lead = await criarLead(f, { noivaNome: "Noiva Exportada" });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 6000,
      fechadoEm: dia("2025-03-01"),
    });
    await db.insert(parcelasTable).values([
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 1,
        valorPrevisto: 3000,
        // Fim do dia local 30/04: inclusivo — o recorte por instante UTC puro
        // perderia esta linha.
        vencimento: new Date("2025-04-30T20:00:00-03:00"),
      },
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 2,
        valorPrevisto: 3000,
        vencimento: dia("2025-05-15"),
      },
    ]);

    const res = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/parcelas/exportar`)
      .query({ de: "2025-04-01", ate: "2025-04-30" })
      .expect(200);

    const linhas = res.text.trim().split("\r\n");
    expect(linhas[0]).toContain("Vencimento,Noiva,Nº");
    expect(res.text).toContain("Noiva Exportada");
    expect(res.text).toContain("30/04/2025");
    expect(res.text).not.toContain("15/05/2025");
  });

  it("intervalo invertido → 400; sem gate de financeiro → 403", async () => {
    const invertido = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/parcelas/exportar`)
      .query({ de: "2025-05-01", ate: "2025-04-01" })
      .expect(400);
    expect(invertido.body.error).toBe("INTERVALO_INVALIDO");

    // A vendedora da fixture tem leads/vestidos/agenda — financeiro não.
    const vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await vendedora
      .get(`/api/lojas/${f.lojaId}/financeiro/contas-pagar/exportar`)
      .expect(403);
    await vendedora
      .get(`/api/lojas/${f.lojaId}/financeiro/parcelas/exportar`)
      .expect(403);
  });
});
