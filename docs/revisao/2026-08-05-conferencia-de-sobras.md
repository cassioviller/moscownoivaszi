# Conferência das 48 sobras — fase 0 do plano de subagentes

**2026-08-05** · sete agentes de leitura pura, em paralelo · base `48e0a6d`
Método: `docs/propostas/2026-08-05-plano-de-subagentes-para-as-sobras.md`

As 51 sobras abertas foram divididas em sete lotes. Três já haviam sido medidas
neste mesmo dia (S18, S25/S-D22, S-D25) e ficaram de fora. **48 conferidas, com
âncora `arquivo:linha` e número de hoje.** Nenhum agente consertou, commitou ou
tocou nos rastreadores — as linhas riscadas saíram daqui.

## O placar

| Veredito | Quantas |
|---|---|
| **MORTAS** — consertadas e a tabela não sabia | **4** (S-D4, S-D5, S-D8, e o defeito da S-A9) |
| **VIVAS E PIORES** — o número cresceu | **6** (S27, S-D26, S-A12, S-A14, S-A17, S-D10) |
| **IMPRECISAS** — o mecanismo descrito está errado | **9** |
| **VIVAS**, confirmadas como escritas | 26 |
| **DECISÃO PENDENTE** — pergunta para a dona | 3 (S-A16, S-A18, S-A24) |

**8% do backlog era defeito morto.** Menos que os 37% da rodada 6, e a diferença
tem explicação: a rodada 6 nunca tinha sido revisitada, e estas trilhas foram
fechadas há dias.

**O que rendeu mais não foi encontrar mortos — foi descobrir que nove sobras
descrevem errado o defeito que apontam.** Uma sobra imprecisa custa mais que uma
morta: a morta desperdiça uma sessão, a imprecisa desperdiça o épico inteiro,
porque o conserto é planejado contra o mecanismo errado.

## Os quatro achados novos, em ordem de gravidade

### 1. A ficha da noiva monta link de WhatsApp para os Estados Unidos (S37)

A S37 falava em duas cópias da régua "que podem divergir um dia". As duas
concordam — varredura de todos os comprimentos de 0 a 16 dígitos, **zero
divergências**. A terceira, que ninguém tinha anotado, já está errada:

`moscow-noivas/src/pages/noivas/helpers.ts:57-61` — `whatsappDigits` devolve
qualquer quantidade de dígitos, **sem DDI e sem faixa** — e
`noivas/[leadId]/index.tsx:464` monta `https://wa.me/${digits}` direto com isso.
Para o mesmo campo `lead.whatsapp`, `mensagens/index.tsx:315` usa `linkWhatsApp`,
que prefixa o `55`.

**Medido: as 3 noivas com WhatsApp no banco têm 10–11 dígitos, nenhuma com 55.**
As três. O botão da ficha manda `wa.me/11988887777`, que o WhatsApp lê como DDI 1
— Estados Unidos. Dois botões do mesmo sistema, para a mesma noiva, apontando
para números diferentes. **Sobe de 🔵 para 🟠.**

### 2. O rastro de vendedora divergente do E120 tem uma porta dos fundos

`contratos.ts:471-472` só calcula `vendedoraDivergente` quando o contrato vem de
orçamento (`vendedoraDoOrcamentoId` é preenchido dentro do `if
(contratoData.orcamentoId)` de `:205`). E `orcamentoId` **não** está no `required`
do `ContratoInput` (`openapi.yaml:6148`).

Um `POST /contratos` **sem orçamento** atribui a venda — e a comissão que ela
soma por `contratos.vendedora_id` — a qualquer colega da loja, com **zero linhas
de auditoria**. O E120 fechou a porta da frente. Sobra nova: **S-D29**.

### 3. `DELETE /vestidos/:id` não tem guarda nenhuma

`vestidos.ts:510-514`, cinco linhas: não conta contrato, não conta orçamento, não
conta bloqueio, não oferece 409, não faz soft-delete. Com
`contrato_itens.vestidoId` em `set null` (S-A14), apagar uma peça vendida
transforma o item do contrato em descrição livre, em silêncio.

**A migração de faxina da S-A13, escrita hoje, foi mais cuidadosa com o acervo do
que a rota que a loja usa todo dia** — a guarda existe num SQL de limpeza e não no
código. Hoje o estrago não é observável (`contrato_itens` tem 0 linhas), e é isso
que o torna fácil de deixar passar. Sobra nova: **S-A25**.

### 4. Duas varreduras não guardam o que se acredita que elas guardam

**A da S28** (`s28-assert-tautologico-unit.test.ts:143`) separa o defeito do sósia
legítimo por **adjacência medida em número de linha** — `if (b.linha - a.linha >
1) continue;`. Medido: **898 de 3.108 declarações `const` nos arquivos que ela
varre já continuam na linha seguinte (28,9%)**. Ela é cega para quase um terço da
população que varre, e o defeito histórico que a motivou tem exatamente a forma
que o prettier quebra. Ela também **se exclui da própria varredura**.

**A da S30** (`varredura-reguas.test.ts:164-186`) trava a **lista de arquivos**
herdados, não a contagem: um arquivo pode ir de 1 para 20 formatadores `Intl` com
a suíte verde. O passivo não cresceu (17, os mesmos de `fc2182a`) — mas não foi a
sonda que impediu.

Isto amplia a **S-D7**, que mandava auditar dois arquivos: os dois estão limpos
(leem o arquivo inteiro com `\s*`). A fresta vive noutro lugar, e nenhuma janela
de vizinhança a conserta, porque ali **a adjacência É a régua**.

## As nove imprecisas, e o que cada uma errou

| Sobra | O que ela diz | O que é |
|---|---|---|
| **S13** | "migrar o roteador toca todas as rotas" | `createRoutesFromElements` aceita a árvore JSX como está; **0 loaders/actions**, providers já fora. Meia dúzia de linhas em `App.tsx`. De 🟡 grande para 🟡 pequena — e o hook já está em **8 telas**, não 3 |
| **S23** | "4 cópias divergentes de `ui/`" | **2** diretórios `components/ui/` no repo inteiro; 8 de 33 arquivos homônimos divergem. E o `mockup-sandbox` **voltou ao workspace** no E104 parte 4 — o custo é zero por ausência de importador, não de workspace |
| **S30** | "a varredura travou o número" | travou a **lista de arquivos**; a contagem cresce em silêncio. E o passivo é **17**, não quinze |
| **S31** | "dá 500 cru" | Express 5 encaminha para `classificarErro`, que traduz `23503` em **409 `VINCULO_EXISTENTE`**. E são **4 FKs** sem cascade, não uma |
| **S33** | "conta e apaga fora de transação" | o `DELETE` **está** em transação (`admin.ts:201`); quem fica fora é a **leitura da guarda**. Em READ COMMITTED, mover a contagem para dentro não fecha a corrida — precisa de `FOR UPDATE` ou `SERIALIZABLE` |
| **S-D2** | "a trilha E provou a locale: en-US" | o `AMBIENTE.md`, commitado no **mesmo commit**, recusa essa prova (o E92 mostrou que `<input type=date>` renderiza pela locale da interface). **A locale segue desconhecida** |
| **S-D7** | audite `destrutivas` e `datas` | os dois leem o arquivo inteiro e estão limpos. A fresta está na varredura da S28 (item 4 acima) |
| **S-D21** | "estendê-la exige tratar os `parsed.error.message`" | **zero ocorrências** — o E96 já os trocou pelo helper `erroDeValidacao`. O épico é mecanicamente barato, e são **21 sites**, não sete |
| **S-D23** | "régua interina: `playwright test --list`" | o Playwright transpila com **Babel, que apaga os tipos**. É verificação de sintaxe vestida de typecheck: `page.click(42)` passaria verde. **Não há régua interina** |
| **S-A7** | "o `provaDuracao` não é documentado" | documentado desde `3c0b5df`. O buraco real é que o **`30` tem duas fontes** (`agenda.ts:99` literal e `SLOT_MINUTOS`), que divergiriam em silêncio |
| **S-A10** | "a única linha sem contrapartida editável" | **4 de 4**. O botão "Editar as regras" leva a uma tela que não edita nenhuma delas |

## Os números que envelheceram

| Sobra | Dizia | Hoje | × |
|---|---|---|---|
| S27 — reservas de casamento sem noiva | 61 | **124** | 2,0 |
| S-A12 — cabines na loja do seed | 122 | **180** | 1,5 |
| S-D26 — perfis no formato plano | 2 | **37 de 40** | 18 |
| S-D21 — frases no campo do código | 7 | **21** | 3,0 |
| S-D27 — specs que a eleição de loja rege | 147 | **156 em 60 arquivos** | — |
| S-A3 — acervo classificado por "Tipo de peça" | — | **0 de 496** | — |
| S32 — consultas no `GET /dashboard` | "até 22" | **22, medidas** | confirmado |

**A S-D26 é a que mais engana.** "Um `UPDATE` de duas linhas fecha" é falso:
`helpers.ts:64` **escreve perfil plano a cada execução da suíte**, e o seed usa
`onConflictDoNothing`, então um banco que já tem o formato velho nunca se cura.

## As três perguntas para a dona do ateliê

Sobra fechada por decisão se risca com a resposta escrita. Estas três não têm
conserto até alguém perguntar:

1. **S-A16, a lavagem.** *"Quando a peça de estoque volta — o saiote, o véu, o
   bolero — ela vai para a lavagem antes de sair de novo, como o vestido vai? Se
   sim, é a mesma semana que a senhora reserva para o vestido, ou é menos?"*
   Medido: casamento em 19/09, o vestido fica comprometido até 28/09 e o saiote do
   mesmo contrato aparece livre em 22/09. **7 dias de diferença, peças que saíram
   e voltaram juntas.**
2. **S-A18, a ausência.** *"Quando a senhora marcar férias e já houver
   atendimentos no período, o sistema deve avisar na hora — 'há 4 atendimentos
   nesse período; eles continuam marcados' — ou aceitar em silêncio?"* Hoje o
   `POST /ausencias` não consulta `atendimentos` uma única vez.
3. **S-A24, o domingo.** *"No domingo, a senhora quer que o sistema mostre os
   horários livres para a noiva escolher sozinha? Ou o domingo só deve aparecer
   quando a própria senhora marcar?"* Hoje a grade oferece **20 slots por domingo
   por cabine**, e domingo tem 4 atendimentos contra 90 da segunda.

## A correção que o orquestrador fez num agente

O lote 4 deu **VIVA E PIOR** à S14, alegando que o backfill da S26 carimbou
parcelas de reparo antigas como `PLANO` e que isso agora produz `409
JA_TEM_PLANO`. O mecanismo existe, mas **o próprio script da S26 declara essa
aproximação e argumenta por que ela não piora nada**
(`2026-08-05-s26-origem-da-parcela.sql:29-37`). E o banco confirma que não mordeu:
**122 avarias, todas com `parcela_id` nulo; 309 parcelas, todas `PLANO`, zero
`AVARIA`.** Fica VIVA, mecanismo inalterado.

O que o agente achou de útil é o **vínculo** entre a S14 e a S26, que ninguém
tinha registrado.

## A lição de método

**Sobra imprecisa é pior que sobra morta, e nada na tabela as distingue.** Nove
das 48 descrevem errado o defeito que apontam, e as três mais caras — S13, S-D21,
S-D23 — erram justamente na estimativa de custo: duas dizem "é caro" sobre
trabalho barato, e uma diz "há régua interina" sobre régua que não existe. Uma
tabela de sobras é lida para **decidir a ordem do trabalho**, e essas três
estavam empurrando as decisões para o lado errado.

O antídoto é o que esta fase fez: conferir antes de consertar custa uma rodada de
leitura e não produz commit nenhum de código.
