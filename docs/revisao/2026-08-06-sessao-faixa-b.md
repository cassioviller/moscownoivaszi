# Sessão de 2026-08-06 — a faixa B em paralelo, e a higiene que a precedeu

**Branch `main`** · base `4a3fd64` · **em curso**
Régua na abertura: **API 1031 · frontend 473 · E2E 156 · typecheck verde**

Esta sessão executa o `docs/propostas/2026-08-05-plano-de-subagentes-para-as-sobras.md`
a partir da **fase 1** — porque a fase 0 dele já rodou ontem, e é a
[conferência das 48](2026-08-05-conferencia-de-sobras.md).

## Onda 0 — a higiene, e o que ela mediu

O plano mandava podar três worktrees `prunable` antes de começar. A poda do git
já tinha rodado: `git worktree list` mostrava só o `main`, `git status` estava
limpo, `.git/worktrees/` não existia. **E os arquivos continuavam no disco** —
1,04 GB em dois diretórios que `.git/info/exclude:11` esconde do git e nada
esconde do `find`.

O que uma varredura via antes e depois de apagá-los:

| Varredura | Antes | Depois | Ruído |
|---|---|---|---|
| arquivos `.ts`/`.tsx` | 4.791 | **1.681** | 65% |
| declarações `const` (a população da S28) | 23.845 | **8.970** | 62% |
| formatadores `Intl` (a régua da S30) | 82 | **25** | 69% |
| consumidores de `useIsMobile` (a tese da S-D6) | 10 | **3** | 70% |
| diretórios `components/ui` (a tese da S23) | 12 | **5** | 58% |

**A S-D6 diz "0 consumidores" e o grep devolvia 10 arquivos, 7 deles cópia.** Um
agente da faixa B mandado contar usos teria contado errado, e teria contado
errado com confiança — é o modo de falha mais caro que existe, porque o número
sai da varredura com cara de medida.

Nada se perdeu, e isso foi conferido antes de apagar: o órfão `ad34…` não tinha
**nenhum** arquivo só dele, e os 30 do `a615…` fora do `.migration-backup/`
foram todos apagados do `main` por épico com nome (E95 `c4d8609`, E99 `c8ff967`,
E111 `58ea660`, E115 `9a2f4ca`).

Fechou duas linhas: a **S38** (nova, nasceu e morreu no mesmo commit) e o item
roteado ao **E104** sobre o `.migration-backup/` — que na raiz já não existia e
sobrevivia dentro do órfão, com 1.225 arquivos só dele.

**O conserto não tem diff.** Os diretórios estavam fora do versionamento, então
apagá-los não produz uma linha de `git status`. Este registro é o único rastro
que a onda 0 deixou, e é por isso que ele traz o antes e o depois medidos: sem
os números, não há como alguém conferir depois que o trabalho aconteceu.

Sobrou uma terceira instância do mesmo padrão, **de propósito**: o
`imagens sistema legado …zip` (3,6 MB) saiu do git em `c4de30c` e continua no
disco. Ele é o original das 29 fotos já versionadas, não polui varredura
nenhuma, e apagar evidência original é decisão da dona do repositório.

## O que a conferência corrigiu do plano de subagentes

O plano foi escrito em `3211e74`, **antes** da conferência. Seis pontos dele
envelheceram, e quem for executá-lo lê esta tabela junto:

| No plano | O que a conferência mediu |
|---|---|
| fase 0 — a sonda de sobra morta | **já executada** (`475d49f`); o plano abre numa fase que acabou, e fala em 51 sobras quando são 48 |
| B3 — S13 sozinho, worktree próprio "pelo risco" | `createRoutesFromElements` aceita a árvore JSX como está, **0 loaders/actions**. Meia dúzia de linhas em `App.tsx` |
| B4 — S-D7 "audite `destrutivas` e `datas`" | os dois estão limpos; a fresta é a varredura da **S28**, cega para **898 de 3.108 `const` (28,9%)** |
| B1 — S23 "4 cópias divergentes" | são **2** diretórios `ui/`; 8 de 33 arquivos homônimos divergem |
| C4 — S31 "dá 500 cru" | dá **409 `VINCULO_EXISTENTE`**, e são **4 FKs** sem cascade |
| C7 — a família da régua com S-D8 | **S-D8 está morta.** A família é S34, S-D20, S-D21 — e a S-D21 são **21 sites**, não sete |

## O agrupamento da onda 1 (faixa B, worktree por agente)

Reagrupado pelo que a conferência corrigiu, e **por arquivo tocado** — para não
fabricar conflito na hora de o orquestrador aplicar os diffs em série:

| Agente | Sobras | Por que juntas |
|---|---|---|
| B1 poda | S-D3, S-D6, S23, S29 | mesmo gesto, mesmos diretórios |
| B2 tela | S-D9, S-D10, S-D18, S-D13 | `pages/` + `ui/select.tsx`, sem sobreposição com B1 |
| B3 roteador + tipo | S13, S-D23 | a S13 encolheu; a S-D23 descobriu que **não há régua interina** — o Playwright transpila com Babel e apaga os tipos, então `page.click(42)` passa verde |
| B4 varredura | S-D7 + a fresta da S28 | onde a adjacência **é** a régua, e nenhuma janela de vizinhança a conserta |

**A onda 0 acrescentou escopo ao B4:** as varreduras deste repositório enumeram
com `find`/`grep -r`, que leem o disco. A régua honesta é `git ls-files`, que lê
o versionamento — e a diferença entre as duas foi medida hoje em 65%.

Contrato de todo agente, do plano: **nenhum commita, nenhum toca nas tabelas de
Sobras.** As três tabelas são o ponto de contenção do repositório; quem risca a
linha com o hash é o orquestrador, porque só ele conhece o hash.

## Como retomar

1. **Leia a [conferência](2026-08-05-conferencia-de-sobras.md) antes de escolher
   trabalho** — os números de cada sobra viva estão atualizados até 2026-08-05, e
   as nove imprecisas dizem o que erraram.
2. **A onda 2 é a fila do banco, e é serial.** `playwright workers: 1`, vitest da
   API com `fileParallelism: false`, sem `DATABASE_URL` de teste. A ordem está na
   fase 2 do plano, com a **S-D27 primeiro**: é a única sobra do repositório que
   falha **sem vermelho**, e toda a fase 2 roda E2E contra a loja que ela elege.
3. **As três perguntas para a dona** (S-A16 a lavagem, S-A18 a ausência, S-A24 o
   domingo) estão com a frase exata na conferência. Nenhuma trava as outras 45.
