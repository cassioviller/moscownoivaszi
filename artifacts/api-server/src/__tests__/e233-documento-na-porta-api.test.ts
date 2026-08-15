import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, contratosTable, leadsTable, lojasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
 * **E233 — o documento que sai impresso entra conferido, nas SEIS portas.**
 *
 * O plano contava cinco; a medição achou a sexta (`PATCH /contratos/:id`, que
 * grava `cpf` do corpo por `...parsed.data`). Cada porta recebe um número que
 * não fecha os dígitos e tem de responder 422 nomeando o campo — e um número
 * válido SEM pontuação tem de ser gravado na grafia única.
 *
 * VERMELHO ANTES (medido no `main` antes do conserto): as seis respondiam
 * 200/201 e gravavam `12.345.678/0001-99` e `123.456.789-00` como vieram.
 */
const CNPJ_RUIM = "12.345.678/0001-99"; // o exemplo antigo do seed — não fecha
const CNPJ_BOM_CRU = "37771644000193"; // o da identificação do papel, sem pontuação
const CPF_RUIM = "123.456.789-00";
const CPF_BOM_CRU = "39053344705";

describe("E233 — CPF e CNPJ nas seis portas", () => {
  let f: Fixture;
  let dona: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    dona = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const lojaNoBanco = async (id: string) =>
    (await db.select().from(lojasTable).where(eq(lojasTable.id, id)))[0]!;

  it("1 · PATCH /lojas/:id/dados recusa o CNPJ que não fecha e normaliza o que fecha", async () => {
    const r = await dona.patch(`/api/lojas/${f.lojaId}/dados`).send({ cnpj: CNPJ_RUIM }).expect(422);
    expect(r.body.error).toBe("CNPJ_INVALIDO");
    expect(r.body.campos).toEqual([{ campo: "cnpj", motivo: expect.stringContaining("dígitos") }]);
    expect((await lojaNoBanco(f.lojaId)).cnpj).toBeNull();

    await dona.patch(`/api/lojas/${f.lojaId}/dados`).send({ cnpj: CNPJ_BOM_CRU }).expect(200);
    expect((await lojaNoBanco(f.lojaId)).cnpj).toBe("37.771.644/0001-93");

    // Vazio APAGA — documento é opcional; o que não pode é entrar errado.
    await dona.patch(`/api/lojas/${f.lojaId}/dados`).send({ cnpj: "" }).expect(200);
    expect((await lojaNoBanco(f.lojaId)).cnpj).toBeNull();
  });

  it("2 · POST /admin/lojas — a porta do console também confere", async () => {
    const r = await dona.post("/api/admin/lojas").send({ nome: "Loja E233", cnpj: CNPJ_RUIM }).expect(422);
    expect(r.body.error).toBe("CNPJ_INVALIDO");

    const ok = await dona.post("/api/admin/lojas").send({ nome: "Loja E233", cnpj: CNPJ_BOM_CRU }).expect(201);
    expect(ok.body.cnpj).toBe("37.771.644/0001-93");
    await db.delete(lojasTable).where(eq(lojasTable.id, ok.body.id));
  });

  it("3 · PATCH /admin/lojas/:id — idem", async () => {
    const id = randomUUID();
    await db.insert(lojasTable).values({ id, nome: `Loja E233 ${id.slice(0, 8)}` });
    const r = await dona.patch(`/api/admin/lojas/${id}`).send({ cnpj: CNPJ_RUIM }).expect(422);
    expect(r.body.error).toBe("CNPJ_INVALIDO");
    await dona.patch(`/api/admin/lojas/${id}`).send({ cnpj: CNPJ_BOM_CRU }).expect(200);
    expect((await lojaNoBanco(id)).cnpj).toBe("37.771.644/0001-93");
    await db.delete(lojasTable).where(eq(lojasTable.id, id));
  });

  it("4 · POST /leads recusa o CPF que não fecha e normaliza o que fecha", async () => {
    const r = await dona
      .post(`/api/lojas/${f.lojaId}/leads`)
      .send({ noivaNome: "Ana E233", cpf: CPF_RUIM })
      .expect(422);
    expect(r.body.error).toBe("CPF_INVALIDO");
    expect(r.body.campos).toEqual([{ campo: "cpf", motivo: expect.stringContaining("dígitos") }]);

    const ok = await dona
      .post(`/api/lojas/${f.lojaId}/leads`)
      .send({ noivaNome: "Ana E233", cpf: CPF_BOM_CRU })
      .expect(201);
    expect(ok.body.cpf).toBe("390.533.447-05");
  });

  it("5 · PATCH /leads/:id — corrigir a ficha passa pela mesma régua; null apaga", async () => {
    const lead = await criarLead(f);
    const r = await dona.patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`).send({ cpf: CPF_RUIM }).expect(422);
    expect(r.body.error).toBe("CPF_INVALIDO");
    await dona.patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`).send({ cpf: CPF_BOM_CRU }).expect(200);
    expect((await db.select().from(leadsTable).where(eq(leadsTable.id, lead.id)))[0]!.cpf).toBe("390.533.447-05");
    await dona.patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`).send({ cpf: null }).expect(200);
    expect((await db.select().from(leadsTable).where(eq(leadsTable.id, lead.id)))[0]!.cpf).toBeNull();
  });

  it("6 · PATCH /contratos/:id — a sexta porta, que o plano não contava", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 3000, fechadoEm: new Date() });
    const r = await dona
      .patch(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`)
      .send({ cpf: CPF_RUIM })
      .expect(422);
    expect(r.body.error).toBe("CPF_INVALIDO");
    await dona.patch(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`).send({ cpf: CPF_BOM_CRU }).expect(200);
    expect((await db.select().from(contratosTable).where(eq(contratosTable.id, contrato.id)))[0]!.cpf).toBe(
      "390.533.447-05",
    );
  });

  it("o fecho recusa a ficha antiga com CPF que não fecha — a rede atrás das portas", async () => {
    // Direto no banco, como o legado faria: nenhuma porta viu este CPF entrar.
    const lead = await criarLead(f, { cpf: CPF_RUIM });
    const r = await dona
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: f.vendedoraId, valorTotal: 3000 })
      .expect(422);
    expect(r.body.error).toBe("QUALIFICACAO_INCOMPLETA");
    expect(r.body.campos).toEqual([{ campo: "cpf", motivo: expect.stringContaining("não é válido") }]);
  });
});
