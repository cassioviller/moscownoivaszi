import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarFixture, criarLead, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * S-O109/E239 — **o teto do texto livre é cobrado NA PORTA, não só no spec.**
 *
 * A `varredura-teto-do-texto-livre` prega que o spec declara o `maxLength`;
 * esta cena prega que o Zod gerado o aplica — a lição da S-C150: guarda que
 * depende do codegen só protege depois de o codegen rodar. Duas portas, uma
 * de cada teto: a NOTA (`observacoes` do vestido, 1000) e a FRASE
 * (`casamentoLocal` da noiva, 300).
 *
 * Vermelho medido em 2026-08-15, sobre o codegen de antes do conserto:
 * `expected 201 to be 400` (1001 caracteres na peça) e `expected 200 to be
 * 400` (301 no local do casamento) — o único limite era o do parser, 100 kB.
 */
describe("E239/S-O109 — texto livre acima do teto ouve 400; o teto exato passa", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("NOTA: `observacoes` do vestido — 1000 passa, 1001 recusa", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const corpo = (n: number) => ({
      codigo: `E239-${n}-${Date.now()}`,
      nome: "Peça do teto",
      precoBase: 100,
      observacoes: "x".repeat(n),
    });
    const ok = await agent.post(`/api/lojas/${f.lojaId}/vestidos`).send(corpo(1000));
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const demais = await agent.post(`/api/lojas/${f.lojaId}/vestidos`).send(corpo(1001));
    expect(demais.status).toBe(400);
  });

  it("FRASE: `casamentoLocal` da noiva — 300 passa, 301 recusa", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const ok = await agent.patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`).send({ casamentoLocal: "y".repeat(300) });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const demais = await agent.patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`).send({ casamentoLocal: "y".repeat(301) });
    expect(demais.status).toBe(400);
  });
});
