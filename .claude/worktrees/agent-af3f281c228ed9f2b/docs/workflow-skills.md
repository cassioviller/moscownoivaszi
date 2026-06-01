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
| RED-TEAM | Furar o design | `grill-me` | Acha o erro no plano antes de virar código | Plano + spec | Decisões fechadas + plano endurecido |
| BUILD | Implementar | **sem skill** (TDD direto; `Explore`/`Plan` de apoio) | O plano já dita o passo-a-passo | Plano endurecido | Código + testes verdes |
| VERIFY | Validar | **sem skill** p/ lib pura (vitest + `tsc`); `verify`/`run` quando houver app/tela | Para função pura, o teste é a verificação | Suíte + tipos | Verde + tipos limpos |
| POLISH | Limpar | `simplify` (= `code-review --fix`) | Aplica simplificações de baixo risco | Diff | Diff enxuto |
| REVIEW | Qualidade | `code-review` | Bugs de correção e reuso no diff | Diff/range commitado | Lista de achados |
| REVIEW | Segurança (seletivo) | `security-review` | Só com I/O externo/authz/dados sensíveis | Branch | Achados de segurança |
| POLISH/REVIEW | UX/UI (fatia com tela) | `impeccable` (primária) | Auditoria de UX/hierarquia/a11y/motion | Tela/componente | UI revisada |
| DOC | Registrar decisões | **sem skill** (edição direta) | É escrita objetiva | Decisões tomadas | Spec/plano atualizados |

## Skills de UI — escolher UMA primária

Há quatro skills de design sobrepostas. Não usar as quatro. Primária: **`impeccable`** (auditar/elevar UX). Auxiliares pontuais: `design-taste-frontend` (anti-template em redesign), `ui-ux-pro-max` (biblioteca de estilos/paletas para começar do zero), `magicpath` (só se usar componentes MagicPath). Todas **N/A** enquanto não houver fatia com tela.

## Fora do loop (não usar por usar)

`write-a-skill`, `keybindings-help`, `update-config`, `fewer-permission-prompts`, `claude-api` (não há Claude API no projeto), `init`, `loop`, `schedule`. São utilitárias/meta — entram só sob necessidade específica.

## Subagentes (complementam, não substituem)

`Explore` (varredura de código), `Plan` (arquitetura), `general-purpose` (multi-passo). Úteis dentro do BUILD para navegar/buscar sem poluir o contexto.

---

## Snapshot — 2026-05-27 (envelhece)

**Plano B (Motor de Disponibilidade):** PLAN ✓ → RED-TEAM ✓ (4 grills) → BUILD ✓ (40 testes verdes, `tsc` limpo, commits até `9de1ef6`).

**Próximo passo:** REVIEW de qualidade do motor.
- Skill: `code-review`. Prompt: `/code-review high` — se o diff vier vazio (commits foram direto na `main`), apontar o range: `/code-review high b60f1a3..HEAD`.
- `security-review`: pular (motor é função pura, sem superfície de ataque).

**Critério para avançar (REVIEW → próxima fatia):**
1. `code-review` sem achados de **correção** abertos.
2. Doc fechada: decisão #2 (manutenção) confirmada com o cliente ou marcada como pendente explícita no spec da Base.
3. Suíte cheia verde + `tsc` limpo revalidados após ajustes.

Cumpridos os três, o loop reinicia em **PLAN** para a próxima fatia — provavelmente a primeira com UI (onde `impeccable` entra).
