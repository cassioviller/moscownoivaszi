# Multitenant B.2-T3 — Dashboard scoped via `tenantPrisma` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover o dashboard para a rota dinâmica `/loja/[lojaId]/`, validar que a URL espelha a loja ativa da sessão e fazer a primeira leitura real escopada pelo guard `tenantPrisma` (`vestido.count()`), com UI mínima e honesta.

**Architecture:** Abordagem A — um layout aninhado (`loja/[lojaId]/layout.tsx`) valida o espelhamento `[lojaId] == sessao.lojaAtivaId` e redireciona ao canônico se divergir (falha-fechada); a page irmã só lê e renderiza. A lógica testável é extraída para `src/lib/loja/` (regra de espelhamento + leitura escopada) para ser coberta por Vitest sem renderizar rota nem mockar `cookies()` — mesmo padrão helper-por-id da B.2-T1. `/` vira hub que redireciona para `/loja/{lojaAtiva}`.

**Tech Stack:** Next.js 16.2.6 (App Router; `params: Promise<{...}>` — sempre `await`; `export const dynamic = 'force-dynamic'` força render por-request) · Prisma 7 + `@prisma/adapter-pg` · guard `tenantPrisma` (`src/lib/tenant.ts`) · Vitest 4. **Ambiente:** `node` está no PATH (nodejs 20). Rodar testes/tsc via `node node_modules/...` (os symlinks em `node_modules/.bin/` dão "permission denied"): `node node_modules/vitest/vitest.mjs run` e `node node_modules/typescript/bin/tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-05-29-b2-t3-dashboard-scoped.md`

---

## File Structure

- **Create** `src/lib/loja/acesso.ts` — regra pura de espelhamento (`resolverAcessoLoja`) + visibilidade do link de troca (`mostrarTrocaLoja`). Sem I/O. Responsabilidade: decisões de roteamento da loja ativa.
- **Create** `src/lib/loja/__tests__/acesso.test.ts` — unit puro (T-mirror-1/2, T-troca-1/2).
- **Create** `src/lib/loja/resumo.ts` — `carregarResumoLoja(lojaId)`: leitura escopada via `tenantPrisma`. Responsabilidade: dado de tenant do dashboard.
- **Create** `src/lib/loja/__tests__/resumo.test.ts` — integração Postgres real (T-count, T-zero, T-isolamento). É a migração do "teste D".
- **Create** `src/app/(app)/loja/[lojaId]/layout.tsx` — gate de espelhamento (chama `getSessaoComLoja` + `await params` + `resolverAcessoLoja`). `force-dynamic`. Sem unit test (rota/cookies; coberto por `acesso.test.ts` + smoke manual).
- **Create** `src/app/(app)/loja/[lojaId]/page.tsx` — dashboard: `carregarResumoLoja` + nav + link de troca condicional + logout. `force-dynamic`.
- **Modify** `src/app/(app)/page.tsx` — vira hub de redirect para `/loja/{lojaAtiva}`.
- **Inalterado:** `src/app/(app)/layout.tsx`, `src/app/(app)/actions.ts` (`logoutAction` reusado), `src/lib/tenant.ts`.

**Helpers já existentes (não recriar):** `getSessaoComLoja(): Promise<{ usuario, loja } | null>` e `listarLojasDoUsuario(usuarioId): Promise<Loja[]>` (`@/lib/auth`); `ehAdminDaLoja(usuarioId, lojaId): Promise<boolean>` (`@/lib/admin/usuarios`); `tenantPrisma(base, lojaId)` (`@/lib/tenant`); `prisma` (`@/lib/db`).

---

## Task 1: Regra pura de espelhamento + visibilidade da troca

**Files:**
- Create: `src/lib/loja/acesso.ts`
- Test: `src/lib/loja/__tests__/acesso.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/loja/__tests__/acesso.test.ts
import { describe, it, expect } from "vitest";
import { resolverAcessoLoja, mostrarTrocaLoja } from "@/lib/loja/acesso";

describe("resolverAcessoLoja — URL espelha a loja ativa", () => {
  it("ok quando [lojaId] == loja ativa", () => {
    expect(resolverAcessoLoja("loja-x", "loja-x")).toEqual({ ok: true });
  });

  it("redireciona ao canônico quando [lojaId] != loja ativa (falha-fechada)", () => {
    expect(resolverAcessoLoja("loja-de-outro", "loja-x")).toEqual({
      ok: false,
      redirectTo: "/loja/loja-x",
    });
  });

  it("redireciona ao canônico para lojaId inexistente/lixo (mesma regra)", () => {
    expect(resolverAcessoLoja("../../etc", "loja-x")).toEqual({
      ok: false,
      redirectTo: "/loja/loja-x",
    });
  });
});

describe("mostrarTrocaLoja — só para usuário multi-loja", () => {
  it("esconde com 1 loja", () => {
    expect(mostrarTrocaLoja(1)).toBe(false);
  });
  it("esconde com 0 lojas", () => {
    expect(mostrarTrocaLoja(0)).toBe(false);
  });
  it("mostra com 2+ lojas", () => {
    expect(mostrarTrocaLoja(2)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/loja/__tests__/acesso.test.ts`
Expected: FAIL — `Cannot find module '@/lib/loja/acesso'`.

- [ ] **Step 3: Implementar o mínimo**

```ts
// src/lib/loja/acesso.ts
// Regras de roteamento da loja ativa — puras, sem I/O (testáveis sem cookies()).

export type AcessoLoja = { ok: true } | { ok: false; redirectTo: string };

/**
 * Espelhamento: a URL `/loja/[lojaId]` tem que bater com a loja ativa da sessão.
 * Qualquer divergência (loja alheia, inexistente, lixo) cai na MESMA saída:
 * redirect para a URL canônica da loja ativa. Falha-fechada — nunca renderiza
 * dado de uma loja que não é a ativa.
 */
export function resolverAcessoLoja(lojaIdUrl: string, lojaAtivaId: string): AcessoLoja {
  if (lojaIdUrl !== lojaAtivaId) {
    return { ok: false, redirectTo: `/loja/${lojaAtivaId}` };
  }
  return { ok: true };
}

/** Link "Trocar loja" só faz sentido para quem tem mais de uma loja. */
export function mostrarTrocaLoja(qtdLojas: number): boolean {
  return qtdLojas > 1;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/loja/__tests__/acesso.test.ts`
Expected: PASS — 6 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/loja/acesso.ts src/lib/loja/__tests__/acesso.test.ts
git commit -m "feat(loja): regra de espelhamento URL↔loja ativa + visibilidade da troca (B.2-T3)"
```

---

## Task 2: Leitura escopada do resumo da loja (migra o "teste D")

**Files:**
- Create: `src/lib/loja/resumo.ts`
- Test: `src/lib/loja/__tests__/resumo.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Integração com Postgres real. Cria 2 lojas; prova que a contagem é escopada por `lojaId` (loja A nunca vê vestidos de B) e que o read passa pelo guard. Fixtures com prefixo `t-rl-`, limpeza por cascade (toda FK pra `Loja` é `onDelete: Cascade`).

```ts
// src/lib/loja/__tests__/resumo.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { carregarResumoLoja } from "@/lib/loja/resumo";

const MARK = "t-rl-";
let lojaA = "";
let lojaB = "";

beforeAll(async () => {
  const a = await prisma.loja.create({ data: { nome: `${MARK}A` } });
  const b = await prisma.loja.create({ data: { nome: `${MARK}B` } });
  lojaA = a.id;
  lojaB = b.id;

  // 2 vestidos na A, 1 na B — criados PELO guard (carimba lojaId da sessão).
  const dbA = tenantPrisma(prisma, lojaA);
  const dbB = tenantPrisma(prisma, lojaB);
  await dbA.vestido.create({ data: { codigo: "A1", nome: `${MARK}a1`, precoBase: "100.00" } as any });
  await dbA.vestido.create({ data: { codigo: "A2", nome: `${MARK}a2`, precoBase: "200.00" } as any });
  await dbB.vestido.create({ data: { codigo: "B1", nome: `${MARK}b1`, precoBase: "300.00" } as any });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { id: { in: [lojaA, lojaB] } } });
  await prisma.$disconnect();
});

describe("carregarResumoLoja — leitura escopada pelo guard", () => {
  it("conta só os vestidos da loja pedida (T-count)", async () => {
    expect(await carregarResumoLoja(lojaA)).toEqual({ vestidos: 2 });
  });

  it("zero-vazamento: loja A nunca vê os vestidos de B (T-isolamento)", async () => {
    const resumoB = await carregarResumoLoja(lojaB);
    expect(resumoB).toEqual({ vestidos: 1 }); // não 3
  });

  it("loja sem vestidos retorna 0 (T-zero)", async () => {
    const vazia = await prisma.loja.create({ data: { nome: `${MARK}vazia` } });
    try {
      expect(await carregarResumoLoja(vazia.id)).toEqual({ vestidos: 0 });
    } finally {
      await prisma.loja.delete({ where: { id: vazia.id } });
    }
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/loja/__tests__/resumo.test.ts`
Expected: FAIL — `Cannot find module '@/lib/loja/resumo'`.

- [ ] **Step 3: Implementar o mínimo**

```ts
// src/lib/loja/resumo.ts
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";

export type ResumoLoja = { vestidos: number };

/**
 * Resumo da loja para o dashboard. ÚNICO ponto de leitura de dado de tenant
 * desta fatia — passa OBRIGATORIAMENTE pelo guard `tenantPrisma`. Acesso direto
 * via `prisma.vestido.*` seria bug de segurança (ver docs/estado-atual.md).
 */
export async function carregarResumoLoja(lojaId: string): Promise<ResumoLoja> {
  const db = tenantPrisma(prisma, lojaId);
  const vestidos = await db.vestido.count();
  return { vestidos };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/loja/__tests__/resumo.test.ts`
Expected: PASS — 3 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/loja/resumo.ts src/lib/loja/__tests__/resumo.test.ts
git commit -m "feat(loja): carregarResumoLoja — 1ª leitura real escopada pelo tenantPrisma (B.2-T3)"
```

---

## Task 3: Layout de espelhamento `loja/[lojaId]/layout.tsx`

**Files:**
- Create: `src/app/(app)/loja/[lojaId]/layout.tsx`

Sem unit test: é rota dependente de `cookies()`. O núcleo (`resolverAcessoLoja`) já está coberto na Task 1; o comportamento end-to-end vai no smoke manual da Task 6.

- [ ] **Step 1: Confirmar o contrato de `params` no doc do Next (sem código ainda)**

Ler `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` (seção `params`): em layouts/pages dinâmicos, `params` é `Promise<{ lojaId: string }>` e precisa de `await`. Confirmar antes de escrever.

- [ ] **Step 2: Implementar o layout**

```tsx
// src/app/(app)/loja/[lojaId]/layout.tsx
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { resolverAcessoLoja } from "@/lib/loja/acesso";

// D8: contagem de tenant nunca cacheada entre requests — render por-request.
export const dynamic = "force-dynamic";

export default async function LojaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lojaId: string }>;
}) {
  const sc = await getSessaoComLoja(); // o gate de (app) já garantiu "ok"
  if (!sc) redirect("/login"); // narrow defensivo

  const { lojaId } = await params;
  const acesso = resolverAcessoLoja(lojaId, sc.loja.id);
  if (!acesso.ok) redirect(acesso.redirectTo);

  return <>{children}</>;
}
```

- [ ] **Step 3: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo (sem erros).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/loja/\[lojaId\]/layout.tsx
git commit -m "feat(loja): layout que valida espelhamento URL↔loja ativa (B.2-T3)"
```

---

## Task 4: Dashboard `loja/[lojaId]/page.tsx`

**Files:**
- Create: `src/app/(app)/loja/[lojaId]/page.tsx`

Move o conteúdo do dashboard atual (`(app)/page.tsx`) para cá, trocando "Olá" por header + bloco de catálogo + link de troca condicional. `logoutAction` continua em `(app)/actions.ts` → import relativo `../../actions`.

- [ ] **Step 1: Implementar a page**

```tsx
// src/app/(app)/loja/[lojaId]/page.tsx
import Link from "next/link";
import { getSessaoComLoja, listarLojasDoUsuario } from "@/lib/auth";
import { ehAdminDaLoja } from "@/lib/admin/usuarios";
import { carregarResumoLoja } from "@/lib/loja/resumo";
import { mostrarTrocaLoja } from "@/lib/loja/acesso";
import { logoutAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function DashboardLoja() {
  // Garantido pelo layout (sessão ok + espelhamento); narrow p/ tipagem.
  const sc = await getSessaoComLoja();
  if (!sc) return null;

  const [resumo, lojas, podeGerenciarEquipe] = await Promise.all([
    carregarResumoLoja(sc.loja.id),
    listarLojasDoUsuario(sc.usuario.id),
    ehAdminDaLoja(sc.usuario.id, sc.loja.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <span className="text-[12px] tracking-[0.04em] uppercase text-cinza-fumo">
          {sc.loja.nome}
        </span>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">
          Olá, {sc.usuario.nome}
        </h1>
      </header>

      {/* Bloco de catálogo — transitório, honesto, sem CTA enquanto não há /vestidos (D4/D5/D6). */}
      <section className="rounded-md border border-borda bg-papel-elevado px-5 py-4">
        {resumo.vestidos > 0 ? (
          <p className="text-[14px] text-tinta">
            <span className="font-medium">{resumo.vestidos}</span> vestidos cadastrados
          </p>
        ) : (
          <p className="text-[14px] text-cinza-fumo">Nenhum vestido cadastrado ainda</p>
        )}
      </section>

      <nav className="flex flex-col gap-2 text-[14px]">
        {podeGerenciarEquipe && (
          <Link
            href="/equipe"
            className="text-grafite hover:text-tinta transition-colors duration-150 w-fit"
          >
            Gerenciar equipe →
          </Link>
        )}
        {sc.usuario.isSuperAdmin && (
          <Link
            href="/admin"
            className="text-grafite hover:text-tinta transition-colors duration-150 w-fit"
          >
            Administração da plataforma →
          </Link>
        )}
        {mostrarTrocaLoja(lojas.length) && (
          <Link
            href="/selecionar-loja"
            className="text-grafite hover:text-tinta transition-colors duration-150 w-fit"
          >
            Trocar loja →
          </Link>
        )}
      </nav>

      <form action={logoutAction}>
        <button
          type="submit"
          className="
            inline-flex items-center justify-center
            rounded-md border border-borda bg-papel-elevado px-4 py-2.5
            text-[14px] font-medium tracking-[0.01em] text-tinta w-fit
            transition-colors duration-150 ease-out
            hover:border-cinza-fumo
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
          "
        >
          Sair
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo. (Se o import `../../actions` não resolver, conferir que `src/app/(app)/actions.ts` exporta `logoutAction` — ele existe da B.1.)

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/loja/\[lojaId\]/page.tsx
git commit -m "feat(loja): dashboard scoped (resumo via guard + troca de loja condicional) (B.2-T3)"
```

---

## Task 5: `/` vira hub de redirect

**Files:**
- Modify: `src/app/(app)/page.tsx` (substitui o conteúdo inteiro)

O conteúdo do dashboard agora vive em `loja/[lojaId]/page.tsx`. O `/` resolve a loja ativa (centralizado — D3) e manda pro canônico.

- [ ] **Step 1: Substituir o conteúdo**

```tsx
// src/app/(app)/page.tsx
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Hub: o layout (app) já garantiu sessão + loja ativa. Resolve a URL canônica.
export default async function HomeRedirect() {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login"); // narrow defensivo
  redirect(`/loja/${sc.loja.id}`);
}
```

- [ ] **Step 2: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/page.tsx
git commit -m "feat(loja): / vira hub de redirect para /loja/{lojaAtiva} (B.2-T3)"
```

---

## Task 6: Gates de regressão + verify manual

**Files:** nenhum (verificação).

- [ ] **Step 1: Suíte completa verde**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: PASS — todos os testes anteriores (100) + 9 novos (6 de `acesso` + 3 de `resumo`).

- [ ] **Step 2: Type-check global**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

- [ ] **Step 3: Smoke na app (porta 5000)**

Subir o dev server e verificar (com sessão de loja única, ex.: `vendedora@lojateste.local` ou `admin`):
- `GET /` → 307 para `/loja/{lojaAtiva}`.
- `GET /loja/{lojaAtiva}` → 200, mostra "vestidos cadastrados" (ou "Nenhum vestido cadastrado ainda" se 0).
- `GET /loja/{id-de-outra-loja}` → 307 para `/loja/{lojaAtiva}` (falha-fechada).
- Usuário de 1 loja: link "Trocar loja" **ausente**.
- (Opcional) super-admin com 2 lojas: link "Trocar loja" **presente** → leva a `/selecionar-loja`.

- [ ] **Step 4: (Opcional) Verify visual com dado**

Semear 1 vestido na `loja-moscow` via `node` + `tenantPrisma` para ver o bloco com contagem ≠ 0. Remover depois (fora do escopo do código).

- [ ] **Step 5: Atualizar docs e commitar**

Atualizar `docs/estado-atual.md` (B.2-T3 fechada; próximo: 1ª página de módulo) e o snapshot de `docs/workflow-skills.md`.

```bash
git add docs/estado-atual.md docs/workflow-skills.md
git commit -m "docs: fechar B.2-T3 (dashboard scoped via tenantPrisma)"
```

---

## Notas de verificação contra o spec

- **§3 D1 (sessão manda):** Task 3 valida via `resolverAcessoLoja` usando `sc.loja.id` como verdade; Task 4 lê com `sc.loja.id`, não com o `lojaId` cru da URL.
- **§3 D2 (layout aninhado):** Task 3.
- **§3 D3 (hub):** Task 5.
- **§3 D4/D5/D6 (UI mínima, vestidos, estado-zero sem CTA):** Task 4 Step 1.
- **§3 D7 (troca condicional):** `mostrarTrocaLoja` (Task 1) + uso na Task 4.
- **§3 D8 (anti-cache):** `export const dynamic = "force-dynamic"` nas Tasks 3, 4, 5.
- **§5 testes:** T-mirror-1/2 + T-troca-1/2 (Task 1); T-count/T-zero/T-isolamento + teste D migrado (Task 2). T-mirror end-to-end e visibilidade renderizada no smoke (Task 6 Step 3).
- **Fora de escopo (§6):** nenhuma task cria página de módulo, troca por URL, `acessosModulos` ou migration.
```
