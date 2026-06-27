# Dia do atelier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao gestor a visão de "tudo de um dia" (agenda + financeiro) servida no Início (hoje) e no Calendário (qualquer dia ao clicar).

**Architecture:** Uma função de leitura `detalheDoDia` e um componente server `DiaDoAtelier` reutilizados por duas telas. O Início renderiza o dia de hoje + atenções de contas vencidas; o Calendário ganha mini-agenda por dia e abre o painel do dia via `?dia=`. Financeiro é dado sensível, atrás de `financeiro:ver`, e nem é buscado sem permissão.

**Tech Stack:** Next.js 16 (App Router, Server Components, `force-dynamic`), Prisma 7 (`tenantPrisma` p/ isolamento de loja), Tailwind v4, vitest (integração com Postgres real), Playwright (verificação visual).

**Status (2026-06-14):** Entregue nos commits d0fa4a7…94208f2; gate do marcador R$ trancado por teste em 2026-06-14 (b8d559d). Fechamento: ver `2026-06-14-dia-do-atelier-fechamento.md`.

**Convenções do repo (ler antes de começar):**
- Commits **direto na `main`** (sem branch/worktree). Antes de cada commit: `node node_modules/typescript/bin/tsc --noEmit` limpo e `npx vitest run` verde. (O binário `.bin/tsc` está sem permissão de execução; rode via `node node_modules/typescript/bin/tsc`.)
- Dia-calendário = meia-noite UTC do dia em São Paulo. Helpers em `@/lib/tempo`: `hojeYMD()`, `hojeUTC()`, `meiaNoiteUTC(ymd)`, `ymd(date)`.
- Toda leitura de modelo de loja passa por `tenantPrisma(prisma, lojaId)`.
- Dinheiro: `decParaString(decimal)` → `"1234.56"`; `brl("1234.56")` → `"R$ 1.234,56"` (`@/lib/dinheiro`).
- Testes de integração: criar dados com prefixo `MARK`, limpar em `afterAll`. Ver `src/lib/calendario/__tests__/dados.test.ts` como modelo.
- Spec: `docs/superpowers/specs/2026-06-11-calendario-mes-painel-central-design.md`. Glossário: `CONTEXT.md`. Decisão: `docs/adr/0001-dia-do-atelier-inicio-e-calendario.md`.

---

## File Structure

**Criar:**
- `src/lib/calendario/dia.ts` — `detalheDoDia(lojaId, ymd, {financeiro})`: tudo de um dia (agenda + financeiro do dia). Tipos do dia.
- `src/lib/calendario/__tests__/dia.test.ts` — testes de integração de `detalheDoDia`.
- `src/lib/financeiro/vencidas.ts` — `vencidasDaLoja(lojaId, hoje)`: contagem/soma de contas vencidas (a receber e a pagar).
- `src/lib/financeiro/__tests__/vencidas.test.ts` — testes de `vencidasDaLoja`.
- `src/lib/calendario/__tests__/itens-mes.test.ts` — testes de `itensDoMes`.
- `src/components/dashboard/dia-do-atelier.tsx` — componente server que renderiza um `DiaDoAtelier`.
- `src/components/dashboard/aviso-vencidas.tsx` — bloco de atenção de contas vencidas (Início).

**Modificar:**
- `src/lib/calendario/dados.ts` — adicionar `itensDoMes` (mini-agenda por dia). `marcadoresNoIntervalo` permanece (usado pelo teste atual) mas deixa de alimentar a célula.
- `src/lib/calendario/mes.ts` — adicionar tipo `ItemDia`/`DiaComItens` (matemática/tipos puros, se útil) — opcional; pode morar em `dados.ts`.
- `src/app/(app)/loja/[lojaId]/page.tsx` — encaixar `DiaDoAtelier` de hoje + `AvisoVencidas` (gated).
- `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaMes.tsx` — célula vira mini-agenda; células viram links `?dia=`; renderiza `DiaDoAtelier` do dia clicado.
- `src/app/(app)/loja/[lojaId]/calendario/page.tsx` — repassar `?dia=` para `AbaMes`.

---

## Task 1: Leitura `detalheDoDia` (tudo de um dia)

**Files:**
- Create: `src/lib/calendario/dia.ts`
- Test: `src/lib/calendario/__tests__/dia.test.ts`

- [x] **Step 1: Escrever o teste que falha**

Criar `src/lib/calendario/__tests__/dia.test.ts`:

```ts
// Integração: detalheDoDia reúne agenda + financeiro de um dia, escopado por loja.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { reservarVestido } from "@/lib/disponibilidade/reservas";
import { agendarAtendimento } from "@/lib/atendimentos/atendimentos";
import { detalheDoDia } from "@/lib/calendario/dia";

const MARK = "t-cal-dia-";
let loja = "";
let vestido = "";
let noiva = "";
let cabine = "";
let vendedora = "";

const ymdHoje = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const base = new Date(`${ymdHoje}T00:00:00.000Z`);
base.setUTCDate(base.getUTCDate() + 30); // dia de teste: +30 (longe de bloqueios)
const dia = base.toISOString().slice(0, 10);

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  vestido = (await db.vestido.create({ data: { codigo: `${MARK}v`, nome: `${MARK}Vestido`, precoBase: 1000 } as never })).id;
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Noiva`, etapa: "NOVO" } as never })).id;
  cabine = (await db.cabine.create({ data: { nome: `${MARK}C1` } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}Vend`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  vendedora = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  // Reserva (casamento no dia de teste) + prova + atendimento no mesmo dia.
  const r = await reservarVestido(loja, { vestidoId: vestido, leadId: noiva, casamentoData: dia });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const p = await agendarAtendimento(loja, { leadId: noiva, cabineId: cabine, vendedoraId: vendedora, dataYMD: dia, hora: 10, tipo: "PROVA", bloqueioId: r.bloqueioId });
  expect(p.ok).toBe(true);
  const a = await agendarAtendimento(loja, { leadId: noiva, cabineId: cabine, vendedoraId: vendedora, dataYMD: dia, hora: 14, tipo: "ATENDIMENTO" });
  expect(a.ok).toBe(true);
  // Contrato + parcela a receber vencendo no dia.
  const contrato = await db.contrato.create({
    data: { leadId: noiva, vendedoraId: vendedora, valorTotal: 1000 } as never,
  });
  await db.parcela.create({
    data: { contratoId: contrato.id, numero: 1, valorPrevisto: 500, vencimento: new Date(`${dia}T00:00:00.000Z`) } as never,
  });
  // Conta a pagar vencendo no dia.
  await db.contaPagar.create({
    data: { tipo: "DESPESA", descricao: `${MARK}Lavanderia`, valorPrevisto: 200, vencimento: new Date(`${dia}T00:00:00.000Z`) } as never,
  });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("detalheDoDia", () => {
  it("reúne provas, atendimentos e casamentos do dia", async () => {
    const d = await detalheDoDia(loja, dia, { financeiro: true });
    expect(d.provas.map((p) => p.inicio.getUTCHours())).toContain(10);
    expect(d.atendimentos.map((a) => a.inicio.getUTCHours())).toContain(14);
    expect(d.casamentos.some((c) => c.noivaNome === `${MARK}Noiva`)).toBe(true);
  });
  it("inclui a receber e a pagar do dia quando financeiro=true", async () => {
    const d = await detalheDoDia(loja, dia, { financeiro: true });
    expect(d.aReceber.some((r) => r.valor === "500")).toBe(true);
    expect(d.aPagar.some((c) => c.valor === "200")).toBe(true);
  });
  it("omite financeiro quando financeiro=false", async () => {
    const d = await detalheDoDia(loja, dia, { financeiro: false });
    expect(d.aReceber).toEqual([]);
    expect(d.aPagar).toEqual([]);
  });
});
```

- [x] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/calendario/__tests__/dia.test.ts`
Expected: FAIL — `Cannot find module '@/lib/calendario/dia'`.

- [x] **Step 3: Implementar `detalheDoDia`**

Criar `src/lib/calendario/dia.ts`:

```ts
// src/lib/calendario/dia.ts
// "Dia do atelier": tudo o que acontece num dia — agenda (atendimentos, provas,
// casamentos) e, quando financeiro=true, as contas a receber/pagar que VENCEM no dia.
// Janela [meia-noite UTC do dia, +1 dia). Escopo de loja via tenantPrisma. A parte
// financeira só é buscada quando o chamador tem financeiro:ver (não vaza dado sensível).
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { meiaNoiteUTC } from "@/lib/tempo";
import { decParaString } from "@/lib/dinheiro";
import type { AtendimentoSituacao, ParcelaStatus, ContaPagarStatus } from "@/generated/prisma/client";

export type AtendimentoDoDia = {
  id: string;
  inicio: Date;
  situacao: AtendimentoSituacao;
  noivaNome: string | null;
  leadId: string;
  cabineNome: string | null;
  vendedoraNome: string | null;
};
export type ProvaDoDia = {
  id: string;
  inicio: Date;
  situacao: AtendimentoSituacao;
  noivaNome: string | null;
  leadId: string;
  bloqueioId: string | null;
  vestidoCodigo: string | null;
  vestidoNome: string | null;
};
export type CasamentoDoDia = {
  bloqueioId: string;
  noivaNome: string | null;
  leadId: string | null;
  vestidoCodigo: string;
  vestidoNome: string;
};
export type ReceberDoDia = {
  id: string;
  noivaNome: string | null;
  leadId: string;
  valor: string; // decimal-string, ex "500"
  status: ParcelaStatus;
};
export type PagarDoDia = {
  id: string;
  descricao: string;
  valor: string;
  status: ContaPagarStatus;
};
export type DiaDoAtelier = {
  ymd: string;
  atendimentos: AtendimentoDoDia[];
  provas: ProvaDoDia[];
  casamentos: CasamentoDoDia[];
  aReceber: ReceberDoDia[]; // [] quando financeiro=false
  aPagar: PagarDoDia[]; // [] quando financeiro=false
};

export async function detalheDoDia(
  lojaId: string,
  ymd: string,
  opts: { financeiro: boolean },
): Promise<DiaDoAtelier> {
  const db = tenantPrisma(prisma, lojaId);
  const gte = meiaNoiteUTC(ymd);
  const lt = new Date(gte.getTime());
  lt.setUTCDate(lt.getUTCDate() + 1);

  const [atendimentos, provas, casamentos, parcelas, contas] = await Promise.all([
    db.atendimento.findMany({
      where: { tipo: "ATENDIMENTO", inicio: { gte, lt } },
      orderBy: { inicio: "asc" },
      include: { lead: { select: { noivaNome: true } }, cabine: { select: { nome: true } }, vendedora: { select: { nome: true } } },
    }),
    db.atendimento.findMany({
      where: { tipo: "PROVA", inicio: { gte, lt } },
      orderBy: { inicio: "asc" },
      include: {
        lead: { select: { noivaNome: true } },
        bloqueio: { include: { vestido: { select: { codigo: true, nome: true } } } },
      },
    }),
    db.bloqueioVestido.findMany({
      where: { tipo: "RESERVA_CASAMENTO", casamentoData: { gte, lt } },
      include: { lead: { select: { noivaNome: true } }, vestido: { select: { codigo: true, nome: true } } },
    }),
    opts.financeiro
      ? db.parcela.findMany({
          where: { vencimento: { gte, lt } },
          orderBy: { vencimento: "asc" },
          include: { contrato: { select: { leadId: true, lead: { select: { noivaNome: true } } } } },
        })
      : Promise.resolve([]),
    opts.financeiro
      ? db.contaPagar.findMany({ where: { vencimento: { gte, lt } }, orderBy: { vencimento: "asc" } })
      : Promise.resolve([]),
  ]);

  return {
    ymd,
    atendimentos: atendimentos.map((a) => ({
      id: a.id,
      inicio: a.inicio,
      situacao: a.situacao,
      noivaNome: a.lead?.noivaNome ?? null,
      leadId: a.leadId,
      cabineNome: a.cabine?.nome ?? null,
      vendedoraNome: a.vendedora?.nome ?? null,
    })),
    provas: provas.map((p) => ({
      id: p.id,
      inicio: p.inicio,
      situacao: p.situacao,
      noivaNome: p.lead?.noivaNome ?? null,
      leadId: p.leadId,
      bloqueioId: p.bloqueioId,
      vestidoCodigo: p.bloqueio?.vestido.codigo ?? null,
      vestidoNome: p.bloqueio?.vestido.nome ?? null,
    })),
    casamentos: casamentos.map((c) => ({
      bloqueioId: c.id,
      noivaNome: c.lead?.noivaNome ?? null,
      leadId: c.leadId,
      vestidoCodigo: c.vestido.codigo,
      vestidoNome: c.vestido.nome,
    })),
    aReceber: parcelas.map((p) => ({
      id: p.id,
      noivaNome: p.contrato.lead?.noivaNome ?? null,
      leadId: p.contrato.leadId,
      valor: decParaString(p.valorPrevisto),
      status: p.status,
    })),
    aPagar: contas.map((c) => ({
      id: c.id,
      descricao: c.descricao,
      valor: decParaString(c.valorPrevisto),
      status: c.status,
    })),
  };
}
```

- [x] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/calendario/__tests__/dia.test.ts`
Expected: PASS (3 testes).

- [x] **Step 5: tsc + commit**

```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/lib/calendario/dia.ts src/lib/calendario/__tests__/dia.test.ts
git commit -m "feat(calendario): detalheDoDia — agenda + financeiro de um dia (escopo de loja)"
```

---

## Task 2: Contas vencidas da loja (para Atenções)

**Files:**
- Create: `src/lib/financeiro/vencidas.ts`
- Test: `src/lib/financeiro/__tests__/vencidas.test.ts`

- [x] **Step 1: Escrever o teste que falha**

Criar `src/lib/financeiro/__tests__/vencidas.test.ts`:

```ts
// Integração: vencidasDaLoja conta/soma PREVISTA com vencimento < hoje.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { vencidasDaLoja } from "@/lib/financeiro/vencidas";

const MARK = "t-venc-";
let loja = "";
let noiva = "";
let vendedora = "";
const hoje = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())}T00:00:00.000Z`);
const ontem = new Date(hoje.getTime());
ontem.setUTCDate(ontem.getUTCDate() - 1);

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}N`, etapa: "NOVO" } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}V`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  vendedora = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  const contrato = await db.contrato.create({ data: { leadId: noiva, vendedoraId: vendedora, valorTotal: 1000 } as never });
  // 1 parcela vencida (PREVISTA, ontem) + 1 paga (não conta).
  await db.parcela.create({ data: { contratoId: contrato.id, numero: 1, valorPrevisto: 300, vencimento: ontem } as never });
  await db.parcela.create({ data: { contratoId: contrato.id, numero: 2, valorPrevisto: 700, vencimento: ontem, status: "PAGA" } as never });
  // 1 conta a pagar vencida.
  await db.contaPagar.create({ data: { tipo: "DESPESA", descricao: `${MARK}x`, valorPrevisto: 150, vencimento: ontem } as never });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("vencidasDaLoja", () => {
  it("conta só PREVISTA com vencimento < hoje", async () => {
    const v = await vencidasDaLoja(loja, hoje);
    expect(v.receberQtd).toBe(1);
    expect(v.receberTotal).toBe("300");
    expect(v.pagarQtd).toBe(1);
    expect(v.pagarTotal).toBe("150");
  });
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/__tests__/vencidas.test.ts`
Expected: FAIL — módulo não encontrado.

- [x] **Step 3: Implementar `vencidasDaLoja`**

Criar `src/lib/financeiro/vencidas.ts`:

```ts
// src/lib/financeiro/vencidas.ts
// Contas em atraso da loja: PREVISTA com vencimento < hoje, a receber (parcelas) e a
// pagar (contas). Alimenta a "Atenção imediata" de financeiro no Início. Escopo de loja.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { decParaString } from "@/lib/dinheiro";

export type Vencidas = {
  receberQtd: number;
  receberTotal: string; // decimal-string
  pagarQtd: number;
  pagarTotal: string;
};

export async function vencidasDaLoja(lojaId: string, hoje: Date): Promise<Vencidas> {
  const db = tenantPrisma(prisma, lojaId);
  const [parcelas, contas] = await Promise.all([
    db.parcela.findMany({ where: { status: "PREVISTA", vencimento: { lt: hoje } }, select: { valorPrevisto: true } }),
    db.contaPagar.findMany({ where: { status: "PREVISTA", vencimento: { lt: hoje } }, select: { valorPrevisto: true } }),
  ]);
  const soma = (rows: { valorPrevisto: unknown }[]) =>
    rows.reduce((acc, r) => acc + Number(decParaString(r.valorPrevisto as never)), 0);
  return {
    receberQtd: parcelas.length,
    receberTotal: String(soma(parcelas)),
    pagarQtd: contas.length,
    pagarTotal: String(soma(contas)),
  };
}
```

- [x] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/__tests__/vencidas.test.ts`
Expected: PASS.

- [x] **Step 5: tsc + commit**

```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/lib/financeiro/vencidas.ts src/lib/financeiro/__tests__/vencidas.test.ts
git commit -m "feat(financeiro): vencidasDaLoja — contas em atraso (a receber/a pagar)"
```

---

## Task 3: `itensDoMes` — mini-agenda por dia (célula do calendário)

**Files:**
- Modify: `src/lib/calendario/dados.ts`
- Test: `src/lib/calendario/__tests__/itens-mes.test.ts`

`itensDoMes` devolve, por dia do intervalo: a lista de itens curtos da célula (casamento com nome; prova/atendimento com hora), se há financeiro vencendo no dia (gated), e se o dia merece "atenção" (algo vencido/pendente — financeiro PREVISTA do dia já passado, ou prova/atendimento de dia passado ainda em aberto).

- [x] **Step 1: Escrever o teste que falha**

Criar `src/lib/calendario/__tests__/itens-mes.test.ts`:

```ts
// Integração: itensDoMes monta a mini-agenda por dia (casamento + itens com hora).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { reservarVestido } from "@/lib/disponibilidade/reservas";
import { agendarAtendimento } from "@/lib/atendimentos/atendimentos";
import { itensDoMes } from "@/lib/calendario/dados";

const MARK = "t-itens-";
let loja = "";
const ymdHoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const base = new Date(`${ymdHoje}T00:00:00.000Z`);
base.setUTCDate(base.getUTCDate() + 25);
const dia = base.toISOString().slice(0, 10);

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  const vestido = (await db.vestido.create({ data: { codigo: `${MARK}v`, nome: `${MARK}Vestido`, precoBase: 1000 } as never })).id;
  const noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Maria`, etapa: "NOVO" } as never })).id;
  const cabine = (await db.cabine.create({ data: { nome: `${MARK}C1` } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}V`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  const r = await reservarVestido(loja, { vestidoId: vestido, leadId: noiva, casamentoData: dia });
  if (r.ok) await agendarAtendimento(loja, { leadId: noiva, cabineId: cabine, vendedoraId: u.id, dataYMD: dia, hora: 9, tipo: "PROVA", bloqueioId: r.bloqueioId });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("itensDoMes", () => {
  it("agrupa por dia com casamento primeiro e prova com hora", async () => {
    const inicio = new Date(`${dia}T00:00:00.000Z`);
    const fim = new Date(inicio.getTime());
    fim.setUTCDate(fim.getUTCDate() + 1);
    const porDia = await itensDoMes(loja, inicio, fim, { financeiro: false });
    const d = porDia.get(dia);
    expect(d).toBeTruthy();
    expect(d!.itens[0]).toMatchObject({ tipo: "casamento", noivaNome: `${MARK}Maria` });
    expect(d!.itens.some((i) => i.tipo === "prova" && i.hora === 9)).toBe(true);
  });
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/calendario/__tests__/itens-mes.test.ts`
Expected: FAIL — `itensDoMes` não exportado.

- [x] **Step 3: Implementar `itensDoMes` em `dados.ts`**

Adicionar ao final de `src/lib/calendario/dados.ts` (manter o que já existe):

```ts
import { hojeUTC } from "@/lib/tempo";

export type ItemDia =
  | { tipo: "casamento"; noivaNome: string | null }
  | { tipo: "prova"; hora: number }
  | { tipo: "atendimento"; hora: number };

export type DiaComItens = {
  itens: ItemDia[]; // casamento(s) primeiro, depois prova/atendimento por hora
  temFinanceiro: boolean; // há conta vencendo no dia (só quando financeiro=true)
  atencao: boolean; // dia passado com financeiro PREVISTA OU prova/atend. em aberto
};

/**
 * Mini-agenda por dia em [inicio, fim). Casamentos primeiro (com nome), depois provas
 * e atendimentos por horário. `temFinanceiro` (só com financeiro=true) marca dias com
 * conta vencendo. `atencao` marca dias PASSADOS com pendência (financeiro em aberto ou
 * prova/atendimento não concluído). Escopo de loja.
 */
export async function itensDoMes(
  lojaId: string,
  inicio: Date,
  fim: Date,
  opts: { financeiro: boolean },
): Promise<Map<string, DiaComItens>> {
  const db = tenantPrisma(prisma, lojaId);
  const [casamentos, ags, parcelas, contas] = await Promise.all([
    db.bloqueioVestido.findMany({
      where: { tipo: "RESERVA_CASAMENTO", casamentoData: { gte: inicio, lt: fim } },
      include: { lead: { select: { noivaNome: true } } },
    }),
    db.atendimento.findMany({
      where: { inicio: { gte: inicio, lt: fim } },
      select: { inicio: true, tipo: true, situacao: true },
    }),
    opts.financeiro
      ? db.parcela.findMany({ where: { vencimento: { gte: inicio, lt: fim } }, select: { vencimento: true, status: true } })
      : Promise.resolve([] as { vencimento: Date; status: string }[]),
    opts.financeiro
      ? db.contaPagar.findMany({ where: { vencimento: { gte: inicio, lt: fim } }, select: { vencimento: true, status: true } })
      : Promise.resolve([] as { vencimento: Date; status: string }[]),
  ]);

  const hojeMs = hojeUTC().getTime();
  const mapa = new Map<string, DiaComItens>();
  const get = (dia: string): DiaComItens => {
    let d = mapa.get(dia);
    if (!d) { d = { itens: [], temFinanceiro: false, atencao: false }; mapa.set(dia, d); }
    return d;
  };
  const passou = (dia: string) => new Date(`${dia}T00:00:00.000Z`).getTime() < hojeMs;

  for (const c of casamentos) {
    const dia = ymd(c.casamentoData);
    if (dia) get(dia).itens.push({ tipo: "casamento", noivaNome: c.lead?.noivaNome ?? null });
  }
  for (const a of ags) {
    const dia = ymd(a.inicio)!;
    const d = get(dia);
    const hora = a.inicio.getUTCHours();
    d.itens.push(a.tipo === "PROVA" ? { tipo: "prova", hora } : { tipo: "atendimento", hora });
    if (passou(dia) && (a.situacao === "AGENDADO" || a.situacao === "EM_ATENDIMENTO")) d.atencao = true;
  }
  for (const p of [...parcelas, ...contas]) {
    const dia = ymd(p.vencimento)!;
    const d = get(dia);
    d.temFinanceiro = true;
    if (passou(dia) && p.status === "PREVISTA") d.atencao = true;
  }
  // Ordena: casamento primeiro, depois por hora.
  for (const d of mapa.values()) {
    d.itens.sort((x, y) => {
      const peso = (i: ItemDia) => (i.tipo === "casamento" ? -1 : i.hora);
      return peso(x) - peso(y);
    });
  }
  return mapa;
}
```

- [x] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/calendario/__tests__/itens-mes.test.ts`
Expected: PASS.

- [x] **Step 5: tsc + suíte cheia + commit**

```bash
node node_modules/typescript/bin/tsc --noEmit
npx vitest run
git add src/lib/calendario/dados.ts src/lib/calendario/__tests__/itens-mes.test.ts
git commit -m "feat(calendario): itensDoMes — mini-agenda por dia (casamento + itens com hora + atenção)"
```

---

## Task 4: Componente `DiaDoAtelier`

Componente server puro de apresentação: recebe um `DiaDoAtelier` (já filtrado) + `lojaId` e renderiza as seções com conteúdo. Verificação por `tsc` (sem unit test — padrão do repo p/ componentes).

**Files:**
- Create: `src/components/dashboard/dia-do-atelier.tsx`

- [x] **Step 1: Implementar o componente**

Criar `src/components/dashboard/dia-do-atelier.tsx`:

```tsx
// src/components/dashboard/dia-do-atelier.tsx
// "Dia do atelier": as seções com conteúdo de um dia (agenda + financeiro já filtrado
// por permissão pelo chamador). Usado no Início (hoje) e no Calendário (dia clicado).
import Link from "next/link";
import type { DiaDoAtelier } from "@/lib/calendario/dia";
import { brl } from "@/lib/dinheiro";

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

const ROTULO_SITUACAO: Record<string, string> = {
  AGENDADO: "Agendado",
  EM_ATENDIMENTO: "Em atendimento",
  CONCLUIDO: "Concluído",
  FALTOU: "Faltou",
};

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">{titulo}</h3>
      <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
        {children}
      </ul>
    </section>
  );
}

export function DiaDoAtelier({ lojaId, dia }: { lojaId: string; dia: DiaDoAtelier }) {
  const vazio =
    dia.atendimentos.length + dia.provas.length + dia.casamentos.length + dia.aReceber.length + dia.aPagar.length === 0;
  if (vazio) {
    return <p className="text-[14px] text-cinza-fumo">Nada agendado para este dia.</p>;
  }
  const linha = "flex items-center justify-between gap-4 px-4 py-3";
  return (
    <div className="flex flex-col gap-5">
      {dia.atendimentos.length > 0 && (
        <Secao titulo="Atendimentos">
          {dia.atendimentos.map((a) => (
            <li key={a.id} className={linha}>
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] text-tinta">{hora.format(a.inicio)} · {a.noivaNome ?? "Noiva"}</span>
                <span className="text-[12px] text-cinza-fumo">{[a.cabineNome, a.vendedoraNome].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              <span className="shrink-0 text-[12px] text-grafite">{ROTULO_SITUACAO[a.situacao]}</span>
            </li>
          ))}
        </Secao>
      )}
      {dia.provas.length > 0 && (
        <Secao titulo="Provas">
          {dia.provas.map((p) => (
            <li key={p.id} className={linha}>
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] text-tinta">{hora.format(p.inicio)} · {p.noivaNome ?? "Noiva"}</span>
                <span className="text-[12px] text-cinza-fumo">{[p.vestidoCodigo, p.vestidoNome].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              {p.bloqueioId && (
                <Link href={`/loja/${lojaId}/reservas/${p.bloqueioId}`} className="shrink-0 text-[12px] text-grafite underline decoration-borda underline-offset-4 hover:text-bordo">Abrir</Link>
              )}
            </li>
          ))}
        </Secao>
      )}
      {dia.casamentos.length > 0 && (
        <Secao titulo="Casamentos">
          {dia.casamentos.map((c) => (
            <li key={c.bloqueioId} className={linha}>
              <span className="text-[14px] text-bordo">{c.noivaNome ?? "Noiva"}</span>
              <span className="shrink-0 text-[12px] text-cinza-fumo">{c.vestidoCodigo} · {c.vestidoNome}</span>
            </li>
          ))}
        </Secao>
      )}
      {dia.aReceber.length > 0 && (
        <Secao titulo="A receber">
          {dia.aReceber.map((r) => (
            <li key={r.id} className={linha}>
              <span className="min-w-0 text-[14px] text-tinta">{r.noivaNome ?? "Noiva"}</span>
              <span className="shrink-0 text-[13px] text-grafite tabular-nums">{brl(r.valor)} · {r.status === "PAGA" ? "paga" : "prevista"}</span>
            </li>
          ))}
        </Secao>
      )}
      {dia.aPagar.length > 0 && (
        <Secao titulo="A pagar">
          {dia.aPagar.map((c) => (
            <li key={c.id} className={linha}>
              <span className="min-w-0 text-[14px] text-tinta">{c.descricao}</span>
              <span className="shrink-0 text-[13px] text-grafite tabular-nums">{brl(c.valor)} · {c.status === "PAGA" ? "paga" : "prevista"}</span>
            </li>
          ))}
        </Secao>
      )}
    </div>
  );
}
```

- [x] **Step 2: tsc + commit**

```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/components/dashboard/dia-do-atelier.tsx
git commit -m "feat(dashboard): componente DiaDoAtelier (seções de um dia)"
```

---

## Task 5: Início — Dia do atelier de hoje + atenção de vencidas

**Files:**
- Create: `src/components/dashboard/aviso-vencidas.tsx`
- Modify: `src/app/(app)/loja/[lojaId]/page.tsx`

- [x] **Step 1: Componente de aviso de vencidas**

Criar `src/components/dashboard/aviso-vencidas.tsx`:

```tsx
// src/components/dashboard/aviso-vencidas.tsx
// Atenção imediata de financeiro: contas vencidas (a receber/a pagar). Só renderiza com
// dado (o chamador já checou financeiro:ver). Bordô como joia — atraso pede atenção.
import Link from "next/link";
import type { Vencidas } from "@/lib/financeiro/vencidas";
import { brl } from "@/lib/dinheiro";

export function AvisoVencidas({ lojaId, vencidas }: { lojaId: string; vencidas: Vencidas }) {
  if (vencidas.receberQtd === 0 && vencidas.pagarQtd === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-[var(--mn-radius-md)] border border-bordo/30 bg-papel-elevado p-4">
      <h2 className="text-[11px] uppercase tracking-[0.2em] text-bordo">Contas vencidas</h2>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-tinta">
        {vencidas.receberQtd > 0 && (
          <Link href={`/loja/${lojaId}/financeiro/receber`} className="hover:text-bordo">
            {vencidas.receberQtd} a receber · {brl(vencidas.receberTotal)}
          </Link>
        )}
        {vencidas.pagarQtd > 0 && (
          <Link href={`/loja/${lojaId}/financeiro/pagar`} className="hover:text-bordo">
            {vencidas.pagarQtd} a pagar · {brl(vencidas.pagarTotal)}
          </Link>
        )}
      </div>
    </div>
  );
}
```

- [x] **Step 2: Encaixar no Início**

Em `src/app/(app)/loja/[lojaId]/page.tsx`, adicionar imports no topo (junto aos outros):

```tsx
import { detalheDoDia } from "@/lib/calendario/dia";
import { vencidasDaLoja } from "@/lib/financeiro/vencidas";
import { hojeYMD, hojeUTC } from "@/lib/tempo";
import { DiaDoAtelier } from "@/components/dashboard/dia-do-atelier";
import { AvisoVencidas } from "@/components/dashboard/aviso-vencidas";
```

Trocar o bloco de carga (linhas ~20-23) para incluir a permissão financeira e os dados do dia:

```tsx
  const podeFinanceiro = await podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "ver");
  const [painel, podeVerNoivas, diaHoje, vencidas] = await Promise.all([
    carregarPainel(sc.loja.id),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"),
    detalheDoDia(sc.loja.id, hojeYMD(), { financeiro: podeFinanceiro }),
    podeFinanceiro ? vencidasDaLoja(sc.loja.id, hojeUTC()) : Promise.resolve(null),
  ]);
```

Logo após a divisória atmosférica (`<div aria-hidden className="h-px bg-champagne/40" />`), inserir o coração do dia + as vencidas:

```tsx
      {/* Hoje no atelier — o coração do dia (agenda + financeiro, este só com permissão) */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-[18px] font-light text-tinta">Hoje no atelier</h2>
        <DiaDoAtelier lojaId={sc.loja.id} dia={diaHoje} />
      </section>

      {vencidas && <AvisoVencidas lojaId={sc.loja.id} vencidas={vencidas} />}
```

- [x] **Step 3: tsc**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros.

- [x] **Step 4: Verificação visual (Playwright)**

Criar `verify_dia.mjs` na raiz reaproveitando o preâmbulo de login de `repro_prova.mjs` (login `admin@moscownoivas.local`/`admin123`, loja `loja-moscow`). Após logar, ir a `/loja/loja-moscow` e capturar:

```js
await page.goto(`${BASE}/loja/loja-moscow`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
console.log("tem 'Hoje no atelier'?", await page.locator('h2:has-text("Hoje no atelier")').count());
await page.screenshot({ path: "/tmp/dia/inicio.png", fullPage: true });
```

Run: `node verify_dia.mjs` e abrir `/tmp/dia/inicio.png`.
Expected: seção "Hoje no atelier" presente; sem quebra de layout.

- [x] **Step 5: Commit**

```bash
git add src/app/"(app)"/loja/"[lojaId]"/page.tsx src/components/dashboard/aviso-vencidas.tsx
git commit -m "feat(inicio): Dia do atelier de hoje + atenção de contas vencidas (gated financeiro:ver)"
```

---

## Task 6: Calendário — célula vira mini-agenda

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaMes.tsx`

- [x] **Step 1: Reescrever a célula usando `itensDoMes`**

Substituir o corpo de `AbaMes.tsx`. Pontos-chave:
1. trocar `marcadoresNoIntervalo`/`agruparMarcadoresPorDia` por `itensDoMes`;
2. ler a permissão financeira;
3. cada dia rende até 3 itens (`+N` no excedente), casamento com nome, prova/atendimento como `Hh tipo`, e o marcador `R$` discreto quando `temFinanceiro`;
4. anel de atenção no número quando `atencao`;
5. cada célula é um `<Link href="?aba=mes&ref=...&dia=YMD">`.

```tsx
// Aba Mês — a grade do mês como mini-agenda. Cada dia mostra casamento (nome, bordô),
// provas/atendimentos (hora · tipo) e, com financeiro:ver, um marcador R$ discreto.
// Clicar num dia abre o Dia do atelier (?dia=). Sem dia, a grade abre limpa.
import Link from "next/link";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { hojeYMD } from "@/lib/tempo";
import { gradeDoMes, mesDeRef, refDoMes, mesVizinho } from "@/lib/calendario/mes";
import { itensDoMes, type ItemDia } from "@/lib/calendario/dados";
import { detalheDoDia } from "@/lib/calendario/dia";
import { DiaDoAtelier } from "@/components/dashboard/dia-do-atelier";

const tituloMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const diaLongo = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" });
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MAX_ITENS = 3;

function rotuloItem(i: ItemDia): string {
  if (i.tipo === "casamento") return `♥ ${i.noivaNome ?? "Casamento"}`;
  return `${i.hora}h ${i.tipo === "prova" ? "prova" : "atend."}`;
}

export async function AbaMes({ lojaId, refParam, dia }: { lojaId: string; refParam?: string; dia?: string }) {
  const sc = await getSessaoComLoja();
  const podeFinanceiro = sc ? await podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "ver") : false;

  const hoje = hojeYMD();
  const { ano, mes0 } = mesDeRef(refParam, hoje);
  const dias = gradeDoMes(ano, mes0, hoje);
  const inicio = dias[0].data;
  const fim = new Date(dias[41].data.getTime());
  fim.setUTCDate(fim.getUTCDate() + 1);

  const porDia = await itensDoMes(lojaId, inicio, fim, { financeiro: podeFinanceiro });

  const ant = mesVizinho(ano, mes0, -1);
  const prox = mesVizinho(ano, mes0, +1);
  const link = (a: { ano: number; mes0: number }) => `/loja/${lojaId}/calendario?aba=mes&ref=${refDoMes(a.ano, a.mes0)}`;
  const linkDia = (ymd: string) => `/loja/${lojaId}/calendario?aba=mes&ref=${refDoMes(ano, mes0)}&dia=${ymd}`;

  const diaSel = dia && porDia ? dia : null;
  const detalhe = diaSel ? await detalheDoDia(lojaId, diaSel, { financeiro: podeFinanceiro }) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <h2 className="font-display text-[18px] font-light text-tinta first-letter:uppercase">
          {tituloMes.format(dias.find((d) => d.noMes)!.data)}
        </h2>
        <div className="flex items-center gap-1">
          <Link href={link(ant)} aria-label="Mês anterior" className="rounded-md px-2 py-1 text-[14px] text-grafite hover:bg-papel-suave hover:text-tinta">‹</Link>
          <Link href={link(prox)} aria-label="Próximo mês" className="rounded-md px-2 py-1 text-[14px] text-grafite hover:bg-papel-suave hover:text-tinta">›</Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[var(--mn-radius-md)] border border-borda-suave bg-borda-suave">
        {SEMANA.map((d) => (
          <div key={d} className="bg-papel-elevado py-2 text-center text-[11px] uppercase tracking-[0.1em] text-cinza-fumo">{d}</div>
        ))}
        {dias.map((d) => {
          const info = porDia.get(d.ymd);
          const itens = info?.itens ?? [];
          const extra = itens.length - MAX_ITENS;
          const selecionado = d.ymd === diaSel;
          return (
            <Link
              key={d.ymd}
              href={linkDia(d.ymd)}
              className={`flex min-h-24 flex-col gap-1 p-1.5 text-left transition-colors duration-150 hover:bg-papel-suave focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-bordo ${d.hoje ? "bg-papel-suave" : "bg-papel-elevado"} ${d.noMes ? "" : "opacity-40"} ${selecionado ? "ring-2 ring-bordo ring-inset" : ""}`}
            >
              <span className="flex items-center justify-between">
                <span className={`text-[12px] tabular-nums ${d.hoje ? "flex h-5 w-5 items-center justify-center rounded-full bg-bordo text-papel-elevado" : info?.atencao ? "rounded-full px-1 font-medium text-bordo ring-1 ring-bordo/40" : "text-grafite"}`}>
                  {d.data.getUTCDate()}
                </span>
                {info?.temFinanceiro && <span className="text-[10px] text-champagne">R$</span>}
              </span>
              <span className="flex flex-col gap-0.5">
                {itens.slice(0, MAX_ITENS).map((i, idx) => (
                  <span key={idx} className={`truncate text-[10px] leading-tight ${i.tipo === "casamento" ? "text-bordo" : "text-grafite"}`}>
                    {rotuloItem(i)}
                  </span>
                ))}
                {extra > 0 && <span className="text-[10px] text-cinza-fumo">+{extra}</span>}
              </span>
            </Link>
          );
        })}
      </div>

      {detalhe && (
        <section className="flex flex-col gap-3 border-t border-borda-suave pt-5">
          <h3 className="font-display text-[16px] font-light text-tinta first-letter:uppercase">
            {diaLongo.format(new Date(`${diaSel}T00:00:00.000Z`))}
          </h3>
          <DiaDoAtelier lojaId={lojaId} dia={detalhe} />
        </section>
      )}
    </div>
  );
}
```

- [x] **Step 2: Passar `?dia=` na page**

Em `src/app/(app)/loja/[lojaId]/calendario/page.tsx`: adicionar `dia` ao tipo de `searchParams` e repassar à `AbaMes`.

Tipo (linha ~37): acrescentar `dia?: string` ao objeto.
Render (linha ~86): trocar a entrada `mes` para:

```tsx
              mes: <AbaMes lojaId={lojaId} refParam={sp.ref} dia={sp.dia} />,
```

- [x] **Step 3: tsc**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros. (Se `marcadoresNoIntervalo`/`agruparMarcadoresPorDia` ficarem sem uso e o ESLint reclamar em build, manter as funções em `dados.ts`/`mes.ts` — ainda são cobertas por `dados.test.ts`; só os imports na `AbaMes` saem.)

- [x] **Step 4: Verificação visual**

Estender `verify_dia.mjs`: navegar a `/loja/loja-moscow/calendario?aba=mes`, screenshot da grade; clicar num dia com itens (ex.: localizar um link de dia via `page.locator('a[href*="&dia="]')`), e screenshot do painel aberto.

```js
await page.goto(`${BASE}/loja/loja-moscow/calendario?aba=mes`, { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/dia/mes.png", fullPage: true });
const algumDia = page.locator('a[href*="&dia="]').first();
await algumDia.click();
await page.waitForLoadState("networkidle");
await page.screenshot({ path: "/tmp/dia/mes-aberto.png", fullPage: true });
```

Expected: grade com mini-agenda (sem pontos); ao clicar, painel "Dia do atelier" abaixo.

- [x] **Step 5: Commit**

```bash
git add src/app/"(app)"/loja/"[lojaId]"/calendario/_abas/AbaMes.tsx src/app/"(app)"/loja/"[lojaId]"/calendario/page.tsx
git commit -m "feat(calendario): aba Mês vira mini-agenda + abre Dia do atelier ao clicar (?dia=)"
```

---

## Task 7: Gating de financeiro ponta a ponta + verificação com perfil sem permissão

**Files:** (sem novos arquivos — verificação e ajustes finos)

- [x] **Step 1: Conferir os três pontos de gate**

Revisar que nenhum caminho busca/renderiza financeiro sem `financeiro:ver`:
- `page.tsx` (Início): `detalheDoDia(..., { financeiro: podeFinanceiro })` e `vencidas` só com `podeFinanceiro`. ✓
- `AbaMes.tsx`: `itensDoMes(..., { financeiro: podeFinanceiro })` e `detalheDoDia(..., { financeiro: podeFinanceiro })`. ✓
- `DiaDoAtelier`: só renderiza `aReceber`/`aPagar` quando os arrays têm itens (vazios sem permissão). ✓

- [x] **Step 2: Verificação visual com perfil sem financeiro**

No seed-demo há usuários de perfis variados. Identificar (via `/equipe` ou seed) um login **sem** `financeiro:ver` (ex.: costureira/vendedora) e repetir a captura de Início e Calendário, confirmando: sem marcador `R$`, sem seções "A receber"/"A pagar", sem bloco de vencidas.

Se não houver credencial à mão, criar um teste de integração mínimo que chama `detalheDoDia(loja, dia, { financeiro: false })` e afirma `aReceber`/`aPagar` vazios (já coberto na Task 1, Step 1, 3º caso) e documentar no relatório que o gate de UI espelha o de dados.

- [x] **Step 3: Suíte cheia + tsc**

Run: `node node_modules/typescript/bin/tsc --noEmit && npx vitest run`
Expected: tsc limpo, todos os testes verdes.

- [x] **Step 4: Commit (se houve ajuste)**

```bash
git add -A
git commit -m "chore(calendario): confirma gating financeiro:ver no Início e Calendário"
```

---

## Task 8: Polimento — mobile, vazios, acessibilidade

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaMes.tsx` (fallback responsivo)

- [x] **Step 1: Fallback de contagem no mobile**

Na célula, esconder o texto detalhado em telas estreitas e mostrar contagem por categoria. Envolver a lista de itens detalhada em `hidden sm:flex` e adicionar uma versão compacta `flex sm:hidden` que conta por tipo:

```tsx
              {/* Mobile: contagem por categoria */}
              <span className="flex flex-col gap-0.5 sm:hidden">
                {(() => {
                  const nC = itens.filter((i) => i.tipo === "casamento").length;
                  const nP = itens.filter((i) => i.tipo === "prova").length;
                  const nA = itens.filter((i) => i.tipo === "atendimento").length;
                  return (
                    <>
                      {nC > 0 && <span className="text-[10px] text-bordo">{nC} casamento{nC > 1 ? "s" : ""}</span>}
                      {nP > 0 && <span className="text-[10px] text-grafite">{nP} prova{nP > 1 ? "s" : ""}</span>}
                      {nA > 0 && <span className="text-[10px] text-grafite">{nA} atend.</span>}
                    </>
                  );
                })()}
              </span>
```

E trocar o `flex flex-col` da lista detalhada para `hidden flex-col sm:flex`.

- [x] **Step 2: tsc + verificação 375px**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Estender `verify_dia.mjs` com viewport 375×812 e checar overflow (padrão `verify_c6.mjs`): `document.documentElement.scrollWidth > clientWidth + 2` deve ser falso. Screenshots `/tmp/dia/mes-375.png` e `/tmp/dia/inicio-375.png`.

- [x] **Step 3: Commit**

```bash
git add src/app/"(app)"/loja/"[lojaId]"/calendario/_abas/AbaMes.tsx
git commit -m "polish(calendario): fallback de contagem na célula em telas estreitas"
```

---

## Self-Review (preenchido pelo autor do plano)

**Cobertura do spec:**
- Início = hoje + soma → Task 5. ✓
- Dia do atelier reutilizável → Task 4 (componente) + Tasks 5/6 (consumo). ✓
- Calendário abre sem dia, abre qualquer dia via `?dia=` → Task 6. ✓
- Vencidas → Atenção no Início → Tasks 2 + 5. ✓
- Financeiro `financeiro:ver` em toda parte → Tasks 1/3 (dados condicionais) + 5/6/7 (UI). ✓
- Célula: casamento + hora/tipo + "+N" + R$ discreto; fallback mobile → Tasks 3/6/8. ✓
- Camada de dados (`detalheDoDia`, `itensDoMes`, vencidas) → Tasks 1/2/3. ✓
- Ajustes fora → nenhum task os inclui. ✓

**Placeholders:** nenhum "TBD"/"etc." em passos de código; todo passo de código traz o código.

**Consistência de tipos:** `DiaDoAtelier`/`detalheDoDia` (Task 1) consumidos por `DiaDoAtelier` componente (Task 4) e páginas (5/6). `Vencidas`/`vencidasDaLoja` (Task 2) por `AvisoVencidas` (5). `ItemDia`/`itensDoMes` (Task 3) por `AbaMes` (6/8). Nomes batem.

**Ponto de atenção para o executor:** `marcadoresNoIntervalo` e `agruparMarcadoresPorDia` deixam de ser usados pela `AbaMes`, mas continuam exportados e testados em `dados.test.ts`. Mantê-los (não quebrar o teste). Se preferir remover de vez, é uma tarefa de limpeza à parte (apagar função + teste juntos) — fora do escopo deste plano.
