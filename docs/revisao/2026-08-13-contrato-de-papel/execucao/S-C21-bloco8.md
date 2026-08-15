# Bloco 8 — as decisões pequenas que viraram fila (S-C21 · S-C87 · S-C89 · S-C221 · S-C232 · S-C77)

**Trilha do contrato de papel, lote das azuis (2026-08-15)** · agente D · worktree
`.claude/worktrees/agent-a8319ff2dc5f7d2b8` · branch `agente-d-bloco8` · base `7650b480` (docs do E219)
Banco próprio: `moscow_wt_bloco8` (criado com `push` + seed; conferido com `SELECT current_database()`).

**E2E obrigatório e NÃO rodado — worktree não isola porta.**

## Correções ao diagnóstico, antes do código

- **O worktree NÃO nasceu na base mandada.** Ele nasceu em `cbcd8b30` — **48 commits atrás**
  de `7650b480` — e o primeiro gesto foi o reposicionamento (`git checkout -B agente-d-bloco8
  7650b480`, árvore limpa conferida antes). É a mesma armadilha do lote de 14/08, pelo mesmo
  caminho: quem medisse em `cbcd8b30` descreveria sobras de um repositório três épicos mais velho.
- As demais correções estão na seção de cada sobra; o resumo: a S-C21 estava exata (um montador,
  duas portas); a S-C232 está **errada no mecanismo** (o spec de hoje não recusa o `null` — ele o
  **converte em 01/01/1970**, que é pior); a S-C89 conta "2 por contrato atrasado" e são **3**;
  a S-C87 pede o diálogo "da ficha" e o componente certo já existe extraído
  (`historico-contato.tsx`, E32); a S-C221 diz "a Costureira" e a permissão de hoje também alcança
  a **Recepção**; a S-C77 aponta `reservas.ts:2340` e a transação mora em `reservas.ts:2919`
  (PATCH `/avarias/:id`, S-C11).

---

## S-C21 — o lookbook público sabe da marca

**Decisão da dona (14/08/2026): SIM, mostrar — é argumento de venda.**

**Medição de quem monta o payload:** o montador é **UM** — `montarVestidosLookbook`
(`artifacts/api-server/src/lib/visao-noiva.ts:114`) — e serve **DUAS portas**: o link público
(`routes/lookbooks.ts:76`) e o portal da noiva (`routes/portal.ts:259`, o mesmo shape via
`$ref` no `PortalNoiva`). Nenhum outro sítio monta `LookbookPublicoVestido` (enumerado por
`git grep montarVestidosLookbook` e pelos `$ref` do spec: 2 usos). Por isso o campo entrou
**required** no spec: o único montador sempre o tem, e `optional()` seria o caminho do
0-de-735 que o E215 mediu.

**O que mudou:**

- `lib/api-spec/openapi.yaml` — `LookbookPublicoVestido` ganha `exclusiva: boolean`,
  **required**; codegen re-rodado (`api.ts`, `api.schemas.ts`, `lookbookPublicoVestido.ts`).
- `visao-noiva.ts` — o SELECT traz `vestidosTable.exclusiva` e o tipo
  `VestidoLookbookPublico` a declara, com o comentário distinguindo TRAÇO de ESTADO
  (a distinção da 12ª está em `schema/vestidos.ts:105`).
- As duas telas gêmeas da noiva ganham o selo, **o mesmo texto nos dois**: "Peça exclusiva",
  num `<span>` de borda com cor de texto padrão (`lookbook-publico.tsx` e `noiva-portal.tsx`) —
  o rosa da marca ficou fora de propósito, pela medição do E127/E4 (2,68:1 nesta mesma página).

**Vermelho antes (literal):** com o spec exigindo o campo e o montador ainda sem ele,
`lote28-lookbook-api.test.ts` reprovou com
`Error: expected 200 "OK", got 500 "Internal Server Error"` — **2 failed | 2 passed**: o
`GetLookbookPublicoResponse.parse` derruba a resposta inteira, que é a guarda da S-C150
fazendo o serviço do lado bom. Depois do montador: **4 passed**. A suíte `portal` (6 arquivos,
29 testes) verde com o campo obrigatório — a segunda porta entrega.
