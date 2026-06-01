---
name: modo-microfatia
description: Nível de cerimônia por tipo de fatia — quando planejar pesado vs. microfatia
metadata:
  type: feedback
---

Calibrar a cerimônia ao risco da fatia:

- **Planejamento pesado** (auditoria + plano detalhado + aprovação) SÓ quando a fatia toca: dado/data layer, permissões, schema, banco, auth, API, merge ou arquitetura.
- **UI presentacional isolada** → microfatia com guardrails: (1) microplano de ≤5 linhas — arquivos a alterar, estrutura visual em bullets, risco principal; (2) implementa direto; (3) roda `tsc`/`test`/`build`; (4) revisão visual; (5) commit. **Nada de relatório grande por componente/card.**

**Why:** o supervisor do Cassio sinalizou que o processo ficou lento. Cerimônia alta fez sentido nas fatias de permissões/shell (risco real: branch sobre permissões, design em conflito, layout/nav, merge), mas é desperdício para um dashboard presentacional com dados reais + estados vazios.

**How to apply:** classifique a fatia antes de começar. Se for só apresentação/UI sem tocar os gatilhos acima, vá de microfatia. Comandos de validação do projeto em [[validacoes-projeto]].
