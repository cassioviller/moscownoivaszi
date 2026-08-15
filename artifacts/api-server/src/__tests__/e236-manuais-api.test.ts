import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import app from "../app";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";
import { MANUAIS_DE_USO, pastaDosManuais } from "../lib/manuais";

/**
 * **E236 — os manuais de uso, para baixar DENTRO do sistema.**
 *
 * Os cinco PDFs com prints são versionados em `docs/manuais/pdf/` e servidos
 * por `GET /manuais/:qual.pdf` a quem tem sessão. Antes deste épico o PDF só
 * existia no disco de quem rodou `scripts/prints-dos-manuais.ts`, e a página
 * publicada ficava fora do sistema — ninguém na loja tinha onde baixar.
 */
describe("E236 — os manuais para baixar dentro do sistema", () => {
  let f: Fixture;
  let vendedora: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });
  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("os cinco PDFs do catálogo estão VERSIONADOS — o servidor não os fabrica", () => {
    const raiz = path.resolve(__dirname, "..", "..", "..", "..");
    const versionados = execFileSync("git", ["ls-files", "docs/manuais/pdf/*.pdf"], { cwd: raiz, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    for (const m of MANUAIS_DE_USO) {
      expect(versionados, `docs/manuais/pdf/${m.qual}.pdf não está no versionamento — rode o script de prints e faça git add`).toContain(
        `docs/manuais/pdf/${m.qual}.pdf`,
      );
    }
    expect(MANUAIS_DE_USO).toHaveLength(5);
    // A pasta que o servidor lê é a mesma que o git enumera.
    expect(path.relative(raiz, pastaDosManuais())).toBe(path.join("docs", "manuais", "pdf"));
  });

  it("GET /manuais lista os cinco, com o PDF disponível — para qualquer pessoa com sessão", async () => {
    const r = await vendedora.get("/api/manuais").expect(200);
    expect(r.body.map((m: { qual: string }) => m.qual)).toEqual(["proprietario", "vendedora", "recepcao", "costureira", "noiva"]);
    for (const m of r.body as { disponivel: boolean; bytes: number | null; titulo: string }[]) {
      expect(m.disponivel, `${m.titulo} sem PDF`).toBe(true);
      expect(m.bytes).toBeGreaterThan(100_000);
    }
  });

  it("GET /manuais/:qual.pdf entrega o PDF como download; desconhecido é 404; sem sessão é 401", async () => {
    const r = await vendedora.get("/api/manuais/vendedora.pdf").expect(200);
    expect(r.headers["content-type"]).toContain("application/pdf");
    expect(r.headers["content-disposition"]).toContain('attachment; filename="vendedora.pdf"');
    expect(Number(r.headers["content-length"])).toBeGreaterThan(100_000);
    // Os primeiros bytes de um PDF.
    expect((r.body as Buffer).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const outro = await vendedora.get("/api/manuais/gerente.pdf").expect(404);
    expect(outro.body.error).toBe("MANUAL_DESCONHECIDO");

    await request(app).get("/api/manuais").expect(401);
    await request(app).get("/api/manuais/vendedora.pdf").expect(401);
  });
});
