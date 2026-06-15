# B3 — Leitura unificada de atendimentos: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concentrar a regra "o que conta como atendimento" num único núcleo parametrizado (`buscarAtendimentos`), transformando as 3 leituras divergentes em wrappers finos — sem mudar comportamento nem assinaturas públicas.

**Architecture:** Um núcleo `buscarAtendimentos(lojaId, filtro)` em `atendimentos.ts` monta o `where`/`orderBy` a partir de `{ tipo?, situacoes?, desde?, ate?, ordem? }`, com include rico (lead+cabine+vendedora). `listarProximosAtendimentos` e `listarAtendimentos` viram wrappers que mapeiam para suas shapes atuais; `atendimentosNoIntervalo` (em `calendario/dados.ts`) delega ao núcleo. Constantes `SITUACOES_ABERTAS`/`SITUACOES_FECHADAS` substituem as listas inline.

**Tech Stack:** Prisma (client custom `src/generated/prisma`), Vitest contra Postgres real.

**Comandos do ambiente (`.bin` dá permission denied):**
- tsc: `node node_modules/typescript/bin/tsc --noEmit`
- vitest: `node node_modules/vitest/vitest.mjs run`

**Princípio de regressão:** comportamento e tipos de retorno (`AtendimentoItem`, `AtendimentoFila`, `AtendimentoCalendario`) ficam idênticos. A suíte existente (`atendimentos.test.ts`, `painel.test.ts`, calendário) é a guarda — deve continuar 100% verde sem nenhuma edição de teste de consumidor.

---

### Task 1: Núcleo `buscarAtendimentos` + constantes de situação (TDD)

**Files:**
- Modify: `src/lib/atendimentos/atendimentos.ts`
- Test: `src/lib/atendimentos/__tests__/atendimentos.test.ts`

- [ ] **Step 1: Escrever os testes do núcleo (falham — função não existe)**

Adicionar `buscarAtendimentos`, `SITUACOES_ABERTAS`, `SITUACOES_FECHADAS` ao import do topo do arquivo de teste:

```ts
import {
  gradeDoDia,
  agendarAtendimento,
  listarProximosAtendimentos,
  cancelarAtendimento,
  listarAtendimentos,
  iniciarAtendimento,
  concluirAtendimento,
  marcarFalta,
  buscarAtendimentos,
  SITUACOES_FECHADAS,
} from "@/lib/atendimentos/atendimentos";
```

E adicionar este `describe` no fim do arquivo (usa fixtures `loja`, `lead`, `cabine`, `vend`):

```ts
describe("buscarAtendimentos (núcleo parametrizado)", () => {
  it("filtra por tipo, situação e intervalo [desde, ate); respeita a ordem", async () => {
    const db = tenantPrisma(prisma, loja);
    const i = (ymd: string, h: number) => new Date(`${ymd}T${String(h).padStart(2, "0")}:00:00.000Z`);
    // 3 atendimentos num dia próprio (evita colidir com slots de outros testes):
    const a1 = await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: i("2099-10-01", 9), tipo: "ATENDIMENTO", situacao: "CONCLUIDO", desfecho: "RESERVOU" } as never });
    const a2 = await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: i("2099-10-01", 10), tipo: "ATENDIMENTO", situacao: "AGENDADO" } as never });
    // uma PROVA no mesmo dia (não deve aparecer com tipo=ATENDIMENTO):
    const bloqueio = await db.bloqueioVestido.create({ data: { vestidoId: (await db.vestido.create({ data: { codigo: "BX1", nome: `${MARK}vx`, precoBase: "1.00" } as never })).id, leadId: lead, tipo: "RESERVA_CASAMENTO" } as never });
    await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: i("2099-10-01", 11), tipo: "PROVA", bloqueioId: bloqueio.id, situacao: "AGENDADO" } as never });

    const desde = i("2099-10-01", 0), ate = i("2099-10-02", 0);

    // tipo=ATENDIMENTO no intervalo → só a1 e a2 (PROVA fora)
    const todos = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde, ate });
    const ids = todos.map((r) => r.id);
    expect(ids).toContain(a1.id);
    expect(ids).toContain(a2.id);
    expect(todos.every((r) => r.tipo === "ATENDIMENTO")).toBe(true);

    // situacoes=FECHADAS → só a1 (CONCLUIDO)
    const fechados = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde, ate, situacoes: SITUACOES_FECHADAS });
    expect(fechados.map((r) => r.id)).toEqual([a1.id]);
    expect(fechados[0].desfecho).toBe("RESERVOU");
    expect(fechados[0].cabineNome).toBe(`${MARK}C1`);

    // ordem desc → a2 (10h) antes de a1 (9h)
    const desc = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde, ate, ordem: "desc" });
    const idxA1 = desc.findIndex((r) => r.id === a1.id);
    const idxA2 = desc.findIndex((r) => r.id === a2.id);
    expect(idxA2).toBeLessThan(idxA1);

    // intervalo meio-aberto: ate exclusivo — atendimento às 00:00 do dia seguinte fica fora
    const aBorda = await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: ate, tipo: "ATENDIMENTO", situacao: "AGENDADO" } as never });
    const dentro = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde, ate });
    expect(dentro.map((r) => r.id)).not.toContain(aBorda.id);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar (função não existe)**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/atendimentos.test.ts`
Expected: FAIL no import/`buscarAtendimentos is not a function`.

- [ ] **Step 3: Implementar consts + núcleo**

Em `src/lib/atendimentos/atendimentos.ts`, logo após o import de tipos (linha ~9), adicionar as constantes:

```ts
export const SITUACOES_ABERTAS: AtendimentoSituacao[] = ["AGENDADO", "EM_ATENDIMENTO"];
export const SITUACOES_FECHADAS: AtendimentoSituacao[] = ["CONCLUIDO", "FALTOU"];
```

E adicionar o núcleo (sugestão: logo antes de `listarProximosAtendimentos`):

```ts
export type FiltroAtendimentos = {
  tipo?: AtendimentoTipo;
  situacoes?: AtendimentoSituacao[];
  desde?: Date; // inicio >= desde
  ate?: Date; // inicio < ate
  ordem?: "asc" | "desc";
};

export type AtendimentoLinha = {
  id: string;
  inicio: Date;
  tipo: AtendimentoTipo;
  situacao: AtendimentoSituacao;
  desfecho: AtendimentoDesfecho | null;
  atendidoEm: Date | null;
  leadId: string;
  noivaNome: string | null;
  cabineNome: string;
  vendedoraNome: string;
};

/**
 * Leitura-núcleo de atendimentos da loja. Concentra a regra "o que conta":
 * monta o where a partir do filtro (cada cláusula só entra quando presente),
 * ordena por início e traz lead+cabine+vendedora. Os wrappers públicos
 * (próximos/fila/intervalo) projetam a partir desta linha rica.
 */
export async function buscarAtendimentos(
  lojaId: string,
  filtro: FiltroAtendimentos = {},
): Promise<AtendimentoLinha[]> {
  const where: Record<string, unknown> = {};
  if (filtro.tipo) where.tipo = filtro.tipo;
  if (filtro.situacoes) where.situacao = { in: filtro.situacoes };
  if (filtro.desde || filtro.ate) {
    where.inicio = {
      ...(filtro.desde ? { gte: filtro.desde } : {}),
      ...(filtro.ate ? { lt: filtro.ate } : {}),
    };
  }
  const rows = await tenantPrisma(prisma, lojaId).atendimento.findMany({
    // where montado dinamicamente → cast no estilo da casa (o arquivo já usa `as never`).
    where: where as never,
    orderBy: { inicio: filtro.ordem ?? "asc" },
    include: {
      lead: { select: { noivaNome: true } },
      cabine: { select: { nome: true } },
      vendedora: { select: { nome: true } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    tipo: a.tipo,
    situacao: a.situacao,
    desfecho: a.desfecho,
    atendidoEm: a.atendidoEm,
    leadId: a.leadId,
    noivaNome: a.lead?.noivaNome ?? null,
    cabineNome: a.cabine.nome,
    vendedoraNome: a.vendedora.nome,
  }));
}
```

- [ ] **Step 4: Rodar os testes do arquivo — passam**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/atendimentos.test.ts`
Expected: PASS (todos, incluindo o novo describe).

- [ ] **Step 5: tsc limpo**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem saída.

- [ ] **Step 6: Commit**

```bash
git add src/lib/atendimentos/atendimentos.ts src/lib/atendimentos/__tests__/atendimentos.test.ts
git commit -m "feat(atendimentos): buscarAtendimentos (núcleo parametrizado) + consts de situação

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `listarProximosAtendimentos` e `listarAtendimentos` viram wrappers

**Files:**
- Modify: `src/lib/atendimentos/atendimentos.ts`

- [ ] **Step 1: Reescrever `listarProximosAtendimentos` como wrapper**

Substituir o corpo atual (o `findMany` inline) por:

```ts
export async function listarProximosAtendimentos(lojaId: string): Promise<AtendimentoItem[]> {
  // Só os ABERTOS a partir de hoje (B2). Núcleo concentra a regra.
  const rows = await buscarAtendimentos(lojaId, {
    tipo: "ATENDIMENTO",
    situacoes: SITUACOES_ABERTAS,
    desde: hojeUTC(),
  });
  return rows.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    noivaNome: a.noivaNome,
    leadId: a.leadId,
    cabineNome: a.cabineNome,
    vendedoraNome: a.vendedoraNome,
  }));
}
```

- [ ] **Step 2: Reescrever `listarAtendimentos` como wrapper**

Substituir o corpo (as listas `abertos`/`fechados` inline + o `findMany`) por:

```ts
export async function listarAtendimentos(
  lojaId: string,
  opts: { finalizados?: boolean } = {},
): Promise<AtendimentoFila[]> {
  const rows = await buscarAtendimentos(lojaId, {
    tipo: "ATENDIMENTO",
    situacoes: opts.finalizados ? SITUACOES_FECHADAS : SITUACOES_ABERTAS,
    ordem: opts.finalizados ? "desc" : "asc",
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

Manter os tipos `AtendimentoItem` e `AtendimentoFila` exatamente como estão (não tocar nas definições).

- [ ] **Step 3: Rodar os testes do arquivo — passam sem edição de teste**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/atendimentos.test.ts`
Expected: PASS (os testes de próximos/fila/histórico/vencido continuam verdes — prova de equivalência).

- [ ] **Step 4: tsc limpo**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/lib/atendimentos/atendimentos.ts
git commit -m "refactor(atendimentos): listarProximos/listarAtendimentos delegam ao núcleo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `atendimentosNoIntervalo` delega ao núcleo

**Files:**
- Modify: `src/lib/calendario/dados.ts:128-146`

- [ ] **Step 1: Reescrever `atendimentosNoIntervalo` como wrapper**

No topo de `src/lib/calendario/dados.ts`, garantir o import do núcleo (adicionar à lista de imports existentes):

```ts
import { buscarAtendimentos } from "@/lib/atendimentos/atendimentos";
```

Substituir o corpo da função (o `findMany` inline, linhas ~134-145) por:

```ts
/** Atendimentos da loja com início em [inicio, fim), por horário asc. */
export async function atendimentosNoIntervalo(
  lojaId: string,
  inicio: Date,
  fim: Date,
): Promise<AtendimentoCalendario[]> {
  const rows = await buscarAtendimentos(lojaId, { tipo: "ATENDIMENTO", desde: inicio, ate: fim });
  return rows.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    situacao: a.situacao,
    noivaNome: a.noivaNome,
    leadId: a.leadId,
  }));
}
```

Manter o tipo `AtendimentoCalendario` como está. Verificar que o import antigo de `tenantPrisma`/`prisma` em `dados.ts` ainda é usado por outras funções do arquivo (não remover se sim — o arquivo tem outras leituras).

- [ ] **Step 2: tsc limpo (pega ciclo de import ou tipo quebrado)**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem saída (sem ciclo: `atendimentos.ts` não importa `calendario`).

- [ ] **Step 3: Rodar a suíte inteira — guarda de regressão**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: todos verdes (os testes de calendário/painel que usam `atendimentosNoIntervalo` continuam passando).

- [ ] **Step 4: Commit**

```bash
git add src/lib/calendario/dados.ts
git commit -m "refactor(calendario): atendimentosNoIntervalo delega ao núcleo buscarAtendimentos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Gate final + docs

**Files:**
- Modify: `docs/estado-atual.md`

- [ ] **Step 1: Suíte inteira verde + tsc limpo**

Run: `node node_modules/vitest/vitest.mjs run && node node_modules/typescript/bin/tsc --noEmit`
Expected: todos os testes passam; tsc sem saída.

- [ ] **Step 2: Anotar B3 como entregue no estado-atual**

Na seção "Backlog priorizado", marcar **B3** ✅ com nota: núcleo `buscarAtendimentos(lojaId, filtro)` + consts `SITUACOES_ABERTAS/FECHADAS`; os 3 reads viraram wrappers preservando tipos; `listarProvasAbertas` ficou fora; abre caminho p/ F1/F2 (filtros usam `FiltroAtendimentos`).

- [ ] **Step 3: Commit**

```bash
git add docs/estado-atual.md
git commit -m "docs(estado-atual): B3 (leitura unificada de atendimentos) entregue

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
