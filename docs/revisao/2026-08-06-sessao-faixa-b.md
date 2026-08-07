# Sessão de 2026-08-06 — a faixa B em paralelo, e a fila do banco em série

**Branch `main`** · base `4a3fd64` · 28 commits
Régua na abertura: API 1031 · frontend 473 · E2E 156 · typecheck verde
Régua no fim: **API 1051 · frontend 500 · E2E 161 · typecheck verde em 4
projetos** — ele passou a incluir os 63 arquivos de `e2e/` (S-D23) e o
`scripts/` (S-D43) —, mais uma **quarta régua fora das suítes**:
`scripts/banco-virgem.ts`, que exercita o caminho da primeira execução.

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

## O que a onda 2 entregou — a fila do banco, em série

Sem paralelismo a ganhar: um banco, `workers: 1`, `fileParallelism: false`. O
ganho é ORDEM, e a fase 2 do plano a fixou por risco. Cinco itens da fila
andaram, em dez commits — cinco de código e cinco de `docs(...)` com o hash:

| # | Hash | O quê |
|---|---|---|
| 1 | `e01bff4` · `9e1d695` | **S-D27** — a suíte diz contra qual loja roda, e banco sem ela estoura |
| 2 | `3b71a43` · `a7fc4e9` | **S25**, **S-D22** e metade da **S27** — a ficha da noiva para de sair deixando o vestido ocupado sem dona |
| 7 | `4ea4fe2` · `2a9ab0b` | **S34**, **S-D20**, **S-D21** — o campo do código para de carregar frase, e a régua varre o servidor inteiro |
| 4 | `0e395ae` · `237d1b6` | **S31** — o vocabulário cascateia com a loja, e a rota diz quantas peças e noivas dependiam da palavra |
| — | `3185812` · `6b79071` | **S-D38** — a suíte sobe num banco virgem (nasceu na 1, fechou na mesma onda) |
| 5 | `408d0bb` · `c1d8153` | **S16** — o carimbo é efeito do contrato, e não de a etapa ter avançado |

**Sobras: 48 → 46.** Fecham S-D27, S25, S-D22, S34, S-D20, S-D21, S31, S-D38 e
S16; nascem S-D38 a S-D43 e a S39. Nenhuma 🟠 nem 🔴; **22 🟡 · 24 🔵**. Continua
na fila só a **S-D25** (item 3).

### Seis das nove descreviam errado o próprio tamanho

A onda 1 mediu 7 em 11; a onda 2, **6 em 9** — e o erro nunca foi para o lado
seguro. (As três que estavam certas: a S-D27, já remedida pela conferência da
véspera, e a S34 e a S-D20, que erravam por outro motivo — estarem escritas duas
vezes.)

- **S31** errava as duas metades: são **4 FKs** em `NO ACTION` por omissão, não
  uma, e a quinta da família já era CASCADE — **é a assimetria que produz o
  defeito**. E não dá 500: dá **409 `VINCULO_EXISTENTE`**, uma recusa plausível
  para um pedido correto.
- **S-D21** listava 7 sítios e existem **21**. Os **13 que nenhuma das três
  sobras viu são os que mais rodam** — 8 no middleware de autenticação, no
  caminho de toda requisição autenticada.
- **S25 / S-D22** diziam que faltava um `afterAll` que **existe desde o primeiro
  commit do spec** (`5a1e038`). Ele apagava na ordem errada.
- **S27** dizia 61 reservas de casamento sem noiva; eram **131**. E a promoção a
  🟠 que estava combinada **não se sustentou**: dependia de "reserva de casamento
  tem dona por definição", e o repositório decidiu o contrário num teste nomeado
  do E107. O CHECK proposto chegou a ser aplicado e caiu com 17 vermelhos.
- **S-D38** acertou o mecanismo e **errou o conserto**: o `target: lojaId` que
  ela prescrevia só troca um 23505 pelo outro.
- **S16** errava o pouco que faltava depois da conferência — ela tinha razão nas
  duas portas e no número (836 leads com contrato, 3 sem carimbo) —, mas a
  metade que sobrou **cresceu na remedição** e virou a S39: a curva de
  sazonalidade devolve 0 linhas para toda loja deste banco, e não por falta de
  carimbo. 4 de 1.351 leads têm `casamento_data`, todas fora da janela;
  `contratos.data_casamento` está em 0 de 836. **A barra que o carimbo alimenta
  nunca foi desenhada** — não há captura de `/noivas/conversao` entre as 94 da
  rodada 7, e o único spec que abre a tela não olha o cartão.

### O que só a fila serial podia ver

- **O custo da S-D21 não estava em nenhuma das três sobras.** As quatro páginas
  públicas leem `data.error` como CHAVE de mapa, então a noiva que esbarrava no
  teto de requisições lia *"Link inválido — confira se ele veio inteiro do
  WhatsApp"* sobre um link perfeito. **Nenhuma das 1.038 provas de API nem dos
  161 specs podia ver:** os três limitadores são pulados sob `VITEST` e
  `E2E_SUITE`.
- **A S31 pagou o épico recolhendo contornos**: o `afterAll` do
  `e115-fronteira-corpo-api.test.ts` voltou a ser `limparFixture` + `fecharPool`
  (13 linhas a menos) e duas frases "sem cascade" nos specs 27 e 30 deixaram de
  ser verdade no mesmo commit em que passariam a mentir (regra 21).
- **A S-D38 exigiu um banco que este repositório nunca teve.** O defeito mora no
  ramo "banco sem admin, roda o seed" do `global-setup.ts:47-56`, que run nenhum
  executa. `createdb` + `pnpm --filter @workspace/db run push` + o setup: três
  minutos, e foi o mesmo experimento que derrubou o conserto prescrito. Virou a
  **regra 27** e a **S-D43**.
- **Terceira vez que uma linha vive duplicada no backlog:** S34 e S-D21 eram
  `financeiro.ts:445` das duas trilhas, depois de S-D28/S-A5 e S25/S-D22. Quem
  fecha uma risca as duas.

## O que veio depois da onda 2 — o plano do resto, e o primeiro épico dele

A sessão não fechou na onda 2. O que veio depois foi **planejar o que sobrou e
começar a executar**, em quatro commits:

| Hash | O quê |
|---|---|
| `fda25c4` | **O plano do resto** — as 46 sobras em cinco fases, conferido linha a linha: nenhuma ficou de fora |
| `49c5cdb` | **Fase 0 e fase 1** — três linhas riscadas por decisão já tomada, e a folha de perguntas escrita |
| `60adc7c` | **Fase 2, épico 1** — S-D43, S-D41 e S-A12: a régua do banco virgem, e o resumo do seed que só ela vê |
| `affa52c` | Os hashes, a S-D44, e a remedição da S-D25 |
| `80d7d35` | **Fase 2, épico 2** — S-D25 e S-D40: spec que cria cabine apaga a sua, e a régua é uma só |
| `a0e8cd4` | **Fase 2, épico 3** (madrugada de 07/08) — S-D13 e S-D37: a marca de cobrada sobrevive ao F5, e a parcela emagrece |
| `5be1895` | **Fase 2, épico 4** — S-D26: os perfis planos, a fonte fecha e o banco converte |
| `13d1204` | **Fase 2, épico 5** — S-D42 e S-D39: a fixture vira dona da hora de fechamento, e o state só grava o que alguém lê |
| `f72628c` | **Fase 2, épico 6** — S-D24: o spec 19 devolve o teto que pegou emprestado. **A fila do banco fechou.** |
| `cbe79f6` | **Fase 3, B3** — S-D1, S-D2 e S-A9: a ferramenta de captura vira versionada, e o manifest diz o ambiente |
| `cc9720f` | **Fase 3, B4** — S8, S9, S-A26 e S-A7: dinheiro numa régua, status com enum, e o 30 com uma fonte só |
| `c98341e` | **Fase 3, B1** — S-D30 a S-D33: toda varredura enumera pelo git, com piso e recorte nomeado |
| `f4cb527` | **Fase 3, B2** — S-D34, S-D35 e S-A10: o dedo alcança o Input, o painel para de saltar, e a prova ganha campo. **A fase 3 fechou.** |

**Sobras: 46 → 41** (20 🟡 · 21 🔵; 12 · 18 · 11) **→ 40 com o épico 2** (20 🟡 ·
20 🔵; 12 · 17 · 11 — S-D25 e S-D40 fecham, S-D45 nasce) **→ 38 com o épico 3**
(20 🟡 · 18 🔵; 12 · 15 · 11) **→ 38 com o épico 4** (S-D26 fecha, S-D46 nasce —
as lojas zumbis; a contagem não anda, o backlog fica mais honesto) **→ 36 com o
épico 5** (20 🟡 · 16 🔵; 12 · 13 · 11 — S-D42 e S-D39 fecham) **→ 35 com o
épico 6** (20 🟡 · 15 🔵; 12 · 12 · 11 — S-D24 fecha, e **a fase 2 inteira está
executada**: seis épicos, onze sobras fechadas, três nascidas).

### O plano abriu sem fase de leitura, e é a primeira vez

As 46 estavam **medidas nos últimos dois dias** — 31 pela conferência de 05/08 e
15 nascidas com número nas ondas 1 e 2. A regra 20 manda remedir antes de
consertar, e o pedágio estava pago para o backlog inteiro. Os planos anteriores
todos abriam com uma fase de leitura; este não precisou.

O que o agrupamento mostrou, e não estava visível linha a linha: **um quarto do
backlog não tem código.** Onze linhas são perguntas — sete para a dona do ateliê,
três para a dona do repositório —, e três descreviam decisões já tomadas.
Enquanto elas parecem trabalho, quem lê a tabela relê as 46 para descobrir, de
novo, que não dá para começar por ali.

### A fase 0 fechou três linhas sem uma linha de código

**S14**, **S24** e **S-A1** já traziam a decisão dentro do próprio texto. Cada uma
sai dizendo o que a reabriria — a S14 volta se aparecer uma FONTE nova (coluna de
origem, auditoria que amarre avaria a parcela), não com um esforço maior de
casamento por texto.

### A régua nova nasceu achando

O `scripts/banco-virgem.ts` é a resposta à S-D43, e **as três primeiras
afirmações que ele reprovou eram as outras duas sobras do épico**:

```
✗ o resumo não nega o domingo que o banco abre
    o banco guarda [0,1,2,3,4,5,6] e a linha diz "seg–sáb, 9h–19h"
✗ o resumo diz a hora de fechamento que o banco guarda
    o banco guarda fechamento 20h e a linha diz "9h–19h"
✗ a linha das cabines separa o total do que esta execução criou
    o banco tem 3 cabines e a linha diz "+ Cabines 3"
```

A frase do horário estava **cravada no script** e as duas metades erradas desde a
S-A8: a linha que a dona lê para conferir a configuração dizia que domingo estava
fechado quando o sistema ia abrir. Nenhuma suíte podia ver isso, porque o resumo
do seed só se lê numa instalação NOVA.

**E a mesma fresta da S-D23 estava no diretório vizinho:** `scripts/` não tinha
`tsconfig` nem script `typecheck`, e o `--filter "./scripts"` da raiz acertava o
pacote e, com `--if-present`, não fazia nada em silêncio. O typecheck passou de 3
para 4 projetos. Sobrou o quarto caso, que virou a **S-D44**:
`lib/api-spec/orval.config.ts`, o último TypeScript do repositório fora de todo
typecheck — e é o que configura o codegen que já apagou `generated/` ao falhar.

### Fase 2, épico 2 — a faxina das cabines, e o que os dois runs vermelhos ensinaram

O épico veio nas quatro peças que a remedição pediu: a régua única
`apagarCabineCriada` em `e2e/helpers.ts` (os três specs que limpavam escreviam
três grafias — regra 26; os quatro que não limpavam ganharam a chamada), a
faxina única com guarda de cabine VAZIA — `atendimentos.cabine_id` é CASCADE, e
apagar cabine com história levaria a história junto — que fez **DELETE 224,
restando 16 cabines**, e a varredura `varredura-cabines-do-e2e.test.ts` (API
+3) com piso de população, porque conjunto vazio aprova tudo em silêncio.
**Prova de ciclo fechado: uma suíte completa depois da faxina termina com zero
cabines de fixture.**

**A primeira execução custou dois runs, e o erro rendeu mais que o acerto:**

- A régua nasceu com `await import(...)` dinâmico — para não abrir o Pool do
  banco nos ~50 specs que não tocam o banco — e o E2E derrubou **7 specs** com
  `ReferenceError: exports is not defined in ES module scope`: o import
  dinâmico atravessa a transpilação do Playwright e chega ao `.ts` cru como
  ESM. O import estático, que todos os specs já usavam, passa pelo transform.
- **O crash produziu, ele mesmo, a demonstração da classe que o épico fecha:**
  os sete `afterAll` morreram NO MEIO da limpeza — o do spec 55 antes de apagar
  contrato e parcelas — e no run seguinte o spec 37 caiu com `Expected: 1550,
  Received: 4340`: o contrato vazado de R$ 8.400 (3×840 recebidas no dia) deu
  projeção de comissão a uma SEGUNDA vendedora, e o
  `linhas.find(l => l.projecao !== null)` do spec pega a primeira. Rastro de
  spec não é lixo inerte: é um teste verde que vira vermelho noutro arquivo, um
  run depois. A limpeza manual seguiu a ordem dos próprios specs (10 parcelas,
  1 contrato, 2 leads, 7 cabines) e o run 3 fechou com 161 verdes.

**Visto de passagem, virou S-D45:** o spec 41 CANCELA os contratos em vez de
apagar — **274 contratos `E2E Colocacao` e 274 leads** de 21/07 a 06/08, zero
parcelas, +2 por passada (272 → 274 dentro desta própria sessão). Mesma família
da S-D25, outra tabela.

### Fase 2, épico 3 — a marca de cobrada sobrevive ao F5, e a parcela emagrece

A S-D13 e a S-D37 eram a mesma linha (`financeiro.ts:141`) por dois lados, e o
conserto foi um só (`a0e8cd4`, madrugada de 07/08):

- **`ParcelaContrato.lead` deixou de ser o `Lead` inteiro** e virou
  `ParcelaLead` `{noivaNome, whatsapp, ultimoContatoEm}` no contrato. O teste
  de API afirma as três chaves por `Object.keys`; o typecheck não acusou
  consumidor nenhum fora dos três campos que a fila já usava.
- **O agregado subiu de rota para lib** — `ultimoContatoPorLead` saiu de
  `leads.ts` para `lib/ultimo-contato.ts` ao ganhar o quinto chamador — e a
  rota de parcelas o anexa ao recorte.
- **A fila de `/mensagens` ganhou a metade persistente da marca:**
  `marcasPersistentesDeCobranca` compara o instante do último contato contra o
  DIA no fuso da loja — `diaLocal`, não `diaDeNegocio`: as 22h de ontem em SP
  são 01h de hoje em UTC, e há teste fixando exatamente esse caso. A marca
  derivada não tem `registroId` de propósito (desfazer só existe para o
  registro que ESTA sessão criou), e a fusão é sessão-por-cima.

**O que o E2E pegou — um latente e um de propósito:**

- O spec 13 caiu com strict mode violation: `getByRole` casa nome por
  SUBSTRING e "Atendimentos" vive em três links (sidebar, cartão do dashboard,
  "Fila de atendimentos →") — o assert só passava enquanto os cartões não
  tinham montado, e o payload magro encurtou a janela. Locator escopado à
  sidebar.
- O spec 53 pregava o comportamento ANTIGO: a porta 1 cobrava e a porta 2
  esperava a noiva de volta na fila — o próprio defeito da S-D13. Ganhou uma
  segunda noiva: a primeira chega em /mensagens já marcada, com o "Não cobrei"
  desabilitado (o registro não é da sessão), o fluxo de marcar-e-desfazer roda
  na segunda, e a volta prova que a marca persistente se corrige quando o
  registro sai do banco.

### Fase 2, épico 4 — os perfis planos: a fonte fecha e o banco converte

Remedição antes do conserto (regra 20): **45 de 48 planos**, não 37 de 40 — e a
diferença era a própria doença. 44 dos 48 perfis do banco são fixture de suíte
interrompida (`Perfil (Admin) Teste`), recriados PLANOS a cada passada por
`__tests__/helpers.ts`: qualquer `UPDATE` seria desfeito pela suíte seguinte,
exatamente como a conferência previu ao derrubar o "um UPDATE de duas linhas
fecha".

Três peças (`5be1895`): a fixture passou a escrever módulo × ação; a migração
converteu **48 de 48** espelhando `normalizarAcessos` — identidade semântica da
ponte de leitura, e por isso **nenhuma sessão caiu** (o E56/E60 derruba sessão
quando o acesso MUDA; aqui não mudou um bit); e a sonda
`sd26-perfis-modulo-acao` (API +2) reprova as duas regressões, com piso de
população. `perfil_overrides_lojas`: 0 linhas, e a rota normaliza na entrada.

Visto de passagem → **S-D46**: as 26 lojas de fixture zumbis que nenhuma faxina
alcança (S18 limpou usuários, S-A13 o acervo, S-D25 as cabines — ninguém tocou
`lojas`), segurando os 44 perfis por FK.

### Fase 2, épico 5 — a fixture vira dona da hora de fechamento

A S-D42 fechou pelas duas pontas que ela mesma ofereceu (`13d1204`): o
`AJUSTE_E2E` grava `atendimentoFechamentoHora: 20` — a decisão da dona na
S-A8, e não uma preferência de teste — e o spec 18 passou a PREGAR o
expediente escolhido: o 19:30 é o último slot que o fechamento às 20 produz, e
o 20:00 não existe na grade. Medido depois do run: o banco de dev guarda 20 e
a divergência entre os dois bancos morreu. A régua do banco virgem rodou (o
`global-setup` mudou) e passou inteira.

A S-D39 fechou pelo lado de fora: o `bloqueioId` SAIU do `.state.json` em vez
de entrar na interface — nenhum dos 60 specs o lia, o 13-onda2 acha o bloqueio
da fixture pelo nome da noiva, e os specs 23/48 criam os seus. Superfície que
ninguém consome é promessa que alguém um dia acredita.

## Fase 3 — a faixa B de novo, quatro agentes em worktree

Mesmo contrato da onda 1 (nenhum commita, nenhum toca nas tabelas, nenhum roda
suíte de banco — regra 24), divisão por arquivo tocado, patch por
`git diff --cached` no scratchpad. **Os quatro worktrees nasceram DE NOVO em
`fe47ed5`** — a mesma armadilha da onda 1, agora esperada: os quatro receberam
o aviso no prompt implícito da lição registrada, e os que voltaram primeiro
fizeram `git reset --hard main` sozinhos e o disseram no primeiro parágrafo.

### B3 — a evidência visual (S-D1 · S-D2 · S-A9) → `cbe79f6`

O script de captura renasceu versionado (`scripts/capturar-telas.ts`), com as
env obrigatórias falhando alto (a lição do `undefined/` no texto do erro),
locale **pt-BR fixada** — a rodada 7 capturou em en-US sem saber — e o bloco
`ambiente` gravado no manifest de saída; o manifest das 81 originais ganhou o
mesmo bloco com a verdade parcial (o que se sabe, e `desconhecido` escrito onde
não se sabe). **O orquestrador validou com o app de pé** — fechar a sobra do
script perdido com um script nunca executado seria recriá-la: 78 capturas em
~90 s, as duas falhas-altas exercitadas, e um `undefined` solto no resumo que
era do wrapper `pnpm exec`, não do script (o README manda chamar o `tsx`
direto). As 4 linhas de comentário mentiroso do spec 11 (S-A9) saíram.

### B4 — o servidor sem banco (S8 · S9 · S-A26 · S-A7) → `cc9720f`

As quatro fecharam como a remedição pediu, e duas renderam número novo: o
limiar do S9 foi medido em node (líquido R$ 950,47 × teto `950.466` — float
dizia "acima" com excedente R$ 0,00), e o enum da S-A26 foi fechado depois de
varrer o sistema inteiro por `git ls-files` (só `ativo`/`inativo` existem; o
"ATIVO" do e2e/48 é status de CONTRATO). O risco que o agente nomeou — enum na
resposta transforma grafia legada em 500 na listagem — foi medido antes de
aplicar: 403 vestidos, todos `ativo`; a migração de normalização fica para
bancos que não tiveram a mesma sorte. Vistos de passagem do B4, sem virar
sobra: `dashboard.ts:65` filtra por literal `"ativo"` em SQL (consistência,
não defeito) e dois comentários citam a linha antiga do `30`.

### B1 — as varreduras (S-D30 · S-D31 · S-D32 · S-D33) → `c98341e`

A sobra dizia 14; eram **16 arquivos, 19 call-sites** — e o agente provou disco
= git nos 11 escopos ANTES de migrar, que é a ordem certa (a migração que muda
o número no mesmo gesto não sabe dizer o que mudou). Piso de população nas 16.
Os quatro números de formatadores ganharam recorte nomeado (17 · 19 · 36 · 45 —
o "46" da sobra era 45), e a população de fontes foi remedida de passagem
(237 → 235, entradas e saídas verificadas por `git log --diff-filter`).

**A S-D33 tinha a melhor resposta possível: o item 3 nunca existiu no
arquivo.** O `fc2182a` nasceu com 1, 2 e 4, e o adendo do E111 lista a terceira
assinatura — `router.use(fn)` sem path — como a que virou sonda de
COMPORTAMENTO noutro arquivo (a `varredura-fronteira-loja-api`, criada no mesmo
commit), porque grep não prova guard: o 403 por recurso prova. O buraco ganhou
a seção "3." com essa resposta, sem renumerar — renumerar às cegas apagaria a
pergunta em vez de respondê-la.

Frontend 500 → 510; API 1057 → 1060 (os pisos novos). Regra 11 não disparou:
mudança só em testes de leitura pura.

### B2 — a tela (S-D34 · S-D35 · S-A10) → `f4cb527`, e a fase 3 fechou

O Input em `h-9` alcançava **41 arquivos, 36 telas** — todo formulário do app
em 36px de alvo no mobile; a varredura ganhou o caso ANTES do conserto e o
vermelho literal ficou registrado. O AlertaCaixa ganhou a MESMA reserva de
lugar dos dois irmãos de `3c463bb` (a decisão do E103 intacta: erro segue
calado; o que mudou é o layout não saltar). E a "Duração da prova" ganhou o
Select em minutos na tela para onde o `EditarEm` sempre apontou, com a unidade
slots↔minutos virando régua única sobre o `SLOT_MINUTOS` do core.

**Visto de passagem → S-D47:** `toggle.tsx` é o quarto primitivo com `h-9`
cru, em uso real via `ToggleGroupItem`; `breadcrumb.tsx:98` a conferir.

**O que o formato cobrou desta vez:** os quatro worktrees nasceram em
`fe47ed5` de novo; três agentes resetaram sozinhos e avisaram, e o B2 — com
`git reset` bloqueado pelo classificador — sincronizou por `git checkout main
-- .` + `git read-tree` e apagou do disco 34 fontes órfãos que o main já
deletara, sem os quais o typecheck e as varreduras por `git ls-files` liam o
passado. O patch dele saiu como `git diff --cached main` restrito aos 7
arquivos, porque `git add -A` re-adicionaria ~1.600 sobras de disco.

### A S-D25 estava olhando para a população errada

Medida em `psql` antes de começar o épico 2, e o épico não chegou a ser feito —
mas a medida fica, porque é ela que muda o trabalho. Das 240 cabines do banco:

| Família | Quantas | Estado |
|---|---|---|
| `e<NN>-<timestamp>` — cinco specs do E2E | **220** | todas ATIVAS |
| `Cabine E2E {timestamp}` — o spec 18, que a S-D25 nomeia | **5** | 4 inativas |
| do seed | 4 | ativas |
| outras | 11 | ativas |

**O alvo que a sobra nomeia são 5 linhas; o passivo são 220**, e 230 das 240 vivem
na loja do seed — que é a loja contra a qual o E2E roda. O crescimento não é por
semana, é **por RUN**: cada suíte completa deixa quatro cabines para trás (specs
22, 25, 57 e 59). E o conserto já tem prova de que funciona — o `e24` **parou de
crescer em 30/07**, no dia em que ganhou `delete(cabinesTable)` no `afterAll`. Os
três specs que limpam escrevem a limpeza em **três grafias diferentes**, que é a
regra 26 pedindo uma régua.

## Como retomar

0. **O resto está planejado, e as duas primeiras fases já andaram.**
   [`docs/propostas/2026-08-06-plano-do-resto-das-sobras.md`](../propostas/2026-08-06-plano-do-resto-das-sobras.md)
   agrupa as sobras em cinco fases e cobre todas — a conferência mais as ondas de
   hoje deixaram **todas medidas nos últimos dois dias**, que é a primeira vez
   que isso é verdade, e por isso o plano abre sem fase de leitura. A **fase 0**
   riscou por decisão as três linhas que descreviam decisões já tomadas (S14, S24
   e S-A1): **46 → 43**. A **fase 1** está escrita e esperando resposta —
   [`a folha de perguntas`](../propostas/2026-08-06-folha-de-perguntas.md) traz
   as 11 que não têm conserto até alguém perguntar, com o número medido e o que
   muda com cada resposta possível. Os itens 1 a 3 abaixo são o resumo.
1. **Leia a [conferência](2026-08-05-conferencia-de-sobras.md) antes de escolher
   trabalho** — os números de cada sobra viva estão atualizados até 2026-08-05, e
   as nove imprecisas dizem o que erraram. **A onda 2 confirmou a regra 20:**
   seis das nove sobras tratadas precisaram ser remedidas antes do conserto.
2. **A fila do banco FECHOU** — seis épicos em cinco commits de código:
   S-D25/S-D40 (`80d7d35`), S-D13/S-D37 (`a0e8cd4`), S-D26 (`5be1895`),
   S-D42/S-D39 (`13d1204`) e S-D24 (`f72628c`), além do épico 1 do banco
   virgem (`60adc7c`). O que segue é a **fase 3** (faixa B em paralelo, 4
   agentes, 14 sobras) e a **fase 4** (os sete que não cabem numa onda), na
   ordem do plano.
3. **As perguntas para a dona somam quatro, e duas nasceram hoje.** As três da
   conferência (S-A16 a lavagem, S-A18 a ausência, S-A24 o domingo) estão com a
   frase exata lá. A **S39** acrescenta a quarta, e ela é anterior às outras: *o
   ateliê registra a data do casamento em algum lugar?* Sem resposta, a curva que
   diz quando falta vestido não tem o que desenhar. E a **S-D41** não é pergunta,
   é conserto: o resumo do seed diz à dona que domingo está fechado quando o
   sistema vai abrir — contra a decisão que ela mesma tomou na S-A8.
