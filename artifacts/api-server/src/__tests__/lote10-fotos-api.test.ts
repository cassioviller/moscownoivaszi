import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, vestidoFotosTable, type Vestido } from "@workspace/db";
import {
  criarFixture,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

// Bytes arbitrários — o endpoint devolve o bytea cru; o conteúdo em si não
// importa, só que ele volte íntegro com o mime correto.
const BYTES_FOTO = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);
const MIME_FOTO = "image/png";

async function inserirFoto(vestidoId: string, ordem: number): Promise<void> {
  await db.insert(vestidoFotosTable).values({
    id: randomUUID(),
    vestidoId,
    ordem,
    bytes: BYTES_FOTO,
    mime: MIME_FOTO,
    largura: 2,
    altura: 2,
  });
}

describe("Lote 10 — GET de foto do vestido", () => {
  let f: Fixture;
  let outra: Fixture;
  let vestido: Vestido;

  beforeAll(async () => {
    f = await criarFixture();
    outra = await criarFixture();
    vestido = await criarVestido(f);
    await inserirFoto(vestido.id, 0);
  });

  afterAll(async () => {
    await limparFixture(f);
    await limparFixture(outra);
    await fecharPool();
  });

  it("serve o bytea com o mime e o conteúdo íntegros", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/vestidos/${vestido.id}/fotos/0`)
      .responseType("blob")
      .expect(200);

    expect(res.headers["content-type"]).toContain(MIME_FOTO);
    expect(res.headers["cache-control"]).toMatch(/max-age/);
    expect(res.headers["etag"]).toBeTruthy();
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(Buffer.compare(res.body, BYTES_FOTO)).toBe(0);
  });

  it("revalida com ETag → 304 quando If-None-Match bate", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const primeira = await agent
      .get(`/api/lojas/${f.lojaId}/vestidos/${vestido.id}/fotos/0`)
      .expect(200);
    await agent
      .get(`/api/lojas/${f.lojaId}/vestidos/${vestido.id}/fotos/0`)
      .set("If-None-Match", primeira.headers["etag"])
      .expect(304);
  });

  it("404 quando a ordem não existe", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await agent
      .get(`/api/lojas/${f.lojaId}/vestidos/${vestido.id}/fotos/9`)
      .expect(404);
  });

  it("404 quando a foto é de vestido de outra loja (escopo)", async () => {
    // Sessão na loja `outra`; path com lojaId de `outra` (passa no middleware),
    // mas o vestido/foto pertence a `f` → o handler barra por escopo com 404.
    const agent = await loginComLoja(outra.vendedoraEmail, outra.lojaId);
    await agent
      .get(`/api/lojas/${outra.lojaId}/vestidos/${vestido.id}/fotos/0`)
      .expect(404);
  });
});
