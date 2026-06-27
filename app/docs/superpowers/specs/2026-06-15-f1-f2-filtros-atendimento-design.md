# F1/F2 — Busca + filtros de atendimento (design)

> Data: 2026-06-15. Itens de UX do backlog de Atendimento. Usa o núcleo
> `buscarAtendimentos`/`FiltroAtendimentos` entregue em B3.

## Problema

A operação de atendimento não tem **busca nem filtros**. Numa loja com várias
vendedoras e muitas noivas, a fila `/atendimentos` e a semana do calendário
viram listas longas sem como dizer "mostre só as minhas noivas" ou "ache a
Marina". F1 = busca por noiva; F2 = filtros por vendedora e por situação.

## Princípio (Concierge Atelier)

Filtro **calmo, sob demanda** — não uma barra de ERP imposta a cada visita.
Reaproveita o padrão `<details>` já usado no Financeiro ("Registrar cobrança").
Um resumo **"Refinar"** que expande para os controles; abre sozinho quando há
filtro ativo. Sem client JS: um `<form method="get">` escreve `searchParams`.

## Arquitetura

### 1. Núcleo — estender `FiltroAtendimentos` (`atendimentos.ts`)

```ts
export type FiltroAtendimentos = {
  tipo?: AtendimentoTipo;
  situacoes?: AtendimentoSituacao[];
  desde?: Date;
  ate?: Date;
  ordem?: "asc" | "desc";
  vendedoraId?: string;   // NOVO — where.vendedoraId
  noivaBusca?: string;    // NOVO — where.lead = { noivaNome: { contains, mode: "insensitive" } }
};
```

No `buscarAtendimentos`, ao montar o `where`:
- `if (filtro.vendedoraId) where.vendedoraId = filtro.vendedoraId;`
- `const q = filtro.noivaBusca?.trim(); if (q) where.lead = { noivaNome: { contains: q, mode: "insensitive" } };`

(O `where` já é cast `as never` — sem fricção de tipo. `mode: "insensitive"`
é suportado no Postgres.)

### 2. Wrappers — repassar os filtros novos

- `listarAtendimentos(lojaId, opts)` ganha `opts: { finalizados?, vendedoraId?, noivaBusca?, situacao? }`.
  O `situacao` (singular, opcional) **estreita** o grupo: quando presente e
  válido para o `quando` atual, vira `situacoes: [situacao]`; senão usa o grupo
  inteiro (`SITUACOES_ABERTAS`/`SITUACOES_FECHADAS`). `vendedoraId`/`noivaBusca`
  passam direto ao núcleo.
- `atendimentosNoIntervalo(lojaId, inicio, fim, filtro?)` ganha 4º param opcional
  `filtro?: { vendedoraId?: string; noivaBusca?: string; situacao?: AtendimentoSituacao }`
  repassado ao núcleo (situacao singular → `situacoes: [situacao]`). Backward-compatível.

### 3. Componente `RefinarAtendimentos` (server)

`src/components/atendimentos/refinar.tsx` — server component, sem estado.
Renderiza um `<details>` (atributo `open` quando `temFiltro`) com `<summary>`
"Refinar" e um `<form method="get" action={action}>`:

- **busca** `name="q"` (input text, placeholder "Buscar noiva", `defaultValue`)
- **vendedora** `name="vendedora"` (select: "Todas as vendedoras" + `vendedoras`)
- **situação** `name="situacao"` (select: "Todas" + `situacoes` recebidas como prop)
- inputs hidden de `hidden[]` (contexto a preservar: `quando`, ou `aba`+`ref`)
- botão submit "Refinar" (`botaoSuave`) + link "Limpar" (para `action` + hidden), só quando `temFiltro`.

Props:
```ts
{
  action: string;
  vendedoras: { id: string; nome: string }[];
  situacoes: { value: string; rotulo: string }[]; // opções válidas DA TELA
  hidden: { name: string; value: string }[];
  valores: { q?: string; vendedora?: string; situacao?: string };
  temFiltro: boolean;
}
```

Estilo: barra quieta em marfim — `border border-borda-suave bg-papel`, labels
em micro-uppercase como no resto da tela; inputs no padrão `inputBase` já
existente (extraído para a tela ou repetido no componente). Champagne/bordô só
no foco. Toque ≥ alvo confortável.

### 4. Fila `/atendimentos/page.tsx`

`searchParams` ganha `q`, `vendedora`, `situacao`. Situações válidas dependem do
`quando`:
- fila (abertas): Agendado, Em atendimento.
- histórico (fechadas): Concluído, Faltou.

`situacao` fora do grupo → ignorada (fallback ao grupo). Passa os filtros a
`listarAtendimentos`; a partição atrasados/hoje/próximos roda sobre a lista já
filtrada. `RefinarAtendimentos` no topo (depois do header), `hidden` preserva
`quando`. Estado vazio com filtro: "Nenhum atendimento com esses filtros." +
"Limpar". As vendedoras vêm de `listarEquipe`.

### 5. Semana `AbaAtendimentos`

Lê `q`, `vendedora`, `situacao` (todas as 4 situações são válidas aqui). Passa
ao `atendimentosNoIntervalo(..., filtro)`. `RefinarAtendimentos` acima da grade;
`hidden` preserva `aba=atendimentos` e `ref`. Os links de navegação ‹ › e o
`link(d)` passam a carregar os filtros ativos (`q`/`vendedora`/`situacao`).
Contagem da semana e estado-vazio refletem o filtrado. `listarEquipe` para as
vendedoras (a aba recebe `lojaId`; busca a equipe ali).

## Validação de entrada

- `q`: trim; vazio → ignora.
- `vendedora`: repassa; id inválido só devolve lista vazia (o select só oferece válidos).
- `situacao`: valida contra o conjunto permitido **da tela**; inválida → ignora.

## Testes (Postgres real)

**Data layer (`atendimentos.test.ts`):**
1. `buscarAtendimentos` `{ vendedoraId }` → só os da vendedora.
2. `buscarAtendimentos` `{ noivaBusca }` → match parcial **case-insensitive** (ex.: busca "mar" acha "Marina"; "MARINA" acha "Marina").
3. `listarAtendimentos` `{ situacao: "AGENDADO" }` → estreita o grupo aberto a só AGENDADO.
4. `listarAtendimentos` `{ noivaBusca, finalizados:true }` → filtra dentro do histórico.

**Calendário (`dados.ts` / teste existente do intervalo):**
5. `atendimentosNoIntervalo(..., { vendedoraId })` → só os da vendedora no intervalo.

**UI:** revisão com a skill `atelier-design-review` (calma, sem cara de ERP,
bordô só no foco) + `tsc` + suíte verde. Sem Playwright obrigatório (server de
dev flaky); se rodar, é smoke da query-string.

## Fora de escopo

- Persistir filtro entre sessões / salvar "minhas noivas" (YAGNI).
- Filtro por cabine, por período custom, por desfecho (YAGNI até pedirem).
- Multi-seleção de vendedoras/situações (um valor por filtro basta agora).

## Gates

`tsc --noEmit` limpo + `vitest run` verde antes de cada commit na `main`.
