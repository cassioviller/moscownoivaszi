# As oito amarelas — o plano

**Aberto em 14/08/2026**, depois de a Onda C fechar com o E217.
Base: `9ae48fcb` · Trilha: [`2026-08-13-contrato-de-papel/`](../revisao/2026-08-13-contrato-de-papel/EXECUCAO.md)
Banco das medições: **`heliumdb`** (`select current_database()`), e onde o número
é da loja está dito **`moscow_base`**.

Este plano cobre **as 8 sobras 🟡 abertas** — as únicas linhas de código de
severidade média que restam no repositório. As 39 🔵 não entram: elas são dívida
de medição, e a recomendação de sempre vale (o contrato primeiro).

> **Este documento é fonte de ORDEM e de CUIDADO, não de contagem.** A tabela do
> `EXECUCAO.md` é a fila. Este arquivo já nasce sabendo que envelhece — o plano
> irmão foi reescrito três vezes num dia.

---

## O que a medição mudou, antes da primeira linha de código

**Nenhuma das oito sobras estava inteiramente certa sobre si mesma.** As sete
correções abaixo saíram de abrir cada âncora e rodar um `SELECT`, e **quatro
delas mudam o tamanho do trabalho**:

| sobra | o que ela diz | o que está medido |
|---|---|---|
| **S-C100** | *"são TRÊS `.slice(0, 200)`"* | **são DOIS.** O terceiro (`contratos.ts:2083`) já é só **comentário** — a S-C71 o removeu. E os dois vivos andaram de linha: `reservas.ts:2048` e `:2648`, não `:1994` e `:2454`. **Mas apareceu um quarto sítio que ela não vê:** `e212-atraso-na-devolucao-api.test.ts:182` **prega o corte dentro do `expect`** |
| **S-C130** | *"o sexto enum nascerá invisível igual"* | **a divergência hoje é ZERO.** `git grep "z.enum(\[" -- artifacts/moscow-noivas/src` devolve 6 sítios, e **um é o comentário do próprio teste** (`:47`): os 5 reais estão todos em `PARES`. A lista está completa — o que está aberto é só o mecanismo |
| **S-C110** | *"muda o que dez portas respondem"* | **são 8 sítios**: `verificarDisponibilidade` tem 6 chamadores (`reserva-do-vestido.ts:65`, `agenda.ts:732`, `contratos.ts:729`, `contratos.ts:1432`, `reservas.ts:479`, `reservas.ts:1213`) mais 2 leituras diretas de `buscarBloqueiosAtivos` (`vestidos.ts:234` e `:425`) |
| **S-C96** | *"'cláusula' aparece 2 vezes e as duas são da 7ª"* | **são 6, cobrindo quatro cláusulas** (4ª, 5ª, 7ª e o § único da 8ª). O **E224 escreveu o manual da vendedora ao fechar**, e a medida envelheceu no mesmo dia. **A metade do dinheiro não mudou:** 0 "avaria", 0 "multa", 0 "juros", 0 "rescisão", 0 "exclusiva" nos cinco |
| **S-C140** | *"a conta certa já chega pronta em `POST /cancelar`"* | **certo, e é justamente o problema**: `Contrato.rescisao` existe no contrato de API (`contrato.ts:80`) e **nenhum GET o preenche** — só a resposta do cancelamento (`contratos.ts:1896-1901`). Não dá para ler antes do clique o que só nasce depois dele |
| **S-C60** | *"2 dos 127 do dev nasceram assim"* | **são 3.** A porta continua aberta e a população cresceu desde 12/08 |
| **S-C51** | — | **0 parcelas com mais de um ato**, entre **1078** `PARCELA_RECEBIDA`. A divergência falsa que ela descreve **ainda não pode acontecer** |

**A lição é a mesma das quatro levas anteriores desta trilha, e ela se repetiu
inteira: a sobra descreve o defeito no dia em que foi vista, e o repositório
anda por baixo dela.** Duas encolheram (S-C100 e S-C110), uma virou só
mecanismo (S-C130), uma foi parcialmente fechada por um épico que não sabia que
a estava fechando (S-C96), e uma cresceu (S-C60). **Enumere com `git ls-files` e
um `SELECT` antes de estimar** — é a primeira pergunta de cada épico desta
trilha desde o E213.

---

## A população, medida

O que cada conserto encontra hoje no banco. **Cinco das oito têm população
ZERO** — são mecanismo, não dívida:

| sobra | população em `heliumdb` | em `moscow_base` |
|---|---|---|
| **S-C140** | **428 contratos CANCELADOS · 311 ATIVOS** | 0 contratos |
| **S-C120** | toda a Recepção, em toda ficha de noiva com contrato | idem |
| **S-C60** | **3** bloqueios `RESERVA_CASAMENTO` sem lead e sem reserva | 116 bloqueios, **0 sem dona** |
| **S-C130** | 4 leads com `estado_civil` | — |
| **S-C110** | **0** — nenhum bloqueio tem `retirada_data_real` | 0 contratos |
| **S-C100** | **0 avarias** — a maior descrição do banco é de 0 caractere | 0 avarias |
| **S-C51** | **0** parcelas com >1 ato, entre 1078 atos | 0 parcelas |
| **S-C96** | — (documentação) | — |

**A S-C110 é a única em que o zero é um relógio, não um repouso.** O E224 criou
ontem o gesto de tela que preenche a retirada; enquanto ninguém o usou, o
defeito não tem população. **Depois que a primeira peça sair pela porta, ele
passa a ter** — e o preço dele é uma segunda noiva reservando um vestido que
está na casa da primeira.

---

## Leva 1 — o que a vendedora vê errado hoje

### S-C140 🟡 — o diálogo de cancelar não mostra o que a cláusula manda reter

**A âncora, aberta.** `contratos/[id].tsx:1025` é o diálogo; `:1068-1078` é a
escolha manual que sobreviveu ao E217:

```
( ) A noiva perdeu o sinal — mantém no caixa
( ) Devolvi o valor — estorna R$ 1.200,00 do caixa
```

A segunda opção **estorna 100% do que entrou**, e a 8ª §2º diz que a reserva
nunca volta. O E217 pôs a conta certa no servidor (`calcularRescisao`, com
retido e devolvido **por cláusula**), e o diálogo não a lê: quem cancela decide
no olho, com dois botões que o instrumento não autoriza.

**O conserto não é de tela, e é isso que a sobra não diz.** A tentação é
recomputar no front — `calcularRescisao` mora em `@workspace/financeiro-core`
(`lib/financeiro-core/src/rescisao.ts`), o front já importa o core, e há
precedente escrito: `faixa-da-avaria.ts:1` faz exatamente isso e declara no
comentário *"a conta é a mesma do servidor"*. **Só que o front não tem o
insumo.** `ItemDaRescisao` exige `exclusivaDePrimeiroAluguel` (`rescisao.ts:78`)
e `ContratoItem` não o carrega (`contratoItem.ts:11-21`) — a exclusividade vem
de `vestidos.exclusiva` (E216) cruzada com o estado de primeiro aluguel. Calcular
na tela seria **adivinhar** a metade cara da conta, e a peça exclusiva é
justamente a que retém a multa integral.

**Então é trabalho de PAYLOAD**, no formato da S-C47: o servidor **diz** o que
usou. O campo já existe no contrato de API (`Contrato.rescisao`, `contrato.ts:80`)
e hoje só é preenchido pela resposta do `POST /cancelar` (`contratos.ts:1896-1901`).

1. `GET /contratos/:id` passa a preencher `rescisao` para contrato **ATIVO**,
   com o `hoje` injetado (nunca derivado dentro) — a conta é DERIVADA, como toda
   conta desta trilha desde o E211.
2. O diálogo lê `contrato.rescisao` e **mostra as linhas antes do clique**, no
   molde do E211/E216/E218: cada cláusula com o que retém e o que devolve, e o
   total.
3. A escolha manual `destinoPago` **não some** — ela vira o caso em que a dona
   decide contra a régua, e a razão entra na trilha, como no E214.

**O que pode dar errado, e como se mede:** preencher `rescisao` em todo GET de
detalhe acrescenta a conta a uma leitura quente. Ela é pura (não bate no banco
além do que o GET já traz), mas o número de queries do handler tem de ficar
**igual** — o teste que prega isso é o mesmo formato do `verificarDisponibilidade`
("exatamente 2 queries").

**Custo:** meia sessão. Uma porta, um diálogo, sem migração.

---

### S-C120 🟡 — a ficha afirma à Recepção que a noiva não tem contrato

**A âncora, aberta e corrigida.** `noivas/[leadId]/index.tsx:209`:

```
const contratosDaNoiva = contratos.data?.itens ?? [];
```

e `:894` desenha *"Nenhum contrato ainda."* quando `length === 0`. **O 403 cai
no segundo ramo** — `data` fica `undefined`, o `??` o transforma em lista vazia,
e a tela passa a afirmar um fato. A Recepção tem `contratos: NADA` desde o E172
**e é quem atende o telefone**: a noiva liga perguntando do contrato dela, e a
ficha diz que não existe.

**O card Orçamentos tem a forma idêntica** (`:208` e `:863`) e hoje não aparece
só porque a Recepção tem `SO_VER` ali. **Consertar um e deixar o outro é meio
conserto** — é a lição do E172 sobre a porta ao lado, na mesma tela.

**O conserto é o idioma que a ficha já tem:** distinguir *"não há"* de *"você
não pode ver"*. As duas consultas passam a olhar `isError` + o status, e o card
diz a segunda frase em vez da primeira.

**O que pode dar errado:** um 403 do `activeLojaId` errado é indistinguível de um
403 de perfil. O teste tem de encenar a **Recepção de verdade** (o perfil
semeado), não um 403 fabricado — é o formato do `12-permissoes` do E2E.

**Custo:** curto. Duas telas, sem servidor, sem migração.

---

### S-C100 🟡 — o corte no meio da palavra, nos dois sítios que sobraram

**Dois sítios vivos, não três**, e os dois em `reservas.ts`:

| sítio | o que grava | tamanho | cortado |
|---|---|---|---|
| `:2048` | `Reparo de avaria — ${avaria.descricao}` | até **1019** (a descrição tem `maxLength: 1000` no spec) | **819** |
| `:2648` | `Atraso na devolução — ${explicacaoDoAtraso(cobranca)}` | **275** com 3 peças | **75** |

O segundo **cresce com o número de peças**, e o que ele engole primeiro é a
última linha da explicação — *"Total R$ 1.340,00."*, que é a linha que a noiva
confere no portal.

**A coluna é `text`**, sem teto: a S-C71 já mediu (`character_maximum_length`
nulo) e o corte saiu de lá sem nada para respeitar. **Não há limite a honrar nem
coluna a aumentar** — os dois `.slice` saem.

**O quarto sítio, que a sobra não vê, é o mais útil:**
`e212-atraso-na-devolucao-api.test.ts:182` **prega o corte dentro do `expect`**:

```
expect(linha!.descricao).toBe(`Atraso na devolução — ${antes.body.explicacao}`.slice(0, 200));
```

Tirar o corte **reprova esse teste**, e é o vermelho que se quer: ele documenta
que a régua concordava com o defeito. O assert passa a comparar a frase inteira.

**Dívida no banco: zero** — 0 avarias nos dois bancos, e a maior descrição tem 0
caractere. É mecanismo.

**Custo:** uma hora, com o vermelho reproduzido antes.

---

## Leva 2 — os manuais, que a Onda C acabou de liberar

### S-C96 🟡 (+ S-C20, S-C45, S-C88, S-C97, S-C113 🔵)

**A regra do E196 destravou ontem:** manual se reescreve **depois da onda**, e a
Onda C fechou com o E217. Esta leva estava esperando por isso e por nada mais.

**O retrato de hoje, por documento** — e ele não é o que a sobra descreve:

| manual | "cláusula" | "retirada" | avaria | multa | juros | rescisão | exclusiva |
|---|---|---|---|---|---|---|---|
| `vendedora.html` | **5** | 12 | 0 | 0 | 0 | 0 | 0 |
| `noiva.html` | 1 | 3 | 0 | 0 | 0 | 0 | 0 |
| `recepcao.html` | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| `costureira.html` | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| `proprietario.html` | 0 | **0** | 0 | 0 | 0 | 0 | 0 |

**O E224 já escreveu metade do que faltava** — a vendedora aprendeu as cláusulas
4ª, 5ª e o § único da 8ª quando o gesto da retirada nasceu, e a noiva aprendeu a
7ª no E221. **A metade que falta é inteira do lado do dinheiro**, e é a mais
cara: nenhum dos cinco documentos diz que existe avaria, multa, juros, rescisão
ou peça exclusiva.

**O que cada manual passa a saber:**

- **vendedora** — a avaria e a faixa das 14ª/15ª (E214), como corrigir uma
  avaria já registrada (S-C11), a fila do atraso e o sino (S-C32), a peça
  exclusiva no seletor (E216), a rescisão no cancelamento (E217 + S-C140), e o
  **passo 10 que falta** (`S-C97`: o manual termina em *"9 · O contrato"*, e a
  peça ainda sai e volta).
- **noiva** — a multa e os juros da 9ª, que **ela lê no portal dela** e hoje
  chegam sem nome; a devolução como data que a 10ª cobra.
- **proprietário** — a 16ª (a peça que não voltou tem preço), a rescisão, e a
  atualização de *"O que espera uma decisão sua"*, que hoje lista pendências já
  decididas.
- **recepção** e **costureira** — o mínimo: o que elas veem e o que **não**
  veem, que é justamente o assunto da S-C120.

**A régua tem um buraco conhecido, e ele entra nesta leva:** a
`varredura-manuais` confere o **MENU**, e a `varredura-manuais-prazos` só sabe
**tempo** (5 constantes em ms) — a S-C95 mede que os números das cláusulas são
dinheiro, multiplicador e percentual, e o manual pode escrever *"R$ 300,00 de
piso"* com a suíte verde. **Fechar a leva sem estender a régua é reabrir a
S-C96 no próximo épico**, e é exatamente o que aconteceu entre o E196 e hoje.

**Custo:** uma sessão. Cinco documentos, nenhuma linha de código de produto —
mas a régua nova é código.

---

## Leva 3 — o que muda o que o sistema responde

### S-C110 🟡 — a peça que saiu e não voltou some do acervo quando o contrato cai

**A âncora, aberta.** `disponibilidade.ts:437`:

```
isNull(bloqueioVestidosTable.canceladoEm),
```

e a régua física só roda sobre o que essa consulta devolve (`:528-532`).
**Cancelar o contrato solta a peça ao acervo enquanto ela está na casa da
noiva** — outra noiva a reserva para a mesma data, e a dupla promessa só aparece
no dia da retirada, quando não há vestido. É a classe da S-M7 e da S-M24, pelo
caminho do cancelamento de contrato.

**O alcance, enumerado:** 8 sítios, não dez.

| sítio | o que faz |
|---|---|
| `disponibilidade.ts:518` (`verificarDisponibilidade`) | o gate de toda verificação de conflito |
| ↳ `reserva-do-vestido.ts:65` · `agenda.ts:732` · `contratos.ts:729` · `contratos.ts:1432` · `reservas.ts:479` · `reservas.ts:1213` | os 6 chamadores do gate |
| `vestidos.ts:234` · `vestidos.ts:425` | leem `buscarBloqueiosAtivos` direto (acervo em lote e por peça) |

**O conserto provável** é um predicado em vez de um `isNull`: cancelado **com
retirada real e sem devolução real continua ocupando**, porque cancelar um
contrato não traz o vestido de volta. É exatamente a decisão que a S-C85 já
declarou por escrito do lado do dinheiro — *"quem discrimina é
`retiradaDataReal`, porque cancelar não traz o vestido de volta"* —, e aqui ela
vale do lado da disponibilidade. **As duas metades do sistema passam a usar o
mesmo critério**, e é esse o argumento para o predicado e não para um `if` local.

**Por que fazer agora, com população zero:** hoje **nenhum bloqueio tem
`retirada_data_real`** (medido: 0 em `heliumdb`). O E224 acabou de entregar a
tela que preenche esse campo. **Consertar antes da primeira retirada é barato;
depois é conserto de dado**, com peça prometida a duas noivas.

**Custo: o maior dos oito.** Muda o que oito sítios respondem, e a regra 11
manda **E2E completo antes do commit** — o gate da disponibilidade é o que mais
specs cruzam. **Merece número de épico: E225.**

---

### S-C130 🟡 — `PARES` é curada, e hoje ela está completa

**Medido, e é o oposto do que a sobra teme:** `git grep "z.enum(\["` sobre
`artifacts/moscow-noivas/src` devolve **6 ocorrências, e uma é o comentário do
próprio teste** (`enums-do-contrato.test.ts:47`). Os **5 reais** —
`atendimentos/novo.tsx:82`, `catalogo/novo.tsx:32`, `noiva-form.tsx:48`,
`noiva-form.tsx:68` e `orcamentos/[id].tsx:150` — **estão todos em `PARES`**.

**Divergência hoje: zero.** O que está aberto é o mecanismo: nada obriga o sexto
a entrar, e o quinto (`estadoCivil`, seis valores, em toda noiva) **só entrou
porque quem escreveu o E215 foi conferir à mão**.

**O conserto é o da S-C33 e o da S-C55, pela terceira vez:** derivar em vez de
curar. `PARES` passa a sair de uma varredura por `git ls-files` sobre
`pages/**`, casando cada `z.enum([` com o tipo do contrato de API pelo nome do
campo. **O critério tem de ser declarado**, como o da S-C33 foi — e a exceção,
se houver, **nomeada**, porque exceção sem defeito medido é a lista curada
nascendo pela outra ponta (é a S-C56 dizendo isso).

**A prova de que a régua nova enxerga:** encenar um sexto enum sintético e
confirmar que ele reprova **sem tocar em teste nenhum** — foi assim que a S-C33
provou o derivado dela (`parcelas.protestada_em`).

**Custo:** curto, e é a mais segura das oito: com divergência zero hoje, a
contagem antes e depois tem de ser **idêntica**, e qualquer diferença é achado.

---

## Leva 4 — as duas que esperam DECISÃO, não código

Estas duas **não se fecham escrevendo código**, e pô-las na fila de execução
seria inventar decisão que não é minha. As duas viram **pergunta à dona**.

### S-C60 🟡 — a loja segura a peça antes de saber de quem será?

**A âncora, aberta e corrigida.** O handler está em `reservas.ts:943` (a sobra
diz 929 — o arquivo andou). Ele prova vestido, lead e reserva contra a loja
(`:952-968`), prova os dois um contra o outro (R5/V4, `:978`), prova a reserva-mãe
contra o cancelamento (R7, `:1001`) — e **nunca exige que uma das duas âncoras de
dona exista**. `RESERVA_CASAMENTO` sem `leadId` **e** sem `reservaId` nasce 201,
com `donoDoBloqueio` nulo para sempre.

**O argumento que protegia a porta caiu, e está medido.** Ele era o número:
recusar seria *"trocar um defeito raro por uma parede diária"*, medida em 97% em
2026-07. Hoje a parede tem largura **zero** — 0 de 116 em `moscow_base` — e a
S-C80 já fechou o buraco do dinheiro (`AVARIA_SEM_DONA`, 422). **A população do
defeito cresceu de 2 para 3** desde 12/08.

**A pergunta, na língua de quem decide:**

> Quando a vendedora segura um vestido para uma data, ela **sempre sabe de qual
> noiva é**? Ou existe o gesto de segurar a peça antes de a noiva estar
> cadastrada — *"reserva para a moça que veio ontem"*?
>
> - **Sempre sabe** → a porta passa a recusar, e `lead_id` vira `NOT NULL` por
>   migração. As 3 órfãs de hoje precisam de dona antes.
> - **Nem sempre** → a porta fica como está, e o que se conserta é a **tela**
>   (a S-C112: hoje quem abre um bloqueio órfão com avaria não vê saída **nem vê
>   o motivo**).

### S-C51 🟡 — o carimbo da conciliação precisa de casa própria?

**A âncora, aberta.** `conciliacao.tsx:147-158` monta **um movimento por
PARCELA**, datado pelo `recebidoEm`. Contra um extrato que traz as duas linhas
do banco (R$ 300,00 em 01/03 e R$ 700,00 em 15/03), a tela produz **três
divergências falsas** de um pagamento correto.

**Dividi-la exige carimbo por ATO, e não há onde carimbar.**
`parcelas.conciliado_em` (`financeiro.ts:617` e `:631`) é coluna **por linha**:
marcar um pedaço marcaria o outro, **escondendo divergência** — o oposto do que
a conciliação existe para fazer. Carimbo por ato pede a tabela `recebimentos`
que o **E221 recusou por escrito**.

**A população diz que dá para esperar, e o número é limpo: 0 parcelas com mais
de um ato, entre 1078 `PARCELA_RECEBIDA`.** A divergência falsa **ainda não pode
acontecer** — ela nasce no dia em que a primeira parcela for recebida em dois
pedaços, e o motor que divide isso é do S-C31, de anteontem.

**A pergunta é de modelagem, e é a mesma que o E221 recusou:** nasce a tabela
`recebimentos`, ou a conciliação continua respondendo *"a parcela"* enquanto o
resto do financeiro já responde *"o movimento"*? **Fecham juntas a S-C52** (o
carimbo da contadora, meio passo atrás do CSV) **e a S-C53** (três leituras
menores que ainda datam pelo último pedaço).

---

## A ordem, e a razão dela

| # | o quê | por quê agora | custo |
|---|---|---|---|
| 1 | **S-C140** | dinheiro, e é a metade do E217 que a vendedora não vê. **428 cancelados** já passaram por esse diálogo | meia sessão |
| 2 | **S-C120** | a tela **afirma um fato falso** a quem atende o telefone, e o conserto é o idioma que a ficha já tem | curto |
| 3 | **S-C100** | dois sítios, dívida zero no banco, e o teste que prega o defeito já existe para reprovar | ~1 h |
| 4 | **S-C96** + as 5 🔵 irmãs | a Onda C fechou ontem — é a regra do E196, e ela destravou | 1 sessão |
| 5 | **S-C110** (**E225**) | população zero **hoje**, e o E224 abriu a torneira ontem. Depois da primeira retirada vira conserto de dado | a maior · E2E completo |
| 6 | **S-C130** | régua, divergência zero: a contagem antes e depois tem de ser idêntica | curto |
| 7 | **S-C60** | **espera a dona** — pergunta escrita acima | decisão |
| 8 | **S-C51** (+S-C52, S-C53) | **espera decisão de modelagem**, e a população é zero | decisão |

**Os itens 1 a 3 cabem numa sessão** e fecham as três amarelas que alguém vê
hoje. O item 5 é o único que merece número de épico.

**A ordem não é por severidade — as oito são 🟡.** É por **quem já sente o
defeito**: 428 contratos passaram pelo diálogo do item 1, toda Recepção passa
pelo item 2, e ninguém passou ainda pelos itens 5, 7 e 8, cuja população é zero.
O item 5 sobe na frente dos itens 6–8 **porque o relógio dele começou a andar
ontem**.

---

## O que este plano não faz

**Não estima horas para os itens 4 e 5.** As referências medidas nesta trilha
são E218 ~1 h, E222 ~1 h30, E215 uma sessão inteira; o item 5 muda o que oito
sítios respondem e pede E2E completo (**6,6 min**, em série, no banco de dev).

**Não decide nada que seja da dona.** As duas perguntas da Leva 4 estão escritas
como perguntas, e as **4 pendências** (P1–P4) e as **2 decisões** (D4, D7) que já
esperavam continuam esperando — este plano não as toca.

**E não mexe nas 39 🔵.** Elas continuam na tabela do `EXECUCAO.md`, que é a
fila.

## O que precisa ser lembrado antes de começar

- **O `main` tem 7 commits inéditos** (`origin/main..main`), retidos por
  credencial (`gh auth login`), não por decisão. Todo worktree de agente nasce
  em `origin/main` — a regra 29 mede o custo de deixá-lo para trás.
- **A régua não está medida desde a S-C101** (API 1618 · 222 arquivos). O E217
  entrou depois. **Meça antes de citar.**
- **O `gitsafe-backup` está 198 commits atrás** do `main` e é ancestral. Se ele é
  a rede de segurança desta máquina, ela não pega a trilha do contrato inteira.
