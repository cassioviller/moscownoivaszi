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
4. As **perguntas de produto** no fim da trilha A são bloqueantes para 3 dos 4
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
| A6 | Os dois cadernos guardam o mesmo dado e já divergem — decide a importação | 🟡 | — |

## Épicos propostos — nenhum começa antes das respostas

| Épico | Fecha | Bloqueado por |
|---|---|---|
| E148 — a régua de ocupação deixa de ser uma só para o acervo | A1 | pergunta 1 |
| E149 — o acessório vira peça, e o item que aponta peça exige reserva | A2 | pergunta 3 |
| E150 — cor e categoria saem do texto livre e viram catálogo | A3 | pergunta 5 |
| E151 — a ausência da vendedora existe e a agenda a respeita | A5 | — |

A4 (preço de realuguel) não vira épico antes da pergunta 2: o único número
monetário em 29 fotos é ambíguo entre valor e código de peça.

## Sobras — visto de passagem sem épico

Regra 12 do método: a sobra entra aqui no MESMO commit que a viu.

| # | O quê | Peso | Origem |
|---|---|---|---|
| S-A1 | **As 29 fotos entraram no git (3,8 MB).** Decisão contrária à da rodada 7, que deixou as 81 capturas fora (`.gitignore`) — e deliberada: aquelas eram **regeneráveis por script** (S-D1), estas são evidência primária de um sistema em papel que não se recaptura. Se o peso incomodar, o caminho é um repo de evidências, não apagar. | 🔵 | montagem da trilha |
| S-A2 | **Falta o verso da última página do caderno.** A semana de 21–27/09 termina com "ATRÁS →" e o verso não foi fotografado; as semanas de 28/09 a 11/10 também faltam. As 136 saídas contadas são piso, não total. Pedir as fotos que faltam antes de qualquer contagem virar número de negócio. | 🟡 | trilha A |
| S-A3 | **O ateliê tem uma segunda linha de negócio que o diagnóstico só tangenciou:** festa/madrinha/dama, indexada por COR e com código de 4 dígitos, contra noiva indexada por nome de modelo. São ~20 compromissos em laranja nas 15 páginas de agenda. O A3 trata do filtro; ninguém olhou ainda se o fluxo comercial dessa linha (prazo, preço, prova) é o mesmo. | 🟡 | trilha A |
| S-A4 | **A confecção sob medida aparece 3 vezes e não tem lugar no modelo:** *"Siam + Manga **será confeccionada**"* (10–16/08), *"conversar sobre confecção de manga"* (21/07 e 24/07, dois compromissos de 10:30 dedicados ao assunto). Não é ajuste de peça existente (`ajustesTable`) — é peça nova feita para a noiva. Sem âncora de código porque não há código: é ausência. | 🟡 | trilha A |
| S-A5 | **O `CLAUDE.md` segue apontando para o rastreador da rodada 6** — é a S-D28 da rodada 7, ainda aberta, e agora há um terceiro rastreador (este) disputando o ponteiro. Quando fechar, o ponteiro deve dizer qual é a rodada em curso **e** que a arqueologia é uma trilha paralela. | 🟡 | montagem da trilha |
