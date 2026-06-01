# Módulo Vestidos + Permissões Granulares — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o primeiro módulo operacional (Vestidos: listar/criar/editar) escopado por `tenantPrisma`, mais a API de permissões granulares (`acessosModulos {módulo:{ver,criar,editar}}` + helper `podeNoModulo`) que ele consome; admin muta, vendedora vê.

**Architecture:** Permissões viram um helper puro de leitura (`podeNoModulo`) sobre o JSON evoluído em `Perfil.acessosModulos`. Vestidos seguem o CRUD de 3 camadas do projeto (data layer em `src/lib/vestidos/` 100% via `tenantPrisma`; rotas em `src/app/(app)/loja/[lojaId]/vestidos/` com gate duplo page+action). Criar/editar em rotas dedicadas reusando um único form Client (`useActionState`, igual ao `/login`). Sem mudança de schema (shape granular cabe no `Json`).

**Tech Stack:** Next 16.2.6 (App Router; `params`/`searchParams` são `Promise`, sempre `await`; `export const dynamic = "force-dynamic"` em rota que lê sessão/permissão) · Prisma 7 + `tenantPrisma` · React `useActionState` · Vitest 4. **Ambiente:** `node` no PATH; rodar via `node node_modules/vitest/vitest.mjs run` e `node node_modules/typescript/bin/tsc --noEmit` (binários `.bin/*` dão permission denied).

**Spec:** `docs/superpowers/specs/2026-05-29-modulo-vestidos-design.md`

---

## File Structure

- **Create** `src/lib/permissoes/modulos.ts` — `MODULOS`, `ACOES`, tipos (`Modulo`, `Acao`, `AcessosModulos`), `podeNoModulo`. Responsabilidade: enforcement de permissão por módulo×ação.
- **Create** `src/lib/permissoes/__tests__/modulos.test.ts` — P1–P4 (Postgres real, fixtures controladas).
- **Modify** `prisma/seed.ts` — helper `acessos` vira granular; reescreve os 3 perfis.
- **Modify** `src/lib/__tests__/seed.test.ts` — asserções do shape granular (S1).
- **Create** `src/lib/vestidos/vestidos.ts` — `listarVestidos`/`obterVestido`/`criarVestido`/`editarVestido` + validação + parse de preço pt-BR. Tudo via `tenantPrisma`.
- **Create** `src/lib/vestidos/__tests__/vestidos.test.ts` — V1–V6.
- **Create** `src/app/(app)/loja/[lojaId]/vestidos/actions.ts` — `criarVestidoAction`/`editarVestidoAction` (`useActionState`-compatíveis; gate `podeNoModulo`).
- **Create** `src/app/(app)/loja/[lojaId]/vestidos/vestido-form.tsx` — form Client reusado por novo/editar.
- **Create** `src/app/(app)/loja/[lojaId]/vestidos/page.tsx` — lista (gate `ver`) + CTA admin.
- **Create** `src/app/(app)/loja/[lojaId]/vestidos/novo/page.tsx` — criar (gate `criar`).
- **Create** `src/app/(app)/loja/[lojaId]/vestidos/[vestidoId]/editar/page.tsx` — editar (gate `editar`).
- **Modify** `src/app/(app)/loja/[lojaId]/page.tsx` — link "Ver vestidos →" no dashboard.

Rotas/Client (cookie-dependentes) não têm unit test — cobertas por `tsc` + smoke, como na B.2-T3. A lógica testável vive em `modulos.ts` e `vestidos.ts`.

---

## Task 1: Helper de permissões `podeNoModulo`

**Files:**
- Create: `src/lib/permissoes/modulos.ts`
- Test: `src/lib/permissoes/__tests__/modulos.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/permissoes/__tests__/modulos.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { podeNoModulo } from "@/lib/permissoes/modulos";

const MARK = "t-pm-";
const HASH = "$2a$10$dummydummydummydummydummydummydummydummydummydummyd";
let loja = "";
let perfilFull = "";
let perfilVend = "";
let uAdmin = "";
let uVend = "";
let uSuper = "";
let uSemVinculo = "";

beforeAll(async () => {
  const l = await prisma.loja.create({ data: { nome: `${MARK}loja` } });
  loja = l.id;
  const pf = await prisma.perfil.create({
    data: {
      nome: `${MARK}full`,
      acessosModulos: {
        leads: { ver: true, criar: true, editar: true },
        interesses: { ver: true, criar: true, editar: true },
        vestidos: { ver: true, criar: true, editar: true },
        config: { ver: true, criar: true, editar: true },
      },
    },
  });
  perfilFull = pf.id;
  const pv = await prisma.perfil.create({
    data: {
      nome: `${MARK}vend`,
      acessosModulos: {
        leads: { ver: true, criar: true, editar: true },
        interesses: { ver: true, criar: true, editar: true },
        vestidos: { ver: true, criar: false, editar: false },
        config: { ver: false, criar: false, editar: false },
      },
    },
  });
  perfilVend = pv.id;
  const mk = (s: string, sa = false) =>
    prisma.usuario.create({ data: { nome: `${MARK}${s}`, email: `${MARK}${s}@x.local`, senhaHash: HASH, isSuperAdmin: sa } });
  uAdmin = (await mk("admin")).id;
  uVend = (await mk("vend")).id;
  uSuper = (await mk("super", true)).id;
  uSemVinculo = (await mk("sv")).id;
  await prisma.usuarioLoja.create({ data: { usuarioId: uAdmin, lojaId: loja, perfilId: perfilFull } });
  await prisma.usuarioLoja.create({ data: { usuarioId: uVend, lojaId: loja, perfilId: perfilVend } });
});

afterAll(async () => {
  await prisma.usuario.deleteMany({ where: { id: { in: [uAdmin, uVend, uSuper, uSemVinculo] } } }); // cascade UsuarioLoja
  await prisma.loja.delete({ where: { id: loja } });
  await prisma.perfil.deleteMany({ where: { id: { in: [perfilFull, perfilVend] } } });
  await prisma.$disconnect();
});

describe("podeNoModulo", () => {
  it("super-admin pode qualquer módulo/ação (P1)", async () => {
    expect(await podeNoModulo(uSuper, loja, "vestidos", "editar")).toBe(true);
    expect(await podeNoModulo(uSuper, loja, "config", "criar")).toBe(true);
  });
  it("perfil full: ver+criar+editar em vestidos (P2)", async () => {
    expect(await podeNoModulo(uAdmin, loja, "vestidos", "ver")).toBe(true);
    expect(await podeNoModulo(uAdmin, loja, "vestidos", "criar")).toBe(true);
    expect(await podeNoModulo(uAdmin, loja, "vestidos", "editar")).toBe(true);
  });
  it("vendedora: vê mas não cria/edita vestidos (P3)", async () => {
    expect(await podeNoModulo(uVend, loja, "vestidos", "ver")).toBe(true);
    expect(await podeNoModulo(uVend, loja, "vestidos", "criar")).toBe(false);
    expect(await podeNoModulo(uVend, loja, "vestidos", "editar")).toBe(false);
  });
  it("falha-fechada: sem vínculo / config negada → false (P4)", async () => {
    expect(await podeNoModulo(uSemVinculo, loja, "vestidos", "ver")).toBe(false);
    expect(await podeNoModulo(uVend, loja, "config", "ver")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/permissoes/__tests__/modulos.test.ts`
Expected: FAIL — `Cannot find module '@/lib/permissoes/modulos'`.

- [ ] **Step 3: Implementar o helper**

```ts
// src/lib/permissoes/modulos.ts
import { prisma } from "@/lib/db";

export const MODULOS = ["leads", "interesses", "vestidos", "config"] as const;
export const ACOES = ["ver", "criar", "editar"] as const;
export type Modulo = (typeof MODULOS)[number];
export type Acao = (typeof ACOES)[number];
export type AcessosModulos = Record<Modulo, Record<Acao, boolean>>;

/**
 * Única porta de enforcement de permissão por módulo×ação.
 * super-admin → sempre true. Senão lê o perfil do vínculo na loja.
 * Sem vínculo / módulo ausente / flag ausente → false (falha-fechada).
 * UsuarioLoja é tabela de acesso → lida via `prisma` direto, fora do tenantPrisma.
 */
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

  const vinculo = await prisma.usuarioLoja.findUnique({
    where: { usuarioId_lojaId: { usuarioId, lojaId } },
    select: { perfil: { select: { acessosModulos: true } } },
  });
  const acessos = vinculo?.perfil.acessosModulos as Partial<AcessosModulos> | undefined;
  return acessos?.[modulo]?.[acao] === true;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/permissoes/__tests__/modulos.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissoes/
git commit -m "feat(permissoes): podeNoModulo — enforcement granular por módulo×ação (falha-fechada)"
```

---

## Task 2: Seed granular + teste do seed

**Files:**
- Modify: `prisma/seed.ts:35-95` (helper `acessos` + 3 perfis)
- Modify: `src/lib/__tests__/seed.test.ts:32-41` (asserções)

- [ ] **Step 1: Trocar o teste do seed para o shape granular**

Substituir os dois `it` de config (linhas ~32-41 de `src/lib/__tests__/seed.test.ts`) por:

```ts
  it("perfil Admin: vestidos e config com ver+criar+editar (S1)", async () => {
    const perfil = await prisma.perfil.findUnique({ where: { id: "perfil-admin" } });
    const a = perfil?.acessosModulos as Record<string, Record<string, boolean>>;
    expect(a.vestidos).toEqual({ ver: true, criar: true, editar: true });
    expect(a.config).toEqual({ ver: true, criar: true, editar: true });
  });

  it("perfil Vendedora: vestidos só ver; config tudo false (S1)", async () => {
    const perfil = await prisma.perfil.findUnique({ where: { id: "perfil-vendedora" } });
    const v = perfil?.acessosModulos as Record<string, Record<string, boolean>>;
    expect(v.vestidos).toEqual({ ver: true, criar: false, editar: false });
    expect(v.config).toEqual({ ver: false, criar: false, editar: false });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/__tests__/seed.test.ts`
Expected: FAIL — `a.vestidos` é `true` (boolean), não objeto; `toEqual({ver,criar,editar})` falha.

- [ ] **Step 3: Tornar o seed granular**

Em `prisma/seed.ts`, substituir o helper `acessos` (linhas ~37-39):

```ts
type Acoes = { ver: boolean; criar: boolean; editar: boolean };
const TODAS: ("ver" | "criar" | "editar")[] = ["ver", "criar", "editar"];

// Recebe ações habilitadas por módulo; preenche o resto com false (shape completo).
function acessos(
  porModulo: Partial<Record<(typeof MODULOS)[number], ("ver" | "criar" | "editar")[]>>,
): Record<string, Acoes> {
  return Object.fromEntries(
    MODULOS.map((m) => {
      const on = porModulo[m] ?? [];
      return [m, { ver: on.includes("ver"), criar: on.includes("criar"), editar: on.includes("editar") }];
    }),
  );
}
```

E trocar as 3 chamadas (em `update` e `create` de cada perfil):

```ts
// perfil-admin (update E create):
acessosModulos: acessos({ leads: TODAS, interesses: TODAS, vestidos: TODAS, config: TODAS }),

// perfil-vendedora (update E create):
acessosModulos: acessos({ leads: TODAS, interesses: TODAS, vestidos: ["ver"] }),

// perfil-recepcao (update E create):
acessosModulos: acessos({ leads: ["ver", "criar"], interesses: ["ver"], vestidos: ["ver"] }),
```

- [ ] **Step 4: Rodar o seed e o teste**

Run: `node node_modules/tsx/dist/cli.mjs prisma/seed.ts`
Expected: roda sem erro (upserts).
Run: `node node_modules/vitest/vitest.mjs run src/lib/__tests__/seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts src/lib/__tests__/seed.test.ts
git commit -m "feat(seed): acessosModulos granular (ver/criar/editar) nos 3 perfis"
```

---

## Task 3: Data layer `vestidos.ts`

**Files:**
- Create: `src/lib/vestidos/vestidos.ts`
- Test: `src/lib/vestidos/__tests__/vestidos.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/vestidos/__tests__/vestidos.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  listarVestidos,
  obterVestido,
  criarVestido,
  editarVestido,
} from "@/lib/vestidos/vestidos";

const MARK = "t-vest-";
let lojaA = "";
let lojaB = "";

beforeAll(async () => {
  lojaA = (await prisma.loja.create({ data: { nome: `${MARK}A` } })).id;
  lojaB = (await prisma.loja.create({ data: { nome: `${MARK}B` } })).id;
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { id: { in: [lojaA, lojaB] } } }); // cascade Vestido
  await prisma.$disconnect();
});

describe("data layer de vestidos", () => {
  it("criarVestido carimba o lojaId da sessão (V1)", async () => {
    const v = await criarVestido(lojaA, { codigo: "V1", nome: "Serena", precoBase: "2400,00" });
    expect(v.lojaId).toBe(lojaA);
    expect(v.precoBase.toString()).toBe("2400");
  });

  it("código duplicado na loja vira erro amigável (V2)", async () => {
    await criarVestido(lojaA, { codigo: "DUP", nome: "Um", precoBase: "100" });
    await expect(criarVestido(lojaA, { codigo: "DUP", nome: "Dois", precoBase: "200" })).rejects.toThrow(
      "Já existe um vestido com esse código",
    );
  });

  it("validação: código/nome vazio e preço inválido (V3)", async () => {
    await expect(criarVestido(lojaA, { codigo: " ", nome: "X", precoBase: "100" })).rejects.toThrow("Código é obrigatório");
    await expect(criarVestido(lojaA, { codigo: "Y", nome: " ", precoBase: "100" })).rejects.toThrow("Nome é obrigatório");
    await expect(criarVestido(lojaA, { codigo: "Z", nome: "Z", precoBase: "abc" })).rejects.toThrow("Informe um preço válido");
    await expect(criarVestido(lojaA, { codigo: "Z2", nome: "Z", precoBase: "0" })).rejects.toThrow("Informe um preço válido");
  });

  it("listarVestidos é escopado e ordenado por nome (V4)", async () => {
    await criarVestido(lojaB, { codigo: "B1", nome: "ZZZ-loja-b", precoBase: "300" });
    const daA = await listarVestidos(lojaA);
    expect(daA.every((v) => v.lojaId === lojaA)).toBe(true);
    expect(daA.some((v) => v.nome === "ZZZ-loja-b")).toBe(false);
    const nomes = daA.map((v) => v.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b)));
  });

  it("obterVestido de outra loja retorna null (V5)", async () => {
    const doB = await criarVestido(lojaB, { codigo: "B2", nome: "Aurora", precoBase: "500" });
    expect(await obterVestido(lojaA, doB.id)).toBeNull();
    expect(await obterVestido(lojaB, doB.id)).not.toBeNull();
  });

  it("editarVestido altera campos e não re-tenanta (V6)", async () => {
    const v = await criarVestido(lojaA, { codigo: "EDT", nome: "Antes", precoBase: "100" });
    const e = await editarVestido(lojaA, v.id, { codigo: "EDT", nome: "Depois", precoBase: "150,50" });
    expect(e.nome).toBe("Depois");
    expect(e.precoBase.toString()).toBe("150.5");
    expect(e.lojaId).toBe(lojaA);
    // não dá pra editar pela loja errada (guard injeta lojaId no where → P2025):
    await expect(editarVestido(lojaB, v.id, { codigo: "EDT", nome: "X", precoBase: "100" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/vestidos/__tests__/vestidos.test.ts`
Expected: FAIL — `Cannot find module '@/lib/vestidos/vestidos'`.

- [ ] **Step 3: Implementar o data layer**

```ts
// src/lib/vestidos/vestidos.ts
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import type { Vestido } from "@/generated/prisma/client";

export type NovoVestido = {
  codigo: string;
  nome: string;
  precoBase: string; // chega como string do form; normalizado aqui
  tamanho?: string;
  cor?: string;
  categoria?: string;
  observacoes?: string;
};

function vazioNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

// pt-BR: vírgula = decimal, ponto = milhar. "2.400,00" → 2400 ; "150,50" → 150.5 ; "100" → 100.
function parsePreco(raw: string): number {
  const limpo = raw.trim().replace(/\s/g, "");
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(normalizado);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Informe um preço válido");
  return n;
}

function validar(input: NovoVestido): { codigo: string; nome: string; preco: number } {
  const codigo = input.codigo.trim();
  const nome = input.nome.trim();
  if (!codigo) throw new Error("Código é obrigatório");
  if (!nome) throw new Error("Nome é obrigatório");
  return { codigo, nome, preco: parsePreco(input.precoBase) };
}

function traduzirErro(e: unknown): never {
  if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
    throw new Error("Já existe um vestido com esse código");
  }
  throw e;
}

function dados(input: NovoVestido, codigo: string, nome: string, preco: number) {
  return {
    codigo,
    nome,
    precoBase: preco.toFixed(2),
    tamanho: vazioNull(input.tamanho),
    cor: vazioNull(input.cor),
    categoria: vazioNull(input.categoria),
    observacoes: vazioNull(input.observacoes),
  };
}

export async function listarVestidos(lojaId: string): Promise<Vestido[]> {
  return tenantPrisma(prisma, lojaId).vestido.findMany({ orderBy: { nome: "asc" } });
}

export async function obterVestido(lojaId: string, vestidoId: string): Promise<Vestido | null> {
  return tenantPrisma(prisma, lojaId).vestido.findUnique({ where: { id: vestidoId } });
}

export async function criarVestido(lojaId: string, input: NovoVestido): Promise<Vestido> {
  const { codigo, nome, preco } = validar(input);
  try {
    return await tenantPrisma(prisma, lojaId).vestido.create({ data: dados(input, codigo, nome, preco) });
  } catch (e) {
    traduzirErro(e);
  }
}

export async function editarVestido(lojaId: string, vestidoId: string, input: NovoVestido): Promise<Vestido> {
  const { codigo, nome, preco } = validar(input);
  try {
    return await tenantPrisma(prisma, lojaId).vestido.update({
      where: { id: vestidoId },
      data: dados(input, codigo, nome, preco),
    });
  } catch (e) {
    traduzirErro(e);
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/vestidos/__tests__/vestidos.test.ts`
Expected: PASS — 6 testes. (Se `precoBase.toString()` divergir do formato do Decimal — ex.: "2400.00" — ajuste a asserção pro que o Prisma Decimal devolve; o ponto do teste é o valor, não a formatação.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/vestidos/
git commit -m "feat(vestidos): data layer (listar/obter/criar/editar) escopado por tenantPrisma"
```

---

## Task 4: Server Actions + form Client

**Files:**
- Create: `src/app/(app)/loja/[lojaId]/vestidos/actions.ts`
- Create: `src/app/(app)/loja/[lojaId]/vestidos/vestido-form.tsx`

- [ ] **Step 1: Implementar as actions** (`useActionState`-compatíveis: `(prevState, formData)`)

```ts
// src/app/(app)/loja/[lojaId]/vestidos/actions.ts
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { criarVestido, editarVestido, type NovoVestido } from "@/lib/vestidos/vestidos";

export type VestidoFormState = { erro: string | null };

function extrair(formData: FormData): NovoVestido {
  return {
    codigo: String(formData.get("codigo") ?? ""),
    nome: String(formData.get("nome") ?? ""),
    precoBase: String(formData.get("precoBase") ?? ""),
    tamanho: String(formData.get("tamanho") ?? ""),
    cor: String(formData.get("cor") ?? ""),
    categoria: String(formData.get("categoria") ?? ""),
    observacoes: String(formData.get("observacoes") ?? ""),
  };
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : "Erro inesperado";
}

export async function criarVestidoAction(
  _prev: VestidoFormState,
  formData: FormData,
): Promise<VestidoFormState> {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "criar"))) {
    redirect(`/loja/${sc.loja.id}/vestidos`);
  }
  try {
    await criarVestido(sc.loja.id, extrair(formData));
  } catch (e) {
    return { erro: mensagem(e) };
  }
  redirect(`/loja/${sc.loja.id}/vestidos?ok=1`);
}

export async function editarVestidoAction(
  _prev: VestidoFormState,
  formData: FormData,
): Promise<VestidoFormState> {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) {
    redirect(`/loja/${sc.loja.id}/vestidos`);
  }
  const vestidoId = String(formData.get("vestidoId") ?? "");
  try {
    await editarVestido(sc.loja.id, vestidoId, extrair(formData));
  } catch (e) {
    return { erro: mensagem(e) };
  }
  redirect(`/loja/${sc.loja.id}/vestidos?ok=1`);
}
```

- [ ] **Step 2: Implementar o form Client** (reusa o padrão `useActionState` do `/login`)

```tsx
// src/app/(app)/loja/[lojaId]/vestidos/vestido-form.tsx
"use client";

import { useActionState } from "react";
import type { VestidoFormState } from "./actions";

type Defaults = {
  codigo?: string;
  nome?: string;
  precoBase?: string;
  tamanho?: string;
  cor?: string;
  categoria?: string;
  observacoes?: string;
};

const INICIAL: VestidoFormState = { erro: null };

export function VestidoForm({
  action,
  defaults,
  vestidoId,
  submitLabel,
}: {
  action: (prev: VestidoFormState, fd: FormData) => Promise<VestidoFormState>;
  defaults?: Defaults;
  vestidoId?: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, INICIAL);
  const d = defaults ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-5 max-w-md">
      {vestidoId && <input type="hidden" name="vestidoId" value={vestidoId} />}
      <Field id="v-codigo" name="codigo" label="Código" defaultValue={d.codigo} required autoFocus />
      <Field id="v-nome" name="nome" label="Nome" defaultValue={d.nome} required />
      <Field id="v-preco" name="precoBase" label="Preço (R$)" defaultValue={d.precoBase} inputMode="decimal" required />

      <p className="text-[12px] font-medium tracking-[0.01em] text-cinza-fumo mt-1">Opcional</p>
      <Field id="v-tamanho" name="tamanho" label="Tamanho" defaultValue={d.tamanho} />
      <Field id="v-cor" name="cor" label="Cor" defaultValue={d.cor} />
      <Field id="v-categoria" name="categoria" label="Categoria" defaultValue={d.categoria} />
      <label htmlFor="v-obs" className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">Observações</span>
        <textarea
          id="v-obs"
          name="observacoes"
          defaultValue={d.observacoes}
          rows={3}
          className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[15px] text-tinta
            transition-colors duration-150 ease-out hover:border-cinza-fumo focus:border-tinta focus:outline-none
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex items-center justify-center w-fit rounded-md bg-bordo px-4 py-2.5
          text-[14px] font-medium tracking-[0.01em] text-papel transition-colors duration-150 ease-out
          hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? "Salvando…" : submitLabel}
      </button>
      {state.erro && (
        <p role="alert" className="text-[13px] leading-relaxed text-bordo">
          {state.erro}
        </p>
      )}
    </form>
  );
}

function Field({
  id,
  name,
  label,
  defaultValue,
  required,
  autoFocus,
  inputMode,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputMode?: "decimal";
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium tracking-[0.01em] text-grafite">{label}</span>
      <input
        id={id}
        name={name}
        type="text"
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
        inputMode={inputMode}
        className="rounded-md border border-borda bg-papel-elevado px-3 py-2.5 text-[15px] text-tinta
          placeholder:text-cinza-fumo transition-colors duration-150 ease-out hover:border-cinza-fumo
          focus:border-tinta focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
      />
    </label>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/vestidos/actions.ts" "src/app/(app)/loja/[lojaId]/vestidos/vestido-form.tsx"
git commit -m "feat(vestidos): server actions (gate criar/editar) + form Client reutilizável"
```

---

## Task 5: Página de lista

**Files:**
- Create: `src/app/(app)/loja/[lojaId]/vestidos/page.tsx`

- [ ] **Step 1: Implementar a lista** (gate `ver`; CTA e link de editar condicionais à permissão)

```tsx
// src/app/(app)/loja/[lojaId]/vestidos/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarVestidos } from "@/lib/vestidos/vestidos";

export const dynamic = "force-dynamic";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function VestidosPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "ver"))) redirect(`/loja/${sc.loja.id}`);

  const { lojaId } = await params;
  const { ok } = await searchParams;
  const [vestidos, podeCriar, podeEditar] = await Promise.all([
    listarVestidos(sc.loja.id),
    podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "criar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-8">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href={`/loja/${lojaId}`} className="text-[13px] text-grafite hover:text-tinta transition-colors duration-150 w-fit">
            ← {sc.loja.nome}
          </Link>
          <h1 className="text-[24px] font-light tracking-tight text-tinta">Vestidos</h1>
        </div>
        {podeCriar && (
          <Link
            href={`/loja/${lojaId}/vestidos/novo`}
            className="inline-flex items-center justify-center rounded-md bg-bordo px-4 py-2.5
              text-[14px] font-medium tracking-[0.01em] text-papel transition-colors duration-150 ease-out
              hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
          >
            Novo vestido
          </Link>
        )}
      </header>

      {ok && <p className="text-[13px] text-grafite">Vestido salvo.</p>}

      {vestidos.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] text-tinta">Nenhum vestido cadastrado ainda.</p>
          <p className="text-[13px] text-cinza-fumo">
            {podeCriar ? "Cadastre o primeiro vestido do catálogo." : "Peça à administração para cadastrar o catálogo."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
          {vestidos.map((v) => {
            const meta = [v.tamanho, v.cor, v.categoria].filter(Boolean).join(" · ");
            const conteudo = (
              <>
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[12px] font-medium tracking-[0.01em] text-grafite tabular-nums">{v.codigo}</span>
                    <span className="text-[14px] text-tinta">{v.nome}</span>
                    {v.status !== "ativo" && <span className="text-[11px] text-cinza-fumo">inativo</span>}
                  </span>
                  {meta && <span className="text-[12px] text-cinza-fumo">{meta}</span>}
                </span>
                <span className="text-[14px] text-tinta tabular-nums">{brl.format(Number(v.precoBase))}</span>
              </>
            );
            return (
              <li key={v.id}>
                {podeEditar ? (
                  <Link
                    href={`/loja/${lojaId}/vestidos/${v.id}/editar`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-borda-suave transition-colors duration-150"
                  >
                    {conteudo}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-4 px-4 py-3">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/vestidos/page.tsx"
git commit -m "feat(vestidos): página de lista (gate ver, CTA e editar condicionais)"
```

---

## Task 6: Páginas de criar e editar

**Files:**
- Create: `src/app/(app)/loja/[lojaId]/vestidos/novo/page.tsx`
- Create: `src/app/(app)/loja/[lojaId]/vestidos/[vestidoId]/editar/page.tsx`

- [ ] **Step 1: Confirmar contrato de `params` no doc do Next**

Ler `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` (seção `params`): confirma `params: Promise<{...}>` com `await` (já usado na B.2-T3).

- [ ] **Step 2: Página de criar**

```tsx
// src/app/(app)/loja/[lojaId]/vestidos/novo/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { criarVestidoAction } from "../actions";
import { VestidoForm } from "../vestido-form";

export const dynamic = "force-dynamic";

export default async function NovoVestidoPage({ params }: { params: Promise<{ lojaId: string }> }) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "criar"))) redirect(`/loja/${sc.loja.id}/vestidos`);
  const { lojaId } = await params;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}/vestidos`} className="text-[13px] text-grafite hover:text-tinta transition-colors duration-150 w-fit">
          ← Vestidos
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Novo vestido</h1>
      </header>
      <VestidoForm action={criarVestidoAction} submitLabel="Cadastrar vestido" />
    </main>
  );
}
```

- [ ] **Step 3: Página de editar**

```tsx
// src/app/(app)/loja/[lojaId]/vestidos/[vestidoId]/editar/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterVestido } from "@/lib/vestidos/vestidos";
import { editarVestidoAction } from "../../actions";
import { VestidoForm } from "../../vestido-form";

export const dynamic = "force-dynamic";

export default async function EditarVestidoPage({
  params,
}: {
  params: Promise<{ lojaId: string; vestidoId: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(`/loja/${sc.loja.id}/vestidos`);

  const { lojaId, vestidoId } = await params;
  const v = await obterVestido(sc.loja.id, vestidoId);
  if (!v) redirect(`/loja/${lojaId}/vestidos`);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}/vestidos`} className="text-[13px] text-grafite hover:text-tinta transition-colors duration-150 w-fit">
          ← Vestidos
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Editar vestido</h1>
      </header>
      <VestidoForm
        action={editarVestidoAction}
        vestidoId={v.id}
        submitLabel="Salvar alterações"
        defaults={{
          codigo: v.codigo,
          nome: v.nome,
          precoBase: v.precoBase.toString(),
          tamanho: v.tamanho ?? undefined,
          cor: v.cor ?? undefined,
          categoria: v.categoria ?? undefined,
          observacoes: v.observacoes ?? undefined,
        }}
      />
    </main>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/vestidos/novo" "src/app/(app)/loja/[lojaId]/vestidos/[vestidoId]"
git commit -m "feat(vestidos): páginas de criar e editar (rotas dedicadas, gate criar/editar)"
```

---

## Task 7: Link no dashboard

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/page.tsx`

- [ ] **Step 1: Adicionar o link "Ver vestidos →"**

No `<nav>` do dashboard, adicionar como PRIMEIRO item (antes de "Gerenciar equipe"):

```tsx
        <Link
          href={`/loja/${sc.loja.id}/vestidos`}
          className="text-grafite hover:text-tinta transition-colors duration-150 w-fit"
        >
          Ver vestidos →
        </Link>
```

(O `sc` já existe na page via `getSessaoComLoja()`. Se a página usa `params` para o lojaId, usar `sc.loja.id` que é equivalente e já está no escopo.)

- [ ] **Step 2: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/page.tsx"
git commit -m "feat(vestidos): link 'Ver vestidos' no dashboard"
```

---

## Task 8: Gates de regressão + smoke + docs

**Files:** nenhum (verificação) + docs.

- [ ] **Step 1: Suíte completa**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: PASS — anteriores (109) + 4 (permissões) + 6 (vestidos) + seed atualizado. (S1 não soma teste novo: substitui 2 por 2.)

- [ ] **Step 2: Type-check global**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

- [ ] **Step 3: Smoke (porta 5000)** — com sessões reais (forjar via script como na B.2-T3 se preciso)

- Admin na `loja-moscow`: `GET /loja/loja-moscow/vestidos` → 200, vê CTA "Novo vestido". Cria um vestido em `/novo` → redirect pra lista com `?ok=1` e a linha aparece. Edita em `/{id}/editar` → alteração visível. Código duplicado → erro "Já existe um vestido com esse código" no form (input preservado).
- Vendedora: `GET .../vestidos` → 200, lista SEM CTA e sem link de editar; `GET .../vestidos/novo` → redirect pra `/vestidos`.
- `GET .../vestidos/{id-de-outra-loja}/editar` → redirect pra `/vestidos` (obterVestido null).
- Dashboard mostra "Ver vestidos →".

- [ ] **Step 4: Atualizar docs**

`docs/estado-atual.md`: fatia do módulo Vestidos fechada (data layer + permissões granulares + rotas), gates atualizados, próximo = UI central de permissões. `docs/workflow-skills.md`: snapshot (impeccable usada consultiva no PLAN). Memória `central-permissoes-granular` já registrada — atualizar se o shape mudou.

```bash
git add docs/estado-atual.md docs/workflow-skills.md
git commit -m "docs: fechar fatia Módulo Vestidos + permissões granulares"
```

---

## Notas de verificação contra o spec

- **D1/D2 (permissões granulares + helper):** Task 1 (`podeNoModulo`, P1–P4) + Task 2 (seed shape + S1).
- **D3 (admin muta, vendedora vê):** defaults no seed (Task 2) + gates nas actions/pages (Tasks 4–6) + P2/P3.
- **D4 (rotas dedicadas, form reusado):** Tasks 4 (form) + 6 (novo/editar).
- **D5 (lista não tabela; preço/metadata/status):** Task 5.
- **D6 (read-only sem CTA/link):** Task 5 (condicionais `podeCriar`/`podeEditar`).
- **D7 (sem schema change):** nenhuma migration; só `prisma/seed.ts` (Task 2).
- **D8 (só vestidos enforçado):** Tasks 4–6 só checam `"vestidos"`; outros módulos só recebem defaults no seed.
- **§4.3 data layer via tenantPrisma:** Task 3 (V1–V6).
- **§5 testes:** P1–P4 (Task 1), S1 (Task 2), V1–V6 (Task 3), smoke (Task 8).
- **Fora de escopo (§6):** nenhuma task cria UI de permissões, atributos, bloqueios, excluir/arquivar ou enforcement de outros módulos.
```
