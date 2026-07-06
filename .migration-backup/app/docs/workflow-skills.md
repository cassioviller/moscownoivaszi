# Workflow & Skills — Moscow Noivas

Guia de processo do projeto: **qual skill usar em cada fase**, para não usar skill à toa e evitar retrabalho. Mantido manualmente; a parte de "estado atual" é um snapshot datado e envelhece — a parte de mapeamento é durável.

## O loop

```
PLAN → RED-TEAM → BUILD → VERIFY → POLISH → REVIEW → (próxima fatia → PLAN)
```

Cada fatia do projeto passa pelo loop inteiro. Uma fatia sem UI pula a parte de UX/UI; uma fatia sem I/O externo pula `security-review`.

## Mapa: fase × skill (durável)

| Fase | Tarefa | Skill | Por quê | Entrada | Saída |
|---|---|---|---|---|---|
| PLAN | Desenhar fatia nova | `brainstorming` | Ideia difusa → design aprovado, sem pular pro código | Objetivo + contexto do repo | Spec em `docs/superpowers/specs/` |
| PLAN | Detalhar o plano | `writing-plans` | Spec → tasks com testes | Spec aprovado | Plano em `docs/superpowers/plans/` |
| RED-TEAM | Furar o design | `grill-me` (ou `grill-with-docs` quando houver CONTEXT.md/ADRs) | Acha o erro no plano antes de virar código | Plano + spec | Decisões fechadas + plano endurecido |
| BUILD | Implementar (loop) | `tdd` ou `test-driven-development` | Red→green→refactor, um teste por vez (vertical slice) | Plano endurecido | Código + testes verdes |
| BUILD | Orquestrar tasks | `subagent-driven-development` (um subagente/task) ou `executing-plans` (inline c/ checkpoints); `dispatching-parallel-agents` p/ tasks independentes | O plano dita o passo-a-passo; escolher conforme isolamento | Plano | Tasks executadas + review entre elas |
| BUILD | Isolar workspace | `using-git-worktrees` (ou branch de feature) | Trabalho isolado da main | — | Worktree/branch |
| DEBUG | Bug/regressão | `systematic-debugging` ou `diagnose` | Reproduzir→minimizar→causa-raiz antes de corrigir | Falha | Fix + teste de regressão |
| VERIFY | Validar | `verification-before-completion` (evidência antes de afirmar); `verify`/`run` p/ app/tela | Para lib pura o teste basta; nunca afirmar "passou" sem rodar | Suíte + tipos | Verde + tipos limpos |
| POLISH | Limpar | `simplify` (= `code-review --fix`) | Aplica simplificações de baixo risco | Diff | Diff enxuto |
| REVIEW | Qualidade | `code-review` (+ `requesting-code-review`/`receiving-code-review` p/ disciplina) | Bugs de correção e reuso no diff | Diff/range commitado | Lista de achados |
| REVIEW | Segurança (seletivo) | `security-review` | Só com I/O externo/authz/dados sensíveis | Branch | Achados de segurança |
| POLISH/REVIEW | UX/UI (fatia com tela) | `impeccable` (primária) | Auditoria de UX/hierarquia/a11y/motion | Tela/componente | UI revisada |
| INTEGRAR | Fechar a branch | `finishing-a-development-branch` | Decide merge/PR/cleanup com critério | Branch verde | Integrado |
| DOC | Registrar decisões | **sem skill** (edição direta) | É escrita objetiva | Decisões tomadas | Spec/plano atualizados |
| HANDOFF | Passar contexto | `handoff` | Compacta a conversa p/ outro agente continuar | Conversa | Doc de handoff |

## Skills de UI — escolher UMA primária

Há quatro skills de design sobrepostas. Não usar as quatro. Primária: **`impeccable`** (auditar/elevar UX). Auxiliares pontuais: `design-taste-frontend` (anti-template em redesign), `ui-ux-pro-max` (biblioteca de estilos/paletas para começar do zero), `magicpath` (só se usar componentes MagicPath). Todas **N/A** enquanto não houver fatia com tela.

## Repertório de skills instalado (2026-05-29)

Duas suítes completas instaladas no esquema `.agents/skills` + symlink + `skills-lock.json` (**32 skills** no total). Install **funcional** (não plugin oficial → sem hook de SessionStart).
- **`obra/superpowers` (14):** brainstorming, writing-plans, test-driven-development, executing-plans, subagent-driven-development, dispatching-parallel-agents, systematic-debugging, verification-before-completion, requesting-code-review, receiving-code-review, using-git-worktrees, finishing-a-development-branch, writing-skills, using-superpowers.
- **`mattpocock/skills` (14):** grill-me, write-a-skill, tdd, diagnose, grill-with-docs, triage, to-issues, to-prd, zoom-out, prototype, improve-codebase-architecture, caveman, handoff, setup-matt-pocock-skills.
- **Sobreposições (escolher UMA):** `tdd` ↔ `test-driven-development`; `diagnose` ↔ `systematic-debugging`; `grill-me` ↔ `grill-with-docs` (use o `-with-docs` só quando houver CONTEXT.md/ADRs). A família engineering do mattpocock (`to-issues`,`to-prd`,`triage`,`diagnose`,`tdd`,`improve-codebase-architecture`,`zoom-out`) espera um setup (`setup-matt-pocock-skills`: bloco `## Agent skills` + `docs/agents/`) que **ainda não foi rodado** — rodar antes de usá-las.

## Fora do loop (não usar por usar)

`write-a-skill`/`writing-skills` (só ao criar skill), `setup-matt-pocock-skills`, `to-prd`/`to-issues`/`triage` (não há issue tracker no fluxo atual), `prototype`, `caveman`, `zoom-out`, `keybindings-help`, `update-config`, `fewer-permission-prompts`, `claude-api` (não há Claude API no projeto), `init`, `loop`, `schedule`. Utilitárias/meta — entram só sob necessidade específica.

## Subagentes (complementam, não substituem)

`Explore` (varredura de código), `Plan` (arquitetura), `general-purpose` (multi-passo). Úteis dentro do BUILD para navegar/buscar sem poluir o contexto.

---

## Snapshot — 2026-05-29 (envelhece)

**B.1 Identidade FECHADA:** PLAN ✓ → RED-TEAM ✓ → BUILD ✓ (T1-6) → POLISH ✓ (T7, via `impeccable teach`) → VERIFY ✓ (T8, 7 critérios da spec §8 + check de produto com 2º usuário Vendedora).

**B.2-T2 antecipada:** guard `tenantPrisma` (`src/lib/tenant.ts`) + 10 testes de zero-vazamento (5 Vestido + 4 helper Lead + 1 canário anti-raw). Fechada via skill `product-engineer` (duas faces: produto + harness). Gates: **69/69 verdes**, `tsc` limpo.

**Aplicação prática do `product-engineer`:** dois ciclos seguidos. (1) Diagnóstico das duas faces antes de fechar B.1 — face harness levou à decisão de antecipar o guard `tenantPrisma` em vez de só rodar a Task 8 manual; face produto definiu TTOL como métrica destravada e o check do 2º usuário como sinal de "fechou". (2) Integração do blueprint do guard ao codebase real — auditoria TENANT_MODELS vs schema, decisão consciente de excluir `UsuarioLoja` (controle de acesso, não dado), tightening do canário anti-raw (precisão, não relaxamento).

**B.2-T3 FECHADA (2026-05-29):** dashboard scoped via `tenantPrisma`. Loop completo aplicado — PLAN (`brainstorming`) → RED-TEAM (`grill-me`, com respostas recomendadas focadas no usuário final) → BUILD (subagent-driven na mão: um subagente por task, review entre tasks — na época as sub-skills `superpowers:*` ainda **não** estavam instaladas; hoje estão, ver "Repertório de skills instalado") → VERIFY (`node node_modules/vitest/...` 109/109 + `tsc` + smoke na porta 5000). O grill-me mudou 3 pontos pró-usuário: estado-zero sem link morto, link "Trocar loja" p/ dono multi-filial, invariante anti-cache de tenant. Spec/plano: `docs/superpowers/{specs,plans}/2026-05-29-b2-t3-dashboard-scoped.md`.

**Módulo Vestidos + permissões granulares FECHADO (2026-05-29):** 1ª página de módulo (Vestidos: listar/criar/editar via `tenantPrisma`) + API de permissões granulares (`acessosModulos {módulo:{ver,criar,editar}}` + `podeNoModulo`). Loop: PLAN (`brainstorming` + `impeccable` **consultiva** — 1ª vez que a skill de UI entrou no PLAN, gerando direção de design para o spec sem escrever código) → BUILD (subagent-driven na mão, 8 tasks em 3 ondas; o review entre ondas pegou um bug de tipo no `create` do guard) → VERIFY (119/119 + `tsc` + smoke). Spec/plano: `docs/superpowers/{specs,plans}/2026-05-29-modulo-vestidos*`.

**Revisão UI/UX (2026-05-29, skill `ui-ux-pro-max`):** auditoria de todas as páginas contra Quick Reference + perfil (WCAG AA). Correções: `lang` pt-BR, inputs ≥16px (anti iOS-zoom), empty state `/equipe`. Contraste calculado (OKLCH→WCAG) — tokens mantidos. Flags (touch target 44px, borda 1.4.11, heading `/admin`, DRY dos forms) em `docs/estado-atual.md`. Nota: `ui-ux-pro-max` e `impeccable` se sobrepõem — `impeccable` é a primária (auditar/elevar/`document`/`extract`); `ui-ux-pro-max` serve como checklist a11y/UX rápido. Não usar as duas pela mesma coisa.

**Central de permissões FECHADA (2026-05-29, branch `feat/central-permissoes`, falta merge):** templates globais + override por loja (`PerfilOverrideLoja` no `tenantPrisma`; snapshot + `normalizarAcessos`). **1º loop com as `superpowers`/`mattpocock` instaladas:** PLAN (`brainstorming` + `grill-me`, 8 decisões com prática-recomendada) → spec **v2** após `spec-document-reviewer` (subagente pegou um blocker no read-path PK-composta×guard) → `writing-plans` + `plan-document-reviewer` → BUILD com `tdd` (red→green por task, 8 tasks, branch de feature) → VERIFY (133/133 + `tsc` + smoke data-layer + HTTP) → REVIEW (`code-review` high, 7 finders: 2 bugs reais corrigidos — data-loss de módulo oculto no save, checkbox stale — + DRY; 2 refutados). Aprendizados de ambiente: rodar `npx prisma generate` após mudar schema (migrate dev não regenera no output custom); top-level await quebra no `tsx` (usar `main()`); porta 5000 é do dev server do Replit (segundo `next dev` recusa). Spec/plano: `docs/superpowers/{specs,plans}/2026-05-29-central-permissoes*`.

**Próximo passo:** decidir integração da branch (`finishing-a-development-branch`: merge/PR) e seguir p/ módulos **Leads/Interesses** — ao ganharem página entram em `MODULOS_VISIVEIS` da grade de permissões. Fatias com tela → `impeccable` volta. Detalhe em `docs/estado-atual.md`.
