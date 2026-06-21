# Implementação do conceito Concierge Atelier

## Objetivo

Aplicar a direção criativa **Concierge Atelier** no projeto Moscow Noivas, começando pelo dashboard e expandindo para o restante do sistema.

## Estrutura recomendada no repositório

```txt
/
├── CLAUDE.md
├── DESIGN.md
├── docs/
│   └── design/
│       ├── REFERENCIA_VISUAL.md
│       ├── IMPLEMENTACAO_DESIGN.md
│       ├── PROMPTS_CLAUDE.md
│       └── references/
│           └── dashboard-concierge-command.png
└── .claude/
    └── skills/
        └── atelier-design-review/
            └── SKILL.md
```

## Passo 1 — Colocar os arquivos no repositório

Copie estes arquivos para a raiz do projeto:

- `CLAUDE.md`
- `DESIGN.md`
- pasta `docs/design`
- pasta `.claude/skills/atelier-design-review`

## Passo 2 — Confirmar que Claude leu o contexto

No terminal do Replit, dentro do projeto:

```bash
claude
```

Depois, peça:

```txt
Leia o CLAUDE.md, DESIGN.md e docs/design/REFERENCIA_VISUAL.md.
Depois me diga em 10 bullets qual é a direção criativa da Moscow Noivas.
Não altere código ainda.
```

Se a resposta falar em ERP, CRM genérico, dashboard técnico ou sistema administrativo comum, corrija antes de codar.

## Passo 3 — Mapear o frontend atual

Peça ao Claude:

```txt
Antes de alterar UI, encontre onde estão:
1. layout base
2. sidebar
3. dashboard atual
4. componentes de cards
5. componentes de tabela/lista
6. CSS global/tokens
7. rotas ou templates do dashboard

Não altere código. Apenas me entregue o mapa dos arquivos e uma proposta de ordem de alteração.
```

## Passo 4 — Criar tokens de design

Primeira implementação deve ser tokens, não tela.

Peça:

```txt
Implemente os tokens visuais da Moscow Noivas conforme DESIGN.md.

Crie ou ajuste:
- cores
- radius
- sombras
- tipografia
- espaçamentos
- estados de hover/focus

Não refatore telas ainda.
Depois mostre os arquivos alterados e explique como os tokens serão usados.
```

## Passo 5 — Refatorar layout base

Depois dos tokens:

```txt
Aplique a direção Concierge Atelier no layout base.

Objetivo:
- sidebar premium
- topo com saudação, busca, filtros e usuário
- fundo marfim quente
- superfícies em papel nobre
- bordas champagne
- bordô apenas em ações importantes

Não mexa nas regras de negócio.
Não quebre rotas.
Faça em uma pequena fatia.
```

## Passo 6 — Criar dashboard Concierge Command

Peça:

```txt
Crie o dashboard Concierge Command da Moscow Noivas usando DESIGN.md e a referência visual.

A tela deve conter:
1. cards superiores: noivas de hoje, provas confirmadas, ajustes pendentes, casamentos da semana
2. agenda de hoje
3. próximos atendimentos
4. atenções imediatas
5. linha do tempo da noiva
6. destaque do atelier

Use dados reais se existirem. Se não existirem, use fallback discreto sem inventar regra de negócio.

Prioridade:
70% informação útil, 30% atmosfera premium.

Não criar imagem hero grande no meio.
```

## Passo 7 — Rodar revisão com skill

Peça:

```txt
/atelier-design-review

Revise a implementação do dashboard contra o DESIGN.md e a referência visual.
Liste:
1. o que está alinhado
2. o que ainda parece básico
3. o que parece ERP/template
4. correções prioritárias
5. próximos refinamentos
```

## Passo 8 — Testar visualmente

Peça:

```txt
Rode o projeto, abra o dashboard e faça uma revisão visual.

Verifique:
- responsividade
- contraste
- legibilidade
- alinhamento
- estados de hover
- foco de teclado
- se a primeira impressão parece premium
- se a operação principal é entendida em até 5 segundos

Não faça alterações sem antes listar o diagnóstico.
```

## Passo 9 — Expandir o conceito para outras telas

Ordem ideal:

1. Dashboard
2. Noivas
3. Detalhe da noiva
4. Jornada
5. Vestidos / acervo
6. Detalhe do vestido
7. Agenda
8. Ajustes
9. Reservas
10. Financeiro

## Passo 10 — Regra para toda próxima tela

Toda nova tela deve responder:

```txt
Esta tela parece uma experiência de boutique premium ou parece sistema comum?
```

Se parecer sistema comum, voltar para o DESIGN.md.
