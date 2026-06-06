# DRY da urgência + roteiro Concierge Atelier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar task-a-task. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** (A) Centralizar a lógica de urgência do casamento (hoje duplicada em reservas, ajustes e na aba do calendário) no helper `contagem-casamento`, alinhando todos à convenção de tempo de São Paulo; (B) verificar visualmente as telas de Noivas já refinadas; (C) levar a direção Concierge Atelier às telas restantes do roteiro (Vestidos/Acervo, Detalhe do vestido, Agenda, Ajustes, Reservas, Financeiro), cada uma como sub-projeto guiado por revisão.

**Architecture:** O núcleo de urgência vira função pura testável (`diasAteCasamento`, `casamentoUrgente`, `JANELA_URGENCIA_DIAS`) com base em `hojeUTC()` de `@/lib/tempo` (meia-noite UTC do dia em São Paulo). Cada página consome o helper em vez de recopiar `DIA_MS`/`JANELA`/`hojeUTC` local. As telas de design são afinadas em fatias pequenas, cada fatia gated por `tsc` + `vitest` e commitada na `main`.

**Tech Stack:** Next.js 16 (App Router, Server Components), Prisma (tenantPrisma), Vitest. Datas à meia-noite UTC; dia-calendário = São Paulo (`@/lib/tempo`).

**Convenções do projeto (CLAUDE.md):** trabalhar e commitar **direto na `main`** (sem branches/worktrees/merge). Gates por commit: `node node_modules/typescript/bin/tsc --noEmit` limpo e `npm run test` verde (o shim `.bin/tsc` não é executável no sandbox → usar `node node_modules/typescript/bin/tsc`). Antes de tocar telas: ler os docs de design, mapear os arquivos reais, apresentar plano curto, implementar em pequenas etapas. Não quebrar regra de negócio, rotas ou banco.

---

## Estado atual (o que já foi feito — não refazer)

Commits recentes na `main` (módulo Noivas, já entregues):
- `6ac4fdd` — `src/lib/leads/contagem-casamento.ts` + teste; contagem regressiva na lista; título editorial. **O helper existe e é consumido pelo detalhe e pela lista de Noivas.**
- `bc9bab6` — empty state da lista como convite do atelier.
- `c49fd38` — detalhe da noiva agrupado por intenção (`BlocoLeve`).

> ⚠️ O helper de `6ac4fdd` foi escrito com base no **dia UTC** (`Date.UTC(agora.getUTC…)`), enquanto o resto do sistema usa o **dia de São Paulo** (`hojeUTC()` de `@/lib/tempo`). A Fase A corrige isso de propósito: unifica tudo na convenção de São Paulo (some um off-by-one latente entre 21h–24h SP).

---

## File Structure

**Fase A — modificados:**
- `src/lib/leads/contagem-casamento.ts` — re-assinatura de `diasAteCasamento` para base `hojeMs`; passa a derivar o default de `hojeUTC()`; remove `hojeUTCms`.
- `src/lib/leads/__tests__/contagem-casamento.test.ts` — ajusta as chamadas para passar `hojeMs` (meia-noite UTC).
- `src/app/(app)/loja/[lojaId]/reservas/page.tsx` — consome o helper; remove `DIA_MS`/`JANELA`/`hojeUTC` locais (usa `hojeUTC` de `@/lib/tempo`).
- `src/app/(app)/loja/[lojaId]/ajustes/page.tsx` — idem.
- `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaProvasAjustes.tsx` — consome `casamentoUrgente`/`JANELA` e `diasAteCasamento` para o casamento; mantém `diasAte` local só para provas e `prazoProva`/`prazoCasamento` (microcopy de domínio).

**Fase B — sem código** (verificação visual; gera, no máximo, micro-correções que viram suas próprias fatias).

**Fase C — por tela (entry points):**
- Vestidos/Acervo: `…/vestidos/page.tsx`
- Detalhe do vestido: `…/vestidos/[vestidoId]/page.tsx`
- Agenda: `…/agenda/page.tsx`
- Ajustes: `…/ajustes/page.tsx`
- Reservas: `…/reservas/page.tsx`
- Financeiro: `…/financeiro/page.tsx` (+ `receber`, `pagar`, `comissoes`, `pagar/folha`)

---

# FASE A — DRY da urgência do casamento

## Task A1: Re-assinar o helper para base `hojeMs` (São Paulo) e ajustar o teste

**Files:**
- Modify: `src/lib/leads/contagem-casamento.ts`
- Test: `src/lib/leads/__tests__/contagem-casamento.test.ts`

- [ ] **Step 1: Atualizar o teste (vermelho)** — substituir o conteúdo de `src/lib/leads/__tests__/contagem-casamento.test.ts` por (passa `hojeMs` = meia-noite UTC; remove dependência de hora):

```ts
import { describe, it, expect } from "vitest";
import {
  diasAteCasamento,
  rotuloContagem,
  casamentoUrgente,
  JANELA_URGENCIA_DIAS,
} from "@/lib/leads/contagem-casamento";

const ms = (s: string) => new Date(`${s}T00:00:00.000Z`).getTime();
const hojeMs = ms("2026-06-06"); // meia-noite UTC do dia (convenção do sistema)

describe("diasAteCasamento", () => {
  it("conta em dias-calendário UTC a partir de hojeMs", () => {
    expect(diasAteCasamento(new Date("2026-06-06T00:00:00.000Z"), hojeMs)).toBe(0);
    expect(diasAteCasamento(new Date("2026-06-07T00:00:00.000Z"), hojeMs)).toBe(1);
    expect(diasAteCasamento(new Date("2026-06-20T00:00:00.000Z"), hojeMs)).toBe(14);
    expect(diasAteCasamento(new Date("2026-06-21T00:00:00.000Z"), hojeMs)).toBe(15);
  });
  it("é negativo quando o casamento já passou", () => {
    expect(diasAteCasamento(new Date("2026-06-01T00:00:00.000Z"), hojeMs)).toBe(-5);
  });
});

describe("rotuloContagem", () => {
  it("humaniza hoje, amanhã e o futuro", () => {
    expect(rotuloContagem(0)).toBe("É hoje");
    expect(rotuloContagem(1)).toBe("Amanhã");
    expect(rotuloContagem(9)).toBe("Em 9 dias");
  });
});

describe("casamentoUrgente", () => {
  it("verdadeiro só dentro da janela e no presente/futuro", () => {
    expect(casamentoUrgente(0)).toBe(true);
    expect(casamentoUrgente(JANELA_URGENCIA_DIAS)).toBe(true);
    expect(casamentoUrgente(JANELA_URGENCIA_DIAS + 1)).toBe(false);
    expect(casamentoUrgente(-1)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar (vermelho)** — `npx vitest run src/lib/leads/__tests__/contagem-casamento.test.ts`
  Esperado: FALHA — a assinatura atual aceita `Date` no 2º arg e a base é o dia UTC, não `hojeMs`.

- [ ] **Step 3: Reescrever o helper** — substituir o conteúdo de `src/lib/leads/contagem-casamento.ts` por:

```ts
// src/lib/leads/contagem-casamento.ts
// Contagem regressiva até o casamento. Base meia-noite UTC do dia-calendário em
// São Paulo (convenção do sistema — @/lib/tempo) p/ evitar off-by-one. Puro/
// testável: o "hoje" entra como ms (default = hoje SP). Mesma janela de urgência
// (≤14d) do dashboard/perfil/ajustes/reservas/calendário.
import { hojeUTC } from "@/lib/tempo";

export const JANELA_URGENCIA_DIAS = 14;
const DIA_MS = 86_400_000;

/** Dias-calendário até o casamento (negativo = já passou). `hojeMs` deve ser a
 *  meia-noite UTC do dia de referência; o default usa o dia de hoje em SP. */
export function diasAteCasamento(casamentoData: Date, hojeMs: number = hojeUTC().getTime()): number {
  return Math.round((casamentoData.getTime() - hojeMs) / DIA_MS);
}

/** Rótulo humano p/ contagem no presente/futuro: "É hoje" | "Amanhã" | "Em N dias". */
export function rotuloContagem(dias: number): string {
  if (dias === 0) return "É hoje";
  if (dias === 1) return "Amanhã";
  return `Em ${dias} dias`;
}

/** Urgência concierge: casamento ainda por vir, dentro da janela. */
export function casamentoUrgente(dias: number): boolean {
  return dias >= 0 && dias <= JANELA_URGENCIA_DIAS;
}
```

- [ ] **Step 4: Rodar (verde)** — `npx vitest run src/lib/leads/__tests__/contagem-casamento.test.ts` → PASS.

- [ ] **Step 5: Gate de tipos** — `node node_modules/typescript/bin/tsc --noEmit`
  > As páginas de Noivas chamam `diasAteCasamento(data)` sem 2º arg → continuam compilando (default agora é SP, melhora de comportamento, sem mudança de tipo). Esperado: limpo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/leads/contagem-casamento.ts src/lib/leads/__tests__/contagem-casamento.test.ts
git commit -m "refactor(leads): contagem do casamento na convenção SP (hojeMs + @/lib/tempo)"
```

---

## Task A2: Reservas consome o helper

**Files:** Modify `src/app/(app)/loja/[lojaId]/reservas/page.tsx`

- [ ] **Step 1: Imports** — adicionar no topo, junto aos demais imports:

```ts
import { hojeUTC } from "@/lib/tempo";
import { diasAteCasamento, casamentoUrgente } from "@/lib/leads/contagem-casamento";
```

- [ ] **Step 2: Remover duplicações locais** — apagar as linhas:

```ts
const DIA_MS = 86_400_000;
const JANELA_URGENCIA_DIAS = 14; // mesmo limiar do dashboard/perfil
```

e a função local `hojeUTC` inteira:

```ts
// Hoje como meia-noite UTC do dia-calendário em São Paulo (convenção do sistema).
function hojeUTC(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}
```

> `hojeUTC` passa a vir de `@/lib/tempo` (mesma semântica). A linha `const hoje = hojeUTC().getTime();` (≈ linha 69) continua válida.

- [ ] **Step 3: Trocar o cálculo de dias e urgência** — onde hoje está:

```ts
                    ? Math.round((r.casamentoData.getTime() - hoje) / DIA_MS)
```
trocar por:
```ts
                    ? diasAteCasamento(r.casamentoData, hoje)
```
e a linha de urgência:
```ts
                  const urgente = !passadas && dias !== null && dias >= 0 && dias <= JANELA_URGENCIA_DIAS;
```
por:
```ts
                  const urgente = !passadas && dias !== null && casamentoUrgente(dias);
```

- [ ] **Step 4: Gates** — `node node_modules/typescript/bin/tsc --noEmit` limpo; `npm run test` verde (cobre as leituras de reservas).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/reservas/page.tsx"
git commit -m "refactor(reservas): urgência do casamento via contagem-casamento (DRY)"
```

---

## Task A3: Ajustes consome o helper

**Files:** Modify `src/app/(app)/loja/[lojaId]/ajustes/page.tsx`

- [ ] **Step 1: Imports** — adicionar:

```ts
import { hojeUTC } from "@/lib/tempo";
import { diasAteCasamento, casamentoUrgente } from "@/lib/leads/contagem-casamento";
```

- [ ] **Step 2: Remover duplicações locais** — apagar:

```ts
const DIA_MS = 86_400_000;
const JANELA_URGENCIA_DIAS = 14; // mesmo limiar do dashboard/perfil/livro
```

e a função local `hojeUTC(): number` inteira:

```ts
// Hoje como meia-noite UTC do dia-calendário em São Paulo (convenção do sistema).
function hojeUTC(): number {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`).getTime();
}
```

> Como a versão local devolvia `number` (ms) e a de `@/lib/tempo` devolve `Date`, ajustar o call site: `const hoje = hojeUTC();` (≈ linha 60) passa a `const hoje = hojeUTC().getTime();`.

- [ ] **Step 3: Trocar dias e urgência** — onde está:

```ts
                ? Math.round((a.casamentoData.getTime() - hoje) / DIA_MS)
```
trocar por:
```ts
                ? diasAteCasamento(a.casamentoData, hoje)
```
e:
```ts
            const urgente = dias !== null && dias >= 0 && dias <= JANELA_URGENCIA_DIAS;
```
por:
```ts
            const urgente = dias !== null && casamentoUrgente(dias);
```

- [ ] **Step 4: Gates** — `tsc --noEmit` limpo; `npm run test` verde.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/ajustes/page.tsx"
git commit -m "refactor(ajustes): urgência do casamento via contagem-casamento (DRY)"
```

---

## Task A4: Aba Provas & Ajustes do calendário consome o helper

**Files:** Modify `src/app/(app)/loja/[lojaId]/calendario/_abas/AbaProvasAjustes.tsx`

> Aqui há DOIS usos de "dias até": **prova** (`p.dataReal`, microcopy `prazoProva`) e **casamento** (`a.casamentoData`, urgência + `prazoCasamento`). Só o de casamento migra para o helper; o de prova é domínio distinto e fica local.

- [ ] **Step 1: Import** — adicionar:

```ts
import { diasAteCasamento, casamentoUrgente } from "@/lib/leads/contagem-casamento";
```

- [ ] **Step 2: Remover só a constante de janela** — apagar:

```ts
const JANELA_URGENCIA_DIAS = 14; // mesmo limiar do dashboard/ajustes/perfil
```

> **Manter** `const DIA_MS = 86_400_000;` e `const diasAte = (hojeMs, alvo) => …` — ainda usados por `prazoProva(diasAte(hojeMs, p.dataReal))`.

- [ ] **Step 3: Trocar o cálculo do casamento** — onde está:

```ts
              const dias = a.casamentoData ? diasAte(hojeMs, a.casamentoData) : null;
              const urgente = dias !== null && dias >= 0 && dias <= JANELA_URGENCIA_DIAS;
```
trocar por:
```ts
              const dias = a.casamentoData ? diasAteCasamento(a.casamentoData, hojeMs) : null;
              const urgente = dias !== null && casamentoUrgente(dias);
```

- [ ] **Step 4: Gates** — `tsc --noEmit` limpo; `npm run test` verde.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/loja/[lojaId]/calendario/_abas/AbaProvasAjustes.tsx"
git commit -m "refactor(calendario): urgência do casamento via contagem-casamento (DRY)"
```

---

# FASE B — Verificação visual das telas de Noivas

## Task B1: Rodar o app e revisar Noivas (lista + detalhe)

**Files:** nenhum (verificação). Micro-correções viram fatias próprias.

- [ ] **Step 1: Subir o app** — `npm run dev` e abrir uma loja → `/loja/<id>/noivas`.
- [ ] **Step 2: Checklist (lista)** — confirmar: título em serifa (`font-display`); contagem do casamento aparece no card e fica **bordô só ≤14d** em jornada viva; empty state (loja sem noivas) mostra o convite + CTA; chips de filtro e busca funcionam; responsivo em ~375px (cards empilham, nada estoura).
- [ ] **Step 3: Checklist (detalhe)** — abrir uma noiva: jornada à esquerda; à direita o card **Atendimentos** com "Agendar" e "Iniciar" lado a lado; **Casamento** e **Contato** como fatos leves (sem moldura) abaixo da divisória; contagem urgente em bordô; foco de teclado visível nos links/böтões.
- [ ] **Step 4: Acessibilidade rápida** — contraste do bordô sobre marfim ok; alvos de toque ≥44px nos links de ação.
- [ ] **Step 5: Registrar achados** — se algo destoar, anotar como item de fatia (não corrigir no improviso). Sem commit nesta task.

---

# FASE C — Roteiro Concierge nas telas restantes

> **Scope check (writing-plans):** cada tela abaixo é um subsistema independente. O processo é o mesmo (abaixo); a tela atual deve **graduar para o seu próprio plano datado** quando chegar a vez, porque o código concreto de cada fatia só nasce **depois** da revisão daquela tela. Esta fase é o **roteiro + processo**, não código pré-escrito (não é placeholder: é a natureza de refino dirigido por revisão).

## Processo por tela (repetir para C1…C6)

- [ ] **1. Ler os docs de design** — `DESIGN.md`, `docs/design/REFERENCIA_VISUAL.md` (já no contexto do projeto).
- [ ] **2. Mapear** — ler o(s) `page.tsx` da tela + componentes que ela usa.
- [ ] **3. Revisar** — rodar `/atelier-design-review` apontando o(s) arquivo(s); produzir: alinhado / parece básico / parece ERP / correções prioritárias.
- [ ] **4. Plano curto** — listar 1–3 fatias pequenas (apresentação only; sem regra/rota/banco). Apresentar ao dono antes de codar.
- [ ] **5. Implementar fatia a fatia** — cada fatia: editar → `tsc --noEmit` limpo → `npm run test` verde → commit pequeno na `main`.
- [ ] **6. Reusar tokens existentes** — cores/`--mn-*`/`font-display` de `globals.css`; componentes `Bloco`/`BlocoLeve`/`Paginacao`; helpers (`contagem-casamento`, `brl`, `@/lib/tempo`). Não introduzir novos tokens sem necessidade.

## Ordem e foco (do roteiro `IMPLEMENTACAO_DESIGN.md` §9)

- [ ] **C1 — Vestidos / Acervo** (`…/vestidos/page.tsx`): o vestido deve parecer **acervo, não estoque** (capa, identidade do modelo, status como peça). Reusar o padrão de capa 3:4 já usado em "Vestidos pré-escolhidos".
- [ ] **C2 — Detalhe do vestido** (`…/vestidos/[vestidoId]/page.tsx`): peça de acervo (modelo, coleção, ano, descrição, disponibilidade) — não ficha de produto.
- [ ] **C3 — Agenda** (`…/agenda/page.tsx`): coração operacional; uma linha por janela de trabalho; bordô só em urgência/atual.
- [ ] **C4 — Ajustes** (`…/ajustes/page.tsx`): fila da costureira; já consome a urgência (Task A3) — foco em ritmo/legibilidade da lista, evitar "tabela hostil".
- [ ] **C5 — Reservas** (`…/reservas/page.tsx`): livro de compromissos (noiva protagonista); já consome a urgência (Task A2) — foco em agrupamento por mês e hierarquia.
- [ ] **C6 — Financeiro** (`…/financeiro/page.tsx` + `receber`/`pagar`/`comissoes`/`pagar/folha`): **maior risco de "cara de ERP"** (DESIGN §13). Calma visual, números grandes limpos, bordô só em foco/CTA; cuidar para a tabela não dominar. Provável sub-plano próprio dado o tamanho.

> Cada tela C1–C6 conclui quando responde "boutique premium, não sistema comum?" (checklist §14 do DESIGN.md) e os gates estão verdes.

---

## Self-Review (autor do plano)

**Cobertura do pedido:**
- (1) DRY da urgência (reservas/ajustes/calendario) → Tasks A1 (helper+teste), A2, A3, A4. ✔
- (2) Verificação visual de Noivas → Task B1. ✔
- (3) Concierge nas telas restantes → Fase C (processo + C1…C6, com entry points exatos). ✔

**Placeholders:** Fase A e B são totalmente concretas (código/edits/comandos completos). Fase C é roteiro dirigido por revisão **de propósito** — o código de cada fatia só pode ser escrito após a revisão da tela; a alternativa (inventar edits agora) violaria "mapear antes de alterar" do CLAUDE.md. Mitigação: processo passo-a-passo fixo + arquivos exatos + recomendação de graduar cada tela para plano próprio.

**Consistência de tipos:** `diasAteCasamento(casamentoData: Date, hojeMs?: number): number` usada igual em A2/A3/A4 (sempre `(data, hojeMs)`); `casamentoUrgente(dias: number): boolean`; `JANELA_URGENCIA_DIAS: number`. `hojeUTC()` de `@/lib/tempo` devolve `Date` → call sites usam `.getTime()` para obter `hojeMs` (ajustado em A2/A3). As páginas de Noivas (já no repo) chamam `diasAteCasamento(data)` sem `hojeMs` → default SP, sem mudança de assinatura.

**Risco conhecido:** a mudança de base UTC→SP no helper altera levemente o resultado entre 21h–24h (SP) para casamentos no limite do dia — é **correção** (alinha à convenção do sistema), coberta pelos testes determinísticos (passam `hojeMs` explícito). Fase C toca apresentação apenas; qualquer mudança de leitura/dado sai do escopo e exige novo spec.
