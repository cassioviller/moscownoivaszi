# As 8 que sobraram — o plano do fecho

**Escrito em 2026-08-17**, sobre `2656568d` (a fila do review max inteira
executada). A dona pediu: *"vamos fechar as 8 restantes"*.

Contadas nas tabelas: **7 S-RM** no rastreador do review max e a **S-M17** no
da revisão max de 10/08. Nenhuma 🔴, nenhuma 🟠 — **3 🟡 · 5 🔵**.

## Duas saem sem código, e é preciso dizer por quê

**S-RM10 🟡 — já está paga.** Ela pedia que o primeiro gesto de todo agente com
worktree fosse `pnpm install --frozen-lockfile` + `pnpm run typecheck:libs`, e
isso **virou emenda à regra 29** no commit `2656568d`. Sobra cujo conserto é
uma regra fecha quando a regra está escrita — não há segundo trabalho a fazer.
Risca-se aqui.

**S-M17 🟡 — não é minha para fechar, e nunca foi.** O que ela pede é o dump de
uma **instalação real**, para separar o passivo da S-M3. A pergunta foi feita à
dona em 16/08 e a resposta está escrita na própria linha: *"a instalação real
ainda não existe — fica aberta até existir, e nada a fazer antes"*. Fechá-la
por decisão exigiria uma decisão diferente da que já foi dada; inventar
trabalho em cima dela seria pior que deixá-la aberta. **Fica aberta, e a razão
fica visível.**

Sobram **seis** com código.

## Os três épicos

| Épico | Sobras | Onde mexe | Quem executa |
|---|---|---|---|
| **E255** — a citação do manual se confere sozinha, ou se declara | S-RM2 🟡, S-RM4 🔵 | `moscow-noivas/src/lib/varredura-manuais-textos.test.ts`, `docs/manuais/*.html` | agente |
| **E256** — três frestas pequenas, cada uma com a sua régua | S-RM7 🔵, S-RM8 🔵, S-RM9 🔵 | `sino-notificacoes.tsx`, uma varredura nova de `useFieldArray`, `lib/api-spec/openapi.yaml` + gerados + `routes/financeiro.ts` + a tela da folha | agente |
| **E257** — o `/admin` ganha E2E nos dois botões que ninguém clica | S-RM3 🔵 | `e2e/64-portas-ganham-tela.spec.ts` | **eu** |

**A S-RM2 e a S-RM4 são o mesmo épico porque são a mesma régua**, e a ordem
entre elas importa: a S-RM4 (a varredura compara com o código-fonte CRU, e o
JSX parte a frase no meio) é o **mecanismo** que hoje limita o alcance; a
S-RM2 (79 das 161 aspas curvas não batem com a tela) é a **população** que só
pode crescer depois que o mecanismo melhorar. Consertar a segunda sem a
primeira é escrever régua que aprova o que não devia — que foi exatamente o
que o E254 mediu ao tentar o atalho.

**O E257 é meu porque só eu posso rodar o E2E** (worktree não isola porta —
S-O93). Faço-o enquanto os dois agentes trabalham, e ele é o único do lote que
já nasce com a régua que o fecha na minha mão.

## O que o E255 tem permissão de NÃO fazer

Este é o épico em que a resposta certa pode ser **não construir a régua**, e o
plano diz isso antes de o trabalho começar, para não virar desculpa depois.

O E254 já tentou o atalho e o mediu: a peneira automática por segmentos fixos
derruba as 79 divergentes para 52 e **aprova o `vendedora.html:800`** — a frase
que ele acabara de corrigir à mão. Régua que aprova o defeito conhecido é pior
que régua nenhuma, porque autoriza (é a regra 34 aplicada a varredura em vez
de teste).

Se, depois de medir, a conclusão honesta for que nenhuma régua cobre a prosa
citada sem falsa confiança, **o épico fecha declarando** — com a contagem, com
o que foi tentado e com o vermelho que reprovou a tentativa. É o precedente da
**S-CF3**, fechada por decisão em 16/08 (*"as réguas ficam grossas de
propósito"*). O que não se aceita é régua que passa por não ter olhado (S-C46)
nem sobra que fica aberta sem alguém dizer o porquê.

## O contrato dos agentes, igual ao do lote anterior — com uma linha a mais

Vale tudo o que o
[plano de 17/08](2026-08-17-as-15-abertas-com-agentes-plano.md) já fixou:
divisão pelo recurso compartilhado, banco próprio para quem precisar, ninguém
toca tabela de Sobras nem `CLAUDE.md`, ninguém roda E2E nem suíte inteira, e a
régua completa é do orquestrador (regra 25).

**A linha a mais é a emenda da regra 29, paga no lote passado:** o worktree
nasce sem `node_modules`, e o primeiro gesto tem duas linhas —
`pnpm install --frozen-lockfile` e `pnpm run typecheck:libs` da raiz — antes de
qualquer régua. Sem a segunda, o `tsc` cospe `TS6305` e trinta erros que
parecem do código recém-escrito. Os quatro agentes de ontem bateram nisso; os
dois de hoje vão saber antes.

## O que fica no fim

Se os três épicos fecharem, o repositório fica com **uma** sobra aberta — a
S-M17 —, e ela fica com a razão escrita na linha. **Conte a tabela.**
