# Spec S2 — Orçamentos (registrar a negociação)

> **Fatia** do roadmap `2026-06-03-roadmap-comercial-financeiro-comissao-design.md`.
> Continua a cadeia comercial depois da **S1 (Atendimentos)**. Tem **migração** e toca a
> **jornada**. Não constrói contrato (S3) nem financeiro.

---

## 1. Problema

A negociação com a noiva vive **na cabeça da vendedora**. Hoje só existe um marco manual
solto (`Lead.orcamentoAbertoEm`, ligado por um botão) e um teto guardado
(`LeadInteresse.tetoOrcamento`). Não há **itens**, **valores**, **desconto negociado**,
**versões** nem **status**. E o contrato (S3) precisa de uma base de valores real para se
pré-preencher. O orçamento é onde a negociação feita **durante o atendimento** fica
gravada.

## 2. O que existe hoje

- `Lead.orcamentoAbertoEm` (marco manual) + `LeadInteresse.tetoOrcamento` (teto).
- Jornada: etapa `orcamento_aberto` derivada de `orcamentoAbertoEm !== null`.
- `Vestido.precoBase` `Decimal(10,2)`; dinheiro entra como **string** e é normalizado
  por `parsePreco` → `toFixed(2)` (`src/lib/vestidos/vestidos.ts`). **Reusar esse padrão.**
- S1 deixou o gancho: `Atendimento.desfecho = RESERVOU` + link ao perfil da noiva.

## 3. Escopo

**Dentro:**
- **Migração:** modelos `Orcamento` + `OrcamentoItem` (+ enums).
- **Data layer:** criar orçamento (a partir da noiva/atendimento), adicionar/remover/editar
  item, definir desconto, mudar status (enviar/aprovar/recusar), listar por noiva e por
  loja, total derivado.
- **Telas:** `/orcamentos` (lista da loja) + detalhe do orçamento (itens, desconto,
  total, status). Botão de abrir orçamento **a partir do atendimento** (S1) e do **perfil
  da noiva**.
- **Jornada:** `orcamento_aberto` passa a derivar de "tem orçamento" (não só do marco
  manual).

**Fora (YAGNI / outras fatias):**
- **Contrato** e pré-preenchimento → **S3**.
- **Reserva do vestido**: um item tipo VESTIDO referencia `vestidoId` só para **preço**;
  **não** cria `BloqueioVestido`. A reserva segue seu fluxo (perfil da noiva); o contrato
  (S3) é quem amarra orçamento aprovado + reserva. *(ver §8.3)*
- **Financeiro/parcelas** → S4+ (o plano de pagamento nasce do contrato, não do orçamento).
- PDF do orçamento (o contrato é que vira PDF; orçamento é interno).

## 4. Migração (schema)

```prisma
enum OrcamentoStatus {
  RASCUNHO   // em edição
  ENVIADO    // apresentado à noiva
  APROVADO   // aceito — base do contrato (trava edição)
  RECUSADO   // recusado (terminal)
}

enum OrcamentoItemTipo {
  VESTIDO    // referencia um Vestido (preço-base como sugestão)
  SERVICO    // véu, acessório, taxa…
  AJUSTE     // customização/costura cobrada
}

model Orcamento {
  id            String          @id @default(cuid())
  lojaId        String
  leadId        String
  atendimentoId String?         // de qual atendimento nasceu (S1), se houver
  vendedoraId   String          // quem negociou — semente da atribuição de comissão
  status        OrcamentoStatus @default(RASCUNHO)
  descontoTipo  DescontoTipo?   // PERCENTUAL | VALOR
  descontoValor Decimal?        @db.Decimal(10, 2)
  validade      DateTime?
  observacoes   String?         // a conversa: contraproposta, condições combinadas
  aprovadoEm    DateTime?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  loja        Loja          @relation(...)
  lead        Lead          @relation(...)
  atendimento Atendimento?  @relation(...)
  vendedora   Usuario       @relation(...)
  itens       OrcamentoItem[]
}

model OrcamentoItem {
  id           String            @id @default(cuid())
  lojaId       String            // carimbo p/ tenantPrisma (como Prova/Ajuste)
  orcamentoId  String
  tipo         OrcamentoItemTipo
  vestidoId    String?
  descricao    String
  valorUnitario Decimal          @db.Decimal(10, 2)
  quantidade   Int               @default(1)

  loja      Loja      @relation(...)
  orcamento Orcamento @relation(..., onDelete: Cascade)
  vestido   Vestido?  @relation(...)
}

enum DescontoTipo { PERCENTUAL VALOR }
```

> Aditiva (cria tabelas/enums; não altera dados existentes). Operação de banco =
> **requer confirmação** (CLAUDE.md) antes de `prisma migrate`.

## 5. Dinheiro (regra)

- Persistência em `Decimal(10,2)`; na borda viaja como **string** e é normalizada com o
  mesmo `parsePreco`/`toFixed(2)` dos vestidos (centavos exatos, sem float).
- **Total derivado** (não persistido): `soma(valorUnitario × quantidade) − desconto`.
  Desconto PERCENTUAL aplica sobre o subtotal; VALOR subtrai direto. Total nunca < 0
  (piso em 0). Cálculo no data layer, devolvendo `{ subtotal, desconto, total }` como
  strings normalizadas.

## 6. Data layer (`src/lib/orcamentos/orcamentos.ts` — novo módulo)

Retornos discriminados no padrão da casa.

```ts
criarOrcamento(lojaId, { leadId, atendimentoId?, vendedoraId }): { ok; orcamentoId } | { ok:false; motivo }
adicionarItem(lojaId, orcamentoId, { tipo, vestidoId?, descricao, valorUnitario, quantidade }): Resultado
editarItem(lojaId, itemId, patch): Resultado
removerItem(lojaId, itemId): void
definirDesconto(lojaId, orcamentoId, { tipo, valor } | null): Resultado
mudarStatus(lojaId, orcamentoId, novo): Resultado   // transições válidas (ver §7)
listarOrcamentosDaNoiva(lojaId, leadId): OrcamentoResumo[]
listarOrcamentosDaLoja(lojaId, { status? }): OrcamentoResumo[]
obterOrcamento(lojaId, orcamentoId): OrcamentoDetalhe | null   // itens + totais
```

- Tudo `tenantPrisma`. Itens só editáveis enquanto o orçamento **não** está APROVADO/
  RECUSADO (§7). `criarOrcamento` valida que `leadId` (e `atendimentoId`, se vier) são da
  loja.

## 7. Status (ciclo de vida)

```
RASCUNHO → ENVIADO → APROVADO   (aprovadoEm carimbado; trava edição de itens/desconto)
   └──────────────→ RECUSADO    (terminal)
RASCUNHO ←→ ENVIADO             (pode voltar p/ rascunho enquanto negocia)
```
- Editar item/desconto só em RASCUNHO ou ENVIADO. APROVADO e RECUSADO são finais para
  edição. Transição inválida → `transicao_invalida`.
- **APROVADO** é o que a S3 (Contrato) vai consumir para pré-preencher valores.

## 8. Decisões a confirmar (pontos seus)

1. **Desconto:** por **orçamento** (um desconto PERCENTUAL ou VALOR no total), como acima
   — ou desconto **por item**? *(Recomendo por orçamento: é a negociação real "fecho por
   X"; mais simples.)*
2. **Jornada `orcamento_aberto`:** passar a derivar de **"tem orçamento não-recusado"**
   (mantendo `orcamentoAbertoEm` como compatibilidade), e **aposentar o botão manual**
   de marcar orçamento? *(Recomendo derivar do orçamento real e parar de usar o botão; o
   marco manual vira legado, sem migração destrutiva agora.)*
3. **Reserva × orçamento:** em S2 o item VESTIDO é só **preço/escolha** (não reserva a
   peça); a reserva continua no fluxo atual e o **contrato (S3)** amarra os dois. Ok?
   *(Recomendo sim — evita acoplar cedo.)*
4. **Onde abrir:** em S2, criar orçamento a partir do **perfil da noiva** e do
   **atendimento** (botão "Abrir orçamento" quando EM_ATENDIMENTO/RESERVOU). A tela
   `/orcamentos` lista e abre o detalhe. Ok? *(Recomendo sim.)*

## 9. Telas

- **`/orcamentos`** (lista da loja): orçamentos por status (rascunho/enviado/aprovado/
  recusado), com noiva, total e data. Filtro por status. Gate ver=`leads:ver`.
- **Detalhe** `/orcamentos/[id]`: itens (add/editar/remover), desconto, **total**,
  observações da negociação, e os botões de status (Enviar/Aprovar/Recusar). Mutar=
  `leads:editar`. Em APROVADO/RECUSADO a edição some (read-only).
- **Gancho:** botão "Abrir orçamento" no perfil da noiva e no atendimento (S1) →
  `criarOrcamento` → leva ao detalhe.
- Tom Concierge: "Orçamento da {noiva}", linguagem humana, bordô só na ação principal
  (Aprovar). Sem tabela hostil — itens como linhas calmas.

## 10. Jornada

- Fato novo `temOrcamento` = existe `Orcamento` com status ≠ RECUSADO.
- `orcamento_aberto` passa a satisfazer-se com `temOrcamento || orcamentoAbertoEm !== null`
  (deriva do orçamento real; o marco manual fica como compatibilidade/legado).
- `fatosDeLead` (fonte única já extraída na S1) ganha o fato; `INCLUDE_JORNADA` inclui
  `orcamentos: { select: { status: true } }`. O painel reusa automaticamente.

## 11. Testes

- **Data layer** (`orcamentos.test.ts`): criar; add/editar/remover item; total com
  desconto PERCENTUAL e VALOR (e piso 0); transições de status válidas/ inválidas;
  trava de edição em APROVADO; isolamento de loja; validação de lead/atendimento da loja.
- **Jornada**: noiva com orçamento (não recusado) → etapa `orcamento_aberto`; recusado
  **não** mantém a etapa (a menos que o marco legado esteja setado).

## 12. Plano (fatias finas, commit na `main`)

1. Migração + `prisma generate` (após confirmação).
2. Data layer (CRUD + totais + status) **+ testes** (TDD).
3. Jornada: fato `temOrcamento` + derivação **+ testes**.
4. Telas: lista, detalhe, ganchos (perfil/atendimento) + Server Actions.
5. Verificação (atender → abrir orçamento → itens/desconto → aprovar; conferir jornada) e
   gates verdes.

## 13. Riscos

- **Dinheiro/arredondamento:** centavos exatos com Decimal; desconto percentual arredonda
  no fim. Cobrir bordas no teste.
- **Migração** em banco com dados (aditiva, mas confirmar ambiente).
- **Marco manual legado:** ao derivar do orçamento, garantir que noivas antigas com
  `orcamentoAbertoEm` setado **não regridam** (a condição OR cuida disso).

## 14. Definição de pronto

A vendedora abre um orçamento (do atendimento ou do perfil), adiciona itens e desconto, vê
o total, e muda o status até **Aprovado**; a jornada reflete **Orçamento aberto**; o
orçamento aprovado fica pronto para o contrato (S3) consumir; data layer e jornada
cobertos por testes; gates verdes.
