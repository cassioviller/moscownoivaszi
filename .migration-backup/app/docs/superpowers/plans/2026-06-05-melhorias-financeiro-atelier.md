# 4 melhorias (financeiro + ateliê) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exportar a folha à contabilidade em XLSX (marcando como enviada), paginar as 5 listas operacionais/financeiras, cobrir a lacuna de teste de atendimentos no calendário, e centralizar o wiring do filtro de intervalo do financeiro.

**Architecture:** Camadas puras testáveis (`paginar`, `montarPlanilhaContabilidade`, `lerFiltroFinanceiro`) + leituras tenant-scoped, e wiring de páginas Server Component. Fase 1 = tarefas-folha disjuntas (paralelizáveis). Fase 2 = wiring serial das páginas compartilhadas.

**Tech Stack:** Next.js 16 (App Router, Server Components, route handlers), Prisma (tenantPrisma), Vitest, **exceljs** (novo).

**Convenções:** datas meia-noite UTC; `intervalo = { gte, lt }` com `lt` exclusivo; dinheiro string `"1234.56"`. Gates por commit: `node node_modules/typescript/bin/tsc --noEmit` limpo e `npm run test` verde (o shim `.bin/tsc` é não-executável neste sandbox → use `node node_modules/typescript/bin/tsc`).

---

## File Structure

**Novos (fase 1):**
- `src/lib/paginacao.ts` — `paginar`, `totalPaginas`, `TAMANHO_PAGINA` (puro).
- `src/lib/financeiro/contabilidade.ts` — `itensPagosNoIntervalo`, `marcarEnviadosNoIntervalo`, tipo `ItemContabil`.
- `src/lib/financeiro/planilha-contabilidade.ts` — `montarPlanilhaContabilidade` (isola exceljs).
- `src/lib/financeiro/intervalo-params.ts` — `lerFiltroFinanceiro`.
- `src/components/Paginacao.tsx` — rodapé de paginação reutilizável.
- testes correspondentes em `__tests__/`.

**Modificados (fase 1, contrato de retorno):**
- `src/lib/atelier/provas.ts`, `src/lib/atelier/ajustes.ts`, `src/lib/financeiro/receber.ts`, `src/lib/financeiro/pagar.ts` (`listarPagamentos` + `listarContasA*`).

**Modificados (fase 2, wiring):**
- páginas `/provas`, `/ajustes`, `/financeiro/receber`, `/financeiro/pagar`, `/financeiro/pagar/folha`;
- `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaProvasAjustes.tsx`;
- nova route `…/financeiro/pagar/folha/exportar/route.ts`.

> **Ordem por causa dos gates:** mudar o retorno de uma leitura para `{ itens, total }` quebra os callers no mesmo instante. Por isso cada tarefa de paginação **inclui seus callers** no mesmo commit. As tarefas-folha que NÃO mudam contrato (paginacao.ts, contabilidade, planilha, intervalo-params, teste #3) são as paralelizáveis.

---

# FASE 1 — tarefas-folha (paralelizáveis: T1–T5 são arquivos/ testes disjuntos)

## Task 1: Helper de paginação (puro)

**Files:** Create `src/lib/paginacao.ts`; Test `src/lib/__tests__/paginacao.test.ts`

- [ ] **Step 1: Teste (falha)** — `src/lib/__tests__/paginacao.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { paginar, totalPaginas, TAMANHO_PAGINA } from "@/lib/paginacao";

describe("paginar", () => {
  it("página ausente/inválida → 1; skip 0", () => {
    expect(paginar(undefined)).toEqual({ pagina: 1, skip: 0, take: TAMANHO_PAGINA });
    expect(paginar("0")).toMatchObject({ pagina: 1, skip: 0 });
    expect(paginar("-3")).toMatchObject({ pagina: 1 });
    expect(paginar("abc")).toMatchObject({ pagina: 1 });
  });
  it("página N → skip (N-1)*tamanho", () => {
    expect(paginar("3", 10)).toEqual({ pagina: 3, skip: 20, take: 10 });
    expect(paginar(2, 30)).toEqual({ pagina: 2, skip: 30, take: 30 });
  });
});
describe("totalPaginas", () => {
  it("ceil, mínimo 1", () => {
    expect(totalPaginas(0, 30)).toBe(1);
    expect(totalPaginas(30, 30)).toBe(1);
    expect(totalPaginas(31, 30)).toBe(2);
    expect(totalPaginas(61, 30)).toBe(3);
  });
});
```

- [ ] **Step 2: Rodar (falha)** — `npx vitest run src/lib/__tests__/paginacao.test.ts` → módulo ausente.

- [ ] **Step 3: Implementar** — `src/lib/paginacao.ts`:
```ts
// src/lib/paginacao.ts
// Paginação offset (puro). Página 1-based; valor inválido cai em 1.
export const TAMANHO_PAGINA = 30;

export function paginar(
  paginaRaw: string | number | undefined,
  tamanho: number = TAMANHO_PAGINA,
): { pagina: number; skip: number; take: number } {
  const n = Number(paginaRaw);
  const pagina = Number.isInteger(n) && n >= 1 ? n : 1;
  return { pagina, skip: (pagina - 1) * tamanho, take: tamanho };
}

/** Total de páginas para `total` itens (mínimo 1). */
export function totalPaginas(total: number, tamanho: number = TAMANHO_PAGINA): number {
  return Math.max(1, Math.ceil(total / tamanho));
}
```

- [ ] **Step 4: Rodar (passa)** — mesmo comando → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/paginacao.ts src/lib/__tests__/paginacao.test.ts && git commit -m "feat(paginacao): helper offset puro (paginar/totalPaginas)"`

---

## Task 2: Leitura de itens p/ contabilidade (dados)

**Files:** Create `src/lib/financeiro/contabilidade.ts`; Test `src/lib/financeiro/__tests__/contabilidade.test.ts`

- [ ] **Step 1: Implementar `contabilidade.ts`** (leitura tenant-scoped):
```ts
// src/lib/financeiro/contabilidade.ts
// Itens pagos (PagamentoItem) num intervalo, achatados para exportação contábil; e a
// marcação de "enviado à contabilidade" dos pagamentos do período. Escopo de loja.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import type { ContaPagarTipo } from "@/generated/prisma/client";

export type ItemContabil = {
  dataPagamento: Date;
  quem: string | null; // colaborador.nome ?? fornecedor
  tipo: ContaPagarTipo;
  descricao: string;
  competencia: string | null;
  valor: string; // "1234.56"
  forma: string | null;
};

/** Itens (PagamentoItem) cujo Pagamento.data ∈ [gte, lt), por data asc. */
export async function itensPagosNoIntervalo(
  lojaId: string,
  intervalo: { gte: Date; lt: Date },
): Promise<ItemContabil[]> {
  const rows = await tenantPrisma(prisma, lojaId).pagamentoItem.findMany({
    where: { pagamento: { data: { gte: intervalo.gte, lt: intervalo.lt } } },
    orderBy: { pagamento: { data: "asc" } },
    include: {
      pagamento: { select: { data: true, forma: true, colaborador: { select: { nome: true } } } },
      contaPagar: { select: { tipo: true, descricao: true, competencia: true, fornecedor: true } },
    },
  });
  return rows.map((r) => ({
    dataPagamento: r.pagamento.data,
    quem: r.pagamento.colaborador?.nome ?? r.contaPagar.fornecedor ?? null,
    tipo: r.contaPagar.tipo,
    descricao: r.contaPagar.descricao,
    competencia: r.contaPagar.competencia,
    valor: Number(r.valor).toFixed(2),
    forma: r.pagamento.forma,
  }));
}

/** Carimba enviadoContabilidadeEm nos Pagamentos do período ainda não marcados. Retorna a contagem. */
export async function marcarEnviadosNoIntervalo(
  lojaId: string,
  intervalo: { gte: Date; lt: Date },
): Promise<number> {
  const r = await tenantPrisma(prisma, lojaId).pagamento.updateMany({
    where: { data: { gte: intervalo.gte, lt: intervalo.lt }, enviadoContabilidadeEm: null },
    data: { enviadoContabilidadeEm: new Date() },
  });
  return r.count;
}
```

- [ ] **Step 2: Teste de integração** — `src/lib/financeiro/__tests__/contabilidade.test.ts`. Leia primeiro um teste existente do financeiro que crie um `Pagamento` (ex.: `pagar.test.ts`) para copiar as fixtures (loja, colaborador via usuario+usuarioLoja, `lancarConta`, `registrarPagamento`). Crie uma conta + pagamento com `data` dentro de um intervalo, e asserte:
  - `itensPagosNoIntervalo(loja, [gte,lt))` retorna 1 item com `valor` e `tipo` corretos; intervalo fora retorna 0.
  - `marcarEnviadosNoIntervalo(loja, [gte,lt))` retorna 1 e, repetido, retorna 0 (idempotente — já marcado).
  Use `MARK = "t-contab-"`, `afterAll` limpando loja + usuario por prefixo.

- [ ] **Step 3: Rodar** — `npx vitest run src/lib/financeiro/__tests__/contabilidade.test.ts` → PASS.
- [ ] **Step 4: Gates + Commit** — `node node_modules/typescript/bin/tsc --noEmit` limpo; `git add src/lib/financeiro/contabilidade.ts src/lib/financeiro/__tests__/contabilidade.test.ts && git commit -m "feat(financeiro): leitura de itens pagos + marcar enviados à contabilidade"`

---

## Task 3: Planilha XLSX (isola exceljs)

**Files:** `package.json` (add `exceljs`); Create `src/lib/financeiro/planilha-contabilidade.ts`; Test `src/lib/financeiro/__tests__/planilha-contabilidade.test.ts`

- [ ] **Step 1: Instalar exceljs** — `npm install exceljs` (confirme que aparece em `dependencies`).

- [ ] **Step 2: Implementar** — `src/lib/financeiro/planilha-contabilidade.ts`:
```ts
// src/lib/financeiro/planilha-contabilidade.ts
// Monta a planilha .xlsx da contabilidade (isola o exceljs). Datas em UTC; valor como número.
import ExcelJS from "exceljs";
import type { ItemContabil } from "./contabilidade";

const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const ROTULO_TIPO: Record<ItemContabil["tipo"], string> = {
  DESPESA: "Despesa",
  FORNECEDOR: "Fornecedor",
  SALARIO: "Salário",
  COMISSAO: "Comissão",
};
const CABECALHO = ["Data", "Quem", "Tipo", "Descrição", "Competência", "Valor (R$)", "Forma"];

export async function montarPlanilhaContabilidade(itens: ItemContabil[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pagamentos");
  ws.addRow(CABECALHO);
  for (const i of itens) {
    ws.addRow([
      fmtData.format(i.dataPagamento),
      i.quem ?? "",
      ROTULO_TIPO[i.tipo],
      i.descricao,
      i.competencia ?? "",
      Number(i.valor),
      i.forma ?? "",
    ]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
```

- [ ] **Step 3: Teste (sem banco, lê de volta a planilha)** — `src/lib/financeiro/__tests__/planilha-contabilidade.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { montarPlanilhaContabilidade } from "@/lib/financeiro/planilha-contabilidade";
import type { ItemContabil } from "@/lib/financeiro/contabilidade";

const item = (over: Partial<ItemContabil> = {}): ItemContabil => ({
  dataPagamento: new Date("2026-06-10T00:00:00.000Z"),
  quem: "Vendedora A",
  tipo: "COMISSAO",
  descricao: "Comissão 2026-05",
  competencia: "2026-05",
  valor: "1234.56",
  forma: "Pix",
  ...over,
});

describe("montarPlanilhaContabilidade", () => {
  it("gera uma aba 'Pagamentos' com cabeçalho + 1 linha por item", async () => {
    const buf = await montarPlanilhaContabilidade([item(), item({ tipo: "DESPESA", quem: null })]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Pagamentos")!;
    expect(ws.rowCount).toBe(3); // cabeçalho + 2
    expect(ws.getRow(1).getCell(1).value).toBe("Data");
    expect(ws.getRow(1).getCell(6).value).toBe("Valor (R$)");
    expect(ws.getRow(2).getCell(6).value).toBe(1234.56); // valor como número
    expect(ws.getRow(3).getCell(3).value).toBe("Despesa"); // rótulo do tipo
  });
});
```

- [ ] **Step 4: Rodar** — `npx vitest run src/lib/financeiro/__tests__/planilha-contabilidade.test.ts` → PASS.
- [ ] **Step 5: Gates + Commit** — tsc limpo; `git add package.json package-lock.json src/lib/financeiro/planilha-contabilidade.ts src/lib/financeiro/__tests__/planilha-contabilidade.test.ts && git commit -m "feat(financeiro): planilha XLSX da contabilidade (exceljs)"`

---

## Task 4: `lerFiltroFinanceiro` (DRY do wiring) — puro

**Files:** Create `src/lib/financeiro/intervalo-params.ts`; Test `src/lib/financeiro/__tests__/intervalo-params.test.ts`

- [ ] **Step 1: Teste (falha)** — `src/lib/financeiro/__tests__/intervalo-params.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { lerFiltroFinanceiro } from "@/lib/financeiro/intervalo-params";

describe("lerFiltroFinanceiro", () => {
  it("resolve intervalo (default mês de hoje) e página", () => {
    const f = lerFiltroFinanceiro({ ini: "2026-06-08", fim: "2026-06-14", p: "2" });
    expect(f.intervalo.iniYMD).toBe("2026-06-08");
    expect(f.intervalo.fimYMD).toBe("2026-06-14");
    expect(f.pagina).toBe(2);
  });
  it("página inválida → 1", () => {
    expect(lerFiltroFinanceiro({ p: "x" }).pagina).toBe(1);
  });
  it("qs preserva ini/fim e mescla extras (sem vazios)", () => {
    const f = lerFiltroFinanceiro({ ini: "2026-06-08", fim: "2026-06-14" });
    const qs = f.qs({ filtro: "abertas", p: 3 });
    const params = new URLSearchParams(qs);
    expect(params.get("ini")).toBe("2026-06-08");
    expect(params.get("fim")).toBe("2026-06-14");
    expect(params.get("filtro")).toBe("abertas");
    expect(params.get("p")).toBe("3");
    // valores undefined/"" não entram
    expect(lerFiltroFinanceiro({}).qs({ filtro: undefined })).not.toContain("filtro");
  });
});
```

- [ ] **Step 2: Rodar (falha)** — módulo ausente.

- [ ] **Step 3: Implementar** — `src/lib/financeiro/intervalo-params.ts`:
```ts
// src/lib/financeiro/intervalo-params.ts
// Centraliza, para as páginas do financeiro, a leitura de ?ini=&fim=&p= e a montagem
// da querystring preservada (para chips de status, paginação, etc.). DRY do wiring.
import { resolverIntervalo, type IntervaloFinanceiro } from "./intervalo";

export type FiltroFinanceiro = {
  intervalo: IntervaloFinanceiro;
  pagina: number;
  qs(extra?: Record<string, string | number | undefined>): string;
};

export function lerFiltroFinanceiro(sp: Record<string, string | undefined>): FiltroFinanceiro {
  const intervalo = resolverIntervalo(sp.ini, sp.fim);
  const n = Number(sp.p);
  const pagina = Number.isInteger(n) && n >= 1 ? n : 1;
  const qs = (extra: Record<string, string | number | undefined> = {}) => {
    const params = new URLSearchParams();
    const todos = { ini: intervalo.iniYMD, fim: intervalo.fimYMD, ...extra };
    for (const [k, v] of Object.entries(todos)) {
      if (v !== undefined && v !== "") params.set(k, String(v));
    }
    return params.toString();
  };
  return { intervalo, pagina, qs };
}
```

- [ ] **Step 4: Rodar (passa)** + **Step 5: Commit** — `git add src/lib/financeiro/intervalo-params.ts src/lib/financeiro/__tests__/intervalo-params.test.ts && git commit -m "feat(financeiro): lerFiltroFinanceiro (centraliza ?ini=&fim=&p= + querystring)"`

---

## Task 5: Teste de atendimentos no calendário (#3)

**Files:** Create `src/lib/calendario/__tests__/dados-atendimentos.test.ts`

- [ ] **Step 1: Escrever o teste de integração** (espelha as fixtures de `src/lib/atendimentos/__tests__/atendimentos.test.ts`: cabine + vendedora via `usuario`+`usuarioLoja` perfil `perfil-vendedora`):
```ts
// Integração: atendimentos entram no calendário (lista por intervalo + marcador).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { agendarAtendimento } from "@/lib/atendimentos/atendimentos";
import { atendimentosNoIntervalo, marcadoresNoIntervalo } from "@/lib/calendario/dados";

const MARK = "t-cal-atend-";
let loja = "", lead = "", cabine = "", vend = "", atendId = "";

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  lead = (await db.lead.create({ data: { noivaNome: `${MARK}Noiva` } as never })).id;
  cabine = (await db.cabine.create({ data: { nome: `${MARK}C1` } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}Vend`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  vend = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  const r = await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2026-09-12", hora: 14 });
  if (!r.ok) throw new Error(`setup atendimento falhou: ${r.motivo}`);
  atendId = r.atendimentoId;
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("calendário ← atendimentos", () => {
  it("atendimentosNoIntervalo inclui o que cai no dia e exclui fora", async () => {
    const dentro = await atendimentosNoIntervalo(loja, dia("2026-09-12"), dia("2026-09-13"));
    expect(dentro.some((a) => a.id === atendId)).toBe(true);
    const fora = await atendimentosNoIntervalo(loja, dia("2026-09-13"), dia("2026-09-14"));
    expect(fora.some((a) => a.id === atendId)).toBe(false);
  });
  it("marcadoresNoIntervalo traz um marcador tipo 'atendimento' no dia 2026-09-12", async () => {
    const marc = await marcadoresNoIntervalo(loja, dia("2026-09-12"), dia("2026-09-13"));
    expect(marc.some((m) => m.ymd === "2026-09-12" && m.tipo === "atendimento")).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar** — `npx vitest run src/lib/calendario/__tests__/dados-atendimentos.test.ts` → PASS (prova que `atendimentosNoIntervalo` e o marcador funcionam).
- [ ] **Step 3: Commit** — `git add src/lib/calendario/__tests__/dados-atendimentos.test.ts && git commit -m "test(calendario): cobre atendimentos no intervalo + marcador de atendimento"`

---

# FASE 2 — wiring das páginas (SERIAL — arquivos compartilhados)

## Task 6: Paginar Provas e Ajustes (lib + páginas + calendário, um commit)

**Files:** Modify `src/lib/atelier/provas.ts`, `src/lib/atelier/ajustes.ts`, suas páginas `/provas` e `/ajustes`, `…/calendario/_abas/AbaProvasAjustes.tsx`; Create `src/components/Paginacao.tsx`; Modify os testes de `atelier` que usam essas leituras.

- [ ] **Step 1: Criar o componente `Paginacao`** — `src/components/Paginacao.tsx`:
```tsx
// src/components/Paginacao.tsx
// Rodapé de paginação (Server Component, sem JS de cliente). Some quando cabe numa página.
import Link from "next/link";

export function Paginacao({
  pagina,
  total,
  tamanho,
  href,
}: {
  pagina: number;
  total: number;
  tamanho: number;
  href: (p: number) => string;
}) {
  const paginas = Math.max(1, Math.ceil(total / tamanho));
  if (total <= tamanho) return null;
  const btn =
    "rounded-md px-2 py-1 text-[13px] text-grafite transition-colors duration-150 hover:bg-papel-suave hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
  return (
    <nav className="flex items-center justify-between gap-4 text-[12px] text-cinza-fumo">
      <span>
        Página {pagina} de {paginas} · {total} {total === 1 ? "item" : "itens"}
      </span>
      <span className="flex items-center gap-1">
        {pagina > 1 ? (
          <Link href={href(pagina - 1)} className={btn}>‹ Anterior</Link>
        ) : (
          <span className={`${btn} opacity-40`}>‹ Anterior</span>
        )}
        {pagina < paginas ? (
          <Link href={href(pagina + 1)} className={btn}>Próxima ›</Link>
        ) : (
          <span className={`${btn} opacity-40`}>Próxima ›</span>
        )}
      </span>
    </nav>
  );
}
```

- [ ] **Step 2: Mudar contrato de `listarProvasDaLoja`** — em `src/lib/atelier/provas.ts`, importe `import { paginar } from "@/lib/paginacao";`. Faça a função aceitar `opts.pagina?: number | string` e retornar `{ itens, total }`: rode `const { skip, take } = paginar(opts.pagina, opts.tamanho);`, adicione `skip, take` ao `findMany`, e faça `const total = await ...prova.count({ where })` (mesmo `where` da listagem) em paralelo. Retorne `{ itens: rows.map(...), total }`. **Mantenha o filtro `passadas`**.

- [ ] **Step 3: Mesmo para `listarAjustesPendentes`** em `src/lib/atelier/ajustes.ts` (status PENDENTE; preserve a ordenação por `casamentoData`). Como a ordenação é feita em memória (`.sort`), pagine APÓS ordenar: `const total = ordenados.length; const itens = ordenados.slice(skip, skip + take);` — ou prefira `count` + `skip/take` no Prisma se a ordenação puder ir para o banco. Escolha o que preserva a ordem atual; comente a decisão.

- [ ] **Step 4: Atualizar os testes de `atelier`** — qualquer teste que faça `(await listarProvasDaLoja(...))` como array passa a usar `.itens`; adicione um caso: criando > `TAMANHO_PAGINA` provas (ou com `tamanho` pequeno via opts) verifique `total` correto e o tamanho da página. Rode `npx vitest run src/lib/atelier` até verde.

- [ ] **Step 5: Atualizar as páginas `/provas` e `/ajustes`** — leia cada page, troque `const lista = await listarProvasDaLoja(...)` por `const { itens, total } = await listarProvasDaLoja(sc.loja.id, { passadas, pagina: sp.p })`, itere sobre `itens`, e adicione no rodapé `<Paginacao pagina={paginar(sp.p).pagina} total={total} tamanho={TAMANHO_PAGINA} href={(p) => \`?...&p=${p}\`} />` preservando os params atuais da página (ex.: `passadas`). Importe `TAMANHO_PAGINA`, `paginar` de `@/lib/paginacao` e `Paginacao` de `@/components/Paginacao`.

- [ ] **Step 6: Atualizar `AbaProvasAjustes.tsx`** — passa a chamar `listarProvasDaLoja(lojaId, { tamanho: 5 })` e `listarAjustesPendentes(lojaId, { tamanho: 5 })`, usando `.itens` para a lista e `.total` para o "ver todas (N)". Isso resolve o preview sem cap.

- [ ] **Step 7: Gates + Commit** — tsc limpo, `npm run test` verde. `git add` (provas.ts, ajustes.ts, Paginacao.tsx, as 2 páginas, AbaProvasAjustes.tsx, testes de atelier) `&& git commit -m "feat(atelier): paginação em provas e ajustes (+ preview do calendário com cap)"`

---

## Task 7: DRY do filtro nas 5 páginas do financeiro (#4 wiring)

**Files:** Modify `/financeiro/page.tsx`, `/financeiro/receber/page.tsx`, `/financeiro/pagar/page.tsx`, `/financeiro/pagar/folha/page.tsx`, `/financeiro/comissoes/page.tsx`

- [ ] **Step 1: Para cada uma das 5 páginas**, leia o topo e substitua o bloco repetido de leitura do intervalo por `lerFiltroFinanceiro`:
  - Importe `import { lerFiltroFinanceiro } from "@/lib/financeiro/intervalo-params";`.
  - Troque `const intervalo = resolverIntervalo(sp.ini, sp.fim);` (e a página/qs manual quando houver) por `const { intervalo, pagina, qs } = lerFiltroFinanceiro(sp);`.
  - Onde a página montava `href` preservando `ini`/`fim` à mão (chips de status, voltar), use `qs({ filtro, ... })`.
  - Mantenha a render de `<FiltroIntervalo iniYMD={intervalo.iniYMD} fimYMD={intervalo.fimYMD} hidden={...} />` como está.
  - Remova imports não usados (`resolverIntervalo` direto, se sumiu).
  > Não muda comportamento — é refator. Confirme com tsc + os testes existentes do financeiro.

- [ ] **Step 2: Gates + Commit** — tsc limpo, `npm run test` verde. `git commit -m "refactor(financeiro): centraliza wiring do filtro com lerFiltroFinanceiro"`

---

## Task 8: Paginar Receber, Pagar e Pagamentos (lib + páginas, um commit)

**Files:** Modify `src/lib/financeiro/receber.ts`, `src/lib/financeiro/pagar.ts`, páginas `/financeiro/receber`, `/financeiro/pagar`, `/financeiro/pagar/folha`; testes de financeiro afetados.

- [ ] **Step 1: `listarContasAReceber` → `{ itens, total }`** — importe `paginar`; aceite `opts.pagina?`; adicione `skip, take` ao `findMany` e um `parcela.count({ where })` (mesmo `where`); retorne `{ itens: rows.map(...), total }`.
- [ ] **Step 2: Igual em `listarContasAPagar` e `listarPagamentos`** (`pagar.ts`) — `count` com o mesmo `where`, `skip/take`, retornar `{ itens, total }`.
- [ ] **Step 3: Atualizar testes** de `receber.ts`/`pagar.ts` que conssomem essas listas (`.length`/`.map` → `.itens`); adicione um caso de `total`/página.
- [ ] **Step 4: Atualizar as páginas** `/financeiro/receber`, `/financeiro/pagar` e `/financeiro/pagar/folha`: usem `const { itens, total } = await listar...(sc.loja.id, { filtro, intervalo: { gte, lt }, pagina })`, iterem sobre `itens`, e adicionem `<Paginacao ... href={(p) => `?${qs({ filtro, p })}`} />`. Use o `qs`/`pagina` já vindos de `lerFiltroFinanceiro` (Task 7).
- [ ] **Step 5: Gates + Commit** — tsc limpo, `npm run test` verde. `git commit -m "feat(financeiro): paginação em receber, pagar e pagamentos"`

---

## Task 9: Exportar à contabilidade — route + botão (#1 wiring)

**Files:** Create `src/app/(app)/loja/[lojaId]/financeiro/pagar/folha/exportar/route.ts`; Modify `/financeiro/pagar/folha/page.tsx`

- [ ] **Step 1: Criar a route GET** (espelhe `…/contratos/[contratoId]/pdf/route.ts` para auth + Response). `src/app/(app)/loja/[lojaId]/financeiro/pagar/folha/exportar/route.ts`:
```ts
// GET …/financeiro/pagar/folha/exportar?ini&fim → baixa os pagamentos do período em
// XLSX e marca como enviados à contabilidade. Gate em financeiro:ver.
import { exigirAcesso } from "@/lib/server/acoes";
import { resolverIntervalo } from "@/lib/financeiro/intervalo";
import { itensPagosNoIntervalo, marcarEnviadosNoIntervalo } from "@/lib/financeiro/contabilidade";
import { montarPlanilhaContabilidade } from "@/lib/financeiro/planilha-contabilidade";

export async function GET(req: Request, { params }: { params: Promise<{ lojaId: string }> }) {
  const sc = await exigirAcesso("financeiro");
  await params; // escopo já vem de sc.loja.id
  const url = new URL(req.url);
  const intervalo = resolverIntervalo(url.searchParams.get("ini") ?? undefined, url.searchParams.get("fim") ?? undefined);
  const itens = await itensPagosNoIntervalo(sc.loja.id, { gte: intervalo.gte, lt: intervalo.lt });
  const buffer = await montarPlanilhaContabilidade(itens);
  await marcarEnviadosNoIntervalo(sc.loja.id, { gte: intervalo.gte, lt: intervalo.lt });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="contabilidade-${intervalo.iniYMD}-a-${intervalo.fimYMD}.xlsx"`,
    },
  });
}
```
> Confirme a assinatura de `exigirAcesso` em route handlers lendo `…/contratos/[contratoId]/pdf/route.ts`. Se lá usa `getSessaoComLoja` + checagem manual, espelhe esse padrão.

- [ ] **Step 2: Botão na Folha** — em `/financeiro/pagar/folha/page.tsx`, adicione (perto do envio à contabilidade) um link de download que carrega o intervalo atual via `qs` (de `lerFiltroFinanceiro`):
```tsx
<a
  href={`/loja/${lojaId}/financeiro/pagar/folha/exportar?${qs()}`}
  download
  className={botaoSuave}
>
  Exportar à contabilidade (xlsx)
</a>
```
Com uma legenda `text-[12px] text-cinza-fumo`: "Baixa os pagamentos do período e marca como enviados à contabilidade." (`botaoSuave` vem de `../ui` / `../../ui` conforme o caminho da folha.)

- [ ] **Step 3: Verificação manual** — `npm run dev`, abrir a Folha, clicar em Exportar: baixa um `.xlsx` com os pagamentos do período; recarregar mostra os pagamentos marcados como enviados.
- [ ] **Step 4: Gates + Commit** — tsc limpo, `npm run test` verde. `git commit -m "feat(financeiro): exportar folha à contabilidade em XLSX (marca como enviada)"`

---

## Self-Review (autor do plano)

**Cobertura do spec:**
- #1 export XLSX + marca enviado → Tasks 2 (dados), 3 (planilha), 9 (route+botão). ✔
- #2 paginação 5 listas → Task 1 (helper), 6 (provas/ajustes), 8 (receber/pagar/pagamentos). ✔
- #3 lacuna de teste → Task 5. ✔
- #4 DRY filtro → Task 4 (helper) + Task 7 (wiring). ✔
- Estratégia paralela/serial → Fase 1 (T1–T5 disjuntos) / Fase 2 (T6–T9 serial). ✔

**Placeholders:** as Tasks 6–9 descrevem transformações de páginas que o implementador deve LER e aplicar — intencional (são arquivos grandes e variados; o subagente lê cada página). Os pedaços novos (Paginacao, route, helpers) têm código completo. Não há "TODO" pendente.

**Consistência de tipos:** leituras paginadas retornam `{ itens, total }` em TODAS (provas, ajustes, receber, pagar, pagamentos). `paginar` devolve `{ pagina, skip, take }`. `lerFiltroFinanceiro` devolve `{ intervalo, pagina, qs }`. `ItemContabil` definido na Task 2 e consumido nas Tasks 3 e 9. `Paginacao` props `{ pagina, total, tamanho, href }` usadas igualmente nas Tasks 6 e 8.

**Risco conhecido:** mudar o contrato das leituras quebra callers no mesmo instante → por isso cada tarefa de paginação inclui callers + testes no MESMO commit (gates verdes). A ordenação em memória de `listarAjustesPendentes` exige paginar após ordenar (anotado na Task 6 Step 3).
