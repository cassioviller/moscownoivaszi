# Mapa de Telas — Moscow Noivas

> Documento de referência da **estrutura completa de telas** do sistema, na ordem da
> jornada da noiva. Serve para alinhar navegação, escopo de cada tela e o que ainda
> falta construir. Não é especificação técnica fechada — é o mapa do território.
>
> Direção criativa: **Concierge Atelier** (ver `docs/design/DESIGN_CONCIERGE_ATELIER.md`).
> Cada noiva é uma jornada, cada vestido é acervo, cada tela deve parecer boutique.

## Como ler este documento

Cada tela traz:

- **Rota** — caminho no app (`/loja/[id]/...`).
- **Status** — 🟢 existe · 🟡 parcial · 🔴 nova (ainda não construída).
- **Objetivo** — para que serve, em uma frase.
- **O que mostra** — blocos de informação principais.
- **Ações** — o que a equipe consegue fazer ali.
- **Dados** — tabelas/origens (Prisma) que alimentam a tela.
- **Na jornada** — como a tela move a noiva de uma etapa para a próxima.

Legenda de status no rodapé de cada seção.

---

## A jornada da noiva (espinha do sistema)

A jornada é **derivada** dos fatos (nunca um campo editável solto). A ordem real é:

```
Cadastrada → Atendimento agendado → Atendida → Interesses → Orçamento aberto
   → Contrato fechado → Reserva do vestido → Provas → Ajustes
   → Retirada → Casamento → Devolução
```

Hoje o **meio** (reserva → prova → ajuste) está sólido. As **pontas** estão abertas:

- **Entrada:** agendar um atendimento não move a jornada; não existe o ato de "atender".
- **Saída:** não há como registrar **retirada** nem **devolução** — a jornada nunca encerra.

Este mapa já contempla as telas que fecham essas pontas.

---

## Estrutura da barra lateral

```
Início

ATELIÊ            (a jornada, em ordem)
  Noivas
  Agendar
  Calendário
  Atendimentos
  Orçamentos
  Contratos
  Reservas
  Provas
  Ajustes

ACERVO
  Vestidos
  Catálogo

FINANCEIRO
  Contas a receber
  Contas a pagar
  Comissões
  Fluxo de caixa

GESTÃO            (só admin)
  Equipe
  Permissões
  Administração
  Trocar loja
```

---

# 1. Início

**Rota:** `/loja/[id]` · **Status:** 🟡 parcial

**Objetivo:** a "mesa principal do atelier" — o que precisa de atenção hoje, em até 5 segundos.

**O que mostra:**
- Saudação humana + filtro de data/unidade.
- **Indicadores do dia:** noivas de hoje, provas confirmadas, ajustes pendentes, casamentos da semana.
- **Agenda de hoje:** horário, noiva, tipo de atendimento, responsável, status.
- **Próximos atendimentos.**
- **Atenções imediatas** (linguagem humana, não "alertas"): ajustes vencendo, provas sem confirmação, devoluções atrasadas.
- **Vestido em destaque** do acervo.

**Ações:** atalhos para a noiva, para a agenda completa, para o atendimento do dia.

**Dados:** `Atendimento`, `Prova`, `Ajuste`, `BloqueioVestido`, `Lead`.

**Na jornada:** painel de leitura — não move etapas, orienta o dia.

---

# ATELIÊ

## 2. Noivas

**Rota:** `/loja/[id]/noivas` · **Status:** 🟢 existe

**Objetivo:** o acervo de histórias — toda noiva da loja, com a etapa atual visível.

**O que mostra:** lista/cartões de noivas com nome, data do casamento, etapa da jornada e próxima ação. Busca e filtro por etapa.

**Ações:** adicionar noiva, abrir perfil, filtrar por etapa/casamento.

**Dados:** `Lead`, jornada derivada (`jornada.ts`).

**Na jornada:** porta de entrada — onde toda noiva nasce e é acompanhada.

### 2a. Perfil da noiva

**Rota:** `/loja/[id]/noivas/[leadId]` · **Status:** 🟢 existe

**Objetivo:** o lar da jornada — tudo sobre uma noiva em um lugar.

**O que mostra:**
- Dados + data do casamento.
- **Linha do tempo da jornada** (etapa atual, feitas, futuras).
- Interesses preenchidos e **vestidos sugeridos**.
- Reserva(s), provas e ajustes vinculados.
- Marcos: orçamento aberto, contrato fechado.

**Ações:** editar dados, preencher interesses, reservar vestido, marcar marcos, marcar como perdida.

**Dados:** `Lead`, `LeadInteresse`, `BloqueioVestido`, `Prova`, `Ajuste`.

**Na jornada:** centro de comando da noiva — a maioria das transições começa aqui.

### 2b. Adicionar / Editar noiva

**Rotas:** `/noivas/nova` · `/noivas/[leadId]/editar` · **Status:** 🟢 existe

**Objetivo:** capturar/atualizar os dados da noiva (nome, contato, data do casamento).

**Na jornada:** cria a etapa **Cadastrada**.

### 2c. Interesses

**Rota:** `/noivas/[leadId]/interesses` · **Status:** 🟢 existe

**Objetivo:** registrar os desejos da noiva via catálogo (estilo, decote, etc.) e o teto de orçamento.

**O que mostra:** seleção de atributos do catálogo + sugestão de vestidos em tempo real.

**Na jornada:** marca a etapa **Interesses preenchidos**; alimenta a indicação e, futuramente, o orçamento.

---

## 3. Agendar

**Rota:** `/loja/[id]/atendimentos/novo` · **Status:** 🟢 existe

**Objetivo:** marcar a consulta da noiva em uma cabine/horário livre.

**O que mostra:** grade visual de horários por cabine, respeitando a regra de disponibilidade da loja (sem sobreposição). Lista dos próximos agendamentos.

**Ações:** escolher noiva + cabine + horário, agendar, cancelar agendamento.

**Dados:** `Atendimento`, `Cabine`, `RegraDisponibilidade`.

**Na jornada:** *(ponta a fechar)* deve marcar **Atendimento agendado** — hoje o agendamento não move a jornada.

---

## 4. Calendário

**Rota:** `/loja/[id]/agenda` · **Status:** 🟢 existe

**Objetivo:** a agenda operacional por janela de trabalho — logo depois de agendar, ver o que já está marcado nos próximos dias.

**O que mostra:** eventos derivados das reservas e regras: atendimentos, provas, uso (casamento), higienização, manutenção. Próximos ~60 dias agrupados por mês.

**Dados:** `Atendimento`, `BloqueioVestido`, `RegraDisponibilidade` (motor de disponibilidade, puro).

**Na jornada:** visão temporal transversal — não move etapas, confirma o que foi agendado.

---

## 5. Atendimentos 🟢 existe

**Rota:** `/loja/[id]/atendimentos` · **Status:** 🟢 existe *(S1 — fila de trabalho; orçamento embutido vem na S2)*

**Objetivo:** o ato de **atender** — fechar o vão entre "agendou" e "reservou".

**O que mostra:** a fila de atendimentos (do dia / próximos), cada um com noiva, horário, responsável e status (aguardando · em atendimento · concluído · faltou).

**Ações:**
- Iniciar atendimento (marca **Em atendimento**).
- Durante o atendimento: ver/registrar interesses, ver vestidos sugeridos, **abrir o orçamento e registrar a negociação** com a noiva, **reservar o vestido escolhido** direto dali.
- Concluir atendimento com desfecho (reservou / vai pensar / não serviu).

**Dados:** `Atendimento` (com `leadId`), `LeadInteresse`, `Orcamento`, `BloqueioVestido`.

**Na jornada:** preenche o buraco **Atendida → orçamento → escolha do vestido**; liga o agendamento à reserva.

---

## 6. Orçamentos 🟢 existe

**Rota:** `/loja/[id]/orcamentos` · **Status:** 🟢 existe *(S2 — itens, desconto, status; aprovado alimenta o contrato na S3)*

**Objetivo:** registrar a **negociação feita durante o atendimento** — a vendedora negocia com a noiva e tudo fica gravado, não na cabeça.

**O que mostra:** lista de orçamentos por noiva (rascunho · enviado · aprovado · recusado). No detalhe: itens (vestido + serviços/ajustes), valores cheios, **desconto negociado**, condições/parcelas propostas, total, validade e observações da conversa.

**Ações:** abrir o orçamento (normalmente a partir do atendimento), ajustar itens/valores/desconto, registrar a contraproposta da noiva, marcar como aprovado (alimenta o contrato) ou recusado.

**Dados:** *(novo modelo)* `Orcamento`, `OrcamentoItem`; integra com `Lead`, `Atendimento` e `BloqueioVestido`. Hoje só há `LeadInteresse.tetoOrcamento` e o marco `orcamentoAbertoEm`.

**Na jornada:** acontece **dentro do atendimento**; marca **Orçamento aberto** → **aprovado**; é a base de valores do contrato e do financeiro.

---

## 7. Contratos

**Rota:** `/loja/[id]/contratos` · **Status:** 🟡 parcial

**Objetivo:** formalizar o acordo — gerar o contrato e guardar o registro, com **quase tudo pré-preenchido ao selecionar a noiva**.

**O que mostra (hoje):** formulário que coleta dados (noiva, CPF, vestido, valores, datas) e **gera/baixa um PDF** (template provisório). Sem persistência, preenchido na mão.

**O que falta:**
- **Pré-preenchimento automático:** ao escolher a noiva, o formulário já vem com dados pessoais, vestido reservado, valores/desconto do **orçamento aprovado** e datas (casamento, retirada, devolução). A vendedora só confere e ajusta o que faltar.
- Lista de contratos, vínculo formal com a noiva/orçamento, salvar no banco, versões, template definitivo.

**Ações:** selecionar noiva → revisar dados pré-preenchidos → gerar PDF; futuramente listar, reemitir, anexar à noiva.

**Dados:** hoje stateless + marco `contratoFechadoEm`. Futuro: `Contrato` (origem no `Orcamento` aprovado e na `Reserva`).

**Na jornada:** marca **Contrato fechado**; libera a reserva firme e o plano de pagamento.

---

## 8. Reservas

**Rota:** `/loja/[id]/reservas` · **Status:** 🟢 existe

**Objetivo:** o livro de compromissos — uma linha por noiva, do contrato à devolução.

**O que mostra:** reservas agrupadas por mês de casamento, com etapa da jornada, vestido e prazos. Filtro passadas/futuras.

### 8a. Detalhe da reserva

**Rota:** `/loja/[id]/reservas/[bloqueioId]` · **Status:** 🟡 parcial

**Objetivo:** a ficha operacional do vestido reservado para aquela noiva.

**O que mostra:** fases de indisponibilidade (preparação, uso, lavagem), **provas** e **ajustes** da reserva.

**O que falta:** registrar **retirada** (`retiradaDataReal`) e **devolução** (`devolucaoDataReal`) — campos existem no banco mas nenhuma tela os preenche, então a jornada nunca encerra.

**Ações:** registrar/editar provas e ajustes; *(a construir)* marcar vestido retirado e devolvido.

**Dados:** `BloqueioVestido`, `Prova`, `Ajuste`.

**Na jornada:** cobre **Reserva → Provas → (Retirada) → (Devolução)**. As duas últimas são as etapas órfãs a fechar.

---

## 9. Provas 🔴 nova (visão dedicada)

**Rota:** `/loja/[id]/provas` · **Status:** 🔴 nova (a operação existe, falta a tela própria)

**Objetivo:** a agenda de provas do atelier em um só lugar — hoje cada prova só vive dentro da reserva.

**O que mostra:** provas do período (1ª · intermediária · final) com noiva, vestido, data e comparecimento (agendada · compareceu · faltou · remarcada).

**Ações:** registrar prova, marcar comparecimento, remarcar, abrir a reserva.

**Dados:** `Prova` (filha de `BloqueioVestido`).

**Na jornada:** marca **Prova marcada** → **Em provas**.

---

## 10. Ajustes

**Rota:** `/loja/[id]/ajustes` · **Status:** 🟢 existe

**Objetivo:** a fila da costureira — o que precisa de ajuste, por urgência.

**O que mostra:** ajustes pendentes ordenados pelo casamento mais próximo, com noiva, vestido, prazo e progresso do checklist de costura.

**Ações:** alternar pendente↔feito, itens do checklist, abrir a reserva.

**Dados:** `Ajuste` (nasce de uma `Prova`), `AjusteChecklistItem`.

**Na jornada:** etapa **Ajustes**; quando concluídos, libera a retirada.

---

# ACERVO

## 11. Vestidos

**Rota:** `/loja/[id]/vestidos` · **Status:** 🟢 existe

**Objetivo:** o acervo de peças — cada vestido como peça de coleção, não item de estoque.

**O que mostra:** catálogo de vestidos com fotos, atributos do catálogo e disponibilidade.

**Ações:** cadastrar/editar vestido, gerenciar fotos e atributos.

**Dados:** `Vestido`, `VestidoFoto`, `VestidoAtributo`, `Atributo`.

**Na jornada:** fonte da escolha — alimenta indicação, reserva e contrato.

## 12. Catálogo

**Rota:** `/loja/[id]/catalogo` · **Status:** 🟢 existe

**Objetivo:** as dimensões do acervo — atributos e opções (estilo, decote, cor...) que descrevem vestidos e interesses.

**Ações:** criar/editar atributos e opções.

**Dados:** `Atributo`, `AtributoOpcao`.

**Na jornada:** infraestrutura — sustenta interesses e indicação.

---

# FINANCEIRO

> Todas 🔴 novas — hoje não existe nenhuma estrutura financeira no sistema.
> Receber, pagar e fluxo compartilham o mesmo modelo de lançamentos (mudam a lente);
> Comissões alimenta o "contas a pagar" no fechamento mensal.

## 13. Contas a receber 🔴 nova

**Rota:** `/loja/[id]/financeiro/receber` · **Status:** 🔴 nova

**Objetivo:** o que o atelier tem a receber das noivas — o dinheiro que entra.

**O que mostra:** parcelas previstas por contrato/noiva (prevista · paga · atrasada), com vencimento, valor e quem deve. Resumo: total a receber, recebido no período, em atraso.

**Ações:** registrar pagamento recebido, baixar parcela, reprogramar vencimento, ver o histórico por noiva.

**Dados:** *(novo modelo)* `Parcela` / `Recebimento`, origem no `Contrato` (plano de pagamento gerado a partir do orçamento aprovado).

**Na jornada:** acompanha o pós-contrato pelo lado da entrada; conecta cada parcela à noiva.

---

## 14. Contas a pagar 🔴 nova

**Rota:** `/loja/[id]/financeiro/pagar` · **Status:** 🔴 nova

**Objetivo:** o que o atelier tem a pagar — custos e saídas (costureira, lavanderia, fornecedores, despesas fixas).

**O que mostra:** despesas por vencimento e categoria (pendente · paga · atrasada), com valor e fornecedor. Resumo: total a pagar, pago no período, em atraso.

**Ações:** lançar despesa, marcar como paga, categorizar, agendar recorrência.

**Dados:** *(novo modelo)* `Despesa` / `Pagamento`, com categoria e fornecedor.

**Na jornada:** fora da jornada da noiva — é a operação financeira do atelier.

---

## 15. Comissões 🔴 nova

**Rota:** `/loja/[id]/financeiro/comissoes` · **Status:** 🔴 nova

**Objetivo:** acompanhar a comissão das vendedoras — o quanto cada uma já fez no mês e o quanto o gerente vai pagar no próximo fechamento.

**O que mostra:**
- **Ranking do mês:** vendedoras ordenadas pelo acumulado de vendas + comissão prevista (em tempo real).
- **Acumulado por vendedora:** total vendido no mês, faixa atingida, % aplicado, bônus, comissão prevista.
- **Histórico de fechamentos:** competências já fechadas (vira conta a pagar).
- **Regras por vendedora** (sub-tela): faixas configuráveis com **% e/ou bônus fixo**, acumulado mensal, retroativo (ver spec-roadmap).

**Ações:** configurar faixas por vendedora, acompanhar o acumulado ao vivo, **fechar a competência** (dia 01 gera uma conta a pagar de comissão por vendedora), enviar resumo à contabilidade.

**Dados:** *(novo modelo)* `ComissaoRegra`, `ComissaoFaixa`, `ComissaoFechamento`; origem nas vendas (`Contrato.vendedoraId` + `competenciaVenda`); o fechamento gera `ContaPagar` tipo=COMISSAO.

**Na jornada:** fora da jornada da noiva — é o reconhecimento da vendedora. O acumulado também aparece no perfil dela (Equipe).

> Regras completas em `docs/superpowers/specs/2026-06-03-roadmap-comercial-financeiro-comissao-design.md`.

---

## 16. Fluxo de caixa 🔴 nova

**Rota:** `/loja/[id]/financeiro` · **Status:** 🔴 nova

**Objetivo:** a visão consolidada — entradas menos saídas ao longo do tempo, sem virar dashboard frio.

**O que mostra:**
- Resumo do período: recebido, pago, saldo.
- Extrato cronológico unindo contas a receber e a pagar.
- Projeção dos próximos vencimentos (o que entra e o que sai).

**Ações:** filtrar por período, abrir o lançamento de origem (receber/pagar).

**Dados:** consolida `Recebimento` + `Pagamento` (leitura sobre os modelos das telas 13 e 14).

**Na jornada:** fecha o ciclo comercial; consolida o que as outras duas telas registram.

---

# GESTÃO *(só admin)*

## 17. Equipe

**Rota:** `/equipe` · **Status:** 🟡 parcial

**Objetivo:** as pessoas do atelier — vendedoras e costureiras vinculadas à loja.

**Ações:** listar, vincular usuário à loja, definir papel.

**Dados:** `Usuario`, `UsuarioLoja`.

## 18. Permissões

**Rota:** `/loja/[id]/permissoes` · **Status:** 🟢 existe

**Objetivo:** o que cada papel enxerga e faz (RBAC), com overrides por loja.

**Dados:** `Perfil`, `PerfilOverrideLoja`.

## 19. Administração

**Rota:** `/admin` · **Status:** 🟡 parcial (super admin)

**Objetivo:** gestão multi-loja — criar lojas e usuários.

**Dados:** `Loja`, `Usuario`.

## 20. Trocar loja

**Rota:** `/selecionar-loja` · **Status:** 🟢 existe

**Objetivo:** alternar entre lojas (só aparece com mais de uma).

---

## Resumo por status

| Status | Telas |
|---|---|
| 🟢 existe | Noivas, Perfil, Add/Editar, Interesses, Agendar, Calendário, **Atendimentos**, Reservas, Detalhe da reserva (retirada/devolução ✓), **Provas (visão dedicada)**, Vestidos, Catálogo, Ajustes, Permissões, Trocar loja |
| 🟡 parcial | Início, Contratos (stateless), Equipe, Administração |
| 🔴 nova | Contas a receber, Contas a pagar, Comissões, Fluxo de caixa |

## Pontas abertas que estas telas fecham

1. **Atendimentos** → cria o ato de "atender" e liga agendamento à reserva.
2. **Detalhe da reserva** (retirada/devolução) → encerra a jornada que hoje fica presa em "em provas".
3. **Orçamentos** → tira o orçamento do limbo (marco solto) e dá base ao contrato.
4. **Contratos** (persistência) → guarda o que hoje só vira PDF.
5. **Financeiro** (contas a receber · contas a pagar · fluxo de caixa) → acompanha o dinheiro, inexistente hoje.

---

> Próximo passo sugerido: ajustar a barra lateral para esta ordem (só os links), depois
> construir as telas 🔴 e completar as 🟡 na ordem da jornada.
