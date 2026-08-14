# A cláusula sem gesto — o plano do que restou

**Aberto em 14/08/2026**, depois do lote das quatro amarelas e do lote dos manuais.
Trilha: [`2026-08-13-contrato-de-papel/`](../revisao/2026-08-13-contrato-de-papel/EXECUCAO.md)
Banco das medições: **`heliumdb`** (`select current_database()`).

Este plano lê as **57 sobras abertas** — 11 🟡 e 46 🔵, zero 🟠 — como um conjunto,
não uma por uma. **A tabela do `EXECUCAO.md` continua sendo a fila e a fonte da
contagem;** aqui está a ordem e a razão dela.

---

## O que a leitura em bloco mostra, e nenhuma sobra mostra sozinha

**Das 11 🟡, SETE dizem a mesma coisa em sítios diferentes: a cláusula virou
conta e não virou gesto.** O sistema calcula certo e a pessoa não alcança o
cálculo — ou alcança um número diferente do que a porta pratica.

| | |
|---|---|
| **A conta existe e não há tela** | S-C151, S-C210, S-C211 🟡 · S-C202, S-C92, S-C112 🔵 |
| **A tela mostra OUTRO número** | S-C190, S-C200, S-C170 🟡 |

Isso não é coincidência de tema: é a **forma do E222 repetida**, e ela já se
repetiu tantas vezes nesta trilha que virou o padrão dominante do que sobrou.

- **E222** — o campo existia e nenhuma tela o oferecia (1 de 723).
- **E219** — a porta que o épico guardaria não existe.
- **E215** — a porta existe, o campo é opcional, e por isso está em 0 de 723.
- **E197** — só se alcança pela API, e *não se acha clicando o que só se alcança
  pela API*.
- **S-C35/S-C36 → E224** — a régua estava posta e o gesto faltava.
- **E agora seis de uma vez**, achadas pelos dois lotes de hoje.

**A leitura honesta é que a trilha do contrato construiu as CONTAS e deixou os
GESTOS para trás.** Doze épicos de dinheiro, e o que restou é quase todo de
tela. É trabalho de outra natureza que o que veio antes: **nenhum dos sete pede
migração, nenhum mexe em conta**.

**A mais grave é a S-C211, e ela é de categoria própria: a cláusula 18ª NÃO
DISPARA PARA NINGUÉM.** Ela depende de `prazo_devolucao_reserva_dias`, medido em
**0 ocorrências em `pages/`** (79 arquivos) e 0 em `e2e/`. O E217 fez a conta e
declarou que *"sem prazo preenchido no contrato, a cláusula não dispara — o
sistema não inventa um número que ninguém negociou"*. Medido agora: ele nunca é
preenchido. **Uma cláusula que o ateliê assinou está morta no sistema por falta
de um campo**, e a nota do E217 descreve isso como decisão consciente quando é
ausência de gesto.

---

## As duas duplicatas, fundidas

Quatro agentes em paralelo produziram **o mesmo achado com dois números, duas
vezes** — o formato que o lote das seis já tinha produzido, e que cabe ao
integrador fundir:

- **S-C191 ≡ S-C210** (perdoar a mora não tem tela) — o agente da vendedora achou
  pelo carnê, o do proprietário pelas rotas. Conferido: `PerdoarMora` tem **0
  usos em `pages/`**, e o **selo do perdão já é desenhado** (`noiva-portal.tsx:691`)
  — a tela sabe mostrar o resultado de um gesto que ninguém pode fazer.
- **S-C92 ≡ S-C201** (o portal não mostra a devolução) — achada no E224 e de novo
  agora. Conferido em `visao-noiva.ts:188`: existe `retiradaPrevista`, não existe
  campo de devolução.

**Cada agente monta o próprio ambiente e lê os mesmos épicos; a duplicata é
esperada, não é desperdício.** O que não pode acontecer é ela sobreviver à
integração, porque duas linhas para o mesmo defeito fazem a segunda parecer
trabalho novo.

---

## Os seis grupos, e o que cada um custa

### Grupo 1 — a cláusula sem gesto · **7 sobras** (3 🟡)

O grupo que dá nome ao plano. **Nenhum pede migração.**

| sobra | o gesto que falta | medida |
|---|---|---|
| **S-C211** 🟡 | o prazo da 18ª no contrato | 0 em `pages/`, 0 em `e2e/`, 3 em `routes/` |
| **S-C210** 🟡 | perdoar a multa da 9ª | rotas em `contratos.ts:2352`/`:2429`, hook gerado com 20 ocorrências, **0 usos**; o selo já desenhado |
| **S-C151** 🟡 | dizer que quem cancelou foi a LOJA (13ª) | `iniciativa`: 0 em `pages/`, 0 em `e2e/` |
| **S-C202** 🔵 | as outras cinco cláusulas no portal | só a 9ª desce |
| **S-C92** 🔵 | a data de devolução no portal | `visao-noiva.ts:188` |
| **S-C112** 🔵 | o aviso onde o botão não está | o 422 ensina o caminho e ninguém lê |
| **S-C132** 🔵 | a qualificação no PDF | **é o E220**, não este grupo |

**Fecham juntas, e é por isso que valem um épico só:** as três 🟡 são o mesmo
gesto — *um campo ou um botão numa tela que já existe*, ligado a uma rota que já
está pronta e testada. O caro de um épico de tela é descobrir onde ele encaixa;
descobrir isso três vezes seguidas na mesma área custa menos que três vezes em
áreas diferentes.

### Grupo 2 — o mesmo dinheiro com dois números · **7 sobras** (4 🟡)

O grupo mais perigoso, porque **cada linha é alguém conferindo dois números da
loja e escolhendo em qual acreditar**.

- **S-C190** 🟡 — a Vendedora vê **R$ 500,00** onde a porta aceita **R$ 515,00**.
  Ela tem `financeiro: NADA`, então o carnê do contrato é a **única** tela de
  dinheiro dela. **É o E213 invertido:** lá a porta recusava o que as leituras
  mostravam; aqui a leitura esconde o que a porta aceita.
- **S-C200** 🟡 — o portal da noiva mostra **R$ 500,00 em cima e R$ 515,00
  embaixo, na mesma tela**.
- **S-C170** 🟡 — o PDF do contrato manda 240 e 294 caracteres para uma linha de
  **92**, e a cobrança extra **sai da página**. Já é assim no `main` desde a
  S-C71.
- **S-C51** 🟡 + **S-C52**, **S-C53**, **S-C72** 🔵 — a conciliação é por PARCELA
  e o resto do financeiro já é por ATO. **Espera decisão de modelagem** (a tabela
  `recebimentos` que o E221 recusou por escrito), e a população é **0 parcelas
  com mais de um ato entre 1078**.

**S-C190 e S-C200 são a mesma conta em duas telas** e devem fechar no mesmo
épico: a mora já chega nos dois payloads, e o que falta é as duas leituras
usarem o total em vez do principal. **S-C170 é separada** — mexe no papel que a
noiva assina e precisa dos golden do `e165`.

### Grupo 3 — a peça física · **8 sobras** (1 🟡)

**S-C110** 🟡 é a única com relógio andando: cancelar o contrato **solta ao acervo
uma peça que está na casa da noiva**, e o gesto que produz a população nasceu no
E224. Hoje são **0 bloqueios com `retirada_data_real`** — depois da primeira
retirada, vira conserto de dado com peça prometida a duas noivas.

Em volta dela: **S-C115** (desfazer a retirada deixa o atraso cobrado órfão),
**S-C114** (o `semContrato` não distingue "nunca teve" de "o contrato caiu"),
**S-C121**, **S-C111**, **S-C1**, **S-C93**, **S-C94**.

### Grupo 4 — régua que mede menos do que anuncia · **16 sobras** (1 🟡)

A dívida de medição, e ela **cresceu hoje** porque os dois lotes terminaram em
varredura. **S-C180** 🟡 é a única de peso: a régua prega o `z.enum` e **não
prega o que a tela OFERECE** — `atendimentos/novo.tsx` tem os dois valores
escritos à mão **406 linhas abaixo** do enum.

O resto (S-C61, S-C75, S-C76, S-C78, S-C79, S-C152, S-C153, S-C161, S-C181,
S-C182, S-C222, S-C56, S-C48, S-C77, S-C102) tem **três subgrupos que fecham
juntos**:

- **piso frouxo** — S-C75 mede que o critério da S-C46 vale para **1 de 14
  varreduras**. Hoje ele vale para 2: a `varredura-manuais-prazos` acabou de
  ganhar piso medido e duas igualdades.
- **sonda cega** — S-C76, S-C78, S-C79, S-C182: `[]` de peneira quebrada e `[]`
  de repositório limpo são o mesmo valor.
- **régua que olha só para fora** — S-C161, S-C222: nenhuma varredura de manual
  pega **contradição interna**, e foi assim que o contorno do E196 sobreviveu
  dez épicos.

### Grupo 5 — esperam DECISÃO, não código · **7 sobras** (3 🟡)

Nenhuma se fecha escrevendo código, e pô-las na fila de execução seria inventar
decisão que não é minha:

| sobra | a pergunta |
|---|---|
| **S-C60** 🟡 | a loja segura um vestido antes de saber de qual noiva é? |
| **S-C51** 🟡 | a conciliação precisa de carimbo por pagamento (a tabela que o E221 recusou)? |
| **S-C220** 🟡 | a Recepção deve ver as datas de retirada e devolução? Foi você quem fechou `contratos` para ela no E172, e a S-C91 entregou as datas **dentro** desse módulo |
| S-C21, S-C133, S-C221, S-C171 🔵 | lookbook, contratos antigos, o expediente da costureira, o `.slice(0,500)` do backup |

### Grupo 6 — tela pequena e desempenho · **12 sobras**, todas 🔵

S-C22, S-C62, S-C81, S-C82, S-C89, S-C98, S-C99, S-C131, S-C160, S-C162,
S-C163, S-C213. **Nenhuma dói hoje**, e várias têm população zero declarada.

---

## A ordem sugerida

| # | o quê | por quê agora |
|---|---|---|
| 1 | **E226 — os três gestos** (S-C211, S-C210, S-C151) | a 18ª está **morta no sistema**; os outros dois são rota pronta esperando botão. Zero migração |
| 2 | **E227 — o número que a tela mostra** (S-C190 + S-C200) | as duas leituras que escondem a mora, num épico só. A Vendedora tem uma única tela de dinheiro e ela mente |
| 3 | **E225 — a peça que não voltou** (S-C110) | **população zero HOJE**, e o relógio começou a andar no E224 |
| 4 | **S-C170** | o PDF que a noiva assina sai da página. Épico próprio pelos golden do `e165` |
| 5 | **S-C180** + o bloco das réguas | dívida de medição, e o bloco fecha em três consertos e não em quinze |
| 6 | **As 3 🟡 de decisão** (S-C60, S-C220, S-C51) | esperam você |

**Os itens 1 e 2 fecham cinco das onze 🟡 e são de tela pura.** Depois deles, o
que resta de 🟡 é o item 3 (relógio), o 4 (papel), o 5 (régua) e as três que são
suas.

**E há duas frentes de fora desta lista que não mudaram**: o **E223 → E219** (a
porta de trocar peça, que destrava a guarda da 17ª) e o **E220** (o PDF vira o
instrumento, travado em **D4** e **D7**).

---

## O que este plano não faz

**Não estima horas.** As referências medidas nesta sessão: o lote das quatro
amarelas levou ~40 min de relógio em paralelo mais a integração; o lote dos
manuais, ~25 min mais integração. Os itens 1 e 2 são de tela e não têm
precedente medido nesta trilha — os épicos de tela anteriores (E224, S-C91)
custaram menos que os de conta.

**Não decide nada que seja da dona** — as três 🟡 do Grupo 5, as **4 pendências**
(P1–P4) e as **2 decisões** (D4, D7) continuam como perguntas.

**E não promete que a contagem cai.** Os dois lotes de hoje fecharam 13 sobras e
abriram 25, e isso é o que se espera de trabalho que termina em varredura. **A
composição é o resultado, não o total:** a 🟠 acabou e não voltou, e das 11 🟡 de
hoje **oito nasceram nas últimas seis horas**, de olhar áreas que ninguém tinha
aberto.
