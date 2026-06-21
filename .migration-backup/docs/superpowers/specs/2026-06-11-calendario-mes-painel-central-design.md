# Dia do atelier — Início (hoje) e Calendário (qualquer dia)

**Data:** 2026-06-11
**Status:** aprovado para planejamento (refinado em sessão de grill)
**Glossário:** ver `CONTEXT.md` (termos *Dia do atelier*, *Início*, *Calendário*,
*Atenção imediata*, *Financeiro sensível*).

## Objetivo

Dar ao gestor uma visão única do que acontece **num dia** — atendimentos, provas,
casamentos e, para quem pode, as contas a receber/pagar do dia — e servi-la em dois
contextos:

- **Início** (`/loja/[lojaId]`): o *Dia do atelier* de **hoje**, somado ao que o
  Início já mostra.
- **Calendário** (`/loja/[lojaId]/calendario?aba=mes`): a grade do mês onde cada dia
  traz uma mini-agenda e, ao clicar, abre o *Dia do atelier* daquele dia.

Não-objetivo: não criamos rota nova, não duplicamos a fila de ajustes (ficam em
`/ajustes`), não mexemos em regra de negócio, schema ou migração.

## Conceito

Um conceito — **o dia** — servido em dois lugares. O Início responde "o que acontece
hoje, e como anda a loja?"; o Calendário responde "o que tem no dia X?". Duplicar
informação entre os dois é **aceitável e intencional**: o valor do Calendário é abrir
**qualquer** dia (o de hoje já vive no Início). Direção Concierge: agenda é o coração,
70% informação / 30% atmosfera, bordô como joia, nada de cara de ERP.

## Decisões (tomadas com o dono)

1. **Início soma, não substitui.** Mantém saudação, indicadores, atenções, jornada,
   casamentos e destaque; **ganha** o *Dia do atelier* de hoje como novo centro
   operacional.
2. **Dia do atelier é peça reutilizável** — mesmo componente renderiza hoje (Início)
   e qualquer dia (Calendário).
3. **Calendário abre sem dia expandido.** Grade limpa; hoje apenas **marcado**;
   clicar abre o painel do dia via `?dia=YYYY-MM-DD` (server-side, padrão do código).
4. **Contas vencidas → Atenção imediata** no Início (só `financeiro:ver`); no *Dia do
   atelier* só entra o que **vence naquele dia**; no Calendário, o dia passado do
   vencimento ganha o anel de atenção.
5. **Financeiro respeita `financeiro:ver`** em toda parte; sem permissão, nada de
   valores nem contas (nem em props).
6. **Ajustes ficam fora** (só em `/ajustes`).

## Célula do mês (mini-agenda)

Célula é estreita (7 colunas). Conteúdo, em ordem:

1. **Casamento** primeiro — acento bordô, com o nome da noiva (ex: `♥ Camila`). Se
   houver mais de um no dia, `♥ 2 casamentos`.
2. **Itens com hora** (atendimentos + provas), por horário, mostrando **tipo + hora,
   sem nome** (ex: `16h prova`, `14h atend.`) — o nome mora no painel.
3. Até ~3 linhas; o excedente vira **"+N"**.
4. **Marcador financeiro discreto** (`R$` pequeno, **sem valor**) quando há conta
   vencendo no dia — só com `financeiro:ver`.

Fallback responsivo (mobile / colunas apertadas): contagem por categoria
(`2 provas`, `1 casamento`, marcador `R$`).

**Atenção** (anel/sublinhado bordô fino no número do dia): o dia tem algo
vencido/pendente — conta `PREVISTA` com `vencimento` no passado (só conta para quem
vê financeiro), ou prova/atendimento de dia passado ainda em `AGENDADO`/`EM_ATENDIMENTO`.

## Painel "Dia do atelier"

Renderizado no Início (hoje) e no Calendário (dia clicado). Só as seções com
conteúdo, em ordem operacional; cada item linka para seu detalhe:

1. **Atendimentos** — horário · noiva · cabine · vendedora · situação
2. **Provas** — horário · noiva · vestido (link p/ a reserva)
3. **Casamentos** — noiva · vestido
4. **A receber hoje** — parcela: noiva/contrato · valor · status — só `financeiro:ver`
5. **A pagar hoje** — conta: descrição · valor · status — só `financeiro:ver`

Vazio elegante quando o dia não tem nada. "A receber/a pagar" = o que **vence
naquele dia** (status binário `PREVISTA`/`PAGA`; "vencida" = `PREVISTA` com
`vencimento < hoje`, tratada como atenção, não aqui).

## Camada de dados (`src/lib/calendario/dados.ts`, escopo de loja)

- `marcadoresNoIntervalo(lojaId, inicio, fim)` — evoluir para alimentar a mini-agenda
  textual da célula (casamentos + provas/atendimentos com hora + flag de financeiro
  vencendo no dia). Detalhe de modelagem (enriquecer `Marcador` vs função irmã
  `itensDoMes`) fica para o plano.
- **Nova** `detalheDoDia(lojaId, ymd)` — leitura paralela (`Promise.all`) com o que o
  dia tem: atendimentos, provas (com vestido/reserva), casamentos, parcelas a receber
  e contas a pagar **vencendo no dia**. Janela `[meiaNoiteUTC(ymd), +1 dia)`; reusar
  `vencimentoNaJanela`. As partes financeiras só são **buscadas/renderizadas** sob
  `financeiro:ver` (o chamador decide; não vazar).
- **Vencidas para o Início** — contagem/soma de `PREVISTA` com `vencimento < hoje`
  (a receber e a pagar), para virar item de *Atenção imediata*. Pode morar no
  agregador do painel do Início (`src/lib/loja/painel.ts`) ou em `dados.ts`.

## Permissão

Página do calendário e Início acrescentam a leitura de
`podeNoModulo(usuario, loja, "financeiro", "ver")`. Sem ela: grade sem marcador `R$`,
painel sem seções financeiras, Início sem atenções de contas vencidas, e os dados
financeiros nem são buscados.

## Fatias (TDD, commits pequenos na `main`, gates verdes)

1. **Dados** — `detalheDoDia` + agregados de vencidas + evolução de
   `marcadoresNoIntervalo`, com testes (escopo de loja, janela do dia, vence-hoje vs
   vencida vs paga).
2. **Componente Dia do atelier** — server component que recebe os dados do dia e
   renderiza as seções (gating financeiro via props já filtradas).
3. **Início** — encaixa o Dia do atelier de hoje + atenções de contas vencidas
   (gated), mantendo os painéis atuais.
4. **Calendário — célula** — mini-agenda (casamento + itens hora/tipo + "+N" +
   marcador `R$`), fallback responsivo, anel de atenção; células viram links `?dia=`.
5. **Calendário — painel** — `?dia=` abre o Dia do atelier do dia clicado (reusa o
   componente da fatia 2); grade abre sem dia expandido.
6. **Polimento** — mobile (overflow 375px), contraste/acessibilidade, foco de teclado
   nos dias clicáveis, vazios elegantes.

## Verificação

- `tsc --noEmit` limpo e `vitest run` verde antes de cada commit.
- Verificação visual com Playwright (padrão `verify_c6.mjs`): Início e Calendário,
  desktop + 375px; clicar um dia no Calendário; e um perfil **sem** `financeiro:ver`
  (sem valores em nenhum dos dois).

## Fora de escopo

- Ajustes no calendário (ficam em `/ajustes`).
- Demais abas do calendário (Vestidos, Atendimentos, Provas-ajustes).
- Ação/edição financeira dentro do dia (só leitura + link para a tela financeira).
- Schema/migração.
- Atualizar `docs/MAPA_DE_TELAS.md` (está stale: cita `/agenda` e ignora as abas) —
  vale corrigir, mas em tarefa à parte.
