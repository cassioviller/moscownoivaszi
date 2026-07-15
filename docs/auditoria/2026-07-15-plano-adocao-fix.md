# Plano — Adoção do branch `fix/auditoria-sistema-noivas` no `main`

> Decisão (2026-07-15): adotar a solução completa e testada do branch de fix.
> Estratégia escolhida pelo usuário: **"adotar o branch de fix"** — trazer
> backend + schema + cliente + frontend do fix, migrar o banco, e descartar o
> redo redundante do working tree (enxertando apenas a busca do `selecionar-loja`).

## Contexto (verdade de campo levantada)

- Suíte E2E do `main` (39 testes) partiu de **19✅/20❌** → depois do fix do
  `selecionar-loja` (A1/A3) está em **~29✅/10❌**.
- O branch de fix (12 Lotes, 113 testes de API) resolve **todos** os 13 achados
  (A1–A13), mas roda sobre um **schema de DB mais novo** (Lotes 3/5/6:
  disponibilidade, integridade de contratos, máquina de estados).
- Delta de schema: `lib/db/src/schema` — 4 arquivos, ~49 linhas
  (`atendimentos.ts`, `common/enums.ts`, `contratos.ts`, `relations.ts`).
- Working tree tem ~2800 linhas de frontend não commitado que **reimplementam**
  as mesmas correções do fix (redundante) → serão descartadas por decisão.
- `DATABASE_URL` = banco de dev do Replit (`helium/heliumdb`) → migração segura.

## Cuidados (arquivos que NÃO vêm do fix)

O commit de topo do `main` (`2c2590c`) adicionou infra de e2e que o fix não tem.
Preservar a versão do `main` em:
- `artifacts/moscow-noivas/vite.config.ts` (proxy `/api` sob `E2E_API_PROXY`)
- `package.json` raiz + `pnpm-lock.yaml` (playwright, script `test:e2e`)
- `e2e/**`, `playwright.config.ts`

## Fase 0 — Fundação (determinística, executada diretamente)

1. `git checkout fix -- artifacts/api-server lib/api-spec lib/api-client-react lib/api-zod lib/db`
2. `git checkout fix -- artifacts/moscow-noivas/src` (todo o frontend do fix)
3. Re-enxertar `selecionar-loja.tsx` com busca (versão feita nesta sessão,
   salva no scratchpad) — mantém a UX de busca + as correções A1/A3.
4. `pnpm install` — reconciliar lockfile (vitest do api-server + playwright do root).
5. `pnpm --filter @workspace/db run push` — aplicar o schema novo no banco.
6. `pnpm run typecheck` — deve passar (código do fix é internamente consistente).

## Fase 1 — Verificação (agentes em paralelo)

- Rodar a suíte E2E completa (`pnpm run test:e2e`).
- Para cada falha residual, um agente investiga + corrige (paralelizável por
  spec/achado, já que tocam arquivos disjuntos). Verificação final: e2e verde.

## Meta de aceite

- `pnpm run typecheck` verde.
- Testes de API do api-server (vitest) verdes.
- Suíte E2E: 39/39 (ou, no mínimo, todos os A1–A13 resolvidos).
