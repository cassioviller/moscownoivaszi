---
name: replit-autocheckpoint
description: O auto-checkpoint do Replit commita na branch ativa e engole .replit + memória
metadata:
  type: project
---

O ambiente Replit faz auto-checkpoint/commit na branch ativa (HEAD), sem curadoria de stage. Ele varre para dentro do commit justamente os arquivos que mantemos fora de propósito: `.replit` (mudança automática de ambiente) e `.claude/projects/.../memory/*`. Já apareceu como um commit de mensagem `s` (`f36ec43`) em `feat/design-concierge-atelier`.

**Why:** desfaz a disciplina de stage seletivo (commitar só os arquivos da fatia). Se o HEAD não estiver em `main`, o checkpoint também desencontra `main`/`gitsafe-backup` do trabalho real.

**How to apply:** ao retomar uma sessão, conferir `git log --oneline main..HEAD` — se houver commit lixo (`s`, ou que toque `.replit`/memória), limpar com `git reset <ultimo-commit-bom>` (mixed) antes de empilhar fatia nova. `main` tem contido todo o trabalho via FF a cada fatia — não confiar em diagnóstico que diga que "nada chegou na main" sem verificar `git branch -v` + `main..branch`. Relaciona-se a [[modo-microfatia]].
