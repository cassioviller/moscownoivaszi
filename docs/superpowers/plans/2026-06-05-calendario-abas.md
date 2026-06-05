# Calendário com abas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a página Agenda numa página **Calendário** com 4 abas, cada uma na forma certa para um tipo de dado: Mês (grade), Vestidos fora (Gantt), Atendimentos (semana) e Provas & ajustes (fila).

**Architecture:** A página é um Server Component que lê `?aba=` da URL e renderiza o componente da aba ativa. Toda a matemática de datas/layout vive em módulos PUROS em `src/lib/calendario/*` (testáveis sem Prisma); os componentes só leem dados (reaproveitando funções existentes: `agendaDoAtelier`, `listarProvasDaLoja`, `listarAjustesPendentes`) e desenham. A rota antiga `/agenda` vira um redirect para `/calendario`.

**Tech Stack:** Next.js 16 (App Router, Server Components, `params`/`searchParams` como Promise), React 19, Tailwind CSS 4 (tokens `--color-*`), Prisma (via `tenantPrisma`), Vitest.

**Convenção de tempo (importante):** o dia-calendário vive à **meia-noite UTC** do dia em São Paulo. `prova.dataReal` e `bloqueio.casamentoData` são meia-noite UTC; `atendimento.inicio` é wall-clock UTC (hora cheia). Para "em que dia cai", usar sempre `getUTCDate`/`getUTCHours`/`toISOString().slice(0,10)`. Helpers: `hojeYMD`, `meiaNoiteUTC`, `hojeUTC` em `@/lib/tempo`.

**Gates antes de cada commit (na `main`):**
- `npx tsc --noEmit` limpo
- `npm run test` (vitest) verde

---

## File Structure

**Lógica pura (TDD) — `src/lib/calendario/`:**
- `abas.ts` — lista de abas + resolução da aba ativa a partir da query.
- `mes.ts` — grade de 42 dias, parsing de `ref` "YYYY-MM", navegação de mês, agrupamento de marcadores por dia. Define o tipo `Marcador`.
- `gantt.ts` — monta linhas (1 por vestido) e barras posicionadas em % a partir de `EventoAgenda[]`.
- `semana.ts` — início da semana, 7 dias, parsing de `ref` "YYYY-MM-DD", indexação por célula (dia×hora).
- `dados.ts` — leituras Prisma do calendário: `marcadoresNoIntervalo` e `atendimentosNoIntervalo`.

**UI — rota `src/app/(app)/loja/[lojaId]/calendario/`:**
- `page.tsx` — casca: gate, abas, despacho para a aba ativa.
- `_abas/AbaMes.tsx` — grade mensal com marcadores.
- `_abas/AbaVestidos.tsx` — timeline Gantt.
- `_abas/AbaAtendimentos.tsx` — grade semana × hora.
- `_abas/AbaProvasAjustes.tsx` — fila consolidada (read-only) com links para `/provas` e `/ajustes`.

**Modificações:**
- `src/app/(app)/loja/[lojaId]/agenda/page.tsx` — vira redirect para `/calendario`.
- `src/components/layout/nav-items.ts` — `href` do link "Calendário": `/agenda` → `/calendario`.

> Pastas com prefixo `_` (ex.: `_abas`) não geram rotas no App Router — servem para colocar componentes junto da página.

---

## Task 1: Casca da página, abas, rota e navegação

**Files:**
- Create: `src/lib/calendario/abas.ts`
- Test: `src/lib/calendario/__tests__/abas.test.ts`
- Create: `src/app/(app)/loja/[lojaId]/calendario/page.tsx`
- Create: `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaMes.tsx` (placeholder)
- Create: `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaVestidos.tsx` (placeholder)
- Create: `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaAtendimentos.tsx` (placeholder)
- Create: `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaProvasAjustes.tsx` (placeholder)
- Modify: `src/app/(app)/loja/[lojaId]/agenda/page.tsx`
- Modify: `src/components/layout/nav-items.ts:53`

- [ ] **Step 1: Escrever o teste de `resolverAba` (falha)**

`src/lib/calendario/__tests__/abas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ABAS, resolverAba } from "@/lib/calendario/abas";

describe("resolverAba", () => {
  it("sem aba na query → 'mes' (padrão)", () => {
    expect(resolverAba(undefined)).toBe("mes");
  });
  it("aba conhecida é preservada", () => {
    expect(resolverAba("vestidos")).toBe("vestidos");
    expect(resolverAba("atendimentos")).toBe("atendimentos");
    expect(resolverAba("provas-ajustes")).toBe("provas-ajustes");
  });
  it("aba desconhecida → 'mes'", () => {
    expect(resolverAba("xpto")).toBe("mes");
  });
  it("expõe as 4 abas na ordem certa", () => {
    expect(ABAS.map((a) => a.id)).toEqual(["mes", "vestidos", "atendimentos", "provas-ajustes"]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `npx vitest run src/lib/calendario/__tests__/abas.test.ts`
Expected: FAIL — `Cannot find module '@/lib/calendario/abas'`.

- [ ] **Step 3: Implementar `abas.ts`**

`src/lib/calendario/abas.ts`:

```ts
// src/lib/calendario/abas.ts
// As abas do Calendário, num lugar só (PURO). A aba ativa vem da query (?aba=);
// valor ausente/desconhecido cai no padrão "mes". Sem isto espalhado pela UI.

export const ABAS = [
  { id: "mes", label: "Mês" },
  { id: "vestidos", label: "Vestidos fora" },
  { id: "atendimentos", label: "Atendimentos" },
  { id: "provas-ajustes", label: "Provas & ajustes" },
] as const;

export type AbaId = (typeof ABAS)[number]["id"];

/** Resolve a aba ativa a partir do valor cru da query. Desconhecido → "mes". */
export function resolverAba(raw: string | undefined): AbaId {
  return ABAS.some((a) => a.id === raw) ? (raw as AbaId) : "mes";
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/calendario/__tests__/abas.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Criar os 4 componentes de aba como placeholders**

Cada um recebe `lojaId` e o `refParam` cru (NÃO chamar o prop de `ref` — `ref` é reservado no React).

`src/app/(app)/loja/[lojaId]/calendario/_abas/AbaMes.tsx`:

```tsx
// Aba Mês — grade mensal com marcadores. (Conteúdo real na Task 2.)
export async function AbaMes({ lojaId, refParam }: { lojaId: string; refParam?: string }) {
  void lojaId;
  void refParam;
  return <p className="text-[14px] text-cinza-fumo">Grade do mês em breve.</p>;
}
```

`src/app/(app)/loja/[lojaId]/calendario/_abas/AbaVestidos.tsx`:

```tsx
// Aba Vestidos fora — timeline Gantt. (Conteúdo real na Task 3.)
export async function AbaVestidos({ lojaId }: { lojaId: string }) {
  void lojaId;
  return <p className="text-[14px] text-cinza-fumo">Timeline dos vestidos em breve.</p>;
}
```

`src/app/(app)/loja/[lojaId]/calendario/_abas/AbaAtendimentos.tsx`:

```tsx
// Aba Atendimentos — grade semana × hora. (Conteúdo real na Task 4.)
export async function AbaAtendimentos({ lojaId, refParam }: { lojaId: string; refParam?: string }) {
  void lojaId;
  void refParam;
  return <p className="text-[14px] text-cinza-fumo">Semana de atendimentos em breve.</p>;
}
```

`src/app/(app)/loja/[lojaId]/calendario/_abas/AbaProvasAjustes.tsx`:

```tsx
// Aba Provas & ajustes — fila consolidada. (Conteúdo real na Task 5.)
export async function AbaProvasAjustes({ lojaId }: { lojaId: string }) {
  void lojaId;
  return <p className="text-[14px] text-cinza-fumo">Provas e ajustes em breve.</p>;
}
```

- [ ] **Step 6: Criar a casca `page.tsx`**

`src/app/(app)/loja/[lojaId]/calendario/page.tsx`:

```tsx
// src/app/(app)/loja/[lojaId]/calendario/page.tsx
// Calendário do atelier — quatro vistas da mesma operação, em abas. A aba ativa
// vive na URL (?aba=) para dar link direto e sobreviver ao recarregar. Gate em
// leads:ver (mesma porta da antiga Agenda). Cada aba é um Server Component próprio.
import Link from "next/link";
import { exigirAcesso } from "@/lib/server/acoes";
import { ABAS, resolverAba } from "@/lib/calendario/abas";
import { AbaMes } from "./_abas/AbaMes";
import { AbaVestidos } from "./_abas/AbaVestidos";
import { AbaAtendimentos } from "./_abas/AbaAtendimentos";
import { AbaProvasAjustes } from "./_abas/AbaProvasAjustes";

export const dynamic = "force-dynamic";

export default async function CalendarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ aba?: string; ref?: string }>;
}) {
  const sc = await exigirAcesso("leads");
  const { lojaId } = await params;
  const sp = await searchParams;
  const aba = resolverAba(sp.aba);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={`/loja/${lojaId}`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← {sc.loja.nome}
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Calendário</h1>
        <p className="text-[14px] text-cinza-fumo">A operação do atelier, em quatro vistas.</p>
      </header>

      {/* Abas: a ativa marcada por um traço bordô fino (a joia com intenção, §6). */}
      <nav className="flex gap-6 overflow-x-auto border-b border-borda-suave">
        {ABAS.map((a) => {
          const ativa = a.id === aba;
          return (
            <Link
              key={a.id}
              href={`/loja/${lojaId}/calendario?aba=${a.id}`}
              aria-current={ativa ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 pb-3 text-[14px] transition-colors duration-150 ${
                ativa
                  ? "border-bordo text-tinta"
                  : "border-transparent text-cinza-fumo hover:text-tinta"
              }`}
            >
              {a.label}
            </Link>
          );
        })}
      </nav>

      <section>
        {aba === "mes" && <AbaMes lojaId={lojaId} refParam={sp.ref} />}
        {aba === "vestidos" && <AbaVestidos lojaId={lojaId} />}
        {aba === "atendimentos" && <AbaAtendimentos lojaId={lojaId} refParam={sp.ref} />}
        {aba === "provas-ajustes" && <AbaProvasAjustes lojaId={lojaId} />}
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Transformar a antiga `/agenda` em redirect**

Substituir TODO o conteúdo de `src/app/(app)/loja/[lojaId]/agenda/page.tsx` por:

```tsx
// src/app/(app)/loja/[lojaId]/agenda/page.tsx
// A Agenda virou Calendário (4 abas). Mantemos a rota como redirect para não
// quebrar links antigos. Ver docs/superpowers/specs/2026-06-05-calendario-abas-design.md.
import { redirect } from "next/navigation";

export default async function AgendaRedirect({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params;
  redirect(`/loja/${lojaId}/calendario`);
}
```

- [ ] **Step 8: Apontar o link do menu para `/calendario`**

Em `src/components/layout/nav-items.ts:53`, trocar:

```ts
      { href: loja("/agenda"), label: "Calendário" },
```

por:

```ts
      { href: loja("/calendario"), label: "Calendário" },
```

- [ ] **Step 9: Rodar os gates**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run test`
Expected: toda a suíte verde (inclui `abas.test.ts`).

- [ ] **Step 10: Commit**

```bash
git add src/lib/calendario/abas.ts src/lib/calendario/__tests__/abas.test.ts \
  "src/app/(app)/loja/[lojaId]/calendario" \
  "src/app/(app)/loja/[lojaId]/agenda/page.tsx" \
  src/components/layout/nav-items.ts
git commit -m "feat(calendario): casca com 4 abas + rota /calendario (redirect de /agenda)"
```

---

## Task 2: Aba Mês (grade) — padrão

**Files:**
- Create: `src/lib/calendario/mes.ts`
- Test: `src/lib/calendario/__tests__/mes.test.ts`
- Create: `src/lib/calendario/dados.ts`
- Test: `src/lib/calendario/__tests__/dados.test.ts`
- Modify: `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaMes.tsx`

- [ ] **Step 1: Escrever o teste puro de `mes.ts` (falha)**

`src/lib/calendario/__tests__/mes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  gradeDoMes,
  mesDeRef,
  refDoMes,
  mesVizinho,
  agruparMarcadoresPorDia,
} from "@/lib/calendario/mes";

describe("gradeDoMes", () => {
  it("retorna 42 dias começando num domingo", () => {
    const dias = gradeDoMes(2026, 5, "2026-06-05"); // junho/2026
    expect(dias).toHaveLength(42);
    expect(dias[0].data.getUTCDay()).toBe(0); // domingo
  });
  it("marca o primeiro e o último dia do mês de referência", () => {
    const dias = gradeDoMes(2026, 5, "2026-06-05");
    const doMes = dias.filter((d) => d.noMes);
    expect(doMes[0].ymd).toBe("2026-06-01");
    expect(doMes[doMes.length - 1].ymd).toBe("2026-06-30");
  });
  it("sinaliza o dia de hoje", () => {
    const dias = gradeDoMes(2026, 5, "2026-06-05");
    expect(dias.filter((d) => d.hoje).map((d) => d.ymd)).toEqual(["2026-06-05"]);
  });
});

describe("mesDeRef / refDoMes / mesVizinho", () => {
  it("parseia 'YYYY-MM' válido", () => {
    expect(mesDeRef("2026-03", "2026-06-05")).toEqual({ ano: 2026, mes0: 2 });
  });
  it("ref ausente/inválida → mês de hoje", () => {
    expect(mesDeRef(undefined, "2026-06-05")).toEqual({ ano: 2026, mes0: 5 });
    expect(mesDeRef("2026-13", "2026-06-05")).toEqual({ ano: 2026, mes0: 5 });
    expect(mesDeRef("lixo", "2026-06-05")).toEqual({ ano: 2026, mes0: 5 });
  });
  it("refDoMes formata com mês 1-based e zero-pad", () => {
    expect(refDoMes(2026, 0)).toBe("2026-01");
    expect(refDoMes(2026, 11)).toBe("2026-12");
  });
  it("mesVizinho vira o ano nas bordas", () => {
    expect(mesVizinho(2026, 0, -1)).toEqual({ ano: 2025, mes0: 11 });
    expect(mesVizinho(2026, 11, +1)).toEqual({ ano: 2027, mes0: 0 });
  });
});

describe("agruparMarcadoresPorDia", () => {
  it("agrupa por ymd e deduplica tipos repetidos no mesmo dia", () => {
    const m = agruparMarcadoresPorDia([
      { ymd: "2026-06-02", tipo: "prova" },
      { ymd: "2026-06-02", tipo: "prova" },
      { ymd: "2026-06-02", tipo: "casamento" },
      { ymd: "2026-06-10", tipo: "atendimento" },
    ]);
    expect([...(m.get("2026-06-02") ?? [])].sort()).toEqual(["casamento", "prova"]);
    expect([...(m.get("2026-06-10") ?? [])]).toEqual(["atendimento"]);
    expect(m.has("2026-06-03")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run src/lib/calendario/__tests__/mes.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `mes.ts`**

`src/lib/calendario/mes.ts`:

```ts
// src/lib/calendario/mes.ts
// Matemática pura da grade mensal (sem Prisma). Tudo em UTC — o dia-calendário do
// sistema é meia-noite UTC do dia em São Paulo (ver @/lib/tempo). A grade tem 42
// células (6 semanas × 7), começando no domingo da semana do dia 1: assim cada mês
// cabe inteiro e os dias "vazantes" dos meses vizinhos preenchem as bordas.

export type TipoMarcador = "casamento" | "prova" | "atendimento";
export type Marcador = { ymd: string; tipo: TipoMarcador };

export type DiaGrade = {
  data: Date; // meia-noite UTC
  ymd: string; // "YYYY-MM-DD"
  noMes: boolean; // pertence ao mês de referência
  hoje: boolean;
};

/** 42 dias (6×7) da grade do mês (ano, mes0 0-based), com hoje sinalizado. */
export function gradeDoMes(ano: number, mes0: number, hojeYMD: string): DiaGrade[] {
  const primeiro = new Date(Date.UTC(ano, mes0, 1));
  const inicio = new Date(primeiro.getTime());
  inicio.setUTCDate(1 - primeiro.getUTCDay()); // recua até o domingo
  const dias: DiaGrade[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio.getTime());
    d.setUTCDate(inicio.getUTCDate() + i);
    const ymd = d.toISOString().slice(0, 10);
    dias.push({ data: d, ymd, noMes: d.getUTCMonth() === mes0, hoje: ymd === hojeYMD });
  }
  return dias;
}

/** "YYYY-MM" → {ano, mes0}. Ausente/ inválido → mês de hoje. */
export function mesDeRef(ref: string | undefined, hojeYMD: string): { ano: number; mes0: number } {
  const m = ref ? /^(\d{4})-(\d{2})$/.exec(ref) : null;
  if (m) {
    const ano = Number(m[1]);
    const mes = Number(m[2]);
    if (mes >= 1 && mes <= 12) return { ano, mes0: mes - 1 };
  }
  const [a, mm] = hojeYMD.split("-");
  return { ano: Number(a), mes0: Number(mm) - 1 };
}

/** {ano, mes0} → "YYYY-MM" (mês 1-based, zero-pad). */
export function refDoMes(ano: number, mes0: number): string {
  return `${ano}-${String(mes0 + 1).padStart(2, "0")}`;
}

/** Mês vizinho (delta em meses), virando o ano nas bordas. */
export function mesVizinho(ano: number, mes0: number, delta: number): { ano: number; mes0: number } {
  const d = new Date(Date.UTC(ano, mes0 + delta, 1));
  return { ano: d.getUTCFullYear(), mes0: d.getUTCMonth() };
}

/** Agrupa marcadores por dia; tipos repetidos no mesmo dia colapsam (Set). */
export function agruparMarcadoresPorDia(marcadores: Marcador[]): Map<string, Set<TipoMarcador>> {
  const mapa = new Map<string, Set<TipoMarcador>>();
  for (const mk of marcadores) {
    let set = mapa.get(mk.ymd);
    if (!set) {
      set = new Set<TipoMarcador>();
      mapa.set(mk.ymd, set);
    }
    set.add(mk.tipo);
  }
  return mapa;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/calendario/__tests__/mes.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever o teste de integração de `marcadoresNoIntervalo` (falha)**

Espelha `src/lib/disponibilidade/__tests__/agenda.test.ts` (cria loja/vestido/noiva, reserva, registra prova). Prova a derivação dos marcadores de casamento e prova no intervalo.

`src/lib/calendario/__tests__/dados.test.ts`:

```ts
// Integração: marcadores do calendário derivam das reservas e provas da loja.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { reservarVestido } from "@/lib/disponibilidade/reservas";
import { registrarProva } from "@/lib/atelier/provas";
import { marcadoresNoIntervalo } from "@/lib/calendario/dados";

const MARK = "t-cal-dados-";
let loja = "";
let vestido = "";
let noiva = "";

// Casamento ~20 dias à frente do dia-calendário em SP.
const ymdHoje = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const casamento = new Date(`${ymdHoje}T00:00:00.000Z`);
casamento.setUTCDate(casamento.getUTCDate() + 20);
const casamentoDia = casamento.toISOString().slice(0, 10);

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  vestido = (await db.vestido.create({ data: { codigo: `${MARK}v`, nome: `${MARK}Vestido`, precoBase: 1000 } as never })).id;
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Noiva`, etapa: "NOVO" } as never })).id;
  const r = await reservarVestido(loja, { vestidoId: vestido, leadId: noiva, casamentoData: casamentoDia });
  expect(r.ok).toBe(true);
  if (r.ok) {
    const p = await registrarProva(loja, { bloqueioId: r.bloqueioId, dataReal: casamentoDia, tipo: "PRIMEIRA" });
    expect(p.ok).toBe(true);
  }
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
});

describe("marcadoresNoIntervalo", () => {
  it("inclui casamento e prova que caem no intervalo", async () => {
    const inicio = new Date(`${ymdHoje}T00:00:00.000Z`);
    const fim = new Date(casamento.getTime());
    fim.setUTCDate(fim.getUTCDate() + 1); // intervalo [hoje, casamento+1)
    const marcadores = await marcadoresNoIntervalo(loja, inicio, fim);
    const tipos = marcadores.filter((m) => m.ymd === casamentoDia).map((m) => m.tipo);
    expect(tipos).toContain("casamento");
    expect(tipos).toContain("prova");
  });
  it("não inclui nada fora do intervalo", async () => {
    const inicio = new Date(`${ymdHoje}T00:00:00.000Z`);
    const fim = new Date(`${ymdHoje}T00:00:00.000Z`);
    fim.setUTCDate(fim.getUTCDate() + 1); // só hoje
    const marcadores = await marcadoresNoIntervalo(loja, inicio, fim);
    expect(marcadores.some((m) => m.ymd === casamentoDia)).toBe(false);
  });
});
```

> Nota de cobertura: o tipo `"atendimento"` do reader é validado por tipos (tsc) e pela inspeção manual da aba; criar um `Atendimento` exige cabine + vendedora (setup pesado) e fica fora deste teste — o caminho de query é idêntico ao dos outros dois.

- [ ] **Step 6: Rodar e confirmar a falha**

Run: `npx vitest run src/lib/calendario/__tests__/dados.test.ts`
Expected: FAIL — `marcadoresNoIntervalo` inexistente.

- [ ] **Step 7: Implementar `dados.ts` (parte 1: marcadores)**

`src/lib/calendario/dados.ts`:

```ts
// src/lib/calendario/dados.ts
// Leituras Prisma do calendário (escopo de loja via tenantPrisma). Reúne, num
// intervalo [inicio, fim), os pontos que viram marcadores na grade do mês:
// casamentos (BloqueioVestido.casamentoData), provas (Prova.dataReal) e
// atendimentos (Atendimento.inicio). Datas saem como "YYYY-MM-DD" (UTC).
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import type { Marcador } from "./mes";

const ymdUTC = (d: Date): string => d.toISOString().slice(0, 10);

/** Marcadores (casamento/prova/atendimento) com data em [inicio, fim). */
export async function marcadoresNoIntervalo(
  lojaId: string,
  inicio: Date,
  fim: Date,
): Promise<Marcador[]> {
  const db = tenantPrisma(prisma, lojaId);
  const [casamentos, provas, atendimentos] = await Promise.all([
    db.bloqueioVestido.findMany({
      where: { casamentoData: { gte: inicio, lt: fim } },
      select: { casamentoData: true },
    }),
    db.prova.findMany({
      where: { dataReal: { gte: inicio, lt: fim } },
      select: { dataReal: true },
    }),
    db.atendimento.findMany({
      where: { inicio: { gte: inicio, lt: fim } },
      select: { inicio: true },
    }),
  ]);

  const marcadores: Marcador[] = [];
  for (const c of casamentos) {
    if (c.casamentoData) marcadores.push({ ymd: ymdUTC(c.casamentoData), tipo: "casamento" });
  }
  for (const p of provas) marcadores.push({ ymd: ymdUTC(p.dataReal), tipo: "prova" });
  for (const a of atendimentos) marcadores.push({ ymd: ymdUTC(a.inicio), tipo: "atendimento" });
  return marcadores;
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/calendario/__tests__/dados.test.ts`
Expected: PASS.

- [ ] **Step 9: Implementar o componente `AbaMes`**

Substituir TODO o conteúdo de `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaMes.tsx`:

```tsx
// Aba Mês — a grade do mês de relance. Cada dia traz marcadores delicados (um ponto
// por tipo): bordô = casamento (o grande dia, §6), champagne = prova, grafite =
// atendimento. Navegação ‹ mês › preserva a aba na URL.
import Link from "next/link";
import { hojeYMD } from "@/lib/tempo";
import {
  gradeDoMes,
  mesDeRef,
  refDoMes,
  mesVizinho,
  agruparMarcadoresPorDia,
  type TipoMarcador,
} from "@/lib/calendario/mes";
import { marcadoresNoIntervalo } from "@/lib/calendario/dados";

const tituloMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const COR_MARCADOR: Record<TipoMarcador, string> = {
  casamento: "bg-bordo",
  prova: "bg-champagne",
  atendimento: "bg-grafite",
};
const ORDEM_MARCADOR: TipoMarcador[] = ["casamento", "prova", "atendimento"];

export async function AbaMes({ lojaId, refParam }: { lojaId: string; refParam?: string }) {
  const hoje = hojeYMD();
  const { ano, mes0 } = mesDeRef(refParam, hoje);
  const dias = gradeDoMes(ano, mes0, hoje);

  const inicio = dias[0].data;
  const fim = new Date(dias[41].data.getTime());
  fim.setUTCDate(fim.getUTCDate() + 1); // exclusivo

  const marcadores = await marcadoresNoIntervalo(lojaId, inicio, fim);
  const porDia = agruparMarcadoresPorDia(marcadores);

  const ant = mesVizinho(ano, mes0, -1);
  const prox = mesVizinho(ano, mes0, +1);
  const link = (a: { ano: number; mes0: number }) =>
    `/loja/${lojaId}/calendario?aba=mes&ref=${refDoMes(a.ano, a.mes0)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-light capitalize text-tinta">
          {tituloMes.format(dias.find((d) => d.noMes)!.data)}
        </h2>
        <div className="flex items-center gap-1">
          <Link
            href={link(ant)}
            aria-label="Mês anterior"
            className="rounded-md px-2 py-1 text-[14px] text-grafite transition-colors duration-150 hover:bg-papel-suave hover:text-tinta"
          >
            ‹
          </Link>
          <Link
            href={link(prox)}
            aria-label="Próximo mês"
            className="rounded-md px-2 py-1 text-[14px] text-grafite transition-colors duration-150 hover:bg-papel-suave hover:text-tinta"
          >
            ›
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[var(--mn-radius-md)] border border-borda-suave bg-borda-suave">
        {SEMANA.map((d) => (
          <div key={d} className="bg-papel-elevado py-2 text-center text-[11px] uppercase tracking-[0.1em] text-cinza-fumo">
            {d}
          </div>
        ))}
        {dias.map((dia) => {
          const tipos = porDia.get(dia.ymd);
          return (
            <div
              key={dia.ymd}
              className={`flex min-h-20 flex-col gap-1 bg-papel-elevado p-1.5 ${dia.noMes ? "" : "opacity-40"}`}
            >
              <span
                className={`text-[12px] tabular-nums ${
                  dia.hoje
                    ? "flex h-5 w-5 items-center justify-center rounded-full bg-bordo text-papel-elevado"
                    : "text-grafite"
                }`}
              >
                {dia.data.getUTCDate()}
              </span>
              {tipos && (
                <span className="mt-auto flex flex-wrap gap-1">
                  {ORDEM_MARCADOR.filter((t) => tipos.has(t)).map((t) => (
                    <span key={t} className={`h-1.5 w-1.5 rounded-full ${COR_MARCADOR[t]}`} />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-cinza-fumo">
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-bordo" /> Casamento</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-champagne" /> Prova</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-grafite" /> Atendimento</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Rodar os gates**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run test`
Expected: tudo verde.

- [ ] **Step 11: Commit**

```bash
git add src/lib/calendario/mes.ts src/lib/calendario/dados.ts \
  src/lib/calendario/__tests__/mes.test.ts src/lib/calendario/__tests__/dados.test.ts \
  "src/app/(app)/loja/[lojaId]/calendario/_abas/AbaMes.tsx"
git commit -m "feat(calendario): aba Mês — grade com marcadores (casamento/prova/atendimento)"
```

---

## Task 3: Aba Vestidos fora (Gantt)

**Files:**
- Create: `src/lib/calendario/gantt.ts`
- Test: `src/lib/calendario/__tests__/gantt.test.ts`
- Modify: `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaVestidos.tsx`

- [ ] **Step 1: Escrever o teste puro de `gantt.ts` (falha)**

`src/lib/calendario/__tests__/gantt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { montarGantt } from "@/lib/calendario/gantt";
import type { EventoAgenda } from "@/lib/disponibilidade/agenda";

const ev = (over: Partial<EventoAgenda>): EventoAgenda => ({
  tipo: "uso",
  rotulo: "Uso / casamento",
  inicio: new Date("2026-06-11T00:00:00.000Z"),
  fim: new Date("2026-06-13T00:00:00.000Z"),
  abertoFim: false,
  vestidoId: "v1",
  vestidoNome: "Aurora",
  vestidoCodigo: "A-01",
  noivaNome: "Bia",
  ...over,
});

const janelaInicio = new Date("2026-06-01T00:00:00.000Z");

describe("montarGantt", () => {
  it("agrupa barras por vestido (uma linha por vestido)", () => {
    const linhas = montarGantt(
      [
        ev({ tipo: "preparacao", inicio: new Date("2026-06-03T00:00:00.000Z"), fim: new Date("2026-06-05T00:00:00.000Z") }),
        ev({ tipo: "uso", inicio: new Date("2026-06-11T00:00:00.000Z"), fim: new Date("2026-06-13T00:00:00.000Z") }),
      ],
      janelaInicio,
      30,
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0].vestidoId).toBe("v1");
    expect(linhas[0].barras).toHaveLength(2);
  });

  it("posiciona a barra em % do início da janela (30 dias)", () => {
    const [linha] = montarGantt(
      [ev({ tipo: "uso", inicio: new Date("2026-06-11T00:00:00.000Z"), fim: new Date("2026-06-13T00:00:00.000Z") })],
      janelaInicio,
      30,
    );
    const b = linha.barras[0];
    expect(b.inicioPct).toBeCloseTo((10 / 30) * 100, 5); // dia 11 = +10 dias
    expect(b.larguraPct).toBeCloseTo((2 / 30) * 100, 5); // 11→13 = 2 dias
  });

  it("barra abertoFim vai até o fim da janela (100%)", () => {
    const [linha] = montarGantt(
      [ev({ abertoFim: true, inicio: new Date("2026-06-16T00:00:00.000Z"), fim: new Date("9999-12-31T00:00:00.000Z") })],
      janelaInicio,
      30,
    );
    const b = linha.barras[0];
    expect(b.inicioPct).toBeCloseTo((15 / 30) * 100, 5);
    expect(b.inicioPct + b.larguraPct).toBeCloseTo(100, 5);
    expect(b.abertoFim).toBe(true);
  });

  it("recorta nas bordas (não passa de 0% nem de 100%)", () => {
    const [linha] = montarGantt(
      [ev({ inicio: new Date("2026-05-20T00:00:00.000Z"), fim: new Date("2026-07-20T00:00:00.000Z") })],
      janelaInicio,
      30,
    );
    const b = linha.barras[0];
    expect(b.inicioPct).toBe(0);
    expect(b.inicioPct + b.larguraPct).toBeCloseTo(100, 5);
  });

  it("ordena as linhas pela barra mais à esquerda", () => {
    const linhas = montarGantt(
      [
        ev({ vestidoId: "v2", inicio: new Date("2026-06-20T00:00:00.000Z"), fim: new Date("2026-06-22T00:00:00.000Z") }),
        ev({ vestidoId: "v1", inicio: new Date("2026-06-03T00:00:00.000Z"), fim: new Date("2026-06-05T00:00:00.000Z") }),
      ],
      janelaInicio,
      30,
    );
    expect(linhas.map((l) => l.vestidoId)).toEqual(["v1", "v2"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run src/lib/calendario/__tests__/gantt.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `gantt.ts`**

`src/lib/calendario/gantt.ts`:

```ts
// src/lib/calendario/gantt.ts
// Layout PURO da timeline de vestidos (sem Prisma). Recebe os eventos da agenda
// (EventoAgenda, derivados das reservas) e os converte em linhas — uma por vestido —
// com barras posicionadas em PORCENTAGEM da janela [janelaInicio, +janelaDias).
// Barras "abertoFim" (vestido fora por tempo indeterminado) vão até o fim da janela.
import type { EventoAgenda } from "@/lib/disponibilidade/agenda";
import type { TipoJanela } from "@/lib/disponibilidade/tipos";

const DIA_MS = 86_400_000;
const clampPct = (n: number) => Math.max(0, Math.min(100, n));

export type BarraGantt = {
  tipo: TipoJanela;
  rotulo: string;
  inicioPct: number;
  larguraPct: number;
  abertoFim: boolean;
};

export type LinhaGantt = {
  vestidoId: string;
  vestidoCodigo: string;
  vestidoNome: string;
  noivaNome: string | null;
  barras: BarraGantt[];
};

/** Monta as linhas (1 por vestido) com barras em % da janela. Linhas ordenadas
 *  pela barra mais à esquerda; barras de cada linha por início. */
export function montarGantt(
  eventos: EventoAgenda[],
  janelaInicio: Date,
  janelaDias: number,
): LinhaGantt[] {
  const base = janelaInicio.getTime();
  const porVestido = new Map<string, LinhaGantt>();

  for (const e of eventos) {
    const iDias = (e.inicio.getTime() - base) / DIA_MS;
    const fDias = (e.fim.getTime() - base) / DIA_MS;
    const inicioPct = clampPct((iDias / janelaDias) * 100);
    const fimPct = e.abertoFim ? 100 : clampPct((fDias / janelaDias) * 100);
    const larguraPct = Math.max(1, fimPct - inicioPct); // mínimo visível

    let linha = porVestido.get(e.vestidoId);
    if (!linha) {
      linha = {
        vestidoId: e.vestidoId,
        vestidoCodigo: e.vestidoCodigo,
        vestidoNome: e.vestidoNome,
        noivaNome: e.noivaNome,
        barras: [],
      };
      porVestido.set(e.vestidoId, linha);
    }
    linha.barras.push({ tipo: e.tipo, rotulo: e.rotulo, inicioPct, larguraPct, abertoFim: e.abertoFim });
  }

  const linhas = [...porVestido.values()];
  for (const l of linhas) l.barras.sort((a, b) => a.inicioPct - b.inicioPct);
  linhas.sort((a, b) => (a.barras[0]?.inicioPct ?? 0) - (b.barras[0]?.inicioPct ?? 0));
  return linhas;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/calendario/__tests__/gantt.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementar o componente `AbaVestidos`**

Substituir TODO o conteúdo de `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaVestidos.tsx`:

```tsx
// Aba Vestidos fora — a timeline do acervo: uma linha por vestido, barras mostrando
// quando cada peça está fora (preparação → uso → higienização → manutenção) nos
// próximos 60 dias. Bordô reservado ao uso/casamento. Dado pronto via agendaDoAtelier.
import Link from "next/link";
import { hojeUTC } from "@/lib/tempo";
import { agendaDoAtelier } from "@/lib/disponibilidade/agenda";
import { montarGantt, type BarraGantt } from "@/lib/calendario/gantt";
import type { TipoJanela } from "@/lib/disponibilidade/tipos";

const HORIZONTE_DIAS = 60;

const COR_BARRA: Record<TipoJanela, string> = {
  preparacao: "bg-rose-dust",
  uso: "bg-bordo",
  lavagem: "bg-champagne",
  manutencao: "bg-grafite/40",
};

function tituloBarra(b: BarraGantt): string {
  return b.abertoFim ? `${b.rotulo} (em aberto)` : b.rotulo;
}

export async function AbaVestidos({ lojaId }: { lojaId: string }) {
  const eventos = await agendaDoAtelier(lojaId, HORIZONTE_DIAS);
  const linhas = montarGantt(eventos, hojeUTC(), HORIZONTE_DIAS);

  if (linhas.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[15px] text-tinta">Nenhum vestido fora nos próximos {HORIZONTE_DIAS} dias.</p>
        <p className="max-w-[46ch] text-[13px] text-cinza-fumo">
          Quando uma noiva reservar um vestido, o tempo em que a peça fica fora aparece aqui, em faixas.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-cinza-fumo">Próximos {HORIZONTE_DIAS} dias · cada faixa é o tempo que a peça fica fora.</p>

      <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
        {linhas.map((l) => (
          <li key={l.vestidoId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <Link
              href={`/loja/${lojaId}/vestidos/${l.vestidoId}`}
              className="w-full shrink-0 rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne sm:w-44"
            >
              {l.vestidoCodigo} · {l.vestidoNome}
              {l.noivaNome && <span className="block text-[12px] text-cinza-fumo no-underline">{l.noivaNome}</span>}
            </Link>
            <div className="relative h-6 flex-1 rounded-full bg-papel-suave">
              {l.barras.map((b, i) => (
                <span
                  key={i}
                  title={tituloBarra(b)}
                  className={`absolute top-1 bottom-1 rounded-full ${COR_BARRA[b.tipo]}`}
                  style={{ left: `${b.inicioPct}%`, width: `${b.larguraPct}%` }}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-cinza-fumo">
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full bg-rose-dust" /> Preparação</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full bg-bordo" /> Uso / casamento</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full bg-champagne" /> Higienização</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full bg-grafite/40" /> Manutenção</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Rodar os gates**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run test`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/calendario/gantt.ts src/lib/calendario/__tests__/gantt.test.ts \
  "src/app/(app)/loja/[lojaId]/calendario/_abas/AbaVestidos.tsx"
git commit -m "feat(calendario): aba Vestidos fora — timeline Gantt do acervo"
```

---

## Task 4: Aba Atendimentos (semana)

**Files:**
- Create: `src/lib/calendario/semana.ts`
- Test: `src/lib/calendario/__tests__/semana.test.ts`
- Modify: `src/lib/calendario/dados.ts` (adicionar `atendimentosNoIntervalo`)
- Modify: `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaAtendimentos.tsx`

- [ ] **Step 1: Escrever o teste puro de `semana.ts` (falha)**

`src/lib/calendario/__tests__/semana.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  inicioDaSemana,
  diasDaSemana,
  semanaDeRef,
  chaveCelula,
  indexarPorCelula,
  refDaSemana,
} from "@/lib/calendario/semana";

describe("inicioDaSemana / diasDaSemana", () => {
  it("recua até o domingo da semana", () => {
    const ini = inicioDaSemana(new Date("2026-06-03T15:00:00.000Z")); // quarta
    expect(ini.toISOString().slice(0, 10)).toBe("2026-05-31"); // domingo
    expect(ini.getUTCHours()).toBe(0);
  });
  it("gera 7 dias consecutivos a partir do domingo", () => {
    const dias = diasDaSemana(new Date("2026-06-03T00:00:00.000Z"));
    expect(dias).toHaveLength(7);
    expect(dias[0].getUTCDay()).toBe(0);
    expect(dias.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-05-31", "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06",
    ]);
  });
});

describe("semanaDeRef / refDaSemana", () => {
  it("ref 'YYYY-MM-DD' válida → domingo daquela semana", () => {
    expect(semanaDeRef("2026-06-03", "2026-01-01").toISOString().slice(0, 10)).toBe("2026-05-31");
  });
  it("ref ausente/inválida → semana de hoje", () => {
    expect(semanaDeRef(undefined, "2026-06-03").toISOString().slice(0, 10)).toBe("2026-05-31");
    expect(semanaDeRef("lixo", "2026-06-03").toISOString().slice(0, 10)).toBe("2026-05-31");
  });
  it("refDaSemana devolve o YMD do dia dado", () => {
    expect(refDaSemana(new Date("2026-06-07T00:00:00.000Z"))).toBe("2026-06-07");
  });
});

describe("indexarPorCelula", () => {
  it("agrupa por dia×hora (UTC)", () => {
    const itens = [
      { id: "a", inicio: new Date("2026-06-03T10:00:00.000Z") },
      { id: "b", inicio: new Date("2026-06-03T10:00:00.000Z") },
      { id: "c", inicio: new Date("2026-06-04T14:00:00.000Z") },
    ];
    const idx = indexarPorCelula(itens);
    expect(idx.get(chaveCelula("2026-06-03", 10))!.map((x) => x.id)).toEqual(["a", "b"]);
    expect(idx.get(chaveCelula("2026-06-04", 14))!.map((x) => x.id)).toEqual(["c"]);
    expect(idx.has(chaveCelula("2026-06-03", 9))).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run src/lib/calendario/__tests__/semana.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `semana.ts`**

`src/lib/calendario/semana.ts`:

```ts
// src/lib/calendario/semana.ts
// Matemática pura da semana (sem Prisma). A semana começa no DOMINGO (consistente
// com a grade do mês). atendimento.inicio é wall-clock UTC (hora cheia), então o
// dia e a hora saem de getUTC* — sem conversão de fuso.

const chaveYMD = (d: Date): string => d.toISOString().slice(0, 10);

/** Domingo (00:00 UTC) da semana que contém refUTC. */
export function inicioDaSemana(refUTC: Date): Date {
  const d = new Date(refUTC.getTime());
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

/** Os 7 dias (domingo→sábado, 00:00 UTC) da semana de refUTC. */
export function diasDaSemana(refUTC: Date): Date[] {
  const ini = inicioDaSemana(refUTC);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ini.getTime());
    d.setUTCDate(ini.getUTCDate() + i);
    return d;
  });
}

/** "YYYY-MM-DD" → domingo daquela semana. Ausente/inválido → semana de hoje. */
export function semanaDeRef(ref: string | undefined, hojeYMD: string): Date {
  const base = ref && /^\d{4}-\d{2}-\d{2}$/.test(ref) ? ref : hojeYMD;
  return inicioDaSemana(new Date(`${base}T00:00:00.000Z`));
}

/** YMD de uma data (para montar o ?ref= de navegação). */
export function refDaSemana(d: Date): string {
  return chaveYMD(d);
}

/** Chave de célula da grade: "YMD|hora". */
export function chaveCelula(ymd: string, hora: number): string {
  return `${ymd}|${hora}`;
}

/** Indexa itens por célula (dia×hora) a partir de item.inicio (UTC). */
export function indexarPorCelula<T extends { inicio: Date }>(itens: T[]): Map<string, T[]> {
  const idx = new Map<string, T[]>();
  for (const it of itens) {
    const k = chaveCelula(chaveYMD(it.inicio), it.inicio.getUTCHours());
    const atual = idx.get(k);
    if (atual) atual.push(it);
    else idx.set(k, [it]);
  }
  return idx;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/calendario/__tests__/semana.test.ts`
Expected: PASS.

- [ ] **Step 5: Adicionar `atendimentosNoIntervalo` ao `dados.ts`**

Acrescentar ao FIM de `src/lib/calendario/dados.ts` (e ao import de tipos no topo, ver abaixo):

No topo do arquivo, ajustar o import de tipos para incluir `AtendimentoSituacao`:

```ts
import type { AtendimentoSituacao } from "@/generated/prisma/client";
```

No fim do arquivo:

```ts
export type AtendimentoCalendario = {
  id: string;
  inicio: Date;
  situacao: AtendimentoSituacao;
  noivaNome: string | null;
  leadId: string;
};

/** Atendimentos da loja com início em [inicio, fim), por horário asc. */
export async function atendimentosNoIntervalo(
  lojaId: string,
  inicio: Date,
  fim: Date,
): Promise<AtendimentoCalendario[]> {
  const rows = await tenantPrisma(prisma, lojaId).atendimento.findMany({
    where: { inicio: { gte: inicio, lt: fim } },
    orderBy: { inicio: "asc" },
    include: { lead: { select: { noivaNome: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    situacao: a.situacao,
    noivaNome: a.lead?.noivaNome ?? null,
    leadId: a.leadId,
  }));
}
```

- [ ] **Step 6: Implementar o componente `AbaAtendimentos`**

Substituir TODO o conteúdo de `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaAtendimentos.tsx`:

```tsx
// Aba Atendimentos — a semana de consultas: colunas de dia × linhas de hora, blocos
// de 60min. Cada bloco mostra a noiva; cor por situação (bordô só no agendado, foco
// do dia). Navegação ‹ semana › preserva a aba na URL.
import Link from "next/link";
import { hojeYMD } from "@/lib/tempo";
import {
  diasDaSemana,
  semanaDeRef,
  refDaSemana,
  chaveCelula,
  indexarPorCelula,
} from "@/lib/calendario/semana";
import { atendimentosNoIntervalo, type AtendimentoCalendario } from "@/lib/calendario/dados";
import type { AtendimentoSituacao } from "@/generated/prisma/client";

const HORA_INICIO = 9;
const HORA_FIM = 19; // exclusivo
const HORAS = Array.from({ length: HORA_FIM - HORA_INICIO }, (_, i) => HORA_INICIO + i);
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

const COR_SITUACAO: Record<AtendimentoSituacao, string> = {
  AGENDADO: "bg-bordo text-papel-elevado",
  EM_ATENDIMENTO: "bg-rose-dust text-tinta",
  CONCLUIDO: "bg-papel-suave text-grafite",
  FALTOU: "bg-papel-suave text-cinza-fumo line-through",
};

export async function AbaAtendimentos({ lojaId, refParam }: { lojaId: string; refParam?: string }) {
  const hoje = hojeYMD();
  const inicioSemana = semanaDeRef(refParam, hoje);
  const dias = diasDaSemana(inicioSemana);

  const fim = new Date(dias[6].getTime());
  fim.setUTCDate(fim.getUTCDate() + 1); // exclusivo (fim do sábado)

  const atendimentos = await atendimentosNoIntervalo(lojaId, inicioSemana, fim);
  const porCelula = indexarPorCelula<AtendimentoCalendario>(atendimentos);

  const anterior = new Date(inicioSemana.getTime());
  anterior.setUTCDate(anterior.getUTCDate() - 7);
  const proxima = new Date(inicioSemana.getTime());
  proxima.setUTCDate(proxima.getUTCDate() + 7);
  const link = (d: Date) => `/loja/${lojaId}/calendario?aba=atendimentos&ref=${refDaSemana(d)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-light text-tinta">
          {diaMes.format(dias[0])} – {diaMes.format(dias[6])}
        </h2>
        <div className="flex items-center gap-1">
          <Link href={link(anterior)} aria-label="Semana anterior" className="rounded-md px-2 py-1 text-[14px] text-grafite transition-colors duration-150 hover:bg-papel-suave hover:text-tinta">‹</Link>
          <Link href={link(proxima)} aria-label="Próxima semana" className="rounded-md px-2 py-1 text-[14px] text-grafite transition-colors duration-150 hover:bg-papel-suave hover:text-tinta">›</Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-[48px_repeat(7,1fr)] gap-px rounded-[var(--mn-radius-md)] border border-borda-suave bg-borda-suave">
          {/* cabeçalho */}
          <div className="bg-papel-elevado" />
          {dias.map((d, i) => (
            <div key={d.toISOString()} className="bg-papel-elevado py-2 text-center">
              <div className="text-[11px] uppercase tracking-[0.1em] text-cinza-fumo">{SEMANA[i]}</div>
              <div className={`text-[13px] tabular-nums ${d.toISOString().slice(0, 10) === hoje ? "text-bordo" : "text-grafite"}`}>
                {d.getUTCDate()}
              </div>
            </div>
          ))}

          {/* linhas de hora */}
          {HORAS.map((h) => (
            <div key={`linha-${h}`} className="contents">
              <div className="bg-papel-elevado py-2 pr-1 text-right text-[11px] tabular-nums text-cinza-fumo">
                {String(h).padStart(2, "0")}h
              </div>
              {dias.map((d) => {
                const ymd = d.toISOString().slice(0, 10);
                const itens = porCelula.get(chaveCelula(ymd, h)) ?? [];
                return (
                  <div key={`${ymd}-${h}`} className="min-h-12 bg-papel-elevado p-0.5">
                    {itens.map((a) => (
                      <Link
                        key={a.id}
                        href={`/loja/${lojaId}/noivas/${a.leadId}`}
                        className={`block truncate rounded-[6px] px-1.5 py-1 text-[11px] transition-opacity duration-150 hover:opacity-90 ${COR_SITUACAO[a.situacao]}`}
                      >
                        {a.noivaNome ?? "Atendimento"}
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Rodar os gates**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run test`
Expected: tudo verde.

- [ ] **Step 8: Commit**

```bash
git add src/lib/calendario/semana.ts src/lib/calendario/__tests__/semana.test.ts \
  src/lib/calendario/dados.ts \
  "src/app/(app)/loja/[lojaId]/calendario/_abas/AbaAtendimentos.tsx"
git commit -m "feat(calendario): aba Atendimentos — grade semana × hora"
```

---

## Task 5: Aba Provas & ajustes (fila consolidada)

Vista read-only que junta as próximas provas e a fila de ajustes pendentes, com links para as páginas operacionais completas (`/provas`, `/ajustes`). Reaproveita os data-layers existentes — sem nova lógica de domínio.

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaProvasAjustes.tsx`

- [ ] **Step 1: Implementar o componente `AbaProvasAjustes`**

Substituir TODO o conteúdo de `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaProvasAjustes.tsx`:

```tsx
// Aba Provas & ajustes — uma vista consolidada (só leitura) das próximas provas e da
// fila de ajustes pendentes. O trabalho operacional (registrar, marcar feito) segue
// nas páginas dedicadas — daí os links. Reaproveita listarProvasDaLoja / listarAjustesPendentes.
import Link from "next/link";
import { listarProvasDaLoja } from "@/lib/atelier/provas";
import { listarAjustesPendentes } from "@/lib/atelier/ajustes";

const ROTULO_TIPO_PROVA: Record<"PRIMEIRA" | "INTERMEDIARIA" | "FINAL", string> = {
  PRIMEIRA: "1ª prova",
  INTERMEDIARIA: "Prova intermediária",
  FINAL: "Prova final",
};

const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const fmtDia = (d: Date) => diaMes.format(d).replace(".", "");

export async function AbaProvasAjustes({ lojaId }: { lojaId: string }) {
  const [provas, ajustes] = await Promise.all([
    listarProvasDaLoja(lojaId),
    listarAjustesPendentes(lojaId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      {/* Provas */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Próximas provas</h2>
          <Link href={`/loja/${lojaId}/provas`} className="text-[12px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne">
            Ver todas
          </Link>
        </div>
        {provas.length === 0 ? (
          <p className="text-[13px] text-cinza-fumo">Nenhuma prova marcada por aqui.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {provas.map((p) => (
              <li key={p.id} className="flex items-center gap-4 px-4 py-3">
                <span className="w-12 shrink-0 text-[13px] tabular-nums text-grafite">{fmtDia(p.dataReal)}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[14px] text-tinta">{ROTULO_TIPO_PROVA[p.tipo]}</span>
                    {p.noivaNome && <span className="text-[13px] text-cinza-fumo">{p.noivaNome}</span>}
                  </span>
                  <span className="text-[12px] text-cinza-fumo">{p.vestidoCodigo} · {p.vestidoNome}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Ajustes */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Ajustes pendentes</h2>
          <Link href={`/loja/${lojaId}/ajustes`} className="text-[12px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne">
            Ver fila
          </Link>
        </div>
        {ajustes.length === 0 ? (
          <p className="text-[13px] text-cinza-fumo">Nenhum ajuste pendente. Tudo em dia.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {ajustes.map((a) => (
              <li key={a.id} className="flex items-center gap-4 px-4 py-3">
                <span className="w-12 shrink-0 text-[13px] tabular-nums text-grafite">
                  {a.casamentoData ? fmtDia(a.casamentoData) : "—"}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="truncate text-[14px] text-tinta">{a.descricao}</span>
                    {a.noivaNome && <span className="text-[13px] text-cinza-fumo">{a.noivaNome}</span>}
                  </span>
                  <span className="text-[12px] text-cinza-fumo">
                    {a.vestidoCodigo} · {a.vestidoNome}
                    {a.checklistTotal > 0 && <> · {a.checklistFeitos}/{a.checklistTotal} no checklist</>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Rodar os gates**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run test`
Expected: tudo verde.

- [ ] **Step 3: Verificação visual manual**

Run: `npm run dev` e abrir `/loja/<lojaId>/calendario`. Conferir:
- As 4 abas trocam pela URL (`?aba=...`) e a ativa tem o traço bordô.
- Mês: grade com marcadores; ‹ › navega meses; hoje destacado.
- Vestidos fora: barras posicionadas; legenda; vazio elegante quando não há reservas.
- Atendimentos: grade semana×hora; ‹ › navega semanas.
- Provas & ajustes: listas + links "Ver todas"/"Ver fila".
- O link "Calendário" do menu leva a `/calendario`; abrir `/loja/<lojaId>/agenda` redireciona.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/calendario/_abas/AbaProvasAjustes.tsx"
git commit -m "feat(calendario): aba Provas & ajustes — fila consolidada com links"
```

---

## Self-Review (preenchido pelo autor do plano)

**Cobertura do spec:**
- 4 abas → Tasks 2 (Mês), 3 (Gantt), 4 (Semana), 5 (Provas & ajustes). ✔
- Rota `/agenda` → `/calendario` com redirect → Task 1 (Steps 7–8). ✔
- Aba padrão "mes" → Task 1 (`resolverAba`) + despacho na casca. ✔
- Cores dos marcadores (bordô/champagne/grafite) → Task 2 (`COR_MARCADOR`). ✔
- Bordô com intenção no Gantt (só "uso") → Task 3 (`COR_BARRA`). ✔
- Reaproveitamento de `agendaDoAtelier` / `listarProvasDaLoja` / `listarAjustesPendentes` → Tasks 3 e 5. ✔
- Atmosfera Concierge (traço bordô, transições, vistas calmas) → componentes nas Tasks 1–5. ✔
- Gate de permissão → página em `leads:ver` (mesma porta da Agenda; link só aparece com `podeVerNoivas`); a aba Provas & ajustes não precisa de gate extra porque `leads:ver` já a satisfaz. ✔
- Fuso/datas → uso consistente de UTC; nota no topo + helpers. ✔

**Placeholders:** os componentes da Task 1 são placeholders INTENCIONAIS, integralmente substituídos nas Tasks 2–5 (cada substituição mostra o arquivo completo). Nenhum "TODO" pendente ao fim.

**Consistência de tipos:** `Marcador`/`TipoMarcador` definidos em `mes.ts` e consumidos por `dados.ts` e `AbaMes`. `EventoAgenda`/`TipoJanela` importados de `@/lib/disponibilidade`. `AtendimentoSituacao` de `@/generated/prisma/client`. Prop de navegação chamada `refParam` (nunca `ref`, reservado no React). Assinaturas dos readers conferem com o uso nos componentes.

**Risco residual conhecido:** o caminho do marcador `"atendimento"` e o reader `atendimentosNoIntervalo` não têm teste de DB dedicado (setup de cabine/vendedora é pesado) — cobertos por tipos + verificação manual (Task 5, Step 3). A lógica de data que de fato pode quebrar (posições, dias) está toda em testes puros.
