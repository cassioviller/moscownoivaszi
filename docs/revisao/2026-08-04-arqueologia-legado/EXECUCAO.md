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
5. As **perguntas de produto** no fim da trilha A são bloqueantes para 3 dos 4
   épicos: nenhum vira código antes de o dono responder (regra 5).

## As duas mídias — o achado que organiza o resto

| | Agenda (15 fotos) | Caderno verde (14 fotos) |
|---|---|---|
| Unidade | o dia, com hora | **a semana** |
| Entidade | a pessoa que vem à loja | **a peça que sai** |
| Registra | prova, retirada, recado, férias | a locação |
| Cobertura | 29/06 – 25/10 | 22/06 – 27/09 |

Toda segunda-feira alguém copia a lista do caderno para a agenda, em rosa. A
cópia perde de 0 a **63%** das linhas (A6). **A saída da peça não gera
compromisso** — quem só olha a agenda não vê o negócio acontecer.

## Estado das fases

| Fase | Arquivo | Estado | Commit |
|---|---|---|---|
| Inventário das fotos | `INVENTARIO.md` | ✅ | `25f1a17` |
| Trilha A — o sistema em papel | `A-o-sistema-em-papel.md` | ✅ | `25f1a17` |
| Adversarial — refutar o 🔴 e os 🟠 | `adversarial.md` | ✅ | `25f1a17` |
| Trilha B — releitura dos 7 pontos | `B-releitura-dos-sete-pontos.md` | ✅ | *(sessão 2)* |
| Backlog em épicos | — | ⬜ | — |

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

## Épicos propostos — nenhum começa antes das respostas

| Épico | Fecha | Bloqueado por |
|---|---|---|
| E148 — a régua de ocupação deixa de ser uma só para o acervo | A1 | pergunta 1 |
| E149 — o acessório vira peça, e o item que aponta peça exige reserva | A2 | pergunta 3 |
| E150 — cor e categoria saem do texto livre e viram catálogo | A3 | pergunta 5 |
| E151 — a ausência da vendedora existe e a agenda a respeita | A5 | — |
| E152 — a régua que a tela mostra é a régua que o sistema usa (duração em minutos) | B1 | — |
| E153 — o expediente do ateliê sai do ateliê, não da premissa (domingo, 18:30) | B2, B4 | pergunta 6 |

A4 (preço de realuguel) não vira épico antes da pergunta 2: o único número
monetário em 29 fotos é ambíguo entre valor e código de peça — embora a
releitura tenha achado o **ponto de milhar** no `7.600`, e nenhum dos 8
códigos de peça observados use ponto.

**Pergunta 6, nova (trilha B):** qual é o expediente real do ateliê? O papel
mostra 7 compromissos em 5 domingos e 6 provas às 18:30 — as duas coisas que
o default recusa.

## Sobras — visto de passagem sem épico

Regra 12 do método: a sobra entra aqui no MESMO commit que a viu.

| # | O quê | Peso | Origem |
|---|---|---|---|
| S-A1 | **As 29 fotos entraram no git (3,8 MB).** Decisão contrária à da rodada 7, que deixou as 81 capturas fora (`.gitignore`) — e deliberada: aquelas eram **regeneráveis por script** (S-D1), estas são evidência primária de um sistema em papel que não se recaptura. Se o peso incomodar, o caminho é um repo de evidências, não apagar. | 🔵 | montagem da trilha |
| S-A2 | **Falta o verso da última página do caderno.** A semana de 21–27/09 termina com "ATRÁS →" e o verso não foi fotografado; as semanas de 28/09 a 11/10 também faltam. As 136 saídas contadas são piso, não total. Pedir as fotos que faltam antes de qualquer contagem virar número de negócio. | 🟡 | trilha A |
| S-A3 | **O ateliê tem uma segunda linha de negócio que o diagnóstico só tangenciou:** festa/madrinha/dama, indexada por COR e com código de 4 dígitos, contra noiva indexada por nome de modelo. São ~20 compromissos em laranja nas 15 páginas de agenda. O A3 trata do filtro; ninguém olhou ainda se o fluxo comercial dessa linha (prazo, preço, prova) é o mesmo. | 🟡 | trilha A |
| S-A4 | **A confecção sob medida aparece 3 vezes e não tem lugar no modelo:** *"Siam + Manga **será confeccionada**"* (10–16/08), *"conversar sobre confecção de manga"* (21/07 e 24/07, dois compromissos de 10:30 dedicados ao assunto). Não é ajuste de peça existente (`ajustesTable`) — é peça nova feita para a noiva. Sem âncora de código porque não há código: é ausência. | 🟡 | trilha A |
| S-A6 | **A confecção sob medida ganhou uma segunda evidência na trilha B:** o caderno de 13–19/07 numera *"Manga renda c/ saia lisa"* como item **5** da semana, com a nota *"(Mesma noiva Dayfini)"* — a peça componente tem número de ordem próprio no acervo, igual a um vestido. Reforça a S-A4 e o A2. | 🟡 | trilha B |
| S-A7 | **O `provaDuracao` tem unidade implícita e não documentada** (slots de 30 min). O B1 conserta a tela; a raiz é o nome do campo não dizer a unidade — `provaDuracaoSlots` ou guardar minutos resolveria a classe. `e115-portal-agenda-api.test.ts:92` usa `provaDuracao: 3` (= 90 min) e `revisao-reguas-unit.test.ts:64` idem, então os testes já convivem com a ambiguidade. | 🔵 | trilha B |
| S-A8 | **A régua de dias é do sistema, mas o expediente real do ateliê nunca foi perguntado.** B2 e B4 mostram domingo aberto e 18:30 usado; `configuracao-inicial.ts:125` afirma "como todo ateliê de noiva" sobre o mundo. Vale uma passada em TODA premissa categórica escrita em comentário do `configuracao-inicial.ts` antes de a próxima loja nascer com ela. | 🟡 | trilha B |
| S-A5 | **O `CLAUDE.md` segue apontando para o rastreador da rodada 6** — é a S-D28 da rodada 7, ainda aberta, e agora há um terceiro rastreador (este) disputando o ponteiro. Quando fechar, o ponteiro deve dizer qual é a rodada em curso **e** que a arqueologia é uma trilha paralela. | 🟡 | montagem da trilha |
