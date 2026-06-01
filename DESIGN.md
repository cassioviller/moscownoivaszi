<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->
---
name: Moscow Noivas
description: Sistema interno de gestão de loja de vestido de noiva — discreto, profissional, ágil.
---

# Design System: Moscow Noivas

## 1. Overview

**Creative North Star: "The Modern Atelier"**

O sistema é o atelier — não a vitrine. É o quarto dos fundos da loja onde a costureira tem a régua sempre na mão e o caderno aberto: organizado, respirado, sem decoração, com ferramentas que duram décadas. A funcionária senta, faz o trabalho, sai. A interface envelhece bem porque não depende de tendência; carrega o peso na tipografia, deixa a cor para informação, usa o espaço como hierarquia. O acento bordô não é "cor da marca" estampada em todo lugar — é uma joia escassa que aparece quando importa.

O que o sistema explicitamente rejeita: ERPs jurássicos (densidade hostil), sistemas "femininos" clichê (rosa-bebê, scripts, flores), SaaS genérico (lavanda + cards iguais + gradientes pastel), e glassmorphism/dark hacker. Discrição não é falta de criatividade; é a criatividade aplicada ao serviço, não à autoexposição.

**Key Characteristics:**
- Restrained color: tinted neutrals + bordeaux accent ≤5%
- Single humanist sans, hierarchy via scale + weight
- Flat surfaces, tonal layering, no decorative shadows
- Responsive motion (150-250ms, ease-out-expo)
- Light-only theme; document-like density (entre Linear e Notion)

## 2. Colors

A paleta é uma só voz: neutros levemente quentes que servem de papel, e um único acento bordô profundo que aparece raramente. Sem segunda cor, sem temas alternativos.

### Primary
- **Bordô Profundo** (`oklch(38% 0.08 25)` — a hex será resolvido em implementação): único acento. Usado em CTA primário, foco, link ativo, indicador de estado crítico (erro grave, "ação irreversível"). Nunca em áreas grandes; nunca como fundo de seção; nunca como gradiente.

### Neutral (warm-tinted scale)
Todos os neutros têm chroma ≤0.01 em hue ~30-50 (vermelho-laranja muito sutil), nunca puros. Pure `#fff` e `#000` são proibidos.
- **Tinta** (`oklch(15% 0.01 40)`): texto principal, headlines.
- **Grafite** (`oklch(35% 0.008 40)`): texto secundário, labels.
- **Cinza-fumo** (`oklch(55% 0.006 40)`): placeholder, texto auxiliar, ícones.
- **Borda** (`oklch(85% 0.005 40)`): linhas de divisão, bordas de input em repouso.
- **Borda-suave** (`oklch(92% 0.005 40)`): divisões mais sutis, hover em listas.
- **Papel** (`oklch(98% 0.004 40)`): fundo principal (não-branco).
- **Papel-elevado** (`oklch(99.5% 0.003 40)`): cards quando precisarem subir do fundo. Diferença minúscula, sentida sem ser vista.

### Estados (semantic)
Derivados da escala neutra + bordô; nunca cores novas independentes.
- **Erro:** Bordô Profundo (mesmo acento; é a função "atenção crítica").
- **Sucesso:** texto Tinta + ícone discreto; sem verde semáforo.
- **Aviso:** texto Tinta + microcopy; sem amarelo cliché.

### Named Rules

**The Bordeaux ≤5% Rule.** O acento bordô nunca ocupa mais de 5% de qualquer tela. Sua raridade é a razão pela qual ele significa "isto importa". Se você está pintando uma área grande de bordô, está errado.

**The One Voice Rule.** Há um único acento. Sem segunda cor de apoio, sem teal, sem azul, sem verde. Variação vem do uso, não do hue.

**The Warm Neutral Rule.** Todo neutro carrega traço de calor (chroma 0.005-0.01 em hue 30-50). Cinzas puros são proibidos; eles sugerem "tecnologia" quando queremos "ofício".

## 3. Typography

**Display Font:** humanist sans `[fonte específica a escolher durante implementação: Inter Display, Geist, Söhne, Source Sans Pro, ou a stack Geist Sans já carregada]`
**Body Font:** mesma família (sistema mono-família)
**Label Font:** mesma família, possivelmente um peso menor

**Character:** uma única voz tipográfica em peso variável. A escolha de "humanista" (não geométrica) traz calor humano sem cair em fofice; combina com Stripe/Notion/Things 3. Pesos disponíveis: 300 (display fino), 400 (regular), 500 (medium/labels), 600 (semibold/destaque). Sem itálicos decorativos; sem maiúsculas em todo lugar.

### Hierarchy

Escala com razão ~1.25 entre passos. Line-height generoso no body (1.5), apertado nos títulos (1.1-1.2).

- **Display** (300 weight, ~32-44px, line-height 1.1): só em "splash" — login, telas de boas-vindas. Quase nunca usado.
- **Headline** (500 weight, ~24-28px, line-height 1.15): título de seção/página.
- **Title** (500 weight, ~18-20px, line-height 1.2): card titles, agrupadores.
- **Body** (400 weight, ~14-15px, line-height 1.5, max 65-75ch): texto corrente, parágrafos, descrições.
- **Label** (500 weight, ~12-13px, line-height 1.3, letter-spacing 0.01em): rótulos de form, headers de tabela.
- **Micro** (400 weight, ~11-12px, line-height 1.4): metadata, footnotes, "última atualização".

### Named Rules

**The Type-Carries-Hierarchy Rule.** Hierarquia vem de escala + peso + cor neutra. Nunca de fundos coloridos, ícones decorativos, caixas, gradientes. Se você precisa de um card colorido para destacar algo, sua tipografia falhou.

**The No-Decorative-Italic Rule.** Itálico só serve a função semântica (citação, termo técnico estrangeiro). Nunca decoração.

## 4. Elevation

Sistema **flat por padrão, tonal por design**. Superfícies estão no mesmo plano em repouso; profundidade vem de mudança sutil de neutro (Papel → Papel-elevado), não de sombras. Sombras existem mas são raras: aparecem como resposta a estado (hover de card clicável, popover suspenso, modal). Sem sombra decorativa "para parecer bonito".

### Shadow Vocabulary

- **Lift-sutil** (`box-shadow: 0 1px 2px oklch(0% 0 0 / 0.04), 0 2px 8px oklch(0% 0 0 / 0.04)`): hover em card clicável; popover de tooltip.
- **Lift-medio** (`box-shadow: 0 4px 16px oklch(0% 0 0 / 0.08), 0 1px 2px oklch(0% 0 0 / 0.06)`): popover de menu, dropdown suspenso.
- **Lift-modal** (`box-shadow: 0 20px 40px oklch(0% 0 0 / 0.12), 0 4px 16px oklch(0% 0 0 / 0.06)`): modais (raros — exhaust inline alternatives primeiro).

### Named Rules

**The Flat-By-Default Rule.** Toda superfície é flat em repouso. Sombras só aparecem em resposta a estado (hover, focus, elevation muda por interação). Sombra como "decoração de profundidade" é proibida.

**The Tonal-First Rule.** Antes de adicionar sombra, tente diferenciar com um passo de neutro (Papel → Papel-elevado). Sombra é último recurso; tonal é primeiro.

## 5. Components

`[seção vazia: nenhum componente foi construído ainda. Re-rodar /impeccable document após a primeira fatia de UI ter componentes pra extrair.]`

Princípios que valerão pra todo componente, quando vierem:
- **Raio:** 4-6px (sm), 8px (md). Nunca pill-shaped (`9999px`) exceto em chip/tag.
- **Padding interno:** 12px/16px/24px steps. Mesma régua em tudo.
- **Borda:** 1px sólido em Borda em repouso; transição pra Tinta em focus.
- **Focus ring:** `outline: 2px solid Bordô + outline-offset: 2px`. Nunca `outline: none` sem substituto visível.
- **Disabled:** opacity 0.4 + `cursor: not-allowed`. Sem cinza-claro adicional.

## 6. Do's and Don'ts

### Do:
- **Do** usar tinted neutrals com chroma 0.005-0.01 em hue 30-50 (warm). Cinzas puros são proibidos.
- **Do** carregar hierarquia em escala + peso + cor neutra. Tipografia faz o trabalho.
- **Do** usar o acento Bordô em ≤5% de qualquer tela. Sua raridade é o ponto.
- **Do** manter componentes flat em repouso. Sombra só como resposta a estado.
- **Do** respeitar `prefers-reduced-motion`: motion não-essencial desliga.
- **Do** usar focus ring visível e estilizado (2px Bordô + offset).
- **Do** seguir line-height generoso (1.5) no body, max 65-75ch.
- **Do** usar transições 150-250ms com ease-out-expo (ou ease-out-quart).

### Don't:
- **Don't** usar `#fff`, `#000`, ou qualquer cinza puro (chroma 0). Tudo é tinted toward warm.
- **Don't** introduzir uma segunda cor de acento. Bordô é a única voz cromática.
- **Don't** parecer ERP jurássico (SAP/TOTVS): tabelas densas hostis, dropdowns aninhados, cinza-cadáver, formulários de 40 campos numa tela só.
- **Don't** parecer "sistema feminino" clichê: rosa-bebê, scripts cursivos, flores, rendas, ilustrações fofas, pastéis decorativos.
- **Don't** parecer SaaS genérico: lavanda + cards iguais + gradientes pastel + ilustrações isométricas + feature cards repetidos.
- **Don't** usar glassmorphism, glow, neon, terminal-mode, ou efeitos "futuristas". Dashboard de ficção científica é proibido.
- **Don't** usar `border-left`/`border-right` >1px como stripe colorido em cards/alerts.
- **Don't** usar `background-clip: text` com gradient (gradient text).
- **Don't** usar bounce, elastic, ou animar propriedades de layout (`width`, `height`, `top`, `left`). Use `transform` e `opacity`.
- **Don't** usar placeholder como label. Toda input tem label semântico visível.
- **Don't** usar dark mode ou criar tema alternativo. Light-only.
- **Don't** usar modal como primeira reação. Exhaust inline/progressive alternatives primeiro.


# Complemento — Moscow Noivas Concierge Atelier

A direção criativa premium atualizada está documentada em:

@docs/design/DESIGN_CONCIERGE_ATELIER.md
@docs/design/REFERENCIA_VISUAL.md

Use esses arquivos como referência principal para refinar o dashboard e as telas do sistema.

Resumo do conceito:
- Concierge Atelier premium;
- marfim, champagne, rosé queimado e bordô profundo;
- noiva como jornada;
- vestido como acervo;
- agenda e atenções como centro operacional;
- luxo silencioso, sem cara de ERP.

## Reconciliação de direção (autoritativa)

As duas direções deste documento — "The Modern Atelier" (§1–6) e "Concierge Atelier" — **não competem; têm camadas distintas**. O Modern Atelier governa a *estrutura* (neutros, tipografia, densidade, estado); o Concierge governa a *atmosfera* (os 30% de §9 do `DESIGN_CONCIERGE_ATELIER.md`). Em uma frase: **champagne e rosé queimado são acentos de atmosfera, nunca de função.** Isso preserva as três regras nomeadas do original — a *One Voice Rule* continua intacta porque o **bordô segue como o único acento funcional** (CTA, foco, link ativo, estado crítico): champagne/rosé jamais sinalizam ação, estado, foco ou "isto importa"; a *Warm Neutral Rule* continua intacta porque champagne/rosé **não entram na escala de neutros** (o papel base permanece chroma ≤0.01) — eles vivem só em superfícies delicadas e contadas (fio de borda, divisória, moldura de card de destaque, badge pequeno), nunca como fundo de seção, gradiente ou área grande, e somados respeitam o teto do bordô-≤5% em espírito. **Critério de desempate:** quando atmosfera e clareza operacional colidirem, vence a contenção do `PRODUCT.md` — a ferramenta sai do caminho primeiro, encanta depois.
