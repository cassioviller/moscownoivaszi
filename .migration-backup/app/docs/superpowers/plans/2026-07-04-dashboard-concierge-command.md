# Dashboard Concierge Command — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevar o shell (sidebar + topbar) e o dashboard (`/loja/[lojaId]`) da Moscow Noivas ao nível da referência "Concierge Command" já aprovada, reusando 100% da lógica/dados existentes e mexendo só na camada visual.

**Architecture:** Refatoração majoritariamente **apresentacional**. Toda a lógica de dados já existe (`carregarPainel`, `detalheDoDia`, `vencidasDaLoja`, `estagioDaNoiva`) e **não muda**. Introduzimos (a) primitivos visuais reutilizáveis (`Avatar`, `Selo`/pill, `IconeNav`), (b) um shell mais rico (sidebar com ícones, topbar com busca+notificações), (c) restyle de cada painel do dashboard para casar com a referência. A única lógica **nova** é um helper puro que escolhe a "noiva em destaque" para a linha do tempo — esse é o único ponto com TDD real.

**Tech Stack:** Next.js 16 (App Router, Server Components), React 19, Tailwind v4 (`@theme` tokens já em `src/app/globals.css`), Vitest (lib), Playwright (e2e).

**Fonte visual da verdade:** a proposta aprovada em `scratchpad/dashboard-proposta.html` (artifact "v1-concierge-command"). Todas as classes/estrutura abaixo derivam dela. Os tokens de cor já existem em `globals.css` (`papel`, `champagne`, `bordo`, `rose-dust`, `grafite`, `cinza-fumo`, `borda-suave`, `--mn-radius-*`, `--mn-shadow-*`).

---

## Convenções deste plano (leia antes de começar)

**Testes — siga o padrão do repo, não invente cobertura:**
- O repo testa **lógica pura em `src/lib/**`** com Vitest; **componentes/páginas não têm unit test** (só 8 e2e Playwright). NÃO adicione unit test de componente presentacional — não é o padrão daqui.
- **TDD real** só na Task 6 (helper `jornadaDestaque`, que é lógica pura).
- Para tarefas **presentacionais** (shell e painéis), a verificação é: `tsc --noEmit` limpo + `pnpm build` + revisão visual no app rodando + e2e verde. Chamamos isso de **Protocolo Visual** (definido abaixo) e cada task presentacional o referencia.

**Protocolo Visual (V1–V4):**
- **V1** — `pnpm exec tsc --noEmit` → sem erros.
- **V2** — subir o app (`pnpm --filter ./app run dev` ou o script do projeto) e abrir a tela alterada; conferir contra `dashboard-proposta.html` (layout, bordô só onde previsto, hover/foco, responsivo em ~820px e ~1080px).
- **V3** — `pnpm exec playwright test` (ou o subconjunto afetado) → verde. Se algum seletor quebrou por mudança de texto/estrutura, ajustar o `.spec.ts` **na mesma task**.
- **V4** — rodar `/atelier-design-review` (skill do projeto) na tela e endereçar itens "parece ERP/básico" antes de commitar a fase.

**Git (CLAUDE.md do app):** commits pequenos e frequentes **direto na `main`**, sem branch/worktree. Antes de cada commit: `tsc --noEmit` limpo e `vitest run` passando. `git push` só quando o dono pedir.

**Invariante de segurança:** nenhuma task altera gate de permissão, Server Action, rota ou query de tenant. Esconder/estilizar link nunca é autorização — os gates reais permanecem em cada page/layout/action.

---

## File Structure

**Novos arquivos:**
- `src/components/ui/avatar.tsx` — avatar de inicial (círculo com gradiente rosé→champagne). Presentacional puro.
- `src/components/ui/selo.tsx` — pill de status (`ok` / `pendente` / `atencao`), warm, sem verde/amarelo semáforo.
- `src/components/layout/icones-nav.tsx` — mapa `chave → <svg>` (line-icons finos) para a navegação.
- `src/lib/leads/jornada-destaque.ts` — **lógica nova**: escolhe a noiva ativa com casamento mais próximo e devolve seus passos de jornada + nome. Com teste.
- `src/lib/leads/__tests__/jornada-destaque.test.ts` — testes do helper.

**Arquivos modificados (restyle, lógica preservada):**
- `src/components/layout/nav-items.ts` — adicionar campo `icone: string` a cada `NavItem` (chave para `icones-nav`).
- `src/components/layout/sidebar.tsx` — sidebar rica com ícones + rodapé de usuário (avatar).
- `src/components/layout/topbar.tsx` — saudação editorial + busca (⌘K, visual) + loja + sino de notificações + logout movido para o menu do usuário.
- `src/components/layout/mobile-nav.tsx` — ícones nos itens do drawer (mudança mínima).
- `src/components/dashboard/indicador-dia.tsx` — card KPI com ícone em círculo champagne + número grande + microindicador.
- `src/components/dashboard/dia-do-atelier.tsx` — linhas de agenda com avatar + pill.
- `src/components/dashboard/lista-casamentos.tsx` — datechip + nome + dias restantes.
- `src/components/dashboard/painel-atencoes.tsx` — item com ícone + texto humano + chevron.
- `src/components/dashboard/painel-jornada-noiva.tsx` — trilho horizontal (referência), estados feito/atual/futuro.
- `src/components/dashboard/destaque-atelier.tsx` — card do vestido como peça de acervo.
- `src/components/dashboard/saudacao-dia.tsx` — pode ser absorvida pela nova Topbar (avaliar remover do corpo).
- `src/app/(app)/loja/[lojaId]/page.tsx` — recompor a grade (KPIs → centro operacional 3 colunas → jornada+destaque), largura útil maior.
- `src/app/(app)/loja/[lojaId]/layout.tsx` — passar props extras (contagem de notificações, nome do usuário) à Topbar, se necessário.

---

## Phase 0 — Primitivos visuais

### Task 1: Avatar de inicial

**Files:**
- Create: `src/components/ui/avatar.tsx`

- [ ] **Step 1: Implementar o componente**

```tsx
// src/components/ui/avatar.tsx
// Avatar de inicial — sem foto de cliente (privacidade/LGPD e nem sempre há foto).
// Círculo com gradiente quente rosé→champagne e iniciais em bordô profundo.
// Presentacional puro; usado na agenda, no rodapé da sidebar e na jornada.

const TAMANHOS = { sm: "h-[34px] w-[34px] text-[12px]", md: "h-9 w-9 text-[12px]" } as const;

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 0 || partes[0] === "") return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : "";
  return (primeira + ultima).toUpperCase();
}

export function Avatar({ nome, tamanho = "md" }: { nome: string; tamanho?: keyof typeof TAMANHOS }) {
  return (
    <span
      aria-hidden
      className={[
        "inline-grid shrink-0 place-items-center rounded-full font-medium text-bordo-deep",
        "bg-[linear-gradient(140deg,var(--color-rose-dust),var(--color-champagne))]",
        TAMANHOS[tamanho],
      ].join(" ")}
    >
      {iniciais(nome)}
    </span>
  );
}
```

- [ ] **Step 2: Verificar tokens** — confirmar que `--color-rose-dust`, `--color-champagne` e a utility `text-bordo-deep` existem. `bordo-deep` NÃO está em `globals.css` hoje; adicionar em `@theme`:

```css
/* src/app/globals.css — dentro de @theme, junto de --color-bordo */
--color-bordo-deep: oklch(30% 0.09 25);
```

- [ ] **Step 3: V1** — `pnpm exec tsc --noEmit` → sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/avatar.tsx src/app/globals.css
git commit -m "feat(ui): Avatar de inicial + token bordo-deep"
```

### Task 2: Selo (pill de status)

**Files:**
- Create: `src/components/ui/selo.tsx`

- [ ] **Step 1: Implementar**

```tsx
// src/components/ui/selo.tsx
// Pill de status — warm, nunca verde/amarelo semáforo (DESIGN §5/§Estados).
// ok = confirmado (neutro + check champagne); pendente = aguardando (champagne suave);
// atencao = cuidado (bordô discreto, uso raro).
type Variante = "ok" | "pendente" | "atencao";

const ESTILO: Record<Variante, string> = {
  ok: "bg-surface-soft text-cinza-fumo border border-borda",
  pendente: "bg-[rgba(200,169,118,0.16)] text-[#8a6d3a]",
  atencao: "bg-[rgba(122,24,54,0.08)] text-bordo",
};

export function Selo({ variante, children }: { variante: Variante; children: React.ReactNode }) {
  return (
    <span
      className={[
        "inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-medium",
        ESTILO[variante],
      ].join(" ")}
    >
      {variante === "ok" && (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" className="h-[11px] w-[11px] stroke-champagne">
          <path d="M4 12l5 5L20 6" />
        </svg>
      )}
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Token `surface-soft`** — o mockup usa `--surface-soft:#f7efe7`. Hoje `globals.css` tem `papel-suave` (oklch equivalente). Usar `bg-papel-suave` no lugar de `bg-surface-soft` para não duplicar token. Ajustar a string `ok` para `"bg-papel-suave text-cinza-fumo border border-borda"`.

- [ ] **Step 3: V1** — `pnpm exec tsc --noEmit` → sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/selo.tsx
git commit -m "feat(ui): Selo de status warm (ok/pendente/atencao)"
```

### Task 3: Ícones de navegação

**Files:**
- Create: `src/components/layout/icones-nav.tsx`

- [ ] **Step 1: Implementar o mapa de ícones** — line-icons finos (stroke-width 1.6), uma chave por item de nav. Copiar os paths exatos do `dashboard-proposta.html` (sidebar): `painel`, `noivas`, `atendimentos`, `agenda`, `provas`, `ajustes`, `acervo`, `casamentos`, `financeiro`, `config`, `equipe`, `permissoes`, `admin`, `troca`, `calendario`, `contratos`, `reservas`.

```tsx
// src/components/layout/icones-nav.tsx
// Mapa chave→ícone (line-art fino) para Sidebar e MobileNav. Puramente visual.
import type { ReactElement } from "react";

const P = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6} className="h-[17px] w-[17px] flex-none stroke-current">
    <path d={d} />
  </svg>
);

export const ICONES_NAV: Record<string, ReactElement> = {
  painel: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6} className="h-[17px] w-[17px] flex-none stroke-current">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  noivas: P("M12 8a3.2 3.2 0 1 0 0-6.4M12 8a3.2 3.2 0 1 1 0-6.4M5 21a7 7 0 0 1 14 0"),
  acervo: P("M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6"),
  financeiro: P("M12 2v20M8 6h6.5a2.5 2.5 0 0 1 0 5H9.5a2.5 2.5 0 0 0 0 5H16"),
  config: P("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"),
  // ...demais chaves com os paths do mockup (agenda, provas, ajustes, casamentos, atendimentos, calendario, contratos, reservas, equipe, permissoes, admin, troca)
};

export function iconeNav(chave: string): ReactElement | null {
  return ICONES_NAV[chave] ?? null;
}
```

> **Nota ao executor:** preencher TODAS as chaves usadas por `nav-items.ts` (Task 4). Se uma chave faltar, `iconeNav` devolve `null` e o item renderiza sem ícone (degrada suave, mas complete todas).

- [ ] **Step 2: V1** — `pnpm exec tsc --noEmit` → sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/icones-nav.tsx
git commit -m "feat(layout): mapa de icones de navegacao (line-art)"
```

---

## Phase 1 — Shell (sidebar + topbar)

### Task 4: Adicionar chave de ícone a cada item de nav

**Files:**
- Modify: `src/components/layout/nav-items.ts`

- [ ] **Step 1: Estender o tipo `NavItem`** com `icone: string`:

```ts
export type NavItem = {
  href: string;
  label: string;
  icone: string; // chave em ICONES_NAV (icones-nav.tsx)
  exact?: boolean;
};
```

- [ ] **Step 2: Preencher `icone` em cada item** dentro de `navSections`. Mapa sugerido:
  - Início → `painel`; Noivas → `noivas`; Agendar → `atendimentos`; Calendário → `agenda`; Contratos → `contratos`; Reservas → `reservas`; Provas → `provas`; Ajustes → `ajustes`; Vestidos → `acervo`; Catálogo → `acervo`; Contas a receber/pagar/Comissões/Fluxo → `financeiro`; Equipe → `equipe`; Permissões → `permissoes`; Administração → `admin`; Trocar loja → `troca`.

```ts
// exemplo (aplicar o mesmo padrão a todos):
{ href: `/loja/${lojaId}`, label: "Início", icone: "painel", exact: true }
atelie.push(
  { href: loja("/noivas"), label: "Noivas", icone: "noivas" },
  { href: loja("/atendimentos/novo"), label: "Agendar", icone: "atendimentos" },
  { href: loja("/calendario"), label: "Calendário", icone: "agenda" },
  { href: loja("/contratos"), label: "Contratos", icone: "contratos" },
  { href: loja("/reservas"), label: "Reservas", icone: "reservas" },
);
```

- [ ] **Step 3: V1** — `pnpm exec tsc --noEmit`. Espera-se erro TS até aqui? Não: `icone` obrigatório força preencher todos; se faltar algum, o TS acusa. Corrigir até limpo.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/nav-items.ts
git commit -m "feat(layout): chave de icone por item de navegacao"
```

### Task 5: Sidebar rica

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Ler o arquivo atual** e preservar assinatura (`{ lojaId, flags }`), `usePathname`, `navSections`, `isActive`. Trocar só a apresentação.

- [ ] **Step 2: Reescrever o JSX** conforme o mockup (marca com "mark" MN, itens com `iconeNav(item.icone)`, item ativo com barra bordô à esquerda + `bg-[rgba(122,24,54,0.06)] text-bordo`, rodapé com `Avatar` do usuário). Passar `nome`/`perfil` do usuário como novas props vindas do layout. Classes exatas: ver `.sidebar`, `.nav-item`, `.nav-item.active`, `.side-foot` no `dashboard-proposta.html`.

- [ ] **Step 3: Ajustar chamada no layout** (`src/app/(app)/loja/[lojaId]/layout.tsx`) para passar `nome={sc.usuario.nome}` e um rótulo de perfil à `Sidebar`.

- [ ] **Step 4: V1 + V2** — typecheck limpo; abrir o app e comparar a sidebar com o mockup (ícones alinhados, item ativo em bordô com barra, hover rosé suave, rodapé com avatar).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/sidebar.tsx "src/app/(app)/loja/[lojaId]/layout.tsx"
git commit -m "feat(layout): sidebar Concierge (icones + rodape de usuario)"
```

### Task 6: Helper `jornadaDestaque` (única lógica nova — TDD)

**Files:**
- Create: `src/lib/leads/jornada-destaque.ts`
- Test: `src/lib/leads/__tests__/jornada-destaque.test.ts`

- [ ] **Step 1: Escrever o teste que falha** — escolhe a noiva ATIVA com casamento mais próximo no futuro; ignora encerradas/sem data; devolve `null` quando não há candidata.

```ts
// src/lib/leads/__tests__/jornada-destaque.test.ts
import { describe, it, expect } from "vitest";
import { escolherDestaque, type CandidataDestaque } from "../jornada-destaque";

const hoje = new Date(Date.UTC(2026, 6, 4)); // 2026-07-04

function cand(over: Partial<CandidataDestaque>): CandidataDestaque {
  return { id: "x", noivaNome: "N", casamentoData: new Date(Date.UTC(2026, 8, 1)), ativa: true, ...over };
}

describe("escolherDestaque", () => {
  it("escolhe a ativa com casamento futuro mais próximo", () => {
    const r = escolherDestaque(
      [
        cand({ id: "a", casamentoData: new Date(Date.UTC(2026, 8, 1)) }),
        cand({ id: "b", casamentoData: new Date(Date.UTC(2026, 6, 20)) }),
        cand({ id: "c", casamentoData: new Date(Date.UTC(2027, 0, 1)) }),
      ],
      hoje,
    );
    expect(r?.id).toBe("b");
  });

  it("ignora encerradas/inativas e datas passadas", () => {
    const r = escolherDestaque(
      [
        cand({ id: "a", ativa: false, casamentoData: new Date(Date.UTC(2026, 6, 10)) }),
        cand({ id: "b", casamentoData: new Date(Date.UTC(2026, 6, 1)) }), // passado
        cand({ id: "c", casamentoData: new Date(Date.UTC(2026, 9, 1)) }),
      ],
      hoje,
    );
    expect(r?.id).toBe("c");
  });

  it("devolve null quando não há candidata elegível", () => {
    expect(escolherDestaque([], hoje)).toBeNull();
    expect(escolherDestaque([cand({ ativa: false })], hoje)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./app exec vitest run src/lib/leads/__tests__/jornada-destaque.test.ts`
Expected: FAIL ("escolherDestaque is not a function" / módulo inexistente)

- [ ] **Step 3: Implementar a função pura**

```ts
// src/lib/leads/jornada-destaque.ts
// Escolhe a "noiva em destaque" para a linha do tempo do dashboard: a noiva ATIVA
// cujo casamento futuro está mais próximo (a mais urgente). Puro e testável; a
// montagem dos passos de jornada fica em jornada.ts (fonte única).
export type CandidataDestaque = {
  id: string;
  noivaNome: string;
  casamentoData: Date | null;
  ativa: boolean;
};

export function escolherDestaque(cands: CandidataDestaque[], hoje: Date): CandidataDestaque | null {
  const hojeMs = hoje.getTime();
  const elegiveis = cands
    .filter((c) => c.ativa && c.casamentoData !== null && c.casamentoData.getTime() >= hojeMs)
    .sort((a, b) => a.casamentoData!.getTime() - b.casamentoData!.getTime());
  return elegiveis[0] ?? null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter ./app exec vitest run src/lib/leads/__tests__/jornada-destaque.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Adicionar a busca de dados** — no `carregarPainel` (ou uma função `carregarDestaqueJornada(lojaId)` no mesmo arquivo `painel.ts`), reusar `leads`/`linhas` já carregadas para montar `CandidataDestaque[]`, chamar `escolherDestaque`, e para a escolhida montar seus `PassoJornada[]` via a função existente em `jornada.ts` (a mesma usada por `PainelJornadaNoiva`). Expor em `PainelLoja` um novo campo `destaqueJornada: { noivaNome: string; passos: PassoJornada[]; encerrada: string | null } | null`.

> Ao executor: identifique em `src/lib/leads/jornada.ts` a função que gera `PassoJornada[]` a partir dos fatos (a que `painel-jornada-noiva.tsx` já consome) e reuse-a — NÃO reimplemente a jornada.

- [ ] **Step 6: V1 + testes** — `pnpm exec tsc --noEmit` limpo; `pnpm --filter ./app exec vitest run` verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/leads/jornada-destaque.ts src/lib/leads/__tests__/jornada-destaque.test.ts src/lib/loja/painel.ts
git commit -m "feat(dashboard): noiva em destaque para a linha do tempo (helper puro + TDD)"
```

### Task 7: Topbar de recepção

**Files:**
- Modify: `src/components/layout/topbar.tsx`
- Modify: `src/app/(app)/loja/[lojaId]/layout.tsx`

- [ ] **Step 1: Ler o arquivo atual.** Preservar o padrão server-component com `<form action={logoutAction}>` (trava 3 — não passar Server Action a componente client). O `MobileNav` continua à esquerda em telas pequenas.

- [ ] **Step 2: Reescrever o JSX** conforme `.topbar` do mockup: bloco de saudação editorial (serif, `font-display`) + `Boa tarde, {primeiroNome}` + data por extenso; busca central (visual, com `⌘K` — apenas apresentacional nesta fase, sem lógica de busca); botão de loja ativa (`lojaNome`); sino de notificações com badge de contagem. O logout ("Sair") passa a viver dentro de um menu do usuário/último item — **atenção e2e:** os helpers `cadastrar-noiva.spec.ts` e `cadastrar-vestido.spec.ts` comentam que existe um botão "Sair" no Topbar antes do `<main>`; manter um botão/acionável com o texto acessível "Sair" (mesmo dentro de menu) OU atualizar esses specs. Ver Task 12.

- [ ] **Step 3: Computar a saudação no server** (o `page.tsx` hoje calcula `saudacao`/`dataFormatada`; mover essa derivação para a Topbar ou para o layout e passar via props). A contagem do sino: usar `painel.atencoes.length + (vencidas ? 1 : 0)` OU um número simples vindo do layout; manter simples.

- [ ] **Step 4: V1 + V2** — typecheck limpo; conferir topbar contra o mockup (saudação serif, busca centralizada, sino com badge bordô, sticky com blur).

- [ ] **Step 5: V3 parcial** — rodar `pnpm exec playwright test e2e/auth.spec.ts` e os specs de cadastro; ajustar seletores se o logout mudou de forma (Task 12 cobre a auditoria completa).

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/topbar.tsx "src/app/(app)/loja/[lojaId]/layout.tsx"
git commit -m "feat(layout): topbar de recepcao (saudacao, busca, notificacoes)"
```

### Task 8: Ícones no drawer mobile

**Files:**
- Modify: `src/components/layout/mobile-nav.tsx`

- [ ] **Step 1: Ler o arquivo** e adicionar `iconeNav(item.icone)` antes do label em cada link do drawer, preservando toda a lógica de foco/Esc/overlay. Mudança mínima e apresentacional.

- [ ] **Step 2: V1 + V2** — typecheck limpo; abrir <820px, verificar drawer com ícones e foco preso.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/mobile-nav.tsx
git commit -m "feat(layout): icones no drawer mobile"
```

---

## Phase 2 — Indicadores do dia

### Task 9: Card KPI

**Files:**
- Modify: `src/components/dashboard/indicador-dia.tsx`

- [ ] **Step 1: Ler o componente atual** e preservar props (`rotulo`, `valor`, `descricao`, `atencao?`). Adicionar prop opcional `icone?: string` (chave `ICONES_NAV`) e `delta?: { texto: string; up?: boolean }`.

- [ ] **Step 2: Reescrever o JSX** conforme `.kpi` do mockup: `card` com ícone em círculo `bg-papel-suave text-bordo`, número grande (`text-[34px] font-semibold num`/`tabular-nums`), rótulo, microindicador (`delta`, `up` em bordô). Hover: `shadow-hover` + `-translate-y-[2px]`.

- [ ] **Step 3: Atualizar o `page.tsx`** para passar `icone`/`delta` a cada `IndicadorDia` (Noivas → `noivas`; Acervo → `acervo`; Casamentos → `casamentos`; Em provas → `ajustes`) e trocar a grade para `grid-cols-2 lg:grid-cols-4` + card-CTA "Ver agenda completa" (opcional, ver mockup `.kpi.cta`).

- [ ] **Step 4: V1 + V2** — typecheck; comparar faixa de KPIs com o mockup (tabular-nums, ícone champagne, delta bordô só quando `up`).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/indicador-dia.tsx "src/app/(app)/loja/[lojaId]/page.tsx"
git commit -m "feat(dashboard): faixa de indicadores Concierge (icone+numero+delta)"
```

---

## Phase 3 — Centro operacional (3 colunas)

### Task 10: Agenda do dia, próximos casamentos e atenções

**Files:**
- Modify: `src/components/dashboard/dia-do-atelier.tsx`
- Modify: `src/components/dashboard/lista-casamentos.tsx`
- Modify: `src/components/dashboard/painel-atencoes.tsx`
- Modify: `src/app/(app)/loja/[lojaId]/page.tsx`

- [ ] **Step 1: `dia-do-atelier.tsx`** — ler o componente; para cada linha da agenda, usar `Avatar nome={...}` + horário (`num`) + nome/tipo + `Selo` (ok/pendente conforme status já existente). Cabeçalho de painel (`.panel-head` do mockup) "Hoje no atelier" + link "Ver dia completo". Linha final "Agendar atendimento" (`.addrow`).

- [ ] **Step 2: `lista-casamentos.tsx`** — ler; trocar cada item por `.datechip` (dia grande + mês) + nome + "faltam N dias". Cabeçalho "Próximos dias".

- [ ] **Step 3: `painel-atencoes.tsx`** — ler; cada `Atencao` vira `.att` (ícone em quadrado suave + título humano + subtítulo + chevron). Cabeçalho "Atenções" com `count-pill` bordô = `atencoes.length`. Fonte de dados permanece `painel.atencoes` (não inventar novas queries nesta fase).

- [ ] **Step 4: Recompor a grade em `page.tsx`** — envolver os três painéis numa `section` `grid lg:grid-cols-[1.35fr_1fr_1fr] gap-5` (`.ops` do mockup), primeira coluna (agenda) mais larga. Responsivo: colapsar para 1 coluna <820px.

- [ ] **Step 5: V1 + V2** — typecheck; comparar as 3 colunas com o mockup (avatares, pills warm, chevrons, larguras).

- [ ] **Step 6: V3** — rodar `pnpm exec playwright test e2e/jornada.spec.ts` (o teste "Início mostra o Dia do atelier" toca esta área); ajustar seletor se o texto/estrutura mudou.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/dia-do-atelier.tsx src/components/dashboard/lista-casamentos.tsx src/components/dashboard/painel-atencoes.tsx "src/app/(app)/loja/[lojaId]/page.tsx"
git commit -m "feat(dashboard): centro operacional em 3 colunas (agenda/proximos/atencoes)"
```

---

## Phase 4 — Jornada da noiva + destaque do atelier

### Task 11: Trilho de jornada horizontal + card de destaque

**Files:**
- Modify: `src/components/dashboard/painel-jornada-noiva.tsx`
- Modify: `src/components/dashboard/destaque-atelier.tsx`
- Modify: `src/app/(app)/loja/[lojaId]/page.tsx`

- [ ] **Step 1: `painel-jornada-noiva.tsx`** — ler; trocar a lista vertical por um **trilho horizontal** (`.track` do mockup): linha champagne com progresso bordô até a etapa `atual`, nós com ícone (feito=check champagne, atual=bordô com halo, futuro=contorno). Abaixo, resumo `.jsum` (próxima etapa, responsável, status %, casamento/dias). Consome `destaqueJornada` (Task 6) via `page.tsx`. Manter estados feito/atual/futuro já existentes em `PassoJornada`.

- [ ] **Step 2: `destaque-atelier.tsx`** — ler; card com mídia (a foto real do vestido via a rota de foto já existente; manter `versaoFoto` para cache-bust), tag "Destaque do acervo", modelo/coleção/descrição e botão bordô "Ver no acervo". Fallback sem foto: silhueta line-art (paths do mockup `.hl-media svg`).

- [ ] **Step 3: Recompor a grade inferior em `page.tsx`** — `section` `grid lg:grid-cols-[1.7fr_1fr] gap-5` (`.lower`). Renderizar `PainelJornadaNoiva` só quando `destaqueJornada` existir; senão manter o `PainelVazio` atual.

- [ ] **Step 4: V1 + V2** — typecheck; comparar jornada horizontal e card de destaque com o mockup (bordô só na etapa atual + progresso; foto do vestido carrega).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/painel-jornada-noiva.tsx src/components/dashboard/destaque-atelier.tsx "src/app/(app)/loja/[lojaId]/page.tsx"
git commit -m "feat(dashboard): linha do tempo horizontal + destaque do acervo"
```

---

## Phase 5 — Fechamento (e2e, review, limpeza)

### Task 12: Auditoria e2e do shell

**Files:**
- Modify (se necessário): `e2e/helpers.ts`, `e2e/auth.spec.ts`, `e2e/cadastrar-noiva.spec.ts`, `e2e/cadastrar-vestido.spec.ts`, `e2e/jornada.spec.ts`

- [ ] **Step 1: Rodar a suíte completa** — `pnpm exec playwright test`. Listar falhas.

- [ ] **Step 2: Corrigir seletores** que dependiam do texto/posição antigos do Topbar (logout "Sair", saudação "Olá, {nome}" → "Boa tarde, {nome}") e da sidebar. Preferir seletores acessíveis (`getByRole`/`getByLabel`) estáveis ao novo layout.

- [ ] **Step 3: Rodar de novo** — `pnpm exec playwright test` → verde.

- [ ] **Step 4: Commit**

```bash
git add e2e/
git commit -m "test(e2e): ajusta seletores ao novo shell Concierge"
```

### Task 13: Design review e limpeza

- [ ] **Step 1: V4** — rodar `/atelier-design-review` no dashboard e no shell; endereçar itens "parece ERP/básico" ou "bordô mal usado".
- [ ] **Step 2:** Avaliar remover/enxugar `saudacao-dia.tsx` se a saudação migrou para a Topbar (evitar duplicidade). Se removido, checar imports órfãos.
- [ ] **Step 3: Gate final** — `pnpm exec tsc --noEmit` limpo + `pnpm --filter ./app exec vitest run` verde + `pnpm exec playwright test` verde + `pnpm build`.
- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(dashboard): review Concierge + limpeza pos-refactor"
```

---

## Self-Review (feita pelo autor do plano)

**Cobertura vs. proposta aprovada (`dashboard-proposta.html`):**
- Sidebar rica com ícones + item ativo bordô → Tasks 3,4,5 ✓
- Topbar (saudação, busca ⌘K, loja, notificações) → Task 7 ✓
- Faixa de indicadores (ícone+número+delta) → Task 9 ✓
- Centro operacional 3 colunas (agenda c/ avatar, próximos, atenções) → Tasks 1,2,10 ✓
- Linha do tempo horizontal da noiva → Tasks 6,11 ✓
- Destaque do acervo → Task 11 ✓
- Responsivo/mobile → Tasks 8,10,11 (breakpoints do mockup) ✓

**Fora de escopo (proposital):** correção do deploy (aponta pro build Vite antigo), remoção dos apps mortos em `artifacts/`, CRUD de admin. São os itens #2–#4 da conversa e viram planos próprios.

**Riscos anotados:**
- Timeline de uma noiva exige escolher "a noiva" → resolvido por `escolherDestaque` (nearest wedding). Se o produto preferir outra regra (ex.: noiva aberta no atendimento de hoje), trocar só o helper (Task 6).
- e2e pode quebrar no logout/saudação → Task 12 cobre.
- Busca ⌘K é só visual nesta entrega (sem backend de busca) → documentado na Task 7; virar feature própria depois.
- `saudacao-dia.tsx` pode ficar redundante → Task 13.
