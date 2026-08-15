# S-C240/S-C241/S-C242 — o que a porta de troca deixou aberto

**Trilha do contrato de papel, sessão de 2026-08-15 (segunda metade)** ·
base `ef2a62d8` (as réguas)
Fecha: S-C240 🔵 · S-C241 🔵 · S-C242 🔵 · abre S-C290 🔵
Suíte: API 1737 → **1743** (245 → 248 arquivos) · frontend 979 → **983** ·
E2E 177 · typecheck verde

## O achado do bloco: a cena de corrida encontrou defeito

A S-C242 pedia uma cena `sm7` para a troca, e a sobra supunha que a
implementação estava certa: *"a disciplina de tranca está lá (contrato →
bloqueio → vestido), mas nenhuma corrida determinística a exercita"*.

**A disciplina estava mesmo lá. Não era ela que faltava.** Faltava a transação
REPETIR a condição lida fora dela.

O handler confere em `contratos.ts:2152`, **no pool**, que a reserva é deste
contrato — e a transação não reconfere. Duas trocas do mesmo contrato no mesmo
segundo passam as duas por essa conferência:

1. a primeira roda inteira: cria a reserva B, cancela a antiga, apaga o vínculo
   antigo, grava o novo;
2. a segunda entra em seguida, encontra a reserva antiga **já cancelada** — e
   nada olhava para isso —, cria a reserva C, tenta apagar um vínculo que já não
   existe (no-op silencioso) e grava o SEU vínculo.

**O contrato termina com duas reservas vivas e dois vestidos presos**, de um
gesto que era para trocar uma peça por outra. E o snapshot do item diz uma só: o
segundo `UPDATE contrato_itens ... WHERE vestido_id = <antigo>` não acha linha,
porque a primeira troca já reescreveu aquela.

Vermelho literal, com a barreira determinística (`FOR UPDATE` na linha do
contrato, seguradas as duas requisições, `COMMIT`):

```
AssertionError: as duas trocas venceram — o contrato prendeu duas peças:
expected 2 to be 1
```

É a **K8 do PATCH** (*a condição do `where` repete o estado LIDO*) e a **S-O31
do `POST /link`** (*o status é lido no pool e dois cliques congelam duas
versões*) — a mesma classe, terceira vez nesta trilha.

### E o primeiro conserto foi longe demais

Junto com a reconferência do vínculo eu acrescentei um veto a reserva já
cancelada — cinto e suspensório da mesma corrida, **por raciocínio e não por
medição**. O E223 tem cena dizendo o contrário, e ela reprovou no mesmo minuto:

> *"reserva antiga já cancelada: a troca ainda funciona e religa o contrato
> numa reserva viva"*

É o caminho de quem cancelou a reserva por fora e precisa reatar o contrato a
uma peça de verdade; tirá-lo deixaria o contrato preso a nada. **O que fecha a
corrida é o VÍNCULO, e só ele** — o estado `canceladoEm` não distingue os dois
casos. A guarda saiu, e o porquê ficou escrito no lugar dela.

## S-C241 — a medição obrigou a desdizer a própria abertura

A sobra dizia que *"nenhum leitor decide por ele"*. Certo — e medidos, são
**três leitores**, todos em UNIÃO com o N:N (`visao-noiva.ts:228`,
`portal.ts:772`, `leads.ts:602`). União não decide, **acrescenta**.

A primeira redação do teste afirmava, a partir disso, que o portal passava a
mostrar duas peças depois da troca. **Não passa**, e a cena que provaria isso
não é construível:

| leitor | o que o protege |
|---|---|
| `visao-noiva.ts` (o portal) | `isNull(canceladoEm)` no WHERE |
| `portal.ts` (a foto) | `isNull(canceladoEm)` no WHERE |
| `leads.ts` (as datas REAIS da ficha) | **nada no WHERE** — quem o salva é a guarda da PORTA |

O terceiro **não filtra reserva cancelada** e desempata pela mais antiga, que é
sempre a abandonada. O que impede o vazamento não está nele: é o
`TROCA_APOS_RETIRADA` do E223 — a peça que já saiu não pode ser trocada, então a
reserva abandonada por uma troca nunca tem datas reais para mostrar.

**Duas coisas independentes teriam de mudar** para virar defeito visível: alguém
preencher a coluna pela API (**0 de 772** hoje) e a guarda afrouxar. A primeira
o conserto fecha; a segunda ganhou cena própria, para que afrouxá-la reprove no
teste da troca em vez de na ficha da noiva.

A decisão é **ZERA, e não reponta**: um contrato pode ter várias reservas e a
coluna é singular por ser de antes do E72 — depois de uma troca ela só estaria
certa por acaso, e campo que só pode mentir é pior que campo ausente. O `and`
com o valor antigo mantém honesto o caso em que ela aponta outra reserva do
mesmo contrato, que não está sendo trocada.

**Daí nasce a S-C290**: três leitores da mesma união, e um com o WHERE
diferente. Hoje ninguém chega lá; a assimetria é a classe da regra 26.

## S-C240 — "zero ocorrências" eram nove

A sobra dizia que `contratos/[id].tsx` tem *"zero ocorrências de
'bloqueio'/'reserva'"*. **Tem nove** — e nenhuma é a peça: são todas a **reserva
de 40% da cláusula 8ª §1º** (E218) e o prazo da 18ª. A palavra tem dois donos, e
o `grep -c` conta o dono errado. A substância estava certa; a medida não.

O que faltava: a resposta trazia `bloqueioVestidoIds` desde o E72 — **ids crus,
que não desenham nada**. A tela não tinha como dizer QUAL vestido está preso, e
o caminho para a peça física era sempre pela ficha dela. **Foi o E223 que tornou
isso caro**, ao pôr a porta de TROCA na ficha da peça: o gesto que a cláusula
17ª dá ao contrato passou a morar numa tela a que o contrato não levava.

A porta ganhou `pecas` — nome, código e as duas datas reais —, **só as VIVAS**,
pela régua de `montarVestidoDaNoiva`: mostrar reserva cancelada prometeria um
vestido que a loja já liberou. Uma consulta a mais, com `innerJoin`, e só quando
há vínculo.

A tela ganhou o card e o link "Abrir a reserva". Ela **não repete os gestos** da
peça, de propósito: repetir seria a segunda grafia da troca (regra 26), e a
S-C232 já mostrou o preço de duas telas dizendo a mesma coisa. **O que faltava
era o caminho, não o gesto.**

O card não tem ramo de erro, e é a exceção medida da S-C162: a página inteira
retorna no `if (isError)` da `:381` antes de qualquer frase, então a frase de
vazio nunca é desenhada sobre consulta que falhou — e ela diz os **dois**
motivos possíveis (contrato só de serviço, reserva desfeita) em vez de escolher
um como se soubesse qual foi.

## As três réguas que cobraram o bloco

O que cada retrato mudou, e por quê — todos com a razão escrita no próprio
arquivo:

- **`varredura-portas-sob-tranca`**: TRANCA 36 → 37 (o zeramento da coluna
  legada é porta nova, disciplina velha);
- **`varredura-restricoes-do-spec`**: 916 → 926 datas coercidas — **dez**,
  porque `Contrato.pecas[]` traz duas datas e o `Contrato` é devolvido por cinco
  operações. É a multiplicação do E215 outra vez;
- **`varredura-das-varreduras`**: 29 → 30, e **este é erro meu, da classe que a
  S-C182 descreve**. O número nasceu 29 porque foi medido enquanto o arquivo da
  própria régua ainda não tinha passado por `git add`: ela enumera pelo
  `git ls-files` e **não se enxergava**. Verde na rodada do arquivo, vermelho na
  suíte inteira do commit seguinte. A S-C182 escreveu esse degrau para as
  encenações; ele vale igual para a régua que se conta entre os contados.
