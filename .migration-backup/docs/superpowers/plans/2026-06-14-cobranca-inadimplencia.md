# Cobrança / inadimplência — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao atelier a régua de cobrança — ver quem está em atraso (aging 1-30/31-60/60+), abrir o WhatsApp da noiva com mensagem pronta (link wa.me, sem API) e registrar a cobrança feita (histórico por noiva).

**Architecture:** Uma tabela de histórico (`RegistroCobranca`) + um motor `cobranca.ts` (helpers puros `faixaDeAtraso`/`linkWhatsApp` + leituras `agingDaLoja`/`historicoCobranca` + escrita `registrarCobranca`) reusando `Parcela`/`ehAtrasada`; uma tela `/financeiro/cobranca` (server) com faixas, lista de inadimplentes, WhatsApp, registrar e histórico; uma Server Action de registro.

**Tech Stack:** Next.js 16 (App Router, Server Components, `force-dynamic`), Prisma 7 (client em `src/generated/prisma`), Tailwind v4, vitest (integração com Postgres real), TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-14-cobranca-inadimplencia-design.md`.

**Convenções do repo (ler antes de começar):**
- Commits **direto na `main`** (sem branch/worktree). Antes de cada commit: `node node_modules/typescript/bin/tsc --noEmit` limpo e `npx vitest run` verde. (`.bin/tsc` sem permissão; rode via `node`.)
- **Após mudar schema, rode `node node_modules/prisma/build/index.js generate`** (o client custom em `src/generated/prisma` não é regenerado sozinho pelo `migrate dev`). Prisma CLI via `node node_modules/prisma/build/index.js ...`.
- Dinheiro em **centavos** via `@/lib/dinheiro`: `deCentavos(c)`→"1234.56", `decParaCentavos(str|Decimal|null)`→centavos. Dia = meia-noite UTC de SP via `@/lib/tempo`: `hojeUTC()`, `ymd(date)`.
- Modelos de loja via `tenantPrisma(prisma, lojaId)`; em `create` use `as never`.
- Testes de integração: prefixo `MARK`, limpeza em `afterAll`. Modelo: `src/lib/calendario/__tests__/dia.test.ts`.
- Gate de página: `exigirAcesso("financeiro")`. Gate de ação: `acaoAutorizada("financeiro", "editar", corpo)`. Form helpers `str`/`comAviso` (`@/lib/server/form`).

---

## File Structure

**Criar:**
- `prisma/migrations/<timestamp>_registro_cobranca/migration.sql` — gerada.
- `src/lib/financeiro/cobranca.ts` — `faixaDeAtraso`/`linkWhatsApp` (puras) + `agingDaLoja`/`historicoCobranca`/`registrarCobranca`.
- `src/lib/financeiro/__tests__/cobranca.test.ts` — unit (puras) + integração.
- `src/app/(app)/loja/[lojaId]/financeiro/cobranca/page.tsx` — a tela.
- `src/app/(app)/loja/[lojaId]/financeiro/cobranca/actions.ts` — `registrarCobrancaAction`.

**Modificar:**
- `prisma/schema.prisma` — `enum CobrancaCanal` + model `RegistroCobranca` + back-relations em `Loja` e `Lead`.
- `src/lib/tenant.ts` — `RegistroCobranca` em `TENANT_MODELS`.
- `src/app/(app)/loja/[lojaId]/financeiro/receber/page.tsx` e `.../financeiro/projecao/page.tsx` — link "Cobrança".

---

## Task 1: Schema `RegistroCobranca` + enum + migração + tenant

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/tenant.ts`
- Create: migração (gerada)

- [ ] **Step 1: Adicionar o enum e o model ao schema**

Em `prisma/schema.prisma`, adicionar (perto dos modelos financeiros):
```prisma
enum CobrancaCanal {
  WHATSAPP
  TELEFONE
  PRESENCIAL
  OUTRO
}

model RegistroCobranca {
  id         String        @id @default(cuid())
  lojaId     String
  leadId     String
  data       DateTime
  canal      CobrancaCanal
  observacao String?
  createdAt  DateTime      @default(now())

  loja Loja @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  lead Lead @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@index([lojaId, leadId, data])
}
```

- [ ] **Step 2: Back-relations em `Loja` e `Lead`**

No `model Loja` (após `saldosReferencia     SaldoReferencia[]`):
```prisma
  registrosCobranca    RegistroCobranca[]
```
No `model Lead` (junto às outras relações, ex.: após `contratos   Contrato[]`):
```prisma
  registrosCobranca RegistroCobranca[]
```

- [ ] **Step 3: Registrar em `TENANT_MODELS`**

Em `src/lib/tenant.ts`, no array `TENANT_MODELS` (após `"SaldoReferencia",`):
```ts
  "RegistroCobranca",
```

- [ ] **Step 4: Gerar migração e client**

Run:
```bash
node node_modules/prisma/build/index.js migrate dev --name registro_cobranca
node node_modules/prisma/build/index.js generate
```
Expected: migração com `CREATE TABLE "RegistroCobranca"` e `CREATE TYPE "CobrancaCanal"`.

- [ ] **Step 5: tsc**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo. `prisma.registroCobranca` e o tipo `CobrancaCanal` passam a existir.

- [ ] **Step 6: Commit**
```bash
git add prisma/schema.prisma prisma/migrations src/lib/tenant.ts
git commit -m "feat(financeiro): tabela RegistroCobranca + enum CobrancaCanal"
```

---

## Task 2: Helpers puros `faixaDeAtraso` + `linkWhatsApp`

**Files:**
- Create: `src/lib/financeiro/cobranca.ts`
- Test: `src/lib/financeiro/__tests__/cobranca.test.ts`

- [ ] **Step 1: Escrever os testes que falham (puros)**

Criar `src/lib/financeiro/__tests__/cobranca.test.ts`:
```ts
// Unit (puro): faixaDeAtraso classifica por dias; linkWhatsApp monta o deep-link wa.me.
import { describe, it, expect } from "vitest";
import { faixaDeAtraso, linkWhatsApp } from "@/lib/financeiro/cobranca";

describe("faixaDeAtraso", () => {
  it("1 e 30 dias → ate30", () => {
    expect(faixaDeAtraso(1)).toBe("ate30");
    expect(faixaDeAtraso(30)).toBe("ate30");
  });
  it("31 e 60 dias → d31a60", () => {
    expect(faixaDeAtraso(31)).toBe("d31a60");
    expect(faixaDeAtraso(60)).toBe("d31a60");
  });
  it("61+ dias → mais60", () => {
    expect(faixaDeAtraso(61)).toBe("mais60");
    expect(faixaDeAtraso(200)).toBe("mais60");
  });
});

describe("linkWhatsApp", () => {
  it("monta wa.me com DDI 55 e mensagem encodada", () => {
    expect(linkWhatsApp("(11) 99999-8888", "Olá Ana!")).toBe("https://wa.me/5511999998888?text=Ol%C3%A1%20Ana!");
  });
  it("sem whatsapp → null", () => {
    expect(linkWhatsApp(null, "x")).toBeNull();
    expect(linkWhatsApp("", "x")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/__tests__/cobranca.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `cobranca.ts` com os helpers puros**

Criar `src/lib/financeiro/cobranca.ts`:
```ts
// src/lib/financeiro/cobranca.ts
// Cobrança/inadimplência: aging por faixa de atraso + histórico de cobranças por noiva.
// faixaDeAtraso e linkWhatsApp são PUROS (testáveis). As demais funções leem/escrevem.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC } from "@/lib/tempo";
import { deCentavos, decParaCentavos } from "@/lib/dinheiro";
import type { CobrancaCanal } from "@/generated/prisma/client";

const DIA_MS = 86_400_000;

export type Faixa = "ate30" | "d31a60" | "mais60";

/** Classifica dias de atraso (≥1) em faixa. Vencendo hoje (0) não é atraso e não chega aqui. */
export function faixaDeAtraso(diasDeAtraso: number): Faixa {
  if (diasDeAtraso <= 30) return "ate30";
  if (diasDeAtraso <= 60) return "d31a60";
  return "mais60";
}

/** Deep-link wa.me (DDI Brasil) com a mensagem encodada. null se a noiva não tem whatsapp. */
export function linkWhatsApp(whatsapp: string | null, mensagem: string): string | null {
  if (!whatsapp) return null;
  const digitos = whatsapp.replace(/\D/g, "");
  if (digitos === "") return null;
  return `https://wa.me/55${digitos}?text=${encodeURIComponent(mensagem)}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/__tests__/cobranca.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: tsc + commit**
```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/lib/financeiro/cobranca.ts src/lib/financeiro/__tests__/cobranca.test.ts
git commit -m "feat(financeiro): faixaDeAtraso + linkWhatsApp (puros) da cobrança"
```

---

## Task 3: Leituras + escrita (`agingDaLoja`, `historicoCobranca`, `registrarCobranca`)

**Files:**
- Modify: `src/lib/financeiro/cobranca.ts`
- Test: `src/lib/financeiro/__tests__/cobranca.test.ts` (acrescentar integração)

- [ ] **Step 1: Acrescentar testes de integração que falham**

No FIM de `src/lib/financeiro/__tests__/cobranca.test.ts`, atualizar a linha de import para incluir as novas funções:
```ts
import { faixaDeAtraso, linkWhatsApp, agingDaLoja, historicoCobranca, registrarCobranca } from "@/lib/financeiro/cobranca";
```
E acrescentar:
```ts
import { beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC } from "@/lib/tempo";

const MARK = "t-cobranca-";
let loja = "";
let noivaA = "";
let noivaB = "";
let vend = "";

const hoje = hojeUTC();
const venc = (diasAtras: number) => { const d = new Date(hoje.getTime()); d.setUTCDate(d.getUTCDate() - diasAtras); return d; };

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  noivaA = (await db.lead.create({ data: { noivaNome: `${MARK}Ana`, whatsapp: "(11) 99999-8888", etapa: "NOVO" } as never })).id;
  noivaB = (await db.lead.create({ data: { noivaNome: `${MARK}Bia`, etapa: "NOVO" } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}V`, email: `${MARK}${noivaA}@x.local`, senhaHash: "x" } });
  vend = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  const cA = await db.contrato.create({ data: { leadId: noivaA, vendedoraId: vend, valorTotal: 9999 } as never });
  const cB = await db.contrato.create({ data: { leadId: noivaB, vendedoraId: vend, valorTotal: 9999 } as never });
  // Ana: duas parcelas vencidas (10 e 80 dias) → ate30 e mais60; mais antigo = 80.
  await db.parcela.create({ data: { contratoId: cA.id, numero: 1, valorPrevisto: 1000, vencimento: venc(10) } as never });
  await db.parcela.create({ data: { contratoId: cA.id, numero: 2, valorPrevisto: 500, vencimento: venc(80) } as never });
  // Bia: uma vencida (40 dias) → d31a60.
  await db.parcela.create({ data: { contratoId: cB.id, numero: 1, valorPrevisto: 700, vencimento: venc(40) } as never });
  // Ana: uma parcela PAGA e uma futura — não entram no aging.
  await db.parcela.create({ data: { contratoId: cA.id, numero: 3, valorPrevisto: 300, vencimento: venc(5), status: "PAGA", valorRecebido: 300, recebidoEm: venc(5) } as never });
  const futuro = new Date(hoje.getTime()); futuro.setUTCDate(futuro.getUTCDate() + 20);
  await db.parcela.create({ data: { contratoId: cA.id, numero: 4, valorPrevisto: 999, vencimento: futuro } as never });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("agingDaLoja", () => {
  it("agrupa por noiva, ordenado pelo atraso mais antigo, ignorando paga/futura", async () => {
    const a = await agingDaLoja(loja);
    expect(a.noivas[0].noivaNome).toBe(`${MARK}Ana`); // 80 dias = mais antigo
    const ana = a.noivas.find((n) => n.leadId === noivaA)!;
    expect(ana.qtdParcelas).toBe(2); // só as vencidas
    expect(ana.totalVencido).toBe("1500.00");
    expect(ana.faixaMaisAntiga).toBe("mais60");
    expect(ana.whatsapp).toBe("(11) 99999-8888");
  });
  it("soma as faixas com cada parcela no seu próprio atraso", async () => {
    const a = await agingDaLoja(loja);
    expect(a.faixas.ate30.total).toBe("1000.00"); // parcela de 10 dias da Ana
    expect(a.faixas.d31a60.total).toBe("700.00"); // parcela de 40 dias da Bia
    expect(a.faixas.mais60.total).toBe("500.00"); // parcela de 80 dias da Ana
    expect(a.faixas.d31a60.qtdNoivas).toBe(1);
  });
});

describe("registrarCobranca + historicoCobranca", () => {
  it("registra e lista recente-primeiro", async () => {
    const r1 = await registrarCobranca(loja, { leadId: noivaA, canal: "WHATSAPP", observacao: "prometeu pagar dia 15" });
    expect(r1).toEqual({ ok: true });
    const r2 = await registrarCobranca(loja, { leadId: noivaA, canal: "TELEFONE" });
    expect(r2).toEqual({ ok: true });
    const h = await historicoCobranca(loja, noivaA);
    expect(h).toHaveLength(2);
    expect(h.every((c) => ["WHATSAPP", "TELEFONE"].includes(c.canal))).toBe(true);
  });
  it("rejeita lead de outra loja e canal inválido", async () => {
    const outra = (await prisma.loja.create({ data: { nome: `${MARK}outra` } })).id;
    expect(await registrarCobranca(outra, { leadId: noivaA, canal: "WHATSAPP" })).toEqual({ ok: false, motivo: "lead_invalido" });
    expect(await registrarCobranca(loja, { leadId: noivaA, canal: "EMAIL" })).toEqual({ ok: false, motivo: "canal_invalido" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/__tests__/cobranca.test.ts`
Expected: FAIL — `agingDaLoja`/`historicoCobranca`/`registrarCobranca` não existem.

- [ ] **Step 3: Implementar as três funções em `cobranca.ts`**

Acrescentar ao FIM de `src/lib/financeiro/cobranca.ts`:
```ts
export type NoivaInadimplente = {
  leadId: string;
  noivaNome: string | null;
  whatsapp: string | null;
  totalVencido: string;
  qtdParcelas: number;
  diasMaisAntigo: number;
  faixaMaisAntiga: Faixa;
};
export type FaixaResumo = { total: string; qtdNoivas: number };
export type Aging = {
  faixas: { ate30: FaixaResumo; d31a60: FaixaResumo; mais60: FaixaResumo };
  noivas: NoivaInadimplente[];
};

/** Inadimplência da loja: parcelas PREVISTA vencidas, por faixa de atraso e por noiva. */
export async function agingDaLoja(lojaId: string): Promise<Aging> {
  const hoje = hojeUTC();
  const rows = await tenantPrisma(prisma, lojaId).parcela.findMany({
    where: { status: "PREVISTA", vencimento: { lt: hoje } },
    include: { contrato: { select: { leadId: true, lead: { select: { noivaNome: true, whatsapp: true } } } } },
  });

  const faixaTotC: Record<Faixa, number> = { ate30: 0, d31a60: 0, mais60: 0 };
  const faixaNoivas: Record<Faixa, Set<string>> = { ate30: new Set(), d31a60: new Set(), mais60: new Set() };
  const porNoiva = new Map<string, { noivaNome: string | null; whatsapp: string | null; totalC: number; qtd: number; minVenc: number }>();

  for (const p of rows) {
    const dias = Math.floor((hoje.getTime() - p.vencimento.getTime()) / DIA_MS);
    const f = faixaDeAtraso(dias);
    const valorC = decParaCentavos(p.valorPrevisto);
    const leadId = p.contrato.leadId;
    faixaTotC[f] += valorC;
    faixaNoivas[f].add(leadId);
    let n = porNoiva.get(leadId);
    if (!n) {
      n = { noivaNome: p.contrato.lead?.noivaNome ?? null, whatsapp: p.contrato.lead?.whatsapp ?? null, totalC: 0, qtd: 0, minVenc: p.vencimento.getTime() };
      porNoiva.set(leadId, n);
    }
    n.totalC += valorC;
    n.qtd += 1;
    if (p.vencimento.getTime() < n.minVenc) n.minVenc = p.vencimento.getTime();
  }

  const noivas: NoivaInadimplente[] = [...porNoiva.entries()]
    .map(([leadId, n]) => {
      const diasMaisAntigo = Math.floor((hoje.getTime() - n.minVenc) / DIA_MS);
      return {
        leadId,
        noivaNome: n.noivaNome,
        whatsapp: n.whatsapp,
        totalVencido: deCentavos(n.totalC),
        qtdParcelas: n.qtd,
        diasMaisAntigo,
        faixaMaisAntiga: faixaDeAtraso(diasMaisAntigo),
      };
    })
    .sort((a, b) => b.diasMaisAntigo - a.diasMaisAntigo);

  const fr = (f: Faixa): FaixaResumo => ({ total: deCentavos(faixaTotC[f]), qtdNoivas: faixaNoivas[f].size });
  return { faixas: { ate30: fr("ate30"), d31a60: fr("d31a60"), mais60: fr("mais60") }, noivas };
}

export type CobrancaView = { id: string; data: Date; canal: CobrancaCanal; observacao: string | null };

/** Histórico de cobranças de uma noiva, recente primeiro. */
export async function historicoCobranca(lojaId: string, leadId: string): Promise<CobrancaView[]> {
  const rows = await tenantPrisma(prisma, lojaId).registroCobranca.findMany({
    where: { leadId },
    orderBy: [{ data: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((r) => ({ id: r.id, data: r.data, canal: r.canal, observacao: r.observacao }));
}

const CANAIS: CobrancaCanal[] = ["WHATSAPP", "TELEFONE", "PRESENCIAL", "OUTRO"];
export type ResultadoCobranca = { ok: true } | { ok: false; motivo: "lead_invalido" | "canal_invalido" };

/** Registra uma cobrança feita a uma noiva (data = hoje). */
export async function registrarCobranca(
  lojaId: string,
  input: { leadId: string; canal: string; observacao?: string },
): Promise<ResultadoCobranca> {
  const db = tenantPrisma(prisma, lojaId);
  const lead = await db.lead.findUnique({ where: { id: input.leadId }, select: { id: true } });
  if (!lead) return { ok: false, motivo: "lead_invalido" };
  if (!CANAIS.includes(input.canal as CobrancaCanal)) return { ok: false, motivo: "canal_invalido" };
  await db.registroCobranca.create({
    data: { leadId: input.leadId, data: hojeUTC(), canal: input.canal as CobrancaCanal, observacao: input.observacao?.trim() || null } as never,
  });
  return { ok: true };
}
```

- [ ] **Step 4: Rodar e ver passar (arquivo + suíte cheia)**

Run: `npx vitest run src/lib/financeiro/__tests__/cobranca.test.ts`
Expected: PASS (9 testes: 5 puros + 4 integração).

Run: `npx vitest run`
Expected: suíte verde.

- [ ] **Step 5: tsc + commit**
```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/lib/financeiro/cobranca.ts src/lib/financeiro/__tests__/cobranca.test.ts
git commit -m "feat(financeiro): agingDaLoja + historicoCobranca + registrarCobranca"
```

---

## Task 4: Server Action `registrarCobrancaAction`

**Files:**
- Create: `src/app/(app)/loja/[lojaId]/financeiro/cobranca/actions.ts`

- [ ] **Step 1: Implementar a ação**

Criar `src/app/(app)/loja/[lojaId]/financeiro/cobranca/actions.ts`:
```ts
// src/app/(app)/loja/[lojaId]/financeiro/cobranca/actions.ts
// Cobrança — Server Action. Gate financeiro:editar. Registra uma cobrança feita a uma noiva
// e volta por ?ok/?erro para a tela de cobrança.
"use server";

import { redirect } from "next/navigation";
import { registrarCobranca } from "@/lib/financeiro/cobranca";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso } from "@/lib/server/form";

export const registrarCobrancaAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const volta = `/loja/${lojaId}/financeiro/cobranca`;
  const r = await registrarCobranca(lojaId, {
    leadId: str(formData, "leadId"),
    canal: str(formData, "canal"),
    observacao: str(formData, "observacao"),
  });
  redirect(comAviso(volta, r.ok ? "ok" : "erro", r.ok ? "cobranca_registrada" : r.motivo));
});
```

- [ ] **Step 2: tsc**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

- [ ] **Step 3: Commit**
```bash
git add "src/app/(app)/loja/[lojaId]/financeiro/cobranca/actions.ts"
git commit -m "feat(financeiro): ação registrarCobranca (gate financeiro:editar)"
```

---

## Task 5: Tela `/financeiro/cobranca`

**Files:**
- Create: `src/app/(app)/loja/[lojaId]/financeiro/cobranca/page.tsx`

- [ ] **Step 1: Implementar a página**

Criar `src/app/(app)/loja/[lojaId]/financeiro/cobranca/page.tsx`:
```tsx
// src/app/(app)/loja/[lojaId]/financeiro/cobranca/page.tsx
// Cobrança / inadimplência: faixas de atraso (1-30/31-60/60+), lista de inadimplentes por noiva
// com Abrir WhatsApp (wa.me, sem API) + Registrar cobrança + histórico inline. Tom Concierge:
// cuidado, não régua agressiva. Gate financeiro:ver; registrar exige financeiro:editar.
import Link from "next/link";
import { exigirAcesso } from "@/lib/server/acoes";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { AvisoFlash } from "@/components/ui/aviso-flash";
import { agingDaLoja, historicoCobranca, linkWhatsApp, type Faixa } from "@/lib/financeiro/cobranca";
import { brl } from "@/lib/dinheiro";
import { registrarCobrancaAction } from "./actions";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = {
  cobranca_registrada: "Cobrança registrada.",
  lead_invalido: "Noiva não encontrada.",
  canal_invalido: "Canal inválido.",
};

const FAIXA_ROTULO: Record<Faixa, string> = { ate30: "até 30 dias", d31a60: "31–60 dias", mais60: "60+ dias" };
const CANAL_ROTULO: Record<string, string> = { WHATSAPP: "WhatsApp", TELEFONE: "Telefone", PRESENCIAL: "Presencial", OUTRO: "Outro" };
const dataFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });

const msgPadrao = (nome: string | null) =>
  `Olá ${nome ?? ""}! Aqui é do atelier 💛 Passando com carinho para lembrar de uma parcela em aberto. Qualquer dúvida, estou à disposição.`;

export default async function CobrancaPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const sc = await exigirAcesso("financeiro");
  const { lojaId } = await params;
  const sp = await searchParams;
  const podeEditar = await podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "editar");

  const aging = await agingDaLoja(sc.loja.id);
  // Histórico de cada inadimplente (recente-primeiro), em paralelo.
  const historicos = new Map(
    await Promise.all(aging.noivas.map(async (n) => [n.leadId, await historicoCobranca(sc.loja.id, n.leadId)] as const)),
  );
  const aviso = sp.ok ? AVISOS[sp.ok] : sp.erro ? AVISOS[sp.erro] ?? "Não foi possível concluir a ação." : null;

  const rotulo = "text-[11px] uppercase tracking-[0.18em] text-cinza-fumo";
  const campo = "rounded-md border border-borda-suave bg-papel px-3 py-2 text-[14px] text-tinta";
  const botao = "rounded-md bg-bordo px-4 py-2 text-[13px] text-papel-elevado hover:opacity-90";
  const linkAcao = "text-[13px] text-grafite underline decoration-borda underline-offset-4 hover:text-bordo";

  const cardFaixa = (f: Faixa) => (
    <div className={`flex flex-col gap-1 rounded-[var(--mn-radius-md)] border bg-papel-elevado p-4 ${f === "mais60" ? "border-bordo/30" : "border-borda-suave"}`}>
      <span className={rotulo}>{FAIXA_ROTULO[f]}</span>
      <span className={`font-display text-[22px] font-light tabular-nums ${f === "mais60" ? "text-bordo" : "text-tinta"}`}>{brl(aging.faixas[f].total)}</span>
      <span className="text-[12px] text-cinza-fumo">{aging.faixas[f].qtdNoivas} noiva{aging.faixas[f].qtdNoivas === 1 ? "" : "s"}</span>
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <Link href={`/loja/${lojaId}/financeiro/receber`} className="w-fit text-[13px] text-grafite hover:text-tinta">← Contas a receber</Link>
        <h1 className="font-display text-[26px] font-light tracking-tight text-tinta">Cobrança</h1>
        <p className="text-[14px] text-cinza-fumo">Acompanhe com delicadeza as parcelas em aberto.</p>
      </header>

      {aviso && <AvisoFlash tom={sp.ok ? "ok" : "erro"}>{aviso}</AvisoFlash>}

      {aging.noivas.length === 0 ? (
        <p className="text-[15px] text-cinza-fumo">Nenhuma parcela em atraso. 💛</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">{cardFaixa("ate30")}{cardFaixa("d31a60")}{cardFaixa("mais60")}</div>

          <ul className="flex flex-col gap-3">
            {aging.noivas.map((n) => {
              const wa = linkWhatsApp(n.whatsapp, msgPadrao(n.noivaNome));
              const hist = historicos.get(n.leadId) ?? [];
              return (
                <li key={n.leadId} className="flex flex-col gap-2 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[15px] text-tinta">{n.noivaNome ?? "Noiva"}</span>
                      <span className="text-[12px] text-cinza-fumo">{n.qtdParcelas} parcela{n.qtdParcelas === 1 ? "" : "s"} · há {n.diasMaisAntigo} dias · {FAIXA_ROTULO[n.faixaMaisAntiga]}</span>
                    </span>
                    <span className={`shrink-0 font-display text-[15px] font-light tabular-nums ${n.faixaMaisAntiga === "mais60" ? "text-bordo" : "text-tinta"}`}>{brl(n.totalVencido)}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={linkAcao}>Abrir WhatsApp ↗</a>}
                    {podeEditar && (
                      <details>
                        <summary className={`w-fit cursor-pointer ${linkAcao}`}>Registrar cobrança</summary>
                        <form action={registrarCobrancaAction} className="flex flex-wrap items-end gap-2 pt-3">
                          <input type="hidden" name="leadId" value={n.leadId} />
                          <label className="flex flex-col gap-1">
                            <span className={rotulo}>Canal</span>
                            <select name="canal" aria-label="Canal" className={campo} defaultValue="WHATSAPP">
                              <option value="WHATSAPP">WhatsApp</option>
                              <option value="TELEFONE">Telefone</option>
                              <option value="PRESENCIAL">Presencial</option>
                              <option value="OUTRO">Outro</option>
                            </select>
                          </label>
                          <label className="flex flex-1 flex-col gap-1">
                            <span className={rotulo}>Observação</span>
                            <input name="observacao" placeholder="Ex.: prometeu pagar dia 15" aria-label="Observação" className={campo} />
                          </label>
                          <button type="submit" className={botao}>Registrar</button>
                        </form>
                      </details>
                    )}
                  </div>

                  {hist.length > 0 && (
                    <ul className="flex flex-col gap-0.5 border-t border-borda-suave pt-2">
                      {hist.map((c) => (
                        <li key={c.id} className="text-[12px] text-cinza-fumo">
                          {dataFmt.format(c.data)} · {CANAL_ROTULO[c.canal] ?? c.canal}{c.observacao ? ` · "${c.observacao}"` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: tsc + conferir tokens**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo. Confirme em `src/app/globals.css` que os tokens usados existem (`text-tinta`, `text-cinza-fumo`, `text-grafite`, `text-bordo`, `bg-bordo`, `bg-papel`, `bg-papel-elevado`, `border-borda-suave`, `border-bordo/30`, `text-papel-elevado`, `decoration-borda`, `font-display`, `--mn-radius-md`). Se algum não existir, troque pelo equivalente real (não invente token).

- [ ] **Step 3: Commit**
```bash
git add "src/app/(app)/loja/[lojaId]/financeiro/cobranca/page.tsx"
git commit -m "feat(financeiro): tela de Cobrança (aging, WhatsApp, registrar, histórico)"
```

---

## Task 6: Links de entrada + verificação final

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/financeiro/receber/page.tsx`
- Modify: `src/app/(app)/loja/[lojaId]/financeiro/projecao/page.tsx`

- [ ] **Step 1: Link em Contas a receber**

Abrir `src/app/(app)/loja/[lojaId]/financeiro/receber/page.tsx`, localizar o header (título "Contas a receber") e adicionar, coerente com os links já presentes, um link:
```tsx
<Link href={`/loja/${lojaId}/financeiro/cobranca`} className="text-[13px] text-grafite hover:text-tinta">Cobrança →</Link>
```
Conferir o nome da variável de loja usada no arquivo e se `Link` já é importado (senão `import Link from "next/link";`).

- [ ] **Step 2: Link no bloco "Em atraso" da Projeção**

Abrir `src/app/(app)/loja/[lojaId]/financeiro/projecao/page.tsx`. No `<section>` do bloco "Em atraso · fora da curva", adicionar ao fim da `<div>` dos links um link para a cobrança:
```tsx
<Link href={`/loja/${lojaId}/financeiro/cobranca`} className="hover:text-bordo">acompanhar cobrança →</Link>
```

- [ ] **Step 3: Verificação final**

Run:
```bash
node node_modules/typescript/bin/tsc --noEmit
npx vitest run
```
Expected: tsc limpo; suíte verde (inclui `cobranca.test.ts`).

- [ ] **Step 4: Commit**
```bash
git add "src/app/(app)/loja/[lojaId]/financeiro/receber/page.tsx" "src/app/(app)/loja/[lojaId]/financeiro/projecao/page.tsx"
git commit -m "feat(financeiro): links de entrada para Cobrança (receber + projeção)"
```

---

## Self-Review

**Cobertura do spec:**
- §5 (enum + `RegistroCobranca` + back-relations) → Task 1.
- §6.1/§6.2 (`faixaDeAtraso`/`linkWhatsApp` puros) → Task 2.
- §6.3/§6.4/§6.5 (`agingDaLoja`/`historicoCobranca`/`registrarCobranca`) → Task 3.
- §7 (Server Action) → Task 4.
- §8 (tela: faixas, lista, WhatsApp, registrar, histórico, estado vazio) → Task 5; links de entrada → Task 6.
- §9 (testes unit + integração) → Tasks 2/3.
- §10 (transversais) → presentes em cada task.

**Placeholders:** nenhum — código/comando completos. As inserções de link (Task 6) têm instrução de conferir o arquivo real (1 linha cada).

**Consistência de tipos:** `Faixa` (Task 2) reusado em `Aging`/`NoivaInadimplente` (Task 3) e no `FAIXA_ROTULO` da tela (Task 5). `CobrancaCanal` (enum do Prisma, Task 1) usado em `historicoCobranca`/`registrarCobranca` (Task 3) e no `CANAL_ROTULO` (Task 5). `registrarCobranca({leadId, canal, observacao})` chamado igual na ação (Task 4). `agingDaLoja`/`historicoCobranca`/`linkWhatsApp` importados na tela conferem com as assinaturas da Task 3/2.

**Escopo:** uma fatia (cobrança). DRE por categoria fica para a Fatia 3 (spec própria).
