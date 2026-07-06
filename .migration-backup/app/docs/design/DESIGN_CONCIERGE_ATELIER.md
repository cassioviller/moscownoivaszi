---
name: Moscow Noivas
description: Direção criativa e design system do sistema Moscow Noivas.
north_star: Concierge Atelier
status: Direção oficial de design
---

# DESIGN.md — Moscow Noivas

## 1. Norte criativo

### Concierge Atelier

A Moscow Noivas não deve parecer apenas um sistema. Ela deve parecer o **centro silencioso de uma boutique de noivas premium**, onde a equipe acompanha cada noiva, cada vestido, cada prova e cada detalhe com calma, precisão e delicadeza.

A interface não organiza apenas cadastros. Ela organiza momentos importantes da vida real.

A frase que guia o produto:

> Cada noiva é uma história, não um registro.

## 2. O que a pessoa deve sentir

Ao entrar no dashboard, o cliente deve sentir:

- **Exclusividade:** parece uma ferramenta interna de uma marca refinada.
- **Confiança:** tudo está no lugar certo, sem ruído visual.
- **Delicadeza:** a interface é suave, respeitosa e acolhedora.
- **Desejo:** o sistema é bonito o suficiente para a pessoa querer mostrar.
- **Calma premium:** luxo silencioso, não luxo chamativo.
- **Controle:** a equipe entende rapidamente o que precisa de atenção hoje.

## 3. Personalidade visual

A Moscow Noivas é:

- boutique, não varejo;
- concierge, não central de tarefas;
- atelier, não estoque;
- curadoria, não cadastro frio;
- jornada, não funil comercial;
- elegância silenciosa, não decoração exagerada.

## 4. Metáfora principal

O dashboard é a **mesa principal do atelier**.

Nessa mesa aparecem:
- as noivas que serão recebidas hoje;
- os atendimentos importantes;
- os vestidos em movimento;
- as provas confirmadas;
- os ajustes pendentes;
- os casamentos próximos;
- as atenções que precisam de cuidado.

O sistema deve parecer uma operação viva, humana e refinada.

## 5. Paleta emocional

### Cores-base

| Nome | Uso | Sensação |
|---|---|---|
| Marfim quente | fundo principal | pureza, calma, luz suave |
| Papel nobre | cards e áreas elevadas | organização, respiro |
| Champagne | bordas, divisórias, ícones suaves | luxo discreto |
| Rosé queimado | badges leves, hover, detalhes emocionais | delicadeza madura |
| Bordô profundo | CTA, menu ativo, ações principais, foco | presença, desejo, sofisticação |
| Grafite quente | textos principais | clareza, autoridade |

### Sugestão de tokens CSS

```css
:root {
  --mn-bg: #fbf7f1;
  --mn-surface: #fffdf9;
  --mn-surface-soft: #f7efe7;
  --mn-border: #e7d9cc;
  --mn-border-soft: #f0e7de;

  --mn-text: #2d2523;
  --mn-text-muted: #7f7068;
  --mn-text-soft: #a18f84;

  --mn-bordeaux: #7a1836;
  --mn-bordeaux-deep: #551024;
  --mn-rose-dust: #d8b6ad;
  --mn-champagne: #c8a976;

  --mn-success-soft: #edf3e8;
  --mn-warning-soft: #f6efe3;
  --mn-danger-soft: #f6e6e9;

  --mn-radius-sm: 8px;
  --mn-radius-md: 14px;
  --mn-radius-lg: 22px;

  --mn-shadow-soft: 0 12px 40px rgba(70, 40, 28, 0.06);
  --mn-shadow-hover: 0 16px 48px rgba(70, 40, 28, 0.10);
}
```

## 6. Regra da cor

O bordô não deve ser espalhado sem intenção.

Use bordô para:
- item ativo no menu;
- botão principal;
- foco de input;
- contadores críticos;
- etapa atual da jornada;
- links importantes.

Não use bordô para:
- fundos grandes sem função;
- dezenas de badges;
- gráficos coloridos;
- decoração aleatória;
- cards inteiros sem necessidade.

A cor deve funcionar como uma joia: rara, precisa e memorável.

## 7. Tipografia

A tipografia deve combinar clareza operacional com elegância editorial.

### Direção

- Títulos: elegantes, com peso médio ou leve.
- Números: grandes, limpos, sofisticados.
- Labels: pequenos, objetivos, em grafite suave.
- Texto de apoio: humano, gentil e curto.

### Fontes recomendadas

- Inter, Geist ou Source Sans para estrutura principal.
- Uma serifada editorial opcional apenas em títulos especiais, como Playfair Display, Cormorant Garamond ou Libre Baskerville.
- Não usar fonte cursiva decorativa como padrão.

### Regra

A tipografia deve carregar hierarquia antes da cor.

## 8. Layout ideal do dashboard

O dashboard deve seguir a lógica de **Concierge Command**.

### Estrutura

1. **Sidebar institucional**
   - logo
   - navegação principal
   - botão de notas rápidas
   - usuário no rodapé

2. **Topo operacional**
   - saudação
   - busca central
   - filtro de unidade
   - filtro de data
   - notificações
   - usuário

3. **Indicadores do dia**
   - noivas de hoje
   - provas confirmadas
   - ajustes pendentes
   - casamentos da semana
   - botão para agenda completa

4. **Centro de operação**
   - agenda de hoje
   - próximos atendimentos
   - atenções imediatas

5. **Jornada**
   - linha do tempo da noiva selecionada
   - etapa atual
   - próxima ação
   - responsável
   - status geral
   - data do casamento

6. **Destaque do atelier**
   - vestido ou coleção em destaque
   - disponibilidade
   - botão de detalhes

## 9. Prioridade visual

Use a regra 70/30:

- 70% informação útil;
- 30% atmosfera premium.

O design deve encantar, mas a operação deve continuar rápida.

A imagem ou fotografia nunca deve dominar a tela operacional. Ela pode aparecer como apoio em cards de destaque, referência de coleção, vestido ou ambiente, mas o dashboard deve priorizar agenda, atenção e jornada.

## 10. Componentes essenciais

### Sidebar

- fundo marfim ou bordô profundo, dependendo da tela;
- item ativo com bordô ou fundo bordô;
- ícones finos;
- nomes claros;
- sem poluição.

### Cards de métrica

Devem parecer resumos de concierge, não KPIs frios.

Exemplo:
- número grande;
- ícone suave;
- descrição curta;
- microindicador delicado.

### Agenda de hoje

Deve ser o coração do dashboard.

Cada linha deve mostrar:
- horário;
- avatar ou inicial;
- nome da noiva;
- tipo de atendimento;
- responsável;
- status.

### Atenções imediatas

Não chamar de “alertas” quando não for crítico. Chamar de:
- Atenções imediatas;
- Cuidados do atelier;
- Pendências delicadas.

### Linha do tempo da noiva

Deve mostrar a jornada como acompanhamento humano.

Etapas sugeridas:
1. Consulta
2. Escolha do vestido
3. Prova 1
4. Ajustes
5. Prova final
6. Entrega
7. Casamento
8. Retorno / higienização

### Vestido em destaque

O vestido deve parecer peça de acervo, não produto.

Mostrar:
- nome do modelo;
- coleção;
- ano;
- descrição curta;
- status;
- imagem;
- botão de detalhes.

## 11. Linguagem e microcopy

Evitar linguagem fria de sistema.

Trocar:

- “Cadastrar lead” por “Adicionar noiva”
- “Status do funil” por “Etapa da jornada”
- “Produtos” por “Vestidos” ou “Acervo”
- “Alertas” por “Atenções”
- “Cliente” por “Noiva”, quando fizer sentido
- “Tarefa” por “Cuidado”, “próxima ação” ou “atenção”
- “Estoque” por “Acervo”, quando o contexto for vestido

Exemplos de textos:

- “Aqui, cada detalhe importa.”
- “Acompanhe os cuidados de hoje.”
- “Próximo passo da noiva.”
- “Vestidos que pedem atenção.”
- “Agenda delicadamente organizada.”
- “Cada noiva merece ser lembrada pelo nome, pela história e pelo momento.”

## 12. Motion

A animação deve parecer calma e refinada.

Usar:
- opacity;
- translateY pequeno;
- transições de 150ms a 250ms;
- ease-out;
- hover sutil.

Evitar:
- bounce;
- elastic;
- animação exagerada;
- glow;
- neon;
- movimento que atrapalhe a operação.

## 13. O que não fazer

Não fazer:

- visual de ERP;
- visual de CRM genérico;
- dashboard com muitos gráficos;
- cards coloridos demais;
- rosa bebê;
- flores decorativas;
- renda falsa no fundo;
- gradiente chamativo;
- tabela hostil;
- modal para tudo;
- textos mecânicos;
- ícones infantis;
- sombras pesadas;
- excesso de foto grande no dashboard.

## 14. Checklist antes de entregar qualquer tela

Antes de considerar uma tela pronta, responder:

1. Parece boutique premium ou sistema comum?
2. A tela tem calma visual?
3. A informação principal é encontrada em até 5 segundos?
4. O bordô foi usado com intenção?
5. Os textos parecem humanos?
6. O vestido parece acervo e não estoque?
7. A noiva parece jornada e não lead?
8. O layout parece autoral?
9. Alguma parte lembra ERP ou template genérico?
10. A equipe conseguiria trabalhar rápido nessa tela?

## 15. Definição de sucesso

O design estará no caminho certo quando o cliente olhar e pensar:

> Isso não é só um sistema. Isso tem marca, tem visão e tem alma.
