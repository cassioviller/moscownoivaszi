# Reserva multi-item de vestidos — Implementation Plan (Fatia 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans para implementar task-by-task. Steps usam checkbox (`- [ ]`).

**Goal:** A noiva pode reservar **vários vestidos** para o casamento, agrupados numa **Reserva** (com estados *em montagem* → *confirmada*), em vez de uma reserva solta por vez.

**Architecture:** Migração **aditiva** — cabeça `Reserva` + `BloqueioVestido.reservaId?`. Cada `BloqueioVestido RESERVA_CASAMENTO` vira **item** da reserva. Motor, provas (`Atendimento.bloqueioId`), contrato e jornada **não mudam** (apontam para o item). Composição nova em `src/lib/reservas/reservas.ts` sobre o primitivo `reservarVestido`. Linguagem do domínio: **Reserva** / **Item da reserva** (`CONTEXT.md`); zero "sacola".

**Tech Stack:** Next.js (App Router, Server Actions, `force-dynamic`), Prisma (client em `src/generated/prisma`), Postgres, Vitest (integração Postgres real), `tenantPrisma`. Spec: `docs/superpowers/specs/2026-06-15-reserva-carrinho-multi-item-design.md`.

**Gates de cada commit (CLAUDE.md — commitar direto na `main`):**
- `node node_modules/typescript/bin/tsc --noEmit` → limpo
- `node node_modules/vitest/vitest.mjs run` → tudo verde
- Após mudar schema: `npx prisma migrate deploy` **e** `npx prisma generate` (o `migrate dev` do Replit é não-interativo). `node`/`npx` ausentes do PATH ⇒ `/nix/store/*/bin`.

---

## Task 1: Schema + migração (cabeça `Reserva` + `reservaId`)

**Files:**
- Modify: `prisma/schema.prisma` (`BloqueioVestido` ~285-304; `Lead` ~228-256; `Loja`)
- Create: `prisma/migrations/20260615130000_reserva_cabeca/migration.sql`
- Modify: `src/lib/tenant.ts:30-52` (adicionar `"Reserva"` em `TENANT_MODELS`)

- [ ] **Step 1: Enum + model `Reserva` no schema**

Antes do `model BloqueioVestido`, inserir:

```prisma
enum ReservaStatus {
  EM_MONTAGEM // a escolha ainda está sendo composta
  CONFIRMADA // a escolha está fechada
}

// Cabeça da reserva — o compromisso da noiva: agrupa N vestidos (itens) de um casamento.
// Cada item é um BloqueioVestido (RESERVA_CASAMENTO) com reservaId apontando para cá.
// Migração aditiva: o motor segue lendo o item, não a cabeça.
model Reserva {
  id            String        @id @default(cuid())
  lojaId        String
  leadId        String
  casamentoData DateTime
  status        ReservaStatus @default(EM_MONTAGEM)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  loja  Loja              @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  lead  Lead              @relation(fields: [leadId], references: [id], onDelete: Cascade)
  itens BloqueioVestido[]
}
```

- [ ] **Step 2: `reservaId` no `BloqueioVestido`**

No `model BloqueioVestido`, adicionar (resto igual):
```prisma
  reservaId         String?
  reserva           Reserva?     @relation(fields: [reservaId], references: [id], onDelete: Cascade)
```

- [ ] **Step 3: Back-relations**

`model Lead` (após `bloqueios BloqueioVestido[]`):
```prisma
  reservas     Reserva[]
```
`model Loja` (junto das relações de loja):
```prisma
  reservas Reserva[]
```

- [ ] **Step 4: Migração SQL hand-authored**

Criar `prisma/migrations/20260615130000_reserva_cabeca/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "ReservaStatus" AS ENUM ('EM_MONTAGEM', 'CONFIRMADA');

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "casamentoData" TIMESTAMP(3) NOT NULL,
    "status" "ReservaStatus" NOT NULL DEFAULT 'EM_MONTAGEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reserva_lojaId_leadId_idx" ON "Reserva"("lojaId", "leadId");

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: BloqueioVestido ganha reservaId
ALTER TABLE "BloqueioVestido" ADD COLUMN "reservaId" TEXT;

-- AddForeignKey
ALTER TABLE "BloqueioVestido" ADD CONSTRAINT "BloqueioVestido_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: uma cabeça por grupo (lojaId, leadId, casamentoData) das reservas existentes (CONFIRMADA).
INSERT INTO "Reserva" ("id", "lojaId", "leadId", "casamentoData", "status", "createdAt", "updatedAt")
SELECT
    md5(g."lojaId" || '|' || g."leadId" || '|' || g."casamentoData"::text),
    g."lojaId", g."leadId", g."casamentoData", 'CONFIRMADA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "lojaId", "leadId", "casamentoData"
    FROM "BloqueioVestido"
    WHERE "tipo" = 'RESERVA_CASAMENTO' AND "leadId" IS NOT NULL AND "casamentoData" IS NOT NULL
) g;

-- Backfill: liga cada bloqueio à sua cabeça (join pelas 3 colunas do grupo).
UPDATE "BloqueioVestido" bv
SET "reservaId" = r."id"
FROM "Reserva" r
WHERE bv."tipo" = 'RESERVA_CASAMENTO'
  AND bv."leadId" IS NOT NULL AND bv."casamentoData" IS NOT NULL
  AND r."lojaId" = bv."lojaId" AND r."leadId" = bv."leadId" AND r."casamentoData" = bv."casamentoData";
```
> `md5(...)` = id determinístico por grupo (coluna TEXT; conviver com cuids é ok), sem extensão.

- [ ] **Step 5: `Reserva` em `TENANT_MODELS`**

`src/lib/tenant.ts`, no array (após `"BloqueioVestido"`):
```ts
  "BloqueioVestido",
  "Reserva",
  "RegraDisponibilidade",
```

- [ ] **Step 6: Aplicar + regenerar**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: aplica `20260615130000_reserva_cabeca`; client recriado com `prisma.reserva` e `ReservaStatus`.

- [ ] **Step 7: Verificar backfill (nenhuma órfã)**

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT count(*) AS orfas FROM "BloqueioVestido"
WHERE "tipo" = 'RESERVA_CASAMENTO' AND "leadId" IS NOT NULL AND "reservaId" IS NULL;
SQL
```
Expected: `orfas = 0` (se não imprimir, rodar via `psql $DATABASE_URL`).

- [ ] **Step 8: Gates**

Run: `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run`
Expected: limpo + suíte existente verde (migração aditiva, nada muda).

- [ ] **Step 9: Commit**
```bash
git add prisma/schema.prisma prisma/migrations/20260615130000_reserva_cabeca src/lib/tenant.ts
git commit -m "feat(reserva): cabeça Reserva + reservaId no BloqueioVestido (aditiva + backfill)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Desambiguar nomes no item + `reservarVestido` aceita `reservaId`

Limpa a colisão de nomes na origem (regras estudadas no grill) e prepara o primitivo de item.

**Files:**
- Modify: `src/lib/disponibilidade/reservas.ts`
- Modify: `src/lib/contratos/contratos.ts` (consumidor do flat por-vestido)
- Modify: `src/app/(app)/loja/[lojaId]/vestidos/[vestidoId]/reserva-actions.ts` (usa `cancelarReserva` do item)
- Test: `src/lib/disponibilidade/__tests__/reservas.test.ts`

- [ ] **Step 1: Renomear o flat `listarReservasDaNoiva` → `listarVestidosReservadosDaNoiva`**

Em `src/lib/disponibilidade/reservas.ts`, renomear a função `listarReservasDaNoiva` (a que devolve `ReservaDaNoiva[]`, por-vestido, ~330) para `listarVestidosReservadosDaNoiva`. Manter o tipo `ReservaDaNoiva` e a lógica. Em `src/lib/contratos/contratos.ts`, trocar o import e as 2 chamadas (`:58`, `:101`) de `listarReservasDaNoiva` → `listarVestidosReservadosDaNoiva`.

- [ ] **Step 2: Remover o flat órfão `listarReservasDaLoja` (por-vestido)**

Em `src/lib/disponibilidade/reservas.ts`, **remover** a função `listarReservasDaLoja` (a que devolve `ReservaDaLoja[]`, ~294) e o tipo `ReservaDaLoja` (não usados após o livro migrar — Task 7). Remover do `src/lib/disponibilidade/__tests__/reservas.test.ts` o import e o trecho que a exercita (o teste "lista reservas pelo vestido e pela noiva" passa a chamar só `listarReservasDoVestido` e `listarVestidosReservadosDaNoiva`).

- [ ] **Step 3: Renomear o primitivo `cancelarReserva` → `removerBloqueio`**

Em `src/lib/disponibilidade/reservas.ts`, renomear `cancelarReserva(lojaId, bloqueioId)` (~131) para `removerBloqueio`. Atualizar consumidores:
- `src/app/(app)/loja/[lojaId]/vestidos/[vestidoId]/reserva-actions.ts` (`cancelarReservaPeloVestidoAction` e `removerManutencaoAction` chamam `cancelarReserva`) → `removerBloqueio`.
- `src/lib/disponibilidade/__tests__/reservas.test.ts` (chamadas a `cancelarReserva`) → `removerBloqueio`.

> O perfil da noiva (`noivas/[leadId]/reserva-actions.ts`) também usa `cancelarReserva` hoje, mas será **reescrito** na Task 6 — não mexer agora; a Task 6 troca para as funções de `reservas/reservas.ts`.

- [ ] **Step 4: `reservarVestido` aceita `reservaId` — teste que falha**

Adicionar ao `describe` de `src/lib/disponibilidade/__tests__/reservas.test.ts`:
```ts
  it("grava reservaId no bloqueio quando passado", async () => {
    const reserva = await tenantPrisma(prisma, loja).reserva.create({
      data: { leadId: noiva, casamentoData: new Date("2028-03-10T00:00:00.000Z"), status: "EM_MONTAGEM" } as never,
    });
    const r = await reservarVestido(loja, { vestidoId: vestidoA, leadId: noiva, casamentoData: "2028-03-10", reservaId: reserva.id });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const row = await tenantPrisma(prisma, loja).bloqueioVestido.findUnique({ where: { id: r.bloqueioId } });
      expect(row?.reservaId).toBe(reserva.id);
    }
  });
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/disponibilidade/__tests__/reservas.test.ts`
Expected: FALHA (TS: `reservaId` não existe no input / não gravado).

- [ ] **Step 6: Implementar `reservaId` em `reservarVestido`**

Em `src/lib/disponibilidade/reservas.ts`, assinatura (~70-73):
```ts
export async function reservarVestido(
  lojaId: string,
  input: { vestidoId: string; leadId: string; casamentoData: string; reservaId?: string },
): Promise<ResultadoReserva> {
  const db = tenantPrisma(prisma, lojaId);
  const { vestidoId, leadId, casamentoData, reservaId } = input;
```
E no `create` (~117-126):
```ts
    data: {
      vestidoId,
      leadId,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: meiaNoiteUTC(casamentoData),
      reservaId: reservaId ?? null,
    } as never,
```

- [ ] **Step 7: Gates**

Run: `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run`
Expected: limpo (renomes propagados) + verde (incl. o novo teste).

- [ ] **Step 8: Commit**
```bash
git add src/lib/disponibilidade/reservas.ts src/lib/contratos/contratos.ts "src/app/(app)/loja/[lojaId]/vestidos/[vestidoId]/reserva-actions.ts" src/lib/disponibilidade/__tests__/reservas.test.ts
git commit -m "refactor(reserva): desambigua nomes do item (removerBloqueio, listarVestidosReservadosDaNoiva) + reservarVestido aceita reservaId

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `reservas/reservas.ts` — `abrirReserva` + `adicionarVestido`

**Files:**
- Create: `src/lib/reservas/reservas.ts`
- Test: `src/lib/reservas/__tests__/reservas.test.ts`

- [ ] **Step 1: Teste que falha**

Criar `src/lib/reservas/__tests__/reservas.test.ts`:
```ts
// src/lib/reservas/__tests__/reservas.test.ts
// Integração (Postgres real): a camada de composição da reserva sobre o primitivo de item.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { abrirReserva, adicionarVestido } from "@/lib/reservas/reservas";

const MARK = "t-reserva-";
let loja = "", vestidoA = "", vestidoB = "", noiva = "", semData = "";

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  vestidoA = (await db.vestido.create({ data: { codigo: `${MARK}A`, nome: `${MARK}A`, precoBase: 1000 } as never })).id;
  vestidoB = (await db.vestido.create({ data: { codigo: `${MARK}B`, nome: `${MARK}B`, precoBase: 2000 } as never })).id;
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}n`, etapa: "NOVO", casamentoData: new Date("2027-05-20T00:00:00.000Z") } as never })).id;
  semData = (await db.lead.create({ data: { noivaNome: `${MARK}sd`, etapa: "NOVO" } as never })).id;
});
afterAll(async () => { await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } }); });

describe("reserva: abrir e adicionar vestido", () => {
  it("abre e reusa a mesma (find-or-create)", async () => {
    const a = await abrirReserva(loja, noiva);
    const b = await abrirReserva(loja, noiva);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.reservaId).toBe(b.reservaId);
  });
  it("recusa sem data de casamento", async () => {
    expect(await abrirReserva(loja, semData)).toMatchObject({ ok: false, motivo: "sem_data" });
  });
  it("adiciona vestido (bloqueio com reservaId) e barra conflito", async () => {
    const s = await abrirReserva(loja, noiva);
    if (!s.ok) throw new Error("reserva");
    expect((await adicionarVestido(loja, s.reservaId, vestidoA)).ok).toBe(true);
    expect((await adicionarVestido(loja, s.reservaId, vestidoB)).ok).toBe(true);
    expect(await adicionarVestido(loja, s.reservaId, vestidoA)).toMatchObject({ ok: false, motivo: "indisponivel" });
    expect(await tenantPrisma(prisma, loja).bloqueioVestido.count({ where: { reservaId: s.reservaId } })).toBe(2);
  });
  it("recusa adicionar a reserva inexistente", async () => {
    expect(await adicionarVestido(loja, "nao-existe", vestidoA)).toMatchObject({ ok: false, motivo: "reserva_invalida" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/reservas/__tests__/reservas.test.ts`
Expected: FALHA — `Cannot find module '@/lib/reservas/reservas'`.

- [ ] **Step 3: Criar `reservas/reservas.ts`**
```ts
// src/lib/reservas/reservas.ts
// Camada de COMPOSIÇÃO da reserva (o compromisso da noiva): a cabeça Reserva que agrupa N
// vestidos. Cada item é criado pelo primitivo reservarVestido (valida o motor) já ligado à
// cabeça via reservaId. Tudo escopado por loja via tenantPrisma. Linguagem: CONTEXT.md.
// Decisão: docs/superpowers/specs/2026-06-15-reserva-carrinho-multi-item-design.md
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { reservarVestido, removerBloqueio } from "@/lib/disponibilidade/reservas";
import { ymd, hojeUTC } from "@/lib/tempo";

export type ResultadoAbrir =
  | { ok: true; reservaId: string }
  | { ok: false; motivo: "sem_data" | "lead_invalido" };

/**
 * Acha a reserva EM_MONTAGEM da noiva para a data do casamento dela, ou cria. Find-or-create
 * garante no máximo UMA reserva em montagem por (leadId, casamentoData). Falha fechada sem data.
 */
export async function abrirReserva(lojaId: string, leadId: string): Promise<ResultadoAbrir> {
  const db = tenantPrisma(prisma, lojaId);
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, motivo: "lead_invalido" };
  if (!lead.casamentoData) return { ok: false, motivo: "sem_data" };

  const existente = await db.reserva.findFirst({
    where: { leadId, status: "EM_MONTAGEM", casamentoData: lead.casamentoData },
  });
  if (existente) return { ok: true, reservaId: existente.id };

  const criada = await db.reserva.create({
    data: { leadId, casamentoData: lead.casamentoData, status: "EM_MONTAGEM" } as never,
  });
  return { ok: true, reservaId: criada.id };
}

export type ResultadoAdicionar =
  | { ok: true; bloqueioId: string }
  | {
      ok: false;
      motivo: "reserva_invalida" | "sem_data" | "lead_invalido" | "vestido_invalido" | "indisponivel";
      conflitaComDatas?: string[];
    };

/**
 * Adiciona um vestido como item de uma reserva EM_MONTAGEM. Valida que a reserva é da loja e
 * está em montagem; delega ao reservarVestido (projeta o motor → barra double-booking).
 */
export async function adicionarVestido(
  lojaId: string,
  reservaId: string,
  vestidoId: string,
): Promise<ResultadoAdicionar> {
  const db = tenantPrisma(prisma, lojaId);
  const reserva = await db.reserva.findUnique({ where: { id: reservaId } });
  if (!reserva || reserva.status !== "EM_MONTAGEM") return { ok: false, motivo: "reserva_invalida" };

  const r = await reservarVestido(lojaId, {
    vestidoId, leadId: reserva.leadId, casamentoData: ymd(reserva.casamentoData)!, reservaId,
  });
  if (r.ok) return { ok: true, bloqueioId: r.bloqueioId };
  return { ok: false, motivo: r.motivo, conflitaComDatas: r.conflitaComDatas };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/reservas/__tests__/reservas.test.ts`
Expected: PASS (4).

- [ ] **Step 5: Commit**
```bash
git add src/lib/reservas/reservas.ts src/lib/reservas/__tests__/reservas.test.ts
git commit -m "feat(reserva): reservas.ts — abrirReserva + adicionarVestido

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `reservas/reservas.ts` — `removerVestido` + `fecharReserva` + `cancelarReserva`

**Files:**
- Modify: `src/lib/reservas/reservas.ts`
- Test: `src/lib/reservas/__tests__/reservas.test.ts`

- [ ] **Step 1: Testes que falham**

Adicionar imports e um `describe` em `src/lib/reservas/__tests__/reservas.test.ts`:
```ts
import { abrirReserva, adicionarVestido, removerVestido, fecharReserva, cancelarReserva } from "@/lib/reservas/reservas";
import { vestidosLivresPara } from "@/lib/disponibilidade/reservas";
```
```ts
describe("reserva: remover, fechar, cancelar", () => {
  it("remover o último vestido apaga a cabeça vazia", async () => {
    const lead = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}r1`, etapa: "NOVO", casamentoData: new Date("2027-07-01T00:00:00.000Z") } as never })).id;
    const s = await abrirReserva(loja, lead); if (!s.ok) throw new Error("r");
    const i = await adicionarVestido(loja, s.reservaId, vestidoA); if (!i.ok) throw new Error("i");
    expect((await removerVestido(loja, s.reservaId, i.bloqueioId)).ok).toBe(true);
    expect(await tenantPrisma(prisma, loja).reserva.findUnique({ where: { id: s.reservaId } })).toBeNull();
  });
  it("removerVestido recusa bloqueio que não é da reserva", async () => {
    const s = await abrirReserva(loja, noiva); if (!s.ok) throw new Error("r");
    expect(await removerVestido(loja, s.reservaId, "nao-existe")).toMatchObject({ ok: false, motivo: "item_invalido" });
  });
  it("fecharReserva: EM_MONTAGEM→CONFIRMADA; recusa vazia e não-montagem", async () => {
    const lead = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}r2`, etapa: "NOVO", casamentoData: new Date("2027-08-01T00:00:00.000Z") } as never })).id;
    const s = await abrirReserva(loja, lead); if (!s.ok) throw new Error("r");
    expect(await fecharReserva(loja, s.reservaId)).toMatchObject({ ok: false, motivo: "reserva_vazia" });
    if (!(await adicionarVestido(loja, s.reservaId, vestidoB)).ok) throw new Error("i");
    expect(await fecharReserva(loja, s.reservaId)).toMatchObject({ ok: true });
    expect(await fecharReserva(loja, s.reservaId)).toMatchObject({ ok: false, motivo: "transicao_invalida" });
  });
  it("cancelarReserva apaga a cabeça e libera os vestidos (cascade)", async () => {
    const lead = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}r3`, etapa: "NOVO", casamentoData: new Date("2027-09-15T00:00:00.000Z") } as never })).id;
    const vC = (await tenantPrisma(prisma, loja).vestido.create({ data: { codigo: `${MARK}C`, nome: `${MARK}C`, precoBase: 3000 } as never })).id;
    const s = await abrirReserva(loja, lead); if (!s.ok) throw new Error("r");
    await adicionarVestido(loja, s.reservaId, vC);
    expect((await vestidosLivresPara(loja, "2027-09-15")).some((v) => v.id === vC)).toBe(false);
    await cancelarReserva(loja, s.reservaId);
    expect(await tenantPrisma(prisma, loja).reserva.findUnique({ where: { id: s.reservaId } })).toBeNull();
    expect((await vestidosLivresPara(loja, "2027-09-15")).some((v) => v.id === vC)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/reservas/__tests__/reservas.test.ts`
Expected: FALHA — funções inexistentes.

- [ ] **Step 3: Implementar**

Adicionar ao final de `src/lib/reservas/reservas.ts`:
```ts
export type ResultadoRemover = { ok: true } | { ok: false; motivo: "item_invalido" };

/** Remove um vestido da reserva. Se a reserva ficar sem itens, apaga a cabeça EM_MONTAGEM vazia. */
export async function removerVestido(lojaId: string, reservaId: string, bloqueioId: string): Promise<ResultadoRemover> {
  const db = tenantPrisma(prisma, lojaId);
  const item = await db.bloqueioVestido.findUnique({ where: { id: bloqueioId } });
  if (!item || item.reservaId !== reservaId) return { ok: false, motivo: "item_invalido" };
  await removerBloqueio(lojaId, bloqueioId);
  const restantes = await db.bloqueioVestido.count({ where: { reservaId } });
  if (restantes === 0) {
    const reserva = await db.reserva.findUnique({ where: { id: reservaId } });
    if (reserva?.status === "EM_MONTAGEM") await db.reserva.deleteMany({ where: { id: reservaId } });
  }
  return { ok: true };
}

export type ResultadoFechar = { ok: true } | { ok: false; motivo: "transicao_invalida" | "reserva_vazia" };

/** Fecha a reserva: EM_MONTAGEM → CONFIRMADA. Rejeita não-montagem e 0 itens. */
export async function fecharReserva(lojaId: string, reservaId: string): Promise<ResultadoFechar> {
  const db = tenantPrisma(prisma, lojaId);
  const reserva = await db.reserva.findUnique({ where: { id: reservaId } });
  if (!reserva || reserva.status !== "EM_MONTAGEM") return { ok: false, motivo: "transicao_invalida" };
  if ((await db.bloqueioVestido.count({ where: { reservaId } })) === 0) return { ok: false, motivo: "reserva_vazia" };
  await db.reserva.update({ where: { id: reservaId }, data: { status: "CONFIRMADA" } });
  return { ok: true };
}

/** Cancela a reserva inteira: apaga a cabeça → cascade remove os itens (libera os vestidos). */
export async function cancelarReserva(lojaId: string, reservaId: string): Promise<void> {
  await tenantPrisma(prisma, lojaId).reserva.deleteMany({ where: { id: reservaId } });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/reservas/__tests__/reservas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/reservas/reservas.ts src/lib/reservas/__tests__/reservas.test.ts
git commit -m "feat(reserva): reservas.ts — removerVestido + fecharReserva + cancelarReserva

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `reservas/reservas.ts` — leituras cabeça-cientes

**Files:**
- Modify: `src/lib/reservas/reservas.ts`
- Test: `src/lib/reservas/__tests__/reservas.test.ts`

- [ ] **Step 1: Teste que falha**

Adicionar import e `describe` em `src/lib/reservas/__tests__/reservas.test.ts`:
```ts
import { listarReservasDaNoiva, listarReservasDaLoja, obterReserva } from "@/lib/reservas/reservas";
```
```ts
describe("reserva: leituras cabeça-cientes", () => {
  it("listarReservasDaNoiva agrupa itens por cabeça", async () => {
    const lead = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}r4`, etapa: "NOVO", casamentoData: new Date("2027-10-10T00:00:00.000Z") } as never })).id;
    const v1 = (await tenantPrisma(prisma, loja).vestido.create({ data: { codigo: `${MARK}D`, nome: `${MARK}D`, precoBase: 1000 } as never })).id;
    const v2 = (await tenantPrisma(prisma, loja).vestido.create({ data: { codigo: `${MARK}E`, nome: `${MARK}E`, precoBase: 1000 } as never })).id;
    const s = await abrirReserva(loja, lead); if (!s.ok) throw new Error("r");
    await adicionarVestido(loja, s.reservaId, v1); await adicionarVestido(loja, s.reservaId, v2);
    const lista = await listarReservasDaNoiva(loja, lead);
    expect(lista).toHaveLength(1);
    expect(lista[0].status).toBe("EM_MONTAGEM");
    expect(lista[0].itens.map((i) => i.codigo).sort()).toEqual([`${MARK}D`, `${MARK}E`]);
    expect((await obterReserva(loja, s.reservaId))?.itens).toHaveLength(2);
  });
  it("listarReservasDaLoja traz cabeças futuras com itens", async () => {
    const futuras = await listarReservasDaLoja(loja, {});
    expect(futuras.every((r) => Array.isArray(r.itens))).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/reservas/__tests__/reservas.test.ts`
Expected: FALHA — leituras inexistentes.

- [ ] **Step 3: Implementar**

Adicionar ao final de `src/lib/reservas/reservas.ts`:
```ts
export type ItemDaReserva = { bloqueioId: string; vestidoId: string; codigo: string; nome: string };

export type Reserva = {
  id: string;
  status: "EM_MONTAGEM" | "CONFIRMADA";
  casamentoData: Date | null;
  leadId: string;
  noivaNome: string | null;
  itens: ItemDaReserva[];
};

const INCLUDE_RESUMO = {
  lead: { select: { noivaNome: true } },
  itens: { include: { vestido: { select: { id: true, codigo: true, nome: true } } } },
} as const;

type LinhaResumo = {
  id: string;
  status: "EM_MONTAGEM" | "CONFIRMADA";
  casamentoData: Date | null;
  leadId: string;
  lead: { noivaNome: string | null } | null;
  itens: { id: string; vestidoId: string; vestido: { codigo: string; nome: string } }[];
};

function mapResumo(r: LinhaResumo): Reserva {
  return {
    id: r.id, status: r.status, casamentoData: r.casamentoData, leadId: r.leadId,
    noivaNome: r.lead?.noivaNome ?? null,
    itens: r.itens.map((b) => ({ bloqueioId: b.id, vestidoId: b.vestidoId, codigo: b.vestido.codigo, nome: b.vestido.nome })),
  };
}

/** Reservas (em montagem + confirmadas) da noiva, cada uma com seus vestidos. */
export async function listarReservasDaNoiva(lojaId: string, leadId: string): Promise<Reserva[]> {
  const rows = await tenantPrisma(prisma, lojaId).reserva.findMany({
    where: { leadId }, orderBy: { casamentoData: "asc" }, include: INCLUDE_RESUMO,
  });
  return (rows as LinhaResumo[]).map(mapResumo);
}

/** Livro de reservas por cabeça (uma linha, N vestidos). Futuras por padrão; `passadas` inverte. */
export async function listarReservasDaLoja(lojaId: string, opts: { passadas?: boolean } = {}): Promise<Reserva[]> {
  const hoje = hojeUTC();
  const rows = await tenantPrisma(prisma, lojaId).reserva.findMany({
    where: { casamentoData: opts.passadas ? { lt: hoje } : { gte: hoje } },
    orderBy: { casamentoData: opts.passadas ? "desc" : "asc" }, include: INCLUDE_RESUMO,
  });
  return (rows as LinhaResumo[]).map(mapResumo);
}

/** Uma cabeça com seus itens. null se não for da loja. */
export async function obterReserva(lojaId: string, reservaId: string): Promise<Reserva | null> {
  const r = await tenantPrisma(prisma, lojaId).reserva.findUnique({ where: { id: reservaId }, include: INCLUDE_RESUMO });
  return r ? mapResumo(r as LinhaResumo) : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/reservas/__tests__/reservas.test.ts && node node_modules/typescript/bin/tsc --noEmit`
Expected: PASS + `tsc` limpo.

- [ ] **Step 5: Commit**
```bash
git add src/lib/reservas/reservas.ts src/lib/reservas/__tests__/reservas.test.ts
git commit -m "feat(reserva): reservas.ts — leituras cabeça-cientes (noiva, livro, detalhe)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Perfil da noiva — `#reserva` vira a reserva multi-item

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/noivas/[leadId]/reserva-actions.ts`
- Modify: `src/app/(app)/loja/[lojaId]/noivas/[leadId]/page.tsx`

- [ ] **Step 1: Reescrever as actions**

Substituir o corpo de `src/app/(app)/loja/[lojaId]/noivas/[leadId]/reserva-actions.ts` (mantendo `buscarVestidosLivresAction` igual ao atual, que usa `obterLead` + `vestidosLivresPara`):
```ts
// src/app/(app)/loja/[lojaId]/noivas/[leadId]/reserva-actions.ts
// Montar/fechar/cancelar a reserva (compromisso) a partir do perfil da NOIVA. "Reservar" adiciona
// o vestido à reserva em montagem (cria se preciso); "Fechar" confirma; vestidos e reservas
// inteiras podem ser removidos. Feedback por query-param (?ok / ?erro) + âncora #reserva.
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterLead } from "@/lib/leads/leads";
import { vestidosLivresPara, type VestidoLivre } from "@/lib/disponibilidade/reservas";
import { abrirReserva, adicionarVestido, removerVestido, fecharReserva, cancelarReserva } from "@/lib/reservas/reservas";

export async function buscarVestidosLivresAction(leadId: string): Promise<VestidoLivre[]> {
  const sc = await getSessaoComLoja();
  if (!sc) return [];
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) return [];
  const lead = await obterLead(sc.loja.id, leadId);
  if (!lead?.casamentoData) return [];
  return vestidosLivresPara(sc.loja.id, lead.casamentoData.toISOString().slice(0, 10));
}

export async function reservarPelaNoivaAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const leadId = String(formData.get("leadId") ?? "");
  const vestidoId = String(formData.get("vestidoId") ?? "");
  const base = `/loja/${sc.loja.id}/noivas/${leadId}`;
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(base);
  if (!vestidoId) redirect(`${base}?erro=sem_vestido#reserva`);
  const r0 = await abrirReserva(sc.loja.id, leadId);
  if (!r0.ok) redirect(`${base}?erro=${r0.motivo}#reserva`);
  const r = await adicionarVestido(sc.loja.id, r0.reservaId, vestidoId);
  if (r.ok) redirect(`${base}?ok=reserva#reserva`);
  const em = r.conflitaComDatas?.[0];
  redirect(`${base}?erro=${r.motivo}${em ? `&em=${em}` : ""}#reserva`);
}

export async function fecharReservaAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const leadId = String(formData.get("leadId") ?? "");
  const reservaId = String(formData.get("reservaId") ?? "");
  const base = `/loja/${sc.loja.id}/noivas/${leadId}`;
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(base);
  const r = await fecharReserva(sc.loja.id, reservaId);
  redirect(`${base}?${r.ok ? "ok=fechada" : `erro=${r.motivo}`}#reserva`);
}

export async function removerVestidoPelaNoivaAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const leadId = String(formData.get("leadId") ?? "");
  const reservaId = String(formData.get("reservaId") ?? "");
  const bloqueioId = String(formData.get("bloqueioId") ?? "");
  const base = `/loja/${sc.loja.id}/noivas/${leadId}`;
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(base);
  const r = await removerVestido(sc.loja.id, reservaId, bloqueioId);
  redirect(`${base}?${r.ok ? "ok=item_removido" : `erro=${r.motivo}`}#reserva`);
}

export async function cancelarReservaPelaNoivaAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  const leadId = String(formData.get("leadId") ?? "");
  const reservaId = String(formData.get("reservaId") ?? "");
  const base = `/loja/${sc.loja.id}/noivas/${leadId}`;
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(base);
  await cancelarReserva(sc.loja.id, reservaId);
  redirect(`${base}?ok=cancelada#reserva`);
}
```

- [ ] **Step 2: Imports e mensagens no `page.tsx`**

Trocar o import de reservas (linha ~24):
```ts
import { listarReservasDaNoiva, type Reserva } from "@/lib/reservas/reservas";
```
Trocar o import das actions (~26-29):
```ts
import {
  reservarPelaNoivaAction,
  fecharReservaAction,
  removerVestidoPelaNoivaAction,
  cancelarReservaPelaNoivaAction,
  buscarVestidosLivresAction,
} from "./reserva-actions";
```
Ampliar `MENSAGENS` (~63-69):
```ts
  reserva: "Vestido adicionado à reserva.",
  fechada: "Reserva confirmada.",
  item_removido: "Vestido removido da reserva.",
  cancelada: "Reserva cancelada.",
  indisponivel: "Este vestido já está reservado para uma data próxima. Escolha outra peça.",
  sem_data: "Defina a data do casamento para reservar um vestido.",
  sem_vestido: "Escolha um vestido para reservar.",
  reserva_vazia: "Adicione ao menos um vestido antes de fechar a reserva.",
  transicao_invalida: "Esta reserva já foi confirmada.",
  item_invalido: "Vestido não encontrado nesta reserva.",
  reserva_invalida: "Reserva não encontrada. Adicione o vestido novamente.",
  lead_invalido: "Noiva não encontrada.",
```

- [ ] **Step 3: Trocar a leitura no `Promise.all`**

Na desestruturação do `Promise.all` (~119-126), trocar a chamada por `listarReservasDaNoiva(sc.loja.id, leadId)` e renomear a variável recebida de `reservas` para `reservas` (mantém o nome — agora são cabeças). Logo após:
```ts
  const reservaEmMontagem = reservas.find((r) => r.status === "EM_MONTAGEM") ?? null;
  const reservasConfirmadas = reservas.filter((r) => r.status === "CONFIRMADA");
```

- [ ] **Step 4: Reescrever a seção `#reserva` (JSX)**

Substituir o bloco `<section id="reserva">…</section>` (~375-414) por (usa `Bloco`, `BotaoConfirmar`, `Link`, `ReservaLivreInline` já importados; classes seguindo o idioma da página — conferir tokens contra `globals.css` e reusar os já presentes na MESMA página se algum divergir):
```tsx
      {(reservas.length > 0 || podeReservar) && (
        <section id="reserva" className="scroll-mt-24">
          <Bloco titulo="Reserva">
            {reservaEmMontagem && (
              <div className="mb-6">
                <p className="mb-2 text-[12px] uppercase tracking-wide text-cinza-fumo">Em montagem</p>
                <ul className="flex flex-col gap-2">
                  {reservaEmMontagem.itens.map((it) => (
                    <li key={it.bloqueioId} className="flex items-center justify-between gap-3">
                      <span className="text-[14px] text-grafite"><span className="text-cinza-fumo">{it.codigo}</span> · {it.nome}</span>
                      {podeReservar && (
                        <form action={removerVestidoPelaNoivaAction}>
                          <input type="hidden" name="leadId" value={leadId} />
                          <input type="hidden" name="reservaId" value={reservaEmMontagem.id} />
                          <input type="hidden" name="bloqueioId" value={it.bloqueioId} />
                          <BotaoConfirmar mensagem={`Remover ${it.nome} da reserva?`} ariaLabel={`Remover ${it.nome}`} className="inline-flex min-h-11 items-center rounded-sm text-[12px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">remover</BotaoConfirmar>
                        </form>
                      )}
                    </li>
                  ))}
                  {reservaEmMontagem.itens.length === 0 && <li className="text-[13px] text-cinza-fumo">Nenhum vestido selecionado ainda.</li>}
                </ul>
                {podeReservar && reservaEmMontagem.itens.length > 0 && (
                  <form action={fecharReservaAction} className="mt-3">
                    <input type="hidden" name="leadId" value={leadId} />
                    <input type="hidden" name="reservaId" value={reservaEmMontagem.id} />
                    <button type="submit" className="inline-flex min-h-11 items-center rounded-md bg-bordo px-4 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-bordo/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">Fechar a reserva</button>
                  </form>
                )}
              </div>
            )}

            {reservasConfirmadas.length > 0 && (
              <div className="mb-6 flex flex-col gap-4">
                {reservasConfirmadas.map((r) => (
                  <div key={r.id} className="rounded-md border border-borda-suave p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[12px] uppercase tracking-wide text-cinza-fumo">Confirmada</p>
                      {podeReservar && (
                        <form action={cancelarReservaPelaNoivaAction}>
                          <input type="hidden" name="leadId" value={leadId} />
                          <input type="hidden" name="reservaId" value={r.id} />
                          <BotaoConfirmar mensagem="Cancelar esta reserva inteira? Os vestidos voltam a ficar livres." ariaLabel="Cancelar reserva" className="inline-flex min-h-11 items-center rounded-sm text-[12px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">cancelar reserva</BotaoConfirmar>
                        </form>
                      )}
                    </div>
                    <ul className="flex flex-col gap-1">
                      {r.itens.map((it) => (
                        <li key={it.bloqueioId}>
                          <Link href={`/loja/${lojaId}/reservas/${it.bloqueioId}`} className="rounded-sm text-[14px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-bordo hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"><span className="text-cinza-fumo">{it.codigo}</span> · {it.nome}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {reservas.length === 0 && <p className="text-[14px] text-grafite">Nenhum vestido reservado ainda.</p>}

            {podeReservar && (lead.casamentoData
              ? <ReservaLivreInline leadId={leadId} reservar={reservarPelaNoivaAction} buscarLivres={buscarVestidosLivresAction} />
              : <p className="text-[13px] text-cinza-fumo">Defina a data do casamento para reservar um vestido.</p>)}
          </Bloco>
        </section>
      )}
```

- [ ] **Step 5: Gates**

Run: `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run`
Expected: limpo + verde.

- [ ] **Step 6: Commit**
```bash
git add "src/app/(app)/loja/[lojaId]/noivas/[leadId]/reserva-actions.ts" "src/app/(app)/loja/[lojaId]/noivas/[leadId]/page.tsx"
git commit -m "feat(reserva): perfil da noiva — reserva multi-item (montar/fechar/cancelar)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Livro de reservas — uma linha por reserva (cabeça)

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/reservas/page.tsx`

- [ ] **Step 1: Trocar a fonte de dados**

Trocar o import (linha ~9):
```ts
import { listarReservasDaLoja, type Reserva } from "@/lib/reservas/reservas";
```
Ajustar `Grupo`/`agruparPorMes` para `Reserva` (substitui `ReservaDaLoja`):
```ts
type Grupo = { chave: string; rotulo: string; reservas: Reserva[] };

function agruparPorMes(reservas: Reserva[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const r of reservas) {
    if (!r.casamentoData) continue;
    const chave = chaveMes(r.casamentoData);
    let grupo = grupos.find((g) => g.chave === chave);
    if (!grupo) { grupo = { chave, rotulo: mesAno.format(r.casamentoData), reservas: [] }; grupos.push(grupo); }
    grupo.reservas.push(r);
  }
  return grupos;
}
```
Trocar a chamada na page:
```ts
  const reservas = await listarReservasDaLoja(sc.loja.id, { passadas });
```
(o cálculo de `leadIds`/`estagios` segue — `r.leadId` agora é sempre não-nulo, o `.filter(...)` continua válido.)

- [ ] **Step 2: Linha de cada reserva (JSX)**

Onde hoje mostra `r.codigo`/`r.nome` (um vestido só), trocar para chips dos N vestidos + badge de estado (conferir `bg-papel-suave`/`border-borda` contra `globals.css`):
```tsx
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.itens.map((it) => (
                    <span key={it.bloqueioId} className="inline-flex items-center rounded-sm bg-papel-suave px-2 py-0.5 text-[12px] text-grafite" title={`${it.codigo} · ${it.nome}`}>{it.nome}</span>
                  ))}
                  {r.itens.length === 0 && <span className="text-[12px] text-cinza-fumo">sem vestidos</span>}
                  {r.status === "EM_MONTAGEM" && (
                    <span className="inline-flex items-center rounded-sm border border-borda px-2 py-0.5 text-[11px] uppercase tracking-wide text-cinza-fumo">Em montagem</span>
                  )}
                </div>
```
O link da noiva (`/loja/${lojaId}/noivas/${r.leadId}`) e a urgência bordô (`casamentoUrgente`) **permanecem**. Se houver `<Link href={.../reservas/${r.id}}>` apontando ao detalhe do bloqueio antigo, trocar por `href={.../noivas/${r.leadId}#reserva}` (a cabeça não tem página própria; o detalhe é por vestido).

- [ ] **Step 3: Gates**

Run: `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run`
Expected: limpo + verde.

- [ ] **Step 4: Commit**
```bash
git add "src/app/(app)/loja/[lojaId]/reservas/page.tsx"
git commit -m "feat(reserva): livro de reservas por cabeça (chips dos vestidos + estado)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Detalhe do item — migalho de volta à reserva

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx`

- [ ] **Step 1: Adicionar o migalho**

A page já carrega `obterReservaDetalhe(...)` (retorna `leadId`/`noivaNome`). Perto do topo do conteúdo, inserir (importar `Link from "next/link"` se faltar; conferir o nome da variável do detalhe — `detalhe`/`reserva` — e `lojaId`):
```tsx
      {detalhe.leadId && detalhe.noivaNome && (
        <Link href={`/loja/${lojaId}/noivas/${detalhe.leadId}#reserva`} className="rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-bordo hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">
          ← Parte da reserva de {detalhe.noivaNome}
        </Link>
      )}
```

- [ ] **Step 2: Gates**

Run: `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run`
Expected: limpo + verde.

- [ ] **Step 3: Commit**
```bash
git add "src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx"
git commit -m "feat(reserva): detalhe do item linka de volta à reserva da noiva

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Revisão de design + verificação visual + gate final

- [ ] **Step 1: `atelier-design-review`**

Invocar a skill sobre as telas tocadas (perfil `#reserva`, livro, detalhe). Foco: "Reserva" como a escolha da noiva (peças, não e-commerce); **zero** "sacola"; bordô só no CTA "Fechar a reserva" e na urgência ≤14d; microcopy humano ("Em montagem"/"Confirmada"); estado-zero gentil. Aplicar ajustes (sem tocar regra/rota/banco) e commitar se houver mudança.

- [ ] **Step 2: Verificação visual (app no ar, porta própria)**
```bash
node node_modules/next/dist/bin/next dev -p 5051 &
APP=$!
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:5051/login && break; sleep 2; done
# perfil de uma noiva com data → adicionar 2 vestidos (Em montagem) → Fechar a reserva (Confirmada)
# → livro mostra a reserva com 2 chips → clicar num vestido abre o detalhe com o migalho.
kill $APP
```
Conferir também: conflito de data → aviso "já está reservado para …".

- [ ] **Step 3: Gate final**

Run: `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run`
Expected: limpo; **toda** a suíte verde (reservas novas + regressão de motor/reservas/agenda/atendimentos/**contratos** intacta).

- [ ] **Step 4: Atualizar `docs/estado-atual.md`**

Seção curta: Fatia 1 entregue (cabeça `Reserva` + `reservaId`, `reservas/reservas.ts`, telas cabeça-cientes, `EM_MONTAGEM→CONFIRMADA`, desvio "reserva já bloqueia" → HOLD/sinal na Fatia 4, renomes `removerBloqueio`/`listarVestidosReservadosDaNoiva`). Apontar spec/plano e mover o ponteiro da próxima frente para a **Fatia 1.5 (Contrato da reserva — ADR 0002)**.

- [ ] **Step 5: Commit**
```bash
git add docs/estado-atual.md
git commit -m "docs(estado-atual): Fatia 1 do núcleo Seleção→Reserva entregue (reserva multi-item)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notas de escopo (spec §9 — NÃO fazer aqui)
- **Contrato da reserva inteira + valor herdado do orçamento** → **Fatia 1.5** (plano `docs/superpowers/plans/2026-06-15-contrato-da-reserva.md`, ADR 0002).
- Acessórios + preço de pacote → Fatia 2. Filtro por disponibilidade + favoritos → Fatia 3. HOLD + sinal → Fatia 4.
- Detalhe segue `[bloqueioId]` (por vestido).
- `listarVestidosReservadosDaNoiva` (por-vestido) fica — `contratos.ts` usa; `listarReservasDoVestido` segue na tela do vestido.
