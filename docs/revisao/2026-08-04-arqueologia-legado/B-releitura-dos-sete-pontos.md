# Trilha B — releitura minuciosa dos sete pontos: quatro se confirmam, dois foram subestimados, um estava com o número errado

**Arqueologia do legado, sessão 2 — 2026-08-04** · branch `rodada-7-sobras`
Base: `25f1a17` (trilha A)

Método: segunda passada pelas **29 fotos**, uma por uma, com a pergunta fixa
"o que esta página diz sobre o ponto N?" em vez da leitura corrida da sessão 1.
A diferença de resultado justifica a repetição: um número da trilha A estava
**errado por fator 4**, dois estavam subestimados pela metade, e a releitura
produziu quatro achados que a primeira passada não viu.

---

## Ponto 1 — o conjunto · **CONFIRMADO, e mais forte do que eu tinha escrito**

A trilha A argumentou que o acessório é peça e o contrato o trata como frase.
A releitura achou a prova de que **o próprio ateliê o trata como peça de
acervo, com número de ordem próprio**:

Semana de 13–19/07 (`fotos/…55.jpeg`):

```
Gabriela  1) Dayfini + [apagado]
Gabriela  5) Manga renda c/ saia lisa   (Mesma noiva Dayfini)
```

**A mesma noiva ocupa duas linhas numeradas da semana.** O item 5 não é
descrição do item 1 — é uma entrada independente na contagem do acervo, e
quem escreveu anotou entre parênteses por que o nome da noiva se repete. Numa
semana de 8 saídas, 2 são da mesma cliente porque **são duas peças**.

Composições encontradas na releitura — 10, não 8:

| Semana | Linha |
|---|---|
| 13–19/07 | `Ricca Sposa + Bolero Ricca Sposa` |
| 13–19/07 | `Manga renda c/ saia lisa` *(peça própria)* |
| 10–16/08 | `[…] + Telmah + uma Pérola` |
| 10–16/08 | `Siam + Manga (será confeccionada) + Mantilha` |
| 24–30/08 | `Milla Nova (+ aplicações)` |
| 24–30/08 | `Avrony c/ Trançado` |
| 31/08–06/09 | `Kalina + Saiote 2 aros + crinol` |
| 31/08–06/09 | `Lilya + NSA` |
| 07–13/09 | `Klosella + Solussaia + Manga` |
| 07–13/09 | `Bernarda + Bolero Ricca Sposa` |
| 21–27/09 | `Tamara + Bolero 2026` |

Note `Bolero Ricca Sposa` em **duas semanas distintas** (13–19/07 e 07–13/09),
com noivas diferentes (Danielle e Laiza) — é uma peça que circula, não um
adjetivo.

---

## Ponto 2 — 1º aluguel × realuguel · **CONFIRMADO literalmente, 7 marcações**

A releitura confirmou o par que sustenta o A1, palavra por palavra, nas duas
fotos:

- `fotos/…56 (2).jpeg`, semana **07–13/09**, item 7:
  `Larissa 7) Adelita (Adelita)` → seta → **"Novo que chegou"** e, em
  marca-texto verde, **"1º Aluguel"**.
- `fotos/…56 (3).jpeg`, semana **14–20/09**, item 1:
  `Mª Fernanda 1) Adelita. **Realuguel**.`

As sete marcações de contagem de locação em 14 semanas:

| Marcação | Peça | Semana |
|---|---|---|
| 1º Aluguel | YOKO | 31/08–06/09 |
| 1º Aluguel | Adelita | 07–13/09 |
| 1º aluguel | Andreia | 21–27/09 |
| 2º Aluguel | Nixia | 07–13/09 |
| 2º | BLARY | 24–30/08 |
| Realuguel **7.600** | Fencyella | 20–26/07 |
| Realuguel | Adelita | 14–20/09 |

**Sobre o `7.600`:** a releitura de perto mostra **ponto de milhar**, e nenhum
dos 8 códigos de peça observados usa ponto (4113, 9517, 4551, 6503, 2611,
9829, 0827, 792). Isso favorece a leitura de **valor**, não de código — mas
segue sem `R$`, então a pergunta 2 ao dono continua de pé.

---

## Ponto 3 — a prova tem ordinal · **CONFIRMADO, 5 pares, e a régua de 14 dias está certa**

A releitura achou **cinco** pares 1ª/2ª prova da mesma noiva com o mesmo
vestido, que a passada corrida não tinha ligado:

| Noiva / peça | 1ª prova | 2ª prova | Intervalo | Semana da saída |
|---|---|---|---|---|
| Ana / Monalisa | 01/07 18:00 | 03/07 15:00 | 2 d | 13–19/07 |
| Mariane / Thelma | — | 08/07 15:00 | — | 06–12/07 |
| Bruna / Cristal | 04/08 14:00 | 11/08 14:00 | 7 d | 17–23/08 |
| Letícia / Kailany | 25/08 11:30 | 31/08 10:30 | 6 d | — |
| Larissa / Konte | 26/08 16:00 | 04/09 16:00 | 9 d | 21–27/09 |

**E isto valida a régua do sistema.** Danielle faz a 1ª prova de `Ricca Sposa`
em 30/06 e a peça sai na semana de 13–19/07 — **14 dias**, exatamente o
`provaDiasAntes: 14` de `configuracao-inicial.ts:128`. Ana/Monalisa: 1ª prova
01/07, saída 13–19/07 — 12 a 18 dias. A calibração do sistema bate com o
ateliê.

**Isto também confirma que a semana do caderno é a semana do CASAMENTO**, e
não uma semana administrativa qualquer — o que era a premissa da conta do A1 e
estava declarada como cenário. Agora está apoiada em cinco pares.

A correção da sessão 1 continua válida e fica de pé: cada prova é um
`atendimento` próprio; `provaDataReal` é override de janela, não registro da
prova.

---

## Ponto 4 — a linha de festa/dama · **SUBESTIMEI PELA METADE**

A trilha A escreveu "~20 compromissos em laranja" e "12 cores distintas". A
contagem página a página dá **38 compromissos** e **15 cores**:

fúcsia · terracota · marsala · verde · rosa · champagne · dama · azul ·
**azul serenity** · pink · laranja · amarela · rosê · vermelho · dourado

Distribuição: 8 em julho, 11 em agosto, 15 em setembro, 4 em junho/outubro. A
linha de festa **cresce** ao longo do período fotografado — em setembro são
15 compromissos de cor contra 12 provas de noiva.

Isso não muda a tese do A3; muda o peso. A segunda linha de negócio não é um
apêndice: em setembro ela é a maioria dos compromissos da agenda.

---

## Ponto 5 — o nome não é chave · **MUDOU DE NATUREZA, e eu errei um par**

A trilha A tratou isso como **variação de grafia**. A releitura mostra que é
mais sério: **o mesmo nome-base designa peças físicas diferentes**, e o
ateliê as distingue com sufixo de tamanho e número de unidade.

**Duas peças de nome igual saem na MESMA semana, duas vezes:**

| Semana | Item | Item |
|---|---|---|
| 17–23/08 | `1) Arnalda` (Bianca) | `12) Arnalda G c/ manga Buyanta` (Aline) |
| 14–20/09 | `8) Arnalda 20.09` (Silvia) | `10) Arnalda P. (P) 19.` (Sarah) |

E a numeração de unidade aparece explícita:
`21–27/09, item 1: **Arnica 2** G (Busto grande) Original` — número da
unidade, tamanho, característica e "Original" (distinguindo de uma cópia).
Também `Shelly 2` (31/08–06/09).

**O erro que preciso corrigir:** a trilha A listou *"Arnalda / Arnica"* como
variação de grafia do mesmo nome. Está errado — são **modelos diferentes**,
os dois presentes no acervo, e a releitura os vê lado a lado em semanas
distintas com noivas distintas. Tratá-los como grafia do mesmo item teria
fundido duas peças na importação.

**E o papel documenta o próprio problema:** semana de 06–12/07, item 2, a
grafia é corrigida na hora, em destaque rosa —
`Mariane 2) T+hilma **(Thelma)**`. Quem escreve já sabe que o nome não
identifica.

---

## Ponto 6 — a ausência da vendedora · **O NÚMERO DA TRILHA A ESTAVA ERRADO**

A trilha A afirma: *"**8 das 15 páginas de agenda** trazem aviso de ausência
no cabeçalho"*. **Falso.** A contagem correta, página a página:

- **Agenda: 2 de 15** (29/06–05/07 e 06/07–12/07).
- **Caderno: 7 de 14** — 22–28/06 *Férias Marilza/Gabi*; 29/06–05/07 *Férias
  Marilza*; 13–19/07 *Jeni → 16 a 25*; 20–26/07 *férias Jeni*; 27/07–02/08
  *Férias Isa / férias Marina*; 03–09/08 *Férias Isa*; 10–16/08 *Férias
  Marina*.

Eu contei as duas mídias juntas e atribuí o total à agenda. O achado A5
sobrevive — a ausência existe no papel e não existe no modelo — mas **mora no
caderno do acervo, não na agenda**, e some depois de 16/08.

Isso é mais interessante do que o número errado sugeria: o ateliê anota quem
está de férias **na página que conta as peças que saem**, porque é a
capacidade de atender que limita quantas saem. As sete anotações são todas de
junho a agosto — a baixa temporada.

---

## Ponto 7 — troca e cancelamento · **CONFIRMADO, 7 trocas em 14 semanas**

| Semana | Registro |
|---|---|
| 29/06–05/07 | `1) Sollyane` riscado — *"trocou data"* |
| 29/06–05/07 | `2) Thelma` riscado (rosa) → `Taiane` |
| 06–12/07 | `5) [riscado] Thayone` |
| 13–19/07 | `2) [rabiscado] (cancelado)` |
| 20–26/07 | `1) Sense` riscado → `Gwendolin G` |
| 27/07–02/08 | `01) Arnica G` riscado inteiro · `Italina` riscado → `Gabriela` |
| 10–16/08 | `2) Berenice` riscado → `Ariane` · `3) Luma` — *"trocou Data"* |
| 14–20/09 | `6) Thelmah` riscado *(trocou)* → `Shellyane P` |
| 31/08–06/09 | *"Karina vai pedir outro"* |

Uma troca a cada duas semanas, em média. E a releitura achou a mesma troca
registrada **nas duas mídias**: a agenda de 28/07 traz
`15:00 Nicolly – Berenice [riscado] ARIANE`, e o caderno de 10–16/08 traz
`2) Berenice [riscado] Ariane`. Quando a cópia acontece, ela copia as rasuras.

A conclusão da sessão 1 fica de pé e reforçada: o papel nunca apaga, e o
sistema também não (não há caminho para trocar `vestidoId` numa reserva).

---

# Os quatro achados que só a segunda passada viu

## B1 🟠 — A tela de Configurações mostra a duração da prova em "min" e o número está em slots de 30 minutos

**Âncoras:** `artifacts/moscow-noivas/src/pages/configuracoes/index.tsx:184`
— `<span className="font-medium">{disponibilidade.provaDuracao} min</span>`.
E a unidade real, em `artifacts/api-server/src/routes/agenda.ts:93`:
`const janelaMs = Math.max(1, regra?.provaDuracao ?? 1) * 30 * 60_000` — o
valor é multiplicado por **30 minutos**. Confirmado no consumidor da grade:
`pages/agenda/grade.tsx:171` — *"uma PROVA ocupa `provaDuracao` slots"*.

**Cenário:** o default é `provaDuracao: 2`
(`configuracao-inicial.ts:129`). A tela de Configurações mostra, hoje, para
toda loja nova: **"Duração da prova — 2 min"**. A prova dura **60 minutos**.
A dona que abrir Configurações para entender por que a agenda só oferece
poucos horários lê um número 30× menor que o real, na única tela que
existe para explicar a régua.

**Número:** 2 exibido, 60 reais — erro de fator 30. As outras cinco linhas do
mesmo bloco (`:181`, `:187`…) exibem `dias` e estão corretas; a de duração é
a única com unidade trocada.

## B2 🟠 — O sistema fecha domingo por premissa escrita no código, e este ateliê atende domingo

**Âncoras:** `artifacts/api-server/src/lib/configuracao-inicial.ts:125`, o
comentário: *"`diasFuncionamento` é seg–sáb (domingo fechado, **como todo
ateliê de noiva**)"*, e `:135` grava `[1, 2, 3, 4, 5, 6]`. Quem recusa:
`lib/agenda-core/src/slots.ts:77`
(`if (dias && !dias.includes(diaDaSemanaLocal(instante))) return false`) e
`lib/agenda-core/src/mover.ts:92`.

**Evidência de papel: 7 compromissos em 5 domingos.**

| Domingo | Compromisso |
|---|---|
| 19/07 | `14h MARIA LUISA – YOKO` · `18:00 Ana P 1pr Shelly` |
| 02/08 | `18:00 Larissa – SHELLY` |
| 09/08 | `14:00 Evelym 1pr Arnica` |
| 16/08 | `14:00 Amanda 1pr Milla Nova` · `18:00 GABRIELLY Blary 1pr` |
| 13/09 | `18:00 Larissa 1pr Konte` |

**Cenário:** a vendedora tenta marcar a prova de domingo que a noiva pediu — a
grade não oferece o slot e o `POST` recusa. O default é configurável, então o
conserto é uma linha na tela de Configurações; o que o achado pede é **tirar a
premissa do comentário**: "como todo ateliê de noiva" é uma afirmação sobre o
mundo que este ateliê refuta 7 vezes em 15 páginas.

## B3 🟡 — A cópia agenda↔caderno não é falha de disciplina: foi ABANDONADA em agosto

A trilha A apresentou isto como perda percentual (0 a 63%), o que sugere
descuido. A releitura, página a página, mostra outra coisa:

| Segunda-feira | Lista na agenda | Caderno |
|---|---|---|
| 29/06 · 06/07 · 13/07 · 20/07 · 27/07 · 03/08 · 10/08 · 17/08 | **sim** (8) | 3–16 |
| 24/08 · 31/08 · 07/09 · 14/09 · 21/09 | **não** (0) | 12–21 |

A prática existe até **17/08** e desaparece por completo depois. As cinco
semanas seguintes somam **79 saídas no caderno e zero linhas na agenda**.

Não é erro de cópia: é uma rotina que morreu. Para a importação, isso é melhor
notícia do que a leitura anterior — **o caderno é a fonte única a partir de
24/08**, sem concorrente. E é pior notícia para quem só olhar a agenda dos
últimos dois meses: ela não registra o negócio.

**Correção formal à trilha A:** a tabela do A6 continua correta nos números
que traz, mas a linha interpretativa ("a cópia perde de 0 a 63%") passa a ser
"a cópia existiu até 17/08 e foi abandonada".

## B4 🟡 — Seis provas marcadas às 18:30 não cabem no expediente que o sistema grava

**Âncoras:** `configuracao-inicial.ts:133-134` —
`atendimentoAberturaHora: 9`, `atendimentoFechamentoHora: 19`; e a duração
real da prova, 60 min (`agenda.ts:93`, ver B1). Logo, **a última prova que
cabe começa às 18:00**.

**Evidência:** 6 compromissos às 18:30 no papel — 08/07 (Priscila, marsala),
16/07 (Letícia, prova ou troca), 04/08 (Ana Clara e Amanda, marsala), 07/08
(Gabi, noiva Sposa), 13/08 (Sabrina, Avrony). Mais 12 compromissos às 18:00,
que cabem raspando.

**Cenário:** metade do movimento do fim do dia deste ateliê acontece na faixa
que o expediente padrão recusa ou tangencia. Como B2, é configurável — o
achado é que **o default não foi tirado deste ateliê**, e a instalação nova
nasce recusando o horário mais usado depois das 17h.

---

## O que esta segunda passada ensinou sobre o método

A sessão 1 leu as 29 fotos **uma vez, em ordem**, e escreveu os achados. Esta
leu as mesmas 29 **sete vezes, uma por pergunta**. O custo foi uma sessão; o
que apareceu:

- um número errado por fator 4 (ponto 6: 8 → 2 páginas);
- dois subestimados pela metade (ponto 4: 20 → 38 compromissos; ponto 1: 8 →
  11 composições);
- um par de nomes fundido por engano que teria juntado duas peças na
  importação (ponto 5: Arnalda ≠ Arnica);
- quatro achados novos, dois deles (B1, B2) com âncora de código e defeito
  demonstrável;
- e a validação de uma premissa que a trilha A tinha declarado como *cenário*
  não verificado — a semana do caderno é a semana do casamento, provada por 5
  pares de prova datados.

**A regra que isto propõe:** evidência não-textual (foto, captura, gravação)
se lê uma vez por PERGUNTA, não uma vez por ARQUIVO. A leitura corrida
produz a narrativa; a leitura por pergunta produz a contagem — e foi a
contagem que corrigiu a narrativa em quatro pontos.

## Uma coisa que a releitura NÃO conseguiu resolver

A trilha A afirma que, na lista de 17/08, *"o item 9 da agenda é Bruna/Larissa
e o do caderno é Arina/Letícia"*. Reli a foto ampliada: os itens 1 a 8 batem
com o caderno linha a linha, e o item 9 **não é legível o bastante** para
sustentar a divergência. **Retiro a afirmação** — o que se sustenta da linha
original é apenas a contagem (9 na agenda, 16 no caderno).
