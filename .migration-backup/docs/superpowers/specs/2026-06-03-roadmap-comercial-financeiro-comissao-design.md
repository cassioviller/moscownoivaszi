# Spec-Roadmap — Cadeia Comercial, Financeiro e Comissão

> **Tipo:** roadmap macro (não é a spec de implementação de uma fatia).
> **Decisão de sequenciamento:** Abordagem A (cadeia de valor).
> **Origem:** revisão do `docs/MAPA_DE_TELAS.md` + brainstorming de 2026-06-03.
> Cada fatia abaixo vira **sua própria spec** (`docs/superpowers/specs/`) e seu próprio
> plano de implementação. Este documento existe para travar a **visão macro**, o
> **modelo de dados** e as **regras transversais** antes de descer para a primeira fatia.

---

## 1. Objetivo

Completar o sistema do ponto onde a operação do atelier hoje está sólida (reserva →
prova → ajuste) até **fechar as duas pontas da jornada** e **construir o ciclo
comercial e financeiro completo**, terminando na **comissão das vendedoras** e numa
**folha leve** que cruza salário + comissão na hora do pagamento.

A direção criativa permanece **Concierge Atelier** (`docs/design/`): nada de cara de
ERP; financeiro com 70% informação útil, 30% atmosfera; linguagem humana.

## 2. Princípios que guiam todo o roadmap

1. **Jornada derivada, não persistida.** A etapa da noiva continua sendo calculada dos
   fatos (`src/lib/leads/jornada.ts`). Cada fatia que fecha uma ponta adiciona um
   **fato**, nunca um "campo etapa" editável. O enum `Lead.etapa` segue morto (limpar
   numa fatia de higiene, fora do caminho crítico).
2. **Multi-tenant fechado.** Todo modelo novo carrega `lojaId` e passa por
   `tenantPrisma()`. Filhas puras (itens, parcelas) herdam isolamento pela mãe, mas
   carimbam `lojaId` quando forem alvo direto de query (padrão já usado em `Prova`/`Ajuste`).
3. **Obrigação ≠ Quitação.** O coração do financeiro: separar **o que se deve** (conta a
   pagar/receber, sempre uma **previsão**) de **o pagamento** (saída/entrada real de
   caixa, que pode quitar várias contas e ter valor diferente do previsto). Ver §5.
4. **Previsão imperfeita > nada.** Salário entra como previsão editável; o valor exato só
   se confirma no pagamento (digitado à mão, vindo da contabilidade). Sem modelar ponto.
5. **Fatias verticais finas.** Cada fatia entrega uma tela utilizável de ponta a ponta
   (UI + data layer + regra), com `tsc` limpo e `vitest` verde antes de commitar na `main`.

## 3. Ordem das fatias (Abordagem A)

```
Aquecimento (independentes, podem ir em paralelo)
  S0.1  Retirada & Devolução        → fecha a SAÍDA da jornada
  S0.2  Provas (visão dedicada)     → agrega o que hoje só vive na reserva

Cadeia comercial
  S1    Atendimentos                → o ato de "atender"; liga agendamento → jornada
  S2    Orçamentos                  → registro da negociação; base de valores
  S3    Contratos (persistir)       → a VENDA; pré-preenche do orçamento aprovado

Financeiro
  S4    Contas a receber            → parcelas do contrato; baixa
  S5    Contas a pagar + Folha leve → modelo obrigação×quitação; salário previsão
  S6    Comissão                    → faixas por vendedora; acumulado; fechamento dia 01
  S7    Fluxo de caixa              → consolidação (leitura) de receber + pagar
```

**Por que esta ordem:** comissão (S6) precisa de **vendas registradas** (contrato
persistido, S3) e do **modelo de conta a pagar** (S5), pois cada comissão fechada vira
uma `ContaPagar`. O fluxo de caixa (S7) é leitura pura sobre o que S4/S5 gravam, então
vem por último. As duas de aquecimento (S0) não dependem de nada novo — são ganhos
rápidos que deixam a jornada redonda enquanto a cadeia comercial é desenhada.

Dependências:
`S1 → S2 → S3 → S4`; `S3 + S5 → S6`; `S4 + S5 → S7`. S0.1 e S0.2 livres.

## 4. Telas (delta sobre o MAPA_DE_TELAS.md)

O mapa atual cobre quase tudo. **Faltava a Comissão** — adicionar:

- **Financeiro → Comissões** (`/loja/[id]/financeiro/comissoes`): ranking do mês +
  acumulado em tempo real por vendedora + histórico de fechamentos mensais.
- **Regras de comissão por vendedora** (`/loja/[id]/financeiro/comissoes/regras` ou
  dentro do perfil do colaborador em Equipe): faixas configuráveis (ver §6).
- **Acompanhamento no perfil da vendedora:** o acumulado/previsão da própria comissão
  aparece também no perfil dela (Equipe), além do ranking consolidado.

A barra lateral de **Financeiro** passa a ter 4 itens: Contas a receber · Contas a
pagar · **Comissões** · Fluxo de caixa.

## 5. Modelo de dados (visão macro)

> Nível de roadmap: campos e relações principais. Tipos exatos, índices e migrações
> ficam na spec de cada fatia. Tudo com `lojaId` + timestamps.

### 5.1 Comercial

**`Orcamento`** (S2) — a negociação registrada.
- `leadId`, `atendimentoId?`, `vendedoraId` (quem negociou — semente da atribuição de comissão)
- `status`: RASCUNHO · ENVIADO · APROVADO · RECUSADO
- `descontoTipo` (PERCENTUAL|VALOR), `descontoValor`, `validade`, `observacoes`
- total **derivado** dos itens
- **`OrcamentoItem`**: `orcamentoId`, `tipo` (VESTIDO|SERVICO|AJUSTE), `vestidoId?`,
  `descricao`, `valorUnitario`, `quantidade`

**`Contrato`** (S3) — **a venda**. Origem da comissão e do plano de pagamento.
- `leadId`, `orcamentoId?`, `bloqueioVestidoId?` (a reserva), `vendedoraId`
- `valorTotal`, `desconto`, datas (`casamento`, `retirada`, `devolucao`, `assinatura`)
- `competenciaVenda` (YYYY-MM do fechamento — o mês que conta para a meta da vendedora)
- `status`, metadados do PDF
- Marca o fato `contratoFechadoEm` na jornada.

### 5.2 Financeiro — receber

**`ContaReceber`** (S4) — parcela prevista do contrato.
- `contratoId`, `leadId`, `numero`, `valorPrevisto`, `vencimento`
- `status`: PREVISTA · PAGA · PARCIAL · ATRASADA
- `recebidoEm?`, `valorRecebido?`
- Baixa simples por parcela (não precisa do mecanismo multi-conta do lado de pagar).

### 5.3 Financeiro — pagar (obrigação × quitação)

**`ContaPagar`** (S5) — qualquer obrigação prevista. **Genérica por `tipo`.**
- `tipo`: DESPESA · FORNECEDOR · **SALARIO** · **COMISSAO**
- `colaboradorId?` (Usuario — para salário/comissão), `competencia` (YYYY-MM)
- `descricao`, `categoria?`, `valorPrevisto`, `vencimento`, `status`
- `recorrenteId?` (salário recorrente), `origemComissaoFechamentoId?` (rastro da comissão)

**`Pagamento`** (S5) — **uma** saída de caixa que quita **N** contas a pagar.
- `data`, `valorPago` (real, pode diferir da soma das previsões), `forma`
- `enviadoContabilidadeEm?` (marca o "exportei para a folha")
- **`PagamentoItem`**: `pagamentoId`, `contaPagarId`, `valor` (quanto deste pagamento foi
  para aquela conta) → é o **cruzamento salário+comissão** num pagamento só.

> Fluxo de quitação: gerente seleciona as contas do colaborador (salário maio + comissão
> abril), digita o valor real de cada uma, confirma → cria 1 `Pagamento` + N
> `PagamentoItem`, dá baixa em cada `ContaPagar`, gera **1 saída** no fluxo de caixa.

### 5.4 Comissão

**`ComissaoRegra`** (S6) — config por vendedora, versionada por vigência.
- `vendedoraId`, `vigenciaInicio`, `bonusAcumulaFaixas` (bool — decisão 5a configurável:
  somar bônus de cada faixa atingida **ou** só o da faixa final)
- **`ComissaoFaixa`**: `regraId`, `minAcumulado`, `maxAcumulado?` (null = aberta no topo),
  `percentual?`, `bonusFixo?` — ambos opcionais (faixa pode ter só %, só bônus, ou os dois)

**`ComissaoFechamento`** (S6) — o snapshot mensal por vendedora.
- `vendedoraId`, `competencia` (YYYY-MM), `totalVendas`, `faixaAplicadaId`,
  `percentualAplicado`, `valorComissao`, `valorBonus`, `valorTotal`
- `contaPagarId` (a `ContaPagar` tipo=COMISSAO gerada), `fechadoEm`
- Antes do fechamento, o mesmo cálculo roda **ao vivo** (preview) sem gravar.

## 6. Regras da comissão (decididas no brainstorming)

1. **Gatilho:** comissão é gerada quando o **contrato é fechado** — cada contrato soma ao
   acumulado do mês (`competenciaVenda`) da `vendedoraId`.
2. **Base:** **faixas configuráveis por vendedora**, medidas pelo **acumulado mensal** de
   vendas dela.
3. **Aplicação do %:** **retroativo** — a faixa final manda no mês inteiro
   (ex.: faixas 3% até 30k / 5% até 60k; fechou 50k → 5% sobre os 50k).
4. **Bônus fixo:** opcional por faixa, **uma vez** ao atingir a faixa. Somar bônus de
   várias faixas atingidas **ou** só a final é **configurável** (`bonusAcumulaFaixas`).
5. **Acompanhamento:** durante o mês o valor **acumula ao vivo** (preview), visível no
   **ranking** e no **perfil de cada vendedora**.
6. **Fechamento:** no **dia 01**, o sistema fecha a **competência anterior**
   (ex.: 01/05 fecha abril), gera **uma `ContaPagar` tipo=COMISSAO por vendedora**
   ("Comissão — Vendedora A", "Comissão — Vendedora B") via `ComissaoFechamento`.
   - **Implementação:** o fechamento é uma operação **idempotente** ("fechar competência
     X"). Começa como **ação manual** do gerente (botão "Fechar mês") e pode depois ser
     automatizada por agendamento. Idempotência evita comissão duplicada se rodar 2x.

## 7. Cruzamento com a contabilidade / folha (escopo A)

O sistema **não processa folha**. Ele:
- mantém **salário como `ContaPagar` previsão** (recorrente, valor base editável);
- mantém **comissão como `ContaPagar` calculada** (gerada no fechamento);
- no **pagamento**, junta as duas num **`Pagamento`** só → **uma saída** no fluxo de
  caixa com **baixa rastreável** em cada conta;
- registra **previsto vs pago** (a diferença de faltas/horas extras entra como **edição
  manual** do valor no pagamento — o gerente digita o número que a contabilidade passou,
  sem o sistema modelar ponto);
- marca o pagamento/competência como **`enviadoContabilidade`** e gera um **resumo**
  (vendedora · salário · comissão · total) para a folha lá fora.

## 8. Fechamento das pontas da jornada (S0)

- **S0.1 Retirada & Devolução:** ações que setam `BloqueioVestido.retiradaDataReal` e
  `.devolucaoDataReal` na tela de detalhe da reserva. Destrava as etapas órfãs
  `retirado` e `devolucao` (campos já existem; faltam UI + ação + fatos na jornada).
- **S0.2 Provas (visão dedicada):** tela que agrega as provas do período (a operação já
  existe em `src/lib/atelier/provas.ts`; falta a tela própria `/provas`).
- **S1 Atendimentos:** liga `Atendimento` à jornada (hoje agendar não move nada). Novo
  fato "atendida/em atendimento"; é o palco onde o orçamento é aberto e a reserva nasce.

## 9. Transversais (valem para todas as fatias)

- **Permissões:** criar módulo `financeiro` (ver/gerir) — e avaliar `comissao` à parte
  (dado sensível). **Substituir o gate provisório** `podeVerNoivas` que hoje cobre o
  Financeiro na barra lateral (`nav-items.ts` tem o TODO marcado).
- **Atribuição da venda:** a `vendedoraId` flui `Atendimento → Orcamento → Contrato`; o
  contrato é a fonte de verdade da comissão.
- **Datas/competência:** competência sempre `YYYY-MM`; fechamento do dia 01 opera sobre o
  mês anterior. Cuidado com fuso (o motor de disponibilidade já tem utilitários de data).
- **Idempotência financeira:** gerar parcelas, fechar comissão e dar baixa precisam ser
  idempotentes/seguros a re-execução.
- **Gates verdes** antes de cada commit na `main` (regra do projeto).

## 10. Não-objetivos (YAGNI explícito)

- Processar folha de pagamento (ponto, faltas, holerite, encargos).
- Assinatura digital de contrato.
- Conciliação bancária / integração com banco.
- Atualização automática de salário por ponto.
- Multi-conta no lado de **receber** (cada parcela tem baixa própria).
- Relatórios contábeis fiscais.

## 11. Riscos / pontos a confirmar nas specs de fatia

- **Comissão retroativa + bônus por faixa:** validar o cálculo com casos-limite
  (acumulado exatamente na borda da faixa; faixa só-bônus; faixa só-%).
- **Fechamento manual vs automático:** começar manual; confirmar se/quando automatizar.
- **Reabertura de competência:** o que acontece se um contrato é cancelado depois do
  fechamento? (provável: ajuste na competência seguinte — decidir na spec de S6).
- **Origem da venda em contratos legados** (PDF stateless atual): migração/backfill na
  spec de S3.

## 12. Definição de pronto (roadmap)

Este roadmap está pronto quando: a ordem das fatias, o modelo de dados macro, as regras
de comissão e o cruzamento com a folha estiverem aprovados pelo dono. A partir daí,
abre-se a **spec da S0.1/S1** (primeira fatia) pelo fluxo normal (brainstorming leve →
writing-plans → implementação).

---

> Próximo passo após aprovação: escrever a spec da **primeira fatia**. Sugestão: rodar
> S0.1 (Retirada & Devolução) e S0.2 (Provas) como aquecimento rápido, e em paralelo
> abrir a spec da **S1 (Atendimentos)**, que inicia a cadeia comercial.
