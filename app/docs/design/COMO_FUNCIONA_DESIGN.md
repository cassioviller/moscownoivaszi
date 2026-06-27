# Como o design da Moscow Noivas está organizado

> Documento-mapa. Explica **como o projeto está formatado**, **como funcionam as skills de
> UI/UX** (impeccable, design-taste-frontend, ui-ux-pro-max, atelier-design-review) e **como
> o design da Moscow Noivas está planejado**. No fim há um **prompt pronto para o Replit**.

---

## 1. Como o projeto está formatado

### Stack real (verificado no código)

| Camada | Tecnologia |
|---|---|
| Framework | **Next.js 16.2.6** (App Router) — ⚠️ ver nota abaixo |
| UI | **React 19.2** (Server + Client Components) |
| Estilo | **Tailwind CSS v4** (config via `@theme` no CSS, sem `tailwind.config.js`) |
| Banco | **PostgreSQL** via **Prisma 7.8** (client gerado em `src/generated/prisma`) |
| Auth | sessão própria por cookie (`src/lib/auth`), senha com `bcryptjs` |
| Testes | **Vitest** |
| Hospedagem | **Replit** |

> ⚠️ **AGENTS.md avisa:** este Next.js tem *breaking changes* vs. o que o modelo "conhece".
> Antes de escrever código novo, ler o guia em `node_modules/next/dist/docs/`. Não confiar na memória.

### Mapa de pastas

```txt
/
├── CLAUDE.md                  # regras do projeto + direção criativa (puxa AGENTS.md e docs/design/*)
├── AGENTS.md                  # aviso do Next.js modificado
├── PRODUCT.md                 # quem usa, marca, tom, anti-referências (lido pela skill impeccable)
├── DESIGN.md                  # direção visual Concierge Atelier (tokens, paleta, regras)
├── docs/design/
│   ├── DESIGN_CONCIERGE_ATELIER.md   # a direção criativa completa
│   ├── REFERENCIA_VISUAL.md          # leitura da imagem de referência
│   ├── IMPLEMENTACAO_DESIGN.md       # passo a passo de implementação (fatias)
│   ├── PROMPTS_CLAUDE.md             # prompts prontos por etapa
│   ├── COMO_FUNCIONA_DESIGN.md       # ← este arquivo
│   └── references/                   # imagem do dashboard de referência
├── .claude/skills/            # skills disponíveis (impeccable, atelier-design-review, etc.)
└── src/
    ├── app/
    │   ├── (public)/          # login, selecionar-loja
    │   ├── (app)/             # área logada: dashboard + loja/[lojaId]/{noivas,vestidos,...}
    │   ├── admin/             # configuração (lojas, perfis, usuários)
    │   ├── globals.css        # TOKENS DE DESIGN (fonte da verdade de cor/raio/sombra)
    │   └── layout.tsx         # shell raiz
    ├── components/
    │   ├── layout/            # sidebar, topbar, mobile-nav, nav-items
    │   └── dashboard/         # card-metrica, saudacao-dia, painel-vazio, link-discreto
    └── lib/                   # regra de negócio: auth, leads, vestidos, disponibilidade, permissoes
```

### Onde o design "mora" no código

- **Tokens** → `src/app/globals.css` (cores OKLCH, raios `--mn-*`, sombras). É a fonte da verdade.
- **Shell** → `src/components/layout/` (sidebar, topbar, mobile-nav).
- **Dashboard** → `src/app/(app)/page.tsx` + `src/components/dashboard/`.
- **Domínio (não mexer ao redesenhar)** → `src/lib/`. Regra de negócio, auth, motor de disponibilidade.

---

## 2. As três fontes de verdade do design (e a tensão entre elas)

O ponto mais importante de entender. Há **três** documentos que guiam o visual, e eles **não dizem
exatamente a mesma coisa** — a reconciliação é intencional:

| Fonte | O que pede | Tom |
|---|---|---|
| **DESIGN.md** / Concierge Atelier | boutique premium, marfim + champagne + bordô, "cada noiva é uma história", atmosfera 30% | **atmosférico, emocional** |
| **PRODUCT.md** | "discreta, profissional, ágil", peso na tipografia e não na cor, refs Stripe/Linear/Things 3, atenção é recurso escasso | **restrito, operacional** |
| **globals.css** | neutros *warm-tinted*, bordô ≤5% da tela, champagne/rose **só como atmosfera** (nunca CTA/foco/status) | **a síntese das duas** |

**Como reconciliar (a regra de ouro):**

> A Moscow Noivas é **operacionalmente Stripe/Linear** (densidade confortável, hierarquia pela
> tipografia, cor com parcimônia) **vestida com atmosfera de atelier** (marfim quente, champagne
> nas divisórias, bordô raro como joia). Os 70% de informação mandam no layout; os 30% de
> atmosfera entram pelo *hue* quente e pelo espaço em branco — **não** por decoração.

Quando os dois documentos parecerem brigar, **PRODUCT.md ganha na operação** (densidade,
legibilidade, ausência de ruído) e **DESIGN.md ganha na atmosfera** (paleta quente, microcopy
humano, vestido como acervo). O `globals.css` já codifica esse acordo — respeite-o.

### O que isso proíbe na prática (anti-referências combinadas)

ERP/TOTVS · CRM genérico · dashboard financeiro com gráficos · SaaS lavanda+gradiente · rosa-bebê
· flores/rendas/scripts cursivos · glassmorphism/glow/neon · dark "hacker" · hero image gigante no
dashboard · tabela hostil sem respiro · modal que abre modal · texto mecânico de sistema.

---

## 3. Como funcionam as skills de UI/UX

Skills são pacotes de instrução em `.claude/skills/<nome>/SKILL.md`. Invoca-se com `/<nome>` no
chat. Para design, há quatro relevantes — cada uma com um trabalho diferente:

### 3.1 `impeccable` — a principal (motor de implementação)

A mais completa. Projeta e itera frontend de produção com código real. Fluxo:

1. **Carrega contexto** — lê `PRODUCT.md` (obrigatório) + `DESIGN.md` (opcional) via script loader.
2. **Identifica o "register"** — *brand* (o design É o produto: landing, portfólio) vs. *product*
   (o design SERVE o produto: app, dashboard, admin). **Aqui o register é `product`** (está
   cravado em `PRODUCT.md`). Então ela carrega `reference/product.md`.
3. **Aplica leis de design** — cor em **OKLCH**, nunca `#000`/`#fff`, todo neutro com leve *tint*
   para o hue da marca, escolher uma *estratégia de cor* (a nossa é **Restrained**: neutros + 1
   acento ≤10% → bordô ≤5%), tema claro/escuro decidido por cena física e não por reflexo
   (a nossa é **clara** — loja, luz ambiente, marfim).
4. **Subcomandos** (`/impeccable <cmd> <alvo>`) — cada um carrega um arquivo de referência próprio:

   | Comando | Para quê |
   |---|---|
   | `craft` | criar uma tela/feature nova do zero (passa por *shape* antes) |
   | `shape` | definir a forma/decisões **antes** de codar |
   | `audit` / `critique` | diagnosticar uma tela existente |
   | `polish` / `delight` | refinar acabamento, microinterações |
   | `distill` / `clarify` | reduzir ruído, aumentar clareza |
   | `bolder` / `quieter` | subir ou baixar a intensidade visual |
   | `colorize` / `typeset` | trabalhar cor / tipografia |
   | `animate` / `motion` | movimento (lembrar: 150–250ms, ease-out, sem bounce) |
   | `responsive` / `harden` / `optimize` | responsividade, robustez, performance |
   | `document` / `teach` | (re)escrever DESIGN.md / PRODUCT.md |

   **Regra:** ao usar um subcomando, a skill carrega o `.md` correspondente. Pular isso = output genérico.

### 3.2 `atelier-design-review` — o guardião (revisão, específico do projeto)

Skill **feita sob medida** para a Moscow Noivas. Não implementa — **revisa**. Atua como diretor de
arte premium e procura sinais de ERP/template/falta de encantamento. Antes de revisar, lê
`DESIGN.md` + `REFERENCIA_VISUAL.md` + a tela. Devolve: diagnóstico, pontos fortes, problemas
visuais, problemas de UX, sinais de "básico", melhorias prioritárias e a próxima pequena
implementação. **Use depois de cada fatia implementada.**

### 3.3 `design-taste-frontend` — anti-slop (landing/portfólio)

Skill "anti-template". Lê o brief, infere a direção e evita visual genérico. **Porém é explicitamente
para landing pages, portfólios e redesigns — NÃO para dashboards/tabelas/UI de produto.** Ou seja:
útil se um dia houver uma *landing pública* da Moscow; **não** é a skill do dashboard interno.

### 3.4 `ui-ux-pro-max` — biblioteca de consulta

Banco de dados de design: 50+ estilos, 161 paletas, 57 pares de fonte, 161 tipos de produto, 99
diretrizes de UX, 25 tipos de gráfico, em 10 stacks. Use como **consulta** (escolher par de fonte,
checar acessibilidade, validar hierarquia) — não é um motor de implementação como o impeccable.

### Qual usar quando

```txt
Criar/redesenhar tela do dashboard  →  /impeccable craft (ou shape → craft)
Refinar tela existente              →  /impeccable polish | distill | colorize
Revisar contra a direção criativa   →  /atelier-design-review
Consultar fonte/paleta/UX rule      →  /ui-ux-pro-max
Landing/portfólio público (futuro)  →  /design-taste-frontend
```

---

## 4. Como o design da Moscow Noivas está planejado

A direção é **Concierge Atelier**: o sistema deve parecer o centro silencioso de uma boutique de
noivas premium — não um ERP/CRM. Cada noiva é uma **jornada**, cada vestido é **acervo**, "alertas"
viram **atenções**. Regra 70/30 (informação/atmosfera). Detalhe completo em `DESIGN.md`.

### Plano de implementação por fatias (de `IMPLEMENTACAO_DESIGN.md`)

```txt
1. Tokens (globals.css)              ✅ feito — cores OKLCH, raios, sombras, fontes
2. Shell base (sidebar + topbar)     ✅ em andamento — champagne nas divisórias, rose no hover
3. Dashboard Concierge Command       → cards do dia · agenda · atenções · jornada · destaque
4. Demais telas, nesta ordem:
   Noivas → Detalhe da noiva → Jornada → Vestidos/acervo → Detalhe do vestido
   → Agenda → Ajustes → Reservas → Financeiro
```

Regra para **toda** tela nova: *"Isto parece boutique premium ou sistema comum?"* Se parecer comum,
voltar ao `DESIGN.md`.

### Layout-alvo do dashboard ("Concierge Command")

Sidebar institucional · topo de recepção (saudação + busca + filtros) · cards do dia (noivas de
hoje, provas confirmadas, ajustes pendentes, casamentos da semana) · agenda de hoje (o coração) ·
próximos atendimentos · atenções imediatas · linha do tempo da noiva · destaque do atelier (vestido
como peça de acervo). **Sem hero image grande. Sem gráficos financeiros.**

### Microcopy (trocar a linguagem fria)

"lead" → **noiva** · "funil/status" → **etapa da jornada** · "produto/estoque" → **vestido/acervo**
· "alerta" → **atenção** · "tarefa" → **cuidado / próxima ação**.

### Processo recomendado para qualquer alteração de UI

1. Ler `DESIGN.md` + `REFERENCIA_VISUAL.md` + os dois ou três arquivos da tela.
2. Conferir os tokens em `globals.css` (não inventar cor fora deles).
3. `/impeccable shape` → plano curto → `/impeccable craft` em **fatia pequena**.
4. `/atelier-design-review` na fatia.
5. Não quebrar rota, regra de negócio ou banco (`src/lib`, `prisma`).

---

## 5. Prompt pronto para o Replit

Cole no agente do Replit (Claude) **dentro do projeto**. Ele amarra stack + direção + skills + tokens.

```txt
Você é diretor de arte e engenheiro frontend da Moscow Noivas, um sistema interno de gestão
de uma boutique de vestidos de noiva. Stack real: Next.js 16 (App Router) + React 19 +
Tailwind v4 (config via @theme no CSS, sem tailwind.config.js) + Prisma 7/PostgreSQL.
ATENÇÃO: este Next.js tem breaking changes — antes de escrever código, leia o guia em
node_modules/next/dist/docs/ e não confie na memória de versões antigas.

ANTES DE TOCAR EM CÓDIGO, leia nesta ordem:
1. CLAUDE.md e AGENTS.md
2. PRODUCT.md (quem usa, tom, anti-referências)
3. DESIGN.md e docs/design/REFERENCIA_VISUAL.md (direção Concierge Atelier)
4. docs/design/COMO_FUNCIONA_DESIGN.md (este mapa)
5. src/app/globals.css (TOKENS — fonte da verdade de cor/raio/sombra)

DIREÇÃO CRIATIVA (não negociável):
- A Moscow Noivas é um "Concierge Atelier": boutique premium, calma, sofisticada.
- NÃO pode parecer ERP, CRM genérico, dashboard financeiro, SaaS lavanda, rosa-bebê,
  flores/rendas, glassmorphism, dark hacker, nem ter hero image gigante.
- É operacionalmente Stripe/Linear (densidade confortável, hierarquia pela TIPOGRAFIA,
  cor com parcimônia) VESTIDA com atmosfera de atelier (marfim quente, champagne nas
  divisórias, bordô raro como joia). Regra 70% informação / 30% atmosfera.
- Cor em OKLCH, sempre vinda dos tokens do globals.css. Nunca #000/#fff. Bordô (--color-bordo)
  só em CTA/foco/etapa atual/contador crítico, em ≤5% da tela. Champagne e rose-dust SÓ como
  atmosfera (divisória/hover), nunca em CTA, foco ou status.
- Movimento: 150–250ms, ease-out, opacity + translateY pequeno. Sem bounce/glow/neon.
  Respeitar prefers-reduced-motion.
- Microcopy humano pt-BR: noiva (não lead), jornada (não funil), acervo/vestido (não estoque),
  atenção (não alerta), cuidado/próxima ação (não tarefa). Nunca texto mecânico de sistema.

SKILLS A USAR:
- Para criar/refinar tela: skill "impeccable" (subcomandos shape → craft, depois polish/distill).
  Register do projeto = "product".
- Depois de implementar qualquer fatia: skill "atelier-design-review" para revisar contra a
  direção criativa.
- Para consultar par de fonte/paleta/regra de UX: skill "ui-ux-pro-max".

COMO TRABALHAR:
1. Mapeie os arquivos reais da tela-alvo (src/app/... e src/components/...).
2. Apresente um plano CURTO antes de codar.
3. Implemente em FATIAS PEQUENAS.
4. Não quebre rota, regra de negócio nem banco (src/lib, prisma).
5. Ao final de cada fatia: liste arquivos alterados, como testar, e rode atelier-design-review.

TAREFA: <descreva aqui a tela ou ajuste, ex.: "implemente a Fatia 3 — dashboard Concierge
Command: cards do dia, agenda de hoje, atenções imediatas. Use dados reais do Prisma se
existirem; senão, fallback discreto sem inventar regra de negócio. Sem hero image grande.">
```

---

### Como usar este documento

- **Para um agente/Replit**: aponte para este arquivo + `DESIGN.md` no início da conversa.
- **Para você**: o §2 (tensão entre as fontes) e o §3 (qual skill usar quando) são o resumo prático;
  o §5 é o que você cola no Replit.
```
