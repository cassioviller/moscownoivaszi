# B3 — Leitura unificada de atendimentos (design)

> Data: 2026-06-15. Item de refactor do backlog de Atendimento
> (`docs/estado-atual.md`). Precede F1/F2 (filtros), que vão operar sobre esta
> leitura unificada.

## Problema

Há **três leituras divergentes** de `Atendimento`, cada uma reescrevendo a
regra "o que conta":

| Função | Onde | WHERE | include | ordem | shape |
|---|---|---|---|---|---|
| `listarProximosAtendimentos` | `atendimentos.ts` | `tipo=ATENDIMENTO`, situação ∈ abertas, `inicio ≥ hoje` | lead+cabine+vendedora | asc | `AtendimentoItem` |
| `listarAtendimentos` | `atendimentos.ts` | `tipo=ATENDIMENTO`, situação ∈ abertas\|fechadas | lead+cabine+vendedora | asc\|desc | `AtendimentoFila` |
| `atendimentosNoIntervalo` | `calendario/dados.ts` | `tipo=ATENDIMENTO`, `inicio ∈ [ini, fim)` | lead | asc | `AtendimentoCalendario` |

O filtro `tipo=ATENDIMENTO` é repetido 3×; os conjuntos de situação
(`["AGENDADO","EM_ATENDIMENTO"]` / `["CONCLUIDO","FALTOU"]`) são redefinidos
inline em mais de um ponto; o intervalo de data diverge. Mudar "o que é um
atendimento aberto" exige editar vários lugares — risco de divergência.

## Decisão

**Uma leitura-núcleo parametrizada + wrappers finos que preservam as
assinaturas públicas.** Nenhum consumidor muda; nenhum comportamento muda.

### 1. Conjuntos de situação (constantes exportadas)

Em `src/lib/atendimentos/atendimentos.ts`:

```ts
export const SITUACOES_ABERTAS: AtendimentoSituacao[] = ["AGENDADO", "EM_ATENDIMENTO"];
export const SITUACOES_FECHADAS: AtendimentoSituacao[] = ["CONCLUIDO", "FALTOU"];
```

Substituem as definições inline em `listarAtendimentos` (e a lista literal em
`listarProximosAtendimentos`). Ficam disponíveis para F1/F2 e qualquer leitura
futura.

### 2. Núcleo parametrizado

```ts
export type FiltroAtendimentos = {
  tipo?: AtendimentoTipo;          // default: sem filtro de tipo
  situacoes?: AtendimentoSituacao[]; // default: todas
  desde?: Date;                    // inicio >= desde
  ate?: Date;                      // inicio < ate
  ordem?: "asc" | "desc";          // default: "asc"
};

export type AtendimentoLinha = {
  id: string;
  inicio: Date;
  tipo: AtendimentoTipo;
  situacao: AtendimentoSituacao;
  desfecho: AtendimentoDesfecho | null;
  atendidoEm: Date | null;
  leadId: string;
  noivaNome: string | null;
  cabineNome: string;
  vendedoraNome: string;
};

export async function buscarAtendimentos(
  lojaId: string,
  filtro: FiltroAtendimentos = {},
): Promise<AtendimentoLinha[]>;
```

Monta o `where` a partir do filtro (só inclui cada cláusula quando o campo está
presente), `orderBy: { inicio: filtro.ordem ?? "asc" }`, include
lead+cabine+vendedora, escopo de loja via `tenantPrisma`. Retorna a linha
normalizada rica; cada wrapper projeta o que precisa.

> **Include sempre rico:** `atendimentosNoIntervalo` passa a trazer cabine e
> vendedora além de lead (dois joins pequenos a mais por linha do mês). Custo
> desprezível; ganho de ter uma única leitura. Os campos extras simplesmente
> não são lidos pelo mapeamento do calendário.

### 3. Wrappers (preservam tipos e comportamento)

- `listarProximosAtendimentos(lojaId)` → `buscarAtendimentos(lojaId, { tipo: "ATENDIMENTO", situacoes: SITUACOES_ABERTAS, desde: hojeUTC() })` e mapeia para `AtendimentoItem`.
- `listarAtendimentos(lojaId, { finalizados })` → `buscarAtendimentos(lojaId, { tipo: "ATENDIMENTO", situacoes: finalizados ? SITUACOES_FECHADAS : SITUACOES_ABERTAS, ordem: finalizados ? "desc" : "asc" })` e mapeia para `AtendimentoFila`.
- `atendimentosNoIntervalo(lojaId, inicio, fim)` (continua exportada de `calendario/dados.ts`) → delega a `buscarAtendimentos(lojaId, { tipo: "ATENDIMENTO", desde: inicio, ate: fim })` e mapeia para `AtendimentoCalendario`. Sem ciclo de import (`atendimentos.ts` não importa `calendario`).

As assinaturas e os tipos de retorno (`AtendimentoItem`, `AtendimentoFila`,
`AtendimentoCalendario`) ficam **idênticos** — os 3 consumidores
(`atendimentos/page.tsx`, `atendimentos/novo/page.tsx`,
`calendario/_abas/AbaAtendimentos.tsx`) não mudam.

## Equivalência de comportamento (o que NÃO pode mudar)

- `listarProximosAtendimentos`: mesma janela (`inicio ≥ hojeUTC()`), só abertos, asc.
- `listarAtendimentos`: particiona por situação (não por data), asc p/ fila, desc p/ histórico; agendado vencido continua na fila.
- `atendimentosNoIntervalo`: `[inicio, fim)`, qualquer situação, asc.

## Fora de escopo

- `listarProvasAbertas` (tipo=PROVA, include pesado de ajustes/checklist/bloqueio) — fica como leitura própria.
- Adicionar filtros novos de UX (noiva/vendedora/situação na tela) — é F1/F2, fatia seguinte, que vai *usar* `FiltroAtendimentos`.

## Testes

A garantia de regressão são os testes existentes dos 3 consumidores
(`atendimentos.test.ts` cobre próximos/fila/histórico/vencido; `painel` e os
testes de calendário exercem os outros). Adicionar um `describe` focado no
núcleo `buscarAtendimentos` provando os combos do filtro:

1. `{ tipo: "ATENDIMENTO" }` não traz PROVA.
2. `{ situacoes: SITUACOES_FECHADAS }` traz só CONCLUIDO/FALTOU.
3. `{ desde, ate }` respeita o meio-aberto `[desde, ate)`.
4. `{ ordem: "desc" }` inverte a ordem.

## Gates

`tsc --noEmit` limpo + `vitest run` verde (suíte inteira, sem regressão) antes
de commitar na `main`.
