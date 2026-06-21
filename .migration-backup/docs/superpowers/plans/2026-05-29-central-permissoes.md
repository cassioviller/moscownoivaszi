# Central de Permissões Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar duas telas de gestão de permissões — templates globais (`/admin/perfis`, super-admin) e override por loja (`/loja/[lojaId]/permissoes`, admin) — sobre um modelo snapshot com isolamento via `tenantPrisma`.

**Architecture:** Nova tabela `PerfilOverrideLoja` (PK composta `(lojaId, perfilId)`) dentro do guard `tenantPrisma`. `podeNoModulo` passa a resolver `override ?? template`, ambos normalizados (`normalizarAcessos` reconcilia shape e força `criar|editar ⇒ ver`). Um componente `MatrizPermissoes` reutilizado pelas duas telas; save por perfil; Admin é acesso-total travado.

**Tech Stack:** Next.js 16 (App Router, Server Actions, `useActionState`), Prisma 7 (`extendedWhereUnique`), Vitest (integração com Prisma real), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-05-29-central-permissoes-design.md` (v2).

**Comandos do ambiente** (Node às vezes fora do PATH; ver `docs/estado-atual.md`):
- Testes: `node node_modules/vitest/vitest.mjs run [arquivo]`
- Typecheck: `node node_modules/typescript/bin/tsc --noEmit`
- Migration: `npx prisma migrate dev --name <nome>`
- Script tsx: `node node_modules/tsx/dist/cli.mjs <script>`

---

### Task 1: Schema + migration `PerfilOverrideLoja` + entrada no guard

**Files:**
- Modify: `prisma/schema.prisma` (novo model + 2 back-relations)
- Modify: `src/lib/tenant.ts:28-34` (`TENANT_MODELS`)
- Create: `prisma/migrations/<timestamp>_add_perfil_override_loja/migration.sql` (gerada pelo Prisma)

- [ ] **Step 1: Adicionar o model ao schema**

No fim de `prisma/schema.prisma`, adicione:

```prisma
model PerfilOverrideLoja {
  lojaId         String
  perfilId       String
  acessosModulos Json
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  loja   Loja   @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  perfil Perfil @relation(fields: [perfilId], references: [id], onDelete: Cascade)

  @@id([lojaId, perfilId])
}
```

- [ ] **Step 2: Adicionar as back-relations virtuais**

Em `model Loja` (após `sessoesAtivas Sessao[]`):

```prisma
  overridesPermissao   PerfilOverrideLoja[]
```

Em `model Perfil` (após `usuarios UsuarioLoja[]`):

```prisma
  overrides PerfilOverrideLoja[]
```

- [ ] **Step 3: Registrar no guard de tenant**

Em `src/lib/tenant.ts`, dentro de `TENANT_MODELS`, adicione a entrada (mantendo o array):

```ts
export const TENANT_MODELS = [
  "Vestido",
  "Lead",
  "Atributo",
  "BloqueioVestido",
  "RegraDisponibilidade",
  "PerfilOverrideLoja",
] as const;
```

- [ ] **Step 4: Gerar a migration + client**

Run: `npx prisma migrate dev --name add_perfil_override_loja`
Expected: cria `prisma/migrations/<ts>_add_perfil_override_loja/migration.sql` com `CREATE TABLE "PerfilOverrideLoja"` (PK composta) + 2 FKs `ON DELETE CASCADE`, e regenera o Prisma Client. Sem prompt de data-loss (tabela nova).

- [ ] **Step 5: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo (o client agora conhece `prisma.perfilOverrideLoja`).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/tenant.ts
git commit -m "feat(permissoes): tabela PerfilOverrideLoja + entrada no tenantPrisma"
```

---

### Task 2: Helpers puros `normalizarAcessos` + `resolverAcessosEfetivos`

**Files:**
- Modify: `src/lib/permissoes/modulos.ts` (adiciona 2 funções puras + export)
- Create: `src/lib/permissoes/__tests__/acessos.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `src/lib/permissoes/__tests__/acessos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizarAcessos, resolverAcessosEfetivos } from "@/lib/permissoes/modulos";

describe("normalizarAcessos", () => {
  it("respeita valores conhecidos e completa shape", () => {
    const r = normalizarAcessos({ vestidos: { ver: true, criar: true, editar: false } });
    expect(r.vestidos).toEqual({ ver: true, criar: true, editar: false });
    expect(r.leads).toEqual({ ver: false, criar: false, editar: false });
    expect(Object.keys(r).sort()).toEqual(["config", "interesses", "leads", "vestidos"]);
  });

  it("descarta chaves desconhecidas (módulo e ação)", () => {
    const r = normalizarAcessos({
      vestidos: { ver: true, excluir: true },
      financeiro: { ver: true },
    }) as Record<string, unknown>;
    expect(r.financeiro).toBeUndefined();
    expect(r.vestidos).toEqual({ ver: true, criar: false, editar: false });
  });

  it("módulo/ação ausente → false (fail-closed)", () => {
    const r = normalizarAcessos({ vestidos: { criar: true } });
    // criar implica ver (coerção, abaixo); editar ausente → false
    expect(r.vestidos.editar).toBe(false);
    expect(r.interesses).toEqual({ ver: false, criar: false, editar: false });
  });

  it("coerção: criar OU editar ⇒ ver = true", () => {
    expect(normalizarAcessos({ vestidos: { criar: true } }).vestidos.ver).toBe(true);
    expect(normalizarAcessos({ leads: { editar: true } }).leads.ver).toBe(true);
    expect(normalizarAcessos({ leads: { ver: false, criar: false, editar: false } }).leads.ver).toBe(false);
  });

  it("entrada não-objeto → tudo false", () => {
    expect(normalizarAcessos(null).vestidos).toEqual({ ver: false, criar: false, editar: false });
    expect(normalizarAcessos("x").leads.ver).toBe(false);
  });
});

describe("resolverAcessosEfetivos", () => {
  const template = { vestidos: { ver: true, criar: false, editar: false } };
  const override = { vestidos: { ver: true, criar: true, editar: true } };

  it("override presente → usa override normalizado", () => {
    expect(resolverAcessosEfetivos(template, override).vestidos.criar).toBe(true);
  });
  it("override null → usa template normalizado", () => {
    expect(resolverAcessosEfetivos(template, null).vestidos.criar).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `node node_modules/vitest/vitest.mjs run src/lib/permissoes/__tests__/acessos.test.ts`
Expected: FAIL — `normalizarAcessos`/`resolverAcessosEfetivos` não exportados.

- [ ] **Step 3: Implementar as funções puras**

Em `src/lib/permissoes/modulos.ts`, adicione (após os tipos, antes de `podeNoModulo`):

```ts
/**
 * Reconcilia um acessosModulos cru contra o shape atual (MODULOS × ACOES):
 * - chave conhecida → respeita; desconhecida → descarta;
 * - módulo/ação ausente → false (fail-closed);
 * - coerência: criar || editar ⇒ ver.
 * Fonte da verdade do shape: o CÓDIGO, nunca o banco.
 */
export function normalizarAcessos(raw: unknown): AcessosModulos {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as AcessosModulos;
  for (const m of MODULOS) {
    const mod = (src[m] && typeof src[m] === "object" ? src[m] : {}) as Record<string, unknown>;
    const criar = mod.criar === true;
    const editar = mod.editar === true;
    const ver = mod.ver === true || criar || editar;
    out[m] = { ver, criar, editar };
  }
  return out;
}

/** Snapshot: se há override, ignora o template para aquele perfil×loja. */
export function resolverAcessosEfetivos(template: unknown, override: unknown | null): AcessosModulos {
  return normalizarAcessos(override != null ? override : template);
}
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run: `node node_modules/vitest/vitest.mjs run src/lib/permissoes/__tests__/acessos.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissoes/modulos.ts src/lib/permissoes/__tests__/acessos.test.ts
git commit -m "feat(permissoes): normalizarAcessos + resolverAcessosEfetivos (puros, TDD)"
```

---

### Task 3: `podeNoModulo` consulta override antes do template

**Files:**
- Modify: `src/lib/permissoes/modulos.ts` (corpo de `podeNoModulo`)
- Modify: `src/lib/permissoes/__tests__/modulos.test.ts` (novos casos P5–P7)

- [ ] **Step 1: Escrever os testes novos (falhando)**

Em `src/lib/permissoes/__tests__/modulos.test.ts`, dentro do bloco `beforeAll`, após criar `perfilVend`, crie um override e um usuário/perfil Admin pelo ID canônico. Adicione ao topo (com os outros `let`): `let uAdminCanonico = "";`. No `beforeAll`, ao final, adicione:

```ts
  // Override: na ESTA loja, a vendedora ganha vestidos.criar (snapshot completo).
  await prisma.perfilOverrideLoja.create({
    data: {
      lojaId: loja,
      perfilId: perfilVend,
      acessosModulos: {
        leads: { ver: true, criar: true, editar: true },
        interesses: { ver: true, criar: true, editar: true },
        vestidos: { ver: true, criar: true, editar: false },
        config: { ver: false, criar: false, editar: false },
      },
    } as never,
  });

  // Usuário com o perfil ADMIN canônico (id "perfil-admin"), vinculado à loja.
  const padmin = await prisma.perfil.upsert({
    where: { id: "perfil-admin" },
    update: {},
    create: { id: "perfil-admin", nome: "Admin", acessosModulos: {} },
  });
  uAdminCanonico = (await mk("adminc")).id;
  await prisma.usuarioLoja.create({ data: { usuarioId: uAdminCanonico, lojaId: loja, perfilId: padmin.id } });
```

No `afterAll`, adicione a limpeza do override (o perfil `perfil-admin` é compartilhado/seed — NÃO apagar) e **edite a linha existente** do `deleteMany` de usuários para incluir `uAdminCanonico`:

```ts
  // adicionar antes do deleteMany de usuários:
  await prisma.perfilOverrideLoja.deleteMany({ where: { lojaId: loja } });
```

```ts
  // EDITAR a linha existente (não duplicar) — incluir uAdminCanonico no array `in`:
  await prisma.usuario.deleteMany({
    where: { id: { in: [uAdmin, uVend, uSuper, uSemVinculo, uAdminCanonico] } },
  });
```

> Nota p/ o implementador: se a suíte rodar contra um banco SEM seed, o `upsert` de `perfil-admin` cria a linha com `acessosModulos: {}` e ela persiste. É inofensivo (P6 faz short-circuit por `perfilId` antes de ler flags) — deixe um comentário no teste para um mantenedor futuro não "consertar" apagando o perfil de seed.

Adicione os casos de teste no `describe("podeNoModulo")`:

```ts
  it("override > template: vendedora ganha vestidos.criar nesta loja (P5)", async () => {
    expect(await podeNoModulo(uVend, loja, "vestidos", "criar")).toBe(true);
    expect(await podeNoModulo(uVend, loja, "vestidos", "editar")).toBe(false);
  });

  it("perfil Admin canônico → acesso total, independe de flags (P6)", async () => {
    expect(await podeNoModulo(uAdminCanonico, loja, "vestidos", "editar")).toBe(true);
    expect(await podeNoModulo(uAdminCanonico, loja, "config", "criar")).toBe(true);
  });
```

> Nota: o caso "ausência de override → template" já é coberto por P2/P3 nos perfis sem override.

- [ ] **Step 2: Rodar para confirmar que falham**

Run: `node node_modules/vitest/vitest.mjs run src/lib/permissoes/__tests__/modulos.test.ts`
Expected: FAIL — P5 retorna false (override ainda não consultado); P6 pode falhar conforme template vazio.

- [ ] **Step 3: Reescrever `podeNoModulo`**

Em `src/lib/permissoes/modulos.ts`, ajuste os imports do topo e o corpo da função:

```ts
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { PERFIL_ADMIN_ID } from "@/lib/admin/usuarios";
```

```ts
export async function podeNoModulo(
  usuarioId: string,
  lojaId: string,
  modulo: Modulo,
  acao: Acao,
): Promise<boolean> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { isSuperAdmin: true },
  });
  if (usuario?.isSuperAdmin) return true;

  // UsuarioLoja é a exceção do guard (lido via prisma direto, por usuarioId).
  const vinculo = await prisma.usuarioLoja.findUnique({
    where: { usuarioId_lojaId: { usuarioId, lojaId } },
    select: { perfilId: true, perfil: { select: { acessosModulos: true } } },
  });
  if (!vinculo) return false;
  if (vinculo.perfilId === PERFIL_ADMIN_ID) return true;

  // Override por loja passa pelo guard; where não-único {perfilId} → guard injeta lojaId.
  const override = await tenantPrisma(prisma, lojaId).perfilOverrideLoja.findFirst({
    where: { perfilId: vinculo.perfilId },
    select: { acessosModulos: true },
  });
  const efetivo = resolverAcessosEfetivos(
    vinculo.perfil.acessosModulos,
    override?.acessosModulos ?? null,
  );
  return efetivo[modulo][acao] === true;
}
```

- [ ] **Step 4: Rodar para confirmar que passam**

Run: `node node_modules/vitest/vitest.mjs run src/lib/permissoes/__tests__/modulos.test.ts`
Expected: PASS (P1–P6).

- [ ] **Step 5: Suíte completa + typecheck (regressão)**

Run: `node node_modules/vitest/vitest.mjs run` e `node node_modules/typescript/bin/tsc --noEmit`
Expected: tudo verde (os testes P2/P3 antigos seguem válidos — perfis sem override caem no template).

- [ ] **Step 6: Commit**

```bash
git add src/lib/permissoes/modulos.ts src/lib/permissoes/__tests__/modulos.test.ts
git commit -m "feat(permissoes): podeNoModulo resolve override > template (Admin=total)"
```

---

### Task 4: Camada de dados `perfis.ts` + constante `PERFIL_RECEPCAO_ID`

**Files:**
- Modify: `src/lib/admin/usuarios.ts:6-7` (nova constante)
- Create: `src/lib/permissoes/perfis.ts`
- Create: `src/lib/permissoes/__tests__/perfis.test.ts`

- [ ] **Step 1: Adicionar a constante de perfil Recepção**

Em `src/lib/admin/usuarios.ts`, junto às outras constantes:

```ts
export const PERFIL_RECEPCAO_ID = "perfil-recepcao";
```

- [ ] **Step 2: Escrever os testes (falhando)**

Crie `src/lib/permissoes/__tests__/perfis.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  listarPerfis,
  salvarTemplate,
  listarOverridesDaLoja,
  salvarOverride,
  removerOverride,
} from "@/lib/permissoes/perfis";

const MARK = "t-perfis-";
let lojaA = "";
let lojaB = "";
let perfil = "";

beforeAll(async () => {
  lojaA = (await prisma.loja.create({ data: { nome: `${MARK}A` } })).id;
  lojaB = (await prisma.loja.create({ data: { nome: `${MARK}B` } })).id;
  perfil = (await prisma.perfil.create({
    data: { nome: `${MARK}vend`, acessosModulos: { vestidos: { ver: true, criar: false, editar: false } } },
  })).id;
});

afterAll(async () => {
  await prisma.perfilOverrideLoja.deleteMany({ where: { lojaId: { in: [lojaA, lojaB] } } });
  await prisma.loja.deleteMany({ where: { id: { in: [lojaA, lojaB] } } });
  await prisma.perfil.delete({ where: { id: perfil } });
  await prisma.$disconnect();
});

describe("perfis data layer", () => {
  it("salvarTemplate normaliza e grava (criar ⇒ ver)", async () => {
    await salvarTemplate(perfil, { vestidos: { criar: true } });
    const lista = await listarPerfis();
    const p = lista.find((x) => x.id === perfil)!;
    expect(p.acessosModulos.vestidos).toEqual({ ver: true, criar: true, editar: false });
  });

  it("salvarOverride cria, depois atualiza (snapshot por loja)", async () => {
    await salvarOverride(lojaA, perfil, { vestidos: { ver: true, criar: true, editar: false } });
    let m = await listarOverridesDaLoja(lojaA);
    expect(m.get(perfil)?.vestidos.criar).toBe(true);

    await salvarOverride(lojaA, perfil, { vestidos: { ver: true, criar: false, editar: false } });
    m = await listarOverridesDaLoja(lojaA);
    expect(m.get(perfil)?.vestidos.criar).toBe(false);
  });

  it("override é escopado por loja (zero-vazamento)", async () => {
    await salvarOverride(lojaA, perfil, { vestidos: { ver: true, criar: true, editar: true } });
    const mB = await listarOverridesDaLoja(lojaB);
    expect(mB.has(perfil)).toBe(false);
  });

  it("removerOverride é idempotente e volta a Padrão", async () => {
    await salvarOverride(lojaA, perfil, { vestidos: { ver: true, criar: true, editar: true } });
    await removerOverride(lojaA, perfil);
    await removerOverride(lojaA, perfil); // 2ª vez não lança
    const m = await listarOverridesDaLoja(lojaA);
    expect(m.has(perfil)).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar para confirmar que falham**

Run: `node node_modules/vitest/vitest.mjs run src/lib/permissoes/__tests__/perfis.test.ts`
Expected: FAIL — módulo `perfis` não existe.

- [ ] **Step 4: Implementar a camada de dados**

Crie `src/lib/permissoes/perfis.ts`:

```ts
// src/lib/permissoes/perfis.ts
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { normalizarAcessos, type AcessosModulos } from "@/lib/permissoes/modulos";

export type PerfilListado = { id: string; nome: string; acessosModulos: AcessosModulos };

/** Perfis globais (templates), ordenados por nome. */
export async function listarPerfis(): Promise<PerfilListado[]> {
  const perfis = await prisma.perfil.findMany({ orderBy: { nome: "asc" } });
  return perfis.map((p) => ({
    id: p.id,
    nome: p.nome,
    acessosModulos: normalizarAcessos(p.acessosModulos),
  }));
}

/** Edita o template global de um perfil (super-admin). */
export async function salvarTemplate(perfilId: string, acessos: unknown): Promise<void> {
  await prisma.perfil.update({
    where: { id: perfilId },
    data: { acessosModulos: normalizarAcessos(acessos) as never },
  });
}

/** Overrides de uma loja: Map perfilId → acessos normalizados. Escopado pelo guard. */
export async function listarOverridesDaLoja(lojaId: string): Promise<Map<string, AcessosModulos>> {
  const rows = await tenantPrisma(prisma, lojaId).perfilOverrideLoja.findMany({});
  return new Map(rows.map((r) => [r.perfilId, normalizarAcessos(r.acessosModulos)]));
}

/** Cria/atualiza o override de um perfil na loja (snapshot). where não-único → guard injeta lojaId. */
export async function salvarOverride(lojaId: string, perfilId: string, acessos: unknown): Promise<void> {
  const tp = tenantPrisma(prisma, lojaId);
  const acessosModulos = normalizarAcessos(acessos);
  const existente = await tp.perfilOverrideLoja.findFirst({ where: { perfilId } });
  if (existente) {
    await tp.perfilOverrideLoja.updateMany({ where: { perfilId }, data: { acessosModulos } as never });
  } else {
    await tp.perfilOverrideLoja.create({ data: { perfilId, acessosModulos } as never });
  }
}

/** Remove o override (volta a herdar o template). Idempotente. */
export async function removerOverride(lojaId: string, perfilId: string): Promise<void> {
  await tenantPrisma(prisma, lojaId).perfilOverrideLoja.deleteMany({ where: { perfilId } });
}
```

- [ ] **Step 5: Rodar para confirmar que passam**

Run: `node node_modules/vitest/vitest.mjs run src/lib/permissoes/__tests__/perfis.test.ts`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/usuarios.ts src/lib/permissoes/perfis.ts src/lib/permissoes/__tests__/perfis.test.ts
git commit -m "feat(permissoes): camada de dados perfis (template + override) + PERFIL_RECEPCAO_ID"
```

---

### Task 5: Componente `MatrizPermissoes`

**Files:**
- Create: `src/components/permissoes/matriz-permissoes.tsx`

> Sem teste unitário (Client Component de UI; validado no smoke da Task 8). A regra de negócio (coerção) é testada no servidor via `normalizarAcessos`.

- [ ] **Step 1: Implementar o componente**

Crie `src/components/permissoes/matriz-permissoes.tsx`:

```tsx
// src/components/permissoes/matriz-permissoes.tsx
"use client";

import { useActionState, useState } from "react";
import type { AcessosModulos, Modulo, Acao } from "@/lib/permissoes/modulos";

export type MatrizFormState = { erro: string | null; ok: boolean };
const INICIAL: MatrizFormState = { erro: null, ok: false };

const ROTULO_MODULO: Record<Modulo, string> = {
  leads: "Leads",
  interesses: "Interesses",
  vestidos: "Vestidos",
  config: "Configurações",
};
const ROTULO_ACAO: Record<Acao, string> = { ver: "Ver", criar: "Criar", editar: "Editar" };
const ACOES_UI: Acao[] = ["ver", "criar", "editar"];

export function MatrizPermissoes({
  perfilId,
  perfilNome,
  valores,
  modulosVisiveis,
  modo,
  estado,
  salvarAction,
  restaurarAction,
}: {
  perfilId: string;
  perfilNome: string;
  valores: AcessosModulos;
  modulosVisiveis: Modulo[];
  modo: "editavel" | "readonly";
  estado?: "padrao" | "personalizado";
  salvarAction?: (prev: MatrizFormState, fd: FormData) => Promise<MatrizFormState>;
  restaurarAction?: (fd: FormData) => void | Promise<void>;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-borda bg-papel-elevado px-5 py-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-medium tracking-tight text-tinta">{perfilNome}</h2>
        {modo === "readonly" ? (
          <span className="text-[12px] text-cinza-fumo">Acesso total — perfil do sistema</span>
        ) : (
          <span className="text-[12px] text-grafite">
            {estado === "personalizado" ? "Personalizado" : "Padrão"}
          </span>
        )}
      </header>

      {modo === "readonly" ? (
        <Grade perfilId={perfilId} valores={valores} modulos={modulosVisiveis} disabled />
      ) : (
        <FormEditavel
          perfilId={perfilId}
          perfilNome={perfilNome}
          valores={valores}
          modulos={modulosVisiveis}
          estado={estado}
          salvarAction={salvarAction!}
          restaurarAction={restaurarAction}
        />
      )}
    </section>
  );
}

function FormEditavel({
  perfilId,
  perfilNome,
  valores,
  modulos,
  estado,
  salvarAction,
  restaurarAction,
}: {
  perfilId: string;
  perfilNome: string;
  valores: AcessosModulos;
  modulos: Modulo[];
  estado?: "padrao" | "personalizado";
  salvarAction: (prev: MatrizFormState, fd: FormData) => Promise<MatrizFormState>;
  restaurarAction?: (fd: FormData) => void | Promise<void>;
}) {
  const [state, formAction, pending] = useActionState(salvarAction, INICIAL);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="perfilId" value={perfilId} />
      <Grade perfilId={perfilId} valores={valores} modulos={modulos} disabled={false} />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center w-fit rounded-md bg-bordo px-4 py-2.5
            text-[14px] font-medium tracking-[0.01em] text-papel transition-colors duration-150 ease-out
            hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {estado === "personalizado" && restaurarAction && (
          <button
            type="submit"
            formAction={restaurarAction}
            formNoValidate
            onClick={(e) => {
              if (
                !confirm(
                  "Restaurar padrão? As permissões personalizadas desta loja serão removidas e este perfil voltará a seguir o modelo global.",
                )
              ) {
                e.preventDefault();
              }
            }}
            className="text-[13px] text-grafite hover:text-bordo transition-colors duration-150"
          >
            Restaurar padrão
          </button>
        )}
      </div>
      {state.ok && <p className="text-[13px] text-grafite">{perfilNome} atualizado.</p>}
      {state.erro && (
        <p role="alert" className="text-[13px] text-bordo">
          {state.erro}
        </p>
      )}
    </form>
  );
}

function Grade({
  perfilId,
  valores,
  modulos,
  disabled,
}: {
  perfilId: string;
  valores: AcessosModulos;
  modulos: Modulo[];
  disabled: boolean;
}) {
  return (
    <table className="w-full text-[14px]">
      <thead>
        <tr className="text-[12px] text-cinza-fumo">
          <th className="text-left font-medium py-1">Módulo</th>
          {ACOES_UI.map((a) => (
            <th key={a} className="font-medium py-1 px-2 w-16 text-center">
              {ROTULO_ACAO[a]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {modulos.map((m) => (
          <LinhaModulo
            key={m}
            perfilId={perfilId}
            modulo={m}
            valores={valores[m]}
            disabled={disabled}
          />
        ))}
      </tbody>
    </table>
  );
}

function LinhaModulo({
  perfilId,
  modulo,
  valores,
  disabled,
}: {
  perfilId: string;
  modulo: Modulo;
  valores: { ver: boolean; criar: boolean; editar: boolean };
  disabled: boolean;
}) {
  const [ver, setVer] = useState(valores.ver);
  const [criar, setCriar] = useState(valores.criar);
  const [editar, setEditar] = useState(valores.editar);

  // Coerência (UX): criar/editar ⇒ ver; desmarcar ver cascateia.
  function onCriar(v: boolean) {
    setCriar(v);
    if (v) setVer(true);
  }
  function onEditar(v: boolean) {
    setEditar(v);
    if (v) setVer(true);
  }
  function onVer(v: boolean) {
    setVer(v);
    if (!v) {
      setCriar(false);
      setEditar(false);
    }
  }
  const verTravado = criar || editar;

  return (
    <tr className="border-t border-borda-suave text-tinta">
      <td className="py-2 text-grafite">{ROTULO_MODULO[modulo]}</td>
      <td className="text-center">
        <Caixa name={`${modulo}.ver`} checked={ver} disabled={disabled || verTravado} onChange={onVer} />
      </td>
      <td className="text-center">
        <Caixa name={`${modulo}.criar`} checked={criar} disabled={disabled} onChange={onCriar} />
      </td>
      <td className="text-center">
        <Caixa name={`${modulo}.editar`} checked={editar} disabled={disabled} onChange={onEditar} />
      </td>
    </tr>
  );
}

function Caixa({
  name,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      name={name}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 accent-bordo align-middle disabled:opacity-40 disabled:cursor-not-allowed"
    />
  );
}
```

> Nota de form: checkbox desmarcado não envia valor; a action reconstrói o shape lendo `formData.get("<modulo>.<acao>") === "on"` e passa por `normalizarAcessos`. Checkbox `disabled` também não envia — por isso, para a coluna **Ver travada** (quando criar/editar marcados), a action infere `ver` via `normalizarAcessos` (criar||editar ⇒ ver). Coberto.

- [ ] **Step 2: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add src/components/permissoes/matriz-permissoes.tsx
git commit -m "feat(permissoes): componente MatrizPermissoes (reutilizável, coerência no cliente)"
```

---

### Task 6: Tela `/admin/perfis` (templates globais, super-admin)

**Files:**
- Create: `src/app/admin/perfis/page.tsx`
- Create: `src/app/admin/perfis/actions.ts`
- Modify: `src/app/admin/page.tsx` (link "Perfis")

- [ ] **Step 1: Criar a action de salvar template**

Crie `src/app/admin/perfis/actions.ts`:

```ts
// src/app/admin/perfis/actions.ts
"use server";

import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { MODULOS, ACOES } from "@/lib/permissoes/modulos";
import { salvarTemplate } from "@/lib/permissoes/perfis";
import { PERFIL_ADMIN_ID } from "@/lib/admin/usuarios";
import type { MatrizFormState } from "@/components/permissoes/matriz-permissoes";

function lerAcessos(fd: FormData): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  for (const m of MODULOS) {
    out[m] = {} as Record<string, boolean>;
    for (const a of ACOES) out[m][a] = fd.get(`${m}.${a}`) === "on";
  }
  return out;
}

export async function salvarTemplateAction(
  _prev: MatrizFormState,
  fd: FormData,
): Promise<MatrizFormState> {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (!sessao.usuario.isSuperAdmin) redirect("/");

  const perfilId = String(fd.get("perfilId") ?? "");
  if (!perfilId || perfilId === PERFIL_ADMIN_ID) {
    return { erro: "Perfil inválido.", ok: false };
  }
  try {
    await salvarTemplate(perfilId, lerAcessos(fd));
  } catch {
    return { erro: "Não foi possível salvar.", ok: false };
  }
  return { erro: null, ok: true };
}
```

- [ ] **Step 2: Criar a página de templates**

Crie `src/app/admin/perfis/page.tsx`:

```tsx
// src/app/admin/perfis/page.tsx
import { listarPerfis } from "@/lib/permissoes/perfis";
import { PERFIL_ADMIN_ID } from "@/lib/admin/usuarios";
import { MODULOS, type Modulo } from "@/lib/permissoes/modulos";
import { MatrizPermissoes } from "@/components/permissoes/matriz-permissoes";
import { salvarTemplateAction } from "./actions";

export const dynamic = "force-dynamic";

const MODULOS_VISIVEIS: Modulo[] = MODULOS.filter((m) => m !== "config");

export default async function PerfisPage() {
  const perfis = await listarPerfis();
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-light tracking-tight text-tinta">Perfis (modelos globais)</h1>
        <p className="text-[13px] text-cinza-fumo">
          Permissões padrão herdadas por todas as lojas. Cada loja pode personalizar.
        </p>
      </header>
      {perfis.map((p) => (
        <MatrizPermissoes
          key={p.id}
          perfilId={p.id}
          perfilNome={p.nome}
          valores={p.acessosModulos}
          modulosVisiveis={MODULOS_VISIVEIS}
          modo={p.id === PERFIL_ADMIN_ID ? "readonly" : "editavel"}
          salvarAction={salvarTemplateAction}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 3: Linkar a partir do console `/admin`**

Em `src/app/admin/page.tsx`, importe `Link` (`import Link from "next/link";`) e adicione, logo após o `<section>` de Admins (antes do fechamento `</>`):

```tsx
      <Link
        href="/admin/perfis"
        className="text-[14px] text-grafite hover:text-tinta transition-colors duration-150 w-fit"
      >
        Gerenciar perfis (modelos globais) →
      </Link>
```

- [ ] **Step 4: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/perfis src/app/admin/page.tsx
git commit -m "feat(permissoes): tela /admin/perfis (edita templates globais)"
```

---

### Task 7: Tela `/loja/[lojaId]/permissoes` (override da loja, admin)

**Files:**
- Create: `src/app/(app)/loja/[lojaId]/permissoes/page.tsx`
- Create: `src/app/(app)/loja/[lojaId]/permissoes/actions.ts`
- Modify: `src/app/(app)/loja/[lojaId]/page.tsx` (link "Permissões")

- [ ] **Step 1: Criar as actions (salvar override + restaurar padrão)**

Crie `src/app/(app)/loja/[lojaId]/permissoes/actions.ts`:

```ts
// src/app/(app)/loja/[lojaId]/permissoes/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessaoComLoja } from "@/lib/auth";
import { ehAdminDaLoja, PERFIL_ADMIN_ID } from "@/lib/admin/usuarios";
import { MODULOS, ACOES } from "@/lib/permissoes/modulos";
import { salvarOverride, removerOverride } from "@/lib/permissoes/perfis";
import type { MatrizFormState } from "@/components/permissoes/matriz-permissoes";

function lerAcessos(fd: FormData): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  for (const m of MODULOS) {
    out[m] = {} as Record<string, boolean>;
    for (const a of ACOES) out[m][a] = fd.get(`${m}.${a}`) === "on";
  }
  return out;
}

async function guard() {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await ehAdminDaLoja(sc.usuario.id, sc.loja.id))) redirect(`/loja/${sc.loja.id}`);
  return sc;
}

export async function salvarOverrideAction(
  _prev: MatrizFormState,
  fd: FormData,
): Promise<MatrizFormState> {
  const sc = await guard();
  const perfilId = String(fd.get("perfilId") ?? "");
  if (!perfilId || perfilId === PERFIL_ADMIN_ID) {
    return { erro: "Perfil inválido.", ok: false };
  }
  try {
    await salvarOverride(sc.loja.id, perfilId, lerAcessos(fd));
  } catch {
    return { erro: "Não foi possível salvar.", ok: false };
  }
  revalidatePath(`/loja/${sc.loja.id}/permissoes`);
  return { erro: null, ok: true };
}

export async function restaurarPadraoAction(fd: FormData): Promise<void> {
  const sc = await guard();
  const perfilId = String(fd.get("perfilId") ?? "");
  if (perfilId && perfilId !== PERFIL_ADMIN_ID) {
    await removerOverride(sc.loja.id, perfilId);
  }
  redirect(`/loja/${sc.loja.id}/permissoes`);
}
```

- [ ] **Step 2: Criar a página de override**

Crie `src/app/(app)/loja/[lojaId]/permissoes/page.tsx`:

```tsx
// src/app/(app)/loja/[lojaId]/permissoes/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessaoComLoja } from "@/lib/auth";
import { ehAdminDaLoja, PERFIL_ADMIN_ID } from "@/lib/admin/usuarios";
import { listarPerfis, listarOverridesDaLoja } from "@/lib/permissoes/perfis";
import { resolverAcessosEfetivos, MODULOS, type Modulo } from "@/lib/permissoes/modulos";
import { MatrizPermissoes } from "@/components/permissoes/matriz-permissoes";
import { salvarOverrideAction, restaurarPadraoAction } from "./actions";

export const dynamic = "force-dynamic";

const MODULOS_VISIVEIS: Modulo[] = MODULOS.filter((m) => m !== "config");

export default async function PermissoesPage() {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await ehAdminDaLoja(sc.usuario.id, sc.loja.id))) redirect(`/loja/${sc.loja.id}`);

  const [perfis, overrides] = await Promise.all([
    listarPerfis(),
    listarOverridesDaLoja(sc.loja.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          href={`/loja/${sc.loja.id}`}
          className="text-[13px] text-grafite hover:text-tinta transition-colors duration-150 w-fit"
        >
          ← {sc.loja.nome}
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Permissões</h1>
        <p className="text-[13px] text-cinza-fumo">
          O que cada perfil pode fazer nesta loja. Sem personalização, segue o modelo global.
        </p>
      </header>

      {perfis.map((p) => {
        const override = overrides.get(p.id) ?? null;
        const efetivo = resolverAcessosEfetivos(p.acessosModulos, override);
        return (
          <MatrizPermissoes
            key={p.id}
            perfilId={p.id}
            perfilNome={p.nome}
            valores={efetivo}
            modulosVisiveis={MODULOS_VISIVEIS}
            modo={p.id === PERFIL_ADMIN_ID ? "readonly" : "editavel"}
            estado={override ? "personalizado" : "padrao"}
            salvarAction={salvarOverrideAction}
            restaurarAction={restaurarPadraoAction}
          />
        );
      })}
    </main>
  );
}
```

- [ ] **Step 3: Linkar a partir do dashboard da loja**

Em `src/app/(app)/loja/[lojaId]/page.tsx`, dentro do `<nav>`, logo após o bloco `{podeGerenciarEquipe && (...Gerenciar equipe...)}`, adicione outro bloco condicional ao mesmo `podeGerenciarEquipe`:

```tsx
        {podeGerenciarEquipe && (
          <Link
            href={`/loja/${sc.loja.id}/permissoes`}
            className="text-grafite hover:text-tinta transition-colors duration-150 w-fit"
          >
            Permissões →
          </Link>
        )}
```

- [ ] **Step 4: Typecheck + suíte completa**

Run: `node node_modules/typescript/bin/tsc --noEmit` e `node node_modules/vitest/vitest.mjs run`
Expected: ambos verdes.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/permissoes" "src/app/(app)/loja/[lojaId]/page.tsx"
git commit -m "feat(permissoes): tela /loja/[id]/permissoes (override por loja)"
```

---

### Task 8: Verificação end-to-end (smoke) + fechamento

> REQUIRED SUB-SKILL na conclusão: superpowers:verification-before-completion (evidência antes de afirmar) e, ao integrar, superpowers:finishing-a-development-branch.

**Files:** nenhum (verificação). Eventual ajuste fino se o smoke revelar problema.

- [ ] **Step 1: Subir o dev server em porta própria e checar rotas (sem-auth)**

```bash
node node_modules/next/dist/bin/next dev -p 5050 & echo "PID=$!"
# aguardar até responder 200 em /login, então:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5050/login          # 200
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:5050/admin/perfis  # 307 → /login
```
Expected: `/login` 200; `/admin/perfis` redireciona sem sessão.

- [ ] **Step 2: Smoke autenticado — override liga vestidos.criar para Vendedora**

Use os scripts de forja de sessão (`scripts/forge-sessao-smoke.ts`) para obter um cookie de admin da `loja-moscow`. Então:
1. `GET /loja/<lojaId>/permissoes` → 200, mostra Vendedora como **Padrão**.
2. `POST` a `salvarOverrideAction` com `vestidos.ver=on` e `vestidos.criar=on` (form do perfil Vendedora).
3. Confirmar via `podeNoModulo`: rodar um script tsx que chama `podeNoModulo(<idVendedora>, <lojaId>, "vestidos", "criar")` → **true**.
4. `GET /loja/<lojaId>/permissoes` → Vendedora agora **Personalizado**.

Run (verificação programática):
```bash
node node_modules/tsx/dist/cli.mjs scripts/smoke-permissoes.ts
```
Crie `scripts/smoke-permissoes.ts` que: garante override via `salvarOverride`, asserta `podeNoModulo(...criar) === true`, chama `removerOverride`, asserta `=== false`, e imprime `SMOKE OK`. (Mesmo estilo de `scripts/smoke-cria-vestido.ts`.)

Expected: `SMOKE OK`.

- [ ] **Step 3: Isolamento entre lojas**

No mesmo script, após criar override na `loja-moscow`, asserir que `listarOverridesDaLoja("loja-teste-2")` não contém o perfil → prova zero-vazamento no fluxo real.
Expected: assert passa.

- [ ] **Step 4: Limpar e derrubar o server**

```bash
node node_modules/tsx/dist/cli.mjs scripts/smoke-permissoes.ts --cleanup
pkill -f "next dev -p 5050"   # o job %1 não sobrevive entre chamadas do shell; mate por padrão de comando
```
Expected: banco volta ao estado anterior (sem override de teste).

- [ ] **Step 5: Gates finais**

Run: `node node_modules/vitest/vitest.mjs run` e `node node_modules/typescript/bin/tsc --noEmit`
Expected: 100% verde; tsc limpo.

- [ ] **Step 6: Atualizar o estado e commitar**

Atualize `docs/estado-atual.md` (nova seção "Central de permissões" + marcar a fatia como fechada). Commit:
```bash
git add docs/estado-atual.md scripts/smoke-permissoes.ts
git commit -m "docs+smoke: fecha fatia central de permissões (override por loja verificado)"
```

---

## Cobertura da spec (self-review)

- Modelo `PerfilOverrideLoja` + `tenantPrisma` → Task 1.
- `normalizarAcessos` (shape/coerção, fail-closed) + `resolverAcessosEfetivos` → Task 2.
- `podeNoModulo` override>template, Admin=total, falha-fechada → Task 3.
- Camada de dados (template + override, idempotência, isolamento) + `PERFIL_RECEPCAO_ID` → Task 4.
- `MatrizPermissoes` (readonly Admin, coerção cliente, badge, restaurar c/ confirmação) → Task 5.
- Tela `/admin/perfis` (super-admin, recusa Admin) → Task 6.
- Tela `/loja/[id]/permissoes` (admin, nested, espelhamento herdado, links) → Task 7.
- Erros/bordas (recusa Admin, normalização, idempotência, force-dynamic) → Tasks 3–7.
- Testes (puros + integração + smoke + isolamento) → Tasks 2, 3, 4, 8.
- Fora de escopo (config na grade, edição de Admin, delta) → respeitado (config filtrado em `MODULOS_VISIVEIS`; Admin readonly + recusa nas actions).
```
