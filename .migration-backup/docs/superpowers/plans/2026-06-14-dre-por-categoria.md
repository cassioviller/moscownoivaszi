# DRE por categoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao dono o resultado do mês — receitas − despesas por categoria — em regime de caixa, por competência selecionável.

**Architecture:** Um motor de leitura puro `dre.ts` (`rotuloCategoria` pura + `dreDoMes` reusando `competenciaRange` e os realizados de `Parcela`/`PagamentoItem`); uma tela `/financeiro/dre` (server, read-only) com seletor de competência. **Sem tabela nova, sem migração, sem escrita.**

**Tech Stack:** Next.js 16 (App Router, Server Components, `force-dynamic`), Prisma 7, Tailwind v4, vitest (integração com Postgres real), TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-14-dre-por-categoria-design.md`.

**Convenções do repo:**
- Commits **direto na `main`**. Antes de cada commit: `node node_modules/typescript/bin/tsc --noEmit` limpo e `npx vitest run` verde.
- Dinheiro em **centavos** via `@/lib/dinheiro`: `deCentavos(c)`→"1234.56", `decParaCentavos(str|Decimal|null)`→centavos.
- Competência via `@/lib/financeiro/datas`: `competenciaValida(s)`, `competenciaAtual()`, `competenciaRange(comp)`→`{gte,lt}`.
- Modelos de loja via `tenantPrisma(prisma, lojaId)`; em `create` use `as never`. Testes: prefixo `MARK`, limpeza em `afterAll`.
- Gate de página: `exigirAcesso("financeiro")`.

---

## File Structure

**Criar:**
- `src/lib/financeiro/dre.ts` — `rotuloCategoria` (pura) + `dreDoMes` (leitura).
- `src/lib/financeiro/__tests__/dre.test.ts` — unit (pura) + integração.
- `src/app/(app)/loja/[lojaId]/financeiro/dre/page.tsx` — a tela.

**Modificar:**
- `src/app/(app)/loja/[lojaId]/financeiro/page.tsx` — link "Resultado do mês".

---

## Task 1: Motor `dre.ts` (`rotuloCategoria` + `dreDoMes`)

**Files:**
- Create: `src/lib/financeiro/dre.ts`
- Test: `src/lib/financeiro/__tests__/dre.test.ts`

- [ ] **Step 1: Escrever os testes que falham (pura + integração)**

Criar `src/lib/financeiro/__tests__/dre.test.ts`:
```ts
// Unit (puro) + integração: rotuloCategoria (fallback no tipo) e dreDoMes (receitas − despesas
// por categoria, regime de caixa, por competência).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC } from "@/lib/tempo";
import { competenciaAtual } from "@/lib/financeiro/datas";
import { rotuloCategoria, dreDoMes } from "@/lib/financeiro/dre";

describe("rotuloCategoria", () => {
  it("usa a categoria livre quando houver", () => {
    expect(rotuloCategoria("Aluguel", "DESPESA")).toBe("Aluguel");
  });
  it("vazio/null cai no rótulo do tipo", () => {
    expect(rotuloCategoria("   ", "SALARIO")).toBe("Salários");
    expect(rotuloCategoria(null, "FORNECEDOR")).toBe("Fornecedores");
    expect(rotuloCategoria(null, "COMISSAO")).toBe("Comissões");
    expect(rotuloCategoria(null, "DESPESA")).toBe("Despesas");
  });
});

const MARK = "t-dre-";
let loja = "";
let noiva = "";
let vend = "";
const hoje = hojeUTC();
const comp = competenciaAtual();

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Ana`, etapa: "NOVO" } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}V`, email: `${MARK}${noiva}@x.local`, senhaHash: "x" } });
  vend = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  const contrato = await db.contrato.create({ data: { leadId: noiva, vendedoraId: vend, valorTotal: 9999 } as never });
  // Receita do mês: parcela PAGA recebida hoje (2000).
  await db.parcela.create({ data: { contratoId: contrato.id, numero: 1, valorPrevisto: 2000, vencimento: hoje, status: "PAGA", valorRecebido: 2000, recebidoEm: hoje } as never });
  // Receita FORA do mês (40 dias atrás) — não entra.
  const fora = new Date(hoje.getTime()); fora.setUTCDate(fora.getUTCDate() - 40);
  await db.parcela.create({ data: { contratoId: contrato.id, numero: 2, valorPrevisto: 999, vencimento: fora, status: "PAGA", valorRecebido: 999, recebidoEm: fora } as never });
  // Despesa do mês: 1 pagamento (data hoje) com 2 itens — Aluguel (categoria) 800 + Salário (tipo) 1200.
  const ap1 = await db.contaPagar.create({ data: { tipo: "DESPESA", descricao: `${MARK}aluguel`, categoria: "Aluguel", valorPrevisto: 800, vencimento: hoje } as never });
  const ap2 = await db.contaPagar.create({ data: { tipo: "SALARIO", descricao: `${MARK}salario`, valorPrevisto: 1200, vencimento: hoje } as never });
  const pg = await db.pagamento.create({ data: { data: hoje, valorPago: 2000 } as never });
  await db.pagamentoItem.create({ data: { pagamentoId: pg.id, contaPagarId: ap1.id, valor: 800 } as never });
  await db.pagamentoItem.create({ data: { pagamentoId: pg.id, contaPagarId: ap2.id, valor: 1200 } as never });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("dreDoMes", () => {
  it("receitas do mês ignoram recebimentos de outra competência", async () => {
    const d = await dreDoMes(loja, comp);
    expect(d.receitas).toBe("2000.00");
  });
  it("despesas agrupadas por categoria (fallback no tipo), maior primeiro", async () => {
    const d = await dreDoMes(loja, comp);
    expect(d.despesas).toEqual([
      { rotulo: "Salários", total: "1200.00" },
      { rotulo: "Aluguel", total: "800.00" },
    ]);
    expect(d.totalDespesas).toBe("2000.00");
  });
  it("resultado = receitas − despesas", async () => {
    const d = await dreDoMes(loja, comp);
    expect(d.resultado).toBe("0.00");
  });
  it("competência inválida → DRE zerado", async () => {
    const d = await dreDoMes(loja, "abc");
    expect(d).toEqual({ competencia: "abc", receitas: "0.00", despesas: [], totalDespesas: "0.00", resultado: "0.00" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/__tests__/dre.test.ts`
Expected: FAIL — módulo `dre` não existe.

- [ ] **Step 3: Implementar `dre.ts`**

Criar `src/lib/financeiro/dre.ts`:
```ts
// src/lib/financeiro/dre.ts
// DRE simples (regime de caixa): receitas (parcela PAGA por recebidoEm) − despesas por categoria
// (PagamentoItem por pagamento.data, agrupado por categoria/tipo) = resultado do mês. Leitura pura.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { deCentavos, decParaCentavos } from "@/lib/dinheiro";
import { competenciaValida, competenciaRange } from "@/lib/financeiro/datas";
import type { ContaPagarTipo } from "@/generated/prisma/client";

const ROTULO_TIPO: Record<ContaPagarTipo, string> = {
  DESPESA: "Despesas",
  FORNECEDOR: "Fornecedores",
  SALARIO: "Salários",
  COMISSAO: "Comissões",
};

/** Rótulo da despesa: a categoria livre quando houver; senão o rótulo do tipo. Puro. */
export function rotuloCategoria(categoria: string | null, tipo: ContaPagarTipo): string {
  const c = categoria?.trim();
  return c ? c : ROTULO_TIPO[tipo];
}

export type LinhaDespesa = { rotulo: string; total: string };
export type DRE = {
  competencia: string;
  receitas: string;
  despesas: LinhaDespesa[]; // maior total primeiro
  totalDespesas: string;
  resultado: string; // receitas − totalDespesas (pode ser negativo)
};

const zero = (competencia: string): DRE => ({ competencia, receitas: "0.00", despesas: [], totalDespesas: "0.00", resultado: "0.00" });

/** DRE realizado do mês: receitas − despesas por categoria. Competência inválida → zerado. */
export async function dreDoMes(lojaId: string, competencia: string): Promise<DRE> {
  if (!competenciaValida(competencia)) return zero(competencia);
  const { gte, lt } = competenciaRange(competencia);
  const db = tenantPrisma(prisma, lojaId);

  const [rec, itens] = await Promise.all([
    db.parcela.aggregate({ where: { status: "PAGA", recebidoEm: { gte, lt } }, _sum: { valorRecebido: true } }),
    db.pagamentoItem.findMany({
      where: { pagamento: { data: { gte, lt } } },
      select: { valor: true, contaPagar: { select: { categoria: true, tipo: true } } },
    }),
  ]);

  const receitasC = decParaCentavos(rec._sum.valorRecebido);

  const porCategoria = new Map<string, number>();
  for (const it of itens) {
    const rotulo = rotuloCategoria(it.contaPagar.categoria, it.contaPagar.tipo);
    porCategoria.set(rotulo, (porCategoria.get(rotulo) ?? 0) + decParaCentavos(it.valor));
  }
  const despesas: LinhaDespesa[] = [...porCategoria.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rotulo, c]) => ({ rotulo, total: deCentavos(c) }));
  const totalDespesasC = [...porCategoria.values()].reduce((s, c) => s + c, 0);

  return {
    competencia,
    receitas: deCentavos(receitasC),
    despesas,
    totalDespesas: deCentavos(totalDespesasC),
    resultado: deCentavos(receitasC - totalDespesasC),
  };
}
```

- [ ] **Step 4: Rodar e ver passar (arquivo + suíte cheia)**

Run: `npx vitest run src/lib/financeiro/__tests__/dre.test.ts`
Expected: PASS (6 testes: 2 puros + 4 integração).

Run: `npx vitest run`
Expected: suíte verde.

- [ ] **Step 5: tsc + commit**
```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/lib/financeiro/dre.ts src/lib/financeiro/__tests__/dre.test.ts
git commit -m "feat(financeiro): dreDoMes — resultado do mês por categoria (regime de caixa)"
```

---

## Task 2: Tela `/financeiro/dre` + link no Fluxo de caixa

**Files:**
- Create: `src/app/(app)/loja/[lojaId]/financeiro/dre/page.tsx`
- Modify: `src/app/(app)/loja/[lojaId]/financeiro/page.tsx`

- [ ] **Step 1: Implementar a página**

Criar `src/app/(app)/loja/[lojaId]/financeiro/dre/page.tsx`:
```tsx
// src/app/(app)/loja/[lojaId]/financeiro/dre/page.tsx
// Resultado do mês (DRE simples, regime de caixa): receitas − despesas por categoria por
// competência selecionável. Leitura pura; gate financeiro:ver. Resultado negativo em bordô.
import Link from "next/link";
import { exigirAcesso } from "@/lib/server/acoes";
import { dreDoMes } from "@/lib/financeiro/dre";
import { competenciaValida, competenciaAtual } from "@/lib/financeiro/datas";
import { brl } from "@/lib/dinheiro";

export const dynamic = "force-dynamic";

const mesFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const comp2 = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

export default async function DREPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ comp?: string }>;
}) {
  await exigirAcesso("financeiro");
  const { lojaId } = await params;
  const sp = await searchParams;
  const comp = competenciaValida(sp.comp ?? "") ? sp.comp! : competenciaAtual();
  const dre = await dreDoMes(lojaId, comp);

  const [y, m] = comp.split("-").map(Number);
  const prev = m === 1 ? comp2(y - 1, 12) : comp2(y, m - 1);
  const next = m === 12 ? comp2(y + 1, 1) : comp2(y, m + 1);
  const mesLabel = mesFmt.format(new Date(`${comp}-01T00:00:00.000Z`));
  const resultadoNegativo = Number(dre.resultado) < 0;
  const vazio = dre.receitas === "0.00" && dre.despesas.length === 0;

  const rotulo = "text-[11px] uppercase tracking-[0.18em] text-cinza-fumo";
  const navLink = "rounded-md px-2 py-1 text-[14px] text-grafite hover:bg-papel-suave hover:text-tinta";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <Link href={`/loja/${lojaId}/financeiro`} className="w-fit text-[13px] text-grafite hover:text-tinta">← Fluxo de caixa</Link>
        <h1 className="font-display text-[26px] font-light tracking-tight text-tinta">Resultado do mês</h1>
        <p className="text-[14px] text-cinza-fumo">O que entrou, para onde foi e quanto sobrou — pelo caixa.</p>
      </header>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-[18px] font-light text-tinta first-letter:uppercase">{mesLabel}</h2>
        <div className="flex items-center gap-1">
          <Link href={`/loja/${lojaId}/financeiro/dre?comp=${prev}`} aria-label="Mês anterior" className={navLink}>‹</Link>
          <Link href={`/loja/${lojaId}/financeiro/dre?comp=${next}`} aria-label="Próximo mês" className={navLink}>›</Link>
        </div>
      </div>

      {vazio ? (
        <p className="text-[15px] text-cinza-fumo">Nenhum movimento neste mês.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <section className="flex items-baseline justify-between border-b border-borda-suave pb-2">
            <span className={rotulo}>Recebimentos</span>
            <span className="font-display text-[16px] font-light tabular-nums text-tinta">{brl(dre.receitas)}</span>
          </section>

          <section className="flex flex-col gap-2">
            <span className={rotulo}>Despesas por categoria</span>
            {dre.despesas.length === 0 ? (
              <p className="text-[14px] text-cinza-fumo">Nenhuma despesa neste mês.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
                {dre.despesas.map((d) => (
                  <li key={d.rotulo} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <span className="text-[14px] text-tinta">{d.rotulo}</span>
                    <span className="shrink-0 text-[14px] tabular-nums text-grafite">− {brl(d.total)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <span className="text-[12px] uppercase tracking-[0.18em] text-cinza-fumo">Total de despesas</span>
                  <span className="shrink-0 text-[14px] font-light tabular-nums text-grafite">− {brl(dre.totalDespesas)}</span>
                </li>
              </ul>
            )}
          </section>

          <section className="flex items-baseline justify-between border-t border-borda-suave pt-3">
            <span className={rotulo}>Resultado do mês</span>
            <span className={`font-display text-[24px] font-light tabular-nums ${resultadoNegativo ? "text-bordo" : "text-tinta"}`}>{brl(dre.resultado)}</span>
          </section>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: tsc + conferir tokens**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo. Confirme os tokens (`text-tinta`, `text-cinza-fumo`, `text-grafite`, `text-bordo`, `bg-papel-elevado`, `bg-papel-suave`, `border-borda-suave`, `divide-borda-suave`, `font-display`, `--mn-radius-md`) em `src/app/globals.css` (todos já usados nas telas de projeção/cobrança). Troque se algum não existir.

- [ ] **Step 3: Link no Fluxo de caixa**

Abrir `src/app/(app)/loja/[lojaId]/financeiro/page.tsx`. No header (onde já há o link "Projeção de caixa →" da Fatia 1), adicionar ao lado:
```tsx
<Link href={`/loja/${lojaId}/financeiro/dre`} className="text-[13px] text-grafite hover:text-tinta">Resultado do mês →</Link>
```
(usar a mesma variável de loja e padrão de classe do link de Projeção já existente no arquivo.)

- [ ] **Step 4: Verificação final**

Run:
```bash
node node_modules/typescript/bin/tsc --noEmit
npx vitest run
```
Expected: tsc limpo; suíte verde (inclui `dre.test.ts`).

- [ ] **Step 5: Commit**
```bash
git add "src/app/(app)/loja/[lojaId]/financeiro/dre/page.tsx" "src/app/(app)/loja/[lojaId]/financeiro/page.tsx"
git commit -m "feat(financeiro): tela Resultado do mês (DRE por categoria) + link no Fluxo"
```

---

## Self-Review

**Cobertura do spec:** §6.1 `rotuloCategoria` → Task 1; §6.2 `dreDoMes` (receitas, despesas por categoria, ordenação, competência inválida) → Task 1; §7 tela (seletor de competência, receitas, despesas, resultado bordô, vazio) → Task 2; link do Fluxo → Task 2; §8 testes → Task 1.

**Placeholders:** nenhum — código/comando completos. A inserção do link (Task 2 Step 3) referencia o link de Projeção já existente como âncora.

**Consistência de tipos:** `DRE`/`LinhaDespesa` definidos na Task 1 e consumidos na Task 2 (`dre.receitas`, `dre.despesas[].rotulo/total`, `dre.totalDespesas`, `dre.resultado`). `ContaPagarTipo` (enum Prisma) usado em `rotuloCategoria` e no `Record` de rótulos. `dreDoMes(lojaId, comp)` chamado igual na tela.

**Escopo:** uma fatia (DRE), read-only, sem migração. Última das 3 melhorias do financeiro.
