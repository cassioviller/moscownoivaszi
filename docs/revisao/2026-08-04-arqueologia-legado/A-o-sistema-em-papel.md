# Trilha A (arqueologia) — o papel reserva a SEMANA e o sistema reserva 12 DIAS; e o conjunto que a noiva leva não é uma peça, é quatro

**Arqueologia do legado, sessão 1 — 2026-08-04** · branch `rodada-7-sobras`

Método: li as **29 fotos** do sistema em papel do ateliê (mapa em
`INVENTARIO.md` — 15 páginas de agenda de 29/06 a 25/10, 14 páginas de
caderno semanal de 22/06 a 27/09, 136 saídas de peça registradas) e julguei o
que elas pedem contra o código que teria de servi-las: o schema
(`lib/db/src/schema/`), a régua de disponibilidade
(`artifacts/api-server/src/lib/disponibilidade.ts`), o fechamento de contrato
(`routes/contratos.ts`), a reserva (`routes/reservas.ts`) e a tela de acervo
(`pages/vestidos/index.tsx`).

Esta é a trilha que a rodada 7 adiou ("traçador e arqueologia ficaram para
rodada futura" — `METODO.md`, histórico de 2026-07-30). A lente é uma só: **o
que o ateliê faz todo dia e o sistema não deixa fazer.**

Os limites da evidência estão declarados no `INVENTARIO.md` §"Limites" —
resumo: é caligrafia, o caderno registra semana e não data de casamento, e há
um único número monetário em 29 fotos.

## O que está BEM — e é bom por decisão, não por acaso

**Trocar de vestido é cancelar e criar, nas duas mídias.** O `PATCH
/lojas/:id/bloqueios/:id` (`artifacts/api-server/src/routes/reservas.ts:476-487`)
escreve datas, ocupação e observação — e **não escreve `vestidoId`**. Não há
caminho para trocar a peça de uma reserva; quem troca cancela (soft-cancel
`canceladoEm`, a decisão do E115 em `:493-498`) e cria outra. O papel decidiu
igual, e nunca apaga: *Thelmah __(trocou)__ Shellyane P* (14–20/09, item 6),
*Berenice riscada → Ariane* (10–16/08, item 2), *Luma — trocou data*
(10–16/08, item 3), *(cancelado)* (13–19/07, item 2). A rasura preserva o
anterior; o soft-cancel também.

**O conjunto já foi previsto.** `contrato_bloqueios` é N:N desde o E72
(`lib/db/src/schema/contratos.ts:89-113`), e o comentário nomeia o caso exato:
"vestido + véu + segunda peça". O mecanismo existe — o achado A2 é que nada
obriga a usá-lo.

**A peça tem duas identidades, e a busca aceita as duas.**
`pages/vestidos/index.tsx:260` casa a consulta contra `nome` **e** `codigo`,
normalizando acento e caixa. É exatamente como o caderno nomeia: o nome do
modelo quase sempre, e o código de 4 dígitos só quando há dúvida — **8
ocorrências em 29 fotos** (4113, 4551, 6503, 2611, 0827, 9829, 9517, 792).

**Saída, uso e volta são momentos distintos nas duas mídias.**
`bloqueio_vestidos` tem `retiradaDataReal` e `devolucaoDataReal`
(`lib/db/src/schema/atendimentos.ts:39-40`) e a janela de lavagem deriva da
devolução real (`disponibilidade.ts:153-157`). O papel separa igual:
*Vestido saiu + Katia* (12/10), *Maria Aparecida — Retirada Mantilha +
acess.* (03/09), *Letícia — Prova ou troca* (16/07).

---

## A1 🔴 — A régua de ocupação é uma só para o acervo inteiro, e o default prende a peça por 12 dias enquanto o ateliê a realuga em 7

**Âncoras:** `lib/db/src/schema/loja.ts:26-33` — `regra_disponibilidade` tem
`lojaId` **unique** (`:28`): uma régua por LOJA, nunca por peça. Os defaults
(`:29-33`): `provaDiasAntes 14`, `usoDiasAntes 3`, `usoDiasDepois 2`,
`lavagemDiasDepois 7`. A derivação das janelas em
`artifacts/api-server/src/lib/disponibilidade.ts:152-153`, literal:

```
 * - USO     [D − usoDiasAntes, D + usoDiasDepois]            FISICA
 * - LAVAGEM [fimUso + 1, fimUso + lavagemDiasDepois]         FISICA
```

O 409 que isso produz: `routes/reservas.ts:465-467`
(`VESTIDO_INDISPONIVEL`).

**Evidência de papel:** a peça **Adelita** aparece duas semanas seguidas. Na
de 07–13/09 (`fotos/…56 (2).jpeg`, item 7) está escrita *Adelita (Adelita)*
com a anotação em verde ao lado: **"Novo que chegou — 1º Aluguel"**. Na
semana seguinte, 14–20/09 (`…56 (3).jpeg`, item 1), a mesma peça: *Adelita —
**Realuguel***. A peça chegou nova, saiu, voltou e saiu de novo em sete dias.
Não é caso único: **Shellyane** sai em 07–13/09 (item 6) e em 14–20/09 (item
6, como troca da Thelmah); **Konte** sai em 14–20/09 (item 14) e em 21–27/09
(item 11).

**Cenário e conta.** O caderno registra a semana, não o dia — então o dia
entra como cenário: casamentos em sábados consecutivos, 12/09 e 19/09.

| | 1ª locação (D = 12/09) | 2ª locação (D = 19/09) |
|---|---|---|
| USO `[D−3, D+2]` | 09/09 – 14/09 | 16/09 – 21/09 |
| LAVAGEM `[fimUso+1, +7]` | 15/09 – **21/09** | 22/09 – 28/09 |
| Ocupação física total | **09/09 – 21/09 (13 dias)** | 16/09 – 28/09 |

A segunda pede 16/09 e a primeira só larga em 21/09: **6 dias de
interseção**. `verificarDisponibilidade` devolve `409 VESTIDO_INDISPONIVEL`
(`reservas.ts:452-467`) para uma locação que o ateliê **fez** — e que está
escrita a caneta na página seguinte do mesmo caderno.

**Número:** 13 dias de ocupação por locação (3 antes + 1 do casamento + 2
depois + 7 de lavagem) contra os **7 dias** de intervalo entre semanas
consecutivas. Em 3 pares de semanas consecutivas nas 14 fotografadas
(Adelita, Shellyane, Konte), a peça girou em metade do tempo que a régua
padrão reserva.

**A régua não é só um default do schema — é o que a configuração inicial
escreve.** `artifacts/api-server/src/lib/configuracao-inicial.ts:127-136`
(`HORARIO_PADRAO`) grava `usoDiasAntes 3`, `usoDiasDepois 2`,
`lavagemDiasDepois 7` em **toda loja nova** (`:476-479`), e o fallback de quem
não tem régua é o mesmo trio (`disponibilidade.ts:37-42`, `REGRA_DEFAULT`).
Desde o E147 o seed é "a configuração de um ateliê" — então **toda instalação
nasce prendendo a peça por 13 dias**. Para escapar disso alguém precisa ter
editado a régua depois, à mão.

**Ressalva declarada:** não medi a régua da instalação real do ateliê, e não
posso provar pela foto que a *Adelita* de 07–13/09 e a de 14–20/09 são a
**mesma peça física** — duas peças homônimas explicariam o caderno. O que
sustenta a leitura de peça única é a própria anotação: "realuguel" só
significa algo para uma peça que já foi alugada, e a semana anterior a marca
como recém-chegada. Indício forte, não prova.

**E a régua é única para o acervo inteiro** (`loja.ts:28`, `lojaId` unique):
um vestido de renda pesada e um bolero levam os mesmos 7 dias de lavagem, e
hoje não há onde dizer o contrário.

---

## A2 🟠 — O conjunto só é protegido se cada peça for cadastrada e reservada uma a uma; nada no fluxo de venda exige isso, e o item de orçamento não tem lugar para acessório

**Âncoras:** `lib/db/src/schema/common/enums.ts:73-77` — `orcamento_item_tipo`
é `["VESTIDO", "SERVICO", "AJUSTE"]`; **não há tipo para acessório**.
`lib/db/src/schema/contratos.ts:66-69`, comentário do próprio schema: *"vestidoId
é referência frouxa (set null) — a descrição em texto é o registro
autoritativo"*. E o ponto onde as duas listas se separam:
`artifacts/api-server/src/routes/contratos.ts:296-303` — os bloqueios vêm de
`contratoData.bloqueioVestidoIds`, **do corpo da requisição**, não derivados
dos itens; `:468-481` grava `itensSnapshot` e `bloqueioIds` na mesma
transação, de fontes independentes. Nada valida que um item `tipo: "VESTIDO"`
com `vestidoId` preenchido tenha bloqueio correspondente.

**Evidência de papel:** o caderno nomeia a segunda peça em pelo menos 8
linhas — *Bernarda + Bolero Ricca Sposa* (07–13/09, item 5), *Klosella +
Solussaia + Manga* (07–13/09, item 3), *Kalina + Saiote 2 aros + crinol*
(31/08–06/09, item 12), *Tamara + Bolero 2026* (21–27/09, item 3), *Ricca
Sposa + Bolero Ricca Sposa* (13–19/07, item 6), *Lilya + NSA* (31/08–06/09,
item 13), *Milla Nova (+ aplicações)* (24–30/08, item 5), *Siam + Manga (será
confeccionada) + Mantilha* (10–16/08, item 5). E a tarefa de 03/08, em
laranja, no alto da segunda-feira: **"SEPARAR MANTILHA E ACESSÓRIO — NOIVA
MARIA 05/09/26"** — uma peça separada com 33 dias de antecedência, que
nenhuma reserva do sistema estaria segurando.

**O que a passada adversarial derrubou deste achado.** Eu ia escrever que o
contrato prende só o vestido principal. É falso: `pages/orcamentos/[id].tsx:638-641`
manda `bloqueioVestidoIds` com **todas** as reservas da noiva que não foram
desmarcadas na tela. Se o bolero é uma reserva, ele é preso — o E72 funciona
ponta a ponta. O achado sobrou mais estreito, e é este:

**Cenário:** o bolero só está protegido se alguém o cadastrou como peça do
acervo (com código próprio) **e** abriu uma reserva para ele. Nada no
caminho da venda pede isso: o enum de item não tem "acessório", então quem
vende o conjunto escreve "Bolero Ricca Sposa" na descrição de um item —
`SERVICO`, ou `VESTIDO` com `vestidoId` nulo — e o texto vira o registro
autoritativo, por decisão explícita do schema (`contratos.ts:66-69`). Nenhuma
reserva nasce, nenhum conflito é possível. Duas noivas com casamento no mesmo
sábado fecham com `201` sobre o mesmo bolero.

**Número:** na semana de 31/08–06/09 o caderno registra **19** saídas, e ao
menos 4 daquelas linhas nomeiam uma segunda peça no conjunto. O caderno
nomeia a segunda peça como nomeia a primeira — *Bolero Ricca Sposa* tem nome
de modelo igual ao vestido. Para o ateliê são peças; para o contrato, uma é
peça e a outra é frase.

**Onde é fácil:** o N:N do E72 já existe e a tela já o alimenta. O que falta
é (a) um tipo de item que signifique acessório, e (b) a recusa do fechamento
quando um item aponta `vestidoId` sem bloqueio correspondente na lista.

---

## A3 🟠 — O filtro de cor compara string exata e o dropdown se popula do que foi digitado; a segunda linha de negócio inteira é indexada por cor

**Âncoras:** `artifacts/moscow-noivas/src/pages/vestidos/index.tsx:244-253` —
`derivar` monta as opções com `new Set` sobre os valores **brutos**
(`cores: derivar((v) => v.cor)` em `:251`), sem normalizar; `:262` filtra com
igualdade estrita (`if (cor !== TODOS && v.cor !== cor) return false`), e
`:263` faz o mesmo com categoria. O contraste está **duas linhas acima**, em
`:260`: a busca por nome e código passa por `normalizar` — acento e
caixa-insensitive. `lib/db/src/schema/vestidos.ts:46-47`
— `cor` e `categoria` são `text` livre, enquanto o catálogo controlado que
resolveria isso existe ao lado, em `atributosTable` / `atributoOpcoesTable`
(`:14-36`), e já serve decote e volume.

**A passada adversarial reforçou este.** A defesa óbvia seria "quem cadastra
escolhe de uma lista, então a grafia não varia". Não escolhe:
`pages/vestidos/vestido-form.tsx:186-191` desenha a cor como
`<Input placeholder="Branco" />` — **campo de texto digitado à mão**, como
tamanho (`:178`) e categoria (`:204`). A divergência de grafia não é
hipótese: é o único comportamento possível do formulário.

**Evidência de papel:** a agenda tem **38 compromissos em laranja indexados
por cor, não por modelo** — a noiva de festa/madrinha/dama não pede "Arnalda",
pede verde. *(Contagem corrigida na trilha B: a passada corrida desta sessão
disse "~20", metade do real. Em setembro os 15 compromissos de cor superam as
12 provas de noiva.)* *MILENA PROVA VERDE* (20/08), *GIOVANNA PROVA TERRACOTA* (28/08),
*SANDRA + PROVA MARSALA* (28/08), *YASMIN PROVA VERMELHO* (15/09), *ROSELI
PROVA VERDE* (03/09), *NATHALIA PROVA AZUL* (04/09), *MARIA PROVA DAMA*
(08/09), *ERICA–PINK* (26/08), *LUCÉLIA – ROSÊ* (11/09), *LUCINARA – VERDE*
(23/09), *Patrícia PINK* (04/09), *Fernanda – CHAMPAGNE* (08/07), *Rozimalda
– dama Amarela* (01/09), *Letícia – azul serenity* (01/09), *Márcia Laranja*
(27/08), *Gabi Fúcsia* (30/06).

**Cenário:** duas vendedoras cadastram doze vestidos de dama ao longo de dois
anos. Uma digita "Verde", outra "verde", uma terceira "VERDE". O dropdown de
cor mostra **três** opções idênticas aos olhos; quem escolhe a primeira vê um
terço do acervo verde e conclui que não tem. A busca por texto não salva: ela
lê `nome` e `codigo`, nunca `cor`.

**Número:** **15** cores distintas nomeadas nas 15 páginas de agenda (verde,
terracota, marsala, vermelho, azul, azul serenity, pink, rosa, rosê,
champagne, fúcsia, laranja, amarela, dourado, dama) — nenhuma delas é hoje
opção de um catálogo controlado, e "azul" e "azul serenity" são duas entradas
sem relação para o filtro. *(Corrigido na trilha B: eu tinha escrito 12.)*

---

## A4 🟡 — Não há preço de realuguel, embora a contagem de locações já esteja pronta

**Âncoras:** `lib/db/src/schema/vestidos.ts:44` — `precoBase`, **um** preço
por peça. E `artifacts/api-server/src/routes/vestidos.ts:268-315`: a rota
`/utilizacao` já conta, por vestido e por período, provas
(`:280-290`), reservas (`:291-301`) e contratos com receita (`:302-314`) — a
tela existe em `pages/vestidos/utilizacao.tsx`. `grep -rn "realug"` no repo:
zero.

**Evidência de papel:** o ateliê conta as vezes, e o preço acompanha.
**"Novo que chegou — 1º Aluguel"**, em marca-texto verde (07–13/09, Adelita);
*Adelita — **Realuguel*** na semana seguinte; *NIXIA (2º Aluguel)* (07–13/09,
item 4); *BLARY 2º* (24–30/08, item 12); *Fencyella … **Realuguel 7.600***
(20–26/07, item 2).

**A pergunta antes do código** (regra 5): o preço do primeiro aluguel difere
do realuguel, e em quanto? O `7.600` é a única cifra em 29 fotos e pode ser
código de peça — não decido isso por foto. **O dado que falta não é a
contagem** (existe): é a régua de preço que lê a contagem.

---

## A5 🟡 — Ausência de vendedora não existe no modelo, e é o primeiro dado que a agenda de papel registra

**Âncoras:** `grep -rniE "ferias|ausencia|indisponibilidade|folga"` em
`artifacts/` e `lib/` (fora de `dist/` e `node_modules/`) devolve **zero
ocorrências de domínio** — os 6 hits são comentários sobre folga numérica e a
função `janelasDoBloqueio`. A agenda tem cabine (`lib/db/src/schema/loja.ts:45`)
e `atendimentos.vendedoraId` (`lib/db/src/schema/atendimentos.ts:70`), mas
nada que torne uma pessoa indisponível num intervalo.

**Evidência de papel:** a ausência é escrita **no alto da página, antes de
qualquer compromisso** — é a primeira coisa que a semana declara. *Férias
Gabi / Marilza* (30/06–03/07), *Retorno Gabi* (04/07), *Volta da Marilza 15
dias* (08/07), *Férias Cris* (10–11/07), *Férias Jeni → 16 a 25* (13–19/07),
*Férias Isa* (27/07 e 03–09/08), *Férias Marina* (10–16/08).

> **ERRO CORRIGIDO (trilha B).** Esta linha dizia "**8 das 15 páginas de
> agenda** trazem aviso de ausência no cabeçalho". É falso — eu somei as duas
> mídias e atribuí o total à agenda. A contagem página a página:
> **2 de 15 na agenda** e **7 de 14 no caderno**, todas entre 22/06 e 16/08.
> O achado sobrevive e fica mais interessante: a ausência é anotada na página
> que **conta as peças que saem**, não na que marca compromissos — porque é a
> capacidade de atender que limita quantas saem.

**Cenário:** 09 e 10/07 estão riscados com um X que atravessa as duas
colunas inteiras, e as semanas de férias esvaziam — 18, 19, 22, 23 e 24 de
agosto não têm um único compromisso em toda a abertura. Hoje o sistema
aceitaria agendar uma prova com a Gabi em 02/07, no meio das férias dela, e a
única defesa é alguém lembrar.

---

## A6 🟡 — Os dois cadernos guardam o mesmo dado, e já divergem no papel

Não é achado de código — é o que a migração precisa decidir antes de
importar qualquer coisa: **qual das duas mídias é a fonte.**

Toda segunda-feira alguém copia, em rosa, a lista da semana do caderno verde
para o alto da agenda. A cópia perde linhas:

| Semana | Caderno | Agenda (2ª feira) | Perdidas |
|---|---|---|---|
| 06–12/07 | 5 | 3 | 2 |
| 13–19/07 | 8 | 3 | 5 |
| 20–26/07 | 6 | 3 | 3 |
| 17–23/08 | 16 | 9 | 7 |

Em 29/06 a agenda traz *Thelma*; o caderno traz *Thelma rasurada, Taiane no
lugar* — a agenda copiou antes da troca e não voltou. *(Esta linha também
afirmava uma divergência no item 9 de 17–23/08. **Retirada**: a releitura
ampliada mostrou que os itens 1 a 8 batem linha a linha e o item 9 não é
legível o bastante para sustentar o contraste — só a contagem se sustenta.)*

**E a leitura desta tabela mudou na trilha B.** A perda não é descuido de
cópia: a lista de segunda-feira existe nas 8 primeiras segundas e **desaparece
por completo a partir de 24/08**. As cinco semanas seguintes somam **79 saídas
no caderno e zero linhas na agenda** — a rotina foi abandonada, não falhada.
Ver B3.

Na direção oposta, a agenda não sabe o que saiu: a semana de **21–27/09 tem
12+ peças no caderno e UM único compromisso na agenda inteira** (16:00
Lucinara – VERDE, 23/09). **A saída da peça não gera compromisso** — a agenda
serve prova e recado; o caderno serve acervo. Quem só olha a agenda não vê o
negócio acontecer.

**Consequência para a importação:** o caderno é a fonte do que saiu; a agenda
é a fonte de quando alguém veio à loja. Importar a agenda como se fosse
locação subestima o movimento em até 63% (17–23/08).

---

## O que a verificação DERRUBOU do meu próprio diagnóstico

Registrado porque é a parte útil (regra 9, e o precedente do E94). Levantei
sete pontos lendo as fotos; a leitura do código matou dois e afinou um.

1. **"`provaDataReal` é singular e perde a 2ª prova" — falso.** Cada prova é
   um `atendimento` próprio (`lib/db/src/schema/atendimentos.ts:62-72`, tipo
   `PROVA`), e a história está guardada lá. `provaDataReal` não é o registro
   da prova: é o override que **colapsa a janela** de indisponibilidade para
   o dia real (`disponibilidade.ts:192-201`). Que a segunda prova sobrescreva
   a data da primeira é correto e está documentado no próprio código
   (`routes/agenda.ts:371-377`): "colapsar a janela só reduz ocupação — nunca
   cria conflito". O ordinal do papel (*1ªPR*, *2ªPR*) é derivável da ordem
   dos atendimentos; não pede coluna.

2. **"A troca de modelo talvez sobrescreva o vestido anterior" — falso.** Não
   existe caminho para trocar: o `.set()` do PATCH de bloqueio
   (`routes/reservas.ts:477-487`) não toca `vestidoId`, e o `grep` por um
   `set` de `vestidoId` em rota de update não devolve nada. Virou o primeiro
   item de "o que está BEM".

3. **"Cor como texto livre não sustenta a busca" — meio falso, e o meio
   errado importava.** A busca por cor existe, mora na URL desde o E129 e
   funciona. O defeito é mais estreito e mais preciso do que eu disse: está
   na **derivação sem normalizar** e na **comparação estrita** — é o A3, e
   sem ler `vestidos/index.tsx:244-266` eu teria escrito um achado genérico
   sobre "texto livre" que a tela refutaria em dois minutos.

---

## Perguntas de produto — antes de virar código (regra 5)

1. **Quantos dias a peça fica de fato parada depois do casamento?** A régua
   padrão diz 9 (2 de uso + 7 de lavagem); o caderno mostra a mesma peça
   saindo de novo em 7. O número certo é do ateliê — e provavelmente varia
   por peça, o que a régua única não permite dizer (A1).
2. **O preço do 1º aluguel difere do realuguel?** Em quanto, e o "7.600" é
   valor ou código? (A4)
3. **Bolero, mantilha, saiote, crinol e véu entram no acervo como peça com
   código próprio, ou seguem como texto no contrato?** A resposta decide se o
   A2 é um campo obrigatório ou um cadastro inteiro.
4. **A unidade de reserva do ateliê é a SEMANA?** As 14 páginas do caderno são
   semanais, sem exceção. Se for, a tela de disponibilidade deveria responder
   por semana, não por dia.
5. **Vestido de festa/dama é o mesmo acervo dos de noiva?** O papel os trata
   como coisas diferentes — nome de modelo de um lado, cor e código de 4
   dígitos do outro (A3).
