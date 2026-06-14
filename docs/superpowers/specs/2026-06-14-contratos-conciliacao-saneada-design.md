# Spec — Contratos: conciliação saneada (cancelamento, entrada única, forma como seleção)

> Fatia de **saneamento** do domínio de contratos ↔ contas a receber. Nasce de uma auditoria
> que achou um bug de correção (cancelar não limpa as parcelas) e duas inconsistências de
> modelo (entrada com dupla fonte; forma de pagamento em texto livre que mistura método e prazo).

---

## 1. Problema (achados da auditoria 2026-06-14)

1. **BUG — parcelas de contrato cancelado vazam para o financeiro.** `cancelarContrato` só faz
   `status = CANCELADO`; **nenhuma** leitura de recebíveis filtra pelo status do contrato
   (`listarContasAReceber`, `resumoReceber`, `agingDaLoja`, `projecaoCaixa`, `dreDoMes`).
   **Provado:** cancelar um contrato com 3 parcelas (R$ 3.000) deixa as 3 como contas a receber,
   R$ 3.000 em atraso, 1 inadimplente. Pior: `removerParcela`/`registrarRecebimento` exigem
   contrato **ATIVO** → as parcelas viram **zumbis** (dívida que não dá para receber nem remover).
2. **Entrada com dupla fonte da verdade.** `Contrato.entrada` (Decimal editável, vai no PDF) é
   desconectado da entrada do plano (`gerarPlanoDePagamento` cria a parcela nº0 a partir de um
   `entrada` digitado **à parte**). Os dois divergem; `planoDivergeDoTotal` ignora `Contrato.entrada`;
   `editarContrato` **não valida** `entrada ≤ valorTotal`.
3. **Forma de pagamento em texto livre.** `Contrato.formaPagamento` (String) **mistura método e
   prazo** (o teste existente usa `"50% + 2x"`). `Parcela.formaRecebimento` idem. Deveriam ser
   **seleção (enum)** do método; o parcelamento já é estruturado pelo plano de parcelas.

## 2. O que já existe (e a spec reusa)

- `Contrato` (`valorTotal`, `entrada?`, `formaPagamento?`, `status` ATIVO/CANCELADO) e `Parcela`
  (`status` PREVISTA/PAGA, `valorPrevisto`, `vencimento`, `valorRecebido?`, `recebidoEm?`,
  `formaRecebimento?`). `contratos.ts` (criar/editar/cancelar/PDF), `receber.ts`
  (`gerarPlanoDePagamento`, `registrarRecebimento`, `listarContasAReceber`, `resumoReceber`),
  `plano.ts` (`planoDivergeDoTotal`).
- Leituras de recebíveis filtram a **parcela** por `status` (`PREVISTA`/`PAGA`). → Chave da correção:
  um novo status `CANCELADA` sai dessas leituras **automaticamente**, sem reescrever cada query.
- Dinheiro em centavos (`@/lib/dinheiro`), `tenantPrisma`, padrão de Server Actions/gates.

## 3. Decisões travadas no brainstorming (2026-06-14)

| Tema | Decisão |
|---|---|
| Cancelamento | O gestor **escolhe na hora**: parcelas abertas sempre anuladas; sobre o **pago**, escolhe **manter** (cliente perdeu o sinal) ou **estornar** (devolvi); motivo opcional. |
| Entrada | **Fonte única = parcela nº0 do plano.** Remove `Contrato.entrada`. PDF mostra o plano. |
| Forma de pagamento | **Enum** `FormaPagamento` (PIX, CARTAO_CREDITO, CARTAO_DEBITO, DINHEIRO, BOLETO, TRANSFERENCIA, OUTRO), no contrato (forma combinada) e na parcela (forma do recebimento). |
| Estorno × caixa | Estornar **remove a parcela da receita** (simplificação). Devolução como saída no mês atual = **não-objetivo** (evolução futura). |

## 4. Modelo de dados

- **`enum FormaPagamento`** = `PIX | CARTAO_CREDITO | CARTAO_DEBITO | DINHEIRO | BOLETO | TRANSFERENCIA | OUTRO`.
- **`enum ParcelaStatus`** ganha **`CANCELADA`** (passa a `PREVISTA | PAGA | CANCELADA`).
- **`Contrato.formaPagamento`**: `String?` → `FormaPagamento?`.
- **`Contrato.entrada`**: **removido**.
- **`Contrato.canceladoMotivo`**: `String?` (novo — registra o motivo do cancelamento).
- **`Parcela.formaRecebimento`**: `String?` → `FormaPagamento?`.
- **Migração não-backfillável** (dados texto-livre de demo/teste): a migração **zera**
  `formaPagamento`/`formaRecebimento` antigos (viram `NULL`) antes de trocar o tipo, e **dropa**
  a coluna `entrada`. Sistema em testes, sem backfill (convenção do projeto). O seed-demo passa a
  usar valores do enum.

## 5. Cancelamento — `cancelarContrato` (correção do bug)

`src/lib/contratos/contratos.ts`:
```
type DestinoPago = "manter" | "estornar";
cancelarContrato(lojaId, contratoId, opts: { destinoPago: DestinoPago; motivo?: string }): Promise<ResultadoOp>
```
- Só cancela contrato **ATIVO** (senão `nao_ativo`); `contrato_invalido` se não for da loja.
- Numa transação (`prisma.$transaction`):
  1. `Contrato` → `status: CANCELADO`, `canceladoMotivo: motivo?.trim() || null`.
  2. `Parcela` `status=PREVISTA` do contrato → `CANCELADA`.
  3. Se `destinoPago === "estornar"`: `Parcela` `status=PAGA` do contrato → `CANCELADA`
     (limpa `valorRecebido`/`recebidoEm`/`formaRecebimento`). Se `"manter"`: ficam `PAGA`.
- **Efeito nas leituras (sem alterá-las):** `CANCELADA` não é `PREVISTA` nem `PAGA`, então sai de
  `listarContasAReceber` (abertas/atrasadas/recebidas), `resumoReceber`, `agingDaLoja`,
  `projecaoCaixa` e `dreDoMes`. **Ajuste pontual:** o filtro `"todas"` de `listarContasAReceber`
  (hoje `status: {}`) passa a excluir `CANCELADA` explicitamente, e `listarParcelasDoContrato`
  (detalhe) mostra as canceladas com rótulo "cancelada".
- `comissaoEstornadaEm` e o estorno de comissão (S6) seguem como já são — fora deste escopo.

## 6. Entrada única (parcela nº0 do plano)

- **Remove** `entrada` de `PatchContrato`/`editarContrato` e do form de editar contrato.
- A entrada continua nascendo no **`gerarPlanoDePagamento`** (parcela `numero: 0`, descrição "Entrada"),
  que já valida `entrada ≤ total`. Nenhuma mudança na geração.
- **`dadosParaPdf`** deriva a entrada da parcela nº0 (se houver plano) e passa o **plano completo**
  (entrada + parcelas: descrição, valor, vencimento, forma) para o `pdf.ts`, que passa a renderizar a
  tabela do plano no lugar do par "entrada/forma" solto. Sem plano → PDF sem seção de pagamento (ou
  "a combinar").
- `planoDivergeDoTotal(valorTotal, valoresParcelas)` inalterado, mas `valoresParcelas` passa a vir só
  das parcelas **não-canceladas** (a fonte já é `listarParcelasDoContrato`; filtrar `status != CANCELADA`).

## 7. Forma de pagamento como seleção

- **Validação** (lib): um helper `formaValida(v): v is FormaPagamento` (puro). `editarContrato`
  rejeita `formaPagamento` fora do enum (`forma_invalida`); `registrarRecebimento` idem para `forma`.
- **UI**: o campo `formaPagamento` no form de editar contrato e o campo `forma` na baixa de parcela
  viram `<select>` com os 7 valores (rótulos PT-BR: "Pix", "Cartão de crédito", "Cartão de débito",
  "Dinheiro", "Boleto", "Transferência", "Outro"). Um mapa `ROTULO_FORMA` compartilhado para exibição.
- O detalhe do contrato e o PDF exibem o rótulo PT-BR do enum.

## 8. Testes (TDD)

**Unit puro:** `formaValida` (aceita os 7, rejeita "x"/""); `rotuloForma` mapeia cada valor.

**Integração (Postgres real, `MARK`, `afterAll`):**
- **Cancelamento (regressão do bug):** contrato + plano (1 paga, 2 previstas) → `cancelarContrato`
  com `manter`: previstas saem de `listarContasAReceber`/`resumoReceber`/`agingDaLoja`; a paga
  continua em `dreDoMes` (receita do mês). Com `estornar`: a paga também sai (vira CANCELADA, fora da receita).
- **Entrada:** `gerarPlanoDePagamento` com entrada → `dadosParaPdf` traz a entrada = parcela nº0; sem
  plano → entrada ausente. `editarContrato` **não aceita** mais `entrada` (campo removido).
- **Forma enum:** `editarContrato({ formaPagamento: "PIX" })` ok; `"qualquer"` → `forma_invalida`.
  `registrarRecebimento({ forma: "CARTAO_CREDITO" })` ok; inválida → erro.

## 9. Transversais
- Centavos; `tenantPrisma`; gates `leads:editar` (cancelar/editar) como hoje. Migração destrutiva
  **apenas** sobre dados de teste (sem produção). Após schema: `prisma generate`. Gates verdes antes de commitar.

## 10. Não-objetivos (YAGNI)
- Devolução/estorno como **saída de caixa no mês atual** (estorno apenas remove a receita).
- Máscara/validação de CPF.
- Multi-forma numa mesma parcela; taxas de cartão/maquininha (líquido vs bruto).
- Reabrir contrato cancelado.

## 11. Arquivos (visão macro)
**Modificar:**
- `prisma/schema.prisma` — enum `FormaPagamento`, `ParcelaStatus.CANCELADA`, `Contrato`
  (formaPagamento tipo, +canceladoMotivo, −entrada), `Parcela.formaRecebimento` tipo; migração.
- `src/lib/contratos/contratos.ts` — `cancelarContrato(opts)`, remove entrada de `editarContrato`,
  valida forma, `dadosParaPdf` deriva entrada/plano.
- `src/lib/contratos/pdf.ts` — render do plano de pagamento.
- `src/lib/financeiro/receber.ts` — `registrarRecebimento` valida forma; `listarContasAReceber`
  exclui `CANCELADA` no filtro "todas"; `listarParcelasDoContrato` filtra/rotula cancelada.
- `src/lib/financeiro/forma.ts` (novo) — `FormaPagamento` helpers `formaValida`/`rotuloForma`.
- Telas: `contratos/[contratoId]/page.tsx` (select de forma, diálogo de cancelar, sem campo entrada),
  `contratos/actions.ts` (cancelar com opts), baixa de parcela (select de forma).
- `prisma/seed-demo.ts` — formas como enum; algum contrato cancelado de exemplo.

**Criar:** `src/lib/financeiro/__tests__/forma.test.ts`; casos novos em `contratos.test.ts`/`receber.test.ts`.

## 12. Definição de pronto
Cancelar um contrato com o diálogo (anula abertas, escolhe manter/estornar, motivo) e as parcelas
canceladas somem de contas a receber/cobrança/projeção; forma de pagamento é `<select>` do enum no
contrato e na baixa; a entrada vive só no plano e o PDF mostra o plano; testes de regressão do bug +
enum + entrada verdes; `tsc` limpo e `vitest` verde; commits na `main`.
