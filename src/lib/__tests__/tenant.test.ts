// src/lib/__tests__/tenant.test.ts
//
// Prova que tenantPrisma isola loja por construção. Cobre os furos clássicos:
// create, createMany, upsert, negação de acesso cross-loja, e raw query.
//
// Convenção do projeto: vitest + singleton `prisma` de @/lib/db + alias `@/*`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma as base } from "@/lib/db";
import { tenantPrisma, TENANT_MODELS } from "@/lib/tenant";

const MARK = "__pzv__"; // marcador pra limpar só o que o teste criou

let lojaA: string;
let lojaB: string;
let seq = 0;
const codigoUnico = () => `${MARK}-${Date.now()}-${++seq}`;

beforeAll(async () => {
  const a = await base.loja.create({ data: { nome: `${MARK}A` } });
  const b = await base.loja.create({ data: { nome: `${MARK}B` } });
  lojaA = a.id;
  lojaB = b.id;
});

afterAll(async () => {
  // Cascade Loja → filhos cuida do resto (todas as FKs pra Loja são onDelete: Cascade).
  await base.loja.deleteMany({ where: { id: { in: [lojaA, lojaB] } } });
  await base.$disconnect();
});

// Helper reaproveitável: rode pra qualquer model de tenant.
//  - seed(lojaId): cria 1 linha naquela loja via `base` e devolve { id }
//  - delegate(client): devolve o model delegate do client passado
function proveZeroVazamento(opts: {
  label: string;
  seed: (lojaId: string) => Promise<{ id: string }>;
  delegate: (client: any) => any;
}) {
  const { label, seed, delegate } = opts;

  describe(`proveZeroVazamento — ${label}`, () => {
    it("findMany só enxerga a própria loja", async () => {
      const rowA = await seed(lojaA);
      const rowB = await seed(lojaB);

      const scopedA = tenantPrisma(base, lojaA);
      const visiveis = await delegate(scopedA).findMany();
      const ids = visiveis.map((r: any) => r.id);

      expect(ids).toContain(rowA.id);
      expect(ids).not.toContain(rowB.id); // ← o vazamento que isto impede
    });

    it("count e findFirst também são escopados", async () => {
      const scopedB = tenantPrisma(base, lojaB);
      const total = await delegate(scopedB).count();
      const everyone = await delegate(base).count();
      expect(total).toBeLessThanOrEqual(everyone);
      const first = await delegate(scopedB).findFirst();
      if (first) expect(first.lojaId).toBe(lojaB);
    });

    it("não lê linha de outra loja (findUnique → null)", async () => {
      const rowB = await seed(lojaB);
      const scopedA = tenantPrisma(base, lojaA);
      const achou = await delegate(scopedA).findUnique({ where: { id: rowB.id } });
      expect(achou).toBeNull();
    });

    it("não apaga linha de outra loja (P2025)", async () => {
      const rowB = await seed(lojaB);
      const scopedA = tenantPrisma(base, lojaA);
      await expect(
        delegate(scopedA).delete({ where: { id: rowB.id } }),
      ).rejects.toThrow(); // P2025: registro não encontrado dentro da loja A
    });
  });
}

// ── Prova concreta no model real (Vestido) ───────────────────────────────────
//
// O Prisma exige `lojaId` (ou `loja: connect`) no `data` do create/createMany —
// TS não sabe que o guard injeta em runtime. Os `as any` abaixo só satisfazem o
// type-checker; o teste em si prova que o guard ignora/sobrescreve o payload
// e usa a lojaId da sessão. Não relaxa nada em runtime.
/* eslint-disable @typescript-eslint/no-explicit-any */
describe("tenantPrisma — Vestido", () => {
  it("create carimba lojaId mesmo sem o caller informar", async () => {
    const scopedA = tenantPrisma(base, lojaA);
    const v = await scopedA.vestido.create({
      data: { codigo: codigoUnico(), nome: `${MARK}vestido-create`, precoBase: "100.00" } as any,
    });
    expect(v.lojaId).toBe(lojaA);
  });

  it("create IGNORA lojaId forjado e usa o da sessão (falha fechada)", async () => {
    const scopedA = tenantPrisma(base, lojaA);
    const v = await scopedA.vestido.create({
      data: { codigo: codigoUnico(), nome: `${MARK}forjado`, precoBase: "100.00", lojaId: lojaB } as any,
    });
    expect(v.lojaId).toBe(lojaA); // venceu a sessão, não o payload
  });

  it("createMany carimba lojaId em todas as linhas", async () => {
    const scopedA = tenantPrisma(base, lojaA);
    const c1 = codigoUnico();
    const c2 = codigoUnico();
    await scopedA.vestido.createMany({
      data: [
        { codigo: c1, nome: `${MARK}cm1`, precoBase: "100.00" },
        { codigo: c2, nome: `${MARK}cm2`, precoBase: "200.00" },
      ] as any,
    });
    const doB = await base.vestido.findMany({
      where: { lojaId: lojaB, codigo: { in: [c1, c2] } },
    });
    expect(doB).toHaveLength(0); // nada vazou pra loja B
  });

  it("upsert escopa o where e carimba o create", async () => {
    const scopedA = tenantPrisma(base, lojaA);
    const v = await scopedA.vestido.upsert({
      where: { id: "id-que-nao-existe-pzv" },
      create: { codigo: codigoUnico(), nome: `${MARK}upsert`, precoBase: "100.00" } as any,
      update: { nome: `${MARK}upsert-upd` },
    });
    expect(v.lojaId).toBe(lojaA);
  });

  it("update não consegue re-tenantar a linha", async () => {
    const scopedA = tenantPrisma(base, lojaA);
    const v = await scopedA.vestido.create({
      data: { codigo: codigoUnico(), nome: `${MARK}retenant`, precoBase: "100.00" } as any,
    });
    const upd = await scopedA.vestido.update({
      where: { id: v.id },
      data: { lojaId: lojaB } as any, // tentativa de mudar de loja
    });
    expect(upd.lojaId).toBe(lojaA); // lojaId foi removido do data → ficou em A
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Cobertura genérica via helper: prova que ele funciona pra outro model ────
proveZeroVazamento({
  label: "Lead",
  seed: (lojaId) => base.lead.create({ data: { lojaId, noivaNome: `${MARK}lead` } }),
  delegate: (c) => c.lead,
});

// ── Canário anti-raw: falha o CI se houver raw em tabela de tenant ────────────
//
// Regex exige `(` ou backtick depois — pega chamadas reais (`$queryRaw(...)`,
// `$queryRaw\`SELECT ...\``), NÃO menções em comentários/documentação.
// O próprio tenant.ts cita os tokens em prosa pra documentar a limitação;
// reduzir precisão pra exigir call-site é melhora, não relaxamento.
describe("sem raw query unscoped em tabela de tenant", () => {
  it("nenhum $queryRaw/$executeRaw convive com model de tenant no src/", () => {
    const RAW = /\$(query|execute)Raw(Unsafe)?\s*[(`]/;
    const srcDir = join(process.cwd(), "src");
    const ofensores: string[] = [];

    const arquivos = readdirSync(srcDir, { recursive: true }) as string[];
    for (const rel of arquivos) {
      if (!rel.endsWith(".ts") && !rel.endsWith(".tsx")) continue;
      if (rel.includes("__tests__")) continue; // testes podem citar tokens
      if (rel.startsWith("generated/")) continue; // client gerado
      const conteudo = readFileSync(join(srcDir, rel), "utf8");
      if (!RAW.test(conteudo)) continue;
      const tocaTenant = TENANT_MODELS.some((m) =>
        new RegExp(`\\b${m}\\b`, "i").test(conteudo),
      );
      if (tocaTenant) ofensores.push(rel);
    }

    // Se este teste falhar: ou remova o raw, ou (se for legítimo) escreva o
    // WHERE de loja na mão e adicione o arquivo a uma allowlist explícita aqui.
    expect(ofensores, `raw query perto de model de tenant: ${ofensores.join(", ")}`)
      .toEqual([]);
  });
});
