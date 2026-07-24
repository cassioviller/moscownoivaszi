import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { db, lookbooksTable, vestidoFotosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  criarFixture,
  criarLead,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Lookbook (E21): a seleção do atendimento vira link público com as fotos.
 * Regras que valem segurança: o token escopa as FOTOS (vestido fora da
 * seleção é 404 mesmo existindo), expirado é 410, revogar mata o link, e
 * lead/vestidos de outra loja não entram.
 */

// PNG 1×1 válido — o suficiente para o bytea.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("Vestidos — lookbook compartilhável (E21)", () => {
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

  const criar = (corpo: Record<string, unknown>) =>
    ag.post(`/api/lojas/${f.lojaId}/lookbooks`).send(corpo);
  const abrir = (token: string) => request(app).get(`/api/lookbooks/publico?token=${token}`);
  const abrirFoto = (token: string, vestidoId: string, ordem = 0) =>
    request(app).get(`/api/lookbooks/publico/foto?token=${token}&vestidoId=${vestidoId}&ordem=${ordem}`);

  async function comFoto(vestidoId: string): Promise<void> {
    await db.insert(vestidoFotosTable).values({
      id: randomUUID(),
      vestidoId,
      ordem: 0,
      bytes: PNG_1X1,
      mime: "image/png",
      largura: 1,
      altura: 1,
    });
  }

  it("cria a seleção e a noiva abre sem login — com as fotos escopadas ao token", async () => {
    const lead = await criarLead(f, { noivaNome: "Noiva Lookbook" });
    const v1 = await criarVestido(f);
    const v2 = await criarVestido(f);
    const foraDaSelecao = await criarVestido(f);
    await Promise.all([comFoto(v1.id), comFoto(foraDaSelecao.id)]);

    const { body: criado } = await criar({ leadId: lead.id, vestidoIds: [v1.id, v2.id] }).expect(201);
    expect(criado.token).toHaveLength(43);
    expect(criado.vestidos).toHaveLength(2);

    const res = await abrir(criado.token).expect(200);
    expect(res.body.noivaNome).toBe("Noiva Lookbook");
    expect(res.body.vestidos.map((v: { vestidoId: string }) => v.vestidoId).sort()).toEqual(
      [v1.id, v2.id].sort(),
    );
    const doV1 = res.body.vestidos.find((v: { vestidoId: string }) => v.vestidoId === v1.id);
    expect(doV1.fotos).toHaveLength(1);

    // A foto do vestido selecionado sai; a do NÃO selecionado é 404 — o token
    // não é chave do catálogo inteiro.
    const foto = await abrirFoto(criado.token, v1.id).expect(200);
    expect(foto.headers["content-type"]).toContain("image/png");
    await abrirFoto(criado.token, foraDaSelecao.id).expect(404);
  });

  it("expirado é 410; revogado é 404; token desconhecido é 404", async () => {
    const lead = await criarLead(f);
    const v = await criarVestido(f);
    const { body: criado } = await criar({ leadId: lead.id, vestidoIds: [v.id] }).expect(201);

    await db
      .update(lookbooksTable)
      .set({ expiraEm: new Date(Date.now() - 1000) })
      .where(eq(lookbooksTable.id, criado.id));
    await abrir(criado.token).expect(410);
    await abrirFoto(criado.token, v.id).expect(410);

    const { body: outro } = await criar({ leadId: lead.id, vestidoIds: [v.id] }).expect(201);
    await ag.delete(`/api/lojas/${f.lojaId}/lookbooks/${outro.id}`).expect(204);
    await abrir(outro.token).expect(404);

    await abrir("token-inexistente").expect(404);
  });

  it("lead ou vestido de OUTRA loja não entram (422); gestão exige sessão (401)", async () => {
    const lead = await criarLead(f);
    const outra = await criarFixture();
    try {
      const leadAlheio = await criarLead(outra);
      const vestidoAlheio = await criarVestido(outra);
      const vestidoMeu = await criarVestido(f);

      await criar({ leadId: leadAlheio.id, vestidoIds: [vestidoMeu.id] }).expect(422);
      await criar({ leadId: lead.id, vestidoIds: [vestidoAlheio.id] }).expect(422);
    } finally {
      await limparFixture(outra);
    }

    await request(app).post(`/api/lojas/${f.lojaId}/lookbooks`).send({}).expect(401);
    await request(app).get(`/api/lojas/${f.lojaId}/lookbooks?leadId=${lead.id}`).expect(401);
  });
});
