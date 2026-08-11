# Rodada 2 — consolidado (camada G)

**2026-08-11** · base `89b38c8` · entrada: os 53 sobreviventes de
`rodada-2-achados/` (11 ângulos, 55 julgados, 2 refutados)

A pergunta desta camada é a de sempre: **o que é o MESMO problema?** Os 53
consolidam em **10 épicos** — dois 🟠 na frente, dois que FECHAM sobras da
fila (S-M9 e S-M18, agora enumeradas), e seis que agrupam o resto por
mecanismo. Nenhum achado ficou sem destino; a coluna "entra em" do mapa diz
onde cada um mora.

## As duplicatas entre ângulos

O mesmo defeito visto por duas lentes conta UMA vez:

| Defeito | Apareceu em | Consolidado em |
|---|---|---|
| Conciliação criar×editar (+ comentário que mente) | 4#1 e 8#1 | S-M21 |
| Estoque criar×editar | 4#2 e 8#4 | S-M21 |
| Catálogo criar×editar (+ TODO que mente) | 4#9 e 8#3 | S-M21 |
| Quantidade negativa no criar de item | 1#1 e 5#2 | S-M23 |

53 sobreviventes − 4 duplicatas = **49 defeitos únicos**.

## A fila — 10 épicos, na ordem de execução

| # | Épico | Sev | Fecha | Achados |
|---|---|---|---|---|
| S-M19 | **`parcela.origem` entra no spec e a tela volta a fazer a pergunta certa** — reparo cobrado antes do carnê trava o "Gerar plano" | 🟠 | — | 5#1 |
| S-M20 | **O diálogo de receber parcela vira UM** — a cópia do contrato perde a data, o `<form>` do E136 e reescreve `rotuloParcela` | 🟠 | — | 7#1 |
| S-M22 | **Check-then-write: a guarda relida SOB TRANCA dentro da transação** — 9 sítios + 1 write+write, a forma que a S-M7 fechou | 🟡 | **S-M18** | 3#1–8, 11#1, 11#2 |
| S-M24 | **Estado terminal é terminal em TODA porta** — bloqueio cancelado aceito como reserva, reserva CANCELADA soltando contrato ATIVO, PATCH em CANCELADO, escrita em RECUSADO, venda em lead PERDIDO | 🟡 | — | 6#1–5 |
| S-M23 | **Os pisos que faltavam na borda** — Input×Update simétricos: quantidade, dinheiro sem piso, desconto sem teto, string vazia, OFX pt-BR | 🟡 | — | 1#1/5#2, 1#2, 1#3, 5#3, 5#4, 5#5, 5#6 |
| S-M21 | **criar×editar: a tela pergunta a MESMA ação que o servidor deriva** — 9 sítios de gate + 3 comentários que mentem + página sem gate | 🟡 | **S-M9** | 4#1–9, 8#1–4, 6#1(filtro do POST) |
| S-M25 | **O dia e o instante param de se misturar** — vigência de comissão, validade de orçamento, sazonalidade, e o "hoje" UTC de 10 specs | 🟡 | — | 2#1–4 |
| S-M26 | **Uma contagem, uma régua** — "lead ativo" do consolidado × dashboard; o cartão da fila ignora a S-D13 | 🟡 | — | 7#2, 7#3 |
| S-M27 | **Os índices que o B10/E91 não alcançou** — registros_cobranca, orcamentos, orcamento_itens, bloqueio_vestidos; e a dupla descida dos itens | 🟡 | — | 9#1–4 |
| S-M28 | **As réguas que mentem** — S-D44 cega para e2e/, assert tautológico da S28, "FALHA ESPERADA" de defeito fechado, ui/tabs morto, a 3ª tela da S-M4 | 🟡/🔵 | — | 10#1–3, 8#5, 11#3 |

Por que esta ordem: os dois 🟠 têm gatilho de balcão e dinheiro datado errado;
a S-M22 é a família de dinheiro-sob-concorrência e inclui defeito nascido nos
consertos de ONTEM; a S-M24 fecha portas de escrita em registro morto; as
demais descem por custo. A S-M23 vem antes da S-M21 porque as duas tocam o
spec e o codegen roda uma vez por época.

## O que NÃO entra na fila

- **S-M10 e S-M17 seguem como estavam** — a rodada 2 não achou sítio novo de
  nenhuma das duas (o ângulo 10 conferiu e registrou).
- A **nota do localizador do ângulo 1** (`ContratoInput.valorTotal` sem piso)
  entra na S-M23 por ser a mesma forma, com a mesma régua.
- Os **refutados** ficam nos arquivos de ângulo — inclusive os dois do ângulo
  10, cujo resíduo 🔵 (fixture do 08/15, assert frouxo do probe 401) não vale
  linha de fila.

## Regra de fecho

Cada épico: um commit de código com o vermelho medido antes onde ele é
mensurável, testes que preguem o conserto, e o parágrafo no corpo do commit.
As suítes completas (API + frontend + E2E) rodam ao final da fila inteira,
antes do registro de fecho — e qualquer vermelho delas é achado, não ruído.
