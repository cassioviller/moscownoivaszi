# Projeção de caixa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao gestor a projeção de caixa dia a dia — a partir de um saldo de referência, somar recebíveis e subtrair contas a pagar por vencimento e responder "em que dia o caixa fica negativo?".

**Architecture:** Uma tabela de configuração (`SaldoReferencia`) ancorada por data; um motor de leitura quase puro (`projecao.ts` com a matemática pura em `montarCurva`) reusando o realizado de `fluxo.ts` e os resumos de atraso de `receber.ts`/`pagar.ts`; uma tela `/financeiro/projecao` (server) com o saldo de hoje, bloco "Em atraso" fora da curva, a curva dia a dia e seletor de horizonte; e uma Server Action que registra o saldo de referência.

**Tech Stack:** Next.js 16 (App Router, Server Components, `force-dynamic`), Prisma 7 (driver adapter pg; client gerado em `src/generated/prisma`), Tailwind v4, vitest (integração com Postgres real), TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-14-projecao-de-caixa-design.md`.

**Convenções do repo (ler antes de começar):**
- Commits **direto na `main`** (sem branch/worktree). Antes de cada commit: `node node_modules/typescript/bin/tsc --noEmit` limpo e `npx vitest run` verde. (O binário `.bin/tsc` está sem permissão de execução; rode via `node`.)
- **Após mudar o schema, rode `node node_modules/prisma/build/index.js generate`** — o `migrate dev` nem sempre regenera o client no output custom (`src/generated/prisma`), e o runtime falha com `prisma.<model>` undefined mesmo com `tsc` limpo.
- Dinheiro em **centavos** via `@/lib/dinheiro`: `paraCentavos(input)` (entrada do usuário, ≥0, lança se inválido), `deCentavos(c)` → `"1234.56"`, `decParaCentavos(string|Decimal|null)` → centavos (aceita negativo), `decParaString(Decimal)` → `"1234.56"`, `brl("1234.56")` → `"R$ 1.234,56"` (aceita negativo).
- Dia-calendário = meia-noite UTC do dia em São Paulo. `@/lib/tempo`: `hojeUTC()`, `ymd(date)`, `meiaNoiteUTC(ymd)`. `@/lib/financeiro/datas`: `diaParaData(ymd)` (parsing **estrito**, valida calendário, lança).
- Toda leitura/escrita de modelo de loja passa por `tenantPrisma(prisma, lojaId)`. Em `create`, use `as never` (o guard injeta `lojaId` em runtime; o tipo exige).
- Testes de integração: dados com prefixo `MARK`, limpeza em `afterAll`. Modelo: `src/lib/calendario/__tests__/dia.test.ts`.
- Gate de página: `exigirAcesso("financeiro")` (`@/lib/server/acoes`). Gate de ação: `acaoAutorizada("financeiro", "editar", corpo)` (`@/lib/server/acoes`); helpers de form `str`/`comAviso`/`destino` (`@/lib/server/form`).

---

## File Structure

**Criar:**
- `prisma/migrations/<timestamp>_saldo_referencia/migration.sql` — gerada por `migrate dev`.
- `src/lib/financeiro/projecao.ts` — `montarCurva` (pura) + `projecaoCaixa` (orquestra leitura) + tipos.
- `src/lib/financeiro/saldo-referencia.ts` — `definirSaldoReferencia` (escrita), `ancoraAtiva` e `saldoDeHoje` (leitura da âncora + realizado).
- `src/lib/financeiro/__tests__/projecao.test.ts` — unit (pura `montarCurva`) + integração (`projecaoCaixa`).
- `src/lib/financeiro/__tests__/saldo-referencia.test.ts` — integração (`definirSaldoReferencia`/`ancoraAtiva`/`saldoDeHoje`).
- `src/app/(app)/loja/[lojaId]/financeiro/projecao/page.tsx` — a tela.
- `src/app/(app)/loja/[lojaId]/financeiro/projecao/actions.ts` — `definirSaldoReferenciaAction`.

**Modificar:**
- `prisma/schema.prisma` — model `SaldoReferencia` + back-relation em `Loja`.
- `src/lib/tenant.ts` — `SaldoReferencia` em `TENANT_MODELS`.
- `src/app/(app)/loja/[lojaId]/financeiro/page.tsx` — link "Projeção" no header.

**Responsabilidades:**
- `saldo-referencia.ts` = tudo da entidade-âncora (ler+escrever juntos, mudam juntos).
- `projecao.ts` = matemática da curva (pura, testável) + montagem da projeção (lê parcelas/contas, chama `saldoDeHoje`, agrega atraso). Read-only.

---

## Task 1: Schema `SaldoReferencia` + migração + tenant

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/tenant.ts:30-51`
- Create: `prisma/migrations/<timestamp>_saldo_referencia/migration.sql` (gerada)

- [ ] **Step 1: Adicionar o model ao schema**

Em `prisma/schema.prisma`, adicionar o model (perto dos demais modelos financeiros):

```prisma
model SaldoReferencia {
  id             String   @id @default(cuid())
  lojaId         String
  dataReferencia DateTime
  valor          Decimal  @db.Decimal(10, 2)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  loja Loja @relation(fields: [lojaId], references: [id], onDelete: Cascade)

  @@index([lojaId, dataReferencia])
}
```

- [ ] **Step 2: Adicionar a back-relation em `Loja`**

No `model Loja`, na lista de relações (logo após `comissaoFechamentos  ComissaoFechamento[]`):

```prisma
  saldosReferencia     SaldoReferencia[]
```

- [ ] **Step 3: Registrar em `TENANT_MODELS`**

Em `src/lib/tenant.ts`, dentro do array `TENANT_MODELS` (após `"ComissaoFechamento",`):

```ts
  "SaldoReferencia",
```

- [ ] **Step 4: Gerar a migração e o client**

Run:
```bash
node node_modules/prisma/build/index.js migrate dev --name saldo_referencia
node node_modules/prisma/build/index.js generate
```
Expected: migração criada em `prisma/migrations/<timestamp>_saldo_referencia/migration.sql` com `CREATE TABLE "SaldoReferencia"`; client regenerado sem erro.

- [ ] **Step 5: Verificar tsc**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem saída (limpo). O tipo `prisma.saldoReferencia` passa a existir.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/tenant.ts src/generated/prisma
git commit -m "feat(financeiro): tabela SaldoReferencia (âncora da projeção de caixa)"
```

---

## Task 2: `montarCurva` (matemática pura da curva)

**Files:**
- Create: `src/lib/financeiro/projecao.ts`
- Test: `src/lib/financeiro/__tests__/projecao.test.ts`

- [ ] **Step 1: Escrever os testes que falham (puros)**

Criar `src/lib/financeiro/__tests__/projecao.test.ts`:

```ts
// Unit (puro): montarCurva aplica eventos por dia sobre um saldo de partida (centavos).
import { describe, it, expect } from "vitest";
import { montarCurva, type EventoDia } from "@/lib/financeiro/projecao";

const d = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ev = (ymd: string, entradasC: number, saidasC: number): EventoDia => ({ ymd, data: d(ymd), entradasC, saidasC });

describe("montarCurva", () => {
  it("sem eventos: curva vazia, sem dia negativo, menor saldo = saldo de hoje", () => {
    const c = montarCurva(800000, []);
    expect(c.linhas).toEqual([]);
    expect(c.diaNegativo).toBeNull();
    expect(c.menorSaldo).toEqual({ data: null, valor: "8000.00" });
  });

  it("fica negativo num dia → diaNegativo é aquele dia", () => {
    const c = montarCurva(100000, [ev("2026-06-20", 0, 250000)]);
    expect(c.linhas[0].saldoApos).toBe("-1500.00");
    expect(c.diaNegativo).toEqual(d("2026-06-20"));
  });

  it("afunda e recupera depois → menor saldo é no fundo, não no fim", () => {
    const c = montarCurva(500000, [ev("2026-06-15", 0, 400000), ev("2026-06-25", 600000, 0)]);
    expect(c.linhas.at(-1)!.saldoApos).toBe("7000.00");
    expect(c.menorSaldo).toEqual({ data: d("2026-06-15"), valor: "1000.00" });
  });

  it("borda exatamente zero não conta como negativa", () => {
    const c = montarCurva(300000, [ev("2026-06-18", 0, 300000)]);
    expect(c.linhas[0].saldoApos).toBe("0.00");
    expect(c.diaNegativo).toBeNull();
  });

  it("dois eventos no mesmo dia somam numa linha só", () => {
    const c = montarCurva(0, [ev("2026-06-12", 150000, 0), ev("2026-06-12", 0, 50000)]);
    expect(c.linhas).toHaveLength(1);
    expect(c.linhas[0]).toMatchObject({ entradas: "1500.00", saidas: "500.00", saldoApos: "1000.00" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/__tests__/projecao.test.ts`
Expected: FAIL — `montarCurva` não existe / módulo não encontrado.

- [ ] **Step 3: Implementar `montarCurva` + tipos**

Criar `src/lib/financeiro/projecao.ts`:

```ts
// src/lib/financeiro/projecao.ts
// Projeção de caixa: a partir de um saldo de partida (centavos), aplica os eventos
// previstos por dia e devolve a curva dia a dia, o menor saldo e o primeiro dia negativo.
// montarCurva é PURA (testável isolada). projecaoCaixa (abaixo) lê parcelas/contas.
import { deCentavos } from "@/lib/dinheiro";

export type EventoDia = { ymd: string; data: Date; entradasC: number; saidasC: number };
export type LinhaCurva = { data: Date; entradas: string; saidas: string; saldoApos: string };
export type Curva = {
  linhas: LinhaCurva[];
  menorSaldo: { data: Date | null; valor: string }; // data null = hoje (o saldo de partida é o piso)
  diaNegativo: Date | null; // primeiro dia com saldo < 0; null se nunca
};

/** Aplica os eventos (agrupados por dia) sobre o saldo de hoje em centavos. Puro. */
export function montarCurva(saldoHojeC: number, eventos: EventoDia[]): Curva {
  // Agrupa por dia somando entradas/saídas do mesmo dia.
  const porDia = new Map<string, { data: Date; entradasC: number; saidasC: number }>();
  for (const e of eventos) {
    const d = porDia.get(e.ymd);
    if (d) { d.entradasC += e.entradasC; d.saidasC += e.saidasC; }
    else porDia.set(e.ymd, { data: e.data, entradasC: e.entradasC, saidasC: e.saidasC });
  }
  const ordenados = [...porDia.values()].sort((a, b) => a.data.getTime() - b.data.getTime());

  let saldoC = saldoHojeC;
  let menorC = saldoHojeC; // o piso começa no saldo de partida
  let menorData: Date | null = null;
  let diaNegativo: Date | null = null;

  const linhas: LinhaCurva[] = ordenados.map((e) => {
    saldoC += e.entradasC - e.saidasC;
    if (saldoC < menorC) { menorC = saldoC; menorData = e.data; }
    if (diaNegativo === null && saldoC < 0) diaNegativo = e.data;
    return { data: e.data, entradas: deCentavos(e.entradasC), saidas: deCentavos(e.saidasC), saldoApos: deCentavos(saldoC) };
  });

  return { linhas, menorSaldo: { data: menorData, valor: deCentavos(menorC) }, diaNegativo };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/__tests__/projecao.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: tsc + commit**

```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/lib/financeiro/projecao.ts src/lib/financeiro/__tests__/projecao.test.ts
git commit -m "feat(financeiro): montarCurva — matemática pura da projeção de caixa"
```

---

## Task 3: `saldo-referencia.ts` — âncora (escrita + leitura)

**Files:**
- Create: `src/lib/financeiro/saldo-referencia.ts`
- Test: `src/lib/financeiro/__tests__/saldo-referencia.test.ts`

- [ ] **Step 1: Escrever o teste de integração que falha**

Criar `src/lib/financeiro/__tests__/saldo-referencia.test.ts`:

```ts
// Integração: definirSaldoReferencia grava a âncora; ancoraAtiva pega a mais recente ≤ hoje;
// saldoDeHoje = âncora + realizado(âncora→hoje). Escopo de loja.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC, ymd } from "@/lib/tempo";
import { definirSaldoReferencia, ancoraAtiva, saldoDeHoje } from "@/lib/financeiro/saldo-referencia";

const MARK = "t-saldo-ref-";
let loja = "";
let noiva = "";
let vendedora = "";

const hoje = hojeUTC();
const menos = (n: number) => { const d = new Date(hoje.getTime()); d.setUTCDate(d.getUTCDate() - n); return d; };
const ymdMenos = (n: number) => ymd(menos(n))!;

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Noiva`, etapa: "NOVO" } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}Vend`, email: `${MARK}${noiva}@x.local`, senhaHash: "x" } });
  vendedora = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  // Âncora: saldo 5000 em (hoje-5).
  await definirSaldoReferencia(loja, { data: ymdMenos(5), valor: "5000,00" });
  // Realizado entre a âncora e hoje: uma parcela PAGA de 1000 recebida em (hoje-2).
  const contrato = await db.contrato.create({ data: { leadId: noiva, vendedoraId: vendedora, valorTotal: 1000 } as never });
  await db.parcela.create({
    data: { contratoId: contrato.id, numero: 1, valorPrevisto: 1000, vencimento: menos(2), status: "PAGA", valorRecebido: 1000, recebidoEm: menos(2) } as never,
  });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("saldo-referencia", () => {
  it("ancoraAtiva pega a âncora mais recente ≤ hoje", async () => {
    const a = await ancoraAtiva(loja);
    expect(a).not.toBeNull();
    expect(a!.valor).toBe("5000.00");
  });

  it("definirSaldoReferencia rejeita data futura", async () => {
    const r = await definirSaldoReferencia(loja, { data: ymd(new Date(hoje.getTime() + 86_400_000))!, valor: "100" });
    expect(r).toEqual({ ok: false, motivo: "data_invalida" });
  });

  it("definirSaldoReferencia rejeita valor inválido", async () => {
    const r = await definirSaldoReferencia(loja, { data: ymdMenos(1), valor: "abc" });
    expect(r).toEqual({ ok: false, motivo: "valor_invalido" });
  });

  it("saldoDeHoje = âncora + realizado(âncora→hoje)", async () => {
    const s = await saldoDeHoje(loja);
    expect(s.ancora).not.toBeNull();
    expect(s.valor).toBe("6000.00"); // 5000 + 1000 recebido
  });

  it("sem âncora: saldoDeHoje devolve valor null", async () => {
    const outra = (await prisma.loja.create({ data: { nome: `${MARK}vazia` } })).id;
    const s = await saldoDeHoje(outra);
    expect(s).toEqual({ valor: null, ancora: null });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/__tests__/saldo-referencia.test.ts`
Expected: FAIL — módulo `saldo-referencia` não existe.

- [ ] **Step 3: Implementar `saldo-referencia.ts`**

Criar `src/lib/financeiro/saldo-referencia.ts`:

```ts
// src/lib/financeiro/saldo-referencia.ts
// O ponto de partida da projeção de caixa. Histórico leve: cada registro é uma âncora
// datada; a mais recente com dataReferencia ≤ hoje é a ativa. Convenção: `valor` é o saldo
// no INÍCIO de dataReferencia, então o realizado a somar conta [dataReferencia, hoje].
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC } from "@/lib/tempo";
import { diaParaData } from "@/lib/financeiro/datas";
import { paraCentavos, deCentavos, decParaCentavos, decParaString } from "@/lib/dinheiro";
import { resumoCaixaIntervalo } from "@/lib/financeiro/fluxo";

export type Ancora = { data: Date; valor: string };

export type ResultadoSaldo = { ok: true } | { ok: false; motivo: "data_invalida" | "valor_invalido" };

/** Registra uma nova âncora de saldo. data ≤ hoje; valor ≥ 0 (entrada do usuário). */
export async function definirSaldoReferencia(lojaId: string, input: { data: string; valor: string }): Promise<ResultadoSaldo> {
  let dataRef: Date;
  try {
    dataRef = diaParaData(input.data);
  } catch {
    return { ok: false, motivo: "data_invalida" };
  }
  if (dataRef.getTime() > hojeUTC().getTime()) return { ok: false, motivo: "data_invalida" };
  let valorC: number;
  try {
    valorC = paraCentavos(input.valor);
  } catch {
    return { ok: false, motivo: "valor_invalido" };
  }
  await tenantPrisma(prisma, lojaId).saldoReferencia.create({
    data: { dataReferencia: dataRef, valor: deCentavos(valorC) } as never,
  });
  return { ok: true };
}

/** A âncora ativa: o registro mais recente com dataReferencia ≤ hoje. */
export async function ancoraAtiva(lojaId: string): Promise<Ancora | null> {
  const row = await tenantPrisma(prisma, lojaId).saldoReferencia.findFirst({
    where: { dataReferencia: { lte: hojeUTC() } },
    orderBy: { dataReferencia: "desc" },
  });
  return row ? { data: row.dataReferencia, valor: decParaString(row.valor) } : null;
}

/** Saldo de hoje = âncora + realizado [âncora, hoje]. Sem âncora → valor null. */
export async function saldoDeHoje(lojaId: string): Promise<{ valor: string | null; ancora: Ancora | null }> {
  const ancora = await ancoraAtiva(lojaId);
  if (!ancora) return { valor: null, ancora: null };
  const lt = new Date(hojeUTC().getTime());
  lt.setUTCDate(lt.getUTCDate() + 1); // inclui o dia de hoje
  const realizado = await resumoCaixaIntervalo(lojaId, { gte: ancora.data, lt });
  const valorC = decParaCentavos(ancora.valor) + decParaCentavos(realizado.saldo);
  return { valor: deCentavos(valorC), ancora };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/financeiro/__tests__/saldo-referencia.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: tsc + commit**

```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/lib/financeiro/saldo-referencia.ts src/lib/financeiro/__tests__/saldo-referencia.test.ts
git commit -m "feat(financeiro): saldo de referência (âncora) — escrita + saldoDeHoje"
```

---

## Task 4: `projecaoCaixa` (orquestra a leitura)

**Files:**
- Modify: `src/lib/financeiro/projecao.ts`
- Test: `src/lib/financeiro/__tests__/projecao.test.ts` (acrescentar bloco de integração)

- [ ] **Step 1: Acrescentar o teste de integração que falha**

No fim de `src/lib/financeiro/__tests__/projecao.test.ts`, adicionar os imports e um novo `describe`. Atualizar a primeira linha de import para incluir `projecaoCaixa`:

```ts
import { montarCurva, projecaoCaixa, type EventoDia } from "@/lib/financeiro/projecao";
```

E acrescentar no fim do arquivo:

```ts
import { beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC, ymd } from "@/lib/tempo";
import { definirSaldoReferencia } from "@/lib/financeiro/saldo-referencia";

const MARK = "t-projecao-";
let lojaP = "";
let noivaP = "";
let vendP = "";

const hojeP = hojeUTC();
const maisP = (n: number) => { const d = new Date(hojeP.getTime()); d.setUTCDate(d.getUTCDate() + n); return d; };
const menosP = (n: number) => maisP(-n);

beforeAll(async () => {
  lojaP = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, lojaP);
  noivaP = (await db.lead.create({ data: { noivaNome: `${MARK}Noiva`, etapa: "NOVO" } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}V`, email: `${MARK}${noivaP}@x.local`, senhaHash: "x" } });
  vendP = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: lojaP, perfilId: "perfil-vendedora" } });
  await definirSaldoReferencia(lojaP, { data: ymd(hojeP)!, valor: "8000,00" });
  const contrato = await db.contrato.create({ data: { leadId: noivaP, vendedoraId: vendP, valorTotal: 9999 } as never });
  // Recebível DENTRO do horizonte (hoje+10) e contas DENTRO (hoje+15).
  await db.parcela.create({ data: { contratoId: contrato.id, numero: 1, valorPrevisto: 1500, vencimento: maisP(10) } as never });
  await db.contaPagar.create({ data: { tipo: "DESPESA", descricao: `${MARK}Aluguel`, valorPrevisto: 3000, vencimento: maisP(15) } as never });
  // Recebível FORA do horizonte (hoje+200) — não entra na curva de 90 dias.
  await db.parcela.create({ data: { contratoId: contrato.id, numero: 2, valorPrevisto: 5000, vencimento: maisP(200) } as never });
  // Vencidos em aberto (hoje-3 receber; hoje-2 pagar) — vão para emAtraso, não para a curva.
  await db.parcela.create({ data: { contratoId: contrato.id, numero: 3, valorPrevisto: 2000, vencimento: menosP(3) } as never });
  await db.contaPagar.create({ data: { tipo: "DESPESA", descricao: `${MARK}Atrasada`, valorPrevisto: 1200, vencimento: menosP(2) } as never });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("projecaoCaixa", () => {
  it("saldo de hoje vem da âncora", async () => {
    const p = await projecaoCaixa(lojaP, { horizonteDias: 90 });
    expect(p.saldoHoje).toBe("8000.00");
  });

  it("a curva inclui o que vence dentro do horizonte e exclui o que vence fora", async () => {
    const p = await projecaoCaixa(lojaP, { horizonteDias: 90 });
    const dias = p.curva.linhas.map((l) => ymd(l.data));
    expect(dias).toContain(ymd(maisP(10))); // recebível dentro
    expect(dias).toContain(ymd(maisP(15))); // conta dentro
    expect(dias).not.toContain(ymd(maisP(200))); // fora do horizonte
  });

  it("os vencidos em aberto vão para emAtraso, nunca para a curva", async () => {
    const p = await projecaoCaixa(lojaP, { horizonteDias: 90 });
    const dias = p.curva.linhas.map((l) => ymd(l.data));
    expect(dias).not.toContain(ymd(menosP(3)));
    expect(dias).not.toContain(ymd(menosP(2)));
    expect(p.emAtraso.aReceber).toBe("2000.00");
    expect(p.emAtraso.aPagar).toBe("1200.00");
  });

  it("horizonte inválido cai para 90", async () => {
    const p = await projecaoCaixa(lojaP, { horizonteDias: 7 });
    expect(p.horizonteDias).toBe(90);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/financeiro/__tests__/projecao.test.ts`
Expected: FAIL — `projecaoCaixa` não exportado.

- [ ] **Step 3: Implementar `projecaoCaixa` em `projecao.ts`**

No topo de `src/lib/financeiro/projecao.ts`, acrescentar os imports:

```ts
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC, ymd } from "@/lib/tempo";
import { decParaCentavos } from "@/lib/dinheiro";
import { resumoReceber } from "@/lib/financeiro/receber";
import { resumoPagar } from "@/lib/financeiro/pagar";
import { saldoDeHoje, type Ancora } from "@/lib/financeiro/saldo-referencia";
```

(Manter o import existente de `deCentavos`.) No fim do arquivo, acrescentar:

```ts
export type EmAtraso = { aReceber: string; aPagar: string };
export type Projecao = {
  saldoHoje: string | null;
  ancora: Ancora | null;
  emAtraso: EmAtraso;
  curva: Curva;
  horizonteDias: number;
};

const HORIZONTES = [30, 60, 90] as const;
export type Horizonte = (typeof HORIZONTES)[number];

/** Normaliza o horizonte da querystring para 30/60/90 (default 90). */
export function normalizarHorizonte(raw: string | number | undefined): Horizonte {
  const n = Number(raw);
  return (HORIZONTES as readonly number[]).includes(n) ? (n as Horizonte) : 90;
}

/**
 * Projeção de caixa: saldo de hoje (da âncora) + curva dia a dia do que vence em
 * [hoje, hoje+H]. Vencidos em aberto NÃO entram na curva — vão para emAtraso (totais
 * dos resumos de receber/pagar). Sem âncora, saldoHoje=null e a curva monta sobre 0.
 */
export async function projecaoCaixa(lojaId: string, opts: { horizonteDias?: number } = {}): Promise<Projecao> {
  const horizonteDias = normalizarHorizonte(opts.horizonteDias);
  const db = tenantPrisma(prisma, lojaId);
  const gte = hojeUTC(); // inclui vencimentos de hoje (não são atraso)
  const lt = new Date(gte.getTime());
  lt.setUTCDate(lt.getUTCDate() + horizonteDias + 1); // até hoje+H inclusive

  const [{ valor: saldoHoje, ancora }, parcelas, contas, rec, pag] = await Promise.all([
    saldoDeHoje(lojaId),
    db.parcela.findMany({ where: { status: "PREVISTA", vencimento: { gte, lt } }, select: { vencimento: true, valorPrevisto: true } }),
    db.contaPagar.findMany({ where: { status: "PREVISTA", vencimento: { gte, lt } }, select: { vencimento: true, valorPrevisto: true } }),
    resumoReceber(lojaId),
    resumoPagar(lojaId),
  ]);

  const eventos: EventoDia[] = [
    ...parcelas.map((p) => ({ ymd: ymd(p.vencimento)!, data: p.vencimento, entradasC: decParaCentavos(p.valorPrevisto), saidasC: 0 })),
    ...contas.map((c) => ({ ymd: ymd(c.vencimento)!, data: c.vencimento, entradasC: 0, saidasC: decParaCentavos(c.valorPrevisto) })),
  ];

  const saldoHojeC = saldoHoje == null ? 0 : decParaCentavos(saldoHoje);
  return {
    saldoHoje,
    ancora,
    emAtraso: { aReceber: rec.emAtraso, aPagar: pag.emAtraso },
    curva: montarCurva(saldoHojeC, eventos),
    horizonteDias,
  };
}
```

- [ ] **Step 4: Rodar e ver passar (arquivo + suíte cheia)**

Run: `npx vitest run src/lib/financeiro/__tests__/projecao.test.ts`
Expected: PASS (9 testes: 5 puros + 4 integração).

Run: `npx vitest run`
Expected: suíte verde (todos os arquivos).

- [ ] **Step 5: tsc + commit**

```bash
node node_modules/typescript/bin/tsc --noEmit
git add src/lib/financeiro/projecao.ts src/lib/financeiro/__tests__/projecao.test.ts
git commit -m "feat(financeiro): projecaoCaixa — curva [hoje,hoje+H] + emAtraso fora da curva"
```

---

## Task 5: Server Action `definirSaldoReferenciaAction`

**Files:**
- Create: `src/app/(app)/loja/[lojaId]/financeiro/projecao/actions.ts`

- [ ] **Step 1: Implementar a ação**

Criar `src/app/(app)/loja/[lojaId]/financeiro/projecao/actions.ts`:

```ts
// src/app/(app)/loja/[lojaId]/financeiro/projecao/actions.ts
// Projeção de caixa — Server Action. Gate financeiro:editar. Registra a âncora de saldo
// e volta por ?ok/?erro para a própria tela de projeção.
"use server";

import { redirect } from "next/navigation";
import { definirSaldoReferencia } from "@/lib/financeiro/saldo-referencia";
import { acaoAutorizada } from "@/lib/server/acoes";
import { str, comAviso } from "@/lib/server/form";

export const definirSaldoReferenciaAction = acaoAutorizada("financeiro", "editar", async (sc, formData) => {
  const lojaId = sc.loja.id;
  const volta = `/loja/${lojaId}/financeiro/projecao`;
  const r = await definirSaldoReferencia(lojaId, {
    data: str(formData, "data"),
    valor: str(formData, "valor"),
  });
  redirect(comAviso(volta, r.ok ? "ok" : "erro", r.ok ? "saldo_definido" : r.motivo));
});
```

- [ ] **Step 2: Verificar tsc**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/financeiro/projecao/actions.ts"
git commit -m "feat(financeiro): ação definirSaldoReferencia (gate financeiro:editar)"
```

---

## Task 6: Tela `/financeiro/projecao`

**Files:**
- Create: `src/app/(app)/loja/[lojaId]/financeiro/projecao/page.tsx`

- [ ] **Step 1: Implementar a página**

Criar `src/app/(app)/loja/[lojaId]/financeiro/projecao/page.tsx`:

```tsx
// src/app/(app)/loja/[lojaId]/financeiro/projecao/page.tsx
// Projeção de caixa: saldo de hoje (a partir do saldo de referência + realizado), bloco
// "Em atraso" fora da curva, curva dia a dia (primeiro dia negativo em bordô) e seletor de
// horizonte. Leitura pura; a única escrita é registrar o saldo de referência. Gate financeiro:ver.
import Link from "next/link";
import { exigirAcesso } from "@/lib/server/acoes";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { AvisoFlash } from "@/components/ui/aviso-flash";
import { projecaoCaixa } from "@/lib/financeiro/projecao";
import { brl } from "@/lib/dinheiro";
import { hojeYMD } from "@/lib/tempo";
import { definirSaldoReferenciaAction } from "./actions";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = {
  saldo_definido: "Saldo de referência atualizado.",
  data_invalida: "Data inválida.",
  valor_invalido: "Valor inválido.",
};

const HORIZONTES = [30, 60, 90] as const;
const diaFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const diaLongo = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone: "UTC" });

export default async function ProjecaoCaixaPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ h?: string; ok?: string; erro?: string }>;
}) {
  const sc = await exigirAcesso("financeiro");
  const { lojaId } = await params;
  const sp = await searchParams;
  const podeEditar = await podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "editar");

  const p = await projecaoCaixa(lojaId, { horizonteDias: Number(sp.h) });
  const aviso = sp.ok ? AVISOS[sp.ok] : sp.erro ? AVISOS[sp.erro] ?? "Não foi possível concluir a ação." : null;

  const temAtraso = p.emAtraso.aReceber !== "0.00" || p.emAtraso.aPagar !== "0.00";
  const semAncora = p.saldoHoje === null;

  const campo = "rounded-[var(--mn-radius-sm)] border border-borda-suave bg-papel px-3 py-2 text-[14px] text-tinta";
  const rotulo = "text-[11px] uppercase tracking-[0.18em] text-cinza-fumo";
  const botao = "rounded-[var(--mn-radius-sm)] bg-bordo px-4 py-2 text-[13px] text-papel-elevado hover:bg-bordo-escuro";

  const formSaldo = (
    <form action={definirSaldoReferenciaAction} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className={rotulo}>Data</span>
        <input name="data" type="date" required defaultValue={hojeYMD()} aria-label="Data do saldo" className={campo} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={rotulo}>Saldo em caixa</span>
        <input name="valor" required placeholder="0,00" aria-label="Saldo em caixa" className={`${campo} w-32`} />
      </label>
      <button type="submit" className={botao}>Salvar saldo</button>
    </form>
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <Link href={`/loja/${lojaId}/financeiro`} className="w-fit text-[13px] text-grafite hover:text-tinta">← Fluxo de caixa</Link>
        <h1 className="font-display text-[26px] font-light tracking-tight text-tinta">Projeção de caixa</h1>
        <p className="text-[14px] text-cinza-fumo">Projeção do que está previsto — não é caixa realizado.</p>
      </header>

      {aviso && <AvisoFlash tom={sp.ok ? "ok" : "erro"}>{aviso}</AvisoFlash>}

      {semAncora ? (
        // Estado vazio: convida a cadastrar o saldo. A curva ainda lista os eventos (sem saldo absoluto).
        <section className="flex flex-col gap-3 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-5">
          <h2 className="font-display text-[18px] font-light text-tinta">Informe o saldo atual do caixa</h2>
          <p className="text-[14px] text-cinza-fumo">Para projetar o saldo dia a dia, registre quanto há em caixa/banco hoje.</p>
          {podeEditar ? formSaldo : <p className="text-[13px] text-grafite">Sem permissão para registrar o saldo.</p>}
        </section>
      ) : (
        <section className="flex flex-col gap-1">
          <span className={rotulo}>Saldo hoje</span>
          <span className="font-display text-[32px] font-light tabular-nums text-tinta">{brl(p.saldoHoje!)}</span>
          {p.ancora && (
            <span className="text-[12px] text-cinza-fumo">a partir de {brl(p.ancora.valor)} em {diaFmt.format(p.ancora.data)}</span>
          )}
          {podeEditar && (
            <details className="mt-2">
              <summary className="w-fit cursor-pointer text-[13px] text-grafite hover:text-tinta">Ajustar saldo</summary>
              <div className="pt-3">{formSaldo}</div>
            </details>
          )}
        </section>
      )}

      {temAtraso && (
        <section className="flex flex-col gap-2 rounded-[var(--mn-radius-md)] border border-bordo/30 bg-papel-elevado p-4">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-bordo">Em atraso · fora da curva</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-tinta">
            {p.emAtraso.aReceber !== "0.00" && (
              <Link href={`/loja/${lojaId}/financeiro/receber?filtro=atrasadas`} className="hover:text-bordo">{brl(p.emAtraso.aReceber)} a receber</Link>
            )}
            {p.emAtraso.aPagar !== "0.00" && (
              <Link href={`/loja/${lojaId}/financeiro/pagar?filtro=atrasadas`} className="hover:text-bordo">{brl(p.emAtraso.aPagar)} a pagar</Link>
            )}
          </div>
        </section>
      )}

      {!semAncora && (
        <p className="text-[14px] text-tinta">
          {p.curva.diaNegativo
            ? <>Caixa fica <span className="text-bordo">negativo em {diaLongo.format(p.curva.diaNegativo)}</span>.</>
            : <>Caixa positivo em todo o horizonte.</>}
          {" "}Menor saldo: <span className="tabular-nums">{brl(p.curva.menorSaldo.valor)}</span>
          {p.curva.menorSaldo.data ? <> em {diaFmt.format(p.curva.menorSaldo.data)}</> : <> (hoje)</>}.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className={rotulo}>Curva projetada · {p.horizonteDias} dias</h2>
          <div className="flex gap-1">
            {HORIZONTES.map((h) => (
              <Link
                key={h}
                href={`/loja/${lojaId}/financeiro/projecao?h=${h}`}
                aria-current={p.horizonteDias === h ? "page" : undefined}
                className={`rounded-md px-2 py-1 text-[13px] ${p.horizonteDias === h ? "bg-papel-suave text-tinta" : "text-cinza-fumo hover:text-tinta"}`}
              >
                {h}d
              </Link>
            ))}
          </div>
        </div>

        {p.curva.linhas.length === 0 ? (
          <p className="text-[14px] text-cinza-fumo">Nada previsto neste horizonte.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
            {p.curva.linhas.map((l, i) => {
              const negativa = !semAncora && Number(l.saldoApos) < 0;
              return (
                <li key={i} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[14px] text-tinta">{diaFmt.format(l.data)}</span>
                    <span className="text-[12px] text-cinza-fumo">
                      {l.entradas !== "0.00" && <>+{brl(l.entradas)} </>}
                      {l.saidas !== "0.00" && <>−{brl(l.saidas)}</>}
                    </span>
                  </span>
                  {!semAncora && (
                    <span className={`shrink-0 font-display text-[14px] font-light tabular-nums ${negativa ? "text-bordo" : "text-tinta"}`}>
                      {brl(l.saldoApos)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verificar tsc**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: limpo. (Se `bg-bordo-escuro` não existir como token, trocar por `hover:opacity-90` — conferir em `globals.css`.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/financeiro/projecao/page.tsx"
git commit -m "feat(financeiro): tela de Projeção de caixa (saldo, em atraso, curva, horizonte)"
```

---

## Task 7: Link a partir do Fluxo de caixa + verificação final

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/financeiro/page.tsx`

- [ ] **Step 1: Ler a tela de Fluxo de caixa**

Abrir `src/app/(app)/loja/[lojaId]/financeiro/page.tsx` e localizar o `<header>` (título "Fluxo de caixa"). Identificar a linha de ações/links do cabeçalho (onde já há links como "Contas a receber", se houver) para inserir o link da projeção de forma coerente com o que existe.

- [ ] **Step 2: Adicionar o link "Projeção"**

No header da página de Fluxo de caixa, adicionar (ajustando as classes às já usadas na linha de ações daquele arquivo):

```tsx
<Link href={`/loja/${lojaId}/financeiro/projecao`} className="text-[13px] text-grafite hover:text-tinta">
  Projeção de caixa →
</Link>
```

Se a página ainda não importa `Link`, adicionar `import Link from "next/link";`. Usar a variável de loja já existente no arquivo (`lojaId` ou equivalente — conferir como as outras URLs são montadas ali).

- [ ] **Step 3: Verificação final (tsc + suíte cheia)**

Run:
```bash
node node_modules/typescript/bin/tsc --noEmit
npx vitest run
```
Expected: tsc limpo; suíte verde (todos os arquivos, incluindo os novos de `projecao` e `saldo-referencia`).

- [ ] **Step 4: Verificação visual (Playwright, opcional mas recomendado)**

Criar `scripts/repro/verify_projecao.mjs` espelhando `scripts/repro/verify_dia.mjs` (login + seleção de loja), navegando para `/loja/loja-moscow/financeiro/projecao`. Conferir: estado vazio (sem âncora) com o form; após salvar um saldo, o card "Saldo hoje", a curva e o seletor 30/60/90. Rodar com `node scripts/repro/verify_projecao.mjs` (app em `localhost:5000`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/financeiro/page.tsx" scripts/repro/verify_projecao.mjs
git commit -m "feat(financeiro): link Projeção no Fluxo de caixa + verificação visual"
```

---

## Self-Review

**Cobertura do spec:**
- §5 (tabela `SaldoReferencia`, âncora, convenção início-do-dia) → Task 1 + Task 3 (`ancoraAtiva`/`saldoDeHoje` com janela `[ancora, hoje]`).
- §6.1 `montarCurva` (pura, menor saldo, dia negativo, mesmo-dia soma, zero não-negativo) → Task 2.
- §6.2 `saldoDeHoje` (âncora + realizado; null sem âncora) → Task 3.
- §6.3 `projecaoCaixa` (janela, emAtraso fora da curva, sem-âncora sobre 0) → Task 4. **Refino:** a janela virou `[hoje, hoje+H]` (inclui vencimentos de hoje, que não são atraso nem caem num buraco). Atualizar o §6.3 do spec para refletir.
- §7 ação `definirSaldoReferencia` → Task 3 (data) + Task 5 (Server Action).
- §8 tela (saldo, em atraso, veredito, curva, horizonte, estado vazio, microcopy) → Task 6; link do Fluxo → Task 7.
- §9 testes (unit + integração) → Tasks 2/3/4.
- §10 transversais (centavos, datas, tenant, gates) → presentes em cada task.

**Placeholders:** nenhum — todo passo tem código/comando completo. As duas ressalvas (`bg-bordo-escuro` e a inserção do link no Fluxo) têm instrução explícita de conferência no arquivo real.

**Consistência de tipos:** `EventoDia`/`Curva`/`LinhaCurva` (Task 2) reusados em Task 4; `Ancora` (Task 3) reusado em `Projecao` (Task 4); `ResultadoSaldo` (Task 3) consumido pela ação (Task 5). `montarCurva(saldoHojeC: number, eventos: EventoDia[])` chamado com `saldoHojeC` derivado de `decParaCentavos` em Task 4. `menorSaldo.data: Date | null` tratado na página (Task 6, "(hoje)").

**Escopo:** uma fatia (projeção). Cobrança e DRE ficam para specs próprias (§11 do spec).
