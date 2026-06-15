# Reserva: carrinho multi-item de vestidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a vendedora reserve **vários vestidos de uma vez** para a mesma noiva, agrupados numa cabeça `Reserva` (sacola), em vez de uma reserva solta por vez.

**Architecture:** Migração **aditiva** — nova cabeça `Reserva` + `BloqueioVestido.reservaId?`. Cada `BloqueioVestido tipo RESERVA_CASAMENTO` vira **item** de uma `Reserva`. O motor de disponibilidade, as provas (`Atendimento.bloqueioId`), o contrato (`Contrato.bloqueioVestidoId`) e a jornada **não mudam** — seguem apontando para o item (o vestido). A novidade é uma camada de composição em `src/lib/reservas/sacola.ts` por cima do primitivo `reservarVestido`.

**Tech Stack:** Next.js (App Router, Server Actions, `force-dynamic`), Prisma (client custom em `src/generated/prisma`), Postgres, Vitest (integração com Postgres real), `tenantPrisma` (isolamento por loja). Spec: `docs/superpowers/specs/2026-06-15-reserva-carrinho-multi-item-design.md`.

**Gates de cada commit (CLAUDE.md — commitar direto na `main`):**
- `node node_modules/typescript/bin/tsc --noEmit` → limpo
- `node node_modules/vitest/vitest.mjs run` → tudo verde
- Após mudar schema: `npx prisma migrate deploy` **e** `npx prisma generate` (o `migrate dev` do Replit é não-interativo; ver estado-atual.md). Se `node`/`npx` não estiverem no PATH, estão em `/nix/store/*/bin`.

---

## Task 1: Schema + migração (cabeça `Reserva` + `reservaId` no `BloqueioVestido`)

**Files:**
- Modify: `prisma/schema.prisma` (model `BloqueioVestido` ~285-304; model `Lead` ~228-256; model `Loja`)
- Create: `prisma/migrations/20260615130000_reserva_cabeca/migration.sql`
- Modify: `src/lib/tenant.ts:30-52` (adicionar `"Reserva"` em `TENANT_MODELS`)

- [ ] **Step 1: Adicionar o enum e o model `Reserva` ao schema**

No `prisma/schema.prisma`, logo **antes** do `model BloqueioVestido`, inserir:

```prisma
enum ReservaStatus {
  SACOLA // em montagem (carrinho aberto)
  RESERVADA // fechada/confirmada (firme)
  CANCELADA // cancelada (terminal)
}

// Cabeça da reserva — a "sacola" da noiva: agrupa N vestidos (itens) de um mesmo
// casamento. Cada item é um BloqueioVestido (RESERVA_CASAMENTO) com reservaId apontando
// para cá. Migração aditiva: o motor segue lendo o item, não a cabeça.
model Reserva {
  id            String        @id @default(cuid())
  lojaId        String
  leadId        String
  casamentoData DateTime // data da sacola; os itens nascem com a mesma data
  status        ReservaStatus @default(SACOLA)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  loja  Loja              @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  lead  Lead              @relation(fields: [leadId], references: [id], onDelete: Cascade)
  itens BloqueioVestido[]
}
```

- [ ] **Step 2: Dar `reservaId` ao `BloqueioVestido`**

No `model BloqueioVestido`, adicionar o campo e a relação (manter o resto igual):

```prisma
  reservaId         String?
  reserva           Reserva?     @relation(fields: [reservaId], references: [id], onDelete: Cascade)
```

- [ ] **Step 3: Back-relations em `Lead` e `Loja`**

No `model Lead`, junto das outras relações (após `bloqueios BloqueioVestido[]`), adicionar:

```prisma
  reservas     Reserva[]
```

No `model Loja`, junto das relações de loja (onde estão `bloqueios`/`leads`/etc.), adicionar:

```prisma
  reservas Reserva[]
```

- [ ] **Step 4: Escrever a migração SQL hand-authored**

Criar `prisma/migrations/20260615130000_reserva_cabeca/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "ReservaStatus" AS ENUM ('SACOLA', 'RESERVADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "casamentoData" TIMESTAMP(3) NOT NULL,
    "status" "ReservaStatus" NOT NULL DEFAULT 'SACOLA',
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

-- Backfill: uma cabeça Reserva por grupo (lojaId, leadId, casamentoData) das reservas
-- existentes (status RESERVADA). Reservas da mesma noiva+data viram uma sacola multi-item.
INSERT INTO "Reserva" ("id", "lojaId", "leadId", "casamentoData", "status", "createdAt", "updatedAt")
SELECT
    md5(g."lojaId" || '|' || g."leadId" || '|' || g."casamentoData"::text),
    g."lojaId",
    g."leadId",
    g."casamentoData",
    'RESERVADA',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "lojaId", "leadId", "casamentoData"
    FROM "BloqueioVestido"
    WHERE "tipo" = 'RESERVA_CASAMENTO' AND "leadId" IS NOT NULL AND "casamentoData" IS NOT NULL
) g;

-- Backfill: liga cada bloqueio de reserva à sua cabeça (join pelas 3 colunas do grupo).
UPDATE "BloqueioVestido" bv
SET "reservaId" = r."id"
FROM "Reserva" r
WHERE bv."tipo" = 'RESERVA_CASAMENTO'
  AND bv."leadId" IS NOT NULL
  AND bv."casamentoData" IS NOT NULL
  AND r."lojaId" = bv."lojaId"
  AND r."leadId" = bv."leadId"
  AND r."casamentoData" = bv."casamentoData";
```

> Nota: `md5(...)` gera id determinístico por grupo (coluna é TEXT — conviver com cuids é ok) e não exige extensão. Manutenção e `RESERVA_CASAMENTO` com `leadId NULL` ficam com `reservaId = NULL` de propósito (Step 7 verifica).

- [ ] **Step 5: Registrar `Reserva` em `TENANT_MODELS`**

Em `src/lib/tenant.ts`, no array `TENANT_MODELS` (linha ~30), adicionar a entrada (após `"BloqueioVestido"` mantém a vizinhança lógica):

```ts
  "BloqueioVestido",
  "Reserva",
  "RegraDisponibilidade",
```

- [ ] **Step 6: Aplicar a migração e regenerar o client**

Run:
```bash
npx prisma migrate deploy && npx prisma generate
```
Expected: `migrate deploy` aplica `20260615130000_reserva_cabeca`; `generate` recria `src/generated/prisma` com `prisma.reserva` e o enum `ReservaStatus`.

- [ ] **Step 7: Verificar o backfill (nenhuma reserva órfã)**

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT count(*) AS orfas FROM "BloqueioVestido"
WHERE "tipo" = 'RESERVA_CASAMENTO' AND "leadId" IS NOT NULL AND "reservaId" IS NULL;
SQL
```
Expected: `orfas = 0`. (Se o comando não imprimir, rodar a mesma query via `psql $DATABASE_URL`.)

- [ ] **Step 8: Gates verdes**

Run:
```bash
node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run
```
Expected: `tsc` sem erros; toda a suíte existente (incl. `disponibilidade/__tests__/*`) verde — a migração é aditiva, nenhum comportamento muda.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260615130000_reserva_cabeca src/lib/tenant.ts
git commit -m "feat(reserva): cabeça Reserva + reservaId no BloqueioVestido (migração aditiva + backfill)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `reservarVestido` aceita `reservaId` opcional

O primitivo de item ganha um parâmetro opcional para nascer já ligado a uma cabeça. Retrocompatível: chamadas atuais (sem `reservaId`) seguem iguais.

**Files:**
- Modify: `src/lib/disponibilidade/reservas.ts:70-128`
- Test: `src/lib/disponibilidade/__tests__/reservas.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao `describe(...)` de `src/lib/disponibilidade/__tests__/reservas.test.ts` (importar `tenantPrisma` já está no topo):

```ts
  it("grava reservaId no bloqueio quando passado", async () => {
    const reserva = await tenantPrisma(prisma, loja).reserva.create({
      data: { leadId: noiva, casamentoData: new Date("2028-03-10T00:00:00.000Z"), status: "SACOLA" } as never,
    });
    const r = await reservarVestido(loja, {
      vestidoId: vestidoA,
      leadId: noiva,
      casamentoData: "2028-03-10",
      reservaId: reserva.id,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const row = await tenantPrisma(prisma, loja).bloqueioVestido.findUnique({ where: { id: r.bloqueioId } });
      expect(row?.reservaId).toBe(reserva.id);
    }
  });
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/disponibilidade/__tests__/reservas.test.ts`
Expected: FALHA — `reservarVestido` ainda não aceita `reservaId` (erro de tipo TS / `reservaId` não gravado).

- [ ] **Step 3: Adicionar `reservaId` ao input e ao create**

Em `src/lib/disponibilidade/reservas.ts`, mudar a assinatura (linha ~70-73):

```ts
export async function reservarVestido(
  lojaId: string,
  input: { vestidoId: string; leadId: string; casamentoData: string; reservaId?: string },
): Promise<ResultadoReserva> {
  const db = tenantPrisma(prisma, lojaId);
  const { vestidoId, leadId, casamentoData, reservaId } = input;
```

E no `db.bloqueioVestido.create` (linha ~117-126), incluir `reservaId` nos dados:

```ts
  const criado = await db.bloqueioVestido.create({
    // O guard tenantPrisma carimba lojaId em runtime; o tipo do create exige lojaId,
    // por isso o cast (mesma convenção de criarVestido/criarLead).
    data: {
      vestidoId,
      leadId,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: meiaNoiteUTC(casamentoData),
      reservaId: reservaId ?? null,
    } as never,
  });
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/disponibilidade/__tests__/reservas.test.ts`
Expected: PASS (todos do arquivo, incl. o novo).

- [ ] **Step 5: Commit**

```bash
git add src/lib/disponibilidade/reservas.ts src/lib/disponibilidade/__tests__/reservas.test.ts
git commit -m "feat(reserva): reservarVestido aceita reservaId opcional (item de uma cabeça)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `sacola.ts` — `abrirOuObterSacola` + `adicionarItem`

Camada de composição (a cabeça/carrinho). Módulo novo e focado; chama o primitivo de item.

**Files:**
- Create: `src/lib/reservas/sacola.ts`
- Test: `src/lib/reservas/__tests__/sacola.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/reservas/__tests__/sacola.test.ts`:

```ts
// src/lib/reservas/__tests__/sacola.test.ts
// Integração (Postgres real): a camada de composição da sacola sobre o primitivo de item.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { abrirOuObterSacola, adicionarItem } from "@/lib/reservas/sacola";

const MARK = "t-sacola-";
let loja = "";
let vestidoA = "";
let vestidoB = "";
let noiva = "";
let semData = "";

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  vestidoA = (await db.vestido.create({ data: { codigo: `${MARK}A`, nome: `${MARK}A`, precoBase: 1000 } as never })).id;
  vestidoB = (await db.vestido.create({ data: { codigo: `${MARK}B`, nome: `${MARK}B`, precoBase: 2000 } as never })).id;
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}n`, etapa: "NOVO", casamentoData: new Date("2027-05-20T00:00:00.000Z") } as never })).id;
  semData = (await db.lead.create({ data: { noivaNome: `${MARK}sd`, etapa: "NOVO" } as never })).id;
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
});

describe("sacola: abrir e adicionar item", () => {
  it("abre uma sacola e reusa a mesma (find-or-create)", async () => {
    const a = await abrirOuObterSacola(loja, noiva);
    const b = await abrirOuObterSacola(loja, noiva);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.reservaId).toBe(b.reservaId);
  });

  it("recusa abrir sem data de casamento", async () => {
    const r = await abrirOuObterSacola(loja, semData);
    expect(r).toMatchObject({ ok: false, motivo: "sem_data" });
  });

  it("adiciona item à sacola (bloqueio com reservaId) e barra conflito do mesmo vestido", async () => {
    const s = await abrirOuObterSacola(loja, noiva);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const i1 = await adicionarItem(loja, s.reservaId, vestidoA);
    expect(i1.ok).toBe(true);
    const i2 = await adicionarItem(loja, s.reservaId, vestidoB);
    expect(i2.ok).toBe(true);
    // Mesmo vestido, mesma sacola/data → indisponível (motor barra).
    const i3 = await adicionarItem(loja, s.reservaId, vestidoA);
    expect(i3).toMatchObject({ ok: false, motivo: "indisponivel" });

    const itens = await tenantPrisma(prisma, loja).bloqueioVestido.count({ where: { reservaId: s.reservaId } });
    expect(itens).toBe(2);
  });

  it("recusa adicionar a uma reserva inexistente", async () => {
    const r = await adicionarItem(loja, "nao-existe", vestidoA);
    expect(r).toMatchObject({ ok: false, motivo: "reserva_invalida" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/reservas/__tests__/sacola.test.ts`
Expected: FALHA — `Cannot find module '@/lib/reservas/sacola'`.

- [ ] **Step 3: Criar `sacola.ts` com as duas funções**

Criar `src/lib/reservas/sacola.ts`:

```ts
// src/lib/reservas/sacola.ts
// Camada de COMPOSIÇÃO da reserva (a "sacola"/carrinho): a cabeça Reserva que agrupa
// N vestidos. Cada item é criado pelo primitivo reservarVestido (que valida o motor) já
// ligado à cabeça via reservaId. Tudo escopado por loja via tenantPrisma. Decisão:
// docs/superpowers/specs/2026-06-15-reserva-carrinho-multi-item-design.md
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { reservarVestido, cancelarReserva } from "@/lib/disponibilidade/reservas";
import { ymd } from "@/lib/tempo";

export type ResultadoSacola =
  | { ok: true; reservaId: string }
  | { ok: false; motivo: "sem_data" | "lead_invalido" };

/**
 * Acha a sacola ABERTA (status SACOLA) da noiva para a data do casamento dela, ou cria
 * uma. Find-or-create garante no máximo UMA sacola aberta por (leadId, casamentoData).
 * Falha fechada se a noiva não tem data de casamento.
 */
export async function abrirOuObterSacola(lojaId: string, leadId: string): Promise<ResultadoSacola> {
  const db = tenantPrisma(prisma, lojaId);
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, motivo: "lead_invalido" };
  if (!lead.casamentoData) return { ok: false, motivo: "sem_data" };

  const existente = await db.reserva.findFirst({
    where: { leadId, status: "SACOLA", casamentoData: lead.casamentoData },
  });
  if (existente) return { ok: true, reservaId: existente.id };

  const criada = await db.reserva.create({
    // tenantPrisma carimba lojaId; cast pela mesma razão de criarVestido/reservar.
    data: { leadId, casamentoData: lead.casamentoData, status: "SACOLA" } as never,
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
 * Adiciona um vestido como item de uma sacola ABERTA. Valida que a reserva é da loja e
 * está em SACOLA, depois chama reservarVestido (que projeta o motor → barra double-booking)
 * com o reservaId setado. Propaga o motivo de reservarVestido.
 */
export async function adicionarItem(
  lojaId: string,
  reservaId: string,
  vestidoId: string,
): Promise<ResultadoAdicionar> {
  const db = tenantPrisma(prisma, lojaId);
  const reserva = await db.reserva.findUnique({ where: { id: reservaId } });
  if (!reserva || reserva.status !== "SACOLA") return { ok: false, motivo: "reserva_invalida" };

  const r = await reservarVestido(lojaId, {
    vestidoId,
    leadId: reserva.leadId,
    casamentoData: ymd(reserva.casamentoData)!,
    reservaId,
  });
  if (r.ok) return { ok: true, bloqueioId: r.bloqueioId };
  return { ok: false, motivo: r.motivo, conflitaComDatas: r.conflitaComDatas };
}

// cancelarReserva é re-exportado para os consumidores que ainda removem item por id direto.
export { cancelarReserva };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/reservas/__tests__/sacola.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reservas/sacola.ts src/lib/reservas/__tests__/sacola.test.ts
git commit -m "feat(reserva): sacola.ts — abrirOuObterSacola + adicionarItem (composição sobre o motor)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `sacola.ts` — `removerItem` + `fecharReserva` + `cancelarReservaInteira`

**Files:**
- Modify: `src/lib/reservas/sacola.ts`
- Test: `src/lib/reservas/__tests__/sacola.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar um novo `describe` em `src/lib/reservas/__tests__/sacola.test.ts` (importar as 3 funções no topo: `removerItem, fecharReserva, cancelarReservaInteira`):

```ts
import { abrirOuObterSacola, adicionarItem, removerItem, fecharReserva, cancelarReservaInteira } from "@/lib/reservas/sacola";
import { vestidosLivresPara } from "@/lib/disponibilidade/reservas";
```

```ts
describe("sacola: remover, fechar, cancelar", () => {
  it("remover o último item apaga a cabeça vazia", async () => {
    const lead = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}r1`, etapa: "NOVO", casamentoData: new Date("2027-07-01T00:00:00.000Z") } as never })).id;
    const s = await abrirOuObterSacola(loja, lead);
    if (!s.ok) throw new Error("sacola");
    const i = await adicionarItem(loja, s.reservaId, vestidoA);
    if (!i.ok) throw new Error("item");

    const rem = await removerItem(loja, s.reservaId, i.bloqueioId);
    expect(rem.ok).toBe(true);
    const cabeca = await tenantPrisma(prisma, loja).reserva.findUnique({ where: { id: s.reservaId } });
    expect(cabeca).toBeNull();
  });

  it("removerItem recusa bloqueio que não é da reserva", async () => {
    const s = await abrirOuObterSacola(loja, noiva);
    if (!s.ok) throw new Error("sacola");
    const rem = await removerItem(loja, s.reservaId, "nao-existe");
    expect(rem).toMatchObject({ ok: false, motivo: "item_invalido" });
  });

  it("fecharReserva: SACOLA→RESERVADA; recusa vazia e não-sacola", async () => {
    const lead = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}r2`, etapa: "NOVO", casamentoData: new Date("2027-08-01T00:00:00.000Z") } as never })).id;
    const vazia = await abrirOuObterSacola(loja, lead);
    if (!vazia.ok) throw new Error("sacola");
    expect(await fecharReserva(loja, vazia.reservaId)).toMatchObject({ ok: false, motivo: "sacola_vazia" });

    const item = await adicionarItem(loja, vazia.reservaId, vestidoB);
    if (!item.ok) throw new Error("item");
    expect(await fecharReserva(loja, vazia.reservaId)).toMatchObject({ ok: true });
    // Já fechada → transição inválida.
    expect(await fecharReserva(loja, vazia.reservaId)).toMatchObject({ ok: false, motivo: "transicao_invalida" });
  });

  it("cancelarReservaInteira apaga a cabeça e libera os vestidos (cascade)", async () => {
    const lead = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}r3`, etapa: "NOVO", casamentoData: new Date("2027-09-15T00:00:00.000Z") } as never })).id;
    const vestidoC = (await tenantPrisma(prisma, loja).vestido.create({ data: { codigo: `${MARK}C`, nome: `${MARK}C`, precoBase: 3000 } as never })).id;
    const s = await abrirOuObterSacola(loja, lead);
    if (!s.ok) throw new Error("sacola");
    await adicionarItem(loja, s.reservaId, vestidoC);

    expect((await vestidosLivresPara(loja, "2027-09-15")).some((v) => v.id === vestidoC)).toBe(false);
    await cancelarReservaInteira(loja, s.reservaId);
    expect(await tenantPrisma(prisma, loja).reserva.findUnique({ where: { id: s.reservaId } })).toBeNull();
    expect((await vestidosLivresPara(loja, "2027-09-15")).some((v) => v.id === vestidoC)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/reservas/__tests__/sacola.test.ts`
Expected: FALHA — `removerItem`/`fecharReserva`/`cancelarReservaInteira` não existem.

- [ ] **Step 3: Implementar as 3 funções**

Adicionar ao final de `src/lib/reservas/sacola.ts` (antes do `export { cancelarReserva }`, ou após — tanto faz):

```ts
export type ResultadoRemover = { ok: true } | { ok: false; motivo: "item_invalido" };

/**
 * Remove um item (vestido) de uma reserva. Valida que o bloqueio pertence à reserva
 * (da loja). Se a sacola ficar SEM itens, apaga a cabeça vazia (só quando ainda SACOLA).
 */
export async function removerItem(
  lojaId: string,
  reservaId: string,
  bloqueioId: string,
): Promise<ResultadoRemover> {
  const db = tenantPrisma(prisma, lojaId);
  const item = await db.bloqueioVestido.findUnique({ where: { id: bloqueioId } });
  if (!item || item.reservaId !== reservaId) return { ok: false, motivo: "item_invalido" };

  await cancelarReserva(lojaId, bloqueioId);

  const restantes = await db.bloqueioVestido.count({ where: { reservaId } });
  if (restantes === 0) {
    const reserva = await db.reserva.findUnique({ where: { id: reservaId } });
    if (reserva?.status === "SACOLA") await db.reserva.deleteMany({ where: { id: reservaId } });
  }
  return { ok: true };
}

export type ResultadoFechar = { ok: true } | { ok: false; motivo: "transicao_invalida" | "sacola_vazia" };

/** Fecha a sacola: SACOLA → RESERVADA. Rejeita não-SACOLA e sacola de 0 itens. */
export async function fecharReserva(lojaId: string, reservaId: string): Promise<ResultadoFechar> {
  const db = tenantPrisma(prisma, lojaId);
  const reserva = await db.reserva.findUnique({ where: { id: reservaId } });
  if (!reserva || reserva.status !== "SACOLA") return { ok: false, motivo: "transicao_invalida" };
  const itens = await db.bloqueioVestido.count({ where: { reservaId } });
  if (itens === 0) return { ok: false, motivo: "sacola_vazia" };
  await db.reserva.update({ where: { id: reservaId }, data: { status: "RESERVADA" } });
  return { ok: true };
}

/** Cancela a reserva inteira: apaga a cabeça → cascade remove os itens-bloqueios (libera os vestidos). */
export async function cancelarReservaInteira(lojaId: string, reservaId: string): Promise<void> {
  await tenantPrisma(prisma, lojaId).reserva.deleteMany({ where: { id: reservaId } });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/reservas/__tests__/sacola.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reservas/sacola.ts src/lib/reservas/__tests__/sacola.test.ts
git commit -m "feat(reserva): sacola.ts — removerItem + fecharReserva + cancelarReservaInteira

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `sacola.ts` — leituras cabeça-cientes (`listarSacolasDaNoiva`, `listarReservasDaLojaAgrupadas`, `obterSacolaDetalhe`)

**Files:**
- Modify: `src/lib/reservas/sacola.ts`
- Test: `src/lib/reservas/__tests__/sacola.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar import e um `describe` em `src/lib/reservas/__tests__/sacola.test.ts`:

```ts
import { listarSacolasDaNoiva, listarReservasDaLojaAgrupadas, obterSacolaDetalhe } from "@/lib/reservas/sacola";
```

```ts
describe("sacola: leituras cabeça-cientes", () => {
  it("listarSacolasDaNoiva agrupa itens por cabeça", async () => {
    const lead = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}r4`, etapa: "NOVO", casamentoData: new Date("2027-10-10T00:00:00.000Z") } as never })).id;
    const v1 = (await tenantPrisma(prisma, loja).vestido.create({ data: { codigo: `${MARK}D`, nome: `${MARK}D`, precoBase: 1000 } as never })).id;
    const v2 = (await tenantPrisma(prisma, loja).vestido.create({ data: { codigo: `${MARK}E`, nome: `${MARK}E`, precoBase: 1000 } as never })).id;
    const s = await abrirOuObterSacola(loja, lead);
    if (!s.ok) throw new Error("sacola");
    await adicionarItem(loja, s.reservaId, v1);
    await adicionarItem(loja, s.reservaId, v2);

    const sacolas = await listarSacolasDaNoiva(loja, lead);
    expect(sacolas).toHaveLength(1);
    expect(sacolas[0].status).toBe("SACOLA");
    expect(sacolas[0].itens.map((i) => i.codigo).sort()).toEqual([`${MARK}D`, `${MARK}E`]);

    const det = await obterSacolaDetalhe(loja, s.reservaId);
    expect(det?.itens).toHaveLength(2);
  });

  it("listarReservasDaLojaAgrupadas traz cabeças futuras com itens, ignora canceladas", async () => {
    const futuras = await listarReservasDaLojaAgrupadas(loja, {});
    expect(futuras.every((r) => r.status !== "CANCELADA")).toBe(true);
    expect(futuras.every((r) => Array.isArray(r.itens))).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/reservas/__tests__/sacola.test.ts`
Expected: FALHA — funções de leitura inexistentes.

- [ ] **Step 3: Implementar as leituras**

Adicionar ao topo de `src/lib/reservas/sacola.ts` o import de `hojeUTC`:

```ts
import { ymd, hojeUTC } from "@/lib/tempo";
```
(substitui o import existente `import { ymd } from "@/lib/tempo";`)

E ao final do arquivo:

```ts
export type ItemSacola = { bloqueioId: string; vestidoId: string; codigo: string; nome: string };

export type SacolaResumo = {
  id: string;
  status: "SACOLA" | "RESERVADA" | "CANCELADA";
  casamentoData: Date | null;
  leadId: string;
  noivaNome: string | null;
  itens: ItemSacola[];
};

// include + map compartilhados pelas três leituras (DRY).
const INCLUDE_RESUMO = {
  lead: { select: { noivaNome: true } },
  itens: { include: { vestido: { select: { id: true, codigo: true, nome: true } } } },
} as const;

type LinhaResumo = {
  id: string;
  status: "SACOLA" | "RESERVADA" | "CANCELADA";
  casamentoData: Date | null;
  leadId: string;
  lead: { noivaNome: string | null } | null;
  itens: { id: string; vestidoId: string; vestido: { codigo: string; nome: string } }[];
};

function mapResumo(r: LinhaResumo): SacolaResumo {
  return {
    id: r.id,
    status: r.status,
    casamentoData: r.casamentoData,
    leadId: r.leadId,
    noivaNome: r.lead?.noivaNome ?? null,
    itens: r.itens.map((b) => ({ bloqueioId: b.id, vestidoId: b.vestidoId, codigo: b.vestido.codigo, nome: b.vestido.nome })),
  };
}

/** Reservas (SACOLA + RESERVADA) de uma noiva, cada uma com seus vestidos. */
export async function listarSacolasDaNoiva(lojaId: string, leadId: string): Promise<SacolaResumo[]> {
  const rows = await tenantPrisma(prisma, lojaId).reserva.findMany({
    where: { leadId, status: { in: ["SACOLA", "RESERVADA"] } },
    orderBy: { casamentoData: "asc" },
    include: INCLUDE_RESUMO,
  });
  return (rows as LinhaResumo[]).map(mapResumo);
}

/**
 * Livro de reservas por CABEÇA (uma linha por reserva, N vestidos). Futuras por padrão
 * (casamento ≥ hoje, ascendente); `passadas` inverte. Ignora canceladas.
 */
export async function listarReservasDaLojaAgrupadas(
  lojaId: string,
  opts: { passadas?: boolean } = {},
): Promise<SacolaResumo[]> {
  const hoje = hojeUTC();
  const rows = await tenantPrisma(prisma, lojaId).reserva.findMany({
    where: {
      status: { not: "CANCELADA" },
      casamentoData: opts.passadas ? { lt: hoje } : { gte: hoje },
    },
    orderBy: { casamentoData: opts.passadas ? "desc" : "asc" },
    include: INCLUDE_RESUMO,
  });
  return (rows as LinhaResumo[]).map(mapResumo);
}

/** Uma cabeça com seus itens (vista de montagem). null se não for da loja. */
export async function obterSacolaDetalhe(lojaId: string, reservaId: string): Promise<SacolaResumo | null> {
  const r = await tenantPrisma(prisma, lojaId).reserva.findUnique({
    where: { id: reservaId },
    include: INCLUDE_RESUMO,
  });
  return r ? mapResumo(r as LinhaResumo) : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/reservas/__tests__/sacola.test.ts && node node_modules/typescript/bin/tsc --noEmit`
Expected: PASS + `tsc` limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reservas/sacola.ts src/lib/reservas/__tests__/sacola.test.ts
git commit -m "feat(reserva): sacola.ts — leituras cabeça-cientes (noiva, livro, detalhe)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Perfil da noiva — `#reserva` vira o carrinho (montar + fechar)

A superfície principal: onde o desfecho M1 "RESERVOU" cai. A sacola aberta aparece como carrinho (itens removíveis + adicionar + "Fechar reserva"); as reservas confirmadas listam os vestidos com link ao detalhe do item.

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/noivas/[leadId]/reserva-actions.ts`
- Modify: `src/app/(app)/loja/[lojaId]/noivas/[leadId]/page.tsx` (import ~24; Promise.all ~119-126; MENSAGENS ~63-69; seção `#reserva` ~374-415)

- [ ] **Step 1: Reescrever as actions**

Substituir **todo** o corpo de ações de `src/app/(app)/loja/[lojaId]/noivas/[leadId]/reserva-actions.ts` mantendo `buscarVestidosLivresAction` igual e trocando o resto:

```ts
// src/app/(app)/loja/[lojaId]/noivas/[leadId]/reserva-actions.ts
// Montar/fechar/cancelar a reserva (sacola) a partir do perfil da NOIVA. "Reservar"
// adiciona o vestido à sacola aberta (cria se preciso); "Fechar" confirma; itens e
// reservas inteiras podem ser removidos. Feedback por query-param (?ok / ?erro) + âncora #reserva.
"use server";

import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterLead } from "@/lib/leads/leads";
import { vestidosLivresPara, type VestidoLivre } from "@/lib/disponibilidade/reservas";
import {
  abrirOuObterSacola,
  adicionarItem,
  removerItem,
  fecharReserva,
  cancelarReservaInteira,
} from "@/lib/reservas/sacola";

// Busca sob demanda: lista de vestidos livres só quando a vendedora abre o seletor.
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

  const sacola = await abrirOuObterSacola(sc.loja.id, leadId);
  if (!sacola.ok) redirect(`${base}?erro=${sacola.motivo}#reserva`);

  const r = await adicionarItem(sc.loja.id, sacola.reservaId, vestidoId);
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

export async function removerItemPelaNoivaAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const leadId = String(formData.get("leadId") ?? "");
  const reservaId = String(formData.get("reservaId") ?? "");
  const bloqueioId = String(formData.get("bloqueioId") ?? "");
  const base = `/loja/${sc.loja.id}/noivas/${leadId}`;

  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(base);
  const r = await removerItem(sc.loja.id, reservaId, bloqueioId);
  redirect(`${base}?${r.ok ? "ok=item_removido" : `erro=${r.motivo}`}#reserva`);
}

export async function cancelarReservaInteiraAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");

  const leadId = String(formData.get("leadId") ?? "");
  const reservaId = String(formData.get("reservaId") ?? "");
  const base = `/loja/${sc.loja.id}/noivas/${leadId}`;

  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(base);
  await cancelarReservaInteira(sc.loja.id, reservaId);
  redirect(`${base}?ok=cancelada#reserva`);
}
```

- [ ] **Step 2: Atualizar imports e mensagens no `page.tsx`**

Em `src/app/(app)/loja/[lojaId]/noivas/[leadId]/page.tsx`:

Trocar o import de reservas (linha ~24):
```ts
import { listarSacolasDaNoiva, type SacolaResumo } from "@/lib/reservas/sacola";
```

Trocar o import das actions (linha ~26-29):
```ts
import {
  reservarPelaNoivaAction,
  fecharReservaAction,
  removerItemPelaNoivaAction,
  cancelarReservaInteiraAction,
  buscarVestidosLivresAction,
} from "./reserva-actions";
```

Ampliar `MENSAGENS` (objeto em ~63-69) com as novas chaves:
```ts
  reserva: "Vestido adicionado à seleção.",
  fechada: "Reserva fechada.",
  item_removido: "Vestido removido da seleção.",
  cancelada: "Reserva cancelada.",
  indisponivel: "Este vestido já está reservado para uma data próxima. Escolha outra peça.",
  sem_data: "Defina a data do casamento para reservar um vestido.",
  sem_vestido: "Escolha um vestido para reservar.",
  sacola_vazia: "Adicione ao menos um vestido antes de fechar a reserva.",
  transicao_invalida: "Esta reserva já foi fechada.",
  item_invalido: "Item não encontrado nesta reserva.",
  reserva_invalida: "Seleção não encontrada. Adicione o vestido novamente.",
  lead_invalido: "Noiva não encontrada.",
```

- [ ] **Step 3: Trocar a leitura no `Promise.all`**

Na desestruturação do `Promise.all` (linha ~119-126), trocar a chamada `listarReservasDaNoiva(sc.loja.id, leadId)` por:
```ts
    listarSacolasDaNoiva(sc.loja.id, leadId),
```
e renomear a variável recebida de `reservas` para `sacolas` na desestruturação do array.

Logo após o `Promise.all`, derivar as duas listas:
```ts
  const sacolaAberta = sacolas.find((s) => s.status === "SACOLA") ?? null;
  const reservasFechadas = sacolas.filter((s) => s.status === "RESERVADA");
```

- [ ] **Step 4: Reescrever a seção `#reserva` (JSX)**

Substituir o bloco `<section id="reserva">...</section>` (linha ~375-414) por (usa os componentes já importados `Bloco`, `BotaoConfirmar`, `Link`, `ReservaLivreInline`; classes seguindo o idioma da página):

```tsx
      {/* Sacola/reserva — carrinho multi-item. id p/ a âncora #reserva (M1 "RESERVOU"). */}
      {(sacolas.length > 0 || podeReservar) && (
        <section id="reserva" className="scroll-mt-24">
          <Bloco titulo="Seleção da noiva">
            {/* Sacola aberta (carrinho em montagem) */}
            {sacolaAberta && (
              <div className="mb-6">
                <p className="mb-2 text-[12px] uppercase tracking-wide text-cinza-fumo">Seleção em andamento</p>
                <ul className="flex flex-col gap-2">
                  {sacolaAberta.itens.map((it) => (
                    <li key={it.bloqueioId} className="flex items-center justify-between gap-3">
                      <span className="text-[14px] text-grafite">
                        <span className="text-cinza-fumo">{it.codigo}</span> · {it.nome}
                      </span>
                      {podeReservar && (
                        <form action={removerItemPelaNoivaAction}>
                          <input type="hidden" name="leadId" value={leadId} />
                          <input type="hidden" name="reservaId" value={sacolaAberta.id} />
                          <input type="hidden" name="bloqueioId" value={it.bloqueioId} />
                          <BotaoConfirmar
                            mensagem={`Remover ${it.nome} da seleção?`}
                            ariaLabel={`Remover ${it.nome}`}
                            className="inline-flex min-h-11 items-center rounded-sm text-[12px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                          >
                            remover
                          </BotaoConfirmar>
                        </form>
                      )}
                    </li>
                  ))}
                  {sacolaAberta.itens.length === 0 && (
                    <li className="text-[13px] text-cinza-fumo">Nenhum vestido selecionado ainda.</li>
                  )}
                </ul>
                {podeReservar && sacolaAberta.itens.length > 0 && (
                  <form action={fecharReservaAction} className="mt-3">
                    <input type="hidden" name="leadId" value={leadId} />
                    <input type="hidden" name="reservaId" value={sacolaAberta.id} />
                    <button
                      type="submit"
                      className="inline-flex min-h-11 items-center rounded-md bg-bordo px-4 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-bordo/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                    >
                      Fechar a reserva
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Reservas confirmadas */}
            {reservasFechadas.length > 0 && (
              <div className="mb-6 flex flex-col gap-4">
                {reservasFechadas.map((r) => (
                  <div key={r.id} className="rounded-md border border-borda-suave p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[12px] uppercase tracking-wide text-cinza-fumo">Reserva confirmada</p>
                      {podeReservar && (
                        <form action={cancelarReservaInteiraAction}>
                          <input type="hidden" name="leadId" value={leadId} />
                          <input type="hidden" name="reservaId" value={r.id} />
                          <BotaoConfirmar
                            mensagem="Cancelar esta reserva inteira? Os vestidos voltam a ficar livres."
                            ariaLabel="Cancelar reserva"
                            className="inline-flex min-h-11 items-center rounded-sm text-[12px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                          >
                            cancelar reserva
                          </BotaoConfirmar>
                        </form>
                      )}
                    </div>
                    <ul className="flex flex-col gap-1">
                      {r.itens.map((it) => (
                        <li key={it.bloqueioId}>
                          <Link
                            href={`/loja/${lojaId}/reservas/${it.bloqueioId}`}
                            className="rounded-sm text-[14px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-bordo hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
                          >
                            <span className="text-cinza-fumo">{it.codigo}</span> · {it.nome}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {sacolas.length === 0 && <p className="text-[14px] text-grafite">Nenhum vestido reservado ainda.</p>}

            {/* Adicionar vestido à seleção */}
            {podeReservar &&
              (lead.casamentoData ? (
                <ReservaLivreInline leadId={leadId} reservar={reservarPelaNoivaAction} buscarLivres={buscarVestidosLivresAction} />
              ) : (
                <p className="text-[13px] text-cinza-fumo">Defina a data do casamento para reservar um vestido.</p>
              ))}
          </Bloco>
        </section>
      )}
```

> Conferir os nomes exatos dos componentes/variáveis no topo do arquivo antes de editar (`Bloco`, `BotaoConfirmar`, `lead`, `lojaId`, `podeReservar`). Se algum nome de classe utilitário (ex.: `border-borda-suave`, `bg-bordo`, `text-cinza-fumo`) divergir do `globals.css`, usar o equivalente já presente em outras seções da MESMA página — não inventar token novo.

- [ ] **Step 5: Gates verdes**

Run: `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run`
Expected: `tsc` limpo (a antiga `cancelarReservaPelaNoivaAction` foi removida; nenhum import órfão) + suíte verde.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/noivas/[leadId]/reserva-actions.ts" "src/app/(app)/loja/[lojaId]/noivas/[leadId]/page.tsx"
git commit -m "feat(reserva): perfil da noiva — sacola multi-item (montar/fechar/cancelar)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Livro de reservas — uma linha por reserva (cabeça) com chips dos vestidos

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/reservas/page.tsx`

- [ ] **Step 1: Trocar a fonte de dados**

Em `src/app/(app)/loja/[lojaId]/reservas/page.tsx`:

Trocar o import (linha ~9):
```ts
import { listarReservasDaLojaAgrupadas, type SacolaResumo } from "@/lib/reservas/sacola";
```

Trocar o alias de tipo `Grupo` e `agruparPorMes` para operar em `SacolaResumo` (substitui `ReservaDaLoja`):
```ts
type Grupo = { chave: string; rotulo: string; reservas: SacolaResumo[] };

function agruparPorMes(reservas: SacolaResumo[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const r of reservas) {
    if (!r.casamentoData) continue;
    const chave = chaveMes(r.casamentoData);
    let grupo = grupos.find((g) => g.chave === chave);
    if (!grupo) {
      grupo = { chave, rotulo: mesAno.format(r.casamentoData), reservas: [] };
      grupos.push(grupo);
    }
    grupo.reservas.push(r);
  }
  return grupos;
}
```

Trocar a chamada na page (onde estava `listarReservasDaLoja`):
```ts
  const reservas = await listarReservasDaLojaAgrupadas(sc.loja.id, { passadas });
```
(o cálculo de `leadIds`/`estagios` logo abaixo segue igual — `r.leadId` agora é sempre não-nulo, então o `.filter(...)` continua válido.)

- [ ] **Step 2: Atualizar a linha de cada reserva (JSX)**

Cada `grupo.reservas` agora é `SacolaResumo` (com `itens[]` e `status`), não mais um vestido único. Na renderização de cada reserva (onde hoje mostra `r.codigo`/`r.nome` de um vestido só), trocar para os **chips dos N vestidos** + badge de status. Localizar o `.map` das reservas dentro de cada mês e ajustar o conteúdo do vestido para:

```tsx
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.itens.map((it) => (
                    <span
                      key={it.bloqueioId}
                      className="inline-flex items-center rounded-sm bg-papel-suave px-2 py-0.5 text-[12px] text-grafite"
                      title={`${it.codigo} · ${it.nome}`}
                    >
                      {it.nome}
                    </span>
                  ))}
                  {r.itens.length === 0 && <span className="text-[12px] text-cinza-fumo">sem vestidos</span>}
                  {r.status === "SACOLA" && (
                    <span className="inline-flex items-center rounded-sm border border-borda px-2 py-0.5 text-[11px] uppercase tracking-wide text-cinza-fumo">
                      Sacola
                    </span>
                  )}
                </div>
```

O link da noiva (para `/loja/${lojaId}/noivas/${r.leadId}`) e a cor de urgência (`casamentoUrgente`/bordô) **permanecem** — a reserva agora abre no perfil da noiva (`#reserva`), não num bloqueio único. Se houver um `<Link href={.../reservas/${r.id}}>` apontando para o detalhe do bloqueio, trocá-lo por `href={.../noivas/${r.leadId}#reserva}` (a cabeça não tem página própria; o detalhe de item é por vestido).

> Conferir os tokens (`bg-papel-suave`, `border-borda`) contra `globals.css`; usar os já presentes no arquivo se divergirem.

- [ ] **Step 3: Gates verdes**

Run: `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run`
Expected: limpo + verde.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/reservas/page.tsx"
git commit -m "feat(reserva): livro de reservas por cabeça (chips dos vestidos + status)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Detalhe do item — migalho de volta à reserva

O detalhe `reservas/[bloqueioId]` segue sendo por **vestido** (provas/ajustes/movimentação). Só ganha um link "parte da reserva de {noiva}" de volta ao perfil.

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx`

- [ ] **Step 1: Adicionar o migalho**

A page já carrega `obterReservaDetalhe(...)` que retorna `leadId` e `noivaNome`. Perto do topo do conteúdo (abaixo do título da reserva), inserir o link condicional:

```tsx
      {detalhe.leadId && detalhe.noivaNome && (
        <Link
          href={`/loja/${lojaId}/noivas/${detalhe.leadId}#reserva`}
          className="rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-bordo hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        >
          ← Parte da reserva de {detalhe.noivaNome}
        </Link>
      )}
```

> Conferir o nome da variável do detalhe (`detalhe`/`reserva`) e se `Link`/`lojaId` já estão no escopo (a page usa `params`); importar `Link from "next/link"` se ainda não estiver importado.

- [ ] **Step 2: Gates verdes**

Run: `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run`
Expected: limpo + verde.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/page.tsx"
git commit -m "feat(reserva): detalhe do item linka de volta à reserva da noiva

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Revisão de design (Concierge) + verificação visual + gate final

**Files:** nenhum arquivo novo (ajustes pontuais se a revisão pedir).

- [ ] **Step 1: Rodar a skill `atelier-design-review`**

Invocar a skill `atelier-design-review` sobre as telas tocadas (perfil da noiva `#reserva`, livro de reservas, detalhe do item). Foco: a sacola parece "a seleção da noiva" (peças, não e-commerce); bordô só no CTA "Fechar a reserva" e na urgência ≤14d; microcopy humano ("Seleção da noiva", "Seleção em andamento", "Fechar a reserva"); estado-zero gentil. Aplicar os ajustes apontados (sem tocar regra/rota/banco) e commitar se houver mudança.

- [ ] **Step 2: Verificação visual (app no ar, porta própria)**

Subir o app numa porta livre e conferir o fluxo num único comando (start em background → poll até 200 → exercício → kill). Padrão de `dev-server-porta-replit`:
```bash
node node_modules/next/dist/bin/next dev -p 5051 &
APP=$!
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:5051/login && break; sleep 2; done
# abrir manualmente o perfil de uma noiva com data de casamento, adicionar 2 vestidos,
# fechar a reserva, conferir o livro de reservas mostrando os 2 chips, e o detalhe do item.
# encerrar:
kill $APP
```
Conferir: adicionar 2 vestidos → "Seleção em andamento" com 2 itens; "Fechar a reserva" → vira "Reserva confirmada"; livro mostra a reserva com 2 chips; clicar num vestido abre o detalhe com o migalho de volta. Conflito de data → aviso "já está reservado para …".

- [ ] **Step 3: Gate final completo**

Run:
```bash
node node_modules/typescript/bin/tsc --noEmit && node node_modules/vitest/vitest.mjs run
```
Expected: `tsc` limpo; **toda** a suíte verde (sacola nova + regressão de motor/reservas/agenda/atendimentos/contratos intacta).

- [ ] **Step 4: Atualizar `docs/estado-atual.md`**

Adicionar uma seção curta registrando a Fatia 1 entregue (cabeça `Reserva` + `reservaId`, `sacola.ts`, telas cabeça-cientes, status `SACOLA→RESERVADA`, desvio consciente "sacola já bloqueia" → HOLD/sinal na Fatia 4), apontando spec e plano, e atualizar o ponteiro da "próxima frente" para a **Fatia 2 (acessórios + preço de pacote)**.

- [ ] **Step 5: Commit**

```bash
git add docs/estado-atual.md
git commit -m "docs(estado-atual): Fatia 1 do núcleo Seleção→Reserva entregue (carrinho multi-item)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notas de escopo (do spec §9 — NÃO fazer nesta fatia)
- Acessórios (véu/tiara/sapato) + preço de pacote → Fatia 2.
- Filtro por disponibilidade-na-data + favoritos/lista de prova → Fatia 3.
- HOLD que expira + sinal/depósito (a sacola que **não** bloqueia) → Fatia 4. Nesta fatia o item **bloqueia ao ser adicionado** (firme), inclusive em `SACOLA` — desvio consciente registrado no spec §6.
- `Contrato` continua apontando para o item `BloqueioVestido` (não para a cabeça).
- O detalhe segue em `[bloqueioId]` (por vestido); não vira `[reservaId]`.
- As funções flat `listarReservasDaNoiva`/`listarReservasDaLoja` em `disponibilidade/reservas.ts` ficam (ainda cobertas por teste; `listarReservasDoVestido` segue em uso pela tela do vestido). Limpeza opcional num checkpoint futuro, fora desta fatia.
