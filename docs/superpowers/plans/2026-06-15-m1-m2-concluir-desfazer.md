# M1/M2 — Clímax no Concluir + desfazer/confirmar: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar clímax ao Concluir (desfecho RESERVOU encaminha ao perfil da noiva para reservar) e tornar as transições recuperáveis (confirmação antes; "Voltar"/"Reabrir" depois).

**Architecture:** M1 é roteamento na `concluirAtendimentoAction` (lê `leadId` hidden; RESERVOU → redirect ao perfil `#reserva`). M2 adiciona `reabrirAtendimento` (data layer, volta a AGENDADO limpando desfecho/atendidoEm), envolve os submits terminais com `BotaoConfirmar` e expõe "Voltar"/"Reabrir" no `Linha`. Sem schema, sem mudança de regra de negócio.

**Tech Stack:** Next 16 RSC + Server Actions, Prisma (Postgres), Vitest contra Postgres real.

**Comandos do ambiente (`.bin` dá permission denied):**
- tsc: `node node_modules/typescript/bin/tsc --noEmit`
- vitest: `node node_modules/vitest/vitest.mjs run`

---

### Task 1: `reabrirAtendimento` (data layer, TDD)

**Files:**
- Modify: `src/lib/atendimentos/atendimentos.ts`
- Test: `src/lib/atendimentos/__tests__/atendimentos.test.ts`

- [ ] **Step 1: Escrever os testes (falham — função não existe)**

Adicionar ao import do topo do arquivo de teste `reabrirAtendimento`:

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
  reabrirAtendimento,
  buscarAtendimentos,
  SITUACOES_FECHADAS,
} from "@/lib/atendimentos/atendimentos";
```

E adicionar um `describe` no fim do arquivo:

```ts
describe("reabrirAtendimento (M2 — desfazer)", () => {
  async function novo(dataYMD: string, hora: number): Promise<string> {
    const r = await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD, hora });
    if (!r.ok) throw new Error(`setup falhou: ${r.motivo}`);
    return r.atendimentoId;
  }
  const sit = async (id: string) =>
    (await tenantPrisma(prisma, loja).atendimento.findUnique({ where: { id }, select: { situacao: true, desfecho: true, atendidoEm: true } }))!;

  it("EM_ATENDIMENTO → AGENDADO, atendidoEm nulo", async () => {
    const id = await novo("2099-04-01", 9);
    await iniciarAtendimento(loja, id);
    expect(await reabrirAtendimento(loja, id)).toEqual({ ok: true });
    const a = await sit(id);
    expect(a.situacao).toBe("AGENDADO");
    expect(a.atendidoEm).toBeNull();
  });

  it("CONCLUIDO (com desfecho) → AGENDADO, desfecho e atendidoEm nulos", async () => {
    const id = await novo("2099-04-02", 9);
    await concluirAtendimento(loja, id, "RESERVOU");
    expect(await reabrirAtendimento(loja, id)).toEqual({ ok: true });
    const a = await sit(id);
    expect(a.situacao).toBe("AGENDADO");
    expect(a.desfecho).toBeNull();
    expect(a.atendidoEm).toBeNull();
  });

  it("FALTOU → AGENDADO", async () => {
    const id = await novo("2099-04-03", 9);
    await marcarFalta(loja, id);
    expect(await reabrirAtendimento(loja, id)).toEqual({ ok: true });
    expect((await sit(id)).situacao).toBe("AGENDADO");
  });

  it("AGENDADO → transicao_invalida (já está aberto)", async () => {
    const id = await novo("2099-04-04", 9);
    expect(await reabrirAtendimento(loja, id)).toMatchObject({ ok: false, motivo: "transicao_invalida" });
  });

  it("id inexistente e outra loja → atendimento_invalido", async () => {
    const outra = (await prisma.loja.create({ data: { nome: `${MARK}reabrir-outra` } })).id;
    const id = await novo("2099-04-05", 9);
    expect(await reabrirAtendimento(loja, "nao-existe")).toMatchObject({ ok: false, motivo: "atendimento_invalido" });
    expect(await reabrirAtendimento(outra, id)).toMatchObject({ ok: false, motivo: "atendimento_invalido" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/atendimentos.test.ts`
Expected: FAIL — `reabrirAtendimento` não existe.

- [ ] **Step 3: Implementar `reabrirAtendimento`**

Em `src/lib/atendimentos/atendimentos.ts`, logo após `marcarFalta` (antes de `concluirProva`), adicionar:

```ts
/**
 * Desfaz uma transição: EM_ATENDIMENTO | CONCLUIDO | FALTOU → AGENDADO, limpando
 * desfecho e atendidoEm. AGENDADO → transicao_invalida (já aberto). Só da loja.
 */
export async function reabrirAtendimento(lojaId: string, id: string): Promise<ResultadoSituacao> {
  const db = tenantPrisma(prisma, lojaId);
  const at = await db.atendimento.findUnique({ where: { id }, select: { situacao: true } });
  if (!at) return { ok: false, motivo: "atendimento_invalido" };
  if (at.situacao === "AGENDADO") return { ok: false, motivo: "transicao_invalida" };
  await db.atendimento.update({ where: { id }, data: { situacao: "AGENDADO", desfecho: null, atendidoEm: null } });
  return { ok: true };
}
```

- [ ] **Step 4: Rodar — passam**

Run: `node node_modules/vitest/vitest.mjs run src/lib/atendimentos/__tests__/atendimentos.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc + commit**

Run: `node node_modules/typescript/bin/tsc --noEmit` → sem saída.

```bash
git add src/lib/atendimentos/atendimentos.ts src/lib/atendimentos/__tests__/atendimentos.test.ts
git commit -m "feat(atendimentos): reabrirAtendimento (desfaz transição → AGENDADO)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Actions — concluir roteia no RESERVOU (M1) + `reabrirAtendimentoAction`

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/atendimentos/actions.ts`

- [ ] **Step 1: Importar `reabrirAtendimento`**

Trocar o import de `@/lib/atendimentos/atendimentos`:

```ts
import { iniciarAtendimento, concluirAtendimento, marcarFalta, reabrirAtendimento } from "@/lib/atendimentos/atendimentos";
```

- [ ] **Step 2: Reescrever `concluirAtendimentoAction` (roteamento M1)**

Substituir a action por:

```ts
export const concluirAtendimentoAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const base = `/loja/${sc.loja.id}/atendimentos`;
  const desfecho = str(formData, "desfecho") as AtendimentoDesfecho;
  const r = await concluirAtendimento(sc.loja.id, str(formData, "id"), desfecho);
  if (!r.ok) redirect(comAviso(base, "erro", r.motivo));
  // M1 — clímax: RESERVOU encaminha a vendedora ao perfil da noiva, direto na reserva.
  if (desfecho === "RESERVOU") {
    const leadId = str(formData, "leadId");
    if (leadId) redirect(`/loja/${sc.loja.id}/noivas/${leadId}?ok=reservou_concluido#reserva`);
  }
  redirect(comAviso(base, "ok", "concluido"));
});
```

(`redirect` lança, então cada ramo encerra o fluxo — não há fall-through indevido.)

- [ ] **Step 3: Adicionar `reabrirAtendimentoAction`**

No fim do arquivo:

```ts
export const reabrirAtendimentoAction = acaoAutorizada("leads", "editar", async (sc, formData) => {
  const base = `/loja/${sc.loja.id}/atendimentos`;
  const r = await reabrirAtendimento(sc.loja.id, str(formData, "id"));
  redirect(comAviso(base, r.ok ? "ok" : "erro", r.ok ? "reaberto" : r.motivo));
});
```

- [ ] **Step 4: tsc + commit**

Run: `node node_modules/typescript/bin/tsc --noEmit` → sem saída.

```bash
git add "src/app/(app)/loja/[lojaId]/atendimentos/actions.ts"
git commit -m "feat(atendimentos): concluir RESERVOU roteia p/ reserva + reabrirAtendimentoAction

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Perfil da noiva — aviso `reservou_concluido` + âncora `#reserva` (M1)

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/noivas/[leadId]/page.tsx`

- [ ] **Step 1: Aviso novo**

No objeto `AVISOS` (perto da linha 64), adicionar a entrada:

```ts
  reservou_concluido: "Atendimento concluído. Agora reserve o vestido escolhido.",
```

- [ ] **Step 2: Âncora no bloco de reserva**

Envolver o bloco "Vestido reservado" numa `<section id="reserva">` com folga de scroll. Trocar:

```tsx
      {/* Vestido reservado — largura total (tem o reservar inline) */}
      {(reservas.length > 0 || podeReservar) && (
        <Bloco titulo="Vestido reservado">
```

por:

```tsx
      {/* Vestido reservado — largura total (tem o reservar inline). id p/ a âncora #reserva (M1). */}
      {(reservas.length > 0 || podeReservar) && (
        <section id="reserva" className="scroll-mt-24">
        <Bloco titulo="Vestido reservado">
```

E fechar a `<section>` logo após o `</Bloco>` correspondente. Localizar o fechamento atual:

```tsx
        </Bloco>
      )}
```

(o que vem logo após o `ReservaLivreInline` / fim do bloco "Vestido reservado") e trocar por:

```tsx
        </Bloco>
        </section>
      )}
```

> Atenção: há mais de um `</Bloco>\n      )}` no arquivo. O correto é o que fecha o bloco **"Vestido reservado"** — confirme pelo contexto imediatamente acima (contém `ReservaLivreInline` ou a lista de `reservas`). Use uma janela de contexto maior na edição para acertar o bloco certo.

- [ ] **Step 3: tsc**

Run: `node node_modules/typescript/bin/tsc --noEmit` → sem saída.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/noivas/[leadId]/page.tsx"
git commit -m "feat(noivas): aviso + âncora #reserva p/ o clímax do Concluir (M1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Fila — confirmar (terminais) + Voltar/Reabrir + leadId no concluir (M2)

**Files:**
- Modify: `src/app/(app)/loja/[lojaId]/atendimentos/page.tsx`

- [ ] **Step 1: Imports**

Adicionar `reabrirAtendimentoAction` ao import das actions e importar `BotaoConfirmar`:

```ts
import { iniciarAtendimentoAction, concluirAtendimentoAction, marcarFaltaAction, reabrirAtendimentoAction } from "./actions";
import { BotaoConfirmar } from "@/components/ui/botao-confirmar";
```

- [ ] **Step 2: Aviso `reaberto`**

No objeto `AVISOS` da página, adicionar:

```ts
  reaberto: "Atendimento reaberto.",
```

- [ ] **Step 3: AGENDADO — confirmar "Marcou falta"**

Trocar o `<form action={marcarFaltaAction}>` do ramo AGENDADO por:

```tsx
              <form action={marcarFaltaAction}>
                <input type="hidden" name="id" value={a.id} />
                <BotaoConfirmar mensagem={`Registrar falta de ${a.noivaNome ?? "a noiva"}?`} className={botaoSuave}>
                  Marcou falta
                </BotaoConfirmar>
              </form>
```

(O "Iniciar atendimento" do mesmo ramo fica como está — sem confirm.)

- [ ] **Step 4: EM_ATENDIMENTO — leadId no concluir, confirmar, e "Voltar"**

Trocar o bloco do ramo `EM_ATENDIMENTO` inteiro por:

```tsx
          {podeEditar && a.situacao === "EM_ATENDIMENTO" && (
            <>
              <form action={criarOrcamentoAction}>
                <input type="hidden" name="atendimentoId" value={a.id} />
                <button type="submit" className={botaoSuave}>
                  Abrir orçamento
                </button>
              </form>
              <form action={concluirAtendimentoAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="leadId" value={a.leadId} />
                <label className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Desfecho</span>
                  <select name="desfecho" required defaultValue="" aria-label="Desfecho do atendimento" className={inputBase}>
                    <option value="" disabled>
                      Como terminou?
                    </option>
                    {DESFECHOS.map((d) => (
                      <option key={d} value={d}>
                        {ROTULO_DESFECHO[d]}
                      </option>
                    ))}
                  </select>
                </label>
                <BotaoConfirmar mensagem={`Concluir o atendimento de ${a.noivaNome ?? "a noiva"}?`} className={botaoPrincipal}>
                  Concluir
                </BotaoConfirmar>
              </form>
              <form action={reabrirAtendimentoAction}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className={botaoSuave}>
                  Voltar
                </button>
              </form>
            </>
          )}
```

- [ ] **Step 5: Novo ramo CONCLUIDO/FALTOU — "Reabrir"**

Logo após o ramo `EM_ATENDIMENTO` (antes do fechamento do `<span>` que envolve os botões), adicionar:

```tsx
          {podeEditar && (a.situacao === "CONCLUIDO" || a.situacao === "FALTOU") && (
            <form action={reabrirAtendimentoAction}>
              <input type="hidden" name="id" value={a.id} />
              <button type="submit" className={botaoSuave}>
                Reabrir
              </button>
            </form>
          )}
```

- [ ] **Step 6: Histórico passa `podeEditar` real**

No render do histórico, trocar:

```tsx
            {lista.map((a) => (
              <Linha key={a.id} a={a} lojaId={lojaId} podeEditar={false} comData />
            ))}
```

por:

```tsx
            {lista.map((a) => (
              <Linha key={a.id} a={a} lojaId={lojaId} podeEditar={podeEditar} comData />
            ))}
```

- [ ] **Step 7: tsc + suíte**

Run: `node node_modules/typescript/bin/tsc --noEmit` → sem saída.
Run: `node node_modules/vitest/vitest.mjs run` → tudo verde.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/atendimentos/page.tsx"
git commit -m "feat(atendimentos): confirmar terminais + Voltar/Reabrir + leadId no concluir (M2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Revisão de design + docs

**Files:**
- Modify: `docs/estado-atual.md`

- [ ] **Step 1: `atelier-design-review`**

Invocar a skill `atelier-design-review` na fila `/atendimentos` (ramos EM_ATENDIMENTO/terminais) e no perfil da noiva (chegada via `#reserva`): o clímax deve parecer cuidado humano (não um toast frio), "Voltar"/"Reabrir" discretos (grafite, não bordô), confirmações com microcopy gentil. Aplicar correções pequenas (sem mudar regra/rota).

- [ ] **Step 2: Gate final**

Run: `node node_modules/vitest/vitest.mjs run && node node_modules/typescript/bin/tsc --noEmit`
Expected: suíte verde; tsc limpo.

- [ ] **Step 3: Anotar M1/M2 no estado-atual**

Marcar **M1/M2** ✅ na seção "Backlog priorizado": M1 = concluir RESERVOU encaminha ao perfil da noiva (`#reserva`) com aviso; M2 = `reabrirAtendimento` (→AGENDADO, limpa desfecho/atendidoEm) + confirmação `BotaoConfirmar` nas terminais + "Voltar" (EM_ATENDIMENTO) / "Reabrir" (histórico). 5 testes de reabrir.

- [ ] **Step 4: Commit**

```bash
git add docs/estado-atual.md src/
git commit -m "docs(estado-atual): M1/M2 (clímax no concluir + desfazer) entregue

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
