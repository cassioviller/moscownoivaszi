@AGENTS.md
# Fluxo de git (IMPORTANTE — sobrepõe o padrão)
- Trabalhe e commite **direto na `main`**. NÃO crie branches `feat/*` nem worktrees, e
  NÃO faça o ritual de branch→merge (só dá retrabalho ao dono).
- Isso vale também dentro de skills/workflows (writing-plans, subagent-driven-development,
  finishing-a-development-branch): ignore o passo "crie uma branch / faça merge" — commite na `main`.
- Antes de cada commit na `main`, mantenha os gates verdes: `tsc --noEmit` limpo e `vitest run` passando.
- Faça commits pequenos e frequentes na `main`. Só use `git push` quando o dono pedir.

# Operações rotineiras (auto-aprovar)
- Criar e editar arquivos .py, .js, .html, .md
- Executar scripts Python na pasta do projeto
- git add, commit direto na `main` (sem criar branches)
- Instalar pacotes via pip (dentro do venv do projeto)

# Requer confirmação explícita
- Deletar qualquer arquivo
- Modificar arquivos fora da pasta do projeto
- Operações de banco de dados (DELETE, DROP, TRUNCATE)


# Moscow Noivas — Concierge Atelier

## Direção criativa oficial

Para qualquer alteração de UI/UX no projeto Moscow Noivas, considere a direção criativa abaixo:

- O sistema deve parecer um Concierge Atelier premium.
- Não deve parecer ERP, CRM genérico ou dashboard financeiro.
- A experiência deve transmitir boutique, delicadeza, sofisticação, calma e clareza operacional.
- A noiva deve ser tratada como jornada, não como lead frio.
- O vestido deve parecer peça de acervo, não item de estoque.
- O dashboard deve priorizar 70% informação útil e 30% atmosfera premium.
- A imagem de referência é guia de atmosfera e composição, não cópia rígida.

Leia também:

@docs/design/DESIGN_CONCIERGE_ATELIER.md
@docs/design/REFERENCIA_VISUAL.md
@docs/design/IMPLEMENTACAO_DESIGN.md
@docs/design/PROMPTS_CLAUDE.md

Antes de alterar telas:
1. Leia os arquivos acima.
2. Mapeie os arquivos reais do frontend.
3. Apresente um plano curto.
4. Implemente em pequenas etapas.
5. Não quebre regra de negócio, rotas ou banco.
