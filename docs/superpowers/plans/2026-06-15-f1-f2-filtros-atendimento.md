# F1/F2 — Busca + filtros de atendimento: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar busca por noiva e filtros por vendedora/situação à fila `/atendimentos` e à semana do calendário, num bloco "Refinar" calmo (Concierge), sem client JS.

**Architecture:** Estende o núcleo `buscarAtendimentos`/`FiltroAtendimentos` (B3) com `vendedoraId`/`noivaBusca`; os wrappers `listarAtendimentos` e `atendimentosNoIntervalo` repassam os filtros. Um server component `RefinarAtendimentos` (`<details>` + `<form method="get">`) escreve os filtros em `searchParams`; a fila e a aba leem de volta. Vendedoras vêm de `listarEquipe`.

**Tech Stack:** Next 16 RSC, Prisma (Postgres), Tailwind v4 (tokens warm), Vitest contra Postgres real.

**Comandos do ambiente (`.bin` dá permission denied):**
- tsc: `node node_modules/typescript/bin/tsc --noEmit`
- vitest: `node node_modules/vitest/vitest.mjs run`

---

### Task 1: Núcleo — `FiltroAtendimentos` ganha `vendedoraId` e `noivaBusca` (TDD)

**Files:**
- Modify: `src/lib/atendimentos/atendimentos.ts` (type `FiltroAtendimentos` + corpo de `buscarAtendimentos`)
- Test: `src/lib/atendimentos/__tests__/atendimentos.test.ts`

- [ ] **Step 1: Escrever os testes (falham — campos não existem)**

Adicionar ao `describe("buscarAtendimentos ...")` existente (no fim do arquivo) estes dois `it`:

```ts
  it("filtra por vendedoraId", async () => {
    const db = tenantPrisma(prisma, loja);
    const i = (h: number) => new Date(`2099-11-01T${String(h).padStart(2, "0")}:00:00.000Z`);
    const u2 = await prisma.usuario.create({ data: { nome: `${MARK}Vend2`, email: `${MARK}v2-${Date.now()}@x.local`, senhaHash: "x" } });
    await prisma.usuarioLoja.create({ data: { usuarioId: u2.id, lojaId: loja, perfilId: "perfil-vendedora" } });
    const a1 = await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: i(9), tipo: "ATENDIMENTO", situacao: "AGENDADO" } as never });
    const a2 = await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: u2.id, inicio: i(10), tipo: "ATENDIMENTO", situacao: "AGENDADO" } as never });
    const so2 = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde: i(0), ate: i(23), vendedoraId: u2.id });
    expect(so2.map((r) => r.id)).toContain(a2.id);
    expect(so2.map((r) => r.id)).not.toContain(a1.id);
  });

  it("filtra por noivaBusca (contains, case-insensitive)", async () => {
    const db = tenantPrisma(prisma, loja);
    const i = (h: number) => new Date(`2099-11-02T${String(h).padStart(2, "0")}:00:00.000Z`);
    const marina = (await db.lead.create({ data: { noivaNome: `${MARK}Marina Silva` } as never })).id;
    const a = await db.atendimento.create({ data: { leadId: marina, cabineId: cabine, vendedoraId: vend, inicio: i(9), tipo: "ATENDIMENTO", situacao: "AGENDADO" } as never });
    const porMin = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde: i(0), ate: i(23), noivaBusca: "marina" });
    expect(porMin.map((r) => r.id)).toContain(a.id);
    const porMaiusc = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde: i(0), ate: i(23), noivaBusca: "MARINA" });
    expect(porMaiusc.map((r) => r.id)).toContain(a.id);
    const semMatch = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde: i(0), ate: i(23), noivaBusca: "zzzznao" });
    expect(semMatch.map((r) => r.id)).not.toContain(a.id);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/atendimentos.test.ts`
Expected: FAIL — `vendedoraId`/`noivaBusca` não existem em `FiltroAtendimentos` (erro de tipo no teste) OU os filtros são ignorados e o `not.toContain` falha.

- [ ] **Step 3: Estender o type e o where**

Em `src/lib/atendimentos/atendimentos.ts`, no type `FiltroAtendimentos`, adicionar dois campos:

```ts
export type FiltroAtendimentos = {
  tipo?: AtendimentoTipo;
  situacoes?: AtendimentoSituacao[];
  desde?: Date; // inicio >= desde
  ate?: Date; // inicio < ate
  ordem?: "asc" | "desc";
  vendedoraId?: string; // where.vendedoraId
  noivaBusca?: string; // contains no nome da noiva (case-insensitive)
};
```

No corpo de `buscarAtendimentos`, logo após o bloco que monta `where.inicio`, adicionar:

```ts
  if (filtro.vendedoraId) where.vendedoraId = filtro.vendedoraId;
  const q = filtro.noivaBusca?.trim();
  if (q) where.lead = { noivaNome: { contains: q, mode: "insensitive" } };
```

- [ ] **Step 4: Rodar — passam**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/atendimentos.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: tsc + commit**

Run: `node node_modules/typescript/bin/tsc --noEmit` → sem saída.

```bash
git add src/lib/atendimentos/atendimentos.ts src/lib/atendimentos/__tests__/atendimentos.test.ts
git commit -m "feat(atendimentos): FiltroAtendimentos ganha vendedoraId + noivaBusca

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `listarAtendimentos` repassa filtros + estreita por situação (TDD)

**Files:**
- Modify: `src/lib/atendimentos/atendimentos.ts` (`listarAtendimentos`)
- Test: `src/lib/atendimentos/__tests__/atendimentos.test.ts`

- [ ] **Step 1: Escrever o teste (falha — opts novos)**

Adicionar no `describe("atendimentos: ciclo de vida ...")` ou num describe próprio no fim do arquivo:

```ts
describe("listarAtendimentos — filtros (F2)", () => {
  it("situacao estreita o grupo aberto; noivaBusca filtra no histórico", async () => {
    const db = tenantPrisma(prisma, loja);
    const dora = (await db.lead.create({ data: { noivaNome: `${MARK}Dora Lima` } as never })).id;
    // aberto AGENDADO p/ Dora
    const r = await agendarAtendimento(loja, { leadId: dora, cabineId: cabine, vendedoraId: vend, dataYMD: "2099-12-01", hora: 9 });
    if (!r.ok) throw new Error("setup falhou");
    // outro aberto, EM_ATENDIMENTO, p/ outra noiva
    const r2 = await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2099-12-01", hora: 10 });
    if (!r2.ok) throw new Error("setup falhou");
    await iniciarAtendimento(loja, r2.atendimentoId);

    // situacao=AGENDADO → só o da Dora (não o EM_ATENDIMENTO)
    const soAgendados = await listarAtendimentos(loja, { situacao: "AGENDADO" });
    expect(soAgendados.some((a) => a.id === r.atendimentoId)).toBe(true);
    expect(soAgendados.some((a) => a.id === r2.atendimentoId)).toBe(false);

    // noivaBusca no histórico: conclui o da Dora e busca "dora" nos finalizados
    await concluirAtendimento(loja, r.atendimentoId, "RESERVOU");
    const hist = await listarAtendimentos(loja, { finalizados: true, noivaBusca: "dora" });
    expect(hist.some((a) => a.id === r.atendimentoId)).toBe(true);
    expect(hist.every((a) => (a.noivaNome ?? "").toLowerCase().includes("dora"))).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/atendimentos.test.ts`
Expected: FAIL — `situacao`/`noivaBusca` não existem em `opts`.

- [ ] **Step 3: Reescrever `listarAtendimentos`**

Substituir a função inteira por:

```ts
export async function listarAtendimentos(
  lojaId: string,
  opts: { finalizados?: boolean; vendedoraId?: string; noivaBusca?: string; situacao?: AtendimentoSituacao } = {},
): Promise<AtendimentoFila[]> {
  const grupo = opts.finalizados ? SITUACOES_FECHADAS : SITUACOES_ABERTAS;
  // situacao (singular) só estreita se pertencer ao grupo da vista atual; senão usa o grupo.
  const situacoes = opts.situacao && grupo.includes(opts.situacao) ? [opts.situacao] : grupo;
  const rows = await buscarAtendimentos(lojaId, {
    tipo: "ATENDIMENTO",
    situacoes,
    ordem: opts.finalizados ? "desc" : "asc",
    vendedoraId: opts.vendedoraId,
    noivaBusca: opts.noivaBusca,
  });
  return rows.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    situacao: a.situacao,
    desfecho: a.desfecho,
    atendidoEm: a.atendidoEm,
    noivaNome: a.noivaNome,
    leadId: a.leadId,
    cabineNome: a.cabineNome,
    vendedoraNome: a.vendedoraNome,
  }));
}
```

- [ ] **Step 4: Rodar — passam (inclusive os testes antigos de fila/histórico)**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/atendimentos.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc + commit**

Run: `node node_modules/typescript/bin/tsc --noEmit` → sem saída.

```bash
git add src/lib/atendimentos/atendimentos.ts src/lib/atendimentos/__tests__/atendimentos.test.ts
git commit -m "feat(atendimentos): listarAtendimentos aceita vendedora/noiva/situacao

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `atendimentosNoIntervalo` ganha 4º param `filtro` (TDD)

**Files:**
- Modify: `src/lib/calendario/dados.ts` (`atendimentosNoIntervalo`)
- Test: `src/lib/calendario/__tests__/dados.test.ts` (criar se não existir) — ver Step 1.

- [ ] **Step 1: Localizar/!criar teste e escrever o caso (falha)**

Primeiro verificar se já há teste do intervalo:

Run: `ls src/lib/calendario/__tests__/ 2>/dev/null && grep -rln "atendimentosNoIntervalo" src/lib/calendario/__tests__/ 2>/dev/null`

Se existir um arquivo que já cobre `atendimentosNoIntervalo`, adicionar o `it` abaixo nele. Se NÃO existir, criar `src/lib/calendario/__tests__/dados.test.ts` com este conteúdo:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { atendimentosNoIntervalo } from "@/lib/calendario/dados";

const MARK = "t-caldados-";
let loja = "", lead = "", cabine = "", vendA = "", vendB = "";
beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  lead = (await db.lead.create({ data: { noivaNome: `${MARK}Ana` } as never })).id;
  cabine = (await db.cabine.create({ data: { nome: `${MARK}C1` } as never })).id;
  const ua = await prisma.usuario.create({ data: { nome: `${MARK}A`, email: `${MARK}a-${Date.now()}@x.local`, senhaHash: "x" } });
  const ub = await prisma.usuario.create({ data: { nome: `${MARK}B`, email: `${MARK}b-${Date.now()}@x.local`, senhaHash: "x" } });
  vendA = ua.id; vendB = ub.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: ua.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  await prisma.usuarioLoja.create({ data: { usuarioId: ub.id, lojaId: loja, perfilId: "perfil-vendedora" } });
});
afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
  await prisma.$disconnect();
});

describe("atendimentosNoIntervalo — filtro (F2)", () => {
  it("filtra por vendedoraId dentro do intervalo", async () => {
    const db = tenantPrisma(prisma, loja);
    const i = (h: number) => new Date(`2099-07-01T${String(h).padStart(2, "0")}:00:00.000Z`);
    const a = await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vendA, inicio: i(9), tipo: "ATENDIMENTO", situacao: "AGENDADO" } as never });
    const b = await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vendB, inicio: i(10), tipo: "ATENDIMENTO", situacao: "AGENDADO" } as never });
    const desde = i(0), ate = i(23);
    const soA = await atendimentosNoIntervalo(loja, desde, ate, { vendedoraId: vendA });
    expect(soA.map((r) => r.id)).toContain(a.id);
    expect(soA.map((r) => r.id)).not.toContain(b.id);
    // sem filtro → ambos (backward-compat)
    const todos = await atendimentosNoIntervalo(loja, desde, ate);
    expect(todos.map((r) => r.id)).toEqual(expect.arrayContaining([a.id, b.id]));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/calendario/__tests__/dados.test.ts`
Expected: FAIL — `atendimentosNoIntervalo` ainda só aceita 3 args (o 4º causa erro de tipo).

- [ ] **Step 3: Estender a função**

Em `src/lib/calendario/dados.ts`, substituir `atendimentosNoIntervalo` por:

```ts
/** Atendimentos da loja com início em [inicio, fim), por horário asc. Filtro opcional (F2). */
export async function atendimentosNoIntervalo(
  lojaId: string,
  inicio: Date,
  fim: Date,
  filtro: { vendedoraId?: string; noivaBusca?: string; situacao?: AtendimentoSituacao } = {},
): Promise<AtendimentoCalendario[]> {
  const rows = await buscarAtendimentos(lojaId, {
    tipo: "ATENDIMENTO",
    desde: inicio,
    ate: fim,
    vendedoraId: filtro.vendedoraId,
    noivaBusca: filtro.noivaBusca,
    situacoes: filtro.situacao ? [filtro.situacao] : undefined,
  });
  return rows.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    situacao: a.situacao,
    noivaNome: a.noivaNome,
    leadId: a.leadId,
  }));
}
```

(`AtendimentoSituacao` já está importado em `dados.ts`; `buscarAtendimentos` também — de B3.)

- [ ] **Step 4: Rodar — passa**

Run: `node node_modules/vitest/vitest.mjs run src/lib/calendario/__tests__/dados.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc + commit**

Run: `node node_modules/typescript/bin/tsc --noEmit` → sem saída.

```bash
git add src/lib/calendario/dados.ts src/lib/calendario/__tests__/dados.test.ts
git commit -m "feat(calendario): atendimentosNoIntervalo aceita filtro (vendedora/noiva/situacao)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Componente `RefinarAtendimentos` (server)

**Files:**
- Create: `src/components/atendimentos/refinar.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/atendimentos/refinar.tsx
// Filtro calmo "Refinar" (Concierge): <details> + <form method="get"> que escreve
// q/vendedora/situacao em searchParams. Sem client JS. Server component.
import Link from "next/link";
import { botaoSuave } from "@/components/ui/acoes";

const campo =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta " +
  "transition-colors duration-150 hover:border-cinza-fumo focus:border-tinta focus:outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const rotulo = "text-[11px] uppercase tracking-[0.18em] text-cinza-fumo";

export function RefinarAtendimentos({
  action,
  vendedoras,
  situacoes,
  hidden,
  valores,
  temFiltro,
}: {
  action: string;
  vendedoras: { id: string; nome: string }[];
  situacoes: { value: string; rotulo: string }[];
  hidden: { name: string; value: string }[];
  valores: { q?: string; vendedora?: string; situacao?: string };
  temFiltro: boolean;
}) {
  const limparHref =
    action + (hidden.length ? "?" + hidden.map((h) => `${h.name}=${encodeURIComponent(h.value)}`).join("&") : "");
  return (
    <details open={temFiltro} className="rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
        Refinar
        {temFiltro && <span className="inline-block h-1.5 w-1.5 rounded-full bg-bordo" aria-label="filtro ativo" />}
      </summary>
      <form method="get" action={action} className="flex flex-wrap items-end gap-3 border-t border-borda-suave px-4 py-3">
        {hidden.map((h) => (
          <input key={h.name} type="hidden" name={h.name} value={h.value} />
        ))}
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Noiva</span>
          <input type="search" name="q" defaultValue={valores.q ?? ""} placeholder="Buscar noiva" className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Vendedora</span>
          <select name="vendedora" defaultValue={valores.vendedora ?? ""} className={campo}>
            <option value="">Todas as vendedoras</option>
            {vendedoras.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Situação</span>
          <select name="situacao" defaultValue={valores.situacao ?? ""} className={campo}>
            <option value="">Todas</option>
            {situacoes.map((s) => (
              <option key={s.value} value={s.value}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" className={botaoSuave}>
            Refinar
          </button>
          {temFiltro && (
            <Link
              href={limparHref}
              className="text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne"
            >
              Limpar
            </Link>
          )}
        </div>
      </form>
    </details>
  );
}
```

- [ ] **Step 2: tsc (garante imports/tokens válidos)**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add src/components/atendimentos/refinar.tsx
git commit -m "feat(atendimentos): componente RefinarAtendimentos (filtro calmo, GET form)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire na fila `/atendimentos`

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/atendimentos/page.tsx`

- [ ] **Step 1: Imports + leitura dos filtros**

No topo do arquivo, adicionar imports:

```ts
import { listarEquipe } from "@/lib/admin/usuarios";
import { RefinarAtendimentos } from "@/components/atendimentos/refinar";
```

Trocar a assinatura de `searchParams` da `AtendimentosPage` para incluir os filtros:

```ts
  searchParams: Promise<{ ok?: string; erro?: string; quando?: string; q?: string; vendedora?: string; situacao?: string }>;
```

E logo após `const historico = quando === "historico";`, ler/validar os filtros (substituindo a desestruturação atual de `searchParams`):

```ts
  const { ok, erro, quando, q, vendedora, situacao } = await searchParams;
  const historico = quando === "historico";

  // Situações válidas DESTA vista (abertas na fila, fechadas no histórico).
  const opcoesSituacao: { value: AtendimentoSituacao; rotulo: string }[] = historico
    ? [{ value: "CONCLUIDO", rotulo: "Concluído" }, { value: "FALTOU", rotulo: "Faltou" }]
    : [{ value: "AGENDADO", rotulo: "Agendado" }, { value: "EM_ATENDIMENTO", rotulo: "Em atendimento" }];
  const situacaoValida = opcoesSituacao.find((o) => o.value === situacao)?.value;
  const buscaNoiva = q?.trim() || undefined;
  const temFiltro = Boolean(buscaNoiva || vendedora || situacaoValida);
```

> Observação: remover a linha original `const { ok, erro, quando } = await searchParams;` e a linha `const historico = ...` que ela acompanhava — ficam substituídas pelo bloco acima.

- [ ] **Step 2: Passar filtros à leitura + buscar equipe**

Trocar:

```ts
  const lista = await listarAtendimentos(sc.loja.id, { finalizados: historico });
```

por:

```ts
  const [lista, equipe] = await Promise.all([
    listarAtendimentos(sc.loja.id, {
      finalizados: historico,
      vendedoraId: vendedora || undefined,
      noivaBusca: buscaNoiva,
      situacao: situacaoValida,
    }),
    listarEquipe(sc.loja.id),
  ]);
```

- [ ] **Step 3: Renderizar o Refinar + estado vazio com filtro**

Logo após o bloco `{aviso && <AvisoFlash ...>}` e ANTES do `{historico ? (...) : (...)}`, inserir:

```tsx
      <RefinarAtendimentos
        action={`/loja/${lojaId}/atendimentos`}
        vendedoras={equipe.map((e) => ({ id: e.id, nome: e.nome }))}
        situacoes={opcoesSituacao.map((o) => ({ value: o.value, rotulo: o.rotulo }))}
        hidden={historico ? [{ name: "quando", value: "historico" }] : []}
        valores={{ q: buscaNoiva, vendedora: vendedora || undefined, situacao: situacaoValida }}
        temFiltro={temFiltro}
      />

      {temFiltro && lista.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] text-tinta">Nenhum atendimento com esses filtros.</p>
          <Link href={historico ? `/loja/${lojaId}/atendimentos?quando=historico` : `/loja/${lojaId}/atendimentos`} className={botaoSuave}>
            Limpar filtros
          </Link>
        </div>
      )}
```

Para não duplicar o estado-vazio, envolver o bloco `{historico ? (...) : (...)}` existente com a condição de que NÃO seja "vazio-com-filtro":

```tsx
      {!(temFiltro && lista.length === 0) && (historico ? (
        // ... bloco existente do histórico ...
      ) : (
        // ... bloco existente da fila (atrasados/hoje/próximos) ...
      ))}
```

(Manter o conteúdo interno dos dois ramos exatamente como está hoje — só adicionar o wrapper condicional.)

- [ ] **Step 4: tsc + suíte**

Run: `node node_modules/typescript/bin/tsc --noEmit` → sem saída.
Run: `node node_modules/vitest/vitest.mjs run` → tudo verde.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/atendimentos/page.tsx"
git commit -m "feat(atendimentos): Refinar (busca+vendedora+situacao) na fila

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Wire na semana (`AbaAtendimentos` + `calendario/page.tsx`)

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/calendario/page.tsx`
- Modify: `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaAtendimentos.tsx`

- [ ] **Step 1: `calendario/page.tsx` — ler e repassar os filtros**

Na assinatura de `searchParams` da `CalendarioPage`, adicionar `q`, `vendedora`, `situacao`:

```ts
  searchParams: Promise<{ aba?: string; ref?: string; dia?: string; ini?: string; fim?: string; ok?: string; erro?: string; q?: string; vendedora?: string; situacao?: string }>;
```

E trocar a renderização da aba atendimentos no mapa `satisfies Record<AbaId, ReactNode>`:

```tsx
              atendimentos: <AbaAtendimentos lojaId={lojaId} refParam={sp.ref} filtros={{ q: sp.q, vendedora: sp.vendedora, situacao: sp.situacao }} />,
```

- [ ] **Step 2: `AbaAtendimentos` — imports + assinatura**

No topo, adicionar imports:

```ts
import { listarEquipe } from "@/lib/admin/usuarios";
import { RefinarAtendimentos } from "@/components/atendimentos/refinar";
```

Trocar a assinatura:

```ts
export async function AbaAtendimentos({
  lojaId,
  refParam,
  filtros = {},
}: {
  lojaId: string;
  refParam?: string;
  filtros?: { q?: string; vendedora?: string; situacao?: string };
}) {
```

- [ ] **Step 3: `AbaAtendimentos` — validar filtros, buscar equipe, filtrar a leitura**

Logo após `const dias = diasDaSemana(inicioSemana);`, adicionar:

```ts
  const SIT_VALIDAS: { value: AtendimentoSituacao; rotulo: string }[] = [
    { value: "AGENDADO", rotulo: "Agendado" },
    { value: "EM_ATENDIMENTO", rotulo: "Em atendimento" },
    { value: "CONCLUIDO", rotulo: "Concluído" },
    { value: "FALTOU", rotulo: "Faltou" },
  ];
  const situacao = SIT_VALIDAS.find((s) => s.value === filtros.situacao)?.value;
  const buscaNoiva = filtros.q?.trim() || undefined;
  const vendedoraId = filtros.vendedora || undefined;
  const temFiltro = Boolean(buscaNoiva || vendedoraId || situacao);
  const equipe = await listarEquipe(lojaId);
```

Trocar a leitura:

```ts
  const atendimentos = await atendimentosNoIntervalo(lojaId, inicioSemana, fim);
```

por:

```ts
  const atendimentos = await atendimentosNoIntervalo(lojaId, inicioSemana, fim, {
    vendedoraId,
    noivaBusca: buscaNoiva,
    situacao,
  });
```

- [ ] **Step 4: `AbaAtendimentos` — preservar filtros na navegação ‹ ›**

Trocar:

```ts
  const link = (d: Date) => `/loja/${lojaId}/calendario?aba=atendimentos&ref=${refDaSemana(d)}`;
```

por:

```ts
  const filtroQS = [
    buscaNoiva ? `q=${encodeURIComponent(buscaNoiva)}` : "",
    vendedoraId ? `vendedora=${encodeURIComponent(vendedoraId)}` : "",
    situacao ? `situacao=${encodeURIComponent(situacao)}` : "",
  ]
    .filter(Boolean)
    .join("&");
  const link = (d: Date) =>
    `/loja/${lojaId}/calendario?aba=atendimentos&ref=${refDaSemana(d)}${filtroQS ? `&${filtroQS}` : ""}`;
```

- [ ] **Step 5: `AbaAtendimentos` — renderizar o Refinar acima da grade**

No JSX retornado, logo após a abertura `<div className="flex flex-col gap-4">` e ANTES do cabeçalho `<div className="flex items-start justify-between">`, inserir:

```tsx
      <RefinarAtendimentos
        action={`/loja/${lojaId}/calendario`}
        vendedoras={equipe.map((e) => ({ id: e.id, nome: e.nome }))}
        situacoes={SIT_VALIDAS.map((s) => ({ value: s.value, rotulo: s.rotulo }))}
        hidden={[
          { name: "aba", value: "atendimentos" },
          ...(refParam ? [{ name: "ref", value: refParam }] : []),
        ]}
        valores={{ q: buscaNoiva, vendedora: vendedoraId, situacao }}
        temFiltro={temFiltro}
      />
```

- [ ] **Step 6: tsc + suíte**

Run: `node node_modules/typescript/bin/tsc --noEmit` → sem saída.
Run: `node node_modules/vitest/vitest.mjs run` → tudo verde.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/calendario/page.tsx" "src/app/(app)/loja/[lojaId]/calendario/_abas/AbaAtendimentos.tsx"
git commit -m "feat(calendario): Refinar (busca+vendedora+situacao) na semana de atendimentos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Revisão de design + docs

**Files:**
- Modify: `docs/estado-atual.md`

- [ ] **Step 1: Rodar a skill `atelier-design-review`**

Invocar a skill `atelier-design-review` apontando para a fila `/atendimentos` e a aba de atendimentos do calendário, focando o bloco "Refinar": calma visual, bordô só no foco/ponto-de-filtro-ativo, nada de cara de ERP, microcopy humano. Aplicar correções pequenas que ela apontar (sem mudar regra/rota).

- [ ] **Step 2: Gate final**

Run: `node node_modules/vitest/vitest.mjs run && node node_modules/typescript/bin/tsc --noEmit`
Expected: suíte verde; tsc limpo.

- [ ] **Step 3: Anotar F1/F2 no estado-atual**

Marcar **F1/F2** ✅ na seção "Backlog priorizado": busca por noiva + filtros vendedora/situação via `RefinarAtendimentos` (`<details>`/GET, sem client JS) na fila e na semana; núcleo estendido com `vendedoraId`/`noivaBusca`; situação estreita o grupo da vista.

- [ ] **Step 4: Commit**

```bash
git add docs/estado-atual.md src/
git commit -m "docs(estado-atual): F1/F2 (busca+filtros de atendimento) entregue

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
