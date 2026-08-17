import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, backupLogTable, sessoesTable } from "@workspace/db";
import { eq, inArray, and, isNotNull, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, unlinkSync, rmSync } from "node:fs";
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
  // S-O26 usa um DIRETÓRIO como dump — sai com `rmSync`, não com `unlinkSync`.
  const diretoriosCriados: string[] = [];

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
    for (const abs of diretoriosCriados) {
      if (existsSync(abs)) rmSync(abs, { recursive: true, force: true });
    }
    await limparFixture(f);
    await fecharPool();
  });

  it("baixa o dump de um backup ok", async () => {
    const rel = criarDumpFake(`teste-download-${randomUUID().slice(0, 8)}.sql.gz`, "conteudo-do-dump");
    const registro = await inserirRegistro({ arquivo: rel, tamanhoBytes: 16 });

    const res = await admin.get(`/api/admin/backup/${registro.id}/download`);
    /**
     * **S-RM38 (E268) — o `.expect(200)` não dizia QUAL 410 aconteceu.**
     *
     * No worktree do E262 este teste reprovou com `expected 200 "OK", got 410
     * "Gone"` e o agente precisou reverter `artifacts/` à base para provar que
     * o vermelho era anterior ao épico dele. Os dois 410 desta porta são
     * distintos e o corpo os separa: *"já foi removido pela retenção"*
     * (`routes/admin.ts:788`, o `existsSync`) contra *"não está acessível no
     * servidor"* (`routes/admin.ts:832`, o `res.download` recusando depois da
     * guarda passar) — o primeiro é dado que sumiu, o segundo é ambiente.
     */
    expect(
      res.status,
      `esperava 200 e veio ${res.status}. O corpo diz ${JSON.stringify(res.body)?.slice(0, 200)} — ` +
        `"removido pela retenção" é o \`existsSync\` (admin.ts:788); "não está acessível" é o ` +
        `\`res.download\` recusando (admin.ts:832), que é ambiente, não repositório (S-RM38)`,
    ).toBe(200);
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

  /**
   * S-O26 — **o `existsSync` passa e o `send` recusa assim mesmo.**
   *
   * As duas 410 acima são decididas ANTES do `res.download`: registro sem
   * arquivo, e caminho que escapa de `backups/`. Esta é a terceira classe, e
   * era a que vazava 500 com a stack do `send`: o caminho existe, atravessa a
   * guarda, e o streaming falha por um motivo que ninguém perguntou —
   * permissão, corrida com a poda, ou **componente oculto no caminho**.
   *
   * O componente oculto não é hipótese: foi ele que fez este arquivo reprovar
   * em três worktrees de agente ao mesmo tempo (`.claude/worktrees/`), e ser
   * relatado como 🟠 por um deles. Aqui o gatilho é um DIRETÓRIO no lugar do
   * arquivo — determinístico, sem depender de permissão nem do caminho em que
   * a suíte roda —, mas o ramo do código é o mesmo: o callback de erro do
   * `download`.
   */
  it("410 quando o caminho existe e o `send` recusa assim mesmo (S-O26)", async () => {
    const nome = `teste-eisdir-${randomUUID().slice(0, 8)}.sql.gz`;
    const abs = path.join(BACKUP_DIR, nome);
    mkdirSync(abs, { recursive: true });
    diretoriosCriados.push(abs);
    const registro = await inserirRegistro({ arquivo: path.relative(process.cwd(), abs) });

    const res = await admin.get(`/api/admin/backup/${registro.id}/download`).expect(410);
    expect(res.body.error).toBe("BACKUP_SEM_ARQUIVO");
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
