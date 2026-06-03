# Spec S4 — Contas a receber (parcelas do contrato)

> **Fatia** do roadmap `2026-06-03-roadmap-comercial-financeiro-comissao-design.md`.
> Início do **Financeiro**. O plano de pagamento nasce do **contrato** (S3). Tem
> **migração**. **Não** toca a jornada da noiva (financeiro é pós-contrato).

---

## 1. Problema

O contrato (S3) guarda `valorTotal`, `entrada` e `formaPagamento` (texto livre), mas não
há **plano de pagamento** estruturado: nada de parcelas, vencimentos, nem controle do que
foi recebido / está em atraso. Sem isso o atelier não sabe **quanto tem a receber** nem
**de quem**.

## 2. O que existe hoje

- `Contrato` ATIVO com `valorTotal` / `entrada` (Decimal) e `formaPagamento` (texto).
- `src/lib/dinheiro.ts` (parser/centavos compartilhado).
- Sidebar **Financeiro → Contas a receber** (`/financeiro/receber`) hoje **404**, gate
  provisório `podeVerNoivas` (TODO no `nav-items.ts`).

## 3. Escopo

**Dentro:**
- **Migração:** modelo `Parcela` (a conta a receber).
- **Data layer:** gerar plano de parcelas a partir do contrato; ajustar (add/editar/
  remover) parcela; **registrar recebimento** / estornar; listar (por contrato e por
  loja); resumo.
- **Telas:** `/financeiro/receber` (carteira da loja: a receber / atrasadas / recebidas +
  resumo) e seção **Plano de pagamento** no detalhe do contrato (gerar + dar baixa).
- Dinheiro pelo util compartilhado.

**Fora (YAGNI / outras fatias):**
- **Contas a pagar / folha** → S5; **Fluxo de caixa** → S7; **Comissão** → S6.
- **Pagamento parcial** de uma parcela (PARCIAL) → depois; aqui a baixa é **integral** por
  parcela (ver §10.3).
- Conciliação bancária, boletos, integração de cobrança.
- Permissão dedicada `financeiro` → fatia de permissões (ver §10.4).
- Jornada da noiva (financeiro não move etapa).

## 4. Migração (schema)

```prisma
enum ParcelaStatus { PREVISTA PAGA }   // ATRASADA é DERIVADO (vencido + PREVISTA)

model Parcela {
  id              String        @id @default(cuid())
  lojaId          String
  contratoId      String
  numero          Int           // 0 = entrada/sinal; 1..N parcelas
  descricao       String?       // "Entrada", "Parcela 2/3"…
  valorPrevisto   Decimal       @db.Decimal(10, 2)
  vencimento      DateTime
  status          ParcelaStatus @default(PREVISTA)
  valorRecebido   Decimal?      @db.Decimal(10, 2)
  recebidoEm      DateTime?
  formaRecebimento String?      // "Pix", "Dinheiro", "Cartão"…
  createdAt       DateTime      @default(now())

  loja     Loja     @relation(...)
  contrato Contrato @relation(..., onDelete: Cascade)
}
```

> Aditiva. `Contrato` ganha a relação inversa `parcelas Parcela[]`. `Parcela` em
> `TENANT_MODELS`. Operação de banco = **requer confirmação** antes de `prisma migrate`.

## 5. Geração do plano (o coração)

`gerarPlanoDePagamento(lojaId, contratoId, input)` onde input =
`{ entrada?: string, numParcelas: number, primeiroVencimento: string, periodicidadeDias?: number }`
(periodicidade padrão 30):

1. Exige contrato **ATIVO** da loja; recusa se **já houver parcelas** (evita duplicar —
   para refazer, limpar antes).
2. `total` = `contrato.valorTotal` (centavos). `entradaC` = entrada (0 se ausente).
   `restanteC` = total − entrada. Recusa se entrada > total.
3. Gera, em centavos:
   - se entrada > 0 → **Parcela 0 "Entrada"**, vencimento = `primeiroVencimento`.
   - `numParcelas` parcelas iguais de `floor(restante / n)`, a **última absorve o resto**
     (sem drift de centavo); vencimentos espaçados por `periodicidadeDias` a partir do
     primeiro vencimento (ou +periodicidade se houver entrada na data inicial).
4. A soma das parcelas **bate exatamente** o `valorTotal` (invariante testada).

> O `formaPagamento` (texto do contrato) continua como nota; o plano estruturado é o que
> vale para o financeiro. Não tentamos parsear o texto livre.

## 6. Data layer (`src/lib/financeiro/receber.ts` — novo)

```ts
gerarPlanoDePagamento(lojaId, contratoId, input): { ok } | { ok:false; motivo }
adicionarParcela(lojaId, contratoId, { descricao?, valorPrevisto, vencimento }): Resultado
editarParcela(lojaId, parcelaId, patch): Resultado      // só PREVISTA
removerParcela(lojaId, parcelaId): Resultado            // só PREVISTA
registrarRecebimento(lojaId, parcelaId, { valor, data, forma }): Resultado  // PREVISTA → PAGA
estornarRecebimento(lojaId, parcelaId): Resultado        // PAGA → PREVISTA (limpa)
listarParcelasDoContrato(lojaId, contratoId): ParcelaView[]   // com `atrasada` derivado
listarContasAReceber(lojaId, { filtro }): ContaReceberView[]  // filtro: abertas|atrasadas|recebidas|todas
resumoReceber(lojaId): { totalAReceber; recebidoTotal; emAtraso }   // strings BRL/centavos
```

- Tudo `tenantPrisma`. `ATRASADA` nunca é gravado: `atrasada = status==="PREVISTA" &&
  vencimento < hoje` (derivado na leitura, como a jornada).
- `registrarRecebimento`: valor default = `valorPrevisto`; grava `valorRecebido`,
  `recebidoEm`, `formaRecebimento`, status PAGA. Só de PREVISTA.

## 7. Telas

- **`/financeiro/receber`** (carteira da loja): cards de **resumo** (a receber · recebido
  · em atraso), filtro **Abertas / Atrasadas / Recebidas / Todas**, lista com noiva,
  contrato, vencimento, valor e status; **registrar recebimento** inline (valor + forma).
  Atrasadas em bordô (atenção). Gate ver=`leads:ver`, mutar=`leads:editar`.
- **Detalhe do contrato** → seção **Plano de pagamento**: se não há parcelas, form **Gerar
  plano** (entrada, nº de parcelas, primeiro vencimento, periodicidade); se há, lista as
  parcelas com **dar baixa / estornar** e o total do plano vs total do contrato.
- Tom Concierge: "A receber", linguagem humana; bordô só na atenção (atraso) e na ação
  principal (registrar recebimento).

## 8. Resumo / atraso

- **A receber** = soma dos `valorPrevisto` das parcelas PREVISTA.
- **Recebido** = soma dos `valorRecebido` das PAGA.
- **Em atraso** = soma das PREVISTA com `vencimento < hoje`.
- Datas na convenção meia-noite UTC (São Paulo), como o resto do sistema.

## 9. Permissão (decisão §10.4)

Reusar `leads:ver` (carteira) e `leads:editar` (gerar plano, dar baixa) — **igual ao gate
provisório que já cobre o Financeiro na sidebar**. Um módulo `financeiro` dedicado (dado
sensível) fica para uma fatia de permissões.

## 10. Decisões a confirmar (pontos seus)

1. **Geração do plano** por parâmetros (entrada + nº parcelas + 1º vencimento +
   periodicidade), parcelas iguais com a última absorvendo o resto — *recomendo*. (Não
   parsear o `formaPagamento` em texto.)
2. **ATRASADA derivado** (não persistido) — *recomendo*.
3. **Baixa integral** por parcela agora (sem pagamento parcial/PARCIAL) — *recomendo*;
   parcial entra depois se precisar.
4. **Permissão**: reusar `leads` por enquanto; módulo `financeiro` dedicado depois —
   *recomendo*.

## 11. Testes

- **Data layer** (`receber.test.ts`): gerar plano com/sem entrada → soma das parcelas =
  valorTotal (incl. caso com resto de centavo, ex.: 1000 / 3); recusa entrada > total;
  recusa gerar 2× (já tem parcelas); registrar recebimento (PREVISTA→PAGA) e estornar;
  editar/remover só PREVISTA; `atrasada` derivado (vencimento passado + PREVISTA);
  `resumoReceber` (a receber / recebido / atraso); isolamento de loja.
- **Sem mudança na jornada** (não há fato novo).

## 12. Plano (fatias finas, commit na `main`)

1. Migração + `prisma generate` (após confirmação) + registrar `Parcela` no tenant.
2. Data layer (gerar/ajustar/baixar/listar/resumo) **+ testes** (TDD).
3. Telas: `/financeiro/receber` + seção no detalhe do contrato + Server Actions.
4. Verificação (contrato → gerar plano → dar baixa → carteira/resumo) e gates verdes.

## 13. Riscos

- **Arredondamento** na divisão das parcelas: aritmética em centavos, última parcela
  absorve o resto; invariante "soma = total" testada.
- **Migração** em banco com dados (aditiva; confirmar ambiente).
- **Gate provisório `leads`**: financeiro fica visível a quem vê noivas — compromisso
  conhecido até o módulo dedicado.
- **Regerar plano**: bloqueado se já há parcelas; refazer exige remover as PREVISTA antes
  (parcelas PAGA não são apagadas em silêncio).

## 14. Definição de pronto

De um contrato ativo, o gerente **gera o plano de parcelas** (soma batendo o total),
**registra recebimentos** e vê a **carteira** da loja (a receber / atrasadas / recebidas)
com resumo; data layer coberto por testes; gates verdes.
