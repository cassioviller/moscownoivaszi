import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { db, orcamentosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Link público do orçamento (E13): a vendedora gera um link com token e
 * validade, a noiva abre sem login e a loja fica sabendo QUANDO ela abriu.
 * Regras que valem segurança: token é capability (256 bits, em query — nunca
 * no path logável), regenerar mata o link antigo, expirado é 410, RECUSADO
 * não gera, e a visão pública não vaza ids internos.
 */

describe("Orçamento — link público (E13)", () => {
  let f: Fixture;
  let ag: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    ag = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const gerar = (orcamentoId: string) =>
    ag.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamentoId}/link`);
  const abrir = (token: string) => request(app).get(`/api/orcamentos/publico?token=${token}`);

  it("gera token de 43 chars com ~7 dias, e RASCUNHO vira ENVIADO (compartilhar É enviar)", async () => {
    const lead = await criarLead(f);
    const orc = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });

    const res = await gerar(orc.id).expect(200);
    expect(res.body.token).toHaveLength(43);
    const dias = (new Date(res.body.expiraEm).getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(6.9);
    expect(dias).toBeLessThan(7.1);

    const [salvo] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, orc.id));
    expect(salvo.status).toBe("ENVIADO");
    expect(salvo.publicoToken).toBe(res.body.token);
  });

  it("a noiva abre sem login: nomes, itens, desconto aplicado — e nenhum id interno", async () => {
    const lead = await criarLead(f, { noivaNome: "Helena Vista" });
    const orc = await criarOrcamento(f, {
      leadId: lead.id,
      status: "ENVIADO",
      descontoTipo: "PERCENTUAL",
      descontoValor: 10,
    });
    await criarOrcamentoItem(f, { orcamentoId: orc.id, descricao: "Vestido Aurora", valorUnitario: 8000 });
    await criarOrcamentoItem(f, {
      orcamentoId: orc.id,
      tipo: "AJUSTE",
      descricao: "Barra",
      valorUnitario: 150,
      quantidade: 2,
    });
    const { body: link } = await gerar(orc.id).expect(200);

    const res = await abrir(link.token).expect(200);
    expect(res.body.noivaNome).toBe("Helena Vista");
    expect(res.body.lojaNome).toContain("Loja Teste");
    expect(res.body.itens).toHaveLength(2);
    expect(res.body.totalBruto).toBe(8300);
    expect(res.body.totalLiquido).toBe(7470);
    // A visão da noiva não navega o sistema: nada de ids.
    expect(res.body.id).toBeUndefined();
    expect(res.body.leadId).toBeUndefined();
    expect(res.body.itens[0].id).toBeUndefined();
  });

  it("a primeira abertura carimba publicoAbertoEm — e a segunda NÃO regrava", async () => {
    const lead = await criarLead(f);
    const orc = await criarOrcamento(f, { leadId: lead.id, status: "ENVIADO" });
    const { body: link } = await gerar(orc.id).expect(200);

    await abrir(link.token).expect(200);
    const [dep1] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, orc.id));
    expect(dep1.publicoAbertoEm).not.toBeNull();

    await abrir(link.token).expect(200);
    const [dep2] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, orc.id));
    expect(dep2.publicoAbertoEm!.getTime()).toBe(dep1.publicoAbertoEm!.getTime());

    // O aviso chega à gestão: o GET autenticado expõe o carimbo.
    const detalhe = await ag.get(`/api/lojas/${f.lojaId}/orcamentos/${orc.id}`).expect(200);
    expect(detalhe.body.publicoAbertoEm).not.toBeNull();
  });

  it("regenerar troca o token e o link antigo morre em 404", async () => {
    const lead = await criarLead(f);
    const orc = await criarOrcamento(f, { leadId: lead.id, status: "ENVIADO" });
    const { body: antigo } = await gerar(orc.id).expect(200);
    const { body: novo } = await gerar(orc.id).expect(200);
    expect(novo.token).not.toBe(antigo.token);

    await abrir(antigo.token).expect(404);
    await abrir(novo.token).expect(200);
  });

  it("expirado é 410; token desconhecido é 404; RECUSADO não gera (422)", async () => {
    const lead = await criarLead(f);
    const orc = await criarOrcamento(f, { leadId: lead.id, status: "ENVIADO" });
    const { body: link } = await gerar(orc.id).expect(200);
    await db
      .update(orcamentosTable)
      .set({ publicoExpiraEm: new Date(Date.now() - 1000) })
      .where(eq(orcamentosTable.id, orc.id));
    await abrir(link.token).expect(410);

    await abrir("token-que-nao-existe").expect(404);

    const recusado = await criarOrcamento(f, { leadId: lead.id, status: "RECUSADO" });
    const res = await gerar(recusado.id).expect(422);
    expect(res.body.error).toBe("ORCAMENTO_RECUSADO");
  });

  it("gerar link exige sessão (401) e escopo da loja (404 para orçamento alheio)", async () => {
    const lead = await criarLead(f);
    const orc = await criarOrcamento(f, { leadId: lead.id, status: "ENVIADO" });
    await request(app).post(`/api/lojas/${f.lojaId}/orcamentos/${orc.id}/link`).expect(401);

    const outra = await criarFixture();
    try {
      const agOutra = await loginComLoja(outra.vendedoraEmail, outra.lojaId);
      await agOutra.post(`/api/lojas/${outra.lojaId}/orcamentos/${orc.id}/link`).expect(404);
    } finally {
      await limparFixture(outra);
    }
  });
});
