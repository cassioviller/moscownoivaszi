# Spec S7 — Fluxo de caixa (consolidação de leitura: entradas × saídas)

> **Fatia** do roadmap `2026-06-03-roadmap-comercial-financeiro-comissao-design.md` — a
> **última**. Leitura pura sobre o que a S4 (receber) e a S5 (pagar) já gravam: o dinheiro
> que **de fato** entrou (parcelas pagas) e saiu (pagamentos), consolidado por mês, mais um
> horizonte discreto do que ainda está **em aberto**. **Sem migração** e **sem regra nova** —
> nenhuma escrita. Depende de **S4 + S5** (prontas). Mora na raiz `/financeiro`.

---

## 1. Problema

O atelier registra cada recebimento (parcela paga) e cada pagamento (saída que quita N
contas), mas não tem **uma tela que junte os dois** e responda à pergunta de caixa do mês:
*entrou mais do que saiu?* Hoje `resumoReceber` e `resumoPagar` vivem em telas separadas e
mostram **previsão** (a receber / a pagar), não o **caixa realizado**. Falta a consolidação —
o item `Fluxo de caixa` da sidebar já aponta para `/financeiro`, que **hoje dá 404**.

## 2. O que existe hoje (e a spec usa, sem alterar)

- **Entrada de caixa** = `Parcela` com `status PAGA`: `valorRecebido`, `recebidoEm`,
  `formaRecebimento` (S4). Liga-se ao `Contrato` → `Lead` (a noiva).
- **Saída de caixa** = `Pagamento`: `valorPago`, `data`, `forma`, `colaboradorId?`,
  `enviadoContabilidadeEm?`, com `itens` (`PagamentoItem` → `ContaPagar`) (S5). Uma saída
  pode quitar despesa, salário e comissão de uma vez.
- **Em aberto (previsto)** = `Parcela PREVISTA` (`valorPrevisto`/`vencimento`) e
  `ContaPagar PREVISTA` (idem). Atraso = `PREVISTA` com `vencimento < hoje` (derivado).
- `resumoReceber`/`resumoPagar` (totais de previsão + em atraso), `listarPagamentos`,
  `src/lib/dinheiro.ts` (centavos), `src/lib/financeiro/datas.ts` (fuso: meia-noite UTC do
  dia em SP), `tenantPrisma`. **Permissão `financeiro`** (módulo dedicado, S6) já cobre a raiz.

## 3. Princípio: caixa é movimento realizado, não previsão

- **Saldo do mês = entradas realizadas − saídas realizadas** na competência do **movimento**
  (`recebidoEm` da parcela; `data` do pagamento), **não** pela data de vencimento.
- **Não é extrato bancário.** É o caixa **do que o sistema registrou** — sem saldo inicial,
  sem conciliação (YAGNI do roadmap §10). A tela deve deixar isso claro no microcopy.
- **Previsto é horizonte, não caixa.** O que ainda está em aberto (a receber / a pagar)
  aparece como **olhar à frente**, separado do realizado, reaproveitando `resumoReceber`/`resumoPagar`.
- **Decisões do dono (2026-06-04):** (1) foco = **realizado + horizonte previsto**;
  (2) tempo = **mês selecionável + faixa de tendência** dos últimos meses, **sem gráficos**
  (DESIGN §13); (3) **linha do tempo unificada** de entradas e saídas do mês.

## 4. Escopo

**Dentro:**
- **Motor de leitura** (`src/lib/financeiro/fluxo.ts` — novo, sem escrita):
  - `resumoCaixa(lojaId, competencia)` → `{ entradas, saidas, saldo }` realizados no mês.
  - `movimentosDoMes(lojaId, competencia)` → linha do tempo unificada (entrada|saída) ordenada
    por data, com rótulo (noiva/contrato na entrada; colaborador/descrição na saída) e link.
  - `tendenciaCaixa(lojaId, { meses })` → saldo (entradas−saídas) por mês dos últimos N meses
    (default 6), para a faixa de tendência.
  - `horizonteAberto(lojaId)` → reusa `resumoReceber`/`resumoPagar`: a receber, a pagar e os
    dois "em atraso", como olhar à frente.
- **Tela** `/financeiro` (raiz): seletor de competência; cards do mês (Entradas · Saídas ·
  **Saldo**, saldo negativo em bordô = atenção); faixa de tendência (linhas mês a mês, sem
  gráfico); linha do tempo unificada do mês; bloco "Em aberto" (horizonte previsto) com links
  para Contas a receber / a pagar. Tom Concierge; bordô só no saldo negativo e na ação/link principal.
- **Gate** `financeiro:ver` (mesma do receber/pagar/comissões). **Sem ações de escrita** →
  não há `financeiro:editar` aqui (tela read-only; nenhuma Server Action).

**Fora (YAGNI / não-objetivos do roadmap):**
- Conciliação bancária, saldo inicial/extrato, integração com banco.
- Projeção/forecast por data de vencimento como se fosse caixa (o previsto fica como horizonte).
- Categorização de despesas em gráficos, relatórios fiscais, exportação contábil (o envio à
  contabilidade já é da S5).
- Qualquer escrita (a tela não muda dado nenhum).

## 5. Modelo de dados

**Nenhuma migração.** S7 só lê `Parcela`, `Pagamento`/`PagamentoItem`, `ContaPagar` e relações
já existentes. Sem novos modelos, campos, enums ou índices.

## 6. Motor de leitura (`src/lib/financeiro/fluxo.ts`)

```ts
export type ResumoCaixa = { entradas: string; saidas: string; saldo: string }; // saldo pode ser negativo
export type Movimento = {
  id: string;
  tipo: "ENTRADA" | "SAIDA";
  data: Date;            // recebidoEm (entrada) | Pagamento.data (saída)
  valor: string;         // BRL string (centavos via util)
  descricao: string;     // "Parcela 2 — Contrato" | "Comissão 2025-03, Salário…"
  rotulo: string | null; // noiva (entrada) | colaborador (saída) | fornecedor/categoria
  href: string | null;   // link interno: contrato (entrada) | contas a pagar (saída)
};
export type PontoTendencia = { competencia: string; entradas: string; saidas: string; saldo: string };
export type HorizonteAberto = { aReceber: string; aReceberAtraso: string; aPagar: string; aPagarAtraso: string };

resumoCaixa(lojaId, competencia): Promise<ResumoCaixa>
movimentosDoMes(lojaId, competencia): Promise<Movimento[]>          // ordenado por data desc
tendenciaCaixa(lojaId, opts?: { meses?: number }): Promise<PontoTendencia[]>  // asc, default 6
horizonteAberto(lojaId): Promise<HorizonteAberto>                    // = resumoReceber + resumoPagar
```

- **Competência do movimento**: intervalo `[gte, lt)` em meia-noite UTC do mês (mesma convenção
  de `comissao.ts` `competenciaRange`; **extrair util compartilhada** em `datas.ts` p/ não repetir).
- **Entradas**: `parcela` `status PAGA` com `recebidoEm` no intervalo → soma `valorRecebido`;
  na linha do tempo, inclui `contrato → lead.noivaNome` e href do contrato.
- **Saídas**: `pagamento` com `data` no intervalo → soma `valorPago`; na linha do tempo, o
  rótulo vem do `colaborador` ou das `itens`/contas; href para `/financeiro/pagar?filtro=todas`.
- **Saldo** = entradas − saídas (centavos; pode ser negativo). `tendenciaCaixa` repete por mês.
- Tudo `tenantPrisma`; dinheiro em centavos; **sem N+1** (incluir relações no `findMany`).
- **Puro de efeito**: nenhuma função escreve. Fácil de testar com seed de parcelas/pagamentos.

## 7. Tela `/financeiro` (Fluxo de caixa)

- **Header** Concierge: "Fluxo de caixa" + microcopy honesto ("o que entrou e saiu do caixa
  do atelier — pelo que foi registrado aqui, não é o extrato do banco").
- **Seletor de competência** (`type=month`, GET) — default mês corrente.
- **Cards do mês**: Entradas · Saídas · **Saldo** (negativo em bordô; usa o `Card` de `ui.tsx`,
  estendendo-o p/ aceitar valor já-com-sinal/negativo sem quebrar o existente).
- **Faixa de tendência**: últimos ~6 meses como linhas (mês · entradas · saídas · saldo),
  tabular, **sem gráfico**. O mês selecionado destacado.
- **Linha do tempo do mês**: lista unificada de entradas/saídas por data; entrada com seta/《+》
  discreta, saída 《−》; valor à direita; link p/ contrato (noiva) ou contas a pagar. Vazio
  elegante ("Nenhum movimento em <mês>.").
- **Em aberto (horizonte)**: a receber / a pagar (e os dois em atraso, atraso em bordô), com
  links p/ `/financeiro/receber` e `/financeiro/pagar`. Deixa nítido que é **previsão**, não caixa.
- Reaproveitar `ui.tsx` (`brl`, `dataFmt`, `Card`, classes); **sem** Server Actions.
- **Sidebar**: o item "Fluxo de caixa" (`exact`, raiz `/financeiro`) já existe — só passa a
  resolver numa página real (hoje 404).

## 8. Permissão

- Sem mudança de módulo: a raiz `/financeiro` usa o **mesmo gate** `financeiro:ver` das demais
  telas do financeiro (S6 já criou o módulo e trocou o gate provisório). **Read-only** → sem `editar`.
- Guard idêntico ao de receber/pagar/comissões: sem `financeiro:ver` → `redirect(/loja/[id])`.

## 9. Testes

- **Motor** (`fluxo.test.ts`, integração com DB de teste — espelha `comissao.integracao`):
  - `resumoCaixa`: soma só parcelas PAGA por `recebidoEm` e pagamentos por `data` **no mês**;
    ignora previstas e movimentos de outros meses; isola por loja (tenant).
  - **Saldo negativo**: saídas > entradas → saldo < 0 (string com sinal correto).
  - `movimentosDoMes`: mistura entradas/saídas ordenadas por data; rótulos/hrefs certos;
    competência vazia → `[]`.
  - `tendenciaCaixa`: N meses, ordem ascendente, mês sem movimento = zeros (não some da faixa).
  - `horizonteAberto`: bate com `resumoReceber`/`resumoPagar` (em aberto + atraso).
  - **Fuso na borda do mês**: recebido/pago em 31→00:00 SP cai na competência certa
    (reusa a convenção de `datas.ts`).
- **Permissão**: quem não tem `financeiro:ver` é barrado em `/financeiro`.
- **Gates verdes** (`tsc` + `vitest`) antes do commit na `main`.

## 10. Plano (fatias finas, commit na `main`)

1. Util de competência compartilhada em `datas.ts` (extrai `competenciaRange` hoje privado em
   `comissao.ts`; ajusta o import lá) **+ teste**. Refator sem mudança de comportamento.
2. Motor `fluxo.ts` (`resumoCaixa`, `movimentosDoMes`, `tendenciaCaixa`, `horizonteAberto`) **+ testes** (TDD).
3. Tela `/financeiro/page.tsx`: cards do mês + seletor + horizonte (fatia visual mínima).
4. Faixa de tendência + linha do tempo unificada do mês.
5. Verificação ponta a ponta (registrar recebimento na S4 e pagamento na S5 → ver refletir no
   saldo/linha do tempo/tendência; saldo negativo; mês sem movimento) e gates verdes.

## 11. Riscos / pontos de atenção

- **Convenção de data dupla**: caixa é por **data do movimento** (`recebidoEm`/`data`), enquanto
  comissão/folha são por **competência da obrigação**. Não confundir — documentar no header do motor.
- **Extração do `competenciaRange`**: ao mover de `comissao.ts` p/ `datas.ts`, manter o
  comportamento idêntico (testes da S6 devem seguir verdes).
- **`Card` de `ui.tsx`** hoje formata sempre com `brl` e cor fixa; estender p/ saldo negativo
  (bordô) **sem** quebrar os usos em receber/pagar/comissões.
- **Performance**: linha do tempo do mês pode crescer — incluir relações no `findMany` (sem N+1)
  e, se necessário, limitar a faixa de tendência a N meses.
- **Honestidade do número**: deixar explícito que não é extrato bancário (sem saldo inicial),
  para não induzir leitura errada de caixa.

## 12. Definição de pronto

`/financeiro` deixa de dar 404 e mostra, para a competência escolhida, **entradas, saídas e
saldo realizados**, uma **faixa de tendência** dos últimos meses, a **linha do tempo unificada**
dos movimentos e o **horizonte em aberto** (a receber/a pagar, atraso em bordô) — tudo leitura
pura, sob `financeiro:ver`, no tom Concierge, com motor coberto por testes e gates verdes.
Com isso, **fecha o roadmap comercial→financeiro** (S0→S7).
```
