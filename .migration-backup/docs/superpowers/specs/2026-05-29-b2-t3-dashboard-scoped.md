# Multitenant B.2-T3 — Rota `/loja/[lojaId]/` + dashboard scoped via `tenantPrisma`

**Data:** 2026-05-29
**Fatia pai:** Multitenant nível B.2 (seleção de loja + scoping `/loja/[lojaId]/...`).
**Posição na B.2:** T3. Depende de T1 (loja ativa na sessão — fechada) e T2 (`tenantPrisma` — fechada, inerte até aqui).
**Próxima task depois desta:** primeira página de módulo (Vestidos/Leads) — que por sua vez destrava B.3-F3 (enforce de `acessosModulos`).

---

## 1. Objetivo

Tirar o guard `tenantPrisma` do laboratório: fazer a **primeira leitura real escopada por loja** num fluxo de produto. Para isso:

1. Move o dashboard para a rota dinâmica `/loja/[lojaId]/` (ancora os módulos futuros: `/loja/[lojaId]/vestidos`, `/leads`, …).
2. Valida que o `[lojaId]` da URL **espelha** `sessao.lojaAtivaId`; se divergir, redireciona ao canônico (falha-fechada).
3. O dashboard lê `tenantPrisma(prisma, lojaId).vestido.count()` e mostra um bloco discreto, honesto e transitório.

Não cria página de módulo. Não introduz troca-de-loja-por-URL. Não mexe em schema. Não toca em `tenantPrisma` (B.2-T2).

---

## 2. Contexto

### Métrica de produto que esta fatia move

**Zero-vazamento provado em fluxo real.** Até agora o isolamento multi-tenant só existe em teste (`tenant.test.ts`). Esta fatia é a primeira vez que uma tela renderiza dado filtrado por `lojaId` pelo guard — o ponto em que o investimento de B.2-T2 começa a pagar. Sinal de "fechou em produto": loja A logada **nunca** vê contagem da loja B, e a URL de uma loja alheia redireciona ao canônico em vez de vazar.

### O que já existe

| Peça | Onde | Status |
|---|---|---|
| `gateSessaoLojaAtiva()` → `sem-sessao`/`sem-loja-ativa`/`ok` | `src/lib/auth/sessao.ts` + `index.ts` | B.2-T1 |
| `getSessaoComLoja()` → `{ usuario, loja } \| null` (loja ativa validada) | `src/lib/auth` | B.2-T1 |
| `listarLojasDoUsuario(usuarioId)` (cross-loja, filtra `ativo`) | `src/lib/auth/sessao.ts` | B.2-T1 |
| Layout `(app)/layout.tsx` faz `gateSessaoLojaAtiva()` → redirect | `src/app/(app)/layout.tsx` | B.2-T1 |
| Dashboard atual (`Olá, {nome}` + nav + logout) | `src/app/(app)/page.tsx` | B.1 |
| `logoutAction` | `src/app/(app)/actions.ts` | B.1 |
| `tenantPrisma(base, lojaId)` + `TENANT_MODELS` (inclui `Vestido`) | `src/lib/tenant.ts` | B.2-T2 — **não tocar** |
| Rota `/selecionar-loja` (seletor adaptativo) | `src/app/(public)/selecionar-loja/` | B.2-T1 |

### Restrição de plataforma

Next 16 ("not the Next.js you know" — ver `AGENTS.md`): `params` e `cookies()` são assíncronos. Antes de codar, **confirmar em `node_modules/next/dist/docs/`** o contrato de `params` em layout/page e o opt-out de cache. Não confiar em memória de versões anteriores.

---

## 3. Decisões de design (fechadas no brainstorming + grill-me)

| # | Decisão | Razão |
|---|---|---|
| D1 | **Fonte da verdade = `sessao.lojaAtivaId`; a URL espelha.** | T1 já entrega `lojaAtivaId` validado (pertence ao usuário, loja ativa). URL-as-truth adiciona superfície de validação que YAGNI (hipótese "1 loja em 99%"). Porta aberta para inverter depois. |
| D2 | **Abordagem A — layout aninhado valida.** `loja/[lojaId]/layout.tsx` faz o match + redirect; `page.tsx` só lê e renderiza. | Separa concerns; cada módulo futuro herda o gate de espelhamento de graça. |
| D3 | **`/` continua hub único** que resolve a loja-padrão e redireciona para `/loja/{id}`. | Centraliza "qual é a loja-padrão" num lugar; pulo extra é server-side e invisível. Evita duplicar a resolução no login. |
| D4 | **Dashboard é transitório; UI mínima e honesta** — não um painel de métricas. | Contagem total é vaidade; o valor da fatia é o encanamento. Não criar expectativa falsa de dashboard analítico. |
| D5 | **Bloco único = "vestidos cadastrados".** Leads adiado para o módulo de leads. | "Catálogo montado?" é sinal de onboarding honesto; lead total sem "novos hoje" mente para a equipe. Uma leitura escopada em `Vestido` já prova o guard. |
| D6 | **Estado-zero orienta, sem CTA:** "Nenhum vestido cadastrado ainda". | Não existe `/vestidos` ainda — um botão "Cadastrar" seria link morto. Ganha CTA quando o módulo existir. |
| D7 | **Link "Trocar loja" → `/selecionar-loja`, só quando `listarLojasDoUsuario().length > 1`.** | Tira o dono multi-filial do beco sem saída sem poluir o caso comum (99% loja única). |
| D8 | **Rota dinâmica explícita; contagem de tenant nunca cacheada entre requests.** | Cache compartilhado vazaria contagem entre tenants — o pior bug multi-tenant. Invariante de design + checagem, não efeito colateral do `cookies()`. |

---

## 4. Mudança de arquivos

```
src/app/(app)/
  layout.tsx              ← inalterado (gate sessão + loja ativa)
  page.tsx                ← VIRA redirect → /loja/{sessao.lojaAtivaId}
  actions.ts              ← inalterado (logoutAction; reusado pela page nova)
  loja/[lojaId]/
    layout.tsx   (NOVO)   ← valida [lojaId] == sessao.lojaAtivaId; senão redirect canônico
    page.tsx     (NOVO)   ← dashboard: lê tenantPrisma(...).vestido.count() + UI mínima
```

Sem mudança de schema. Sem migration. Pontos de entrada (login, selecionar-loja) **não mudam** — continuam apontando para `/`.

### 4.1 `(app)/page.tsx` — hub de redirect

```
const sc = await getSessaoComLoja();   // garantido "ok" pelo gate pai
if (!sc) redirect("/login");           // narrow defensivo
redirect(`/loja/${sc.loja.id}`);
```

### 4.2 `loja/[lojaId]/layout.tsx` — gate de espelhamento (regra única)

```
const sc = await getSessaoComLoja();
const { lojaId } = await params;       // Next 16: params é Promise
if (!sc) redirect("/login");
if (lojaId !== sc.loja.id) redirect(`/loja/${sc.loja.id}`);  // falha-fechada → canônico
return <>{children}</>;
```

Qualquer `[lojaId]` que não seja a loja ativa (lixo, loja de outro tenant, loja que o usuário tem mas não ativou) cai no mesmo caminho: redirect ao canônico. Sem 404, sem vazamento.

### 4.3 `loja/[lojaId]/page.tsx` — leitura escopada + UI

```
const sc = await getSessaoComLoja();
if (!sc) return null;                         // narrow (layout já garantiu ok + espelhamento)
const { lojaId } = await params;
const db = tenantPrisma(prisma, lojaId);
const vestidos = await db.vestido.count();    // 1ª leitura real pelo guard
const lojas = await listarLojasDoUsuario(sc.usuario.id);
const podeGerenciarEquipe = await ehAdminDaLoja(sc.usuario.id, sc.loja.id);
```

UI (tokens do `DESIGN.md`):
- Header: `{loja.nome}` (uppercase, cinza-fumo) + "Olá, {usuario.nome}".
- **Bloco único** de catálogo:
  - `vestidos > 0` → "{vestidos} vestidos cadastrados".
  - `vestidos === 0` → "Nenhum vestido cadastrado ainda" (sem CTA — D6).
- Nav (inalterada do dashboard atual): "Gerenciar equipe →" (se `podeGerenciarEquipe`), "Administração da plataforma →" (se `isSuperAdmin`).
- **"Trocar loja →"** (→ `/selecionar-loja`) **só se `lojas.length > 1`** (D7).
- Botão "Sair" (logout) — inalterado.

### 4.4 Render dinâmico (D8)

Forçar a rota a não cachear contagem de tenant entre requests. O mecanismo exato (ex.: `export const dynamic = "force-dynamic"` vs. opt-out implícito por `cookies()`) será **confirmado no doc do Next** na implementação; a invariante de design é: *nunca servir contagem de tenant de cache compartilhado*.

---

## 5. Testes

| ID | Cenário | Esperado |
|---|---|---|
| T-D (migrado) | Rota protegida do dashboard lê via `tenantPrisma` | A contagem renderizada é escopada por `lojaId`; leitura passa pelo guard (não `prisma.vestido` direto). |
| T-mirror-1 | `[lojaId]` == loja ativa | Renderiza o dashboard. |
| T-mirror-2 | `[lojaId]` != loja ativa (loja de outro tenant / inexistente / não-ativa) | Redirect para `/loja/{lojaAtiva}` (falha-fechada). |
| T-zero | Loja ativa com 0 vestidos | Mostra "Nenhum vestido cadastrado ainda"; sem link de CTA. |
| T-count | Loja ativa com N>0 vestidos (fixture) | Mostra "{N} vestidos cadastrados"; N é da loja ativa, não de outra. |
| T-troca-1 | Usuário com 1 loja | Sem link "Trocar loja". |
| T-troca-2 | Usuário com >1 loja | Link "Trocar loja" presente. |
| T-isolamento | Loja A e loja B ambas com vestidos | Sessão de A nunca vê a contagem de B (prova de zero-vazamento no fluxo real). |

Estilo dos testes: Prisma real, padrão helper-por-id de B.2-T1 (testar sem mockar `cookies()`).

### Gates de regressão
- `npm test` 100% verde (`node node_modules/vitest/vitest.mjs run`).
- `tsc --noEmit` limpo (`node node_modules/typescript/bin/tsc --noEmit`).
- Smoke na porta 5000: `/` → redirect `/loja/{id}`; `/loja/{outro-id}` → redirect canônico; `/loja/{id}` renderiza com a contagem da loja certa.

### Verify manual (visual, fora do escopo do código)
Semear opcionalmente 1 vestido na `loja-moscow` para ver o bloco com contagem ≠ 0. Confirmar que `vendedora` (1 loja) **não** vê "Trocar loja" e que um super-admin com acesso a 2 lojas vê.

---

## 6. Fora de escopo (YAGNI)

- Leads no dashboard (vem com o módulo de leads, com "novos hoje" real).
- Troca-de-loja-por-URL (D1 mantém sessão como verdade).
- Páginas de módulo (`/loja/[lojaId]/vestidos`, `/leads`).
- Enforce de `acessosModulos` (isso é B.3-F3, ainda bloqueada).
- Qualquer mudança de schema/migration.
- Dashboard analítico / cards de métrica (D4 — é transitório).

---

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Vazamento de contagem entre tenants via cache | D8: render dinâmico explícito + T-isolamento. |
| Loop de redirect se loja ativa foi desativada | `getSessaoComLoja()` faz short-circuit (B.2-T1) → gate pai manda pra `/selecionar-loja`, não pra `/loja/{id}`. |
| Contrato de `params`/cache do Next 16 diferente do esperado | Ler `node_modules/next/dist/docs/` antes de codar (AGENTS.md). |
| Dashboard transitório vira dívida visual | D4/D6 limitam o investimento; UI cresce quando os módulos chegarem. |
