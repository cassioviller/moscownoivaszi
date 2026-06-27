# 0001 — Dia do atelier no Início e no Calendário

**Status:** Aceito · 2026-06-11

## Contexto

O pedido foi centralizar "tudo que o gestor precisa ver no dia" — agenda
(atendimentos, provas, casamentos) e financeiro (contas a receber/pagar). O
**Início** (`/loja/[lojaId]`) já se vendia como "a mesa principal do atelier" (o que
pede atenção agora), e o **Calendário** (`/loja/[lojaId]/calendario`, aba Mês) já
existia como visão temporal. Surgiu a tensão de **dois donos para o mesmo trabalho**:
quem é o painel central do gestor?

## Decisão

Há **um** conceito — o *Dia do atelier* (tudo de um dia: agenda + financeiro) — servido
em **dois** contextos:

- **Início** mostra o Dia do atelier de **hoje**, somado (não substituindo) aos painéis
  que já tem; responde "o que acontece hoje?".
- **Calendário** mostra a grade do mês e abre o Dia do atelier de **qualquer** dia ao
  clicar; responde "o que tem no dia X?". Abre sem dia pré-expandido (o de hoje já
  vive no Início).

O mesmo componente renderiza os dois. **A duplicação de informação entre Início e
Calendário é aceita de propósito.** O financeiro é dado sensível: só aparece com
permissão `financeiro:ver`; contas **vencidas** sobem para as *Atenções imediatas* do
Início, não para cada dia.

## Consequências

- Papéis claros: Início = "hoje + visão geral"; Calendário = "navegar qualquer dia".
- Informação repetida entre as duas telas (custo aceito em troca da clareza).
- Um componente reutilizável de "dia" para manter em um lugar só.
- O gating de financeiro precisa ser respeitado em ambas as telas e na camada de dados.

## Alternativas consideradas

- **Calendário como painel central único** (absorvendo o papel do Início). Rejeitada:
  o Início é a tela que abre e já cumpre bem o "o que faço agora?"; movê-lo para o
  calendário tiraria o gestor do caminho natural.
- **Manter Início sem o dia/financeiro** (só leads, como hoje), com o dia só no
  Calendário. Rejeitada: o dono quer ver o dinheiro e a agenda **do dia ao abrir** o
  sistema, não depois de navegar.
