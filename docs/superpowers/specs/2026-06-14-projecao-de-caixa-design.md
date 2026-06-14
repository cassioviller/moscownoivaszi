# Spec — Projeção de caixa (saldo projetado dia a dia)

> **Fatia** do financeiro, posterior à S7 (Fluxo de caixa). Enquanto o S7 mostra o
> **realizado** (o que entrou/saiu), esta fatia mostra o **futuro projetado**: a partir de
> um saldo de referência, soma recebíveis e subtrai contas a pagar **por vencimento** e
> responde *"em que dia o caixa fica negativo?"*. **Leitura quase pura** + **uma** tabela
> de configuração (o saldo de referência). Sem regra nova de dinheiro.
>
> **Primeira de três** melhorias do financeiro escolhidas pelo dono (2026-06-14):
> (1) **Projeção de caixa** [esta], (2) Régua de cobrança/inadimplência, (3) DRE por
> categoria. Cada uma vira sua própria spec → plano → implementação.

---

## 1. Problema

O `fluxo.ts` (S7) consolida o **passado**: o dinheiro que de fato entrou (parcela paga) e
saiu (pagamento), por competência do movimento, mais um total achatado do que está "em
aberto". Falta o **olhar para frente**: dado o que ainda vai vencer (parcelas a receber e
contas a pagar), **qual o saldo projetado dia a dia** e **em que dia o caixa fica
negativo?** É a pergunta que tira o sono do dono do atelier — *"vou ter dinheiro para
pagar isso?"* — e hoje o sistema não responde.

## 2. O que já existe (e a spec reusa, sem alterar)

- **Recebíveis** = `Parcela` (S4): `valorPrevisto`, `vencimento`, `status` (`PREVISTA`/`PAGA`),
  ligada ao `Contrato → Lead` (a noiva). Atraso = `PREVISTA` com `vencimento < hoje` (derivado,
  `obrigacao.ehAtrasada`). Resumos: `resumoReceber` (`totalAReceber`, `emAtraso`).
- **A pagar** = `ContaPagar` (S5): `valorPrevisto`, `vencimento`, `status`, `descricao`,
  `categoria?`, `fornecedor?`. Resumo: `resumoPagar` (`totalAPagar`, `emAtraso`).
- **Realizado** = `fluxo.ts`: `resumoCaixaIntervalo(lojaId, {gte, lt})` → entradas/saídas/saldo
  realizados num intervalo (parcela `PAGA` por `recebidoEm`; `Pagamento` por `data`).
- `@/lib/dinheiro` (centavos: `paraCentavos`/`deCentavos`/`decParaCentavos`), `@/lib/tempo`
  e `financeiro/datas` (dia = meia-noite UTC do dia em SP), `tenantPrisma`, permissão
  `financeiro` (S6). A barra lateral de Financeiro já existe (receber · pagar · comissões · fluxo).

## 3. Princípios

1. **Projeção é leitura, não escrita.** Nenhuma baixa, nenhum pagamento. A única escrita é
   registrar o **saldo de referência** (configuração), via Server Action com gate.
2. **Saldo projetado, com ponto de partida.** Decisão do dono: mostrar o **saldo corrente
   projetado**, não só o fluxo líquido. Exige um saldo de referência (§5).
3. **Vencidos ficam fora da curva.** Decisão do dono: itens vencidos e ainda em aberto
   (parcela atrasada / conta a pagar não quitada) **não** entram na curva projetada — vão
   para um **bloco "Em atraso"** à parte, como alerta. A curva só inclui o que **ainda vai
   vencer** `(hoje, hoje+H]`. Mais realista e limpo.
4. **Previsão imperfeita, honesta.** Microcopy deixa claro que é previsão, não caixa
   realizado (mesma honestidade do S7).
5. **Centavos, sem float. Dia = meia-noite UTC de SP. Multi-tenant fechado.** Como todo o
   financeiro.

## 4. Decisões travadas no brainstorming (2026-06-14)

| Pergunta | Decisão |
|---|---|
| Tipo de projeção | **Saldo projetado** (com saldo de partida), não fluxo líquido. |
| Saldo de partida | **Saldo de referência persistido**: `{ dataReferencia, valor }`; saldo de hoje = referência + realizado(ref→hoje). |
| Vencidos em aberto | **Bloco "Em atraso" separado**, fora da curva. |
| Horizonte | Selecionável **30 / 60 / 90 dias** (default **90**), via `?h=`. |
| Visual | **Lista dia a dia** (só dias com movimento), **sem gráfico** (DESIGN §13). |

## 5. Modelo de dados (uma tabela nova)

### `SaldoReferencia` (em `TENANT_MODELS`)

O ponto de partida da projeção. **Histórico leve**: cada registro é uma âncora datada; o
mais recente com `dataReferencia ≤ hoje` é a âncora **ativa**. Re-ancorar periodicamente
corrige o drift e é o gancho natural da conciliação bancária futura.

- `id`, `lojaId`
- `dataReferencia: DateTime` — meia-noite UTC do dia (em SP); **≤ hoje** (validado na ação)
- `valor: Decimal` — saldo em caixa/banco naquela data (lido/gravado em centavos)
- `criadoEm`, `atualizadoEm`

**Convenção (evita off-by-one):** `valor` é o saldo **no início** de `dataReferencia`
(meia-noite). Logo o realizado a somar conta o intervalo `[dataReferencia, hoje]`
**inclusive** — os movimentos do próprio dia da âncora entram. Em termos de query:
`gte: meiaNoiteUTC(dataReferencia)`, `lt: meiaNoiteUTC(hoje) + 1 dia`.

Índice por `(lojaId, dataReferencia desc)` para achar a âncora ativa rápido.

**Nada mais novo.** Recebíveis e a pagar continuam sendo `Parcela` e `ContaPagar`.

## 6. Motor de leitura — `src/lib/financeiro/projecao.ts` (novo)

Separação: as leituras Prisma ficam na borda; a matemática (coberta por teste) é **pura**.

### 6.1 `montarCurva` (pura)

```
type EventoDia = { ymd: string; data: Date; entradasC: number; saidasC: number };
type LinhaCurva = { data: Date; entradas: string; saidas: string; saldoApos: string };
type Curva = {
  linhas: LinhaCurva[];
  menorSaldo: { data: Date; valor: string } | null;
  diaNegativo: Date | null; // primeiro dia com saldoApos < 0; null se nunca
};

montarCurva(saldoHojeC: number, eventos: EventoDia[]): Curva
```

- Aplica os eventos **em ordem de data**, acumulando o saldo a partir de `saldoHojeC` (centavos).
- `diaNegativo` = primeiro dia com `saldoApos < 0` (estritamente; **zero não é negativo**).
- `menorSaldo` = menor `saldoApos` da curva (pode ocorrer no meio, não no fim).
- Eventos no **mesmo dia** somam numa linha só (entradas e saídas do dia).

### 6.2 `saldoDeHoje` (leitura)

```
saldoDeHoje(lojaId): Promise<{ valor: string; ancora: { data: Date; valor: string } | null }>
```

- Sem `SaldoReferencia` → `ancora: null` (a UI mostra o estado vazio; **não** assume zero).
- Com âncora → `valor = ancora.valor + resumoCaixaIntervalo(lojaId, { gte: meiaNoiteUTC(ancora.data), lt: meiaNoiteUTC(hoje)+1d }).saldo`
  (reusa o realizado do `fluxo.ts`; auto-atualiza conforme baixas acontecem; janela inclusiva
  do dia da âncora ao dia de hoje, pela convenção do §5).

### 6.3 `projecaoCaixa` (leitura, orquestra tudo)

```
projecaoCaixa(lojaId, { horizonteDias = 90 }): Promise<{
  saldoHoje: string | null;            // null se não há âncora
  emAtraso: { aReceber: string; aPagar: string };
  curva: Curva;
  horizonteDias: number;
}>
```

- Janela da curva: `(hoje, hoje + H]` (H ∈ {30,60,90}; default 90).
- Recebíveis: `Parcela` `status=PREVISTA`, `vencimento` na janela → `entradasC` por dia.
- A pagar: `ContaPagar` `status=PREVISTA`, `vencimento` na janela → `saidasC` por dia.
- `emAtraso` = `resumoReceber(lojaId).emAtraso` e `resumoPagar(lojaId).emAtraso` (já existem;
  são os vencidos `PREVISTA` com `vencimento < hoje`). **Fora da curva.**
- Sem âncora → `saldoHoje: null`; a `curva` é montada sobre `0` **apenas para ordenar e
  agrupar os eventos por dia** — no estado vazio a UI lista as entradas/saídas **sem** exibir
  `saldoApos` (que seria enganoso sem ponto de partida) e prioriza o convite a cadastrar o saldo.

## 7. Configuração do saldo de referência

`src/app/(app)/loja/[lojaId]/financeiro/projecao/actions.ts`:

- **`definirSaldoReferencia(lojaId, { data, valor })`** (Server Action, gate `financeiro:editar`):
  valida `data ≤ hoje` e `valor` numérico; cria um **novo** `SaldoReferencia` (não edita
  destrutivamente — mantém histórico). Retorna `{ ok }` / `{ ok:false, motivo }`
  (`data_invalida` | `valor_invalido`), no padrão das ações do financeiro.

## 8. Tela — `/loja/[lojaId]/financeiro/projecao`

Server Component, `export const dynamic = "force-dynamic"`. Gate `financeiro:ver`. Tom
Concierge; bordô só no saldo negativo, no bloco de atraso e na ação principal.

De cima para baixo:

1. **Saldo hoje** — número grande (`saldoDeHoje.valor`); linha discreta *"a partir de
   {brl(ancora.valor)} em {DD/MM}"* + link **Ajustar saldo** (só com `financeiro:editar`).
   - **Estado vazio** (sem âncora): bloco convidando *"Informe o saldo atual do caixa para
     ativar a projeção"* + CTA para o form. A curva ainda lista os eventos, mas sem saldo
     absoluto.
2. **Em atraso** — bloco de atenção (espelha `AvisoVencidas`): *"{brl} a receber · {brl} a
   pagar — em atraso, fora da curva"*, com links para `/financeiro/receber` e `/financeiro/pagar`.
   Só renderiza se houver atraso.
3. **Resumo da projeção** — uma linha-veredito: *"Caixa fica negativo em {DD/MM}"* (bordô) ou
   *"Caixa positivo em todo o horizonte"*; e *"menor saldo: {brl} em {DD/MM}"*.
4. **Curva projetada** — lista dia a dia (só dias com movimento):
   `{DD/MM} · {+entradas / −saídas} · {rótulo} → {saldoApos}`; a primeira linha com
   `saldoApos < 0` em bordô. Rótulo: noiva/contrato na entrada; descrição/fornecedor na saída.
5. **Seletor de horizonte** — 30 / 60 / 90 dias via `?h=` (default 90).
6. **Microcopy** — *"Projeção do que está previsto — não é caixa realizado."*

**Sidebar/navegação:** link **Projeção** a partir da tela de Fluxo de caixa (`/financeiro`);
avaliar 5º item na barra de Financeiro no plano (default: link no Fluxo, para não inchar a barra).

**Sem gráfico** (DESIGN §13): a curva é uma lista legível. **Sem estado de cliente**:
navegação por querystring.

## 9. Testes (TDD)

**Unitário puro — `montarCurva`:**
- sem eventos → curva vazia, `diaNegativo=null`, menor saldo = saldo de hoje;
- fica negativo num dia → `diaNegativo` correto;
- afunda e **recupera** depois → `menorSaldo` no fundo, não no fim;
- borda **exatamente zero** não é negativa (`< 0`);
- dois movimentos no **mesmo dia** somam numa linha.

**Integração (Postgres real, prefixo `MARK`, limpeza em `afterAll`):**
- `projecaoCaixa`: parcela/conta **dentro** do horizonte entram na curva; **fora**, não;
- vencidos em aberto vão para `emAtraso`, **nunca** na curva;
- `saldoDeHoje` = âncora + realizado(ref→hoje), conferido com uma baixa real no intervalo;
- isolamento de loja: dados de outra loja não vazam.

## 10. Transversais

- **Centavos** via `@/lib/dinheiro` (sem float). **Dia** = meia-noite UTC de SP
  (`@/lib/tempo` / `financeiro/datas`); janela `(hoje, hoje+H]`.
- **Multi-tenant**: `SaldoReferencia` em `TENANT_MODELS`; toda query por `tenantPrisma`.
- **Gates**: `financeiro:ver` (ver) / `financeiro:editar` (definir saldo). Migração **não
  destrutiva** (só adiciona tabela).
- **Gates verdes** (`tsc` limpo + `vitest`) antes de cada commit na `main`.

## 11. Não-objetivos (YAGNI desta fatia)

- Conciliação bancária / import de extrato (fatia futura, já mapeada).
- Multi-conta / múltiplos saldos (um saldo de referência por loja; o mais recente vale).
- Gráfico/chart (a curva é lista).
- Cenários "e se" (simular adiar um pagamento) — evolução possível, fora daqui.
- Régua de cobrança e DRE por categoria — são as **fatias 2 e 3**, specs próprias.

## 12. Arquivos (visão macro)

**Criar:**
- `prisma/schema` — model `SaldoReferencia` + migração não destrutiva.
- `src/lib/financeiro/projecao.ts` — `montarCurva` (pura), `saldoDeHoje`, `projecaoCaixa`.
- `src/lib/financeiro/__tests__/projecao.test.ts` — unitário (pura) + integração.
- `src/app/(app)/loja/[lojaId]/financeiro/projecao/page.tsx` — a tela.
- `src/app/(app)/loja/[lojaId]/financeiro/projecao/actions.ts` — `definirSaldoReferencia`.
- Componentes da curva / saldo / bloco em atraso (reaproveitar `AvisoVencidas` se couber).

**Modificar:**
- `TENANT_MODELS` (registrar `SaldoReferencia`).
- Tela de Fluxo de caixa (`/financeiro`) — link para a Projeção (e/ou item na sidebar de Financeiro).

## 13. Definição de pronto

Tela `/financeiro/projecao` mostrando saldo de hoje (a partir do saldo de referência +
realizado), bloco "Em atraso" fora da curva, curva dia a dia com o primeiro dia negativo em
bordô e seletor de horizonte; saldo de referência cadastrável com gate; `montarCurva` e
`projecaoCaixa` testados; `tsc` limpo e `vitest` verde; commits na `main`.
