# Calendário com abas — Design

**Data:** 2026-06-05
**Status:** Aprovado para planejamento
**Contexto criativo:** Concierge Atelier (ver `docs/design/DESIGN_CONCIERGE_ATELIER.md`)

## Problema

A página Agenda atual é uma lista agrupada por mês. Os dados da Moscow misturam dois tipos de evento que pedem formas visuais diferentes:

- **Pontos no tempo:** atendimento (60min), prova (dia/hora), casamento (dia).
- **Faixas de vários dias:** um vestido fica "fora" por uma janela contínua — preparação → uso/casamento → higienização → manutenção.

Nenhuma forma única de calendário trata os dois bem. Uma grade mensal achata faixas em pontinhos; uma timeline Gantt some com eventos-ponto.

## Solução

Uma página **Calendário** (evolução da Agenda) com **4 abas**, cada uma na forma certa para um tipo de informação. A aba ativa vive na URL (`?aba=`), permitindo link direto e preservação ao recarregar.

### Decisões fechadas

- **Rota:** renomear `…/loja/[lojaId]/agenda` → `…/loja/[lojaId]/calendario`, com **redirect** do caminho antigo para não quebrar links. O menu já rotula o link como "Calendário" (`src/components/layout/nav-items.ts:53`); atualizar apenas o `href`.
- **Aba padrão:** **Mês**.
- **Escopo:** as 4 abas entram nesta entrega (não faseado por aba no produto final, mas implementado em fatias — ver Ordem de implementação).
- **Cores dos marcadores (aba Mês):** bordô = casamento, champagne = prova, grafite = atendimento.

## As 4 abas

### Aba 1 — Mês (grade) · padrão

Grade mensal (7 colunas) com navegação ‹ mês ›. Cada dia mostra marcadores delicados (pontos pequenos, não blocos berrantes) por tipo de evento:

- bordô = casamento (`BloqueioVestido.casamentoData`)
- champagne = prova (`Prova.dataReal`)
- grafite = atendimento (`Atendimento.inicio`)

Clicar num dia pode revelar a lista daquele dia (detalhe futuro; no MVP, marcadores + tooltip/contagem). O hoje é destacado discretamente.

**Dados:** consulta agregada do mês visível — provas, atendimentos e casamentos com data dentro do intervalo. (Função de leitura nova que agrega as três fontes por dia.)

### Aba 2 — Vestidos fora (Gantt)

Timeline de faixas: **uma linha por vestido**, barras horizontais representando cada janela de indisponibilidade (preparação / uso / higienização / manutenção) ao longo de um horizonte de dias. Barras com `abertoFim` indicam vestido fora por tempo indeterminado (tratamento visual de "continua →").

- Faixas tonais: rosé/champagne para preparação/higienização; **bordô reservado ao uso/casamento**.
- Eixo de tempo no topo; navegação por janela (ex.: 60 dias, alinhável ao mês).

**Dados:** `agendaDoAtelier(lojaId, horizonteDias)` → `EventoAgenda[]` (já existe em `src/lib/disponibilidade/agenda.ts`). O tipo já traz `tipo`, `inicio`, `fim`, `abertoFim`, `vestidoId`, `vestidoNome`, `vestidoCodigo`, `noivaNome`. Agrupar por `vestidoId` para montar as linhas.

### Aba 3 — Atendimentos (semana)

Grade semanal: colunas de dia × linhas de hora, blocos de 60min para cada consulta. Navegação ‹ semana ›. Cada bloco mostra noiva + situação (cor por situação dentro da paleta, sem estourar bordô).

**Dados:** model `Atendimento` (`prisma/schema.prisma:426`). Reaproveitar `src/lib/atendimentos/atendimentos.ts` (`gradeDoDia`, `listarAtendimentos`). Provável necessidade de uma leitura por semana (ex.: `gradeDaSemana` que chama a lógica do dia para os 7 dias, ou um `listarAtendimentos` filtrado por intervalo).

### Aba 4 — Provas & ajustes (fila)

Lista operacional ordenada por urgência. **Reaproveita** os componentes/dados já existentes:

- `listarProvasDaLoja()` — `src/lib/atelier/provas.ts`
- `listarAjustesPendentes()` — `src/lib/atelier/ajustes.ts`

As páginas próprias `/provas` e `/ajustes` continuam existindo no menu; esta aba é uma vista consolidada dentro do Calendário (mesmos componentes de apresentação, sem duplicar lógica de dados).

## Arquitetura

- **Server Components** carregam os dados de cada aba no servidor.
- Troca de aba = navegação por query param (`?aba=mes|vestidos|atendimentos|provas-ajustes`), não SPA pesada. Cada aba pode ter seus próprios params de navegação no tempo (ex.: `?aba=mes&ref=2026-06`).
- Componentes de apresentação isolados por aba, em arquivos focados, para manter cada um testável e legível:
  - casca da página + tabs (lê `aba` da query, decide o que renderizar)
  - `GradeMes`, `GanttVestidos`, `SemanaAtendimentos`, `FilaProvasAjustes`
- Sem biblioteca de calendário externa: Tailwind + JS nativo (consistente com o stack atual). Tokens `--mn-*` / cores OKLCH do design system.

## Atmosfera (Concierge Atelier)

- Abas em texto; a ativa marcada por **traço bordô fino**, não pílula colorida.
- Marcadores e barras delicados; bordô usado com intenção (casamento/uso), nunca em área grande.
- Transições calmas: opacity + translateY pequeno, 150–250ms, ease-out.
- Cada aba é uma vista focada — nada amontoado; a operação principal é entendida em até 5 segundos.

## Ordem de implementação (fatias pequenas, commit na `main`)

Cada fatia entra com `tsc --noEmit` limpo e `vitest run` verde.

1. **Casca + abas + rota** — renomear rota para `/calendario`, redirect do `/agenda`, atualizar `href` no nav, roteamento por `?aba=`, casca com as 4 abas (3 vazias).
2. **Aba Mês** (padrão) — grade + agregação de marcadores + navegação de mês.
3. **Aba Vestidos fora** (Gantt) — consome `agendaDoAtelier()`, agrupa por vestido, desenha barras + `abertoFim`.
4. **Aba Atendimentos** (semana) — leitura por semana + grade dia×hora.
5. **Aba Provas & ajustes** — embute os componentes/dados existentes.

## Fora de escopo (YAGNI por ora)

- Drag-and-drop / reagendar pela tela.
- Edição inline de eventos no calendário.
- Visões de dia isolado ou ano.
- Biblioteca de calendário externa.

## Riscos / pontos de atenção

- **Fuso/datas:** provas usam `dataReal` (UTC meia-noite), atendimentos usam `inicio` (wall-clock UTC), janelas do Gantt usam UTC meia-noite. Alinhar a lógica de "em qual dia cai" para não deslocar marcadores. Reaproveitar as helpers de data já usadas na agenda atual.
- **Gates de permissão:** a aba Provas & ajustes deve respeitar os mesmos guards das páginas `/provas` e `/ajustes` (`leads:ver` OU `ajustes:ver`). Se o usuário não tem o gate, esconder a aba.
- **Densidade do Gantt:** muitos vestidos podem deixar a timeline longa; prever ordenação (por proximidade do uso) e, se preciso, paginação/scroll.
