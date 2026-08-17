# A fila do `/code-review max` — a execução

A tabela de épicos abaixo é a **fila**. A **fonte da verdade do que continua
aberto é a tabela S-R2…S-R19** da conferência —
[`2026-08-16-conferencia-do-contrato/EXECUCAO.md`](../2026-08-16-conferencia-do-contrato/EXECUCAO.md),
seção *"O que o `/code-review max` achou depois"* —, e é lá que cada linha é
riscada com o hash do commit que a fecha (regra 21). **Conte aquela tabela,
não este arquivo.**

Plano: [`2026-08-16-a-fila-do-review-max-plano.md`](../../propostas/2026-08-16-a-fila-do-review-max-plano.md)
· Base: `619f347d`

## O que a revisão abriu

Dez ângulos sobre `fb3dcb50`, **19 achados**, conferidos um a um antes de
entrar na tabela — nenhum descartado. A S-R1 (a suíte de API vermelha no
`main`) fechou em `3c71d474` e virou a **regra 35**. Eram **18 abertos:
1 🔴 · 7 🟠 · 8 🟡 · 2 🔵**, em **6 épicos**. Sete deles nasceram da fila do
mesmo dia (E242, E244, E245, higiene, E248).

**A FILA ESTÁ INTEIRA EXECUTADA** — contado em 17/08/2026, com as quatro
réguas fechadas: **as 18 estão riscadas, ZERO S-R abertas.** O E249 e o E250
saíram na mão; o **E251, E252, E253 e E254 saíram de quatro agentes em
paralelo**, divididos pelo recurso compartilhado
([o plano](../../propostas/2026-08-17-as-15-abertas-com-agentes-plano.md)), e
integrados um a um.

**Régua do fecho: API 1905 (272 arquivos) · frontend 1037 (113 arquivos) ·
E2E 187 em 6,5 min, 0 skipped · banco virgem inteiro (16) · typecheck verde
em 5 projetos.**

**Ao fim desta fila o repositório tinha 8 sobras abertas: 0 🔴 · 0 🟠 · 3 🟡 ·
5 🔵** — as **sete** que os agentes acharam de passagem (tabela abaixo) e a
**S-M17**, que espera o dump de uma instalação real que ainda não existe.
Começou o dia em 15. Essas oito são o que o **fecho das 8** foi buscar, e a
contagem de hoje está na seção dele, mais abaixo. **Conte as tabelas, não este
parágrafo.**

**O que o lote ensinou sobre o diagnóstico, e é o que vale guardar:** das 14
sobras executadas, **nove tinham o mecanismo ou o número errado** — e nas duas
direções. Para MENOS: o dano da S-R2 era R$ 48.000,00 e não R$ 12.000,00 (o
caput da 16ª multiplica por peça); a S-R15 tinha cinco citações em dois
manuais e não uma; o S-R8 tinha dois ciclos; a S-R16 tinha três ações, e a
terceira é a que não tem volta. Para MAIS: o dano vivo da S-R5 era R$ 0,00
(nenhuma parcela com mês cheio de mora); a S-R7 descrevia o par de opções ao
contrário, e o mecanismo não pode produzir aquele par. E uma estava **errada
na causa**: a **S-R11** culpava a visibilidade pool × `tx`, quando em READ
COMMITTED as duas leituras veem o mesmo instante — o conserto que ela
prescrevia teria dado verde sobre caminho torto. Quem fecha é a tranca.

*Uma correção de contagem, feita aqui em 17/08:* o cabeçalho da conferência
publicava *"1 🔴 · 8 🟠 · 8 🟡 · 2 🔵"*, que soma **19** para **18** linhas.
Contadas uma a uma, as 18 são **1 🔴 · 7 🟠 · 8 🟡 · 2 🔵**. O número errado
tinha sido copiado para o ponteiro, para o plano e para este arquivo.

## A fila

| Épico | Tese | Fecha | Estado |
|---|---|---|---|
| ~~**E249**~~ | ~~a data do papel segue o casamento, e todo mundo lê a mesma data~~ | S-R2 🔴, S-R3 🟠, S-R12 🟡 | ✅ `458adf11` · [relatório](execucao/E249.md) — o papel recalcula pela janela nova quando o casamento é adiado (hora preservada, e só cede à 4ª); `disponibilidade.ts` lê `fimPrevistoDaDevolucao` pelo SELECT que já existia; o `PATCH /contratos` derruba a fila. Vermelho antes: `expected 48000 to be +0` — e a sobra dizia R$ 12.000,00, porque o caput da 16ª multiplica POR PEÇA. API 1878 · E2E 187 |
| ~~**E250**~~ | ~~o que se escreve num banco que já existe~~ | S-R5 🟠, S-R9 🟠 | ✅ `91012acb` · [relatório](execucao/E250.md) — a faxina apaga o índice de exemplo pela marca (que virou constante), e NÃO um filtro no leitor, que desfaria a decisão do E242; o backfill da S-A27 ganha `loja_id` nas três pontas e a vírgula vira `JOIN … ON`. **A sobra errava para MENOS o alcance do S-R9 e para MAIS o dano vivo do S-R5**: hoje ele cobra R$ 0,00 (nenhuma das 110 parcelas tem mês cheio de mora). Duas réguas novas, as duas medidas em vermelho. API 1881 · banco virgem 16 |
| ~~**E251**~~ | ~~as portas ao lado, segunda passada~~ | S-R4 🟠, S-R8 🟠, S-R10 🟡, S-R11 🟡, S-R13 🟡 | ✅ `0bff780c` · [relatório](execucao/E251.md) — as duas pontas do ciclo tomam as linhas na mesma ordem (**eram DOIS ciclos, não um**), `perdoar-mora` decide sob `FOR UPDATE`, e a conta do atraso sobe de dentro da transação. **A S-R11 errava o mecanismo** e está dito na linha dela. Vermelho antes: 10 de 13, com `deadlock detected` literal nas duas pernas e `expected 4250 to be 3750`. Retrato de trancas 45/13/14 → 50/10/12, dívida 14 → 12 |
| ~~**E252**~~ | ~~o envio à contabilidade é por ATO, não por parcela~~ | S-R6 🟠 | ✅ `4d271353` · [relatório](execucao/E252.md) — declarar é por ATO, no molde da conciliação do E235; o carimbo da parcela vira DERIVADO. Migração com backfill rodada no `heliumdb` (`INSERT 0 0`, 0 de 322 carimbadas). **A armadilha tem número**: limpar o carimbo declararia R$ 1.400,00 sobre R$ 1.000,00 recebidos |
| ~~**E253**~~ | ~~as telas apagam e mostram o que o banco tem~~ | S-R7 🟠, S-R16 🟡, S-R17 🟡, S-R19 🔵 | ✅ `a5c9c630` · [relatório](execucao/E253.md) — o alvo do apagar vem da identidade e a lista encolhe por `reset`, não por `remove()` (que ligaria o `isDirty`); as invalidações viram famílias nomeadas, com varredura contra a sexta grafia. **As quatro sobras erravam para MAIS.** Frontend 1017 → 1037 (108 → 113 arquivos) |
| ~~**E254**~~ | ~~a letra e a régua~~ | S-R14 🟡, S-R15 🟡, S-R18 🔵 | ✅ `f0f4b5d6` · [relatório](execucao/E254.md) — o seletor que nunca existiu (um e-mail não é um UUID), as CINCO citações mortas em DOIS manuais, e a cerca que só cercava quem já tinha nome. **A regra 34 fechada com execução pelo orquestrador**: com a guarda removida de propósito, o `e2e/64` novo reprova com `Received: 1`; o velho passaria |

## O fecho das 8 — E255, E256, E257

Plano: [`2026-08-17-as-8-que-sobraram-plano.md`](../../propostas/2026-08-17-as-8-que-sobraram-plano.md)
· Base: `28ca37cc`

As 8 que a fila do review max deixou abertas. **Duas saíram sem código, e o
plano disse por quê antes de começar**: a **S-RM10** já estava paga (virou
emenda à regra 29 em `2656568d` — sobra cujo conserto é uma regra fecha quando
a regra está escrita), e a **S-M17 não é nossa para fechar** (ela pede o dump
de uma instalação real, e a dona respondeu em 16/08 que a instalação real
ainda não existe). Sobraram **seis com código**, em três épicos.

| Épico | Tese | Fecha | Estado |
|---|---|---|---|
| ~~**E255**~~ | ~~a régua lê a tela como a noiva a lê, e a citação que não é tela declara que não é~~ | S-RM2 🟡, S-RM4 🔵 | ✅ `f422195b` · [relatório](execucao/E255.md) — o corpus vira a UNIÃO do fonte cru com o fonte RENDERIZADO (as regras de espaço do JSX), e a colheita passa de "citação que nomeia cláusula" para toda aspa curva dentro de `<em>`. **13 → 160 citações na régua; 94 conferidas LITERALMENTE.** O épico tinha permissão de fechar DECLARANDO e não precisou dela |
| ~~**E256**~~ | ~~três frestas pequenas, e cada uma tinha a sua régua no lugar errado~~ | S-RM7 🔵, S-RM8 🔵, S-RM9 🔵 | ✅ `0c136b19` · [relatório](execucao/E256.md) — entra o `useDiaLocal()`, que re-renderiza uma vez por virada, e o sino lê o dia dele em TRÊS sítios; o `useFieldArray` é varrido (população 1, zero ofensores); `parcelas` → `recebimentos` em SEIS frentes, não quatro. **A S-RM7 estava aberta por uma razão factualmente ERRADA**, herdada do E253 |
| ~~**E257**~~ | ~~o `/admin` ganha cena nos dois botões que spec nenhum clicava~~ | S-RM3 🔵 | ✅ `517cf46d` · [relatório](execucao/E257.md) — **executado pelo orquestrador, porque a régua que o fecha é o E2E** e worktree não isola porta (S-O93). Três asserções por metade, e a terceira é o BANCO. **O número que ele publicou estava errado e está corrigido no relatório**: o `e2e/64` tem 3 testes antes e depois — a cena entrou DENTRO do teste do `:108` |

**Régua do fecho, as quatro medidas em série no `main` em 17/08: API 1905
(272 arquivos, 10,6 min) · frontend 1044 (115 arquivos, 27,2 s) · E2E 187 em
6,5 min, 0 skipped · banco virgem inteiro (16, 1 min) · typecheck verde em 5
projetos.** As três medidas que o lote moveu batem com o que os relatórios
prometeram, exceto uma: o frontend saiu de 1037 (113 arquivos) para **1044
(115)**, como o E256 declarou, e o **E2E ficou em 187**, contra os 188 que o
E257 publicou.

**O E257 publicou um número que não foi medido onde ele é afirmado, e isso é a
regra 35 outra vez.** O `e2e/64` tem **três** `test(` antes (`f0f4b5d6`) e
**três** depois: a cobertura dos dois "Editar" entrou como seis asserções
dentro do teste do `:108`. O "4 passed" que o relatório leu era *1 do projeto
`setup` (`playwright.config.ts:80`, o `auth.setup.ts`) + 3 testes do arquivo* —
e a prova estava dentro do próprio relatório, cujo vermelho da regra 34 numera
o teste que falhou como `✘  2`. **A cobertura é real; o total da suíte é que
foi deduzido de uma execução de arquivo único.** Corrigido no relatório do
E257, com a lição escrita ao lado da do diagnóstico: contar dentro do arquivo
é o que acerta, deduzir o todo a partir da parte é o que erra.

**O ponto de encontro dos dois agentes não colidiu.** O E256 avisou que a
`varredura-das-varreduras` obriga os dois a mexer nas mesmas quatro linhas e
que o número tem de ser **recontado depois da integração, não somado de
cabeça**. Recontado: o E255 não criou varredura nenhuma — ele engordou a
`varredura-manuais-textos`, que já existia —, então o `toBe(37)` que o E256
escreveu é o número certo, e a API inteira o confirma.

**Contado nas tabelas com as quatro réguas fechadas: o repositório tem 7
sobras abertas — 0 🔴 · 0 🟠 · 2 🟡 · 5 🔵.** São a **S-M17** (que espera a
instalação real), a **S-RM11** 🟡 e as cinco 🔵 **S-RM12, S-RM13, S-RM14,
S-RM15 e S-RM16**. As sete S-RM que a fila do review max deixou estão todas
riscadas; **seis nasceram deste lote**, e a maior delas é maior que a sobra
que a revelou: a **S-RM11** conta 38 chamadas de `hojeLocal()` em 17 telas, 11
delas dentro de um `useMemo` sem o dia nas dependências. **Não há fila de
código em curso.**

**E o plano errou a única previsão que fez.** Ele fecha dizendo: *"se os três
épicos fecharem, o repositório fica com **uma** sobra aberta — a S-M17"*. Ficou
com **sete**. O erro não é de contagem, é de modelo: o plano contou o que ia
ser riscado e não contou o que ia NASCER, e este lote abriu seis. Não é
acidente do lote — é o que sempre acontece quando a régua nova é boa: o E255
prometia cobrir a prosa dos manuais e, ao cobrir 160 citações, passou a
enxergar as 253 que ficam de fora (S-RM15) e a fresta que a própria régua
deixa (S-RM14). **Previsão de estoque de sobras só vale se disser quantas o
trabalho vai abrir, e nenhum plano deste repositório soube dizer isso ainda.**

## O fecho das 7 — E258, E259, E260

Plano: [`2026-08-17-as-7-sobras-plano.md`](../../propostas/2026-08-17-as-7-sobras-plano.md)
· Base: `b8394db2`

As 7 que o fecho das 8 deixou abertas. **Uma sai sem código e a razão é a
mesma de ontem**: a **S-M17** não é nossa para fechar enquanto a instalação
real não existir. Sobram **seis com código**, em três épicos — o E258 e o E259
por agente, em paralelo (não se cruzam em arquivo nenhum), e o E260 pelo
orquestrador, porque a régua que o fecha é o E2E.

| Épico | Tese | Fecha | Estado |
|---|---|---|---|
| ~~**E258**~~ | ~~o dia vira nas telas que o leem parado~~ | S-RM11 🟡, S-RM12 🔵 | ✅ `3e1cce5f` · [relatório](execucao/E258.md) — seis telas passam a ler o dia do `useDiaLocal()`; **42 chamadas em 17 telas, 10 em `useMemo`** (a sobra dizia 38 e 11, e o plano dizia 40 — o recorte `.tsx` esquecia dois helpers `.ts`), e **depois são 26 chamadas e ZERO em memo**. **Os dez julgamentos do plano foram confirmados e DOIS tinham a razão trocada**: em `orcamentos/[id].tsx` a prévia VIRA o corpo do `POST /contratos`, então tela e servidor concordam e o contrato **nasce com a entrada vencida**; é em `contratos/[id].tsx` que a tela não manda o campo e o servidor grava pelo dia dele. Frontend 1044 (115) → **1052 (117)**, medido no `main` |
| ~~**E259**~~ | ~~a citação do manual, terceira passada~~ | S-RM14 🔵, S-RM15 🔵, S-RM16 🔵 | ✅ `e969dfe6` · [relatório](execucao/E259.md) — o critério da S-RM15 é **de marcação, não de conteúdo**: a citação que tem CASA entra, a que flutua num parágrafo fica fora e contada. **Régua 213 → 349 das 466 aspas curvas**, e a colheita nova achou **três frases envelhecidas na primeira execução** — a que ensina é o `vendedora.html:803`, a MESMA renomeação do E248 que produziu o `:800`, seis linhas acima, viva através de três épicos. A S-RM14 fechou DECLARANDO com o custo medido (o critério automático reprovaria **41 dos 79 moldes**), e **o E255 tinha errado o guarda**: a trava de 72 não pega o gesto que abre a fresta. A S-RM16 executou a decisão da dona — e **a medição que a sustentava contava duas frases onde há SEIS** |
| ~~**E260**~~ | ~~a porta da contabilidade ganha cena~~ | S-RM13 🔵 | ✅ `c5820408` · [relatório](execucao/E260.md) — **a única sobra deste lote que não precisou de correção nenhuma no diagnóstico**, e a cena achou um 🟠 na mesma tela: a janela que ALARGA sozinha (S-RM17). O custo de descobri-la foi real — 302 recebimentos carimbados no `heliumdb`, restaurados por SQL. `e2e/15` vai de 6 para 7 testes |

**A decisão da S-RM16 foi respondida pela dona em 17/08** e está na tabela de
Decisões abaixo: a tela perde as aspas retas, o manual não muda. O E259
executou sem perguntar de novo — e mediu que **a pergunta tinha sido feita
sobre duas frases quando são seis**.

**Régua do fecho, as quatro medidas em série no `main` em 17/08: API 1905
(272 arquivos, 12,2 min) · frontend 1053 (117 arquivos, 37,4 s) · E2E 188 em
7,1 min, 0 skipped · banco virgem inteiro (16, ~1 min) · typecheck verde em 5
projetos.** O frontend saiu de 1044 (115) e o E2E de 187 — e **o número do
frontend não é a soma dos dois relatórios de cabeça**: o E258 mediu 1052 (117)
no worktree dele e o E259 mediu 1045 (115) no dele, cada um sem enxergar o
outro. Integrados, são **1053 em 117**, e é a recontagem que vale (regra 36).
O **E2E 187 → 188** é o teste do E260, e o único do lote que muda a suíte de
cena.

**Nenhum dos três épicos errou o número que publicou** — os três foram
medidos onde são afirmados, e é a primeira vez em três lotes que a integração
não corrige nenhum.

**Contado nas tabelas com as quatro réguas fechadas: o repositório tem 9
sobras abertas — 0 🔴 · 2 🟠 · 2 🟡 · 5 🔵.** São a **S-M17** (que segue
esperando a instalação real) e as **oito S-RM17…S-RM24**, todas nascidas
deste lote. As duas 🟠 são as que mordem: a **S-RM17** (a janela do envio à
contabilidade que alarga sozinha, sobre um botão de mão única) e a **S-RM19**
(o catálogo recusando sem aspas e confirmando com elas, que é consequência de
uma decisão tomada sobre uma medição estreita). **Não há fila de código em
curso.**

**E o plano acertou ao não repetir a promessa.** O das 8 previu uma sobra
aberta no fim e ficaram sete; este fechou dizendo *"este não repete a
promessa"* — e o lote abriu **oito**. Continua valendo o que o fecho anterior
escreveu: trabalho que constrói régua nova enxerga mais do que fecha, e
**nenhum plano deste repositório soube ainda dizer quantas sobras vai abrir.**
O que mudou é que agora está dito antes, e não descoberto depois.

## O fecho das 9 — E261, E262, E263, E264

Plano: [`2026-08-17-as-9-sobras-plano.md`](../../propostas/2026-08-17-as-9-sobras-plano.md)
· Base: `7ff25889`

As 9 abertas depois do fecho das 7. **Uma sai sem código pela TERCEIRA vez, e
o plano disse por quê antes de começar**: a **S-M17** pede o dump de uma
instalação real que ainda não existe. As outras oito saíram em **quatro
épicos, os quatro por agente em paralelo**, divididos por arquivo — nenhum
toca banco, nenhum roda E2E, nenhum toca as tabelas de Sobras.

**O plano já corrigiu duas antes de o trabalho começar.** A S-RM17 fechava
dizendo que o tamanho dela era desconhecido: contado, são **8 telas com a
fresta, 3 com a troca de pontas do `resolverIntervalo`, e 1 com escrita
irreversível** — três camadas, três números, e a sobra não tinha nenhum. E a
S-RM22, que pedia para a família ser decidida de uma vez, tinha um **terceiro
sítio fora de sobra nenhuma** (`contratos/[id].tsx:315`).

| Épico | Tese | Fecha | Estado |
|---|---|---|---|
| ~~**E261**~~ | ~~a janela não alarga sozinha~~ | S-RM17 🟠 | ✅ `d9dbf558` · [relatório](execucao/E261.md) — **o conserto prescrito no plano não consertava, e isso foi medido antes de ser dito**: o updater funcional do `react-router` recebe o `searchParams` da renderização. Entrou o `useEscritaNaUrl()`, que acumula as escritas do frame. **A fresta era de 21 escritores, não de 8; o alargamento é de 4 telas, não de 3.** Frontend 1053 (117) → **1074 (119)** medido no `main` com o E264 dentro. A linha da integração é `dcd6b608`: o `e2e/15` volta ao gesto humano, e a guarda dele pega a regressão em **3 de 4 execuções** — não é determinística, e a cena passa a dizer isso |
| **E262** | a aspa reta sai das frases que uma pessoa lê | S-RM19 🟠, S-RM20 🔵, S-RM21 🔵, S-RM22 🔵 | em execução (agente) |
| ~~**E263**~~ | ~~os manuais, quarta passada: a citação ganha casa~~ | S-RM23 🔵, S-RM24 🔵 | ✅ `938e1d0a` · [relatório](execucao/E263.md) — **as 114 entraram inteiras, zero ficaram de fora**, e a régua vai de **349 para 463 das 466**; as 3 restantes são as duplicatas, conferidas na linha do recado, com a conta fechando DENTRO da régua. **Três correções ao diagnóstico**, e a que mais ensina é o `recepcao.html:332`: ele estava VERDE cobrando uma frase que a tela não escreve, por causa de um comentário no corpus. `varredura-das-varreduras` inalterada em 37; nenhum PDF reimpresso, com a comparação de texto visível colada. Frontend 1053 (117) → **1075 (119)** medido no `main` com o E261 e o E264 dentro |
| ~~**E264**~~ | ~~o dia fora do memo vira também, e a chave anda com ele~~ | S-RM18 🟡 | ✅ `04004623` · [relatório](execucao/E264.md) — **as sete confirmadas como classe e TRÊS desmentidas no dano**, porque `de` e `desde` são PISO: a chave congelada pede janela mais LARGA e nada some. A régua do E258 ficou verde o dia inteiro com os sete vivos (a fronteira dela era uma frase num docblock), e a sexta grafia passa a casar o `const` que alimenta uma `…QueryKey` — **um salto, e isso está escrito nela**. **A sobra contava 7 em 4 arquivos e são 8 em 5.** Frontend 1053 (117) → **1057 (118)** |

**A linha da integração é minha** e só existe depois do E261: o
`e2e/15-onda5-pdf-e-folha.spec.ts` volta ao gesto humano — preencher De e Até
em sequência —, que hoje está proibido por comentário citando a S-RM17. É a
prova de ponta a ponta de que a fresta fechou, e agente nenhum pode rodá-la
(worktree não isola porta, S-O93).

## Decisões

| Pergunta | Recomendação | Estado |
|---|---|---|
| **E249** — casamento adiado: a data de devolução do papel recalcula pela janela nova, anda os mesmos dias, ou fica onde está? | **Recalcula pela janela nova** (E224: janela de uso andando até dia de expediente), preservando a hora; a retirada anda junto | aberta — executada na recomendação |
| **S-RM16** (E259) — a tela escreve `"Marfim" classifica…` com aspas retas e o manual cita sem elas: quem cede? | **A TELA perde as aspas retas, e o manual não muda** — `routes/catalogo.ts:109` e `:217`. O repositório tem 9 aspas retas coladas a interpolação e **7 são protocolo** (ETag, `Content-Disposition`); as únicas duas em frase que uma pessoa lê são estas, e `routes/agenda.ts:232` já nomeia sem aspa nenhuma. Nenhum teste afirma a frase | **DECIDIDA pela dona em 17/08, na recomendação** e executada no E259 (`e969dfe6`) — a citação continua molde (nome e dois números interpolados); o que muda é que quem procurar na tela o que leu no manual passa a achar. **A recomendação estava certa e a medição que a sustentava estava ESTREITA**: são 17 ocorrências em produção — 10 de protocolo, 1 de arranque e **SEIS em frase que uma pessoa lê**, não duas. As quatro que ficaram de fora estão na tabela como S-RM19 🟠 e S-RM20 🔵, e a 🟠 é consequência da própria decisão: **o catálogo passa a recusar sem aspas e a confirmar com elas, a dois cliques de distância** |

## Sobras

Sobra NOVA, vista de passagem durante esta execução, entra aqui no mesmo
commit que a viu (regra 12) e sai riscada no que a fecha (regra 21). As
S-R\* não moram aqui: elas moram na tabela da conferência.

| ID | Sev. | Onde | O que | Estado |
|---|---|---|---|---|
| ~~S-RM14~~ | 🔵 | `varredura-manuais-textos` (o molde de pedaço único) | ~~**A fresta que sobrou do E255, medida e escrita.** Um `data-tela` com UM pedaço só, escolhido entre os inofensivos, deixa a metade envelhecida da frase passar: o `vendedora.html:800` como era antes do E254 REPROVA sem declaração e REPROVA com os dois pedaços, e **passa com um pedaço só**. O guarda hoje é a contagem travada em **72 moldes**, não a máquina. O agente tentou fechá-la automaticamente e **todo piso quebra** nos moldes de texto fixo curto ou com nome de exemplo dentro~~ | ✅ `e969dfe6` (E259) — **fechada DECLARANDO, com o custo do critério automático MEDIDO em vez de afirmado**: a regra candidata (*"os pedaços declarados cobrem todo o texto que não pareça valor"*) reprovaria **41 dos 79 moldes de hoje**, e o que sobra nesses 41 é nome de exemplo, dia da semana, mês por extenso e texto fixo do outro lado de uma interpolação. Os três cenários do E255 reproduzem na letra. **E o E255 errou o guarda**: a trava de 72 NÃO pega o gesto que abre a fresta — reduzir um molde de dois pedaços a um deixa o total onde estava. A trava nova é a do subconjunto (**49 moldes de um pedaço só**), e foi a única a acusar: `expected 50 to be 49` |
| ~~S-RM15~~ | 🔵 | `docs/manuais/**` (as 253 que sobram) | ~~Os manuais têm **466 aspas curvas**; **213 estão cobertas** depois do E255. As 253 restantes vivem em `<strong>` (86), prosa nua (99), `<td>` fora das tabelas de recado (23), `<p>` (19), títulos (15) e `<b>` (11). Não é a mesma classe da S-RM2 — boa parte é ênfase de escrita, não citação de tela —, e por isso não entrou: **falta separar o que é citação do que é grifo** antes de decidir se há régua a construir~~ | ✅ `e969dfe6` (E259) — **fechada por CÓDIGO, e a premissa da sobra estava errada para MENOS**: das 250 aspas de fora com texto próprio, **203 já existem na tela LITERALMENTE** — a maioria é citação de verdade, não ênfase de escrita. O critério não é por conteúdo nem por tag, é por **onde a declaração pode morar**: a aspa que é o conteúdo INTEIRO de um `<strong>`, `<b>`, `<td>`, `<h*>`, `<p>` ou `<li>` tem casa e entra (136, sendo 115 já batendo); a que flutua num parágrafo com outras sete fica fora, contada. **Régua 213 → 349 das 466** (75%). A colheita nova achou **três frases envelhecidas na primeira execução**, e a que ensina é `vendedora.html:803` (*"Perdoar multa e juros"* contra *"Perdoar multa, juros e correção"*): **a MESMA renomeação do E248 que produziu o `:800`, seis linhas acima**, atravessando E248, E254 e E255 intacta por estar num `<strong>` quando o recorte era `<em>`. **A distribuição por tag da sobra não reproduz sob classificador nenhum** — só os totais reproduzem, e o número honesto de textos distintos sem régua é **250**, não 253 |
| ~~S-RM16~~ | 🔵 | `routes/catalogo.ts:109,217` × `proprietario.html:711` · `lib/prova-orfa.ts:76-77` × `vendedora.html:950` | ~~Duas citações que a régua nova NÃO consegue casar por diferença de PONTUAÇÃO, não de conteúdo: o código escreve `"Marfim"` com aspas retas e o manual cita sem elas; o código diz `…marcada — confirme com ela…` e o manual cita `"Confirme…"` maiúsculo, como frase inteira. Nenhum dos dois é defeito de comportamento — é a fronteira do que a comparação literal alcança~~ | ✅ `e969dfe6` (E259) — a decisão da dona executada nas duas linhas do `catalogo.ts`, e o `C` maiúsculo do `vendedora.html:949` corrigido (a citação deixou de ser molde e virou LITERAL). **A medição que sustentou a decisão estava estreita**: são **17** ocorrências de aspa reta colada a interpolação em produção — 10 de protocolo, 1 de arranque e **SEIS em frase que uma pessoa lê**, não duas. As quatro que sobram viraram sobra (S-RM19, S-RM20). **E a previsão do plano estava errada**: o pedaço declarado de `proprietario.html:711` NÃO cresceu — quem o limita é a interpolação, não a aspa |
| ~~S-RM11~~ | 🟡 | `dashboard.tsx:244,247` e `:321`, e mais nove sítios | ~~**A mesma classe da S-RM7 fora do sino — e MAIOR que a sobra que a revelou.** `hojeLocal()` aparece **38 vezes em 17 telas**, e **11 delas dentro de um `useMemo`** sem o dia nas dependências. Duas foram lidas e conferidas pelo agente do E256: a fila de cobrança do painel e o `deHoje` da agenda **ficam em ontem numa aba deixada aberta pela virada**. O `useDiaLocal()` já existe (E256); falta julgar as onze uma a uma — nem toda leitura de `hojeLocal()` num `useMemo` é defeito~~ | ✅ `3e1cce5f` (E258) — **a sobra errava os números nas duas direções**: são **42** chamadas em `pages`+`components` (40 nas telas `.tsx` e 2 em helpers `.ts`), **17 telas** — exato — e **DEZ** dentro de `useMemo`, não onze; o 11º era o do sino, já pago pelo E256. Zero em `useCallback`. Seis telas passam a ler o dia do `useDiaLocal()`, e depois do épico são **26 chamadas e ZERO dentro de memo**. **A metade que a sobra calou é dinheiro, e as duas telas erram de jeitos DIFERENTES** — em `orcamentos/[id].tsx` a prévia vira o corpo do `POST /contratos` e o contrato nasce com a entrada VENCIDA; em `contratos/[id].tsx` a tela não manda `vencimentoEntrada` e o servidor grava pelo `hojeLocal()` dele |
| ~~S-RM12~~ | 🔵 | `sino-aviso-de-erro.test.tsx:37-39` | ~~**O harness mente sobre memoização**: as mocks devolvem `{ data: [] }` NOVO a cada chamada, então toda dependência parece instável. Foi ele que quase fez o agente do E256 confirmar a razão errada do E253 (mediu 4 chamadas em 4 renders). Teste que mede o próprio harness em vez do código é a classe da regra 34 vista pelo avesso~~ | ✅ `3e1cce5f` (E258) — as cinco mocks construíam o objeto de retorno DENTRO de cada chamada, e o react-query devolve a mesma referência enquanto o dado não muda. **A sobra errava o número**: são **2 avaliações na montagem e 5 em quatro renders**, não 4 em 4 — o 4 era o do arquivo irmão. Com constantes de módulo: **1 e 1** |
| ~~S-RM13~~ | 🔵 | `financeiro/folha.tsx` ("Enviar à contabilidade") × `e2e/**` | ~~**Nenhum E2E abre esta porta**, e o E252 e o E256 mexeram nos dois lados dela (o envio virou por ATO; o campo da resposta virou `recebimentos`). O toast diz *"N saída(s) e M recebimento(s) do período"* — lendo `undefined`, ele imprime *"undefined recebimentos"* em vez de estourar, que é o pior modo de falhar. Mesma classe da S-RM3 e da S-CF2~~ | ✅ `c5820408` (E260) — **as três afirmações da sobra estavam certas; é a única do lote que não precisou de correção.** A cena põe as duas pontas no mesmo dia de 2024 (uma saída paga e um recebimento), então o recado é cobrado com número EXATO — *"1 saída e 1 recebimento do período."* — e a terceira asserção é o BANCO, na granularidade por ATO que o E252 escreveu. Vermelho da regra 34, com o campo devolvido ao nome de antes do E256: `Received: "1 saída e undefined recebimento do período."` |
| ~~S-RM17~~ | 🟠 | `financeiro/folha.tsx:316-323` × `financeiro-core/src/datas.ts:188` | ~~**A janela do envio à contabilidade ALARGA sozinha quando as duas pontas são editadas no mesmo frame — e o botão que ela alimenta é de mão única.** `atualizarParams` monta o próximo `URLSearchParams` a partir do `searchParams` da renderização em que o handler nasceu: a segunda edição não vê a primeira, e o parâmetro anterior cai fora da URL (medido: `?ini=2024-04-04` → `?fim=2024-04-04`, sem o `ini`; com 400 ms entre as duas, os dois sobrevivem). Perdido o `ini`, ele volta ao primeiro dia do mês corrente, fica MAIOR que o `fim` recém-digitado, e o `resolverIntervalo` **troca as pontas** — a janela vira `2024-04-04..2026-08-01`. Os dois campos exibem outra coisa (`De 2024-04-04`, `Até 2026-08-31`), que não é a janela que o clique usa. **O dano é medido, não hipotético**: a primeira execução do teste do E260 declarou 302 recebimentos do `heliumdb` (restaurados por SQL; a linha de auditoria fica, que a trilha é append-only). Falta a varredura: **a mesma `atualizarParams` existe em outras telas de janela do financeiro, e o tamanho da sobra é desconhecido por isso**~~ | ✅ `d9dbf558` (E261) — **e o conserto que o diagnóstico prescrevia NÃO consertava.** O plano leu a assinatura de tipos do `react-router@7.18.1` e prescreveu o updater funcional; a implementação (`chunk-3WDNQUW5.mjs:10854`) entrega ao updater `new URLSearchParams(searchParams)` de dentro de um `useCallback` com deps `[navigate, searchParams]` — **o valor da renderização, tão velho quanto o outro**. Medido antes de consertar: `expected null to be '2024-04-04'` no componente que aplica a prescrição. Entrou o `useEscritaNaUrl()`, que acumula as escritas do FRAME e se cura sozinho quando a URL de verdade diverge. **E a fresta era de 21 escritores, não de 8** — o critério do plano deixava passar as 12 telas que já usavam a forma "certa" e as 2 que escreviam objeto literal; o alargamento é de **4** telas (o `fluxo.tsx:42` é o quarto chamador do `resolverIntervalo`) e a escrita irreversível confere em 1. **A tela também não mentia sobre a janela**: os campos são `value={intervalo.iniYMD/fimYMD}`, pós-troca — o `Até 2026-08-31` que a sonda do E260 leu era valor de antes do re-render. Frontend 1053 (117) → 1070 (118) no worktree |
| ~~S-RM18~~ | 🟡 | `components/barra-atendimento.tsx:43` · `provas/index.tsx:43-44` · `noivas/[leadId]/index.tsx:199` · `atendimentos/novo.tsx:219,226` | ~~**O que sobra da S-RM11 depois do E258: a mesma classe FORA do `useMemo`.** A chave de query é montada no corpo de uma tela que nunca re-renderiza — **7 chamadas em 4 arquivos**, população pequena e nomeada uma a uma. A mais cara é a `barra-atendimento`, que é o **irmão do sino**: ela está em TODA tela, vive na aba que o ateliê deixa aberta, e depois da virada consulta a agenda de ontem — o atendimento em curso de hoje não aparece na barra que existe para mostrá-lo. A varredura que o E258 escreveu não as pega, e a fronteira dela diz isso na letra. **Dois casos foram lidos e EXCLUÍDOS com a razão escrita**: `atendimentos/config.tsx:430` (o `hojeLocal()` é lido no clique, que é o momento certo de perguntar que dia é hoje) e `financeiro/projecao.tsx:57` (é o dia CONFERIDO do caixa, estado inicial — consertá-lo trocaria a data que a pessoa escolheu)~~ | ✅ `04004623` (E264) — **as sete confirmadas como CLASSE e TRÊS desmentidas no DANO**, que é a separação que a sobra não fazia: `de` e `desde` são PISO, então a chave congelada pede uma janela mais LARGA e nada some. A `barra-atendimento` é a mais cara e confirma inteira (sem filtro de cliente, ela só lê `atendimentos.data`, e o dado não muda porque a chave é a de ontem); as duas de `provas/index.tsx` põem a prova de ontem na lista errada dos DOIS lados; em `noivas/[leadId]` e `novo.tsx:226` o que vale é o RENDER, não a chave, e `novo.tsx:219` tem dano ZERO. **E a sobra contava 7 em 4 arquivos quando são 8 em 5** — o oitavo é `financeiro/projecao.tsx:82`, que ficou de fora por ser território de outro épico e entra como S-RM25. Frontend 1053 (117) → **1057 (118)** 
| S-RM19 | 🟠 | `catalogo/[atributoId]/editar.tsx:145` e `:180` | **O catálogo passa a RECUSAR sem aspas e a CONFIRMAR com elas** — e é consequência direta da decisão da S-RM16, executada com a medição estreita. Os dois toasts da mesma tela escrevem `` `"${atributo.nome}" saiu do catálogo.` `` e `` `"${opcaoParaApagar.valor}" saiu de "${atributo.nome}".` `` (o segundo com DUAS). Quem apaga uma opção lê *Marfim classifica 3 peça(s)…* na recusa e *"Marfim" saiu de "Cor".* na confirmação, **na mesma sessão, a dois cliques de distância**. A decisão foi tomada sobre *"as únicas duas em frase que uma pessoa lê"*, e **são seis**. O E259 não tocou porque `src/pages` era do E258 | aberta (E259, 17/08) — **a decisão da dona precisa saber que o alcance era o triplo** |
| S-RM20 | 🔵 | `lib/documento-na-porta.ts:41` · `admin/perfis.tsx:81` | As outras duas da mesma família: `` `${tipo} "${valor.trim()}" não é um ${tipo} válido: …` `` e `` `"${nome}" nasce sem acesso nenhum — marque na matriz o que ele pode.` ``. **As duas são frase que uma pessoa lê, e nenhuma é protocolo** — estão fora da decisão só porque a medição que a sustentou contava duas onde havia seis | aberta (E259, 17/08) |
| S-RM21 | 🔵 | `financeiro/folha.tsx:524` × `proprietario.html:615` | **A mesma classe da S-RM16 pelo avesso**: a TELA cita um rótulo entre aspas RETAS (*"…o envio é aqui embaixo, em "Fechar com a contabilidade"."*) e o manual o italiciza, sem elas. O molde teve de parar antes da aspa por causa disso — o pedaço declarado é `— o envio é aqui embaixo, em`, e o rabo da frase fica fora da régua | aberta (E259, 17/08) |
| S-RM22 | 🔵 | `routes/catalogo.ts:110` | **Duas linhas abaixo da que perdeu as aspas, elas ficaram**: a continuação da mesma mensagem diz `desmarque \"Atributo ativo\"` — aspa reta em volta de um rótulo FIXO, que é caso diferente do da interpolação e não estava na decisão. Fica registrada para que a próxima passada **decida a família inteira de uma vez**, em vez de uma linha por épico | aberta (E259, 17/08) |
| ~~S-RM23~~ | 🔵 | `docs/manuais/**` (as 114 sem casa) | ~~O resíduo NOMEADO da S-RM15, e **o trabalho que o fecha é de MARCAÇÃO, não de régua**: envolver cada citação solta num `<span>` próprio dentro do parágrafo. **88 das 114 já batem com a tela** e entrariam sem declaração nenhuma; as 26 que não batem estão classificadas — 10 molde, 8 fala, 8 grifo~~ | ✅ `938e1d0a` (E263) — **entraram as 114, e ZERO ficaram de fora.** A permissão de deixar algumas para trás não precisou ser usada porque a deformação foi MEDIDA: o texto visível dos cinco manuais sai idêntico ao de antes (um `<span>` sem classe não emite caractere). **70 entraram sem declaração e 44 com ela** (7 moldes, 9 falas, 28 grifos) — o E259 previu 88/26, e a diferença de 18 tem duas origens medidas: **12 das 88 batiam só dentro de um COMENTÁRIO do fonte** e 6 batem em código real sem serem citação de tela. **Um sítio deformava de verdade e foi consertado em vez de excluído**: o `noiva.html:596` mora num `div.trilha` cujo CSS casava `span` DESCENDENTE, e o span novo desenharia um chip dentro de um chip — virou `.trilha > span` nos cinco manuais, com os seis blocos conferidos |
| ~~S-RM24~~ | 🔵 | `docs/manuais/**` (três duplicatas fora do `<em>`) | ~~Três aspas curvas repetem, palavra por palavra, uma célula das tabelas *"O recado"* **fora de um `<em>`** — o E255 abateu as 3 que estavam em `<em>` e não viu estas. São conferidas pela via do recado e não custam nada; ficam registradas porque **são a diferença entre o 253 da sobra e o 250 medido**~~ | ✅ `938e1d0a` (E263) — **fechada com a conta DENTRO da régua**, não com registro: o teste novo afirma `466 = 463 + 3 + 0 soltas`. E o diagnóstico estava errado — **as três duplicatas estão DENTRO de um `<em>` e são exatamente as que o E255 abateu**; não há segundo trio. O conjunto pré-E259 tem **sete** repetições de célula de recado, não seis |
| S-RM25 | 🟡 | `financeiro/projecao.tsx:82` → `:91` → `:94` | **A S-RM18 no quinto arquivo, e ela nasce de uma EXCLUSÃO malfeita — a minha.** O E258 excluiu o `projecao.tsx:57` com razão certa (é o dia CONFERIDO do caixa, estado inicial que não deve mudar sozinho), e a exclusão foi escrita **lendo a linha, não o arquivo**: 25 linhas abaixo, `const hoje = hojeLocal()` alimenta a `janela` que vira `getListPagamentosQueryKey`, e é a classe inteira da S-RM18. O E264 não fechou porque `financeiro/**` era território do E261/E262. **A lição está no relatório dele: achado tem âncora obrigatória, exclusão não tem** | aberta (E264, 17/08) — **conferida no `main`** |
| S-RM26 | 🔵 | `vestidos/utilizacao.tsx:63-66` | **A mesma classe atrás de um helper de uma linha, e ela escapa das DUAS grafias da varredura.** O `useMemo` congela o dia por trás do `diaISO`, e tanto a grafia do E258 (dentro de `useMemo`) quanto a do E264 (o `const` que alimenta uma `…QueryKey`) procuram o NOME `hojeLocal` — uma indireção de um salto as cega. A régua do E264 segue **um** salto e isso está escrito nela; este é o caso que pede o segundo | aberta (E264, 17/08) |
| S-RM27 | 🔵 | `noivas/helpers.ts:41` · `reservas/helpers.ts:61` | A mesma indireção **no display**, em seis telas: o helper chama `hojeLocal()` para contar dias, e quem o chama não sabe que está lendo o dia. Não é chave de consulta — o dano é a contagem exibida envelhecer numa aba aberta pela virada —, e por isso é 🔵 e não a mesma linha da S-RM26 | aberta (E264, 17/08) |
| S-RM28 | 🟡 | `financeiro-core/src/datas.ts:188` × as 4 telas de janela | **A troca de pontas do `resolverIntervalo` sobrevive ao conserto do E261, e ela é silenciosa.** Fechada a fresta do frame, ainda dá para alargar a janela em UMA edição: digitar `De = 2026-08-31` sobre um `Até = 2026-01-01` devolve oito meses, e o campo "De" passa a exibir **outra data** — a que o `resolverIntervalo` decidiu —, sem aviso nenhum, no mesmo botão de mão única. A troca existe para ser tolerante com URL montada à mão; o preço é que ela reinterpreta o gesto da pessoa sem dizer | aberta (E261, 17/08) |
| S-RM29 | 🔵 | `hooks/use-escrita-na-url.ts:53-54` | O acumulador do frame vive no MÓDULO, e isso supõe **um roteador por contexto de JS** — verdade hoje (`App.tsx:356`, um `createBrowserRouter`), e o hook se cura no primeiro render se deixar de ser (se a URL real difere da última pedida, a URL ganha). Fica registrado porque a suposição está no código e não no tipo | aberta (E261, 17/08) |
| S-RM30 | 🟡 | `lib/varredura-manuais-textos.test.ts` (o corpus) | **O corpus da régua inclui os COMENTÁRIOS do fonte, e por isso ela aprova citação que a tela não escreve.** Medido pelo E263: **8 das 549 citações que a régua já cobrava têm todos os pedaços só em docblock**, e o caso vivo é o `recepcao.html:332`, que cobrava *"você não pode ver"* — a tela escreve *"Você não tem permissão para ver … desta noiva."* (`sem-lista.tsx:45`) e o verde vinha de um comentário em `estado-consulta.ts:52`. **O conserto é do corpus, não das citações** | aberta (E263, 17/08) — **8 de 549, com o caso vivo nomeado** |
| S-RM31 | 🔵 | `costureira:448` · `proprietario:347` e `:496` · `vendedora:317` e `:908` | Quatro citações são conferidas DUAS vezes (criadas pelo E259) e duas cruzam manuais. Não é defeito de comportamento — é trabalho repetido dentro da régua, e vale arrumar antes que o número da cobertura passe a contar a mesma frase duas vezes | aberta (E263, 17/08) |
| S-RM32 | 🔵 | `proprietario.html:728` | **A cobertura de citação de UMA palavra é nominal.** O *"não"* declarado ali aparece **7.964 vezes** no corpus: renomear o rótulo da tela deixa a régua verde do mesmo jeito. É a fresta da S-RM14 com outra roupa — declaração curta demais para provar coisa alguma | aberta (E263, 17/08) |
| S-RM33 | 🔵 | as outras varreduras | **Varrer as varreduras à procura de piso `>=` publicado como NÚMERO.** O E263 achou que o E259 publicou 136/118 citações com casa quando são **139/121**, e nada mudou nos manuais desde então: o que escondeu foi a forma da assertiva — `toBeGreaterThanOrEqual` fica verde com 139, com 200 e com 2.000. Trocado por `toBe` ali; **as outras varreduras não foram conferidas** | aberta (E263, 17/08) |
| ~~S-RM5~~ | 🟡 | `CLAUDE.md` (a régua) × `2026-08-11-otica-dos-papeis/EXECUCAO.md:246` | ~~**O ponteiro mandava procurar um defeito já consertado.** Ele publicava *"o frontend reprova entre 00:00 e 03:00 UTC pela S-O119"*, e a **S-O119 fechou no E198** — está riscada. Medido pelo agente do E253: **1037 verdes às 01:57, 01:59 e 02:04 UTC**, três vezes dentro da janela dada como maldita. Classe S-A5 com o custo INVERTIDO: em vez de esconder trabalho, ensina a atribuir ao fuso um vermelho verdadeiro — e eu repeti a frase no plano deste lote, de onde ela foi para o prompt de quatro agentes~~ | ✅ riscado no `CLAUDE.md` e no plano em 17/08 |
| ~~S-RM6~~ | 🟡 | `comissoes/index.tsx` (`onGerarFechamento`) | ~~**A S-R16 não era uma ação, eram TRÊS**, e a terceira é a que não tem volta: **"Fechar competência"**. Competência fechada é imutável e a prévia passa a responder da memória do fechamento (`routes/comissao.ts:963-969`) — depois do clique, o número na tela e o que virou conta a pagar ficavam com fontes diferentes. Fechada junto no E253; fica registrada porque o diagnóstico da S-R16 não a continha~~ | ✅ `a5c9c630` (E253) — registrada por ser correção ao diagnóstico |
| ~~S-RM7~~ | 🔵 | `sino-notificacoes.tsx:241` | ~~O `useMemo` que decide o id do aviso **não depende do dia**: numa aba aberta pela virada da meia-noite o aviso conserva o id de ontem até o poll mexer numa dependência. **Declarado, não consertado** — o conserto recalcularia a lista a cada render~~ | ✅ `0c136b19` (E256) — **e a razão de ela estar aberta era factualmente ERRADA**: o E253 dizia que o conserto recalcularia a lista a cada render, e `hojeLocal()` devolve STRING, que é dependência estável (medido: o corpo do `useMemo` roda 1 vez em 4 renders, antes e depois). A sobra também era incompleta — pôr o dia nas dependências é necessário e insuficiente, porque o poll de 5 min não re-renderiza quando a fila segue em erro. Entrou `useDiaLocal()`, que re-renderiza UMA vez por virada, e o sino lê o dia dele em TRÊS sítios: o id do aviso, a frase do caixa negativo e a **janela da agenda**, que não estava na sobra e pedia as 24h de ontem |
| ~~S-RM8~~ | 🔵 | `moscow-noivas` (todos os `useFieldArray`) | ~~A classe que produziu a S-R7: **um campo `id:` no schema de um array de `useFieldArray`** é sobrescrito pela chave do próprio hook, e a identidade some da linha — daí o alvo passar a ser resolvido por posição. Não varrido (era escopo de outro épico), e é barato de procurar~~ | ✅ `0c136b19` (E256) — **fechada por varredura, população 1**: o repositório tem UM `useFieldArray`, com UM `z.array(z.object)`, já pago pelo E253. Zero ofensores. Fica a cerca para o próximo, com o vermelho CONSTRUÍDO (regra 34): devolvendo `opcaoId` ao nome `id`, ela nomeia o arquivo |
| ~~S-RM9~~ | 🔵 | `lib/api-spec/openapi.yaml:8243` (`EnviarContabilidadeResultado.parcelas`) | ~~Desde o E252 o campo conta **RECEBIMENTOS**, não parcelas — a descrição já dizia *"Recebimentos declarados"*, e o NOME do campo é que ficou meio passo atrás. Renomear mexe no spec, nos dois clientes gerados e na tela, para um número cujo significado não muda para quem lê a frase~~ | ✅ `0c136b19` (E256) — **a sobra dizia quatro frentes; são SEIS**: 1 no spec, 3 gerados, 1 na rota, 1 na tela e **9 asserções em 2 testes de API** (a varredura por `marcados` achava só duas). `parcelas` → `recebimentos`. Vermelho: com a rota no nome velho, 7 de 7 em `500 RESPOSTA_FORA_DO_CONTRATO` |
| ~~S-RM10~~ | 🟡 | o prompt de todo agente com worktree | ~~**O worktree de agente nasce sem `node_modules`.** Antes de qualquer régua: `pnpm install --frozen-lockfile` (15,9 s) e `pnpm run typecheck:libs` da raiz — senão o `tsc` cospe **TS6305 `lib/api-client-react/dist/index.d.ts` has not been built** e 30 erros fantasmas, e o agente vai caçar defeito que não existe. Irmã da regra 29, e cabe no prompt como ela~~ | ✅ `2656568d` — **fechada por REGRA, não por código**: virou a emenda da regra 29 no METODO (o primeiro gesto do agente com worktree tem duas linhas, não uma). Sobra cujo conserto é uma regra fecha quando a regra está escrita |
| ~~S-RM2~~ | 🟡 | `docs/manuais/*.html` × as telas que elas citam | ~~**A prosa citada dos manuais não tem régua, e o E254 provou com um caso vivo.** São **161 aspas curvas em `<em>`** nos manuais; **82 batem literalmente com a tela e 79 não**. A família nova que o E254 escreveu (aspa que nomeia cláusula, em qualquer tag) cobre **13**. A prova é `docs/manuais/vendedora.html:800`: frase de sistema, envelhecida pelo E248, corrigida à mão no E254 — e nenhuma régua olhava para ela. **O atalho foi tentado e reprovou na regra 34**: a peneira automática por segmentos fixos derruba 79 → 52 e **aprova o próprio `:800`** (o segmento que sobra tem 17 caracteres); não entrou, e foi certo não entrar~~ | ✅ `f422195b` (E255) — **fechada por CÓDIGO, não por declaração**: a colheita passa de "citação que nomeia cláusula" para toda aspa curva dentro de `<em>`, com `data-tela` aceitando VÁRIOS pedaços (e cobrando todos) e `data-fala` estreando a categoria "isto não é tela" que o E254 disse faltar. **13 → 160 citações na régua; 2 → 94 conferidas LITERALMENTE.** Das 79 divergentes, ZERO seguem sem cobertura |
| ~~S-RM3~~ | 🔵 | `e2e/64-portas-ganham-tela.spec.ts` × `admin/index.tsx:493,585` | ~~`e2e/64` é o **único E2E que abre `/admin`**, e `editar-loja-${loja.id}` e `editar-usuario-${u.id}` nunca são clicados por spec nenhum. É a mesma tela da S-R19, e a mesma classe da S-CF2 (a porta que ganhou tela e nenhum E2E encena)~~ | ✅ `517cf46d` (E257, feito pelo orquestrador porque a régua é o E2E) — a loja vazia e a pessoa nova passam a ser EDITADAS antes de apagadas, sobre as fixtures que já existiam. Três asserções por metade: o diálogo abriu, abriu no ALVO (o campo vem com o nome da fixture — é o `reset`), e o BANCO mudou. Vermelho da regra 34: com `onSalvarLoja` sem o `mutateAsync`, o toast "Loja atualizada" aparece e o banco fica com o nome velho — `Received: "E2E Loja vazia 1786935640613"`. **A única das quinze do dia que não precisou de correção nenhuma** — e ela nasceu de quem já estava DENTRO do arquivo |
| ~~S-RM4~~ | 🔵 | `varredura-manuais-textos` × JSX | ~~A varredura compara a citação do manual com o **código-fonte cru**, e o JSX parte frases no meio: três das 11 declarações do E254 tiveram de escolher um fragmento mais curto que a frase da tela (`noivas/[leadId]/index.tsx:692-694`, `contratos/index.tsx:252-253`, `peca-exclusiva.ts:72-73`). A régua vale; o que ela compara é menos do que promete~~ | ✅ `f422195b` (E255) — o corpus vira a UNIÃO de duas leituras: o fonte cru e o fonte RENDERIZADO com as regras de espaço do JSX (`{" "}` é espaço, outra chave é barreira, e **tag colada em tag é barreira, não emenda** — sem isso dois `<p>` irmãos virariam uma frase que ninguém lê, e o `costureira.html:358` é esse caso). União, nunca substituição: o corpus só cresce |
| ~~S-RM1~~ | 🟡 | `disponibilidade.ts` (`janelasSemOlharCancelamento`) × `reservas.ts` (`PATCH /reservas`) × `contratos.ts` (`POST /contratos`) | ~~**A data do papel agora ESTICA a janela física, e ninguém revalida os dias que ela estica.** Desde o E249/S-R3, `fimUsoPrevisto` é `fimPrevistoDaDevolucao` — e o papel do E224 anda para a frente até dia de expediente, logo é `≥ casamento + usoDiasDepois`. O `PATCH /reservas` valida a disponibilidade do candidato pela JANELA (`casamento + 2`) e grava um papel que pode ir a `+3` ou `+4`; o `POST /contratos` grava `dataDevolucao` vinda da sugestão da tela sem consultar disponibilidade nenhuma. Nos dias entre a janela e o papel a peça fica ocupada por uma escrita que o 409 não viu. Casamento sábado, janela até segunda (fechada), papel na terça: a terça é ocupada sem ter sido validada. **Não é regressão do E249** — o `POST /contratos` já gravava assim desde o E224; o que o E249 fez foi dar efeito de ocupação a um campo que antes não tinha nenhum. O conserto é passar o papel novo ao candidato antes de validar (e validar no `POST /contratos`), e mora na mesma família da S-R8: precisa da ordem de trancas do E251~~ | ✅ `0bff780c` (E251) — `dataDevolucaoDoPapel` desce DENTRO do candidato nas duas portas, então a disponibilidade valida os mesmos dias que a escrita vai ocupar. Nascida no E249 e fechada no lote seguinte |
