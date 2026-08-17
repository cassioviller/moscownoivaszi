# As 7 sobras — o plano do fecho

**Escrito em 2026-08-17**, sobre `e262167a` (o fecho das 8 medido, integrado e
com a regra 36 escrita). A dona pediu: *"cria um plano para fechar as 7
sobras"*.

Contadas nas tabelas, não deduzidas: **6 S-RM** no rastreador do review max e a
**S-M17** no da revisão max de 10/08. Nenhuma 🔴, nenhuma 🟠 — **2 🟡 · 5 🔵**.
Seis das sete nasceram do lote de ontem, o que é o retrato normal de um lote
que construiu régua nova.

## Uma sai sem código, e é a mesma de ontem

**S-M17 🟡 — não é minha para fechar, e a resposta já está na linha dela.** Ela
pede o dump de uma **instalação real** para separar o passivo da S-M3: no dev
são **0 linhas `AVULSA` em 309 parcelas**, então não há backfill a fazer, e o
predicado candidato (*"as linhas criadas no mesmo instante do contrato, cuja
soma é o `valor_total` exato"*) precisa ser conferido contra dados reais antes
de virar migração. Perguntado à dona em 16/08: **a instalação real ainda não
existe**. Fechá-la exigiria uma decisão diferente da que já foi dada, e
inventar trabalho em cima dela seria pior do que deixá-la aberta. **Fica
aberta, e a razão fica visível.**

Sobram **seis com código**.

## O que eu medi antes de escrever este plano — e onde a S-RM11 erra

Reli as seis contra o código antes de distribuir trabalho (regra 20). Cinco
estão exatas. A S-RM11 não, e erra **nas duas direções**:

| O que a sobra diz | O que está lá hoje |
|---|---|
| `hojeLocal()` **38 vezes** | **40** chamadas nas telas (`src/pages` + `src/components`, fora do sino); 51 no pacote inteiro |
| em **17 telas** | **17 telas** — exato |
| **11** dentro de um `useMemo` | **10**. Não há `React.useMemo`, não há `hojeLocal()` em `useCallback`, e o 11º era o do próprio sino, que o E256 já pagou |

E ela **cala a metade que mais importa**: descreve o defeito como o painel e a
agenda ficando em ontem, e **duas das dez são a prévia de um carnê** — a
divergência ali não é uma lista desatualizada, é uma data de vencimento que a
tela mostra e o servidor não vai gravar.

**Os dez sítios, lidos um a um, com o julgamento que este plano já traz feito**
(o épico confirma ou desmente cada um, e é obrigado a dizer qual):

| Sítio | O que o dia decide ali | Julgamento prévio |
|---|---|---|
| `orcamentos/[id].tsx:540` | `vencimentoEntrada` da prévia do plano de pagamento | **Dinheiro.** A aba aberta pela virada mostra a entrada vencendo ONTEM, e o servidor grava com o dia dele. No dia 31 muda o mês e a competência (é o C6 pelo avesso) |
| `contratos/[id].tsx:360` | idem, na prévia do carnê do contrato | **Dinheiro.** Mesma frase, mesma classe |
| `dashboard.tsx:244` | a fila de cobrança do painel (S-D13: quem já foi cobrada hoje sai) | Defeito, já conferido pelo agente do E256 |
| `dashboard.tsx:247` | a janela dos orçamentos vencendo | Defeito, mesmo `useMemo` |
| `dashboard.tsx:321` | o `deHoje` da agenda | Defeito — o painel é a tela que o ateliê deixa aberta o dia inteiro |
| `mensagens/index.tsx:254` | a fila de cobrança da tela de mensagens | Defeito, e é a MESMA composição do painel |
| `mensagens/index.tsx:260` | os orçamentos vencendo na janela | Defeito |
| `atendimentos/index.tsx:224` | os três baldes da fila: atrasados · de hoje · próximos | Defeito — depois da virada, o de hoje cai em "próximos" |
| `vestidos/[id].tsx:182` | `useMemo(() => hojeLocal(), [])`, e o valor vira **chave de query** | Defeito de outra forma: a chave congelada nunca reconsulta a disponibilidade do dia novo |
| `vestidos/[id].tsx:209` | o corte "bloqueio futuro ou aberto" | Defeito brando: um bloqueio que terminou ontem segue listado como próximo |

Dez de dez parecem defeito, e **é justamente por isso que o épico não pode
varrer**: a sobra diz *"nem toda leitura de `hojeLocal()` num `useMemo` é
defeito"*, e a única forma de saber é ler o que o valor alimenta. As duas de
`vestidos/[id].tsx` não são a mesma coisa que as outras oito — uma é chave de
cache e a outra é um filtro de lista —, e trocar as três por `useDiaLocal()`
sem dizer o que cada uma passa a fazer seria escrever o conserto certo pela
razão errada, que é o que a S-R11 ensinou ontem.

## Os três épicos

| Épico | Tese | Fecha | Onde mexe | Quem executa |
|---|---|---|---|---|
| **E258** — o dia vira nas telas que o leem parado | S-RM11 🟡, S-RM12 🔵 | `src/pages/{dashboard,mensagens/index,atendimentos/index,vestidos/[id],orcamentos/[id],contratos/[id]}.tsx`, `src/components/sino-aviso-de-erro.test.tsx` | agente |
| **E259** — a citação do manual, terceira passada | S-RM14 🔵, S-RM15 🔵, S-RM16 🔵 | `src/lib/varredura-manuais-textos.test.ts`, `docs/manuais/*.html`, `routes/catalogo.ts` | agente |
| **E260** — a porta da contabilidade ganha cena | S-RM13 🔵 | `e2e/15-onda5-pdf-e-folha.spec.ts` | **eu** |

**As três S-RM dos manuais são um épico só porque são a mesma régua**, e o
E255 acabou de provar que separá-las produz declaração onde cabia literal.
**A S-RM12 vai com a S-RM11** porque é o harness de teste do mesmo pacote e do
mesmo assunto — foi ele que quase fez o agente do E256 confirmar a razão errada
do E253, e quem estiver com o dia na cabeça é quem tem de consertá-lo.

**O E260 é meu porque a régua que o fecha é o E2E**, e worktree não isola porta
(S-O93). É a terceira vez seguida que o lote se divide assim, e funcionou nas
duas anteriores.

## A ordem, e o que ela protege

**O E258 vai na frente em valor**, porque tem as duas de dinheiro. **O E258 e o
E259 rodam em paralelo**, porque não se cruzam em arquivo nenhum: um mexe em
`src/pages` e num teste de componente, o outro em `src/lib` e em `docs/manuais`.
Nenhum dos dois toca banco, nenhum roda E2E, nenhum toca as tabelas de Sobras
nem o `CLAUDE.md`. O E260 é meu e roda enquanto os dois trabalham.

**O ponto de encontro previsível tem nome, e é o mesmo de ontem:** a
`varredura-das-varreduras` está travada em **37** (`toBe(37)`), e o E259 é o
único do lote que pode nascer com uma varredura nova. **Se nascer, o número é
RECONTADO depois da integração, não somado de cabeça** — foi assim que o lote
de ontem não colidiu.

## O que cada épico tem permissão de NÃO fazer

Este plano diz isto antes de o trabalho começar, para não virar desculpa
depois. Os dois casos são de régua, e os dois têm precedente escrito.

**S-RM14 — a fresta do molde de pedaço único pode não ter conserto de
máquina.** O agente do E255 já tentou fechá-la automaticamente e mediu: **todo
piso quebra** nos moldes de texto fixo curto ou com nome de exemplo dentro. O
guarda hoje é a contagem travada em **72 moldes**, e ela é um guarda de
verdade — mexer nela exige decisão escrita. Se a conclusão honesta for que
nenhum critério automático separa o molde legítimo do molde que esconde a
metade envelhecida, **a sobra fecha DECLARANDO**, com os três cenários já
medidos (`vendedora.html:800` como era antes do E254 reprova sem declaração,
reprova com os dois pedaços e passa com um só) e com a razão de a contagem
travada bastar. É o precedente da **S-CF3**, fechada por decisão em 16/08.
**Régua que aprova o defeito conhecido é pior que régua nenhuma** — regra 34
aplicada a varredura.

**S-RM15 — as 253 que sobram podem não ser citação.** Os manuais têm **466**
aspas curvas; **213** estão na régua depois do E255. As outras 253 vivem em
`<strong>` (86), prosa nua (99), `<td>` fora das tabelas de recado (23), `<p>`
(19), títulos (15) e `<b>` (11), e **boa parte é ênfase de escrita, não
citação de tela**. O trabalho aqui é **separar citação de grifo com um critério
escrito** — e o critério pode concluir que não há régua a construir. O que não
se aceita é fechar sem a separação: a sobra existe porque ninguém sabe qual das
253 é qual, e uma resposta honesta pode ser *"87 são citação e entram; 166 são
grifo e ficam de fora, e o critério é este"*.

O E258 **não tem essa permissão**. As dez leituras têm código atrás e o
`useDiaLocal()` já existe; o que ele pode fazer é **desmentir o julgamento
prévio deste plano** em qualquer uma das dez, dizendo por quê.

## A decisão que era da dona — DECIDIDA em 17/08, na recomendação

> **A dona respondeu: a tela perde as aspas retas, e o manual não muda.** Está
> na tabela de Decisões do
> [rastreador](../revisao/2026-08-16-review-max/EXECUCAO.md#decisões). O E259
> executa as duas linhas de `routes/catalogo.ts` sem perguntar de novo.


**S-RM16, primeira metade: as aspas retas do `catalogo.ts`.** As rotas escrevem
`"${alvo.nome}" classifica 3 peça(s) e 1 noiva(s) — apagar levaria essa
classificação junto` (`routes/catalogo.ts:109` e `:217`), com o nome **entre
aspas retas**; `docs/manuais/proprietario.html:711` cita a frase **sem elas**.
A régua não casa as duas, e hoje isso é declarado como molde.

**Medido antes de recomendar:** o repositório tem **9** ocorrências de aspa
reta colada a uma interpolação, e **7 delas são protocolo** — ETag e
`Content-Disposition`, onde a aspa é da norma HTTP. **As únicas duas em frase
que uma pessoa lê são estas duas**, no mesmo arquivo. E a frase equivalente em
`routes/agenda.ts:232` nomeia sem aspa nenhuma: *"Fulana está ausente de … a
…"*.

**Recomendação: a TELA perde as aspas retas, e o manual não muda.** O manual
está certo e a tela é que é a exceção — duas linhas, e **sem teste nenhum
afirmando a frase**: procurado por *"levaria essa classificação"* em toda a
árvore versionada, ele só aparece na rota e no manual.

**E é preciso dizer o que este conserto NÃO entrega, porque eu errei isto ao
escrever a primeira versão desta seção.** A citação **não passa a bater
literalmente, e nunca poderá**: a frase tem o nome do atributo e dois números
interpolados, então ela é molde por natureza, com aspas ou sem. Hoje o manual
já declara três pedaços (`classifica | peça(s) e | noiva(s) — apagar levaria
essa classificação junto.`), e o primeiro é curto **por causa da aspa** — o
texto fixo do código é `" classifica `, com a aspa colada. Tirando as aspas, o
pedaço declarado pode crescer, e o molde fica mais apertado; mas continua
molde.

**O que o conserto entrega de verdade é o que a sobra pediu:** quem procurar na
tela o que leu no manual passa a achar. Hoje o manual escreve *Marfim
classifica…* e a tela escreve *"Marfim" classifica…* — e a régua nunca vai
reclamar disso, porque a aspa está fora do pedaço declarado. É uma diferença
que só a pessoa vê, e é para a pessoa que o manual existe.

**A segunda metade não é decisão, é conserto de letra**:
`docs/manuais/vendedora.html:950` cita *"Confirme com ela antes do horário, ou
desmarque."* como frase inteira, com **C maiúsculo**, quando
`lib/prova-orfa.ts:76-77` escreve *"… A prova continua marcada — confirme com
ela antes do horário, ou desmarque."* O manual maiusculou uma palavra do meio
de uma oração. Quem conserta é o manual.

## O contrato dos agentes

Vale tudo o que os dois planos anteriores fixaram
([15 abertas](2026-08-17-as-15-abertas-com-agentes-plano.md),
[as 8](2026-08-17-as-8-que-sobraram-plano.md)): divisão pelo recurso
compartilhado, ninguém toca tabela de Sobras nem `CLAUDE.md`, ninguém roda E2E
nem suíte inteira de API, e **a régua completa é do orquestrador** (regra 25).

**O primeiro gesto do worktree tem DUAS linhas** (regra 29 com a emenda de
ontem): `pnpm install --frozen-lockfile` e `pnpm run typecheck:libs` da raiz.
Sem a segunda, o `tsc` cospe `TS6305` e trinta erros que parecem do código
recém-escrito, e o agente vai caçar defeito que não existe.

**Nenhum dos dois precisa de banco próprio** — o E258 e o E259 são frontend e
documentação, e a régua deles é `pnpm --filter @workspace/moscow-noivas test`
(1044 hoje, 115 arquivos, ~27 s), mais o typecheck do pacote.

**E o número de suíte que cada relatório publicar tem de ter sido medido onde
é afirmado** — regra 36, escrita ontem por causa do E257, que publicou
`e2e/64` 3 → 4 testes quando o "4" era o projeto `setup` mais os três do
arquivo.

## O que fica no fim, dito com honestidade

O plano das 8 fechou prometendo que sobraria **uma** sobra aberta, e sobraram
**sete**. O erro não foi de contagem: ele contou o que ia ser riscado e não
contou o que ia **nascer**. Este não repete a promessa.

Se os três épicos fecharem, as **seis com código** saem riscadas e a **S-M17**
fica aberta com a razão na linha. **Vão nascer outras, e dá para dizer onde
com mais probabilidade**: o E259 é um épico de régua, e régua boa enxerga o que
antes não se via — foi assim que o E255 abriu três ao cobrir 160 citações. O
E258 é o oposto: mexe em código com julgamento já feito, e a sobra que ele pode
abrir é a de uma décima primeira leitura fora de `useMemo` que também dependa
do dia.

**O fecho declara com as quatro réguas em série no `main`** — API, frontend,
E2E e banco virgem —, e a contagem final sai de contar as tabelas, não de
somar este plano.
