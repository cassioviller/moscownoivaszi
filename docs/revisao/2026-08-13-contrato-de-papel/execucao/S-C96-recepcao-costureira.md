# S-C96 (recepção + costureira) — as duas que veem menos aprendem a fronteira

**Trilha do contrato de papel, leva 2 dos manuais · agente da recepção e da
costureira** · branch `worktree-agent-a0607bcf883eed118` · base `d5733a96`
(a fundação da régua de dinheiro)
Fecha: a parte de **S-C96 🟡** que cabe nestes dois documentos
Suíte: `varredura-manuais` · `varredura-manuais-prazos` · `varredura-manuais-textos`
— **3 arquivos, 13 testes, verdes** · typecheck **verde nos 5 projetos** ·
API e E2E **não rodados** (nenhuma linha de código de produto mudou; regra 11
não morde: os manuais não são lidos por tela nenhuma)

---

## O que o plano errou, e as quatro correções são de MEDIÇÃO

O plano trata estes dois como *"o mínimo: o que elas veem e o que **não** veem"*.
A medição concorda com a tese e discorda de três dos quatro conteúdos que ela
prescreve — e acha um quinto que não estava na lista.

### 1. A costureira **não registra avaria**, e isso inverte a seção inteira

A tarefa manda o manual dizer *"que registrar o dano com foto na devolução é o
que sustenta a cobrança"*. Ela não pode registrar. Medido nas duas pontas, antes
da primeira linha de HTML:

| onde | o que a fonte diz |
|---|---|
| `api-server/routes/reservas.ts:92` | `router.use("/lojas/:lojaId/bloqueios", requireModulo("vestidos"))` |
| `api-server/routes/reservas.ts:1651` | `POST /bloqueios/:bloqueioId/avarias` — **sem ação declarada**, herda o gate do prefixo |
| `api-server/middlewares/auth.ts:143` | `const exigida = acao ?? acaoDoRequest(req.method, …)` — POST vira **`criar`** |
| `api-server/lib/configuracao-inicial.ts:159` | Costureira: `vestidos: SO_VER` |
| `api-server/lib/configuracao-inicial.ts:58` | `SO_VER = { ver: true, criar: false, editar: false }` |

E a tela concorda com a porta, o que é o desenho certo e o que torna o achado
invisível para quem só lê a lista de módulos: o formulário **não existe** para
ela, não é um botão que dá 403.

```
moscow-noivas/src/pages/reservas/[bloqueioId].tsx:508
  const podeRegistrarAvaria = podeNoModulo(acessosModulos, "vestidos", "criar");
:1294  {podeRegistrarAvaria && ( … formulário … )}
```

**O que ela tem é a LISTA** (`:1110-1290`, `GET` sob o mesmo `ver`): a descrição,
a cláusula ao lado (*"limpeza (14ª)"* / *"dano (15ª)"*), o reparo estimado, quem
registrou, a data e o link **ver foto**. Nenhum botão — `podeMovimentar`
(`vestidos.editar`, `:501`) esconde cobrar, corrigir e remover.

**A inversão é o conteúdo do manual, não um detalhe dele.** *"Ela é quem vê o
dano primeiro"* deixa de ser a introdução de uma instrução de registro e passa a
ser a instrução inteira: **chamar quem registra com a peça ainda na mão**. A
própria tela já escreve essa urgência para o outro perfil —
`reservas/[bloqueioId].tsx:1755`: *"Depois que ela voltar para a arara, um dano
encontrado não tem mais como ser cobrado com prova."* — e a costureira, que é
quem enxerga o dano primeiro, é a única a quem ninguém a diz.

### 2. A recepção não responde *"quando devolvo o vestido?"* — ela **não vê a data**

A tarefa lista a pergunta entre as que ela responde. Medido: a resposta está na
ficha da noiva desde ontem (S-C91) e **não chega a ela**.

```
moscow-noivas/src/pages/noivas/[leadId]/index.tsx:164
  enabled: !!activeLojaId && !!leadId && podeVerContratos
:223  const contratosDaNoiva = contratos.data?.itens ?? [];
:444  const locacao = locacaoDaNoiva(contratosDaNoiva);
:760  {locacao && ( <Dado rotulo="Retirada" …/> <Dado rotulo="Devolução" …/> )}
```

Com `contratos: NADA` (`configuracao-inicial.ts:153`) a consulta nem sai, a lista
é `[]`, `locacaoDaNoiva` devolve `null` e **as duas linhas não existem na tela
dela**. O docblock do épico que as criou (`lib/locacao-da-noiva.ts:9`) declara o
motivo: *"quem atende o telefone abre a ficha da NOIVA"* — e quem atende o
telefone é exatamente o perfil que não as recebe
(`configuracao-inicial.ts:82`: *"Recepção marca e remarca a agenda o dia
inteiro… contrato, nada"*). Virou a **S-C220** abaixo. No manual, a pergunta
mudou de *resposta* para *encaminhamento*, que é o que o sistema pratica hoje.

### 3. Faltava na lista a única cláusula que a recepção **escreve**

A tarefa desenha a recepção como consumidora do contrato. Ela é a autora de um
parâmetro dele, e ninguém tinha escrito isso em manual nenhum:

```
api-server/routes/agenda.ts:258
  router.use("/lojas/:lojaId/disponibilidade", requireModulo("agenda"));
moscow-noivas/src/pages/atendimentos/config.tsx:567-620
  <Label>Retirada e devolução</Label> · Abre · Fecha · Fecha no sábado · dias
```

Ela tem `agenda: TUDO`, então o segundo expediente do E222 — **a cláusula 4ª** —
é editável na mesma tela de Cabines & horário que o manual já chamava de *"esta
tela é sua"*. E ele decide o que o `POST /contratos` aceita. **Um manual que
descreve a tela e cala o segundo expediente ensina a mudar um achando que mudou
os dois**, que é literalmente o risco declarado no comentário do JSX. Entrou como
linha da tabela e como aviso.

### 4. O contorno do E196 sobrou — e o documento se contradizia em três lugares

A tarefa mandou conferir se restava alguma rotina de contorno de defeito
consertado. Restava, e é a mesma doença do E184 na costureira, dez épicos depois:

> `docs/manuais/costureira.html`, bloco *"Uma confecção sem vestido do acervo não
> tem por onde nascer"*: **"A confecção pura … não tem tela onde ser cadastrada
> hoje."**

O **mesmo documento** já dizia o contrário em dois pontos — a seção 1 descreve o
botão `Nova confecção` *"no alto da fila"*, e a lista "O que saiu daqui" diz
*"Agora tem"*. Quem lê de cima para baixo encontra a capacidade, chega no meio e
lê que ela não existe. **As três varreduras de manual passam verdes sobre isso**,
e é o que a S-C222 reclama.

### 5. E a régua mudou no meio do trabalho, o que mudou a REDAÇÃO

A fundação (`d5733a96`) ensinou dinheiro à `varredura-manuais-prazos`, e com ela
veio a regra editorial: **número de constante do contrato vive em célula
`data-regua`, não em prosa solta**. Reescrevi a seção do telefone por causa
disso — os cinco números da recepção saíram dos parágrafos e viraram uma tabela
pregada, e o texto passou a citar a cláusula e a apontar para ela. **É melhor
assim, e não só por causa da régua:** quem atende o telefone lê a tabela de
relance, não um parágrafo.

O efeito colateral está declarado no próprio manual, e é o que a S-C95 comprou:
*"os cinco números abaixo saem do contrato e são conferidos contra o código toda
vez que a suíte roda — se mudarem no sistema, esta tabela reprova e alguém a
corrige"*.

---

## O que os dois documentos passaram a saber

### `recepcao.html`

**Duas seções novas.**

- **"O contrato que você não vê"** — o assunto é a **S-C120**, e ela precisa ser
  dita das duas pontas. A ficha escrevia *"Nenhum contrato ainda."* em **739 das
  1.426 fichas** (51,8%), **311** delas sobre contrato vivo; hoje escreve *"Você
  não tem permissão para ver os contratos desta noiva."*
  (`pages/noivas/[leadId]/sem-lista.tsx:45`). O manual manda ler isso como
  *"existe ou não existe, e não sou eu quem sabe"*, nunca como *"ela não tem
  contrato"* — **sem essa frase o conserto de ontem é invisível para quem convive
  com ele todo dia**, que é a S-C96 escrita por extenso.
  A seção fecha as três coisas que somem junto: o dinheiro, **as duas datas da
  S-C91** (o achado 2 acima) e o quadro do próximo passo, que chegou a mandar
  `Fechar o contrato` em botão para quem não pode fechar contrato nenhum.
  E diz que **`Orçamentos` continua abrindo**, para que a mesma leitura não
  contamine o cartão de cima: ali *"Nenhum orçamento ainda."* quer dizer mesmo
  que não há.
- **"O telefone toca, e a pergunta é do contrato"** — quatro perguntas, a tabela
  pregada de cinco números, e uma resposta que muda dinheiro: no atraso da
  devolução, **"traga hoje"**. A escada está escrita com o exemplo do E212 (um
  vestido de R$ 3.000,00 numa janela de 6 dias: R$ 750,00 no primeiro dia,
  R$ 4.750,00 no nono, R$ 12.000,00 no primeiro dia de extravio), porque o que
  faz a recepção insistir ao telefone não é a cláusula, é o salto.

**Uma seção mexida** — Cabines & horário ganhou a linha `Retirada e devolução` na
tabela e o aviso dos **dois expedientes**, com os defaults do papel (terça a
sábado, 10:30 às 19:00, sábado até as 18:00 —
`agenda-core/expediente-retirada.ts:38-54`).

**E o "deixou de ser verdade" virou três**, com a S-C120 na frente: quem leu a
versão de 12/08 aprendeu a acreditar na frase que mentia.

### `costureira.html`

**Uma seção nova, "O dano que você vê primeiro"** — onde o bloco Avarias aparece
para ela, o que cada linha diz, o aviso de que ela **lê e não registra**, a
tabela pregada das faixas (14ª: piso R$ 350,00, teto R$ 2.500,00; 15ª: até 5
aluguéis da peça) e a razão de a foto não se apagar depois de a cobrança nascer.

A parte que só ela pode fazer está dita como técnica, não como aviso: **a
diferença entre a 14ª e a 15ª é a leitura da peça** — mancha que sai na lavagem
tem piso em reais, mancha que não sai tem teto contado em aluguéis *daquela*
peça, e um véu barato e um vestido caro têm tetos muito diferentes pelo mesmo
rasgo. A 14ª manda avaliar *pelo grau de dificuldade, durante o recebimento na
devolução* (`A-transcricao.md:168`), que é o ofício dela.

**Uma "fronteira" no começo** — o contrato existe, o dinheiro dele não abre para
ela, e as duas coisas que atravessam a fronteira têm seção própria: o dano na
devolução e o visto de "pronto" que a noiva lê no portal.

**E o contorno do E196 saiu.** O bloco virou *"São duas portas, e a diferença é a
peça do acervo"*, com a frase que quem leu a versão antiga precisa ler:
*"se alguém te ensinou que 'confecção sem vestido do acervo não tem como ser
cadastrada', esse conselho envelheceu"*.

---

## Verificação

### O vermelho, reproduzido nas duas células novas

As oito células `data-regua` deste commit só valem se a régua as enxergar. Troquei
o número de duas delas pelo que o manual poderia ter escrito por descuido — o
piso da limpeza para R$ 300,00 (o exemplo literal que a S-C95 usa) e o prazo do
extravio para 7 dias — e rodei:

```
FAIL  src/lib/varredura-manuais-prazos.test.ts > … > e o número que o manual
      escreve é o número que a constante vale
AssertionError: o manual promete um prazo que o código não pratica:
      expected [ …(2) ] to deeply equal []

+ [
+   "costureira.html diz \"a partir de R$ 300,00\" para TAXA_LIMPEZA_MINIMA (vale 350 reais)",
+   "recepcao.html diz \"7 dias\" para DIAS_PARA_EXTRAVIO (vale 10 dias)",
+ ]
```

Desfeito, as três varreduras voltam ao verde. **A régua nova enxerga as células
novas** — e sem esta passada eu teria entregado oito anotações que ninguém prega.

### As três varreduras, e as oito células

```
 Test Files  3 passed (3)
      Tests  13 passed (13)
```

| régua | o que ela cobra | resultado |
|---|---|---|
| `varredura-manuais` | o MENU de cada perfil (sidebar × perfis semeados) | verde |
| `varredura-manuais-prazos` | os NÚMEROS, agora incluindo as 13 do contrato | verde |
| `varredura-manuais-textos` | os 140+ chips de botão e 35 recados, literais | verde |
| `pnpm run typecheck` | 5 projetos | verde |

**Células `data-regua` deste commit: 8** — `recepcao.html` **5**
(`MULTA_DE_MORA_PCT`, `JUROS_DE_MORA_MENSAL_PCT`, `MULTA_DE_ATRASO`,
`DIAS_PARA_EXTRAVIO`, `MULTIPLICADOR_DE_EXTRAVIO`) e `costureira.html` **3**
(`TAXA_LIMPEZA_MINIMA`, `TAXA_LIMPEZA_MAXIMA`, `TETO_DO_DANO_EM_ALUGUEIS`).
Nenhuma régua ficou desconhecida depois do rebase sobre `d5733a96`.

**Nenhum molde novo.** A `varredura-manuais-textos` prega `moldes.length === 9`, e
todo chip que entrou é literal na fonte — conferido antes de escrever:
`Retirada e devolução` (`atendimentos/config.tsx:569`), `Fecha no sábado`
(`:602`), `Registrar avaria` (`reservas/[bloqueioId].tsx:1350`), `ver foto`
(`:1172`), `Fechar o contrato` (`lib/proximo-passo.ts:152`), `Nova confecção`,
`Reservas`. As frases que **não** são literais — a de permissão do `SemLista` é
um molde (`Você não tem permissão para ver {oQue} desta noiva.`) — ficaram em
**prosa**, e não em célula de recado, exatamente para não gastar o décimo molde
que a régua não aceita.

**Sem NBSP literal** (`grep -P '\xc2\xa0'` nos dois arquivos: zero linhas) — a
régua que pegou dois agentes do lote anterior.

**API e E2E não rodados, e desta vez a ausência não é dívida:** o commit não toca
uma linha de `src/`. A régua 11 fala do que a trilha grava e do formato do que
alguma tela lê; um `.html` de `docs/` não é lido por tela nenhuma. O que os
manuais têm de régua são as três varreduras acima, e elas rodaram.

---

## Visto de passagem

Faixa deste agente, **S-C220 em diante**. Nenhum foi consertado (regra 10), e os
três também vão para a tabela de Sobras do `EXECUCAO.md` — que **não** editei,
porque o rastreador é do integrador neste lote.

### S-C220 🟡 — a S-C91 nasceu para quem atende o telefone, e não chega a ela

O épico de ontem levou **Retirada** e **Devolução** para o cartão *O casamento*
da ficha da noiva com uma justificativa escrita (`lib/locacao-da-noiva.ts:9`):
*"quem atende o telefone abre a ficha da NOIVA. 'Que dia eu busco o vestido?'
custava abrir o contrato para responder."*

**Quem atende o telefone é a Recepção**, e as duas datas derivam de
`contratosDaNoiva` (`pages/noivas/[leadId]/index.tsx:444`), que para ela é `[]`
porque a consulta é gateada por `podeVerContratos` (`:164`) e ela tem
`contratos: NADA` (`configuracao-inicial.ts:153`). **A única pessoa que o épico
nomeia é a única que não recebeu o que ele entregou** — para a Vendedora, que
recebeu, as datas já estavam a um clique, na ficha do contrato.

É 🟡 e não 🔵 porque não se fecha escrevendo código: dar a data sem dar o dinheiro
significa tirar as duas colunas de dentro do módulo `contratos`, e foi a dona
quem fechou esse módulo para a Recepção no E172. **É decisão, não conserto.**

População hoje, do E222 e da S-C91, medida no `heliumdb`: **733 contratos, 1 com
`dataRetirada`, 0 com `dataDevolucao`**. O mecanismo está armado e não disparado
— e é justamente por isso que a decisão cabe agora, antes de a tela de retirada
do E224 encher as colunas.

### S-C221 🔵 — a Costureira edita o expediente da cláusula 4ª, e não vê o contrato

`router.use("/lojas/:lojaId/disponibilidade", requireModulo("agenda"))`
(`api-server/routes/agenda.ts:258`), e a Costureira tem `agenda: TUDO`
(`configuracao-inicial.ts:159`). O segundo expediente do E222 mora nesse mesmo
recurso (`pages/atendimentos/config.tsx:567-620`) e decide o que o
`POST /contratos` aceita como data de retirada e devolução.

Ou seja: o perfil com `contratos: NADA` e `vestidos: SO_VER` — que não vê o
contrato nem a movimentação da peça — **pode mudar a régua que os recusa**. Não é
um beco (nada quebra), e pode muito bem ser o que a dona quer, já que ela também
configura cabines. Fica 🔵 porque **não medi a intenção**, e o gate por módulo não
tem grão para separar *"o horário das provas"* de *"o horário do contrato"* dentro
de `agenda` — separá-los seria o mesmo movimento do E172, um módulo a mais.

### S-C222 🔵 — nenhuma das três varreduras pega contradição INTERNA de manual

O contorno do E196 que este commit removeu sobreviveu **dez épicos** com a suíte
verde, e a razão é estrutural: a `varredura-manuais` confere o menu contra os
perfis semeados, a `varredura-manuais-prazos` confere os números contra as
constantes, a `varredura-manuais-textos` confere as citações contra a tela.
**As três olham do manual para FORA.** Um documento que afirma *"não tem tela
onde ser cadastrada"* na seção 5 e *"agora tem: `Nova confecção`"* na seção 1
não contradiz fonte nenhuma — ele contradiz a si mesmo, e ninguém olha para
dentro.

O molde de uma quarta régua já existe e é barato: os chips `class="btn"` já são
extraídos por arquivo (`varredura-manuais-textos.ts`, `botoes()`), então cobrar
que **um manual que cita um botão não afirme, no mesmo arquivo, que ele não
existe** é uma lista de negações contra a lista de chips do próprio documento.
Não a escrevi porque a régua é código, o lote é de manuais, e o piso de citações
é do integrador.

---

## O que EU errei

**Nasci 13 commits atrás e quase medi a árvore errada.** O `git log --oneline -3`
do primeiro gesto devolveu `cbcd8b30` — a mesma pegadinha que o `CLAUDE.md`
acabou de documentar para o lote anterior, em que três de quatro agentes
nasceram 7 e 8 commits atrás. Se eu tivesse escrito antes de conferir, o manual
da recepção descreveria a ficha **antes** da S-C120: eu teria documentado a
frase *"Nenhum contrato ainda."* como comportamento correto, que é o oposto
exato da tarefa. **O primeiro gesto é conferir a base, e ele pagou-se sozinho
nesta sessão.**

**E escrevi os números na prosa antes de a régua existir.** Quando a fundação
chegou (`d5733a96`), a seção do telefone já estava escrita com *"multa de 2%"*,
*"R$ 250,00"* e *"quatro vezes o aluguel"* soltos em cinco parágrafos — a forma
exata que a S-C95 existe para curar. Reescrevê-la custou vinte minutos e ficou
melhor. A lição é de ordem: **a régua vem antes do texto**, como o E217 já disse
do dinheiro (*"a régua vem antes do dinheiro"*), e vale igual para documentação.
