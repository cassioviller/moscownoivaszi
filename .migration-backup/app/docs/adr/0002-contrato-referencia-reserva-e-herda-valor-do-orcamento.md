# 2. Contrato referencia a Reserva e herda o valor do orçamento

Data: 2026-06-15

## Status

Aceito

## Contexto

Até aqui, um `Contrato` referenciava **um único vestido** (`Contrato.bloqueioVestidoId` → um `BloqueioVestido`). Isso bastava enquanto a noiva reservava um vestido por vez. Com a introdução da **Reserva** como compromisso multi-vestido (uma reserva agrupa N vestidos para o casamento — ver `CONTEXT.md` e a fatia "Reserva multi-item"), "um contrato = um vestido" deixa de descrever a realidade: a noiva fecha **um** contrato pelo conjunto que vai levar.

Além disso há duas portas de criação de contrato:
- **do orçamento aprovado** (`criarContratoDeOrcamento`): já calcula `valorTotal` a partir dos itens do orçamento — **correto**;
- **da noiva** (`criarContratoDaNoiva`, fallback sem orçamento): grava `valorTotal = "0.00"`.

O `0.00` é um valor-padrão enganoso: o contrato deveria sempre carregar o **valor orçado para aquela noiva**, não um zero que parece um contrato sem preço. O dono sinalizou isso explicitamente como erro a corrigir.

## Decisão

1. **O contrato passa a referenciar a Reserva (cabeça):** novo campo `Contrato.reservaId` (FK opcional para `Reserva`). Os vestidos cobertos pelo contrato são os **itens da reserva**. `Contrato.bloqueioVestidoId` é mantido por compatibilidade com contratos antigos (1 vestido) e fica **deprecado** — sem migração destrutiva.

2. **O valor do contrato é sempre herdado do orçamento aprovado da noiva.** Nenhuma porta de criação grava `0.00` por padrão:
   - do orçamento: `valorTotal` = total do orçamento (como hoje);
   - da noiva: busca o **orçamento aprovado** mais recente da noiva e herda dele o `valorTotal`, os vestidos (via reserva) e a descrição. Sem orçamento aprovado, a criação **recusa** com motivo claro (em vez de nascer com `0.00`) — o contrato exige um valor orçado de origem.

3. O encadeamento canônico fica: **Orçamento (valor negociado) → Reserva (peças guardadas) → Contrato (formaliza: aponta para a reserva, herda o valor do orçamento).**

## Consequências

- **Positivas:** o contrato descreve o compromisso real (a reserva inteira) e nunca nasce com valor enganoso; comissão (S6) e parcelas — que derivam de `valorTotal` — passam a refletir o valor orçado em ambas as portas.
- **Custo:** mexe num subsistema financeiro fechado (`Contrato` + comissão + parcelas). Por isso virou fatia própria (1.5), depois da Reserva multi-item (1), com seu próprio spec/plano e regressão da suíte de contratos/financeiro.
- **Reversibilidade:** baixa — schema do `Contrato` e a regra de valor afetam dados já gravados e relatórios financeiros. Daí este ADR.
- **Limite:** datas de retirada/devolução do `Contrato` seguem sendo do contrato como um todo; a movimentação **por peça** continua em cada item da reserva (`BloqueioVestido.retiradaDataReal`/`devolucaoDataReal`). Não se unificam.
