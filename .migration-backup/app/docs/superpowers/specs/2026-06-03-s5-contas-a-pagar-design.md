# Spec S5 — Contas a pagar + folha leve (obrigação × quitação)

> **Fatia** do roadmap `2026-06-03-roadmap-comercial-financeiro-comissao-design.md`.
> A peça financeira mais conceitual: separar **obrigação** (o que se deve) de **quitação**
> (o pagamento que sai do caixa), e o **cruzamento salário + comissão** num pagamento só.
> Tem **migração**. **Não** toca a jornada. Constrói a infra que a **Comissão (S6)** vai
> preencher; **não** calcula comissão aqui.

---

## 1. Problema

O atelier paga custos (costureira, lavanderia, fornecedores) e **salários**, e em breve
**comissões** (S6) — mas o sistema não registra nada disso. Falta o lado **a pagar**: o
que se deve, o que já foi pago, e o **cruzamento** em que salário + comissão de uma
pessoa saem **juntos** no caixa, mas com baixa rastreável em cada um.

## 2. O que existe hoje

- S4 deu o lado **a receber** (Parcela) e o padrão de carteira/resumo/baixa.
- `src/lib/dinheiro.ts` (centavos), `src/lib/url-interna.ts` (guarda de `voltar`).
- `Usuario` + `UsuarioLoja` (colaboradores da loja — quem recebe salário/comissão).
- Sidebar **Financeiro → Contas a pagar** (`/financeiro/pagar`) hoje **404** (gate provisório `leads`).

## 3. Princípio: obrigação ≠ quitação

Duas coisas distintas, que normalmente se confundem:

- **`ContaPagar`** = uma **obrigação prevista** (sempre uma previsão — inclusive salário).
- **`Pagamento`** = uma **saída real de caixa** que pode quitar **N** contas de uma vez.

É isso que permite pagar **salário + comissão** de alguém num **único pagamento** (uma
saída no caixa), mas com **baixa por conta** e **previsto vs pago** rastreáveis.

## 4. Escopo

**Dentro:**
- **Migração:** `ContaPagar`, `Pagamento`, `PagamentoItem`, **`SalarioRecorrente`** (+ enums).
- **Motor de recorrência de salário:** salário-base por colaborador → **gerar a folha do
  mês** cria as contas a pagar (idempotente). Ver §5.1.
- **Data layer:** lançar conta (despesa/fornecedor/salário ad-hoc); gerir salário
  recorrente; gerar folha do mês; listar contas a pagar; **registrar pagamento** (1
  pagamento → N contas, valor real por conta); estornar pagamento; marcar **enviado à
  contabilidade**; resumo a pagar; resumo por competência (colaborador · salário ·
  comissão · total).
- **Telas:** `/financeiro/pagar` (carteira: a pagar / pagas + resumo + lançar despesa/
  salário) e **Pagar colaborador** (agrupa as contas em aberto de uma pessoa → 1 pagamento).
- Dinheiro pelo util compartilhado.

**Fora (YAGNI / outras fatias):**
- **Calcular comissão** → **S6** (aqui o tipo `COMISSAO` existe no enum, mas as contas de
  comissão são geradas na S6; o fluxo de pagamento já as suporta).
- **Fluxo de caixa consolidado** → S7 (lê Recebimento + Pagamento).
- **Ponto / folha de verdade** (faltas, horas extras, encargos, holerite): **não** se
  modela. A diferença previsto×pago entra como **edição manual** do valor no pagamento.
- **Pagamento parcial** de uma conta: aqui a quitação é integral por conta.
- Permissão dedicada `financeiro` → fatia de permissões.

## 5. Migração (schema)

```prisma
enum ContaPagarTipo   { DESPESA FORNECEDOR SALARIO COMISSAO }
enum ContaPagarStatus { PREVISTA PAGA }   // ATRASADA é derivado (vencido + PREVISTA)

model ContaPagar {
  id            String           @id @default(cuid())
  lojaId        String
  tipo          ContaPagarTipo
  colaboradorId String?          // Usuario — p/ SALARIO/COMISSAO
  competencia   String?          // "YYYY-MM" (mês de referência)
  descricao     String
  categoria     String?          // "Lavanderia", "Aluguel"…
  fornecedor    String?
  valorPrevisto Decimal          @db.Decimal(10, 2)
  vencimento    DateTime
  status        ContaPagarStatus @default(PREVISTA)
  origemComissaoFechamentoId String?  // rastro da comissão (preenchido na S6)
  createdAt     DateTime         @default(now())

  loja        Loja            @relation(...)
  colaborador Usuario?        @relation(...)
  itensPagto  PagamentoItem[]
}

model Pagamento {
  id            String   @id @default(cuid())
  lojaId        String
  colaboradorId String?  // quando o pagamento é de uma pessoa (salário/comissão)
  data          DateTime
  valorPago     Decimal  @db.Decimal(10, 2)  // = soma dos itens (real; pode diferir das previsões)
  forma         String?
  observacoes   String?
  enviadoContabilidadeEm DateTime?
  createdAt     DateTime @default(now())

  loja        Loja            @relation(...)
  colaborador Usuario?        @relation(...)
  itens       PagamentoItem[]
}

model PagamentoItem {
  id           String  @id @default(cuid())
  lojaId       String  // carimbo p/ tenantPrisma
  pagamentoId  String
  contaPagarId String  @unique  // cada conta é quitada por no máximo 1 pagamento
  valor        Decimal @db.Decimal(10, 2)  // quanto deste pagamento foi p/ essa conta (o REAL pago)

  loja       Loja       @relation(...)
  pagamento  Pagamento  @relation(..., onDelete: Cascade)
  contaPagar ContaPagar @relation(..., onDelete: Cascade)
}
```

```prisma
model SalarioRecorrente {
  id            String   @id @default(cuid())
  lojaId        String
  colaboradorId String   // Usuario (membro da loja)
  valorBase     Decimal  @db.Decimal(10, 2)
  diaVencimento Int      // 1..28 (dia do mês do vencimento)
  ativo         Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  loja        Loja    @relation(...)
  colaborador Usuario @relation(...)
  @@unique([lojaId, colaboradorId])  // um salário recorrente por colaborador na loja
}
```

> `PagamentoItem.contaPagarId @unique` garante que uma conta não seja quitada duas vezes.
> Aditiva (cria tabelas/enums). `ContaPagar`, `Pagamento`, `PagamentoItem`,
> `SalarioRecorrente` em `TENANT_MODELS`. `Usuario`/`Loja` ganham relações inversas.
> Operação de banco = **requer confirmação** antes de `prisma migrate` (e **reiniciar o
> dev server** depois).

### 5.1 Motor de recorrência de salário

- `definirSalarioRecorrente(lojaId, colaboradorId, { valorBase, diaVencimento })` — upsert
  por colaborador (valida membro da loja; `diaVencimento` 1..28).
- `gerarFolhaDoMes(lojaId, competencia)` — para cada salário recorrente **ativo**, cria uma
  `ContaPagar` tipo SALARIO com `valorPrevisto = valorBase`, `competencia`, `vencimento =
  competência + diaVencimento`, ligada via `salarioRecorrenteId`. **Idempotente**: pula
  colaboradores que já têm conta SALARIO naquela competência (não duplica). Retorna quantas
  geradas. O valor de cada conta segue **editável** (ajuste do mês) antes do pagamento.
- `ContaPagar` ganha `salarioRecorrenteId String?` (rastro da geração).

## 6. Data layer (`src/lib/financeiro/pagar.ts` — novo)

```ts
lancarConta(lojaId, { tipo, colaboradorId?, competencia?, descricao, categoria?, fornecedor?, valorPrevisto, vencimento }): { ok; contaId } | { ok:false; motivo }  // SALARIO/COMISSAO validam membro da loja
// — salário recorrente —
definirSalarioRecorrente(lojaId, colaboradorId, { valorBase, diaVencimento }): Resultado   // upsert
listarSalariosRecorrentes(lojaId): SalarioRecorrenteView[]
removerSalarioRecorrente(lojaId, id): Resultado
gerarFolhaDoMes(lojaId, competencia): { ok; geradas: number } | { ok:false; motivo }       // idempotente
editarConta(lojaId, contaId, patch): Resultado            // só PREVISTA
removerConta(lojaId, contaId): Resultado                  // só PREVISTA (não quitada)
listarContasAPagar(lojaId, { filtro, tipo?, colaboradorId? }): ContaPagarView[]   // filtro: abertas|atrasadas|pagas|todas
registrarPagamento(lojaId, { colaboradorId?, data, forma?, itens: { contaPagarId, valor }[] }): { ok; pagamentoId } | { ok:false; motivo }
estornarPagamento(lojaId, pagamentoId): Resultado          // apaga itens → contas voltam a PREVISTA
marcarEnviadoContabilidade(lojaId, pagamentoId, enviado): Resultado
resumoPagar(lojaId): { totalAPagar; pagoTotal; emAtraso }
resumoPorCompetencia(lojaId, competencia): { colaboradorId; nome; salario; comissao; total }[]  // p/ a folha
```

- **`registrarPagamento`** é o coração: valida que todas as `itens.contaPagarId` são
  contas **PREVISTA da loja** (e do `colaboradorId`, se informado); numa **transação**
  (`$transaction`) cria 1 `Pagamento` + N `PagamentoItem` e marca cada `ContaPagar` como
  PAGA. `valorPago` = soma dos `itens.valor`. Cada `item.valor` é o **valor real** (o
  gerente ajusta faltas/extras aqui). Recusa lista vazia ou conta já paga.
- `ATRASADA` derivado (`PREVISTA && vencimento < hoje`), nunca gravado.
- Tudo `tenantPrisma`; centavos via util; `item.valor > 0`.

## 7. Telas

- **`/financeiro/pagar`** (carteira): cards de resumo (a pagar · pago · em atraso),
  filtro (Abertas / Atrasadas / Pagas / Todas), lista por vencimento com tipo/descrição/
  colaborador/valor/status; atraso em bordô. **Lançar despesa** (form) e **Gerar folha do
  mês** (competência → cria os salários). Gate ver=`leads:ver`, mutar=`leads:editar`.
- **Salários recorrentes** (config): por colaborador, salário-base + dia de vencimento +
  ativo. É a fonte que a "folha do mês" usa.
- **Pagar colaborador** (o cruzamento): escolhe um colaborador → vê suas contas em aberto
  (salário + comissão), **edita o valor real de cada uma**, confirma → **1 pagamento**
  (uma saída), baixa em cada conta. Botão **Enviar à contabilidade** + resumo da
  competência (colaborador · salário · comissão · total).
- Tom Concierge; bordô só na atenção (atraso) e na ação principal (pagar).

## 8. Resumo / atraso

- **A pagar** = soma `valorPrevisto` das PREVISTA. **Pago** = soma `PagamentoItem.valor`
  (ou `Pagamento.valorPago`). **Em atraso** = PREVISTA com `vencimento < hoje`.
- Mesma convenção de data (meia-noite UTC SP) do resto do sistema.

## 9. Cruzamento com a contabilidade

`resumoPorCompetencia` agrupa, por colaborador e competência, o salário + a comissão
(quando a S6 existir) → o gerente confere, **paga junto** (§7) e marca **enviado à
contabilidade**. O pagamento real continua sendo feito lá fora (junto da folha); o sistema
entrega o **número** e o **rastro** (previsto×pago por conta), não processa a folha.

## 10. Decisões a confirmar (pontos seus)

1. **Salário com motor de recorrência** (decisão do dono): salário-base por colaborador
   (`SalarioRecorrente`) + **gerar folha do mês** (idempotente). Lançamento avulso de
   salário/despesa segue disponível para ajustes pontuais. Ver §5.1.
2. **Quitação**: 1 pagamento quita N contas, `valorPago` = soma dos itens, `item.valor` =
   o real (ajuste manual de faltas/extras), **sem pagamento parcial** de uma conta —
   *recomendo*.
3. **Despesa avulsa**: pagar uma única despesa usa o **mesmo** `registrarPagamento` (1
   item) — *recomendo* (fluxo único, sem "marcar paga" à parte).
4. **Permissão**: reusar `leads` (igual à S4) — *recomendo*; módulo `financeiro` depois.
5. **ATRASADA derivado** — *recomendo* (igual à S4).

## 11. Testes

- **Data layer** (`pagar.test.ts`): lançar conta (SALARIO valida membro da loja);
  **salário recorrente** (definir/upsert + `gerarFolhaDoMes` cria as contas com vencimento
  certo e é **idempotente** — rodar 2× não duplica); editar/remover só PREVISTA;
  **registrarPagamento** quita N contas numa transação (valorPago = soma; contas → PAGA;
  `contaPagarId @unique` barra quitar 2×); **estorno** devolve contas a PREVISTA; conta de
  outra loja/já paga recusada; `atrasada` derivado; `resumoPagar` e `resumoPorCompetencia`;
  item ≤ 0 recusado; isolamento de loja.
- **Sem mudança na jornada.**

## 12. Plano (fatias finas, commit na `main`)

1. Migração + `prisma generate` (após confirmação) + registrar os 3 models no tenant
   (+ **reiniciar dev server**).
2. Data layer (lançar/listar/pagar/estornar/resumo) **+ testes** (TDD).
3. Telas: `/financeiro/pagar` + Pagar colaborador + Server Actions (reusando
   `caminhoInternoSeguro`).
4. Verificação (lançar salário + despesa → pagar junto → resumo/atraso → enviar
   contabilidade) e gates verdes.

## 13. Riscos

- **Atomicidade do pagamento**: `registrarPagamento` deve ser **transacional** (criar
  Pagamento+itens e marcar contas PAGA tudo-ou-nada) — senão fica baixa parcial. Aprendido
  na S4 (createMany/transação).
- **`contaPagarId @unique`**: corrida de quitar a mesma conta 2× → P2002 tratado.
- **Migração** em banco com dados (aditiva; confirmar ambiente; reiniciar dev server).
- **Comissão ainda não existe**: o tipo COMISSAO no enum sem geração (S6) — o "Pagar
  colaborador" mostra só salário até a S6; deixar claro na tela (sem prometer comissão).
- **Gate provisório `leads`**: financeiro visível a quem vê noivas — compromisso conhecido.

## 14. Definição de pronto

O gerente lança despesas e salários (previsões), **paga várias contas de um colaborador
num pagamento só** (uma saída, baixa por conta, previsto×pago), vê a **carteira a pagar**
(a pagar / atrasadas / pagas) com resumo, e marca a competência como **enviada à
contabilidade**; data layer coberto por testes; gates verdes.
