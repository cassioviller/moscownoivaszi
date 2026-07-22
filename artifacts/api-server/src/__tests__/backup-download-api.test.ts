import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, backupLogTable, sessoesTable } from "@workspace/db";
import { eq, inArray, and, isNotNull, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import { podarDumpsAntigos, podarSessoesExpiradas, caminhoDoDump } from "../lib/backup";

/**
 * E59 — o dump precisa SAIR da instância.
 *
 * O E30 respondia "quando foi o último backup?", mas o arquivo ficava preso em
 * `backups/`, no MESMO disco que ele protege — e crescendo sem limite. Aqui:
 * o download em streaming (com guarda anti-traversal: linha adulterada no
 * banco não vira leitura arbitrária) e a poda que mantém só os dumps mais
 * recentes, preservando o registro histórico.
 */

const BACKUP_DIR = path.resolve(process.cwd(), "backups");

describe("Download e poda de backup (E59)", () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<typeof loginComLoja>>;
  const idsCriados: string[] = [];
  const arquivosCriados: string[] = [];

  function criarDumpFake(nome: string, conteudo = "dump-fake"): string {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const abs = path.join(BACKUP_DIR, nome);
    writeFileSync(abs, conteudo);
    arquivosCriados.push(abs);
    return path.relative(process.cwd(), abs);
  }

  async function inserirRegistro(overrides: Partial<typeof backupLogTable.$inferInsert>) {
    const id = randomUUID();
    idsCriados.push(id);
    const [linha] = await db
      .insert(backupLogTable)
      .values({ id, gatilho: "manual", status: "ok", ...overrides })
      .returning();
    return linha;
  }

  beforeAll(async () => {
    f = await criarFixture();
    admin = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    if (idsCriados.length > 0) {
      await db.delete(backupLogTable).where(inArray(backupLogTable.id, idsCriados));
    }
    for (const abs of arquivosCriados) {
      if (existsSync(abs)) unlinkSync(abs);
    }
    await limparFixture(f);
    await fecharPool();
  });

  it("baixa o dump de um backup ok", async () => {
    const rel = criarDumpFake(`teste-download-${randomUUID().slice(0, 8)}.sql.gz`, "conteudo-do-dump");
    const registro = await inserirRegistro({ arquivo: rel, tamanhoBytes: 16 });

    const res = await admin.get(`/api/admin/backup/${registro.id}/download`).expect(200);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.body.toString()).toBe("conteudo-do-dump");
  });

  it("404 para execução inexistente", async () => {
    await admin.get(`/api/admin/backup/${randomUUID()}/download`).expect(404);
  });

  it("410 quando o arquivo já foi podado (registro sem arquivo)", async () => {
    const registro = await inserirRegistro({ arquivo: null, tamanhoBytes: 999 });
    await admin.get(`/api/admin/backup/${registro.id}/download`).expect(410);
  });

  it("410 quando o caminho gravado escapa de backups/ (anti-traversal)", async () => {
    const registro = await inserirRegistro({ arquivo: "../package.json" });
    expect(caminhoDoDump(registro)).toBeNull();
    await admin.get(`/api/admin/backup/${registro.id}/download`).expect(410);
  });

  it("quem não é superadmin não baixa (403)", async () => {
    const rel = criarDumpFake(`teste-gate-${randomUUID().slice(0, 8)}.sql.gz`);
    const registro = await inserirRegistro({ arquivo: rel });
    const vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await vendedora.get(`/api/admin/backup/${registro.id}/download`).expect(403);
  });

  it("a poda remove os dumps além dos 10 mais recentes e preserva o registro", async () => {
    // Registros ANTIGOS de propósito (2020): num banco com dumps reais, os
    // reais são mais novos e nunca entram na fatia podada por causa destes.
    const antigos = [];
    for (let i = 0; i < 12; i++) {
      const rel = criarDumpFake(`teste-poda-${i}-${randomUUID().slice(0, 8)}.sql.gz`);
      antigos.push(
        await inserirRegistro({
          arquivo: rel,
          iniciadoEm: new Date(Date.UTC(2020, 0, 1 + i, 12)),
        }),
      );
    }

    await podarDumpsAntigos();

    // Invariante global: no máximo 10 linhas ok seguem com arquivo, e são
    // exatamente as 10 mais recentes.
    const comArquivo = await db
      .select()
      .from(backupLogTable)
      .where(and(eq(backupLogTable.status, "ok"), isNotNull(backupLogTable.arquivo)))
      .orderBy(desc(backupLogTable.iniciadoEm));
    expect(comArquivo.length).toBeLessThanOrEqual(10);

    // O mais antigo do lote foi certamente podado: linha fica, arquivo sai.
    const [maisAntigo] = await db
      .select()
      .from(backupLogTable)
      .where(eq(backupLogTable.id, antigos[0].id));
    expect(maisAntigo.arquivo).toBeNull();
    expect(maisAntigo.status).toBe("ok");
    expect(maisAntigo.tamanhoBytes).toBe(antigos[0].tamanhoBytes);
    expect(existsSync(path.resolve(process.cwd(), antigos[0].arquivo!))).toBe(false);

    // E o dump que acabou de nascer (mais novo que tudo) sobrevive à poda.
    const rel = criarDumpFake(`teste-poda-novo-${randomUUID().slice(0, 8)}.sql.gz`);
    const novo = await inserirRegistro({ arquivo: rel });
    await podarDumpsAntigos();
    const [novoDepois] = await db
      .select()
      .from(backupLogTable)
      .where(eq(backupLogTable.id, novo.id));
    expect(novoDepois.arquivo).not.toBeNull();
    expect(existsSync(path.resolve(process.cwd(), rel))).toBe(true);
  });

  it("a poda de sessões apaga só as expiradas", async () => {
    const expirada = randomUUID();
    const viva = randomUUID();
    await db.insert(sessoesTable).values([
      {
        id: expirada,
        usuarioId: f.vendedoraId,
        expiraEm: new Date(Date.now() - 60_000),
      },
      {
        id: viva,
        usuarioId: f.vendedoraId,
        expiraEm: new Date(Date.now() + 3_600_000),
      },
    ]);

    await podarSessoesExpiradas();

    const restantes = await db
      .select()
      .from(sessoesTable)
      .where(inArray(sessoesTable.id, [expirada, viva]));
    expect(restantes.map((s) => s.id)).toEqual([viva]);
  });
});
