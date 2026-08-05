# Sessão de 2026-08-05 — a passada de sobras, e a conferência das 48

**Branch `sobras-de-higiene`** · base `d39c14d` · 12 commits
Régua no fim: **API 1031 · frontend 473 · E2E 156 · typecheck verde**

Esta sessão não pertence a uma trilha: ela atravessa as três. O trabalho foi o
**backlog de sobras**, e o que ele produziu de mais durável não foi o código —
foi descobrir que a tabela de sobras não dizia a verdade sobre si mesma.

## O que foi feito, em ordem

| # | Hash | O quê |
|---|---|---|
| 1 | `5f408b8` | Confere duas linhas suspeitas: a S-D28 estava morta, a S18 estava 2,7× pior |
| 2 | `4274ad1` | **S18** — `limparFixture` passa a levar quem nasceu na loja. Banco de dev: 1.667 → 42 usuários |
| 3 | `e2bb58b` | **S-A13** — a faxina do acervo. Vestidos 899 → 494, atributos 223 → 16 |
| 4 | `3211e74` | Registra os hashes da S18 e da S-A13; o `CLAUDE.md` para de mentir nas contagens |
| 5 | `48e0a6d` | O **plano de subagentes**, dividido pelo banco e não pelo assunto |
| 6 | `475d49f` | **A conferência das 48** — sete agentes de leitura pura |
| 7 | `85d5108` | **S37 🟠** — a ficha da noiva parava de mandar para os Estados Unidos |
| 8 | `955ebb4` | Hash da S37 |
| 9 | `042d1b5` | **S-D29 🟠** — a venda em nome de outra pessoa deixa rastro com ou sem orçamento |
| 10 | `ef015b3` | Hash da S-D29; a régua do `CLAUDE.md` passa a ser a de hoje |
| 11 | `2912526` | **S-A25 🟠** — a peça com história para de sumir |
| 12 | `cac92ca` | Hash da S-A25; nasce a S-A26 |

**Sobras: 51 → 48.** Sete riscadas (S18, S-A13, S-D4, S-D5, S-D8, S37, S-D29,
S-A25 e o defeito da S-A9), três abertas (S-D29, S-A25, S-A26).

## O que a sessão descobriu sobre o backlog

A conferência está inteira em
**`docs/revisao/2026-08-05-conferencia-de-sobras.md`**. O resumo:

- **4 sobras estavam mortas** e a tabela não sabia — 8%, contra os 37% que a
  rodada 6 tinha quando foi revisitada pela primeira vez.
- **9 descreviam errado o defeito que apontavam.** É a regra 23, e foi a
  descoberta cara: três delas erravam na estimativa de custo, empurrando a ordem
  do trabalho para o lado errado.
- **3 defeitos 🟠 apareceram** onde quatro rodadas de revisão não tinham visto
  nada. Os três na fronteira entre dois arquivos.
- **2 varreduras não guardam o que se acredita que elas guardam** — a da S28
  (adjacência medida em número de linha, cega para 28,9% dos `const` que varre) e
  a da S30 (trava a lista de arquivos, não a contagem).

## O que a sessão registrou como método

Duas regras novas no `METODO.md`, as duas com o custo medido:

- **23 — sobra imprecisa custa mais que sobra morta**, e nada na tabela as
  distingue.
- **24 — fan-out de leitura acha o que a leitura sequencial não acha**, e a
  divisão do paralelismo é pelo recurso compartilhado: o banco de dev e as
  próprias tabelas de Sobras.

## Como retomar

1. **Leia a conferência antes de escolher trabalho.** Os números de cada sobra
   viva estão atualizados até 2026-08-05, e as imprecisas dizem o que erraram —
   pegar uma linha antiga sem ler a conferência é planejar contra o mecanismo
   errado.
2. **Nenhuma sobra é 🟠 ou 🔴.** O que resta são 48 linhas 🟡/🔵, e a ordem
   sugerida está na fase 2 do plano
   (`docs/propostas/2026-08-05-plano-de-subagentes-para-as-sobras.md`), com uma
   correção que a conferência trouxe: a **S-D27** (a suíte elege a loja mais
   antiga, e a herdeira já é lixo de fixture) é a única que falha **sem
   vermelho**, e por isso vai antes das outras.
3. **A fila do banco é serial.** `playwright` roda `workers: 1`, o vitest da API
   tem `fileParallelism: false`, e não há `DATABASE_URL` de teste. Duas suítes ao
   mesmo tempo produzem vermelho que não é regressão.
4. **As três perguntas para a dona do ateliê** (S-A16 a lavagem, S-A18 a ausência
   sobre agenda cheia, S-A24 o domingo com hora marcada) estão escritas com a
   frase exata na conferência, seção "As três perguntas". Nenhuma delas se fecha
   sem resposta, e nenhuma trava as outras 45.

## O que a sessão NÃO fez, de propósito

- **Não publicou.** O `main` segue à frente do `origin/main` sem push — decisão
  da dona do repositório.
- **Não unificou a régua do telefone** entre cliente e servidor (residual da
  S37): as duas cópias concordam, e unificá-las pede um pacote compartilhado
  novo, sem defeito medido que o justifique hoje.
- **Não mexeu nas 186 cabines** (S-D25) nem nos 121 vestidos `AVA…` (S-D22): a
  faxina de vestidos não serve para nenhum dos dois, e cada um pede a própria
  guarda.
- **Não tocou no zip** `imagens sistema legado …zip` da raiz, que segue não
  rastreado. Ele é o original das 29 fotos que já estão versionadas em
  `docs/revisao/2026-08-04-arqueologia-legado/fotos/` — mesma soma de bytes.
  Decidir se apaga é de quem sabe se há outra cópia.
