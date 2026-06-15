# B1 — Double-booking de atendimentos: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar o double-booking de atendimentos garantindo, no banco, que cada slot `(cabine, hora)` e `(loja, vendedora, hora)` tem no máximo um atendimento — e traduzir a colisão para `motivo: "indisponivel"`.

**Architecture:** Duas `@@unique` no `model Atendimento` viram a fonte da verdade (a corrida TOCTOU deixa de double-bookar). O pré-check `horasOcupadas` permanece como fast-path/UX. O `create` ganha try/catch que mapeia `P2002` → `indisponivel`, padrão já usado em `contratos.ts`/`vestidos.ts`/`pagar.ts`.

**Tech Stack:** Prisma (Postgres, client custom em `src/generated/prisma`), Vitest contra Postgres real.

**Comandos do ambiente (Replit/Nix — `.bin` symlinks dão permission denied):**
- Prisma CLI: `node node_modules/prisma/build/index.js <cmd>`
- tsc: `node node_modules/typescript/bin/tsc --noEmit`
- vitest: `node node_modules/vitest/vitest.mjs run`

**Pré-condição verificada:** banco de dev sem duplicatas em nenhum dos dois eixos (`scripts/check-dup-atendimentos.ts` → `{total:10, dup_cabine:0, dup_vendedora:0}`). A migração aplica sem conflito.

---

### Task 1: Constraints no schema + migração

**Files:**
- Modify: `prisma/schema.prisma` (model `Atendimento`, ~linha 401-424)
- Create: `prisma/migrations/<timestamp>_atendimento_unique_slot/migration.sql` (gerado)

- [ ] **Step 1: Adicionar as duas `@@unique` ao model `Atendimento`**

No final do bloco `model Atendimento { ... }`, depois das relações e antes do `}` de fechamento, adicionar:

```prisma
  @@unique([cabineId, inicio])
  @@unique([lojaId, vendedoraId, inicio])
```

Contexto (as linhas que já existem logo acima, para localizar o ponto de inserção):

```prisma
  orcamentos Orcamento[]
  ajustes    Ajuste[]

  @@unique([cabineId, inicio])
  @@unique([lojaId, vendedoraId, inicio])
}
```

- [ ] **Step 2: Gerar e aplicar a migração**

Run:
```bash
node node_modules/prisma/build/index.js migrate dev --name atendimento_unique_slot
```
Expected: cria `prisma/migrations/<ts>_atendimento_unique_slot/migration.sql` com dois `CREATE UNIQUE INDEX`, aplica sem erro (sem duplicatas no banco), e termina com "Your database is now in sync with your schema."

Se reclamar de duplicatas (não deve — verificado 0/0): PARAR e reportar; resolver duplicatas requer OK explícito para DELETE (CLAUDE.md).

- [ ] **Step 3: Regenerar o client Prisma (output custom)**

Run:
```bash
node node_modules/prisma/build/index.js generate
```
Expected: "Generated Prisma Client" em `src/generated/prisma`. (O `migrate dev` nem sempre regenera o client no output custom — por isso o passo explícito.)

- [ ] **Step 4: Verificar que a migração reflete as duas constraints**

Run:
```bash
grep -c "CREATE UNIQUE INDEX" prisma/migrations/*_atendimento_unique_slot/migration.sql
```
Expected: `2`

- [ ] **Step 5: tsc limpo**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem saída (limpo).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(atendimentos): @@unique de slot (cabine/hora + loja/vendedora/hora) — base do fix de double-booking

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Tradução de P2002 → indisponivel em agendarAtendimento

**Files:**
- Modify: `src/lib/atendimentos/atendimentos.ts:99-108` (bloco do `create`)
- Test: `src/lib/atendimentos/__tests__/atendimentos.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar este `describe` no fim de `src/lib/atendimentos/__tests__/atendimentos.test.ts` (usa as fixtures `loja`, `lead`, `cabine`, `vend` do `beforeAll`). Importar `tenantPrisma` já está no topo do arquivo.

```ts
describe("atendimentos: constraint de slot (anti double-booking)", () => {
  const inicio = (ymd: string, h: number) => new Date(`${ymd}T${String(h).padStart(2, "0")}:00:00.000Z`);

  it("constraint de cabine: dois atendimentos na mesma (cabine, inicio) → P2002", async () => {
    const db = tenantPrisma(prisma, loja);
    const data = { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: inicio("2099-08-01", 10) };
    await db.atendimento.create({ data: data as never });
    await expect(db.atendimento.create({ data: data as never })).rejects.toMatchObject({ code: "P2002" });
  });

  it("constraint de vendedora: mesma (vendedora, inicio) em CABINE DIFERENTE → P2002", async () => {
    const db = tenantPrisma(prisma, loja);
    const cabine2 = (await db.cabine.create({ data: { nome: `${MARK}C2` } as never })).id;
    const i = inicio("2099-08-02", 10);
    await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: i } as never });
    await expect(
      db.atendimento.create({ data: { leadId: lead, cabineId: cabine2, vendedoraId: vend, inicio: i } as never }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("cross-loja: mesma vendedora, mesmo inicio, LOJAS DIFERENTES → ambas inserem", async () => {
    const i = inicio("2099-08-03", 10);
    const db1 = tenantPrisma(prisma, loja);
    await db1.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: i } as never });

    const loja2 = (await prisma.loja.create({ data: { nome: `${MARK}loja2` } })).id;
    const db2 = tenantPrisma(prisma, loja2);
    const lead2 = (await db2.lead.create({ data: { noivaNome: `${MARK}Cida` } as never })).id;
    const cabine2 = (await db2.cabine.create({ data: { nome: `${MARK}C-l2` } as never })).id;
    await expect(
      db2.atendimento.create({ data: { leadId: lead2, cabineId: cabine2, vendedoraId: vend, inicio: i } as never }),
    ).resolves.toBeTruthy();
  });

  it("corrida real: dois agendarAtendimento no mesmo slot via Promise.all → um ok, outro indisponivel", async () => {
    const args = { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2099-08-04", hora: 10 };
    const [a, b] = await Promise.all([agendarAtendimento(loja, args), agendarAtendimento(loja, args)]);
    const oks = [a, b].filter((r) => r.ok).length;
    const indisp = [a, b].filter((r) => !r.ok && r.motivo === "indisponivel").length;
    expect(oks).toBe(1);
    expect(indisp).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver o teste da corrida falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/atendimentos.test.ts`
Expected: os 3 primeiros testes novos PASSAM (a constraint já existe da Task 1); o 4º ("corrida real") FALHA — sem o catch, o `create` perdedor lança `P2002` não tratado (o teste rejeita) em vez de retornar `indisponivel`. É a prova de que o catch é necessário.

- [ ] **Step 3: Adicionar o helper P2002 e o try/catch no create**

Em `src/lib/atendimentos/atendimentos.ts`, adicionar perto do topo (após os imports) um helper:

```ts
function ehErroP2002(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
```

E trocar o bloco do `create` (linhas ~103-107) por:

```ts
  const obs = observacao?.trim();
  try {
    const criado = await db.atendimento.create({
      data: { leadId, cabineId, vendedoraId, tipo, bloqueioId, inicio: instante(dataYMD, hora), observacao: obs ? obs : null } as never,
    });
    return { ok: true, atendimentoId: criado.id };
  } catch (e) {
    // Corrida perdeu para a constraint de slot (cabine OU vendedora já ocupada na hora).
    if (ehErroP2002(e)) return { ok: false, motivo: "indisponivel" };
    throw e;
  }
```

- [ ] **Step 4: Rodar os testes — todos passam**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/atendimentos.test.ts`
Expected: PASS (todos, inclusive "corrida real" agora retornando 1 ok / 1 indisponivel).

- [ ] **Step 5: tsc limpo**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem saída.

- [ ] **Step 6: Commit**

```bash
git add src/lib/atendimentos/atendimentos.ts src/lib/atendimentos/__tests__/atendimentos.test.ts
git commit -m "fix(atendimentos): traduz P2002 da constraint de slot p/ indisponivel (fecha double-booking)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Gate final da suíte completa

**Files:** nenhum (verificação).

- [ ] **Step 1: Suíte inteira verde**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: todos os testes passam (482 anteriores + 4 novos = 486), sem regressão.

- [ ] **Step 2: tsc limpo (confirmação final)**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: sem saída.

- [ ] **Step 3: Atualizar `docs/estado-atual.md`**

Na seção "Backlog priorizado" mover **B1** de pendente para entregue (ou anotar ✅ com o commit), registrando que o fix foi por constraint + tradução de P2002, e que rebooking-após-falta segue fora de escopo.

- [ ] **Step 4: Commit do estado**

```bash
git add docs/estado-atual.md
git commit -m "docs(estado-atual): B1 (double-booking) entregue

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
