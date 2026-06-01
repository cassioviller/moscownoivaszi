# Prompts para Claude — Moscow Noivas

## 1. Diagnóstico inicial

```txt
Leia CLAUDE.md, DESIGN.md e docs/design/REFERENCIA_VISUAL.md.

Quero que você atue como diretor de arte, UI/UX designer premium e engenheiro frontend.

Não altere código ainda.

Entregue:
1. resumo da direção Concierge Atelier
2. diagnóstico do frontend atual
3. riscos de o sistema parecer básico
4. telas prioritárias
5. ordem de implementação
6. arquivos prováveis que serão alterados
```

## 2. Planejamento do dashboard

```txt
Planeje o dashboard Concierge Command da Moscow Noivas.

Use DESIGN.md e a referência visual.

O dashboard deve priorizar:
- agenda de hoje
- próximos atendimentos
- atenções imediatas
- linha do tempo da noiva
- destaque do atelier
- indicadores do dia

Não quero hero image grande.
Não quero dashboard financeiro.
Não quero ERP.
Não quero SaaS genérico.

Antes de codar, entregue:
1. wireframe textual
2. componentes necessários
3. dados necessários
4. fallback se não houver dados
5. plano de implementação em pequenas etapas
```

## 3. Implementação controlada

```txt
Implemente somente a primeira fatia do dashboard:
- estrutura base
- sidebar
- topo
- cards superiores

Não implemente ainda agenda, jornada ou destaque do atelier.

Respeite DESIGN.md.
Não alterar regra de negócio.
Não quebrar rotas.
Após implementar, liste arquivos alterados e como testar.
```

## 4. Segunda fatia

```txt
Agora implemente:
- agenda de hoje
- próximos atendimentos
- atenções imediatas

Use cards claros, linguagem humana e aparência premium.

Evite tabela hostil.
Evite excesso de cor.
Evite textos mecânicos.

Após implementar, explique como os dados estão sendo carregados.
```

## 5. Terceira fatia

```txt
Agora implemente:
- linha do tempo da noiva
- destaque do atelier

A linha do tempo deve transformar lead em jornada.
O vestido deve parecer acervo, não estoque.

Use fallback elegante se não houver dados.
Não criar imagem decorativa enorme.
```

## 6. Red-team visual

```txt
Faça um red-team visual do dashboard.

Seja crítico como um cliente premium.

Procure:
- cara de template
- cara de ERP
- excesso de simplicidade
- falta de emoção
- falta de clareza
- texto mecânico
- uso ruim de bordô
- cards sem personalidade
- baixa legibilidade
- falta de responsividade

Entregue:
1. problemas encontrados
2. impacto de cada problema
3. prioridade
4. correção recomendada
```

## 7. Prompt para apresentação ao cliente

```txt
Crie uma explicação comercial curta do dashboard Moscow Noivas para apresentar ao cliente.

Tom:
- sofisticado
- confiante
- encantador
- sem linguagem técnica demais

Explique que o sistema foi pensado como um Concierge Atelier, onde agenda, noivas, provas, ajustes e vestidos são organizados em uma experiência premium.
```
