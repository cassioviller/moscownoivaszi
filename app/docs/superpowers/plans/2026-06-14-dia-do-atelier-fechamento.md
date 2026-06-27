# Dia do atelier — Fechamento (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a feature "Dia do atelier" — endurecer o último ponto de gate de financeiro com um teste de regressão, refletir o progresso real no plano original, limpar os artefatos de debug e (sob pedido do dono) publicar.

**Architecture:** A implementação das 8 tarefas do plano `2026-06-11-dia-do-atelier.md` já está nos commits `d0fa4a7`…`94208f2` e a suíte está verde (60 arquivos / 441 testes) com `tsc` limpo. Este plano de fechamento NÃO altera comportamento: adiciona cobertura onde falta, atualiza rastreio e remove sujeira do diretório de trabalho. A única mudança de código é um teste novo.

**Tech Stack:** vitest (integração com Postgres real, dados com prefixo `MARK`, limpeza em `afterAll`), TypeScript (`node node_modules/typescript/bin/tsc --noEmit` — o `.bin/tsc` está sem permissão de execução), git (commits **direto na `main`**, sem branch/worktree, conforme CLAUDE.md).

**Estado verificado antes deste plano:**
- Gate de financeiro confirmado nos três pontos:
  - **Dados** `src/lib/calendario/dia.ts:88-97` — parcelas/contas só são buscadas quando `opts.financeiro`; senão `Promise.resolve([])`. Coberto por `dia.test.ts:70` ("omite financeiro quando financeiro=false").
  - **Início** `src/app/(app)/loja/[lojaId]/page.tsx:25-31,62` — `podeFinanceiro` controla `detalheDoDia`, `vencidasDaLoja` (null sem permissão) e a renderização de `<AvisoVencidas>`.
  - **Calendário** `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaMes.tsx:25,34,42,75` — `podeFinanceiro` alimenta `itensDoMes` e `detalheDoDia`; o marcador `R$` da célula só sai de `info?.temFinanceiro`.
- **Lacuna única:** `itensDoMes` (`src/lib/calendario/dados.ts:76-81,104-108`) zera `temFinanceiro` quando `financeiro=false`, mas o teste `itens-mes.test.ts` nunca cria conta vencendo no dia — então o gate do marcador `R$` não tem teste que o prove. Tarefa 1 fecha isso.

---

## File Structure

**Modificar:**
- `src/lib/calendario/__tests__/itens-mes.test.ts` — criar uma parcela que vence no `dia` no `beforeAll`; adicionar dois casos: `temFinanceiro=true` com `financeiro:true` e `temFinanceiro=false` com `financeiro:false`.
- `docs/superpowers/plans/2026-06-11-dia-do-atelier.md` — marcar checkboxes das 8 tarefas como concluídas, refletindo o que já foi entregue.

**Remover (requer confirmação do dono — ver Tarefa 3):**
- `repro_prova.mjs`, `repro_prova2.mjs`, `repro_prova3.mjs`, `repro_prova4.mjs`, `verify_dia.mjs` — scripts Playwright de diagnóstico, na raiz, não rastreados.

---

## Task 1: Teste de regressão do gate do marcador `R$` (`itensDoMes`)

**Files:**
- Test: `src/lib/calendario/__tests__/itens-mes.test.ts`

Contexto: o `beforeAll` atual cria loja, vestido, noiva, cabine, reserva de casamento e uma prova às 9h — mas nenhum dado financeiro. Vamos adicionar um contrato + parcela vencendo no `dia` (padrão idêntico ao de `dia.test.ts:42-47`) e então provar que `temFinanceiro` respeita o flag.

- [ ] **Step 1: Estender o `beforeAll` com um dado financeiro que vence no dia**

Em `src/lib/calendario/__tests__/itens-mes.test.ts`, dentro do `beforeAll`, logo após a linha que agenda o atendimento (`if (r.ok) await agendarAtendimento(...)`, atual linha 25), inserir:

```ts
  if (r.ok) {
    const contrato = await db.contrato.create({
      data: { leadId: noiva, vendedoraId: u.id, valorTotal: 1000 } as never,
    });
    await db.parcela.create({
      data: { contratoId: contrato.id, numero: 1, valorPrevisto: 500, vencimento: new Date(`${dia}T00:00:00.000Z`) } as never,
    });
  }
```

Observação: `noiva` e `u` já existem no escopo do `beforeAll`. A variável `r` é o resultado de `reservarVestido`; o `if (r.ok)` já guarda o agendamento — agregue a criação financeira no mesmo bloco (transforme a linha 25 numa chave `{ ... }` se ainda for de uma linha só).

- [ ] **Step 2: Adicionar os dois casos de teste no `describe("itensDoMes", ...)`**

Após o `it("agrupa por dia ...")` existente, acrescentar:

```ts
  it("marca temFinanceiro quando financeiro=true e há conta vencendo no dia", async () => {
    const inicio = new Date(`${dia}T00:00:00.000Z`);
    const fim = new Date(inicio.getTime());
    fim.setUTCDate(fim.getUTCDate() + 1);
    const porDia = await itensDoMes(loja, inicio, fim, { financeiro: true });
    expect(porDia.get(dia)?.temFinanceiro).toBe(true);
  });
  it("não vaza temFinanceiro quando financeiro=false", async () => {
    const inicio = new Date(`${dia}T00:00:00.000Z`);
    const fim = new Date(inicio.getTime());
    fim.setUTCDate(fim.getUTCDate() + 1);
    const porDia = await itensDoMes(loja, inicio, fim, { financeiro: false });
    expect(porDia.get(dia)?.temFinanceiro).toBe(false);
  });
```

- [ ] **Step 3: Rodar o arquivo e ver os dois casos passarem**

Run: `npx vitest run src/lib/calendario/__tests__/itens-mes.test.ts`
Expected: PASS (3 testes). O comportamento já está correto no código — este é um teste de **regressão** que tranca o gate, não um red-green de funcionalidade nova.

- [ ] **Step 4: Provar que o teste morde o gate (mutação temporária)**

Para confirmar que o teste realmente guarda o gate (e não passa por acaso), edite **temporariamente** `src/lib/calendario/dados.ts:79` trocando `opts.financeiro` por `true` na busca de `contaPagar` — não, mais direto: na linha 76, troque `opts.financeiro ?` por `true ?` na busca de `parcela`.

Run: `npx vitest run src/lib/calendario/__tests__/itens-mes.test.ts`
Expected: FAIL no caso "não vaza temFinanceiro quando financeiro=false" (agora `temFinanceiro` viraria `true`).

Reverta a mutação:

Run: `git checkout src/lib/calendario/dados.ts`
Expected: arquivo volta ao estado correto.

Run: `npx vitest run src/lib/calendario/__tests__/itens-mes.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: tsc + suíte cheia + commit**

```bash
node node_modules/typescript/bin/tsc --noEmit
npx vitest run
git add src/lib/calendario/__tests__/itens-mes.test.ts
git commit -m "test(calendario): tranca gate do marcador R$ em itensDoMes (financeiro:ver)"
```
Expected: tsc sem saída; `vitest run` verde (442 testes); commit criado na `main`.

---

## Task 2: Refletir o progresso real no plano original

**Files:**
- Modify: `docs/superpowers/plans/2026-06-11-dia-do-atelier.md`

O arquivo do plano tem 35 checkboxes `- [ ]` desmarcados, mas as 8 tarefas já foram entregues (`d0fa4a7`…`94208f2`). Marcar como concluído para o rastreio não mentir.

- [ ] **Step 1: Marcar todos os checkboxes como concluídos**

Substituir todas as ocorrências de `- [ ]` por `- [x]` em `docs/superpowers/plans/2026-06-11-dia-do-atelier.md`.

Run: `sed -i 's/- \[ \]/- [x]/g' docs/superpowers/plans/2026-06-11-dia-do-atelier.md`
Expected: 0 desmarcados depois — confirmar com `grep -c '\- \[ \]' docs/superpowers/plans/2026-06-11-dia-do-atelier.md` retornando `0`.

- [ ] **Step 2: Adicionar nota de fechamento no topo do plano**

Logo abaixo da linha `**Tech Stack:**` do plano original, inserir uma linha:

```markdown
**Status (2026-06-14):** Entregue nos commits d0fa4a7…94208f2; gate do marcador R$ trancado por teste em 2026-06-14. Fechamento: ver `2026-06-14-dia-do-atelier-fechamento.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-06-11-dia-do-atelier.md docs/superpowers/plans/2026-06-14-dia-do-atelier-fechamento.md
git commit -m "docs(plan): marca Dia do atelier como entregue + plano de fechamento"
```
Expected: commit criado na `main`.

---

## Task 3: Versionar os artefatos de debug (decisão do dono: guardar)

**Files:**
- Move: `repro_prova.mjs`, `repro_prova2.mjs`, `repro_prova3.mjs`, `repro_prova4.mjs`, `verify_dia.mjs` → `scripts/repro/`
- Create: `scripts/repro/README.md`

Decisão do dono (2026-06-14): **não deletar** — versionar os 5 scripts Playwright de diagnóstico em `scripts/repro/` (com README) para reuso. Não entram na suíte nem em CI; são ferramentas de diagnóstico manual.

- [x] **Step 1: Mover os scripts para `scripts/repro/`**

```bash
mkdir -p scripts/repro
mv repro_prova.mjs repro_prova2.mjs repro_prova3.mjs repro_prova4.mjs verify_dia.mjs scripts/repro/
```

- [x] **Step 2: Documentar em `scripts/repro/README.md`**

README descrevendo cada script, o pré-requisito (app em `localhost:5000` + `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE`) e o contexto (investigação Prova→Atendimento e verificação visual do Dia do atelier).

- [x] **Step 3: Commit**

```bash
git add scripts/repro/
git commit -m "chore(scripts): versiona diagnósticos Playwright em scripts/repro/ (+README)"
```
Expected: commit criado na `main`.

---

## Task 4: Publicar na origin (REQUER PEDIDO DO DONO)

CLAUDE.md: **só use `git push` quando o dono pedir.** A `main` está 14 commits à frente de `origin/main` (mais os deste fechamento).

- [ ] **Step 1: Confirmar gates antes de qualquer push**

```bash
node node_modules/typescript/bin/tsc --noEmit
npx vitest run
```
Expected: tsc sem saída; suíte verde.

- [ ] **Step 2 (somente sob pedido explícito do dono): push**

```bash
git push origin main
```
Expected: `origin/main` atualizado; `git status` reporta branch em dia.

---

## Self-Review

- **Cobertura:** A lacuna identificada (gate do `temFinanceiro` em `itensDoMes`) é fechada na Tarefa 1, com prova de mutação. Os outros dois pontos de gate já têm teste (`dia.test.ts`) e código verificado — sem tarefa redundante. Rastreio (plano), limpeza (scripts) e publicação (push) cobertos nas Tarefas 2–4.
- **Sem placeholders:** todo passo tem comando/código exato. O dado financeiro do teste reusa o padrão real de `dia.test.ts:42-47`.
- **Consistência de tipos:** `itensDoMes(lojaId, inicio, fim, { financeiro })` e `DiaComItens.temFinanceiro` batem com `src/lib/calendario/dados.ts`. `db.parcela.create` / `db.contrato.create` batem com `dia.test.ts`.
- **Convenções:** commits direto na `main`; deletar e push só com autorização explícita (Tarefas 3 e 4 marcadas como gated).
