import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Upload de foto endurecido: o servidor deriva mime/dimensões do BINÁRIO
 * (a palavra do cliente não vale — mime mentiroso virava o Content-Type
 * servido de volta), impõe limites de tamanho e ganha thumb com fallback.
 */

const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG_1x1 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

/** PNG sintético com payload inflado até `bytes` — assinatura+IHDR válidos. */
function pngGrande(bytes: number): string {
  const buf = Buffer.alloc(bytes);
  Buffer.from(PNG_1x1, "base64").copy(buf, 0);
  return buf.toString("base64");
}

describe("Fotos de vestido — upload validado, thumb e cache", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let vestidoId: string;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    vestidoId = (await criarVestido(f)).id;
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const url = (ordem: number) => `/api/lojas/${f.lojaId}/vestidos/${vestidoId}/fotos/${ordem}`;

  it("meta derivada do binário — o cliente pode mentir que não adianta", async () => {
    const res = await agent
      .put(url(0))
      // Campos legados de cliente antigo: o zod os descarta, o servidor deriva.
      .send({ base64: PNG_1x1, mime: "text/html", largura: 999, altura: 999 })
      .expect(200);
    expect(res.body).toMatchObject({ ordem: 0, mime: "image/png", largura: 1, altura: 1 });
    expect(res.body.atualizadaEm).toBeTruthy();

    const img = await agent.get(url(0)).expect(200);
    expect(img.headers["content-type"]).toContain("image/png");
  });

  it("lixo e formato fora da whitelist → 422 FOTO_INVALIDA", async () => {
    const lixo = await agent
      .put(url(0))
      .send({ base64: Buffer.from("nada de imagem aqui").toString("base64") })
      .expect(422);
    expect(lixo.body.error).toBe("FOTO_INVALIDA");

    const gif = await agent
      .put(url(0))
      .send({ base64: Buffer.from("GIF89a\x01\x00\x01\x00", "latin1").toString("base64") })
      .expect(422);
    expect(gif.body.error).toBe("FOTO_INVALIDA");
  });

  it("foto acima de 2MiB → 422 FOTO_MUITO_GRANDE", async () => {
    const res = await agent
      .put(url(0))
      .send({ base64: pngGrande(2 * 1024 * 1024 + 1) })
      .expect(422);
    expect(res.body.error).toBe("FOTO_MUITO_GRANDE");
  });

  it("corpo acima do parser da rota → 413 (e um corpo de ~1MB passa — prova a montagem)", async () => {
    // ~7MB de base64 estoura o limit de 6mb do parser DEDICADO da rota.
    const gigante = "A".repeat(7 * 1024 * 1024);
    const res = await agent.put(url(0)).send({ base64: gigante }).expect(413);
    expect(res.body.error).toBe("PAYLOAD_MUITO_GRANDE");

    // ~1MB atravessa o parser dedicado (o global de 100kb teria barrado):
    // chega na validação de imagem e falha por CONTEÚDO, não por tamanho.
    const umMb = Buffer.alloc(1024 * 1024, 7).toString("base64");
    const ok = await agent.put(url(0)).send({ base64: umMb }).expect(422);
    expect(ok.body.error).toBe("FOTO_INVALIDA");
  });

  it("thumb servida por variante, com fallback e anulamento", async () => {
    // Upload com thumb: cheia PNG, thumb JPEG.
    await agent.put(url(1)).send({ base64: PNG_1x1, thumbBase64: JPEG_1x1 }).expect(200);

    const thumb = await agent.get(`${url(1)}?variante=thumb`).expect(200);
    expect(thumb.headers["content-type"]).toContain("image/jpeg");
    const cheia = await agent.get(`${url(1)}?variante=cheia`).expect(200);
    expect(cheia.headers["content-type"]).toContain("image/png");
    // Variantes têm ETags distintos — um 304 de uma não vale para a outra.
    expect(thumb.headers.etag).not.toBe(cheia.headers.etag);

    // Re-upload SEM thumb anula a antiga: variante=thumb cai na NOVA cheia.
    await agent.put(url(1)).send({ base64: JPEG_1x1 }).expect(200);
    const depois = await agent.get(`${url(1)}?variante=thumb`).expect(200);
    expect(depois.headers["content-type"]).toContain("image/jpeg");
    expect(depois.body.equals(Buffer.from(JPEG_1x1, "base64"))).toBe(true);
  });

  it("cache: com ?v= é immutable; sem, revalidação curta; if-none-match → 304", async () => {
    await agent.put(url(0)).send({ base64: PNG_1x1 }).expect(200);

    const semV = await agent.get(url(0)).expect(200);
    expect(semV.headers["cache-control"]).toBe("private, max-age=60, must-revalidate");

    const comV = await agent.get(`${url(0)}?v=123`).expect(200);
    expect(comV.headers["cache-control"]).toBe("private, max-age=31536000, immutable");

    await agent.get(url(0)).set("If-None-Match", semV.headers.etag).expect(304);
  });

  it("a meta nas listagens carrega atualizadaEm (a versão do cache-busting)", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/vestidos/${vestidoId}`).expect(200);
    const foto = res.body.fotos.find((x: { ordem: number }) => x.ordem === 0);
    expect(foto.atualizadaEm).toBeTruthy();
    expect(foto).not.toHaveProperty("base64");
  });
});
