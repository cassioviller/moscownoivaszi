# Trilho comercial — Fechar contrato num clique (+ desconto e itens na UI)

> **Tipo:** spec de design (brainstorming → writing-plans). **Data:** 2026-06-29.
> **Origem:** roteiros de jornada por módulo (`docs/roteiros/2026-06-29/`), tema "trilho comercial".
> **Decisões travadas com o dono:** comissão por faixas (sem comissão ansiosa); escopo = tema
> comercial completo; abordagem atômica com `montarPlano` puro; gate do um-clique = `leads:criar`.

## 1. Problema

Fechar uma venda hoje exige **3+ cliques cruzando 2 telas**:

1. No orçamento: **Aprovar** (`mudarStatus → APROVADO`).
2. No orçamento: **Gerar contrato** (`criarContratoDeOrcamento` — cria só o contrato, sem parcelas).
3. No contrato: **Gerar plano** de parcelas (`gerarPlanoDePagamento`).

Além disso, duas funcionalidades estão **prontas na lib mas invisíveis na UI**:

- **Desconto** (`definirDesconto` + `definirDescontoAction`) — nenhum form é renderizado no detalhe do
  orçamento (`orcamentos/[orcamentoId]/page.tsx`).
- **Itens de SERVICO/AJUSTE e quantidade** — `adicionarItem`/`editarItem` (e as actions) já aceitam
  `tipo` e `quantidade`, mas a UI só adiciona `VESTIDO` (via "Vestidos indicados"), sempre qtd 1, e o
  form de editar só mexe no valor.

O commit `3dc75e6` ("cart + contract closing", 2026-06-27) entregou o fechar-contrato atômico **só nos
artefatos Vite** (`artifacts/api-server/src/routes/orcamentos.ts:182`); o app Next nunca recebeu.

### Por que o port não é cópia literal do Vite

- **Comissão:** o Vite cria a comissão **ansiosa** (ContaPagar COMISSAO, % fixo de 5%) no fechamento.
  O Next tem um **motor por faixas/degraus** (`financeiro/comissao.ts`) que calcula no fechamento mensal
  (`fecharCompetencia`), derivando dos contratos por `Contrato.fechadoEm`. Criar o contrato **já alimenta
  esse motor**. Portar a comissão ansiosa **contaria em dobro**. → O fechar-contrato do Next **não** cria
  comissão; deixa para `fecharCompetencia`.
- **Jornada:** o Vite seta `Lead.etapa = CONTRATO_FECHADO`. No Next a jornada é **derivada** (existir
  contrato ⇒ estágio `contrato_fechado` via `temContrato`); `Lead.etapa` é resíduo. → Não setar `etapa`.
- **Raw SQL:** o Vite usa SQL cru, **proibido** em tabelas de tenant no Next (canário anti-raw em
  `src/lib/__tests__/tenant.test.ts`). → Tudo via Prisma/`tenantPrisma` e `$transaction`.

## 2. Objetivo / sucesso

Uma vendedora com `leads:criar`, num orçamento com ≥1 item, **fecha o contrato em um clique**: informa
forma/CPF/entrada/nº de parcelas/1º vencimento e o sistema, **atomicamente**, aprova o orçamento, cria o
contrato ATIVO e gera o plano de parcelas — caindo no detalhe do contrato pronto. No caminho, desconto e
itens de serviço/quantidade ficam visíveis e usáveis na negociação.

Sucesso = o fluxo de 3 telas vira 1; nenhuma regressão na comissão, no financeiro ou na jornada; gates
verdes (`tsc` + `vitest`).

## 3. Escopo

**Dentro:**
1. Fechar contrato num clique (núcleo: lib atômica + action + UI).
2. Desconto na UI (form + preview do total).
3. Itens SERVICO/AJUSTE + quantidade na UI.
4. Garantir a reconciliação plano×total (aviso já existente).

**Fora (YAGNI / specs futuros):** edição de quantidade dos itens já adicionados além do form novo;
periodicidade de parcelas configurável na UI (a lib aceita `periodicidadeDias`, mas a UI fica em 30d);
qualquer mudança no motor de comissão; remoção do resíduo `Lead.etapa`.

## 4. Abordagem (escolhida: A)

- **A — Transação atômica + `montarPlano` puro (escolhida).** Extrai o miolo de cálculo do plano (hoje
  embutido em `gerarPlanoDePagamento`) numa função pura, reusada pelo caminho atômico. Melhor integridade;
  refator pequeno e justificado pelo trabalho.
- **B — Sequencial sem transação.** Encadear `criarContratoDeOrcamento` → `gerarPlanoDePagamento` →
  `mudarStatus`. Menos código, mas **estado parcial possível** (contrato sem plano). Rejeitada para dinheiro.
- **C — Portar SQL cru do Vite.** Rejeitada: raw proibido em tabela de tenant, fura o guard, comissão em dobro.

## 5. Arquitetura

### 5.1 Lib — `montarPlano` puro (`src/lib/financeiro/receber.ts`)

Extrair de `gerarPlanoDePagamento` (linhas ~38–72) uma função pura:

```ts
export type LinhaPlano = { numero: number; descricao: string; valor: number; vencimento: Date };
export type ResultadoMontarPlano =
  | { ok: true; linhas: LinhaPlano[] }
  | { ok: false; motivo: "num_invalido" | "data_invalida" | "entrada_maior" | "valor_invalido" };

export function montarPlano(
  totalC: number,
  input: { entrada?: string; numParcelas: number; primeiroVencimento: string; periodicidadeDias?: number },
): ResultadoMontarPlano
```

Regras preservadas exatamente: entrada = nº 0; N parcelas; **última absorve o resto** (sem drift);
vencimentos a cada `periodicidadeDias` (default 30, via `DIA_MS`); valida `n∈[1,360]`, data via
`diaParaData`, `periodicidade∈[1,3650]`, entrada parseável e `≤ total`. Valores em **centavos**.

`gerarPlanoDePagamento` passa a: validar contrato (da loja, ATIVO, sem plano), chamar `montarPlano` com
`decParaCentavos(contrato.valorTotal)`, e fazer o `createMany`. **Comportamento idêntico ao de hoje**
(os testes existentes de `receber` devem passar sem edição).

### 5.2 Lib — `fecharContratoDeOrcamento` (`src/lib/contratos/contratos.ts`)

```ts
export type ResultadoFechar =
  | { ok: true; contratoId: string }
  | { ok: false; motivo:
      | "orcamento_invalido" | "orcamento_vazio" | "ja_tem_contrato"
      | "num_invalido" | "data_invalida" | "entrada_maior" | "valor_invalido" | "forma_invalida" };

export async function fecharContratoDeOrcamento(
  lojaId: string,
  orcamentoId: string,
  input: { cpf?: string; formaPagamento?: string; entrada?: string; numParcelas: number; primeiroVencimento: string },
): Promise<ResultadoFechar>
```

Fluxo:

1. `tenantPrisma(prisma, lojaId)` lê o orçamento com itens + `lead.casamentoData`. Não existe / não da
   loja → `orcamento_invalido`. `status === "RECUSADO"` → `orcamento_invalido` (não fecha recusado).
   Já tem contrato (`orcamento.contrato`) → `ja_tem_contrato`. Sem itens → `orcamento_vazio`.
2. `total = calcularTotais(itens, descontoTipo, descontoValor).total` (centavos via `montarPlano`).
3. Valida forma (`formaValida`, "" = sem forma) → `forma_invalida`. Valida o plano chamando
   `montarPlano(totalC, input)`; repassa o motivo se falhar.
4. Casa a reserva pelo `vestidoId` do item VESTIDO (mesma lógica do `criarContratoDeOrcamento`).
5. **`prisma.$transaction([...])`** — `lojaId` explícito em cada `where`/`data` (o `tx` não passa pelo
   guard do tenant; padrão já usado em `cancelarContrato`):
   - `orcamento.updateMany({ where:{id,lojaId, status:{in:["RASCUNHO","ENVIADO","APROVADO"]}}, data:{ status:"APROVADO", aprovadoEm: now }})` — idempotente p/ já-aprovado.
   - `contrato.create({ data:{ lojaId, leadId, orcamentoId, vendedoraId, bloqueioVestidoId: reserva?.id ?? null, status:"ATIVO", cpf, valorTotal: total, vestidoDescricao, formaPagamento, dataCasamento, observacoes } })` — `orcamentoId @unique` barra duplicação (P2002 → `ja_tem_contrato`, capturado fora ou via checagem prévia).
   - `parcela.createMany({ data: linhas.map(... contratoId, lojaId ...) })`.
6. Retorna `{ ok:true, contratoId }`. **Não cria ContaPagar de comissão** (deixa p/ `fecharCompetencia`).

P2002 (corrida em `ja_tem_contrato`) tratado como em `criarContratoDeOrcamento` (`ehErroP2002`).

### 5.3 Action + UI

- **`fecharContratoAction`** (em `orcamentos/actions.ts` ou `contratos/actions.ts`): `acaoAutorizada("leads","criar")`.
  Lê `orcamentoId, cpf, formaPagamento, entrada, numParcelas, primeiroVencimento` do form, chama a lib,
  e `redirect` → contrato em sucesso (`/loja/{id}/contratos/{contratoId}?ok=fechado`) ou de volta ao
  orçamento com `?erro=<motivo>`.
- **UI no detalhe do orçamento** (`orcamentos/[orcamentoId]/page.tsx`): na seção de ações, quando o
  orçamento é fechável (`status !== "RECUSADO"`, ≥1 item, sem contrato) e o usuário tem `leads:criar`,
  renderizar um `<details>` **"Fechar contrato"** com os campos do plano (forma, CPF, entrada, nº parcelas,
  1º vencimento) e CTA `botaoPrincipal`. Substitui o botão "Gerar contrato" como caminho primário.
  O fluxo antigo (Aprovar → Gerar contrato → plano no contrato) **permanece** como fallback para quem
  não pode fechar de uma vez ou prefere o passo-a-passo.

### 5.4 Desconto na UI (entrega 2)

Seção "Desconto" no detalhe do orçamento quando `editavel`: `<form action={definirDescontoAction}>` com
seletor de tipo (Nenhum / Percentual / Valor) + campo valor, mais um **preview do total** calculado no
servidor a partir do estado atual (`orc.totais` já vem de `obterOrcamento`). Microcopy no tom Concierge
(ex.: "Desconto combinado"). Sem JS de cliente — o preview reflete o desconto **salvo**; recalcular ao
salvar é suficiente (YAGNI: sem cálculo client-side ao vivo).

### 5.5 Itens SERVICO/AJUSTE + quantidade (entrega 3)

- Form **"Adicionar item ou serviço"** (quando `editavel`): seletor `tipo` (Vestido avulso / Serviço /
  Ajuste — para VESTIDO sem `vestidoId` é item livre), `descricao`, `valorUnitario`, `quantidade` (default
  1, inteiro ≥1). Liga em `adicionarItemAction` (já aceita `tipo`/`quantidade`).
- Mostrar `quantidade` e `subtotal` na lista de itens quando `> 1` (o `OrcamentoItemView` já traz
  `quantidade` e `subtotal`). Adicionar campo `quantidade` ao form de editar item.

### 5.6 Reconciliar plano×total (entrega 4)

No um-clique o plano soma exatamente o total por construção (`montarPlano`: entrada + N, última absorve o
resto). Para o plano **manual** no contrato, o aviso `planoDivergeDoTotal` já existe — apenas garantir que
segue visível. Sem trabalho novo de lib.

## 6. Dados

Sem mudança de schema. Modelos tocados (todos em `TENANT_MODELS`): `Orcamento`/`OrcamentoItem`,
`Contrato`, `Parcela`. Dinheiro em **centavos** na aritmética, `Decimal(10,2)` no banco, string na borda.

## 7. Permissões

- Fechar contrato num clique, desconto, itens: **`leads:criar`** para fechar; `leads:editar` para
  mexer no orçamento (itens/desconto), como já é hoje. O plano de parcelas é gerado pelo sistema como
  parte de fechar a venda — **não** exige `financeiro:editar` (decisão de produto).
- O caminho manual do contrato (gerar plano avulso no detalhe do contrato) mantém o gate atual
  (`financeiro:editar`), inalterado.

## 8. Bordas (falha-fechada)

- Nada é gravado em erro: a `$transaction` faz rollback; partial-state impossível.
- Recusado não fecha. Já-aprovado-sem-contrato fecha direto. Já-com-contrato → `ja_tem_contrato`.
- Entrada > total, nº fora de 1–360, data impossível (`parseDiaUTC` estrito) → motivo específico, sem gravar.
- Comissão **nunca** nasce aqui — asserção explícita nos testes.

## 9. Testes (Vitest, Postgres real)

1. **`montarPlano` (puro):** entrada+N somam o total; última absorve o resto; vencimentos a cada 30d
   (e periodicidade custom); rejeita `num_invalido`/`data_invalida`/`entrada_maior`/`valor_invalido`.
2. **`gerarPlanoDePagamento`:** os testes existentes passam sem edição (refactor não muda comportamento).
3. **`fecharContratoDeOrcamento`:** caminho feliz cria contrato ATIVO + parcelas + aprova, atômico;
   **rollback** provado (forçar P2002 de contrato duplicado → zero parcelas órfãs); **nenhuma ContaPagar
   COMISSAO** criada; jornada da noiva passa a derivar `contrato_fechado` (`temContrato`); fechável a
   partir de RASCUNHO/ENVIADO/APROVADO; recusado e já-com-contrato recusados com o motivo certo.
4. **Desconto/itens:** preview do total bate com `calcularTotais` após salvar desconto; item SERVICO com
   quantidade entra no subtotal e no total que vai pro contrato.

## 10. Plano de entregas (para o writing-plans)

Bala traçante primeiro, depois o que destrava valor adjacente:

1. `montarPlano` puro + refit de `gerarPlanoDePagamento` (verde sem mexer em consumidor).
2. `fecharContratoDeOrcamento` (lib + testes de transação/rollback/comissão).
3. `fecharContratoAction` + UI "Fechar contrato" no detalhe do orçamento (gate `leads:criar`).
4. Desconto na UI.
5. Itens SERVICO/AJUSTE + quantidade na UI.

Cada passo: commit pequeno na `main` com `tsc` + `vitest` verdes.
