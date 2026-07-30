# Revisão do branch `rodada-6/execucao` — o que ela achou e em que ordem consertar

**2026-07-28**, base `faa30c9`. Revisão de código do branch inteiro contra `main`
(91 commits, ~14 mil linhas de código de app) mais o commit de ponta `4bc5a0b`.

Treze achados. **Quatro eu confirmei por leitura**, com a linha citada; os outros
nove vêm do relatório e **entram como suspeita com âncora, não como fato** — a
primeira ação de cada épico é mapear, que é o que a rodada inteira ensinou (o
backlog errou cinco vezes documentadas, e a fase A deste fechamento errou uma
sexta, medida no E104 parte 3).

---

## O que eu confirmei, e um deles é meu

### 1. 🔴 A cobrança de avaria colide com a ENTRADA do contrato

`artifacts/api-server/src/routes/reservas.ts:576` insere a parcela do reparo com
`numero: 0` fixo, e o comentário ao lado diz *"Fora da numeração do carnê: é
cobrança extra, não parcela do plano"*. **Mas o 0 não é "fora da numeração" — é a
ENTRADA**, e está escrito no motor:

```
lib/financeiro-core/src/plano.ts:27   /** Uma linha do carnê. `numero` 0 é a entrada. */
lib/financeiro-core/src/plano.ts:91         numero: 0,
```

E `parcelas` tem `unique().on(contratoId, numero)` (`lib/db/src/schema/financeiro.ts:39`),
cujo próprio comentário já anuncia o choque: *"o segundo insert do número 0
colide e vira 409"*.

São **dois defeitos numa linha**, e eles se excluem:

- **Contrato COM entrada** (R$ 1.000,00 de entrada + reparo de R$ 350,00) →
  `23505` dentro da transação → a cobrança nunca acontece. Vale também para a
  **segunda avaria de qualquer contrato**.
- **Contrato SEM plano ainda** → a avaria ocupa o slot 0, e o `gerar-plano`
  daquele contrato passa a devolver 409 `JA_TEM_PLANO` **para sempre**. Quem
  vender e só depois montar o carnê perde o carnê.

A rota irmã do mesmo épico faz certo: `contratos.ts:874` usa `max(numero) + 1`.

**Por que o E2E não pega:** `e2e/48-avaria-vira-parcela` passa porque o contrato
que ele usa não tem entrada nem plano — cai exatamente no ramo que "funciona" e
envenena o contrato em silêncio.

### 2. 🟠 O E104 parte 3 quebrou o Canvas — e é o ativo que a decisão do A6 existia para preservar

Meu commit `4bc5a0b`. A nota que eu escrevi diz, com todas as letras, *"o
`[[services]]` do Canvas continua no `.replit-artifact/artifact.toml`, e é o
único ativo que o pacote ainda tem"*. Ele não continua:

```
artifacts/mockup-sandbox/.replit-artifact/artifact.toml:17
  run = "pnpm --filter @workspace/mockup-sandbox run dev"

$ pnpm --filter @workspace/mockup-sandbox run dev
  No projects matched the filters in "/home/runner/workspace"
```

Tirar do workspace **é** tirar do alcance do `--filter`. E num clone novo o
pacote também não recebe `pnpm install`, então nem o `npm run dev` dentro da
pasta sobe. **A decisão do dono foi "tirar do workspace, não podar, porque
preserva o único ativo que resta" — e a implementação destruiu justamente esse
ativo.**

E o `artifact.toml` fecha o círculo do que o E104 parte 3 já tinha derrubado:
ele define `PORT = "8081"` e `BASE_PATH = "/__mockup"` no `[services.env]`. As
variáveis nunca faltaram para quem roda o preview — a fase A leu o `throw` e
concluiu defeito onde havia contrato.

**Três saídas, com o custo de cada uma:**

| | O que faz | Custo |
|---|---|---|
| (a) reverter o A6 | volta tudo | perde os 971 do lock e o typecheck volta a 4 projetos |
| (b) trocar o `run` do `artifact.toml` | `cd artifacts/mockup-sandbox && npm run dev` | **não resolve**: sem `pnpm install`, num clone novo não há `node_modules` |
| (c) **manter no workspace e excluir do typecheck** | `--filter "!@workspace/mockup-sandbox"` no script | preserva o Canvas e o `Scope: 3`; **devolve** as 971 linhas do lock e os 9,3 MB |

**Recomendo (c)**, e digo o que ela não entrega: o ganho de disco e de lock era
real e some. O que sobra — o typecheck de 4 → 3 projetos — era o único ganho que
alguém sente ao trabalhar. Se o dono disser que ninguém abre o preview há um mês,
a resposta certa deixa de ser (c) e passa a ser o `rm -rf` que a nota já previu.

### 3. 🟡 A conciliação tem um beco sem saída

`artifacts/moscow-noivas/src/pages/financeiro/conciliacao.tsx:356` — o card é
gateado por `soSistemaVisivel.length > 0`, e **o checkbox que desliga o filtro
mora dentro do card**. Marcadas as 4 divergências como conferidas, o resumo
continua dizendo "No sistema, mas não no banco: 4" e o card some junto com o
único jeito de desmarcá-las. Estado irrecuperável pela tela.

É a parte 3 do E103 se mordendo: o filtro que "esconde o que já foi perdoado"
esconde também a própria chave. O guard tem de ser `conciliacao.soSistema.length > 0`.

### 4. 🟡 Todo 500 agora mostra jargão — e foi o E107 que ligou isso

`artifacts/moscow-noivas/src/lib/erro-api.ts:62` põe a regra do `detalhe` **antes**
da faixa de status:

```ts
if (codigo && mensagens[codigo]) return mensagens[codigo];
if (e?.data?.detalhe) return e.data.detalhe;   // ← ganha do 500
...
if (err.status >= 500) return SEM_RESPOSTA;
```

E o E107 (`4623ec1`) passou a mandar `detalhe: "Erro interno do servidor"` junto
do `ERRO_INTERNO` (`api-server/src/lib/erros.ts:167` e `:224`). Resultado: a
vendedora lê **"Erro interno do servidor"** em vez de *"Não consegui falar com o
sistema. Tente de novo em um instante."* — o jargão que este módulo inteiro existe
para eliminar. O E96 e o E107 estão certos cada um por si; o encontro dos dois é
que regrediu.

---

## Os nove que vêm do relatório — suspeita com âncora

Nenhum destes eu li. Cada um traz a linha e o mecanismo alegado; **mapear é a
primeira ação do épico**, e a correção ao diagnóstico é o que vale mais que o
diff.

| # | Onde | O que alega | Peso alegado |
|---|---|---|---|
| 5 | `routes/comissao.ts:276` | o laço que desconta `estornoAbsorvido` roda sobre TODOS os fechamentos da vendedora, sem competência e sem checar se o estorno já foi quitado: fev absorve 8.000 de 20.000, mar absorve os 12.000 e carimba, e a linha de fev **segue parcial para sempre**, abatendo 8.000 de qualquer estorno futuro. Vendedora paga a mais | 🔴 dinheiro |
| 6 | `routes/contratos.ts:465` | `parcelasAntes` passou a ser lido FORA da transação, e o estorno roda por `inArray(id, …)` em vez do predicado dentro do UPDATE. Um `receber` que commite no meio deixa o contrato CANCELADO com dinheiro PAGO no caixa que a loja acredita ter estornado, e a trilha grava `totalEstornado: 0` | 🟠 dinheiro |
| 7 | `routes/financeiro.ts:1394` + `contratos.ts:789` | o estorno limpa `conciliadoEm` mas **não** `enviadoContabilidadeEm`, que é filtrado por `isNull`. Parcela recebida em 10/06, junho fechado, estornada em 05/07 e recebida de novo em 06/07 **não vai em nenhum dos dois pacotes** da contadora | 🟠 dinheiro |
| 8 | `routes/reservas.ts:561` | `contratoAtivoDaLoja` valida id + loja + ATIVO e nada amarra o `contratoId` do corpo à avaria: o reparo do vestido da noiva A pode ser cobrado no carnê da noiva B. Todas as outras rotas do branch fazem essa prova (`leadNaLoja`, `usuarioNaLoja`) | 🟠 |
| 9 | `routes/comissao.ts:389` | `new Date(vigenciaInicio − 3h).getUTCDate()` trata data de negócio como instante: `2026-08-01` volta para 31/07 21:00Z e o 422 diz "Use o primeiro dia de 2026-07" — **obedecer também é recusado**. Só passa hoje porque os testes ancoram ao meio-dia. É a classe do C6 | 🟠 |
| 10 | `pages/financeiro/receber.tsx:149` | com o filtro "Atrasadas" a query perde a janela, mas os três cards de resumo (linhas 254-256) continuam saindo de `naJanela`: "Recebido" desaba para ~R$ 0,00 com os campos De/Até ainda mostrando julho. O href do CSV (`:217`) idem | 🟠 |
| 11 | `pages/mensagens/index.tsx:169` | `enviadas.current.add(leadId)` acontece **antes** da mutation e não há `onError`: falhou o POST, nenhum toast, e todo clique seguinte para aquela noiva sai pelo `return` | 🟡 |
| 12 | `routes/financeiro.ts:560` | `POST /conciliacao/marcar` muta linhas mas `acaoDoRequest` só vira `editar` em `/cancelar\|/estornar` (`lib/permissoes.ts:96`): quem tem `criar` e `editar:false` carimba o mês. E o WHERE não exige `recebidoEm IS NOT NULL` — parcela PREVISTA pode ser "conferida com o extrato" | 🟡 |
| 13 | `routes/admin.ts:372` | o guard de histórico cobre quatro tabelas e há **cinco** FKs `restrict` para `usuarios`; `comissao_regras.vendedoraId` ficou de fora. Vendedora com escada e nenhuma venda → 23503 → 500 cru, que é o que o guard existia para substituir | 🟡 |

---

## O plano, em cinco épicos mais um conserto

### Antes de tudo: **E104 parte 4** — desfazer o que eu quebrei

Uma linha, e ela é minha. Aplicar a saída (c), rodar o `pnpm --filter … run dev`
como prova literal, e **corrigir de novo os três textos** — porque a nota do E104
parte 3 afirma um ativo preservado que não estava. Não espera nenhum épico.

### E110 — A cobrança de avaria para de colidir com a entrada (achados 1 e 8)

Os dois moram na mesma rota e no mesmo insert. O 1 é `max(numero)+1` como a rota
irmã; o 8 é amarrar `avarias.bloqueioId → bloqueio_vestidos.leadId` ao
`contratos.leadId`.

**O cuidado que decide o épico:** existem contratos com o slot 0 já ocupado por
uma avaria? Se existirem, consertar a rota **não** desfaz o `gerar-plano` travado
em 409 — é migração, não conserto de código, e a régua do E97 vale (não adivinhar
o que não dá para saber). Medir antes de escrever.

**Régua:** o E2E completo, porque o `48-avaria-vira-parcela` passa hoje pelo ramo
errado e precisa passar a cobrir o contrato COM entrada.

### E111 — O estorno de comissão não paga duas vezes (achados 5 e 9)

O 5 é 🔴 alegado e é dinheiro que sai a mais; o 9 recusa uma data válida. Os dois
são do motor de comissão e o 5 encosta na decisão de produto de 2026-07-25
("absorver proporcionalmente"), que é justamente o que o laço implementa — então
a primeira ação é **conferir o achado contra a decisão**, não contra o código.

**Sem exemplo numérico não há achado de dinheiro** (regra 1): o épico começa
reproduzindo os 8.000 de fevereiro num teste.

### E112 — O estorno desfaz tudo o que precisa desfazer (achados 6 e 7)

Os dois são a mesma tese por ângulos diferentes: **o que o estorno esquece de
limpar**. O 7 é o irmão exato do que o E103 parte 2 já consertou para o
`conciliadoEm` — e o schema (`financeiro.ts:32`) diz que **não limpar é
intencional** no lado de `pagamentos`. Se a intenção também vale para `parcelas`,
o achado 7 morre e vira teste que congela a decisão; se não vale, é dinheiro fora
dos dois pacotes. **Ler o comentário antes de escrever código.**

### E113 — A tela não mente sobre o que mostra (achados 3, 4, 10, 11)

Os quatro são de front e nenhum precisa de migração. O 3 e o 4 já estão
confirmados; o 10 e o 11 precisam de leitura. É o épico mais barato dos cinco e o
que mais aparece para quem usa.

### E114 — A permissão diz o que a rota faz, até o último guard (achados 12 e 13)

É a tese do E101 aplicada ao que nasceu depois dele, mais o quinto FK que o E106
não contou. Os dois são de guarda e os dois viram 409/403 legível.

---

## A ordem, e por quê

```
E104 p4  →  E110  →  E111  →  E112  →  E113  →  E114
```

- **E104 parte 4 primeiro** porque é regressão desta sessão, é uma linha, e
  porque deixar um texto meu afirmando um ativo que não existe é exatamente o que
  a regra 1 proíbe.
- **E110 antes dos de dinheiro** porque é o único 🔴 que eu **confirmei**, e
  porque ele tem um modo de falha que se agrava sozinho: cada avaria cobrada num
  contrato sem plano trava o carnê daquele contrato para sempre.
- **E111 e E112 antes das telas** pela régua de sempre — dinheiro antes de pixel.
- **E113 por último dos de dor** porque é o mais barato e não bloqueia nada.
- **E114 no fim** porque nenhum dos dois é explorável por quem não já tem acesso à
  loja.

**E os três primeiros mexem no que a trilha grava.** A regra 11 manda o E2E
completo em cada um deles, e não em bloco no fim.

---

## O que este plano NÃO faz, e o que ele empurra

- **Não fecha o E104.** O S15 (precisa de rede), o S18 e os três flakes continuam
  onde estavam.
- **Não toca o E108 nem o E109**, que a ordem revista do fechamento punha antes
  do E104 e que seguem inteiros. **Cinco épicos novos entram na frente deles**, e
  isso é uma escolha: achado confirmado de dinheiro passa na frente de
  consolidação de régua.
- **O achado 5 pode ser o backlog errando pela sexta vez.** Se a absorção parcial
  for a decisão de 2026-07-25 funcionando como escrito, o E111 encolhe para o
  achado 9 sozinho — e essa correção vale mais que o conserto.
