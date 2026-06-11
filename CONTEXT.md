# Glossário — Moscow Noivas

Linguagem canônica do domínio. Só termos e seus significados — nada de
implementação, rota ou decisão técnica (essas vão em `docs/adr/`).

## Dia do atelier

Tudo o que acontece **num dia** da operação, reunido numa só visão: atendimentos,
provas, casamentos e — para quem pode ver financeiro — as contas a receber e a pagar
que vencem naquele dia.

É um **conceito único** servido em dois contextos:
- no **Início**, fixo em **hoje**;
- no **Calendário**, em **qualquer dia** escolhido na grade do mês.

## Início

A tela que abre ao entrar na loja. Reúne a visão geral da loja (indicadores,
atenções, jornada, casamentos, destaque do acervo) **e** o *Dia do atelier* de hoje.
Responde "o que acontece hoje, e como anda a loja?". A parte financeira de hoje só
aparece para quem tem permissão de ver financeiro.

## Calendário

A visão **temporal** da operação: a grade do mês, navegável, onde cada dia mostra
sua mini-agenda. Responde "o que tem no dia X?". Clicar num dia abre o *Dia do atelier*
daquele dia. Seu valor é abrir **qualquer dia** — o de hoje já vive no Início; pode
repetir informação do Início sem problema.

## Atenção imediata

Coisa transversal que pede cuidado **agora**, independente de um dia específico —
mostrada no Início. Ex.: prova sem confirmação, devolução atrasada e, para quem vê
financeiro, **contas vencidas** (a receber ou a pagar, ainda em aberto). Difere do
*Dia do atelier*, que é sempre ancorado num dia.

## Financeiro sensível

Contas a receber (parcelas) e a pagar, com valores. São **dado sensível**: só
aparecem para quem tem permissão de ver financeiro. Qualquer visão que misture
agenda e dinheiro (Início, Dia do atelier) esconde a parte financeira de quem não pode vê-la.
