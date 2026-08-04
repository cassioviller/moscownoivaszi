# Arqueologia do legado — rastreador

**Aberta em 2026-08-04** · branch `rodada-7-sobras`

Esta é a trilha que a rodada 7 adiou: *"traçador e arqueologia ficaram para
rodada futura"* (`METODO.md`, histórico de 2026-07-30). A matéria-prima não é
o código — são **29 fotos do sistema em papel do ateliê**, tiradas em
2026-07-24, cobrindo 22/06 a 25/10 de 2026 e **136 saídas de peça**.

A lente é uma só: **o que o ateliê faz todo dia e o sistema não deixa fazer.**

## Como retomar

1. Leia `INVENTARIO.md` — o mapa foto → semana, o código de cores do ateliê e
   os **limites da evidência** (é caligrafia; o caderno registra semana, não
   data de casamento; um único número monetário em 29 fotos).
2. Leia `A-o-sistema-em-papel.md` — os 6 achados, o que está BEM, e a seção
   "o que a verificação derrubou do meu próprio diagnóstico".
3. Leia `adversarial.md` — as 6 defesas escritas e conferidas (regra 7).
4. Leia `B-releitura-dos-sete-pontos.md` — a segunda passada pelas fotos, uma
   leitura por PERGUNTA em vez de uma por arquivo. **Ela corrige quatro
   números da trilha A**; onde os dois divergirem, vale a B.
5. Leia a **spec**, `../../propostas/2026-08-04-acervo-a-identidade-da-peca.md`
   — ela é o que manda sobre ordem, numeração e escopo dos épicos, e reordenou
   o que este rastreador propunha (o acervo ainda não entrou no sistema; a
   forma do cadastro custa mais caro que a régua de ocupação).
6. As **perguntas de produto** bloqueiam o bloco 2 da spec. O bloco 1 (E148 a
   E151) não depende de resposta nenhuma (regra 5).

## As duas mídias — o achado que organiza o resto

| | Agenda (15 fotos) | Caderno verde (14 fotos) |
|---|---|---|
| Unidade | o dia, com hora | **a semana** |
| Entidade | a pessoa que vem à loja | **a peça que sai** |
| Registra | prova, retirada, recado, férias | a locação |
| Cobertura | 29/06 – 25/10 | 22/06 – 27/09 |

Até **17/08**, toda segunda-feira alguém copiava a lista do caderno para a
agenda, em rosa, e a cópia perdia linhas. A partir de **24/08** a rotina foi
abandonada: as cinco semanas seguintes somam **79 saídas no caderno e zero
linhas na agenda** (A6, reinterpretado em B3). **A saída da peça não gera
compromisso** — quem só olha a agenda não vê o negócio acontecer.

## Estado das fases

| Fase | Arquivo | Estado | Commit |
|---|---|---|---|
| Inventário das fotos | `INVENTARIO.md` | ✅ | `25f1a17` |
| Trilha A — o sistema em papel | `A-o-sistema-em-papel.md` | ✅ | `25f1a17` |
| Adversarial — refutar o 🔴 e os 🟠 | `adversarial.md` | ✅ | `25f1a17` |
| Trilha B — releitura dos 7 pontos | `B-releitura-dos-sete-pontos.md` | ✅ | `b909f18` |
| Spec de execução | `../../propostas/2026-08-04-acervo-a-identidade-da-peca.md` | ✅ | `e396574` |

Legenda: ⬜ pendente · 🟨 em andamento · ✅ feito e commitado

## Os achados

| # | Tese | Peso | Veredito adversarial |
|---|---|---|---|
| A1 | A régua de ocupação é uma só para o acervo e prende a peça 13 dias; o ateliê realuga em 7 | 🔴 | CONFIRMADO, com ressalva de identidade da peça |
| A2 | O conjunto só é protegido se cada peça for cadastrada e reservada; nada exige isso | 🟠 | CONFIRMADO com escopo corrigido |
| A3 | O filtro de cor compara string exata e o cadastro é campo de texto livre | 🟠 | CONFIRMADO |
| A4 | Não há preço de realuguel, embora a contagem de locações já exista | 🟡 | — (pergunta de produto) |
| A5 | Ausência de vendedora não existe no modelo, e é o 1º dado que a agenda registra | 🟡 | — |
| A6 | Os dois cadernos guardam o mesmo dado e já divergem — decide a importação | 🟡 | reinterpretado em B3 |
| B1 | Configurações mostra "2 min" para uma prova de 60 min — o valor está em slots de 30 | 🟠 | — |
| B2 | O código fecha domingo por premissa escrita; o ateliê atendeu 5 domingos | 🟠 | — |
| B3 | A cópia agenda↔caderno foi abandonada em 24/08, não falhada: 79 saídas sem nenhuma linha | 🟡 | — |
| B4 | 6 provas às 18:30 não cabem no expediente padrão (última possível: 18:00) | 🟡 | — |

**Correções que a trilha B fez na trilha A** (regra 9): o número de páginas
com aviso de férias estava errado por fator 4 (8 → 2 na agenda, 7 no caderno);
os compromissos de cor estavam pela metade (20 → 38) e as cores (12 → 15); a
divergência alegada no item 9 de 17–23/08 foi **retirada** por ilegibilidade;
e *Arnalda* × *Arnica*, que eu tratara como grafia do mesmo modelo, são peças
diferentes — fundi-las juntaria dois itens de acervo na importação.

## Épicos — a spec manda

A numeração e a ordem vivem em
**`docs/propostas/2026-08-04-acervo-a-identidade-da-peca.md`**, e ela
**reordenou** o que este rastreador propunha primeiro. A razão está na abertura
da spec: o `replit.md` diz que o seed do E147 *"não cadastra noiva, vestido,
contrato nem parcela"* e que o único primeiro passo pendente é *"cadastrar os
primeiros vestidos"* — **o acervo ainda não entrou**. Logo:

| | Custo se estiver errado |
|---|---|
| forma do CADASTRO (A2, A3, identidade da peça) | recadastrar o acervo à mão |
| régua de OCUPAÇÃO (A1) | um `UPDATE` de uma linha |

O 🔴 é o segundo. A ordem passou a ser esta:

| Épico | Fecha | Bloqueado por |
|---|---|---|
| **E148** — a régua que a tela mostra é a que o sistema usa | B1 | — |
| **E149** — cor e categoria saem do texto livre e viram catálogo | A3 | — |
| **E150** — o acessório vira peça, e o item que aponta peça exige reserva | A2 | — (depende do E149) |
| **E151** — a ausência da vendedora existe e a agenda a respeita | A5 | — |
| **E152** — a régua de ocupação deixa de ser uma só | A1 | **P1** |
| **E153** — modelo × peça | ponto 5 | **P2 e P3** |

Os quatro primeiros **não dependem de resposta nenhuma** e podem começar hoje.

**As três perguntas que bloqueiam o bloco 2** (texto completo na spec):

1. **P1** — quantos dias a peça fica parada depois do casamento, e a lavagem é
   interna ou terceirizada? *(Decide se o A1 existe: a colisão vem **só** da
   lavagem — os dois usos não se tocam, sobra 1 dia entre eles.)*
2. **P2** — "Arnalda P" e "Arnalda G" são o mesmo vestido em dois tamanhos ou
   dois vestidos? *(Escolhe entre Caminho A e Caminho B.)*
3. **P3** — quantas peças do acervo têm mais de uma unidade? *(Decide se o
   Caminho A se paga.)*

A4 (preço de realuguel) segue sem épico: o único número monetário em 29 fotos
é ambíguo entre valor e código — embora a releitura tenha achado **ponto de
milhar** no `7.600`, e nenhum dos 8 códigos observados use ponto.

**B2 e B4 (expediente: domingo e 18:30) saíram dos épicos** e viraram S-A8: são
defaults configuráveis, e ninguém perguntou qual é o expediente real do ateliê.

### Correção à força do A1, feita ao escrever a spec

O diagnóstico citou **três** pares de semanas consecutivas. Indo atrás de quem
é a noiva em cada um, **só um sobrevive**:

| Par | Semana N | Semana N+1 | Vale? |
|---|---|---|---|
| **Adelita** | Larissa · *"Novo que chegou / 1º Aluguel"* | Mª Fernanda · *"Realuguel"* | **sim** |
| Konte | **Larissa** | **Larissa** | não — mesma noiva, registro movido |
| Shellyane | Isabela | Letícia · *"Shellyane **P**"* | não — o `P` pode ser outra peça |

E há uma anotação que ameaça o achado inteiro, sem resolução possível pela
foto: `CHLOE → se sabe que tá 15 dias` (21–27/09, item 10). Se a locação dura
15 dias, peça nenhuma sai em semanas consecutivas — mas o mesmo caderno usa
"15 dias" para ausência de funcionária (*"Volta da Marilza 15 dias"*), e há um
"ISA" (nome de vendedora) rabiscado ao lado. **P1 resolve.**

## Sobras — visto de passagem sem épico

Regra 12 do método: a sobra entra aqui no MESMO commit que a viu.

| # | O quê | Peso | Origem |
|---|---|---|---|
| S-A1 | **As 29 fotos entraram no git (3,8 MB).** Decisão contrária à da rodada 7, que deixou as 81 capturas fora (`.gitignore`) — e deliberada: aquelas eram **regeneráveis por script** (S-D1), estas são evidência primária de um sistema em papel que não se recaptura. Se o peso incomodar, o caminho é um repo de evidências, não apagar. | 🔵 | montagem da trilha |
| S-A2 | **Falta o verso da última página do caderno.** A semana de 21–27/09 termina com "ATRÁS →" e o verso não foi fotografado; as semanas de 28/09 a 11/10 também faltam. As 136 saídas contadas são piso, não total. Pedir as fotos que faltam antes de qualquer contagem virar número de negócio. | 🟡 | trilha A |
| S-A3 | **O ateliê tem uma segunda linha de negócio que o diagnóstico só tangenciou:** festa/madrinha/dama, indexada por COR e com código de 4 dígitos, contra noiva indexada por nome de modelo. São **38** compromissos em laranja nas 15 páginas de agenda (contagem da trilha B; a trilha A dizia ~20), e em setembro eles superam as provas de noiva. O A3 trata do filtro; ninguém olhou ainda se o fluxo comercial dessa linha (prazo, preço, prova) é o mesmo. | 🟡 | trilha A · recontada em B |
| S-A4 | **A confecção sob medida aparece 3 vezes e não tem lugar no modelo:** *"Siam + Manga **será confeccionada**"* (10–16/08), *"conversar sobre confecção de manga"* (21/07 e 24/07, dois compromissos de 10:30 dedicados ao assunto). Não é ajuste de peça existente (`ajustesTable`) — é peça nova feita para a noiva. Sem âncora de código porque não há código: é ausência. | 🟡 | trilha A |
| S-A6 | **A confecção sob medida ganhou uma segunda evidência na trilha B:** o caderno de 13–19/07 numera *"Manga renda c/ saia lisa"* como item **5** da semana, com a nota *"(Mesma noiva Dayfini)"* — a peça componente tem número de ordem próprio no acervo, igual a um vestido. Reforça a S-A4 e o A2. | 🟡 | trilha B |
| S-A7 | **O `provaDuracao` tem unidade implícita e não documentada** (slots de 30 min). O B1 conserta a tela; a raiz é o nome do campo não dizer a unidade — `provaDuracaoSlots` ou guardar minutos resolveria a classe. `e115-portal-agenda-api.test.ts:92` usa `provaDuracao: 3` (= 90 min) e `revisao-reguas-unit.test.ts:64` idem, então os testes já convivem com a ambiguidade. | 🔵 | trilha B |
| S-A8 | **A régua de dias é do sistema, mas o expediente real do ateliê nunca foi perguntado.** B2 e B4 mostram domingo aberto e 18:30 usado; `configuracao-inicial.ts:125` afirma "como todo ateliê de noiva" sobre o mundo. Vale uma passada em TODA premissa categórica escrita em comentário do `configuracao-inicial.ts` antes de a próxima loja nascer com ela. | 🟡 | trilha B |
| S-A5 | **O `CLAUDE.md` segue apontando para o rastreador da rodada 6** — é a S-D28 da rodada 7, ainda aberta, e agora há um terceiro rastreador (este) disputando o ponteiro. Quando fechar, o ponteiro deve dizer qual é a rodada em curso **e** que a arqueologia é uma trilha paralela. | 🟡 | montagem da trilha |
