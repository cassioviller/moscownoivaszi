import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, restoreDrillLogTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E89 — o registro do drill do restore.
 *
 * O drill em si é um script (restaura o dump mais recente num banco efêmero e
 * confere contra a origem); aqui se testa o que a TELA precisa: o resultado do
 * último drill sai pela MESMA API do status de backup (`GET /admin/backup`,
 * campo `ultimoDrill`) — é a linha "restaurado e conferido em X" ao lado do
 * "último backup: há X horas".
 */
describe("Registro do drill de restore (E89)", () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<typeof loginComLoja>>;
  const idsCriados: string[] = [];

  async function inserirDrill(overrides: Partial<typeof restoreDrillLogTable.$inferInsert>) {
    const id = randomUUID();
    idsCriados.push(id);
    const [linha] = await db
      .insert(restoreDrillLogTable)
      .values({ id, status: "ok", ...overrides })
      .returning();
    return linha;
  }

  beforeAll(async () => {
    f = await criarFixture();
    admin = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    if (idsCriados.length > 0) {
      await db.delete(restoreDrillLogTable).where(inArray(restoreDrillLogTable.id, idsCriados));
    }
    await limparFixture(f);
    await fecharPool();
  });

  it("o status de backup traz o ÚLTIMO drill, com o rastro completo", async () => {
    // Um drill antigo (2020) e um recém-concluído: a tela mostra o mais novo.
    await inserirDrill({
      iniciadoEm: new Date(Date.UTC(2020, 0, 1, 12)),
      concluidoEm: new Date(Date.UTC(2020, 0, 1, 12, 5)),
      dumpArquivo: "moscow-antigo.sql.gz",
      tabelasConferidas: 10,
    });
    const agora = new Date();
    const novo = await inserirDrill({
      iniciadoEm: agora,
      concluidoEm: new Date(agora.getTime() + 60_000),
      dumpArquivo: "moscow-novo.sql.gz",
      tabelasConferidas: 42,
    });

    const res = await admin.get("/api/admin/backup").expect(200);
    expect(res.body.ultimoDrill).toBeTruthy();
    expect(res.body.ultimoDrill.id).toBe(novo.id);
    expect(res.body.ultimoDrill.status).toBe("ok");
    expect(res.body.ultimoDrill.dumpArquivo).toBe("moscow-novo.sql.gz");
    expect(res.body.ultimoDrill.tabelasConferidas).toBe(42);
    expect(new Date(res.body.ultimoDrill.concluidoEm).getTime()).toBeGreaterThan(
      new Date(res.body.ultimoDrill.iniciadoEm).getTime(),
    );
  });

  it("um drill que FALHOU aparece como falha, com o erro — não some da tela", async () => {
    const depois = new Date(Date.now() + 1000);
    const falho = await inserirDrill({
      status: "erro",
      iniciadoEm: depois,
      concluidoEm: new Date(depois.getTime() + 30_000),
      dumpArquivo: "moscow-novo.sql.gz",
      erro: "restore divergiu da origem — parcelas: origem=10 drill=9",
    });

    const res = await admin.get("/api/admin/backup").expect(200);
    expect(res.body.ultimoDrill.id).toBe(falho.id);
    expect(res.body.ultimoDrill.status).toBe("erro");
    expect(res.body.ultimoDrill.erro).toContain("divergiu");
  });

  it("quem não é superadmin não vê o status (403)", async () => {
    const vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await vendedora.get("/api/admin/backup").expect(403);
  });
});
