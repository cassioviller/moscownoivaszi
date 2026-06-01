# Agendar atendimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **GIT (projeto Moscow Noivas):** trabalhar e commitar **direto na `main`** — NÃO criar branch `feat/*` nem worktree, NÃO fazer merge. Manter `tsc` + `vitest` verdes antes de cada commit. (Ver `CLAUDE.md`.)

**Goal:** Agendar o atendimento (consulta) de uma noiva — cabine, vendedora e horário, com grade visual de horários livres do dia.

**Architecture:** Entidades novas `Cabine` e `Atendimento` (+ horário de funcionamento em `RegraDisponibilidade`). Função pura `gradeDeSlots` decide livre/ocupado por hora; a tela é um client component que busca a grade via server action e revalida no salvar. Tudo escopado por `tenantPrisma`.

**Tech Stack:** Next 16 (App Router, Server Actions, Server + Client Components, `force-dynamic`), React 19 (`useActionState`/`useState`/`useTransition`), Prisma 7 (client em `src/generated/prisma`), Postgres, Vitest, Tailwind v4. Comandos: testes `node node_modules/vitest/vitest.mjs run [path]`; tsc `node node_modules/typescript/bin/tsc --noEmit`; eslint `node node_modules/eslint/bin/eslint.js <arquivo>`; prisma `node node_modules/prisma/build/index.js <cmd>`; tsx `node node_modules/tsx/dist/cli.mjs <script>`.

Spec: `docs/superpowers/specs/2026-06-01-agendar-atendimento-design.md`.

**Convenção data/hora:** `inicio` = `new Date(\`${dataYMD}T${HH}:00:00.000Z\`)` (wall-clock tratado em UTC, exibido em UTC). Slots são horas cheias; duração 60 min → um atendimento ocupa exatamente a hora `H`. "Ocupado na hora H" = existe atendimento daquele dia, na hora H, com a MESMA cabine OU a MESMA vendedora.

---

## File Structure

- `prisma/schema.prisma` (+ migration) — `Cabine`, `Atendimento`, horas em `RegraDisponibilidade`, relações.
- `src/lib/tenant.ts` — `Cabine`, `Atendimento` em `TENANT_MODELS`.
- `src/lib/atendimentos/slots.ts` (+ teste) — função pura `gradeDeSlots`.
- `src/lib/atendimentos/cabines.ts` — CRUD de cabines + horário da loja (+ teste).
- `src/lib/atendimentos/atendimentos.ts` (+ teste) — `gradeDoDia`, `agendar`, `listarProximos`, `cancelar`.
- `src/app/(app)/loja/[lojaId]/atendimentos/config/{page,actions}.tsx` — config cabines/horário.
- `src/app/(app)/loja/[lojaId]/atendimentos/novo/{page,actions}.tsx` + `agendar-form.tsx` (client) — a tela.
- `src/components/layout/nav-items.ts` — item "Agendar" + renomear "Agenda"→"Calendário".
- `src/app/(app)/loja/[lojaId]/noivas/actions.ts` — redirect pós-cadastro.
- `src/lib/__tests__/tenant.test.ts` — `proveZeroVazamento` p/ Cabine/Atendimento.

---

## Task 1: Schema — Cabine, Atendimento, horário

**Files:** `prisma/schema.prisma`, `src/lib/tenant.ts`, `src/lib/__tests__/tenant.test.ts`

- [ ] **Step 1: Adicionar models e campos ao `prisma/schema.prisma`**

Em `model RegraDisponibilidade`, após `lavagemDiasDepois Int @default(7)`, adicionar:
```prisma
  atendimentoAberturaHora   Int @default(9)
  atendimentoFechamentoHora Int @default(19)
```
Em `model Loja`, junto às relações `[]`, adicionar:
```prisma
  cabines      Cabine[]
  atendimentos Atendimento[]
```
Em `model Lead`, junto às relações, adicionar:
```prisma
  atendimentos Atendimento[]
```
Em `model Usuario`, junto a `lojas`/`sessoes`, adicionar:
```prisma
  atendimentos Atendimento[]
```
No fim do arquivo (área de Operação), adicionar:
```prisma
// Cabine de atendimento (sala/box) da loja. Lista cadastrável; entra no tenantPrisma.
model Cabine {
  id        String   @id @default(cuid())
  lojaId    String
  nome      String
  ativo     Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  loja         Loja          @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  atendimentos Atendimento[]
}

// Atendimento (consulta) agendado para uma noiva, numa cabine, com uma vendedora.
// Duração fixa de 60 min (constante na app). `inicio` é wall-clock em UTC, hora cheia.
model Atendimento {
  id          String   @id @default(cuid())
  lojaId      String
  leadId      String
  cabineId    String
  vendedoraId String
  inicio      DateTime
  observacao  String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  loja      Loja    @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  lead      Lead    @relation(fields: [leadId], references: [id], onDelete: Cascade)
  cabine    Cabine  @relation(fields: [cabineId], references: [id], onDelete: Cascade)
  vendedora Usuario @relation(fields: [vendedoraId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Migration + generate**

Run: `node node_modules/prisma/build/index.js migrate dev --name atendimentos`
Expected: "Your database is now in sync".
Run: `node node_modules/prisma/build/index.js generate`
Expected: "Generated Prisma Client".

- [ ] **Step 3: Registrar em `TENANT_MODELS` (`src/lib/tenant.ts`)**

No array `TENANT_MODELS`, adicionar `"Cabine",` e `"Atendimento",` (depois de `"Ajuste"`).

- [ ] **Step 4: Testes de tenant**

Em `src/lib/__tests__/tenant.test.ts`, após o bloco `proveZeroVazamento({ label: "Ajuste", ... })`, adicionar:
```ts
proveZeroVazamento({
  label: "Cabine",
  seed: (lojaId) => base.cabine.create({ data: { lojaId, nome: `${MARK}cab` } }),
  delegate: (c) => c.cabine,
});

proveZeroVazamento({
  label: "Atendimento",
  seed: async (lojaId) => {
    const lead = await base.lead.create({ data: { lojaId, noivaNome: `${MARK}n` } });
    const cab = await base.cabine.create({ data: { lojaId, nome: `${MARK}c` } });
    const u = await base.usuario.create({ data: { nome: `${MARK}v`, email: `${codigoUnico()}@x.local`, senhaHash: "x" } });
    await base.usuarioLoja.create({ data: { usuarioId: u.id, lojaId, perfilId: "perfil-vendedora" } });
    return base.atendimento.create({ data: { lojaId, leadId: lead.id, cabineId: cab.id, vendedoraId: u.id, inicio: new Date("2026-09-12T14:00:00.000Z") } });
  },
  delegate: (c) => c.atendimento,
});
```
(NOTA: `Math.random`/`Date.now` são proibidos só em scripts de Workflow; em testes Vitest são permitidos. Use um email único como acima. Se `perfil-vendedora` não existir no banco de teste, crie um `Perfil` com esse id antes — mas o seed base já o cria; o teste de tenant roda contra o mesmo banco.)

- [ ] **Step 5: Gates**

Run: `node node_modules/typescript/bin/tsc --noEmit` → exit 0.
Run: `node node_modules/vitest/vitest.mjs run src/lib/__tests__/tenant.test.ts` → verde.

- [ ] **Step 6: Commit (na main)**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/tenant.ts src/lib/__tests__/tenant.test.ts
git commit -m "feat(atendimentos): schema Cabine/Atendimento + horário da loja + tenant

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Função pura `gradeDeSlots`

**Files:** Create `src/lib/atendimentos/slots.ts`, `src/lib/atendimentos/__tests__/slots.test.ts`

- [ ] **Step 1: Teste que falha**

`src/lib/atendimentos/__tests__/slots.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { gradeDeSlots, DURACAO_MIN } from "@/lib/atendimentos/slots";

describe("gradeDeSlots", () => {
  it("gera um slot por hora de abertura a fechamento (exclusivo)", () => {
    const g = gradeDeSlots(9, 12, []);
    expect(g.map((s) => s.hora)).toEqual([9, 10, 11]);
    expect(g.every((s) => s.livre)).toBe(true);
  });
  it("marca horas ocupadas como não-livres", () => {
    const g = gradeDeSlots(9, 12, [10]);
    expect(g.find((s) => s.hora === 10)!.livre).toBe(false);
    expect(g.find((s) => s.hora === 9)!.livre).toBe(true);
  });
  it("ignora horas ocupadas fora da janela", () => {
    const g = gradeDeSlots(9, 12, [20]);
    expect(g.every((s) => s.livre)).toBe(true);
  });
  it("duração é 60 min", () => {
    expect(DURACAO_MIN).toBe(60);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/slots.test.ts` → FAIL.

- [ ] **Step 3: Criar `src/lib/atendimentos/slots.ts`**

```ts
// src/lib/atendimentos/slots.ts
// Grade de horários do dia (função pura, sem Prisma). Slots de 1h, duração fixa.
// Um slot na hora H fica "ocupado" se H está em `horasOcupadas` (horas em que a
// cabine OU a vendedora escolhidas já têm atendimento naquele dia).
export const DURACAO_MIN = 60;

export type Slot = { hora: number; livre: boolean };

export function gradeDeSlots(
  aberturaHora: number,
  fechamentoHora: number,
  horasOcupadas: number[],
): Slot[] {
  const ocupadas = new Set(horasOcupadas);
  const slots: Slot[] = [];
  for (let h = aberturaHora; h < fechamentoHora; h++) {
    slots.push({ hora: h, livre: !ocupadas.has(h) });
  }
  return slots;
}

// "14" → "14:00". Apresentação consistente (hora cheia em UTC).
export function rotuloHora(hora: number): string {
  return `${String(hora).padStart(2, "0")}:00`;
}

// rótulo de um slot: "14:00 – 15:00"
export function rotuloSlot(hora: number): string {
  return `${rotuloHora(hora)} – ${rotuloHora(hora + 1)}`;
}
```

- [ ] **Step 4: Passar + tsc**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/slots.test.ts` → PASS.
Run: `node node_modules/typescript/bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/atendimentos/slots.ts src/lib/atendimentos/__tests__/slots.test.ts
git commit -m "feat(atendimentos): função pura gradeDeSlots + rótulos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Cabines + horário (data layer)

**Files:** Create `src/lib/atendimentos/cabines.ts`, `src/lib/atendimentos/__tests__/cabines.test.ts`

- [ ] **Step 1: Teste que falha**

`src/lib/atendimentos/__tests__/cabines.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { listarCabines, criarCabine, alternarCabineAtiva, obterHorarioLoja, salvarHorarioLoja } from "@/lib/atendimentos/cabines";

const MARK = "t-cabines-";
let loja = "";
beforeAll(async () => { loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id; });
afterAll(async () => { await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } }); });

describe("cabines + horário", () => {
  it("cria, lista e alterna ativa", async () => {
    const c = await criarCabine(loja, "  Cabine 1  ");
    expect(c.ok).toBe(true);
    const id = c.ok ? c.cabineId : "";
    let todas = await listarCabines(loja, {});
    expect(todas.find((x) => x.id === id)?.nome).toBe("Cabine 1");
    await alternarCabineAtiva(loja, id);
    const ativas = await listarCabines(loja, { ativasApenas: true });
    expect(ativas.find((x) => x.id === id)).toBeUndefined();
  });
  it("recusa cabine sem nome", async () => {
    expect(await criarCabine(loja, "   ")).toMatchObject({ ok: false, motivo: "sem_nome" });
  });
  it("horário: default 9–19, salva e valida", async () => {
    expect(await obterHorarioLoja(loja)).toEqual({ abertura: 9, fechamento: 19 });
    await salvarHorarioLoja(loja, 10, 20);
    expect(await obterHorarioLoja(loja)).toEqual({ abertura: 10, fechamento: 20 });
    expect(await salvarHorarioLoja(loja, 20, 10)).toMatchObject({ ok: false, motivo: "intervalo_invalido" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/cabines.test.ts` → FAIL.

- [ ] **Step 3: Criar `src/lib/atendimentos/cabines.ts`**

```ts
// src/lib/atendimentos/cabines.ts
// Cabines da loja + horário de funcionamento (em RegraDisponibilidade). tenantPrisma.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";

export type CabineItem = { id: string; nome: string; ativo: boolean };

export async function listarCabines(
  lojaId: string,
  opts: { ativasApenas?: boolean },
): Promise<CabineItem[]> {
  const rows = await tenantPrisma(prisma, lojaId).cabine.findMany({
    where: opts.ativasApenas ? { ativo: true } : {},
    orderBy: { nome: "asc" },
  });
  return rows.map((c) => ({ id: c.id, nome: c.nome, ativo: c.ativo }));
}

export type ResultadoCabine = { ok: true; cabineId: string } | { ok: false; motivo: "sem_nome" };

export async function criarCabine(lojaId: string, nome: string): Promise<ResultadoCabine> {
  const n = nome?.trim();
  if (!n) return { ok: false, motivo: "sem_nome" };
  const c = await tenantPrisma(prisma, lojaId).cabine.create({ data: { nome: n } as never });
  return { ok: true, cabineId: c.id };
}

export async function alternarCabineAtiva(lojaId: string, cabineId: string): Promise<void> {
  const db = tenantPrisma(prisma, lojaId);
  const atual = await db.cabine.findUnique({ where: { id: cabineId }, select: { ativo: true } });
  if (!atual) return;
  await db.cabine.update({ where: { id: cabineId }, data: { ativo: !atual.ativo } });
}

export type HorarioLoja = { abertura: number; fechamento: number };

export async function obterHorarioLoja(lojaId: string): Promise<HorarioLoja> {
  const r = await tenantPrisma(prisma, lojaId).regraDisponibilidade.findUnique({
    where: { lojaId },
    select: { atendimentoAberturaHora: true, atendimentoFechamentoHora: true },
  });
  return { abertura: r?.atendimentoAberturaHora ?? 9, fechamento: r?.atendimentoFechamentoHora ?? 19 };
}

export type ResultadoHorario = { ok: true } | { ok: false; motivo: "intervalo_invalido" };

export async function salvarHorarioLoja(
  lojaId: string,
  abertura: number,
  fechamento: number,
): Promise<ResultadoHorario> {
  if (!Number.isInteger(abertura) || !Number.isInteger(fechamento)) return { ok: false, motivo: "intervalo_invalido" };
  if (abertura < 0 || fechamento > 24 || abertura >= fechamento) return { ok: false, motivo: "intervalo_invalido" };
  await tenantPrisma(prisma, lojaId).regraDisponibilidade.upsert({
    where: { lojaId },
    update: { atendimentoAberturaHora: abertura, atendimentoFechamentoHora: fechamento },
    create: { atendimentoAberturaHora: abertura, atendimentoFechamentoHora: fechamento } as never,
  });
  return { ok: true };
}
```

- [ ] **Step 4: Passar + tsc**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/cabines.test.ts` → PASS.
Run: `node node_modules/typescript/bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/atendimentos/cabines.ts src/lib/atendimentos/__tests__/cabines.test.ts
git commit -m "feat(atendimentos): data layer de cabines + horário da loja

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Atendimentos (data layer)

**Files:** Create `src/lib/atendimentos/atendimentos.ts`, `src/lib/atendimentos/__tests__/atendimentos.test.ts`

- [ ] **Step 1: Teste que falha**

`src/lib/atendimentos/__tests__/atendimentos.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { gradeDoDia, agendarAtendimento, listarProximosAtendimentos, cancelarAtendimento } from "@/lib/atendimentos/atendimentos";

const MARK = "t-atend-";
let loja = "", lead = "", cabine = "", vend = "";
beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  lead = (await db.lead.create({ data: { noivaNome: `${MARK}Ana` } as never })).id;
  cabine = (await db.cabine.create({ data: { nome: `${MARK}C1` } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}Vend`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  vend = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
});
afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("atendimentos", () => {
  it("agenda quando livre; grade reflete; recusa hora ocupada (cabine) e fora do horário", async () => {
    const r = await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2026-09-12", hora: 14, observacao: " teste " });
    expect(r.ok).toBe(true);

    const grade = await gradeDoDia(loja, { dataYMD: "2026-09-12", cabineId: cabine, vendedoraId: vend });
    expect(grade.find((s) => s.hora === 14)!.livre).toBe(false);
    expect(grade.find((s) => s.hora === 15)!.livre).toBe(true);

    // mesma cabine, mesma hora → indisponível (mesmo com outra vendedora não testada aqui)
    expect(await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2026-09-12", hora: 14 }))
      .toMatchObject({ ok: false, motivo: "indisponivel" });
    // fora do horário (default 9–19): 20h
    expect(await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2026-09-12", hora: 20 }))
      .toMatchObject({ ok: false, motivo: "fora_funcionamento" });
  });

  it("recusa cabine/vendedora/lead inválidos da loja", async () => {
    expect(await agendarAtendimento(loja, { leadId: "x", cabineId: cabine, vendedoraId: vend, dataYMD: "2026-09-13", hora: 10 })).toMatchObject({ ok: false, motivo: "lead_invalido" });
    expect(await agendarAtendimento(loja, { leadId: lead, cabineId: "x", vendedoraId: vend, dataYMD: "2026-09-13", hora: 10 })).toMatchObject({ ok: false, motivo: "cabine_invalida" });
    expect(await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: "x", dataYMD: "2026-09-13", hora: 10 })).toMatchObject({ ok: false, motivo: "vendedora_invalida" });
  });

  it("lista próximos e cancela", async () => {
    const r = await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2099-01-01", hora: 11 });
    if (!r.ok) throw new Error("falhou");
    const prox = await listarProximosAtendimentos(loja);
    expect(prox.some((a) => a.id === r.atendimentoId)).toBe(true);
    await cancelarAtendimento(loja, r.atendimentoId);
    const prox2 = await listarProximosAtendimentos(loja);
    expect(prox2.some((a) => a.id === r.atendimentoId)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/atendimentos.test.ts` → FAIL.

- [ ] **Step 3: Criar `src/lib/atendimentos/atendimentos.ts`**

```ts
// src/lib/atendimentos/atendimentos.ts
// Agendamento de atendimentos: grade do dia, criar (com validações + sem
// sobreposição de cabine/vendedora), listar próximos e cancelar. tenantPrisma.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { gradeDeSlots, type Slot } from "./slots";
import { obterHorarioLoja } from "./cabines";

// "YYYY-MM-DD" + hora → Date (wall-clock em UTC).
function instante(dataYMD: string, hora: number): Date {
  return new Date(`${dataYMD}T${String(hora).padStart(2, "0")}:00:00.000Z`);
}
function inicioDoDia(dataYMD: string): Date {
  return new Date(`${dataYMD}T00:00:00.000Z`);
}
function fimDoDia(dataYMD: string): Date {
  const d = inicioDoDia(dataYMD);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// Horas ocupadas no dia para a cabine OU a vendedora dadas.
async function horasOcupadas(
  lojaId: string,
  dataYMD: string,
  cabineId: string,
  vendedoraId: string,
): Promise<number[]> {
  const rows = await tenantPrisma(prisma, lojaId).atendimento.findMany({
    where: {
      inicio: { gte: inicioDoDia(dataYMD), lt: fimDoDia(dataYMD) },
      OR: [{ cabineId }, { vendedoraId }],
    },
    select: { inicio: true },
  });
  return rows.map((r) => r.inicio.getUTCHours());
}

export async function gradeDoDia(
  lojaId: string,
  args: { dataYMD: string; cabineId: string; vendedoraId: string },
): Promise<Slot[]> {
  const [{ abertura, fechamento }, ocupadas] = await Promise.all([
    obterHorarioLoja(lojaId),
    horasOcupadas(lojaId, args.dataYMD, args.cabineId, args.vendedoraId),
  ]);
  return gradeDeSlots(abertura, fechamento, ocupadas);
}

export type ResultadoAgendar =
  | { ok: true; atendimentoId: string }
  | { ok: false; motivo: "lead_invalido" | "cabine_invalida" | "vendedora_invalida" | "sem_horario" | "fora_funcionamento" | "indisponivel" };

export async function agendarAtendimento(
  lojaId: string,
  input: { leadId: string; cabineId: string; vendedoraId: string; dataYMD: string; hora: number; observacao?: string | null },
): Promise<ResultadoAgendar> {
  const { leadId, cabineId, vendedoraId, dataYMD, hora, observacao } = input;
  if (!dataYMD || !Number.isInteger(hora)) return { ok: false, motivo: "sem_horario" };

  const db = tenantPrisma(prisma, lojaId);
  const [lead, cab, vinc, { abertura, fechamento }] = await Promise.all([
    db.lead.findUnique({ where: { id: leadId }, select: { id: true } }),
    db.cabine.findUnique({ where: { id: cabineId }, select: { ativo: true } }),
    // vendedora = membro da loja (UsuarioLoja é exceção do guard → prisma direto por usuarioId+lojaId).
    prisma.usuarioLoja.findUnique({ where: { usuarioId_lojaId: { usuarioId: vendedoraId, lojaId } }, select: { usuarioId: true } }),
    obterHorarioLoja(lojaId),
  ]);
  if (!lead) return { ok: false, motivo: "lead_invalido" };
  if (!cab || !cab.ativo) return { ok: false, motivo: "cabine_invalida" };
  if (!vinc) return { ok: false, motivo: "vendedora_invalida" };
  if (hora < abertura || hora >= fechamento) return { ok: false, motivo: "fora_funcionamento" };

  // Revalida sobreposição (cabine OU vendedora na mesma hora).
  const ocupadas = await horasOcupadas(lojaId, dataYMD, cabineId, vendedoraId);
  if (ocupadas.includes(hora)) return { ok: false, motivo: "indisponivel" };

  const obs = observacao?.trim();
  const criado = await db.atendimento.create({
    data: { leadId, cabineId, vendedoraId, inicio: instante(dataYMD, hora), observacao: obs ? obs : null } as never,
  });
  return { ok: true, atendimentoId: criado.id };
}

export type AtendimentoItem = {
  id: string;
  inicio: Date;
  noivaNome: string | null;
  leadId: string;
  cabineNome: string;
  vendedoraNome: string;
};

// Hoje (meia-noite UTC do dia em SP) — mesma convenção do resto do sistema.
function inicioDeHojeUTC(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

export async function listarProximosAtendimentos(lojaId: string): Promise<AtendimentoItem[]> {
  const rows = await tenantPrisma(prisma, lojaId).atendimento.findMany({
    where: { inicio: { gte: inicioDeHojeUTC() } },
    orderBy: { inicio: "asc" },
    include: { lead: { select: { noivaNome: true } }, cabine: { select: { nome: true } }, vendedora: { select: { nome: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    noivaNome: a.lead?.noivaNome ?? null,
    leadId: a.leadId,
    cabineNome: a.cabine.nome,
    vendedoraNome: a.vendedora.nome,
  }));
}

export async function cancelarAtendimento(lojaId: string, id: string): Promise<void> {
  await tenantPrisma(prisma, lojaId).atendimento.deleteMany({ where: { id } });
}
```

- [ ] **Step 4: Passar + tsc**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos` → PASS (slots + cabines + atendimentos).
Run: `node node_modules/typescript/bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/atendimentos/atendimentos.ts src/lib/atendimentos/__tests__/atendimentos.test.ts
git commit -m "feat(atendimentos): data layer agendar/grade/listar/cancelar (sem sobreposição)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Tela de Config (cabines + horário)

**Files:** Create `src/app/(app)/loja/[lojaId]/atendimentos/config/page.tsx` e `.../config/actions.ts`

- [ ] **Step 1: `config/actions.ts`**

```ts
// src/app/(app)/loja/[lojaId]/atendimentos/config/actions.ts
"use server";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { criarCabine, alternarCabineAtiva, salvarHorarioLoja } from "@/lib/atendimentos/cabines";

async function guard() {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "config", "editar"))) redirect(`/loja/${sc.loja.id}/atendimentos/config`);
  return sc;
}
const base = (lojaId: string) => `/loja/${lojaId}/atendimentos/config`;

export async function criarCabineAction(formData: FormData) {
  const sc = await guard();
  await criarCabine(sc.loja.id, String(formData.get("nome") ?? ""));
  redirect(`${base(sc.loja.id)}?ok=cabine`);
}
export async function alternarCabineAction(formData: FormData) {
  const sc = await guard();
  await alternarCabineAtiva(sc.loja.id, String(formData.get("cabineId") ?? ""));
  redirect(`${base(sc.loja.id)}?ok=cabine`);
}
export async function salvarHorarioAction(formData: FormData) {
  const sc = await guard();
  const r = await salvarHorarioLoja(sc.loja.id, Number(formData.get("abertura")), Number(formData.get("fechamento")));
  redirect(`${base(sc.loja.id)}?${r.ok ? "ok=horario" : "erro=intervalo_invalido"}`);
}
```

- [ ] **Step 2: `config/page.tsx`**

```tsx
// src/app/(app)/loja/[lojaId]/atendimentos/config/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarCabines, obterHorarioLoja } from "@/lib/atendimentos/cabines";
import { BotaoConfirmar } from "@/components/ui/botao-confirmar";
import { criarCabineAction, alternarCabineAction, salvarHorarioAction } from "./actions";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = {
  cabine: "Cabines atualizadas.",
  horario: "Horário salvo.",
  intervalo_invalido: "Horário inválido (abertura deve ser antes do fechamento).",
};

const campo =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta " +
  "focus:border-tinta focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const acao =
  "inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline decoration-borda " +
  "underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";

export default async function ConfigAtendimentosPage({
  params, searchParams,
}: { params: Promise<{ lojaId: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "config", "ver"))) redirect(`/loja/${sc.loja.id}`);
  const { lojaId } = await params;
  const { ok, erro } = await searchParams;

  const podeEditar = await podeNoModulo(sc.usuario.id, sc.loja.id, "config", "editar");
  const [cabines, horario] = await Promise.all([listarCabines(sc.loja.id, {}), obterHorarioLoja(sc.loja.id)]);
  const aviso = (ok && AVISOS[ok]) || (erro && AVISOS[erro]) || null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}/atendimentos/novo`} className="w-fit text-[13px] text-grafite hover:text-tinta">← Agendar</Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Cabines &amp; horário</h1>
      </header>
      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Horário de funcionamento</h2>
        {podeEditar ? (
          <form action={salvarHorarioAction} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1"><span className="text-[12px] text-grafite">Abre (h)</span>
              <input name="abertura" type="number" min={0} max={23} defaultValue={horario.abertura} className={campo} /></label>
            <label className="flex flex-col gap-1"><span className="text-[12px] text-grafite">Fecha (h)</span>
              <input name="fechamento" type="number" min={1} max={24} defaultValue={horario.fechamento} className={campo} /></label>
            <button type="submit" className={`${acao} no-underline`}>Salvar horário</button>
          </form>
        ) : (
          <p className="text-[14px] text-tinta">{horario.abertura}h às {horario.fechamento}h</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Cabines</h2>
        {cabines.length === 0 ? (
          <p className="text-[14px] text-grafite">Nenhuma cabine cadastrada.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {cabines.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className={`text-[14px] ${c.ativo ? "text-tinta" : "text-cinza-fumo line-through"}`}>{c.nome}</span>
                {podeEditar && (
                  <form action={alternarCabineAction}>
                    <input type="hidden" name="cabineId" value={c.id} />
                    <button type="submit" className={acao}>{c.ativo ? "Desativar" : "Ativar"}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {podeEditar && (
          <form action={criarCabineAction} className="flex items-center gap-2">
            <input name="nome" placeholder="Nova cabine (ex.: Cabine 1)" className={`${campo} flex-1`} aria-label="Nome da cabine" />
            <button type="submit" className={`${acao} no-underline`}>Adicionar</button>
          </form>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Gates**

Run: `node node_modules/typescript/bin/tsc --noEmit` → exit 0.
Run: `node node_modules/eslint/bin/eslint.js "src/app/(app)/loja/[lojaId]/atendimentos/config/page.tsx" "src/app/(app)/loja/[lojaId]/atendimentos/config/actions.ts"` → sem erro novo.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/atendimentos/config"
git commit -m "feat(atendimentos): tela de config (cabines + horário)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Tela Agendar (grade visual)

**Files:** Create `src/app/(app)/loja/[lojaId]/atendimentos/novo/{page,actions}.tsx` e `.../novo/agendar-form.tsx`

- [ ] **Step 1: `novo/actions.ts`**

```ts
// src/app/(app)/loja/[lojaId]/atendimentos/novo/actions.ts
"use server";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { gradeDoDia, agendarAtendimento, cancelarAtendimento } from "@/lib/atendimentos/atendimentos";
import type { Slot } from "@/lib/atendimentos/slots";

// Server action chamada pelo client p/ buscar a grade do dia (não é form action).
export async function gradeDoDiaAction(input: { dataYMD: string; cabineId: string; vendedoraId: string }): Promise<Slot[]> {
  const sc = await getSessaoComLoja();
  if (!sc) return [];
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"))) return [];
  if (!input.dataYMD || !input.cabineId || !input.vendedoraId) return [];
  return gradeDoDia(sc.loja.id, input);
}

export type AgendarState = { erro: string | null };
const MOTIVOS: Record<string, string> = {
  lead_invalido: "Escolha a noiva.",
  cabine_invalida: "Escolha uma cabine ativa.",
  vendedora_invalida: "Escolha uma vendedora da equipe.",
  sem_horario: "Escolha um horário livre.",
  fora_funcionamento: "Horário fora do funcionamento da loja.",
  indisponivel: "Esse horário acabou de ser ocupado. Escolha outro.",
};

export async function agendarAtendimentoAction(_prev: AgendarState, formData: FormData): Promise<AgendarState> {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "criar"))) redirect(`/loja/${sc.loja.id}/atendimentos/novo`);
  const r = await agendarAtendimento(sc.loja.id, {
    leadId: String(formData.get("leadId") ?? ""),
    cabineId: String(formData.get("cabineId") ?? ""),
    vendedoraId: String(formData.get("vendedoraId") ?? ""),
    dataYMD: String(formData.get("data") ?? ""),
    hora: Number(formData.get("hora")),
    observacao: String(formData.get("observacao") ?? ""),
  });
  if (r.ok) redirect(`/loja/${sc.loja.id}/atendimentos/novo?ok=1`);
  return { erro: MOTIVOS[r.motivo] ?? "Não foi possível agendar." };
}

export async function cancelarAtendimentoAction(formData: FormData) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "criar"))) redirect(`/loja/${sc.loja.id}/atendimentos/novo`);
  await cancelarAtendimento(sc.loja.id, String(formData.get("atendimentoId") ?? ""));
  redirect(`/loja/${sc.loja.id}/atendimentos/novo?ok=cancelado`);
}
```

- [ ] **Step 2: `novo/agendar-form.tsx` (client)**

```tsx
// src/app/(app)/loja/[lojaId]/atendimentos/novo/agendar-form.tsx
"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { rotuloSlot, type Slot } from "@/lib/atendimentos/slots";
import { gradeDoDiaAction, agendarAtendimentoAction, type AgendarState } from "./actions";

type Opcao = { id: string; nome: string };
const INICIAL: AgendarState = { erro: null };
const campo =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[15px] text-tinta " +
  "focus:border-tinta focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";

export function AgendarForm({
  noivas, cabines, vendedoras, noivaInicial,
}: { noivas: Opcao[]; cabines: Opcao[]; vendedoras: Opcao[]; noivaInicial?: string }) {
  const [leadId, setLeadId] = useState(noivaInicial ?? "");
  const [cabineId, setCabineId] = useState("");
  const [vendedoraId, setVendedoraId] = useState("");
  const [data, setData] = useState("");
  const [hora, setHora] = useState<number | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [carregando, startGrade] = useTransition();
  const [state, formAction, pending] = useActionState(agendarAtendimentoAction, INICIAL);

  const prontoParaGrade = Boolean(cabineId && vendedoraId && data);
  useEffect(() => {
    if (!prontoParaGrade) { setSlots(null); setHora(null); return; }
    setHora(null);
    startGrade(async () => setSlots(await gradeDoDiaAction({ dataYMD: data, cabineId, vendedoraId })));
  }, [data, cabineId, vendedoraId, prontoParaGrade]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="cabineId" value={cabineId} />
      <input type="hidden" name="vendedoraId" value={vendedoraId} />
      <input type="hidden" name="data" value={data} />
      <input type="hidden" name="hora" value={hora ?? ""} />

      <label className="flex flex-col gap-1.5"><span className="text-[12px] font-medium text-grafite">Noiva</span>
        <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className={campo} aria-label="Noiva">
          <option value="">Selecione a noiva…</option>
          {noivas.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
        </select>
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5"><span className="text-[12px] font-medium text-grafite">Cabine</span>
          <select value={cabineId} onChange={(e) => setCabineId(e.target.value)} className={campo} aria-label="Cabine">
            <option value="">Selecione…</option>
            {cabines.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5"><span className="text-[12px] font-medium text-grafite">Vendedora</span>
          <select value={vendedoraId} onChange={(e) => setVendedoraId(e.target.value)} className={campo} aria-label="Vendedora">
            <option value="">Selecione…</option>
            {vendedoras.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5"><span className="text-[12px] font-medium text-grafite">Data</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} aria-label="Data" />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-medium text-grafite">Horário</span>
        {!prontoParaGrade ? (
          <p className="text-[13px] text-cinza-fumo">Escolha cabine, vendedora e data para ver os horários livres.</p>
        ) : carregando || slots === null ? (
          <p className="text-[13px] text-cinza-fumo">Carregando horários…</p>
        ) : slots.length === 0 ? (
          <p className="text-[13px] text-cinza-fumo">Nenhum horário configurado para a loja.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <button
                key={s.hora}
                type="button"
                disabled={!s.livre}
                onClick={() => setHora(s.hora)}
                className={
                  "min-h-11 rounded-md border px-3 text-[13px] transition-colors duration-150 " +
                  (hora === s.hora
                    ? "border-bordo bg-bordo text-papel"
                    : s.livre
                      ? "border-borda bg-papel-elevado text-tinta hover:border-bordo"
                      : "cursor-not-allowed border-borda-suave bg-papel text-cinza-fumo line-through")
                }
              >
                {rotuloSlot(s.hora)}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1.5"><span className="text-[12px] font-medium text-grafite">Observação (opcional)</span>
        <input name="observacao" className={campo} aria-label="Observação" />
      </label>

      {state.erro && <p className="text-[13px] text-bordo">{state.erro}</p>}

      <button
        type="submit"
        disabled={pending || !leadId || hora === null}
        className="inline-flex min-h-11 w-fit items-center rounded-md bg-bordo px-4 text-[14px] font-medium text-papel
          transition-colors duration-150 ease-out hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-bordo disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Agendar atendimento
      </button>
    </form>
  );
}
```

- [ ] **Step 3: `novo/page.tsx`**

```tsx
// src/app/(app)/loja/[lojaId]/atendimentos/novo/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarLeads } from "@/lib/leads/leads";
import { listarEquipe } from "@/lib/admin/usuarios";
import { listarCabines } from "@/lib/atendimentos/cabines";
import { listarProximosAtendimentos } from "@/lib/atendimentos/atendimentos";
import { BotaoConfirmar } from "@/components/ui/botao-confirmar";
import { AgendarForm } from "./agendar-form";
import { cancelarAtendimentoAction } from "./actions";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = { "1": "Atendimento agendado.", cancelado: "Atendimento cancelado." };
const dataHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export default async function NovoAtendimentoPage({
  params, searchParams,
}: { params: Promise<{ lojaId: string }>; searchParams: Promise<{ noiva?: string; ok?: string }> }) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"))) redirect(`/loja/${sc.loja.id}`);
  const { lojaId } = await params;
  const { noiva, ok } = await searchParams;

  const [podeCriar, podeVerConfig, noivas, equipe, cabines, proximos] = await Promise.all([
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "criar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "config", "ver"),
    listarLeads(sc.loja.id),
    listarEquipe(sc.loja.id),
    listarCabines(sc.loja.id, { ativasApenas: true }),
    listarProximosAtendimentos(sc.loja.id),
  ]);
  const aviso = ok ? AVISOS[ok] : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}`} className="w-fit text-[13px] text-grafite hover:text-tinta">← {sc.loja.nome}</Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Agendar atendimento</h1>
        {podeVerConfig && (
          <Link href={`/loja/${lojaId}/atendimentos/config`} className="w-fit text-[13px] text-grafite underline decoration-borda underline-offset-4 hover:text-tinta">
            Cabines &amp; horário
          </Link>
        )}
      </header>
      {aviso && <p className="text-[13px] text-grafite">{aviso}</p>}

      {!podeCriar ? (
        <p className="text-[14px] text-grafite">Você não tem permissão para agendar.</p>
      ) : cabines.length === 0 ? (
        <p className="text-[14px] text-grafite">
          Cadastre ao menos uma cabine em <Link href={`/loja/${lojaId}/atendimentos/config`} className="underline">Cabines &amp; horário</Link> para agendar.
        </p>
      ) : (
        <AgendarForm
          noivas={noivas.map((n) => ({ id: n.id, nome: n.noivaNome }))}
          cabines={cabines.map((c) => ({ id: c.id, nome: c.nome }))}
          vendedoras={equipe.map((e) => ({ id: e.id, nome: e.nome }))}
          noivaInicial={noiva}
        />
      )}

      <section className="flex flex-col gap-3 border-t border-borda-suave pt-5">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Próximos atendimentos</h2>
        {proximos.length === 0 ? (
          <p className="text-[14px] text-grafite">Nenhum atendimento agendado.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {proximos.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[14px] text-tinta">{a.noivaNome ?? "Noiva"}</span>
                  <span className="text-[12px] text-cinza-fumo">{dataHora.format(a.inicio)} · {a.cabineNome} · {a.vendedoraNome}</span>
                </div>
                {podeCriar && (
                  <form action={cancelarAtendimentoAction}>
                    <input type="hidden" name="atendimentoId" value={a.id} />
                    <BotaoConfirmar mensagem={`Cancelar o atendimento de ${a.noivaNome ?? "noiva"}?`} ariaLabel="Cancelar atendimento"
                      className="inline-flex min-h-11 items-center rounded-sm text-[12px] text-grafite underline decoration-borda underline-offset-4 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo">
                      Cancelar
                    </BotaoConfirmar>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Gates**

Run: `node node_modules/typescript/bin/tsc --noEmit` → exit 0.
Run: `node node_modules/eslint/bin/eslint.js "src/app/(app)/loja/[lojaId]/atendimentos/novo/page.tsx" "src/app/(app)/loja/[lojaId]/atendimentos/novo/actions.ts" "src/app/(app)/loja/[lojaId]/atendimentos/novo/agendar-form.tsx"` → sem erro novo.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/atendimentos/novo"
git commit -m "feat(atendimentos): tela Agendar com grade visual de horários

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Navegação + redirect pós-cadastro + gates finais

**Files:** `src/components/layout/nav-items.ts`, `src/app/(app)/loja/[lojaId]/noivas/actions.ts`, `docs/estado-atual.md`

- [ ] **Step 1: nav-items — "Agendar" + renomear "Agenda"→"Calendário"**

Em `src/components/layout/nav-items.ts`, no bloco `if (flags.podeVerNoivas)`, que hoje tem:
```ts
    items.push({ href: `/loja/${lojaId}/noivas`, label: "Noivas" });
    items.push({ href: `/loja/${lojaId}/agenda`, label: "Agenda" });
    items.push({ href: `/loja/${lojaId}/reservas`, label: "Reservas" });
```
trocar por:
```ts
    items.push({ href: `/loja/${lojaId}/noivas`, label: "Noivas" });
    items.push({ href: `/loja/${lojaId}/atendimentos/novo`, label: "Agendar" });
    items.push({ href: `/loja/${lojaId}/agenda`, label: "Calendário" });
    items.push({ href: `/loja/${lojaId}/reservas`, label: "Reservas" });
```

- [ ] **Step 2: Redirect pós-cadastro da noiva**

Em `src/app/(app)/loja/[lojaId]/noivas/actions.ts`, na `criarNoivaAction`, hoje:
```ts
  try {
    await criarLead(sc.loja.id, extrair(formData));
  } catch (e) {
    return { erro: mensagem(e) };
  }
  redirect(`/loja/${sc.loja.id}/noivas?ok=1`);
```
trocar por (captura o lead e vai pra Agendar com ela pré-selecionada):
```ts
  let lead;
  try {
    lead = await criarLead(sc.loja.id, extrair(formData));
  } catch (e) {
    return { erro: mensagem(e) };
  }
  redirect(`/loja/${sc.loja.id}/atendimentos/novo?noiva=${lead.id}`);
```
(`redirect` lança internamente — deixe-o FORA do try/catch, como já está.)

- [ ] **Step 3: Gates completos**

Run: `node node_modules/typescript/bin/tsc --noEmit` → exit 0.
Run: `node node_modules/vitest/vitest.mjs run` → todos verdes (reporte "X passed").
Run: `node node_modules/eslint/bin/eslint.js src/components/layout/nav-items.ts "src/app/(app)/loja/[lojaId]/noivas/actions.ts"` → sem erro novo.

- [ ] **Step 4: Atualizar `docs/estado-atual.md`**

Adicionar, logo após o cabeçalho (antes de "## Em uma frase"), a seção:
```markdown
## Agendar atendimento (2026-06-01)

Spec/plano: `docs/superpowers/specs/2026-06-01-agendar-atendimento-design.md`, `docs/superpowers/plans/2026-06-01-agendar-atendimento.md`.

Nova feature: agendar o atendimento (consulta) de uma noiva. Entidades `Cabine` e `Atendimento`
(em `TENANT_MODELS`) + horário de funcionamento por loja em `RegraDisponibilidade`. Disponibilidade
via grade visual: o client busca `gradeDoDia` (server action) e mostra os slots de 1h livres/ocupados
(ocupado quando a cabine OU a vendedora já têm atendimento na hora); o servidor revalida ao salvar.
Telas: `/loja/[id]/atendimentos/novo` (Agendar) e `/atendimentos/config` (cabines + horário). Sidebar:
item "Agendar"; o antigo "Agenda" virou rótulo "Calendário" (rota `/agenda` mantida). Cadastrar uma
noiva agora leva direto para Agendar com ela pré-selecionada. Gating: `leads` (agendar) / `config` (cabines).

**Fast-follow:** atendimento na Agenda/Calendário e no perfil da noiva; status compareceu/faltou; horário por dia da semana.
```

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/nav-items.ts "src/app/(app)/loja/[lojaId]/noivas/actions.ts" docs/estado-atual.md
git commit -m "feat(atendimentos): nav Agendar/Calendário + pós-cadastro vai p/ agendar + estado-atual

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verification (resumo)

- `node node_modules/vitest/vitest.mjs run` → verde (slots puro + cabines + atendimentos + tenant).
- `node node_modules/typescript/bin/tsc --noEmit` → limpo. `prisma generate` após o schema.
- Manual (app no ar; **reiniciar via Run após a migração**): Config → cadastrar Cabine 1/2 + horário 9–19. Cadastrar noiva → cai em Agendar com ela pré-selecionada → escolher cabine/vendedora/data → grade mostra livres/ocupados → marcar slot → aparece em "próximos". Reabrir a mesma data/cabine/vendedora → o slot marcado fica desabilitado.

## Fora de escopo

- Atendimento na Agenda/Calendário geral e no perfil da noiva; status compareceu/faltou; horário por dia-da-semana; editar (por ora cancelar+reagendar).
