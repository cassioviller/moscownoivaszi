# Sessão de 2026-08-06 — a faixa B em paralelo, e a higiene que a precedeu

**Branch `main`** · base `4a3fd64` · 9 commits
Régua na abertura: API 1031 · frontend 473 · E2E 156 · typecheck verde
Régua no fim: **API 1036 · frontend 495 · E2E 156 · typecheck verde, e agora
inclui os 63 arquivos de `e2e/`**

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

## O que a onda 1 entregou

Os quatro voltaram, 48 minutos de relógio, e os quatro patches aplicaram no
`main` — um deles com socorro. **Onze sobras tratadas, oito fechadas, oito
nascidas.**

| # | Hash | O quê |
|---|---|---|
| 1 | `6a3d5c1` | **S38** — a higiene de 1,04 GB, e o que ela mediu |
| 2 | `973c364` | **S-D7** e o mecanismo da **S30** — a sonda passa a enumerar pelo git |
| 3 | `612e557` | Hashes, e as quatro sobras que a sonda revelou de si mesma |
| 4 | `a77e3ef` | **S-D3** e **S-D6** — a poda de 5 arquivos, e 1.147 bytes de CSS |
| 5 | `544f6c4` | Hashes, e os vereditos medidos da S23 e da S29 |
| 6 | `3c463bb` | **S-D9**, **S-D10**, **S-D18** — o dedo alcança o select, o painel para de saltar |
| 7 | `19d3887` | Hashes, e por que a S-D13 vai para a fila serial |
| 8 | `acdd9b3` | **S13** e **S-D23** — o data router, e o typecheck vendo os 63 specs |
| 9 | `f76fb84` | Hashes, e as regras 25 e 26 |

**Sobras: 48 → 48.** Fecham S-D3, S-D6, S-D7, S-D9, S-D10, S-D18, S13, S-D23 e o
mecanismo da S30; nascem S-D30 a S-D37. Nenhuma 🟠 nem 🔴; 25 🟡 · 23 🔵.

### As correções ao diagnóstico — que foi o que mais rendeu

Das 11 sobras tratadas, **7 descreviam errado o próprio defeito**, e quase todas
erravam para o lado que mais atrapalha: o custo.

- **S13** dizia "toca TODAS as rotas do app". Tocou **uma**: 59 `<Route>`
  intactos, `git diff -w` de 98+/16-, e 88 das linhas restantes são reindentação.
- **S-D23** prometia uma régua interina (`playwright test --list`). Ela não
  existe por **dois** motivos: o Babel apaga os tipos, e o `--list` nem roda sem
  `globalSetup` porque 55 dos 63 arquivos leem `e2e/.state.json` no topo.
- **S-D3** repetia do E99 que a poda "não muda um byte do bundle". Muda
  **1.147 bytes, todos de CSS** — o Tailwind v4 varre os fontes atrás de nomes de
  classe, e o E99 mediu o JS sem olhar o `index.css`.
- **S-D9** falava de 1 tela; a frase morta estava em **3**.
- **S-D10** falava de 1 cartão e 3 consultas; hoje são **2 e 4** — o E132
  acrescentou o segundo salto depois de a sobra ser escrita.
- **S-D18**: a grafia que a nota do E137 prescreve (`min-h-11 md:h-9`) teria
  engordado o **desktop** para 44px enquanto consertava o mobile.
- **S-D13**: o lote que ela diz não existir **já existe** (`ultimoContatoPorLead`,
  `leads.ts:59-70`); falta um sítio, e ele está na rota — por isso ela vai para a
  fila serial em vez de fechar aqui.

E uma correção ao registro da onda 0, que o B4 fez e vale escrever: **os
worktrees órfãos nunca poluíram uma varredura versionada.** As 19 âncoras de
`import.meta.dirname` não andam a partir da raiz — elas escaparam por sorte de
CAMINHO, não por régua. Os 65% valem para grep feito à mão, que foi o que se
mediu.

### O que o E2E pegou e a faixa B não podia pegar

A migração do roteador voltou com **483 testes de unidade verdes e typecheck
verde**, e o E2E completo derrubou dois specs — `05-leads` e
`59-confeccao-vira-peca`. O `useBlocker` novo bloqueava a navegação do **próprio
salvamento**: `salvou` e `isSubmitSuccessful` são estado do React e a navegação é
síncrona, então o bloqueio lia o valor velho. No Playwright o `confirm` é
auto-dismissado e a navegação morria calada; para quem vende, o sistema
perguntaria *"você tem coisa que não foi salva"* logo depois de salvar.

Os 8 sítios do hook tinham **cinco grafias diferentes** para a mesma guarda, e
**três não tinham guarda nenhuma**. Virou uma régua só (`sujoParaConfirmar` mais
o `liberarSaida` que escreve num `ref`, porque estado do React vale no próximo
render e a navegação é agora), com varredura cobrando que não nasça a sexta.

Daí as **regras 25 e 26** do METODO. E o diagnóstico que fecha o argumento:
nenhum teste de unidade daquele arquivo podia pegar isso — os quatro que o
agente escreveu montam o hook com o booleano já decidido, e o defeito mora em
QUANDO ele é decidido.

### O que o formato de fan-out cobrou

- **Os worktrees nasceram em `fe47ed5`, 267 commits atrás do `main`.** Os quatro
  agentes perceberam sozinhos e deram `git reset --hard`, mas o sintoma é
  silencioso: tudo compila, tudo passa, e só diverge na hora de aplicar. Foi o B1
  quem avisou, e foi o primeiro parágrafo do retorno dele.
- **Dois patches disputaram o `pnpm-lock.yaml`** (B1 e B3). O do B3 não aplicou
  e o `git apply --3way` reverteu tudo em silêncio — `git status` limpo depois de
  dizer "Applied cleanly" três vezes. Resolvido aplicando com
  `--exclude=pnpm-lock.yaml` e regenerando com `pnpm install --lockfile-only`.
  **Lock é arquivo derivado: não deve viajar em patch de agente.**
- **Os quatro worktrees somaram 2,2 GB** e foram apagados no fim — o mesmo lixo
  que a onda 0 tirou. Fan-out em worktree cria a sujeira que a S38 descreve; a
  diferença é limpar no mesmo dia.
- **Agente de workflow não é endereçável depois que o workflow fecha.** A
  correção do `useBlocker` tentou voltar para o B3 e não teve para onde ir — quem
  orquestra termina o que o agente não pôde ver.

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
