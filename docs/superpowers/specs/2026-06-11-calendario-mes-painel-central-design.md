# Calendário — aba Mês como painel central do atelier

**Data:** 2026-06-11
**Status:** aprovado para planejamento

## Objetivo

Transformar a aba **Mês** do calendário existente (`/loja/[lojaId]/calendario?aba=mes`)
no painel central de operação do gestor. Em vez de criar um calendário novo,
aprofundamos o que já existe: cada dia mostra, em miniatura, o que acontece nele
(provas, atendimentos, casamentos, contas a pagar/receber vencendo); ao clicar
num dia, abre o **"Dia do atelier"** com tudo daquele dia em detalhe.

Não-objetivo: não criamos rota nova, não duplicamos a fila de ajustes, não mexemos
em regra de negócio, rotas ou banco.

## Conceito

A aba Mês é "a mesa principal do atelier" (DESIGN §4). O gestor lê o mês de relance
e mergulha num dia com um toque. A direção Concierge manda: agenda é o coração,
70% informação útil / 30% atmosfera, bordô como joia (raro e intencional), nada de
cara de ERP.

## Decisões tomadas (com o dono)

1. **Célula miniatura = mini-agenda (texto enxuto), opção A.** Pontos não bastavam
   (dizem que algo existe, não o quê/quanto). Cada dia mostra seus itens abreviados,
   com acento de cor por tipo e overflow "+N". Em telas estreitas (mobile, 7 colunas),
   cai para **contagem por categoria** (fallback responsivo).
2. **Clicar no dia → parâmetro de URL `?dia=YYYY-MM-DD`**, painel renderizado no
   servidor abaixo da grade, dia selecionado destacado. Aderente ao padrão do código
   (abas via `?aba`, mês via `?ref`, tudo Server Component + `force-dynamic`),
   deep-linkável e barato (carrega só o dia clicado, não os 42). Dia aberto por
   padrão = **hoje** (quando o mês de referência é o mês corrente).
3. **Contas a pagar/receber respeitam `financeiro:ver`.** Quem não tem essa permissão
   vê o calendário operacional (provas/atendimentos/casamentos) sem valores nem contas.
4. **Ajustes ficam fora do calendário.** Continuam só em `/ajustes`. Sem resumo, sem
   link. (Ajuste não tem data própria — é transversal.)

## Sinais na grade

Tipos de sinal por dia (origem do dado, escopo de loja via `tenantPrisma`):

| Sinal | Origem | Acento |
|---|---|---|
| Casamento | `BloqueioVestido.casamentoData` | bordô |
| Prova | `Atendimento{tipo:PROVA}.inicio` | champagne |
| Atendimento | `Atendimento{tipo:ATENDIMENTO}.inicio` | grafite |
| Financeiro | `Parcela.vencimento` + `ContaPagar.vencimento` | tom discreto (ex: oliva), só com `financeiro:ver` |

**Atenção (anel/sublinhado bordô fino no número do dia):** o dia tem algo
*vencido/pendente* — conta `PREVISTA` com `vencimento` no passado, ou
prova/atendimento de dia passado ainda não concluído (`AGENDADO`/`EM_ATENDIMENTO`).
Bordô como joia, não decoração.

## Célula miniatura (opção A)

Desktop — até ~2–3 itens do dia, abreviados, ordenados por horário; acento de cor
por tipo; overflow "+N":

```
┌──────────────┐
│ 12           │
│ 16h Mariana · prova    │  champagne
│ ◦ Casamento Camila     │  bordô
│ +2                     │
└──────────────┘
```

Mobile / colunas estreitas — fallback para contagem por categoria:

```
┌──────────────┐
│ 12           │
│ 2 provas     │
│ 1 casamento  │
│ • a receber  │  (só com financeiro:ver)
└──────────────┘
```

O dia de hoje e o dia selecionado têm destaque próprio (hoje = bolinha bordô no
número, como já existe; selecionado = moldura/realce do dia aberto no painel).

## Painel "Dia do atelier" (`?dia=`)

Renderizado abaixo da grade quando há `?dia=YYYY-MM-DD` (default = hoje). Mostra só
as seções com conteúdo, em ordem operacional:

1. **Atendimentos** — horário · noiva · cabine · vendedora · situação (link p/ detalhe)
2. **Provas** — horário · noiva · vestido (link p/ a reserva)
3. **Casamentos** — noiva · vestido
4. **A receber hoje** — parcela: noiva/contrato · valor · status (vencidas destacadas) — só `financeiro:ver`
5. **A pagar hoje** — conta: descrição · valor · status (vencidas destacadas) — só `financeiro:ver`

Vazio elegante quando o dia não tem nada. Cada item linka para sua tela de detalhe.

## Camada de dados

Estender `src/lib/calendario/dados.ts` (puro Prisma, escopo de loja):

- `marcadoresNoIntervalo(lojaId, inicio, fim)` — **adicionar** marcadores financeiros
  (parcelas e contas a pagar por `vencimento` em `[inicio, fim)`). Mantém os 3 atuais.
  Provavelmente evolui de "tipo só" para algo que carregue rótulo curto + horário,
  para alimentar a mini-agenda da célula (a decidir no plano: enriquecer `Marcador`
  ou uma função irmã `itensDoMes` para a célula textual).
- **Nova** `detalheDoDia(lojaId, ymd)` — uma leitura paralela (`Promise.all`)
  devolvendo, do dia: atendimentos, provas (com vestido/reserva), casamentos,
  parcelas a receber, contas a pagar. Reusar `vencimentoNaJanela`/janela
  `[meiaNoiteUTC(ymd), +1 dia)`. As seções financeiras são montadas mas só
  **renderizadas** sob `financeiro:ver` (a função pode devolvê-las sempre; o gate
  é na página — ou a página decide não pedi-las; preferir não vazar: a página só
  chama a parte financeira se tiver permissão).

Status financeiro é binário (`PREVISTA`/`PAGA`); "vencida" = `PREVISTA` com
`vencimento < hojeUTC()`.

## Permissão

A página do calendário abre com `leads:ver` (porta atual). Acrescentar leitura de
`podeNoModulo(usuario, loja, "financeiro", "ver")` e:
- na grade: só desenhar o sinal financeiro e seu fallback se `financeiro:ver`;
- no painel: só renderizar as seções "A receber"/"A pagar" se `financeiro:ver`;
- não buscar os dados financeiros quando não há permissão (não vazar nem em props).

## Fatias (TDD, commits pequenos na `main`, gates verdes)

1. **Dados** — marcadores financeiros em `marcadoresNoIntervalo` (ou `itensDoMes`)
   + `detalheDoDia`, com testes (escopo de loja, janela do dia, vencida vs paga).
2. **Grade (miniatura A)** — célula vira mini-agenda textual com acento + "+N";
   fallback de contagem responsivo; tratamento de atenção; células viram links `?dia=`.
3. **Painel do Dia** — server component lendo `detalheDoDia`, dia destacado, seções
   condicionais, vazio elegante, links para detalhes.
4. **Polimento** — gating `financeiro:ver` ponta a ponta, mobile (overflow 375px),
   contraste/acessibilidade, foco de teclado nos dias clicáveis.

## Verificação

- `tsc --noEmit` limpo e `vitest run` verde antes de cada commit.
- Verificação visual com Playwright (padrão `verify_c6.mjs`): aba Mês desktop + 375px,
  clique num dia, painel renderizado, e um perfil sem `financeiro:ver` (sem valores).

## Fora de escopo

- Ajustes no calendário (ficam em `/ajustes`).
- Alterar as outras abas (Vestidos, Atendimentos, Provas-ajustes).
- Edição/ação financeira dentro do calendário (só leitura + link para a tela financeira).
- Mudança de schema ou migração.
