# Spec — Contrato da reserva: vincula a reserva e herda o valor do orçamento (Fatia 1.5)

> Data: 2026-06-15. Decorre do grill da Reserva multi-item. **Depende da Fatia 1** (cabeça
> `Reserva` precisa existir). Decisão arquitetural registrada em
> `docs/adr/0002-contrato-referencia-reserva-e-herda-valor-do-orcamento.md`.

## 1. Problema

Dois defeitos, conectados, no `Contrato` (a venda persistida, base de comissão S6 e parcelas):

1. **Contrato cobre um vestido só.** `Contrato.bloqueioVestidoId` aponta para **um** `BloqueioVestido`.
   Com a Reserva multi-item (a noiva leva N vestidos), o contrato deveria cobrir a **reserva inteira**.
2. **Valor enganoso na porta "da noiva".** `criarContratoDeOrcamento` já usa o total do orçamento
   (correto), mas `criarContratoDaNoiva` (fallback sem orçamento) grava **`valorTotal = "0.00"`**. O
   contrato deveria **sempre** carregar o **valor orçado para aquela noiva**, nunca um zero-padrão.

## 2. Decisão (ADR 0002)

Encadeamento canônico: **Orçamento (valor negociado) → Reserva (peças guardadas) → Contrato
(formaliza: aponta para a reserva + herda o valor do orçamento).**

1. `Contrato` ganha **`reservaId String?`** (FK → `Reserva`). Os vestidos do contrato são os **itens
   da reserva**. `bloqueioVestidoId` fica **deprecado** (mantido p/ contratos antigos; sem migração
   destrutiva).
2. **O valor sempre vem do orçamento aprovado.** Nenhuma porta grava `0.00`:
   - do orçamento: `valorTotal` = total do orçamento (como hoje) + anexa a reserva;
   - da noiva: acha o **orçamento APROVADO mais recente** da noiva e herda dele (valor + reserva +
     descrição). Sem orçamento aprovado → **recusa** `sem_orcamento_aprovado` (não nasce com `0.00`).

## 3. Modelo de dados

### 3.1 `Contrato.reservaId`
```prisma
  reservaId String?
  reserva   Reserva? @relation(fields: [reservaId], references: [id], onDelete: SetNull)
```
- `SetNull` (não Cascade): apagar/cancelar a reserva **não** apaga o contrato (a venda persiste; é o
  mesmo critério do `bloqueioVestidoId` atual, que é `SetNull`). `Reserva` ganha `contratos Contrato[]`.
- `bloqueioVestidoId` permanece (deprecado). Os dois coexistem: contratos novos usam `reservaId`;
  antigos seguem com `bloqueioVestidoId`.

### 3.2 Migração (hand-authored + `migrate deploy`)
1. `ALTER TABLE "Contrato" ADD COLUMN "reservaId" TEXT` + FK `SetNull`.
2. **Backfill:** contratos com `bloqueioVestidoId` recebem `reservaId` = o `reservaId` daquele bloqueio
   (a cabeça que ele passou a integrar no backfill da Fatia 1):
   ```sql
   UPDATE "Contrato" c SET "reservaId" = b."reservaId"
   FROM "BloqueioVestido" b
   WHERE c."bloqueioVestidoId" = b."id" AND b."reservaId" IS NOT NULL;
   ```
3. Aditiva. Depois: `npx prisma generate`.

## 4. Camada de dados (`src/lib/contratos/contratos.ts`)

### 4.1 `criarContratoDeOrcamento` — anexa a reserva
Hoje casa um `bloqueio` por vestido e grava `bloqueioVestidoId`. Passa a também resolver a **cabeça
`Reserva`** da noiva para a data do orçamento e gravar `reservaId`:
- Buscar as reservas da noiva (`listarReservasDaNoiva` **da cabeça**, de `@/lib/reservas/reservas`).
- Escolher a reserva `CONFIRMADA` cujo `casamentoData` casa com o do orçamento; se o orçamento tem item
  VESTIDO, preferir a reserva que **contém** esse vestido. Sem match → `reservaId = null` (degrada
  suave, valor segue do orçamento).
- `vestidoDescricao` = vestidos da reserva juntos (`"cod · nome; cod · nome"`); fallback ao item do
  orçamento como hoje. `valorTotal` segue = total do orçamento. `bloqueioVestidoId` continua sendo
  setado (compat) quando houver match de vestido único.

### 4.2 `criarContratoDaNoiva` — herda do orçamento aprovado (fim do `0.00`)
Reescrever: em vez de `valorTotal: "0.00"`, achar o **orçamento APROVADO mais recente** da noiva
(`listarOrcamentosDaNoiva` filtrando `status === "APROVADO"`, o mais novo) e **delegar a
`criarContratoDeOrcamento(lojaId, orcamento.id)`** — reusa valor + reserva + descrição. Se a noiva
**não tem** orçamento aprovado → `{ ok: false, motivo: "sem_orcamento_aprovado" }`.
- `ResultadoCriar` ganha o motivo `"sem_orcamento_aprovado"`.
- Assinatura segue `(lojaId, leadId, vendedoraId)`. Quando delegar, o `vendedoraId` do contrato vem do
  orçamento (quem negociou — semente da comissão), não do parâmetro; o parâmetro segue validado como
  vínculo da loja (defesa).

## 5. Telas

- **`/loja/[id]/contratos/novo` + `gerarContratoDaNoivaAction`** (`contratos/actions.ts`): tratar o novo
  motivo `sem_orcamento_aprovado` com aviso gentil ("Aprove um orçamento desta noiva antes de gerar o
  contrato.") e link para os orçamentos dela. Sem mais contrato a `0.00`.
- **Detalhe do contrato** (`contratos/[contratoId]/page.tsx`): onde mostra o vestido, listar os
  **vestidos da reserva** (via `reservaId`) quando houver; fallback a `vestidoDescricao`/`bloqueio`
  para contratos antigos. Sem mudança de regra/rota.

## 6. O que NÃO muda
- **Comissão (S6) e parcelas**: derivam de `valorTotal` — agora sempre o total do orçamento, em ambas
  as portas. Nenhuma mudança de cálculo; só param de existir contratos a `0.00`.
- **Datas de retirada/devolução do contrato**: seguem do contrato como um todo; a movimentação **por
  peça** continua em cada item da reserva (`BloqueioVestido`). Não se unificam (ADR 0002).
- `editarContrato`/`cancelarContrato`/PDF: inalterados (o PDF lê `vestidoDescricao`/datas do contrato).

## 7. Testes (vitest, Prisma real)
Em `src/lib/contratos/__tests__/contratos.test.ts` (ajustar fixtures p/ criar uma `Reserva`
CONFIRMADA com itens):
1. `criarContratoDeOrcamento` grava `reservaId` da reserva confirmada da noiva + `valorTotal` = total.
2. `criarContratoDaNoiva` **com** orçamento aprovado → herda valor (> 0) e `reservaId`; **sem** orçamento
   aprovado → `{ ok: false, motivo: "sem_orcamento_aprovado" }` (e **nenhum** contrato a `0.00`).
3. Backfill: contrato antigo com `bloqueioVestidoId` ganha `reservaId` da cabeça correspondente.

**Regressão:** `contratos.test.ts` (os casos que hoje esperam contrato da-noiva com valor 0 precisam ser
**reescritos** para o novo contrato: criar orçamento aprovado antes), `financeiro/__tests__/receber.test.ts`
(usa `criarContratoDaNoiva` — ajustar para ter orçamento aprovado), comissão. `tsc` limpo + suíte verde
= gate de cada commit.

## 8. Fora de escopo
- Aprovar um orçamento **criar/confirmar a reserva** automaticamente (acoplamento orçamento→reserva) —
  a reserva segue sendo montada à mão (Fatia 1). O contrato só **referencia** a reserva existente.
- Um contrato cobrir reservas de **datas diferentes** (não acontece: reserva é por casamento).
- Acessórios no valor (Fatia 2).
