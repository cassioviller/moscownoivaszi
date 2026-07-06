# Multitenant B.1 — Identidade (login, sessão, logout) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o admin seedeado entre no app via `/login`, ficar autenticado por 8h numa sessão DB-backed, ver uma página `/` com "olá, {nome}" + botão logout que invalida a sessão.

**Architecture:** Cookie HTTP-only carrega um `sessionId` opaco (32 bytes random, sem JWT/HMAC); a tabela nova `Sessao` é a fonte de verdade (`expiraEm` absolute 8h, sem rolling). Helpers em `src/lib/auth/` ficam isolados por responsabilidade (`senha.ts`, `sessao.ts`, `cookie.ts`); a composição `getSessao()` no `index.ts` une cookie+DB. As rotas usam route groups (`(public)/login` e `(app)/` com layout que checa sessão e redireciona). Sem RBAC, sem seleção de loja — isso é B.2.

**Tech Stack:** Next.js 16.2.6 (App Router, Server Actions, `useActionState`) · Prisma 7 + `@prisma/adapter-pg` · `bcryptjs` · `crypto.randomBytes` (node:crypto) · Vitest 4. Comandos no Replit: `nix-shell -p nodejs_20 --run "<cmd>"` (não há `node`/`npm`/`npx` no PATH direto).

**Spec:** `docs/superpowers/specs/2026-05-28-multitenant-b1-identidade-design.md`

---

## File Structure

- **Modify** `prisma/schema.prisma` — adicionar `model Sessao` e relação inversa `sessoes Sessao[]` em `Usuario`.
- **Create** `prisma/migrations/<timestamp>_add_sessao/migration.sql` — gerada por `prisma migrate dev`.
- **Create** `src/lib/auth/senha.ts` — `verificarSenha(plain, hash)`, `gerarHash(plain)` (wrappers finos sobre `bcryptjs`).
- **Create** `src/lib/auth/__tests__/senha.test.ts` — unit puro, hashes precomputados.
- **Create** `src/lib/auth/sessao.ts` — `criarSessao(usuarioId)`, `lerSessao(sessionId)`, `destruirSessao(sessionId)`, `cleanupSessoesExpiradasDoUsuario(usuarioId)`. Constantes: `SESSAO_TTL_MS = 8 * 60 * 60 * 1000`.
- **Create** `src/lib/auth/__tests__/sessao.test.ts` — integração com Postgres real (segue padrão de `src/lib/__tests__/seed.test.ts`).
- **Create** `src/lib/auth/cookie.ts` — `COOKIE_NOME`, `setCookieSessao(sessao)`, `getCookieSessao()`, `clearCookieSessao()`. Wrappers sobre `cookies()` de `next/headers`. Sem unit test (depende de request context; coberto no `verify` manual).
- **Create** `src/lib/auth/index.ts` — barrel + `getSessao()` (composição cookie + `lerSessao`).
- **Create** `src/app/(public)/login/page.tsx` — Server Component; checa sessão, redireciona pra `/` se já autenticado; renderiza `<LoginForm />`.
- **Create** `src/app/(public)/login/login-form.tsx` — Client Component (`'use client'`); `useActionState` + form.
- **Create** `src/app/(public)/login/actions.ts` — `'use server'`; `loginAction`.
- **Create** `src/app/(app)/layout.tsx` — Server Component; `getSessao() || redirect('/login')`; passa user via context/prop.
- **Create** `src/app/(app)/page.tsx` — Server Component; "olá, {nome}" + `<form action={logoutAction}><button>Sair</button></form>`.
- **Create** `src/app/(app)/actions.ts` — `'use server'`; `logoutAction`. (Divergência consciente da spec, que sugeria `(app)/logout/actions.ts` — não há rota `/logout`, só uma Server Action consumida pelo form do `/`.)
- **Delete** `src/app/page.tsx` — substituído pelo `(app)/page.tsx` (mesma URL `/`; coexistir causa conflito de rota).
- **Modify** `src/app/layout.tsx` — atualizar `metadata.title` de "Create Next App" pra "Moscow Noivas" (pequeno ajuste oportunista).

---

## Pré-condição: banco de pé

Antes da Task 1, conferir que o Postgres do Replit responde e a migration `_init` está aplicada:

```bash
nix-shell -p nodejs_20 --run "node node_modules/.bin/vitest run src/lib/__tests__/seed.test.ts"
```

Se a suíte do seed estiver verde, o banco está saudável.

---

## Task 1: Schema + migration `Sessao`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_sessao/migration.sql` (gerada pelo Prisma)

- [x] **Step 1: Adicionar `model Sessao` em `prisma/schema.prisma`**

Procurar o final do arquivo (após o último model). Adicionar:

```prisma
model Sessao {
  id        String   @id
  usuarioId String
  criadaEm  DateTime @default(now())
  expiraEm  DateTime

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([expiraEm])
  @@index([usuarioId])
}
```

Observação: `id` é `String` sem `@default` — quem gera é `criarSessao()` (random 32 bytes via `crypto.randomBytes`, codificado em `base64url`). `expiraEm` é setado pelo código (`criadaEm + 8h`), não pelo banco.

- [x] **Step 2: Adicionar relação inversa em `Usuario`**

Em `prisma/schema.prisma`, dentro do `model Usuario` (linha ~84-94), **adicionar uma linha** ao final da seção de relações (após `lojas UsuarioLoja[]`):

```prisma
  lojas    UsuarioLoja[]
  sessoes  Sessao[]
```

- [x] **Step 3: Gerar e aplicar a migration**

Run:
```bash
nix-shell -p nodejs_20 --run "npx prisma migrate dev --name add_sessao"
```

Expected: cria pasta nova em `prisma/migrations/<timestamp>_add_sessao/` com `migration.sql` contendo `CREATE TABLE "Sessao" ...` + dois indexes; regenera o client em `src/generated/prisma/`; printa `Your database is now in sync with your schema.`. Se pedir confirmação, aceitar.

- [x] **Step 4: Conferir a SQL gerada**

Run: `cat prisma/migrations/*add_sessao/migration.sql`
Expected: contém `CREATE TABLE "Sessao"`, `CONSTRAINT "Sessao_pkey" PRIMARY KEY ("id")`, `CREATE INDEX "Sessao_expiraEm_idx"`, `CREATE INDEX "Sessao_usuarioId_idx"`, `ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE`. Se algo estiver diferente, parar e investigar.

- [x] **Step 5: Smoke test — a tabela existe e o client tipa**

Em `src/lib/__tests__/seed.test.ts`, **adicionar** ao final do `describe("seed inicial", ...)`, **antes** do `});` que fecha o describe:

```ts
  it("tabela Sessao existe e aceita writes/reads", async () => {
    const ID = "smoke-sessao-task1";
    const admin = await prisma.usuario.findUnique({ where: { email: "admin@moscownoivas.local" } });
    expect(admin).not.toBeNull();
    // idempotente entre execuções: limpa antes pra evitar UniqueConstraint se um run anterior caiu.
    await prisma.sessao.deleteMany({ where: { id: ID } });
    try {
      const sessao = await prisma.sessao.create({
        data: { id: ID, usuarioId: admin!.id, expiraEm: new Date(Date.now() + 60_000) },
      });
      expect(sessao.id).toBe(ID);
      const lida = await prisma.sessao.findUnique({ where: { id: ID } });
      expect(lida?.usuarioId).toBe(admin!.id);
    } finally {
      await prisma.sessao.deleteMany({ where: { id: ID } });
    }
  });
```

- [x] **Step 6: Rodar o smoke**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/.bin/vitest run src/lib/__tests__/seed.test.ts"
```

Expected: PASS. Se a tabela não foi criada ou o client não regenerou, o teste falha em compilação (`prisma.sessao` não existe).

- [x] **Step 7: Checar tipos**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/typescript/bin/tsc --noEmit"
```
Expected: sem erros.

- [x] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/lib/__tests__/seed.test.ts
git commit -m "feat(auth): tabela Sessao + migration inicial"
```

---

## Task 2: Helpers de senha (`senha.ts`)

**Files:**
- Create: `src/lib/auth/senha.ts`
- Create: `src/lib/auth/__tests__/senha.test.ts`

- [x] **Step 1: Escrever os testes que falham**

Create `src/lib/auth/__tests__/senha.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { gerarHash, verificarSenha } from "@/lib/auth/senha";

describe("senha — verificar e gerar hash", () => {
  it("gerarHash devolve um hash bcrypt válido (60 chars começando com $2)", async () => {
    const hash = await gerarHash("admin123");
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash.length).toBeGreaterThanOrEqual(59);
  });

  it("verificarSenha retorna true para senha correta", async () => {
    const hash = await gerarHash("admin123");
    expect(await verificarSenha("admin123", hash)).toBe(true);
  });

  it("verificarSenha retorna false para senha incorreta", async () => {
    const hash = await gerarHash("admin123");
    expect(await verificarSenha("errada", hash)).toBe(false);
  });

  it("verificarSenha retorna false para hash inválido (sem lançar)", async () => {
    expect(await verificarSenha("admin123", "isto-nao-e-um-hash")).toBe(false);
  });

  it("verificarSenha retorna false para senha vazia", async () => {
    const hash = await gerarHash("admin123");
    expect(await verificarSenha("", hash)).toBe(false);
  });
});
```

- [x] **Step 2: Rodar e ver falhar**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/.bin/vitest run src/lib/auth/__tests__/senha.test.ts"
```
Expected: FAIL — módulo `@/lib/auth/senha` não existe.

- [x] **Step 3: Implementar `senha.ts`**

Create `src/lib/auth/senha.ts`:

```ts
import bcrypt from "bcryptjs";

const BCRYPT_COST = 10;

export async function gerarHash(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verificarSenha(plain: string, hash: string): Promise<boolean> {
  if (!plain) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // hash malformado (ex.: string vazia ou prefixo inválido) — tratamos como "não bate".
    return false;
  }
}
```

- [x] **Step 4: Rodar e ver passar**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/.bin/vitest run src/lib/auth/__tests__/senha.test.ts"
```
Expected: 5 testes PASS.

- [x] **Step 5: Checar tipos**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/typescript/bin/tsc --noEmit"
```
Expected: sem erros.

- [x] **Step 6: Commit**

```bash
git add src/lib/auth/senha.ts src/lib/auth/__tests__/senha.test.ts
git commit -m "feat(auth): helpers de senha (gerarHash + verificarSenha)"
```

---

## Task 3: Helpers de sessão (`sessao.ts`)

**Files:**
- Create: `src/lib/auth/sessao.ts`
- Create: `src/lib/auth/__tests__/sessao.test.ts`

Decisão de design lembrada: `lerSessao(id)` é DB-puro e testável. `getSessao()` (composição com cookie) fica no `index.ts` da Task 4 — coberto no `verify` manual.

- [x] **Step 1: Escrever os testes que falham**

Create `src/lib/auth/__tests__/sessao.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  SESSAO_TTL_MS,
  criarSessao,
  lerSessao,
  destruirSessao,
} from "@/lib/auth/sessao";

const ADMIN_EMAIL = "admin@moscownoivas.local";

async function adminId(): Promise<string> {
  const u = await prisma.usuario.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!u) throw new Error("Seed do admin não rodou — `npm run db:seed` antes dos testes.");
  return u.id;
}

describe("sessao — CRUD + TTL + cleanup", () => {
  beforeEach(async () => {
    const id = await adminId();
    await prisma.sessao.deleteMany({ where: { usuarioId: id } });
  });

  afterAll(async () => {
    const id = await adminId();
    await prisma.sessao.deleteMany({ where: { usuarioId: id } });
    await prisma.$disconnect();
  });

  it("SESSAO_TTL_MS é 8 horas em ms", () => {
    expect(SESSAO_TTL_MS).toBe(8 * 60 * 60 * 1000);
  });

  it("criarSessao insere uma sessão com id de 32 bytes (base64url ~43 chars) e expiraEm = agora + 8h", async () => {
    const id = await adminId();
    const antes = Date.now();
    const sessao = await criarSessao(id);
    const depois = Date.now();

    expect(sessao.id).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes em base64url, sem padding
    expect(sessao.usuarioId).toBe(id);

    const delta = sessao.expiraEm.getTime() - antes;
    expect(delta).toBeGreaterThanOrEqual(SESSAO_TTL_MS - 1000);
    expect(delta).toBeLessThanOrEqual(SESSAO_TTL_MS + (depois - antes) + 1000);
  });

  it("lerSessao retorna sessão+usuário para uma sessão válida", async () => {
    const id = await adminId();
    const criada = await criarSessao(id);
    const lida = await lerSessao(criada.id);
    expect(lida).not.toBeNull();
    expect(lida!.sessao.id).toBe(criada.id);
    expect(lida!.usuario.email).toBe(ADMIN_EMAIL);
  });

  it("lerSessao retorna null para id inexistente", async () => {
    expect(await lerSessao("naoexiste")).toBeNull();
  });

  it("lerSessao retorna null para sessão expirada (não a apaga)", async () => {
    const id = await adminId();
    const expirada = await prisma.sessao.create({
      data: { id: "sess-expirada", usuarioId: id, expiraEm: new Date(Date.now() - 1000) },
    });
    expect(await lerSessao(expirada.id)).toBeNull();
    // continua no banco — quem limpa é o cleanup lazy no próximo login
    const ainda = await prisma.sessao.findUnique({ where: { id: expirada.id } });
    expect(ainda).not.toBeNull();
  });

  it("lerSessao retorna null se o usuário foi desativado", async () => {
    const id = await adminId();
    const criada = await criarSessao(id);
    await prisma.usuario.update({ where: { id }, data: { ativo: false } });
    try {
      expect(await lerSessao(criada.id)).toBeNull();
    } finally {
      await prisma.usuario.update({ where: { id }, data: { ativo: true } });
    }
  });

  it("destruirSessao remove a linha", async () => {
    const id = await adminId();
    const criada = await criarSessao(id);
    await destruirSessao(criada.id);
    expect(await prisma.sessao.findUnique({ where: { id: criada.id } })).toBeNull();
  });

  it("destruirSessao é idempotente (não lança quando id não existe)", async () => {
    await expect(destruirSessao("naoexiste")).resolves.toBeUndefined();
  });

  it("criarSessao limpa sessões expiradas do mesmo usuário (cleanup lazy)", async () => {
    const id = await adminId();
    await prisma.sessao.create({
      data: { id: "sess-velha-1", usuarioId: id, expiraEm: new Date(Date.now() - 1000) },
    });
    await prisma.sessao.create({
      data: { id: "sess-velha-2", usuarioId: id, expiraEm: new Date(Date.now() - 10_000) },
    });
    const viva = await prisma.sessao.create({
      data: { id: "sess-viva", usuarioId: id, expiraEm: new Date(Date.now() + 60_000) },
    });

    await criarSessao(id);

    expect(await prisma.sessao.findUnique({ where: { id: "sess-velha-1" } })).toBeNull();
    expect(await prisma.sessao.findUnique({ where: { id: "sess-velha-2" } })).toBeNull();
    // a sessão viva NÃO é removida (apenas as expiradas)
    expect(await prisma.sessao.findUnique({ where: { id: viva.id } })).not.toBeNull();
  });
});
```

- [x] **Step 2: Rodar e ver falhar**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/.bin/vitest run src/lib/auth/__tests__/sessao.test.ts"
```
Expected: FAIL — `@/lib/auth/sessao` não existe.

- [x] **Step 3: Implementar `sessao.ts`**

Create `src/lib/auth/sessao.ts`:

```ts
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Sessao, Usuario } from "@/generated/prisma/client";

export const SESSAO_TTL_MS = 8 * 60 * 60 * 1000; // 8h absolute, sem rolling

function novoId(): string {
  return randomBytes(32).toString("base64url");
}

async function cleanupSessoesExpiradasDoUsuario(usuarioId: string): Promise<void> {
  await prisma.sessao.deleteMany({
    where: { usuarioId, expiraEm: { lt: new Date() } },
  });
}

export async function criarSessao(usuarioId: string): Promise<Sessao> {
  await cleanupSessoesExpiradasDoUsuario(usuarioId);
  return prisma.sessao.create({
    data: {
      id: novoId(),
      usuarioId,
      expiraEm: new Date(Date.now() + SESSAO_TTL_MS),
    },
  });
}

export async function lerSessao(
  sessionId: string,
): Promise<{ sessao: Sessao; usuario: Usuario } | null> {
  const sessao = await prisma.sessao.findUnique({
    where: { id: sessionId },
    include: { usuario: true },
  });
  if (!sessao) return null;
  if (sessao.expiraEm.getTime() <= Date.now()) return null;
  if (!sessao.usuario.ativo) return null;
  const { usuario, ...rest } = sessao;
  return { sessao: rest as Sessao, usuario };
}

export async function destruirSessao(sessionId: string): Promise<void> {
  // deleteMany não lança quando não acha; idempotente por construção.
  await prisma.sessao.deleteMany({ where: { id: sessionId } });
}
```

- [x] **Step 4: Rodar e ver passar**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/.bin/vitest run src/lib/auth/__tests__/sessao.test.ts"
```
Expected: 9 testes PASS.

- [x] **Step 5: Suíte completa + tipos**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/.bin/vitest run"
nix-shell -p nodejs_20 --run "node node_modules/typescript/bin/tsc --noEmit"
```
Expected: tudo verde; sem erros de tipo.

- [x] **Step 6: Commit**

```bash
git add src/lib/auth/sessao.ts src/lib/auth/__tests__/sessao.test.ts
git commit -m "feat(auth): helpers de sessao (criar/ler/destruir + cleanup lazy)"
```

---

## Task 4: Cookie + barrel + `getSessao()`

**Files:**
- Create: `src/lib/auth/cookie.ts`
- Create: `src/lib/auth/index.ts`

Por que sem unit test: `cookies()` de `next/headers` só funciona dentro do request lifecycle (RSC/Route Handler/Server Action) — não dá pra invocar em Vitest sem mockar pesado. Cobertura vem do `verify` manual + dos critérios §8 da spec.

- [x] **Step 1: Implementar `cookie.ts`**

Create `src/lib/auth/cookie.ts`:

```ts
import { cookies } from "next/headers";
import type { Sessao } from "@/generated/prisma/client";

export const COOKIE_NOME = "moscow_sessao";

export async function setCookieSessao(sessao: Sessao): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: COOKIE_NOME,
    value: sessao.id,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: sessao.expiraEm,
  });
}

export async function getCookieSessao(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE_NOME)?.value ?? null;
}

export async function clearCookieSessao(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NOME);
}
```

- [x] **Step 2: Implementar barrel `index.ts` com `getSessao()`**

Create `src/lib/auth/index.ts`:

```ts
import type { Sessao, Usuario } from "@/generated/prisma/client";
import { lerSessao } from "./sessao";
import { getCookieSessao } from "./cookie";

export { gerarHash, verificarSenha } from "./senha";
export { SESSAO_TTL_MS, criarSessao, lerSessao, destruirSessao } from "./sessao";
export { COOKIE_NOME, setCookieSessao, getCookieSessao, clearCookieSessao } from "./cookie";

/**
 * Lê o cookie, busca a sessão por id, retorna { sessao, usuario } ou null.
 * Composição cookie + DB; não estende TTL (decisão B.1 #3: 8h absolute).
 */
export async function getSessao(): Promise<{ sessao: Sessao; usuario: Usuario } | null> {
  const id = await getCookieSessao();
  if (!id) return null;
  return lerSessao(id);
}
```

- [x] **Step 3: Checar tipos**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/typescript/bin/tsc --noEmit"
```
Expected: sem erros.

- [x] **Step 4: Suíte (não devo quebrar nada)**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/.bin/vitest run"
```
Expected: tudo verde.

- [x] **Step 5: Commit**

```bash
git add src/lib/auth/cookie.ts src/lib/auth/index.ts
git commit -m "feat(auth): cookie helpers + getSessao composto"
```

---

## Task 5: Rota `/login` (page + form + action)

**Files:**
- Create: `src/app/(public)/login/page.tsx`
- Create: `src/app/(public)/login/login-form.tsx`
- Create: `src/app/(public)/login/actions.ts`

- [x] **Step 1: Criar a Server Action de login**

Create `src/app/(public)/login/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { criarSessao, setCookieSessao, verificarSenha } from "@/lib/auth";

export type LoginState = { erro?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");

  // Mensagem genérica: nunca revela se o email existe (decisão B.1 #6).
  const ERRO: LoginState = { erro: "Credenciais inválidas" };

  if (!email || !senha) return ERRO;

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.ativo) return ERRO;

  const ok = await verificarSenha(senha, usuario.senhaHash);
  if (!ok) return ERRO;

  const sessao = await criarSessao(usuario.id);
  await setCookieSessao(sessao);

  // `redirect` lança internamente — não envolver em try/catch que pegue Error.
  redirect("/");
}
```

- [x] **Step 2: Criar o componente client com o form**

Create `src/app/(public)/login/login-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const INICIAL: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, INICIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      <label className="flex flex-col gap-1 text-sm">
        <span>E-mail</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          className="border rounded px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Senha</span>
        <input
          name="senha"
          type="password"
          required
          autoComplete="current-password"
          className="border rounded px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded px-4 py-2 bg-black text-white disabled:opacity-50"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
      {state.erro && (
        <p role="alert" className="text-sm text-red-600">
          {state.erro}
        </p>
      )}
    </form>
  );
}
```

- [x] **Step 3: Criar a page (Server Component) com guard de "já autenticado"**

Create `src/app/(public)/login/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const sessao = await getSessao();
  if (sessao) redirect("/");

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-xl font-medium">Moscow Noivas</h1>
        <LoginForm />
      </div>
    </main>
  );
}
```

- [x] **Step 4: Conferir tipos**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/typescript/bin/tsc --noEmit"
```
Expected: sem erros.

- [x] **Step 5: Commit**

```bash
git add src/app/\(public\)
git commit -m "feat(auth): rota /login (page + form + server action)"
```

(Observação sobre o `\(public\)`: os parênteses precisam de escape no shell. Se preferir, use `git add src/app/` e revise o que entrou — só os arquivos novos da `(public)/login/`.)

---

## Task 6: Layout `(app)` + `/` (dashboard read-only) + logout

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/page.tsx`
- Create: `src/app/(app)/actions.ts`
- Delete: `src/app/page.tsx`
- Modify: `src/app/layout.tsx` (title)

- [x] **Step 1: Apagar o `src/app/page.tsx` default**

Run: `git rm src/app/page.tsx`
Expected: arquivo removido do índice e do disco. Sem isso, Next acusa rota duplicada quando a `(app)/page.tsx` entrar.

- [x] **Step 2: Atualizar metadata em `src/app/layout.tsx`**

Em `src/app/layout.tsx` (linhas 15-18), substituir:

```ts
export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};
```

por:

```ts
export const metadata: Metadata = {
  title: "Moscow Noivas",
  description: "Sistema interno Moscow Noivas",
};
```

- [x] **Step 3: Criar a Server Action de logout**

Create `src/app/(app)/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import {
  clearCookieSessao,
  destruirSessao,
  getCookieSessao,
} from "@/lib/auth";

export async function logoutAction(): Promise<void> {
  const id = await getCookieSessao();
  if (id) await destruirSessao(id);
  await clearCookieSessao();
  redirect("/login");
}
```

- [x] **Step 4: Criar o layout `(app)` (gate de autenticação)**

Create `src/app/(app)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");

  return <>{children}</>;
}
```

Observação: o `<html>`/`<body>` já vêm do root `src/app/layout.tsx`; este layout só protege e repassa.

- [x] **Step 5: Criar a page `/` (dashboard read-only de prova-de-vida)**

Create `src/app/(app)/page.tsx`:

```tsx
import { getSessao } from "@/lib/auth";
import { logoutAction } from "./actions";

export default async function HomePage() {
  // Garantido pelo layout, mas a tipagem precisa do narrow aqui.
  const sessao = await getSessao();
  if (!sessao) return null;

  return (
    <main className="min-h-screen p-6 flex flex-col gap-4">
      <h1 className="text-xl font-medium">Olá, {sessao.usuario.nome}</h1>
      <p className="text-sm text-neutral-600">
        E-mail: {sessao.usuario.email}
        <br />
        Sessão expira em: {sessao.sessao.expiraEm.toLocaleString("pt-BR")}
      </p>
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded px-4 py-2 bg-black text-white w-fit"
        >
          Sair
        </button>
      </form>
    </main>
  );
}
```

- [x] **Step 6: Conferir tipos**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/typescript/bin/tsc --noEmit"
```
Expected: sem erros.

- [x] **Step 7: Suíte (regressão)**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/.bin/vitest run"
```
Expected: tudo verde; nada quebrou no domínio puro.

- [x] **Step 8: Commit**

`src/app/page.tsx` já foi removido (e ficou staged) no Step 1; basta adicionar o resto:

```bash
git add src/app/layout.tsx src/app/\(app\)/
git commit -m "feat(auth): layout protegido + dashboard read-only + logout"
```

---

## Task 7: Polish visual da `/login` via `impeccable`

**Files:**
- Modify: `src/app/(public)/login/page.tsx`
- Modify: `src/app/(public)/login/login-form.tsx`
- (Possivelmente) modify: `src/app/globals.css`

- [x] **Step 1: Invocar o skill `impeccable` com escopo restrito**

Pedido pro skill (passar como `args` ao invocar):

> Polish da primeira tela do produto: `/login` em `src/app/(public)/login/page.tsx` + `login-form.tsx`.
>
> Restrições:
> - Mobile-first; a maioria das funcionárias vai entrar pelo celular da loja.
> - Marca "Moscow Noivas" — noivas, vestidos; permitir um tom feminino sem virar caricatura.
> - Sem dependências novas: Tailwind 4 já está; sem ícones de terceiros (a não ser que sejam SVG inline pequenos).
> - Manter a estrutura semântica do form (labels, `role="alert"` no erro, `autoComplete`, `autoFocus` no email).
> - Não tocar em `actions.ts` nem em qualquer arquivo fora de `src/app/(public)/login/`. `src/app/globals.css` pode receber tokens/utilities se realmente precisar.
> - Pending state legível; erro visível sem layout shift.
>
> Fora de escopo: tela `/` pós-login (é deliberadamente crua nessa fatia).

- [x] **Step 2: Conferir o resultado no dev server**

Run em background:
```bash
nix-shell -p nodejs_20 --run "npm run dev"
```

Abrir `/login` no navegador (Replit já expõe a porta). Inspecionar:
- Mobile (devtools responsive, 360px de largura): form cabe, sem scroll horizontal, toques confortáveis.
- Desktop: composição não fica perdida no meio da tela.
- Erro: digitar `qualquer@coisa.com` / `errado` → mensagem aparece sem layout shift.
- Pending: o botão indica "Entrando…" no segundo entre submit e resposta.

- [x] **Step 3: Conferir tipos (impeccable pode ter mexido em props)**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/typescript/bin/tsc --noEmit"
```
Expected: sem erros.

- [x] **Step 4: Commit**

```bash
git add src/app/\(public\)/login/ src/app/globals.css
git commit -m "feat(ui): polish da tela /login (impeccable)"
```

(Se `globals.css` não foi tocado, o `git add` dele é no-op.)

---

## Task 8: Verify manual end-to-end

**Files:**
- Nenhuma alteração de código. Esta task é a checagem manual dos critérios §8 da spec.

- [x] **Step 1: Rodar a suíte completa + tipos pela última vez**

Run:
```bash
nix-shell -p nodejs_20 --run "node node_modules/.bin/vitest run"
nix-shell -p nodejs_20 --run "node node_modules/typescript/bin/tsc --noEmit"
```
Expected: tudo verde, sem erros de tipo.

- [x] **Step 2: Subir o app**

Run em background:
```bash
nix-shell -p nodejs_20 --run "npm run dev"
```

Aguardar `Ready in Xms` no log.

- [x] **Step 3: Percorrer os critérios da spec §8**

Marcar cada critério ✓/✗ no log da task:

- [x] **§8.1** — Migration aplicada; `Sessao` existe. **Como conferir:** `nix-shell -p nodejs_20 --run "npx prisma db pull --print"` ou abrir Prisma Studio (`nix-shell -p nodejs_20 --run "npx prisma studio"`) e olhar a aba `Sessao`.
- [x] **§8.2** — Suíte verde + `tsc` limpo (já no Step 1).
- [x] **§8.3** — Login com `admin@moscownoivas.local` / `admin123` redireciona pra `/`; mostra "Olá, Administrador"; logout volta pra `/login`.
- [x] **§8.4** — DevTools → Application → Cookies → `moscow_sessao` está marcado `HttpOnly`, `SameSite=Lax`, `Expires` ≈ +8h. Em `localhost` o `Secure` fica `false` (correto: `NODE_ENV !== production`).
- [x] **§8.5a** — `/` sem cookie (modo anônimo / após `Clear cookies`): redireciona pra `/login`.
- [x] **§8.5b** — `/login` com cookie válido (já logado): redireciona pra `/`.
- [x] **§8.6** — Login com email errado E login com senha errada: ambos mostram **a mesma** mensagem ("Credenciais inválidas").
- [x] **§8.7** — Sessão simulada-expirada: no Prisma Studio, abrir a `Sessao` ativa e setar `expiraEm` pra agora −1min. Refresh em `/`: redireciona pra `/login`.

- [x] **Step 4: Atualizar `docs/estado-atual.md`**

Substituir o conteúdo refletindo: fatia B.1 fechada, próximo passo é B.2 (multitenant: seleção de loja + `assertAcessoLoja` + layout `/loja/[lojaId]/`). Manter o tom curto do snapshot anterior.

- [x] **Step 5: Atualizar o snapshot em `docs/workflow-skills.md`**

Bump da data e adicionar linha pra fatia B.1: `PLAN ✓ → BUILD ✓ → VERIFY ✓ → POLISH ✓ (impeccable em /login)`. Próximo passo: B.2.

- [x] **Step 6: Commit**

```bash
git add docs/estado-atual.md docs/workflow-skills.md
git commit -m "docs: snapshot apos B.1 (identidade); proximo passo B.2"
```

---

## Critério de sucesso (revalidar ao fim)

1. `npm test` verde (todos os arquivos: motor, datas, api, seed + sessao + senha) e `npx tsc --noEmit` limpo.
2. Admin loga, vê `/`, desloga; cookie tem flags corretas.
3. `/` sem cookie → `/login`; `/login` com cookie → `/`.
4. Mensagem de erro é genérica em qualquer falha.
5. Sessão de >8h é tratada como inválida.
6. Tabela `Sessao` existe com índices em `expiraEm` e `usuarioId`.
7. Nenhuma regressão na suíte do motor (Plano B fechado anteriormente).

Cumprido isso, o loop reinicia em **PLAN** para a **fatia B.2 (multitenant: seleção de loja + scoping)**.
