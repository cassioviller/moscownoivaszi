import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarFixture, criarLead, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * E96 — a prova de que a rota está de fato ligada ao helper. O unitário mostra
 * que `erroDeValidacao` traduz; este mostra que é ISSO que sai pela porta.
 */
describe("E96 — o 400 de validação chega ao cliente traduzido", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("corpo inválido responde CORPO_INVALIDO com campos, e nada em inglês", async () => {
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: "x", vendedoraId: "y", valorTotal: "mil reais" })
      .expect(400);

    expect(r.body.error).toBe("CORPO_INVALIDO");
    expect(Array.isArray(r.body.campos)).toBe(true);
    expect(r.body.campos.map((c: { campo: string }) => c.campo)).toContain("valorTotal");
    // O corpo inteiro, serializado, não pode conter o vocabulário do Zod.
    expect(JSON.stringify(r.body)).not.toMatch(/expected|received|invalid_type/i);
  });

  it("o 422 de regra continua com código próprio — e agora diz o campo (D6)", async () => {
    const lead = await criarLead(f);
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 1000,
        parcelas: [
          { numero: 1, valorPrevisto: 400, vencimento: "2026-08-10T12:00:00-03:00" },
          { numero: 2, valorPrevisto: 400, vencimento: "2026-09-10T12:00:00-03:00" },
        ],
      })
      .expect(422);

    expect(r.body.error).toBe("PARCELAS_NAO_BATEM");
    expect(r.body.campos[0].campo).toBe("entrada");
    expect(r.body.campos[0].motivo).toContain("800");
  });

  it("query inválida mantém o código estável que já existia — cuidado (b)", async () => {
    // O perfil da vendedora não tem o módulo financeiro (mesma razão do lote 8).
    const financeiro = await loginComLoja(f.superAdminEmail, f.lojaId);
    const r = await financeiro
      .get(`/api/lojas/${f.lojaId}/financeiro/parcelas?de=hoje`)
      .expect(400);
    // Rotas que já tinham código próprio NÃO viraram CORPO_INVALIDO: elas são
    // o padrão que o épico generalizou, não a exceção que ele corrigiu.
    expect(r.body.error).toBe("INTERVALO_INVALIDO");
  });
});
