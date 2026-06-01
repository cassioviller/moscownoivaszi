# Padrões de Harness, Orquestração e Governança

Referência para a skill `product-engineer`. Leia ao ajudar a construir infraestrutura de qualidade ou coordenar agentes.

## O que é "harness"
A infra que permite que Builders e agentes entreguem rápido **sem quebrar a produção**. Não é o produto final — é "a coisa que constrói a coisa".

## Peças de harness (do menor ao maior)
Comece sempre pela menor que resolve uma dor real e repetida.

1. **Template de spec** — padroniza como o time pede features à IA. Reduz ambiguidade e retrabalho. (Ver `../assets/spec-template.md`.)
2. **Skill de code review** — captura os critérios que você sempre repete em PR (segurança, performance, nomes, testes) numa skill reutilizável.
3. **Skill de testes** — gera/exige cobertura mínima e casos de borda padrão do projeto.
4. **Skill de conhecimento de sprint** — captura o que você reexplica toda sprint (convenções, gotchas, decisões).
5. **Code review por T-shirt size** — automatize por tamanho: PR pequeno passa direto; médio chama humano; grande exige revisão profunda.
6. **MCP central com governança** — contexto vivo do negócio (dados de produção, métricas, dashboards) acessível com permissões.
7. **Self-healing / agentes por request** — agentes que se desbloqueiam sozinhos, abrem PRs de melhoria e resolvem bugs por request.

> Regra de ouro: **uma peça por vez**. Não tente reproduzir o Cursor inteiro numa sprint.

## Orquestração de agentes (padrão Cursor)

### Quebra de projeto
```
Projeto (meses)
└── Mês / Marco
    └── Parte 0, Parte 1, Parte 2 ...   (cada parte = 1 feature full stack)
        └── Task de agente               (ponta a ponta, não fatia técnica)
```

### Critério da task
> A **menor** quantidade de trabalho que um agente consegue fazer **sem esbarrar em outro agente** — mas entregando algo **ponta a ponta**.

Uma feature completa numa task = migration + schema + service layer + API + UI/repositório **juntos**. Não quebre por camada técnica (isso gera colisão entre agentes).

### Paralelismo típico
- ~5 Cloud Agents por feature, simultâneos.
- +1 agente dedicado a code review.
- +1 humano validando o que pediu.
- Resultado: 6-7 frentes em paralelo vs. 1 task por vez no fluxo tradicional.

### Ritmo do dia (Tech Lead)
- Entre reuniões: dispare 2-3 agentes para avançar tasks.
- Ao voltar: revise os PRs deixados, dispare novos.
- Code review vira **bloco concentrado**, não interrupção constante.
- Meta realista observada: 3-4 PRs/dia só com o tempo "morto" entre reuniões.

## Decisão informada via MCP
1. Formule a pergunta de dados antes de codar ("quantos usuários têm > X itens?").
2. Agente consulta banco de produção / métricas / feedback / audit logs via MCP.
3. Humano decide o trade-off arquitetural com o número na mão (ex.: paginação simples vs. infinita).
4. **Agente = pesquisador. Humano = decisor.**

## Postmortem em um prompt
Em incidente, em vez de abrir Datadog, audit logs, GitHub e Slack separados e correlacionar manualmente:
- **Um prompt** que: consulta Datadog → consulta audit logs → conecta ao histórico recente do GitHub (PRs) → gera diagrama/timeline.
- Saída pronta para postmortem em minutos, identificando o PR causador.

## Anti-padrões a evitar
- Quebrar tasks por camada técnica (gera colisão entre agentes).
- Construir harness gigante "de uma vez".
- Otimizar velocidade de código sem antes ter alavanca (contexto + autonomia).
- Tratar "recebo ticket pronto" como condição permanente em vez de janela de oportunidade.
