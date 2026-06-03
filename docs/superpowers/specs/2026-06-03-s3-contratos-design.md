# Spec S3 — Contratos (persistir + pré-preencher do orçamento)

> **Fatia** do roadmap `2026-06-03-roadmap-comercial-financeiro-comissao-design.md`.
> Fecha a cadeia comercial: o orçamento aprovado (S2) vira **contrato persistido** — a
> VENDA que o Financeiro (S4+) e a Comissão (S6) vão consumir. Tem **migração** e toca a
> **jornada**. Não constrói parcelas/financeiro (S4).

---

## 1. Problema

O contrato hoje é **stateless**: o formulário (`/contratos/novo`) faz POST para um route
que gera um PDF e **não guarda nada** (`contratos/gerar/route.ts`). Tudo é digitado na
mão — inclusive dados que já existem (noiva, vestido, valores do orçamento aprovado,
datas). E nada na cadeia (financeiro, comissão) tem uma "venda" real para se ancorar.

## 2. O que existe hoje

- Formulário manual `/contratos/novo` (campos: noiva, CPF, WhatsApp, vestido, valor,
  entrada, forma de pagamento, datas, observação).
- Route `contratos/gerar` → `gerarContratoPdf(DadosContrato)` (`src/lib/contratos/pdf.ts`).
  Template "provisório" (segue provisório — **fora do escopo refinar**).
- Marco manual `Lead.contratoFechadoEm` (botão no perfil) → etapa `contrato_fechado`.
- S2: `Orcamento` APROVADO com itens, total e desconto; `Contrato.orcamentoId` é o elo.
- Noiva tem reserva (`BloqueioVestido`) com vestido + datas de retirada/devolução (S0.1).

## 3. Escopo

**Dentro:**
- **Migração:** modelo `Contrato`.
- **Data layer:** criar contrato **pré-preenchido** a partir de um orçamento aprovado (ou
  da noiva), editar, cancelar (distrato), obter, listar.
- **Money util compartilhado:** extrair `paraCentavos`/`deCentavos` (hoje em
  `orcamentos.ts`) para `src/lib/dinheiro.ts` e reusar nos dois (corrige a duplicação que
  o review da S2 evitou ampliar).
- **Telas:** `/contratos` (lista) + `/contratos/[id]` (detalhe: dados, editar, baixar
  PDF, cancelar). O `/contratos/novo` manual **dá lugar** ao fluxo pré-preenchido.
- **PDF:** reusar `gerarContratoPdf`, agora dirigido pelo **contrato persistido** (GET
  `/contratos/[id]/pdf`) em vez dos campos do form.
- **Jornada:** `contrato_fechado` passa a derivar de "tem contrato ativo" (marco manual
  aposentado, mantido como legado).

**Fora (YAGNI / outras fatias):**
- **Parcelas / plano de pagamento estruturado** → S4 (aqui valor/entrada/forma ficam como
  hoje: valor + entrada Decimal + forma de pagamento em texto).
- **Comissão** → S6 (o contrato só carimba a venda: `vendedoraId` + competência).
- **Refinar o template do PDF** (segue provisório).
- **Assinatura digital.**

## 4. Migração (schema)

```prisma
enum ContratoStatus { ATIVO CANCELADO }

model Contrato {
  id              String        @id @default(cuid())
  lojaId          String
  leadId          String
  orcamentoId     String?       @unique  // de qual orçamento aprovado nasceu (1:1)
  bloqueioVestidoId String?     // a reserva (vestido + datas), se houver
  vendedoraId     String        // quem vendeu — base da comissão (S6)
  status          ContratoStatus @default(ATIVO)
  // Dados do documento (pré-preenchidos, conferidos pela vendedora)
  cpf             String?
  vestidoDescricao String?      // "Coleção Aurora — A-102" (texto no PDF)
  valorTotal      Decimal       @db.Decimal(10, 2)
  entrada         Decimal?      @db.Decimal(10, 2)
  formaPagamento  String?
  dataCasamento   DateTime?
  dataRetirada    DateTime?
  dataDevolucao   DateTime?
  observacoes     String?
  fechadoEm       DateTime      @default(now()) // data da venda → competência da comissão
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  loja      Loja             @relation(...)
  lead      Lead             @relation(...)
  orcamento Orcamento?       @relation(..., onDelete: SetNull)
  bloqueio  BloqueioVestido? @relation(..., onDelete: SetNull)
  vendedora Usuario          @relation(...)
}
```

> Aditiva (cria tabela/enum; FKs com SetNull onde o contrato deve sobreviver). `cpf`
> mora no `Contrato` (campo legal do documento); não migra o `Lead` agora. Operação de
> banco = **requer confirmação** antes de `prisma migrate`.

## 5. Pré-preenchimento (o coração da fatia)

`criarContratoDeOrcamento(lojaId, orcamentoId, vendedoraId)`:
- Exige orçamento **APROVADO** da loja (senão `orcamento_invalido`/`nao_aprovado`).
- Recusa se o orçamento **já tem contrato** (`orcamentoId @unique` → `ja_tem_contrato`).
- Preenche a partir do orçamento + noiva + reserva:
  - `leadId`, `vendedoraId` (herda do orçamento), `orcamentoId`.
  - `valorTotal` = total do orçamento; `vestidoDescricao` = item VESTIDO do orçamento (ou
    vestido da reserva).
  - `bloqueioVestidoId` e `dataCasamento` = da reserva da noiva (casada pelo VESTIDO do
    item do orçamento — a noiva pode ter várias reservas); `dataCasamento` cai para
    `Lead.casamentoData`.
  - `dataRetirada`/`dataDevolucao` **não** são pré-preenchidas: o `BloqueioVestido` só
    guarda as datas REAIS de movimentação (nulas na assinatura). A vendedora preenche as
    datas previstas à mão no detalhe.
- A vendedora **confere e ajusta** o que faltar (CPF, forma de pagamento, entrada) no
  detalhe.

Também `criarContratoDaNoiva(lojaId, leadId, vendedoraId)` para o caso sem orçamento
(começa com valorTotal 0/em branco, a preencher) — caminho de fallback.

## 6. Data layer (`src/lib/contratos/contratos.ts` — novo)

```ts
criarContratoDeOrcamento(lojaId, orcamentoId, vendedoraId): { ok; contratoId } | { ok:false; motivo }
criarContratoDaNoiva(lojaId, leadId, vendedoraId): { ok; contratoId } | { ok:false; motivo }
editarContrato(lojaId, contratoId, patch): Resultado   // só ATIVO
cancelarContrato(lojaId, contratoId): Resultado        // distrato → CANCELADO
obterContrato(lojaId, contratoId): ContratoDetalhe | null   // + dados p/ o PDF
listarContratosDaLoja(lojaId, { status? }): ContratoResumo[]
listarContratosDaNoiva(lojaId, leadId): ContratoResumo[]
dadosParaPdf(lojaId, contratoId): DadosContrato | null      // monta o DadosContrato do pdf.ts
```

- Dinheiro via o util compartilhado (`src/lib/dinheiro.ts`). Tudo `tenantPrisma`.
- `editarContrato` só em `ATIVO`; CANCELADO é read-only.

## 7. Jornada

- Fato novo `temContrato` = existe `Contrato` com status `ATIVO`.
- `contrato_fechado` satisfaz-se com `temContrato || contratoFechadoEm !== null` (deriva do
  contrato real; marco manual vira legado). `marcarContratoFechadoAction` é **aposentada**
  (como a de orçamento na S2).
- `INCLUDE_JORNADA` ganha `contratos: { select: { status: true } }`; `fatosDeLead` ganha o
  fato (painel reusa).

## 8. Telas

- **`/contratos`** (lista): contratos por status (ativos/cancelados), com noiva, valor,
  data. Gate ver=`leads:ver`.
- **`/contratos/[id]`** (detalhe): dados do contrato (editáveis em ATIVO), **Baixar PDF**,
  **Cancelar** (distrato com confirmação). Mutar=`leads:criar` (mesmo gate do gerar atual).
- **Gancho:** no detalhe do **orçamento APROVADO** (S2), botão "Gerar contrato" →
  `criarContratoDeOrcamento` → leva ao detalhe pré-preenchido. E no **perfil da noiva**,
  "Gerar contrato" (de orçamento aprovado, se houver; senão em branco).
- **`/contratos/novo`** (form manual atual): aposentado/redirecionado — o contrato nasce
  pré-preenchido, não da digitação em branco. *(ver §10, decisão 3)*
- **PDF:** GET `/contratos/[id]/pdf` lê o contrato persistido → `gerarContratoPdf`.

## 9. PDF

Reusar `gerarContratoPdf(DadosContrato)` sem mudar o template (provisório). `dadosParaPdf`
mapeia o `Contrato` persistido para `DadosContrato`. O route vira **GET por id**
(idempotente, baixa o PDF do contrato salvo), substituindo o POST stateless.

## 10. Decisões a confirmar (pontos seus)

1. **CPF no Contrato** (campo do documento) — *recomendo*; ou adicionar ao cadastro da
   noiva (Lead) para reaproveitar? *(Contrato agora; Lead.cpf fica para uma fatia de
   cadastro, se quiser.)*
2. **Jornada `contrato_fechado`** deriva de "tem contrato ATIVO" e **aposenta o botão
   manual** (marco vira legado) — *recomendo*, igual fizemos com orçamento na S2.
3. **`/contratos/novo` manual**: aposentar (contrato nasce do orçamento/noiva), deixando
   o caminho "em branco" via `criarContratoDaNoiva` — *recomendo*. Ou manter o form manual
   também?
4. **Status**: `ATIVO`/`CANCELADO` (permite distrato), contrato_fechado conta só ATIVO —
   *recomendo*. Ou contrato sem status (sempre firme)?

## 11. Testes

- **Money util** (`dinheiro.test.ts`): mover/garantir os casos do parser (incl. o
  `"1.234"` = milhar e vazio/negativo do review S2).
- **Data layer** (`contratos.test.ts`): criar de orçamento aprovado pré-preenche
  (valor/vestido/datas); recusa orçamento não-aprovado; recusa duplicar contrato do mesmo
  orçamento; editar só em ATIVO; cancelar; isolamento de loja; `dadosParaPdf` mapeia certo.
- **Jornada**: noiva com contrato ATIVO → `contrato_fechado`; cancelado regride (a menos
  do marco legado).

## 12. Plano (fatias finas, commit na `main`)

1. Extrair `src/lib/dinheiro.ts` + reusar em orçamentos **+ testes** (refactor verde).
2. Migração + `prisma generate` (após confirmação).
3. Data layer (criar/pré-preencher/editar/cancelar/pdf) **+ testes** (TDD).
4. Jornada: fato `temContrato` **+ testes**.
5. Telas: lista, detalhe, ganchos (orçamento aprovado/perfil), GET do PDF.
6. Verificação (orçamento aprovado → gerar contrato → conferir/baixar PDF; jornada) e
   gates verdes.

## 13. Riscos

- **Migração** em banco com dados (aditiva; confirmar ambiente).
- **PDF via GET**: garantir que o gate de permissão e o tenant continuam (não vazar PDF de
  outra loja por id).
- **`orcamentoId @unique`**: a corrida de "gerar contrato 2×" do mesmo orçamento é barrada
  pelo índice único (P2002 → `ja_tem_contrato`).
- **Refactor do dinheiro**: o util compartilhado não pode mudar o comportamento já testado
  da S2 (mesmos casos no `dinheiro.test.ts`).

## 14. Definição de pronto

De um orçamento aprovado, a vendedora **gera um contrato pré-preenchido**, confere/ajusta,
e **baixa o PDF** do contrato salvo; a jornada reflete **Contrato fechado**; o contrato
fica como a venda que o Financeiro/Comissão vão consumir; data layer e jornada cobertos
por testes; gates verdes.
