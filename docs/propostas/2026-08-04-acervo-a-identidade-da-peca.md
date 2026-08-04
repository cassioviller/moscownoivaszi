# O acervo ganha a identidade que o papel já tem

**Spec de execução · 2026-08-04** (4ª versão — o bloco fechou, e duas respostas abrem o próximo)
branch `rodada-7-sobras`
Diagnóstico: `docs/revisao/2026-08-04-arqueologia-legado/` (trilhas A e B,
adversarial, 29 fotos do sistema em papel)

> **1ª versão:** o acervo ainda não entrou no sistema, então a forma do
> cadastro custa mais caro que a régua de ocupação.
> **2ª versão:** "acessório" são **três** coisas com mecanismos diferentes —
> E154 e E155 entram.
> **3ª versão (esta):** a dona respondeu as três perguntas.
> **P1** ("uma semana, lavagem externa") confirma a régua e **inverte o A1**:
> o E152 troca de escopo — de consertar o número para dar à lavagem uma data
> real, que é a única etapa do ciclo sem ela.
> **P2** ("dois vestidos") **cancela o E153**, o único épico irreversível e o
> mais caro. **P3** deixou de importar.
> **Sobraram 7 épicos e nenhum bloqueio.**
> **4ª versão (esta):** os sete foram executados e commitados. A dona respondeu
> mais duas perguntas, e cada uma abre um épico: **P4** ("vira") diz que a peça
> confeccionada VIRA item do acervo depois do casamento — a transição
> produção → acervo que o E155 registrou sem modelar; **P5** ("é valor") tira a
> ambiguidade do `7.600` e **destrava o A4**, o preço de realuguel.
> **Entram E156 e E157.**

## Por que agora, e não depois

O `replit.md` diz, sobre o seed do E147:

> **Ele não cadastra noiva, vestido, contrato nem parcela** — isso é trabalho
> da loja, e entra pela tela. (…) o único primeiro passo pendente é
> "cadastrar os primeiros vestidos".

**O acervo ainda não entrou.** As 29 fotos não são o legado de um sistema em
uso — são o que ainda vai ser digitado. Isso define a ordem desta spec:

| | Custo se estiver errado |
|---|---|
| **Forma do cadastro** (identidade da peça, cor, acessório) | recadastrar o acervo à mão, item por item |
| **Régua de ocupação** (a lavagem do A1) | um `UPDATE` de uma linha |

O 🔴 do diagnóstico era o segundo. Ele desceu para 🟠 quando a apuração mostrou
que tinha **um** exemplo e não três, e **P1 acabou de mostrar que a régua está
certa** — o que sobrou dele é outra coisa, e está no E152.

**Com P2 respondida ("dois vestidos"), o cadastro do acervo não espera mais
nada** e pode correr em paralelo a esta execução.

---

# A tese dos três acessórios

O caderno trata como "segunda peça" coisas que não têm nada em comum. O que as
distingue não é o que são — é **como se decide se estão disponíveis**:

| | Exemplo no caderno | Como se decide a disponibilidade | Onde mora |
|---|---|---|---|
| **Tipo 1 · peça única** | `Bolero Ricca Sposa`, `Bolero 2026`, `Mantilha Chan`, `Manga Buyanta` | **por peça** — existe uma, e ou está livre naquele fim de semana ou não | `vestidos` (acervo), com código e reserva |
| **Tipo 2 · estoque** | `Saiote 2 aros`, `crinol` | **por contagem** — existem dez, e o que importa é quantas estão comprometidas | tabela nova `itens_estoque` |
| **Tipo 3 · sob medida** | `Siam + Manga **será confeccionada**` | **por prazo** — não existe ainda, precisa ficar pronta antes da prova | a fila da costureira, que já existe |

Três naturezas, três mecanismos. Forçar as três no acervo tem um custo
concreto: a lista de vestidos, que a vendedora usa com a noiva na cabine, ficaria
cheia de anágua.

**Nota de leitura:** a classificação acima é minha, a partir dos nomes no
caderno. `NSA` (31/08–06/09, item 13 — *"Lilya + NSA"*) e `uma Pérola`
(10–16/08, item 1) eu não consegui decifrar; podem ser tipo 1 ou tipo 2.

---

## As três perguntas — RESPONDIDAS pela dona em 2026-08-04

### P1 — "Uma semana, lavagem externa." ✅

**`lavagemDiasDepois: 7` está certo, e a régua do sistema não tem defeito.**
Isso **inverte o A1**: a colisão que o diagnóstico apontou é o sistema
funcionando — a peça está mesmo na lavanderia, fora da loja, indisponível.

E torna o caso *Adelita* (07–13/09 "1º Aluguel" → 14–20/09 "Realuguel") uma
**exceção real do negócio**, não um defeito de software. Com lavagem externa de
7 dias, nenhuma conta fecha:

```
uso 1  (D=12/09):  09/09 ─ 14/09
lavagem externa:        15/09 ──────── 21/09   (volta dia 22)
uso 2  (D=19/09):            16/09 ─ 21/09     ← a peça está na lavanderia
```

Só há três explicações, e todas apontam para a mesma falta: **a peça não foi
lavada entre as duas**, ou **a lavanderia adiantou**, ou **a dona decidiu que
podia sair assim**. Em nenhuma delas o sistema deixa ela seguir — e é isso que
o E152 passa a resolver, com escopo completamente diferente do que esta spec
propunha na 1ª versão.

### P2 — "Dois vestidos." ✅

`Arnalda P` e `Arnalda G` são **peças diferentes**, não um modelo em dois
tamanhos. **O Caminho A morre e o E153 é cancelado** — `vestidos` continua
plano, cada linha é uma peça única, e o cadastro do acervo pode começar sem
esperar nada.

Esta é a resposta que mais economiza: o E153 era o único épico irreversível,
o único com prazo, e o mais caro dos oito.

### P3 — "Não sei." ⚪

**Deixou de importar.** P2 já respondeu o que P3 existia para descobrir: se
cada peça é única, não há "várias unidades do mesmo modelo" a modelar. A
pergunta some junto com o E153.

### O dimensionamento que segue aberto (não bloqueia nada)

Dos acessórios do ateliê, **quantos são tipo 1 e quantos tipo 2?** Contei entre
**10 e 13 nomes distintos** nas 14 semanas — uma tarde de digitação. A
proporção só muda quanto vale investir no E154, não se ele existe.

---

# Bloco 1 — não depende de resposta nenhuma

## E148 — a régua que a tela mostra é a régua que o sistema usa

**Fecha:** B1 🟠 · **Tamanho:** uma linha

`artifacts/moscow-noivas/src/pages/configuracoes/index.tsx:184` escreve
`{disponibilidade.provaDuracao} min`. O valor está em **slots de 30 minutos**
(`artifacts/api-server/src/routes/agenda.ts:93` —
`Math.max(1, regra?.provaDuracao ?? 1) * 30 * 60_000`; confirmado no consumidor
da grade, `pages/agenda/grade.tsx:171`). Com o default `provaDuracao: 2`,
**toda loja nova exibe "Duração da prova — 2 min" para uma prova de 60**.

```tsx
<span className="font-medium">{disponibilidade.provaDuracao * 30} min</span>
```

**Verificação:** a linha lê `60 min` com a régua padrão e `90 min` com
`provaDuracao: 3` (o valor de `e115-portal-agenda-api.test.ts:92`).

**Sobra:** S-A7 — o campo não diz a unidade no nome. Renomear toca OpenAPI,
codegen e 4 testes; fica fora.

## E149 — cor e categoria saem do texto livre e entram no catálogo

**Fecha:** A3 🟠 · **É a base do E150 e do E154**

Hoje `cor` e `categoria` são `text` livre (`lib/db/src/schema/vestidos.ts:46-47`),
preenchidas por digitação (`pages/vestidos/vestido-form.tsx:186-191` e `:204`
— `<Input placeholder="Branco" />`), e o filtro compara com igualdade estrita
(`pages/vestidos/index.tsx:262-263`) sobre opções derivadas dos valores brutos
(`:244-253`). "Verde", "verde" e "VERDE" viram três entradas no dropdown.

O mecanismo certo já existe: `atributosTable` / `atributoOpcoesTable`
(`vestidos.ts:14-36`), que o seed do E147 popula com **7 atributos** — Silhueta,
Decote, Manga, Tecido, Cauda, Volume da saia, Brilho
(`configuracao-inicial.ts:166-196`). **Cor ficou de fora**, e é o eixo pelo qual
a segunda linha de negócio é buscada: **38 compromissos de festa/dama em 15
páginas de agenda**, em 15 cores distintas.

**Conserto:**

1. O seed ganha **Cor** (as 15 do papel + branco, off-white, nude) e
   **Categoria** (Noiva, Festa, Dama, Madrinha, Debutante, **Acessório**),
   idempotentes como os outros sete.
2. `vestidos.cor` e `vestidos.categoria` viram **legado lido, nunca escrito** —
   o tratamento que `contratos.bloqueio_vestido_id` recebeu no E72
   (`contratos.ts:89-95`).
3. `vestido-form.tsx` troca os dois `<Input>` por `<Select>` do catálogo.
4. `pages/vestidos/index.tsx` deixa de derivar as opções dos valores brutos
   (`:250-252`) e passa a lê-las do catálogo.

**Migração** (`docs/migracoes/2026-08-04-e149-cor-categoria.sql`): normaliza
(minúsculas, sem acento) e casa com a opção; o que não casar **vira opção
nova**, com o valor original preservado. O script imprime o que casou e o que
criou — nada se perde em silêncio.

## E150 — o acessório de peça única entra no acervo, e o contrato exige reserva

**Fecha:** A2 🟠 · **Tipo 1**

O caderno numera a peça componente **como item do acervo, com ordem própria**.
A prova está em 13–19/07, onde a mesma noiva ocupa duas linhas:

```
Gabriela  1) Dayfini + [apagado]
Gabriela  5) Manga renda c/ saia lisa   (Mesma noiva Dayfini)
```

Quem escreveu anotou entre parênteses *por que* o nome se repete. São 11
composições em 14 semanas, e `Bolero Ricca Sposa` aparece em **duas semanas
distintas com noivas diferentes** — é peça que circula, não adjetivo.

No sistema, `orcamento_item_tipo` é `["VESTIDO", "SERVICO", "AJUSTE"]`
(`lib/db/src/schema/common/enums.ts:73-77`); o schema declara a descrição em
texto como registro autoritativo (`contratos.ts:66-69`); a lista de peças presas
vem do corpo da requisição, não dos itens (`routes/contratos.ts:296-303`); e
nada valida que um item com `vestidoId` tenha bloqueio (`:468-481`).

**Conserto:**

1. `orcamento_item_tipo` ganha **`ACESSORIO`**. A peça é cadastrada como
   `vestido` de categoria "Acessório" (a categoria vem do E149) — mesma tabela,
   mesmo código, mesma reserva, porque **a natureza é a mesma: existe uma só**.
2. O fechamento recusa item de tipo `VESTIDO` ou `ACESSORIO` com `vestidoId`
   não nulo que não esteja entre os `bloqueioIds`:

```json
{
  "error": "ITEM_SEM_RESERVA",
  "detalhe": "O contrato vende uma peça que não está reservada — ela pode sair para outra noiva no mesmo fim de semana.",
  "campos": [{ "campo": "itens", "motivo": "«Bolero Ricca Sposa» não tem reserva neste contrato" }]
}
```

3. `/vestidos` ganha o filtro de categoria do E149 já aplicado, para que a
   vendedora na cabine veja **vestidos** por padrão e acessórios quando pedir.

**Por que não quebra o fluxo de hoje:** a tela já manda **todas** as reservas
da noiva não desmarcadas (`pages/orcamentos/[id].tsx:638-641`). Quem passa a
ser recusado é o contrato que vende peça sem reservar — o defeito.

**Regra 11:** muda o que o fechamento grava. **E2E completo antes do commit.**

## E154 — o acessório de estoque é contado, não reservado

**Fecha:** o tipo 2 · **novo nesta versão**

Saiote, crinol, anágua. A loja tem dez iguais; reservar "o saiote nº 7" não
significa nada, porque ninguém vai atrás daquele. Cadastrá-los um a um encheria
o acervo de peça que ninguém procura — e é a mesma lista que a vendedora abre
com a noiva na cabine.

```sql
CREATE TABLE itens_estoque (
  id          text PRIMARY KEY,
  loja_id     text NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  nome        text NOT NULL,                 -- "Saiote 2 aros"
  tamanho     text,                          -- quando faz diferença
  quantidade  integer NOT NULL,              -- quantas a loja tem
  preco       numeric(10,2),                 -- nulo = vai junto, sem cobrar
  ativo       boolean NOT NULL DEFAULT true,
  UNIQUE (loja_id, nome, tamanho)
);
```

`orcamento_item_tipo` ganha **`ESTOQUE`**, e `orcamento_itens` / `contrato_itens`
ganham `item_estoque_id` (nullable, `set null` — a mesma referência frouxa que
`vestidoId` já tem).

**A decisão de projeto que importa: avisa, não bloqueia.**

Para uma data, o sistema soma as quantidades comprometidas por contratos ATIVOS
cuja janela de uso cobre o dia, e compara com `quantidade`. Se passar, **avisa
na tela** ("3 saiotes 2 aros comprometidos para 19/09, a loja tem 2") e deixa
fechar.

Bloquear seria pior que o problema: saiote é substituível — se faltar um, usa-se
outro parecido, e recusar uma venda de R$ 4.000 por causa de uma anágua é um
defeito, não uma proteção. O bolero com nome, que a noiva escolheu pela foto,
não é substituível — e por isso ele é tipo 1 e **bloqueia**.

**Fora do escopo:** compra/reposição de estoque, e histórico de quantidade.
`quantidade` é um número que a dona edita.

## E155 — a peça sob medida entra na fila da costureira, que já existe

**Fecha:** o tipo 3 (S-A4 / S-A6) · **novo nesta versão**

No caderno de 10–16/08: `Siam + Manga **será confeccionada** + Mantilha`. E na
agenda, **dois compromissos de 10:30 marcados só para isso** — 21/07 e 24/07,
*"conversar sobre confecção de manga"*. Não é ajuste de peça existente: é peça
nova, feita para aquela noiva.

**E o sistema já tem quase tudo.** `ajustesTable`
(`lib/db/src/schema/atendimentos.ts:122-130`) é *"a fila da costureira (E14)"*,
com `descricao`, `status` (`PENDENTE`/`FEITO`), checklist
(`ajuste_checklist_itens`, `:136-142`) e uma tela que ordena **pelo prazo mais
apertado** — *"a próxima prova é o prazo"*
(`pages/ajustes/index.tsx:25,148`; régua em `lib/ajustes-da-semana`).

E nasce do mesmo lugar: `ajustes.atendimentoId` é obrigatório, e a confecção
nasce de um atendimento — exatamente os dois compromissos de 21/07 e 24/07.

**Conserto, pequeno:**

1. `ajustes` ganha `tipo` (`AJUSTE` | `CONFECCAO`, default `AJUSTE`) e
   `custo` (nullable — material e mão de obra, que ajuste comum não tem).
2. A fila da costureira mostra os dois tipos, distinguindo-os; o prazo já é
   calculado igual (próxima prova, senão casamento).
3. O item do orçamento tipo `AJUSTE` — que já existe — passa a poder apontar
   a confecção, para que o que foi cobrado e o que a costureira faz sejam a
   mesma coisa.

**Por que não é tabela nova:** prazo, status, checklist e a tela já existem e
já ordenam pelo aperto. Uma tabela `producoes` duplicaria a fila da costureira
e criaria uma segunda tela para a mesma pessoa.

**Pergunta registrada, não respondida:** depois do casamento, a manga
confeccionada **vira peça do acervo**? Se virar, há uma transição
produção → acervo que esta spec não modela. Não inventei a resposta.

## E151 — a ausência da vendedora existe, e a agenda a respeita

**Fecha:** A5 🟡

`grep -rniE "ferias|ausencia|indisponibilidade|folga"` em `artifacts/` e `lib/`
não devolve **nenhuma ocorrência de domínio**. A agenda tem cabine
(`loja.ts:45`) e `atendimentos.vendedoraId` (`atendimentos.ts:70`), e nada que
torne uma pessoa indisponível num intervalo.

No papel a ausência é a **primeira coisa que a página declara**, e mora no
caderno que conta as peças que saem: **7 das 14 páginas**, todas entre 22/06 e
16/08. Nas semanas de férias a agenda esvazia — 09 e 10/07 riscados com um X
que atravessa as duas colunas; 18, 19, 22, 23 e 24 de agosto sem um único
compromisso.

```sql
CREATE TABLE ausencias (
  id          text PRIMARY KEY,
  loja_id     text NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  usuario_id  text NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  inicio      date NOT NULL,
  fim         date NOT NULL,
  motivo      text,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ausencias_loja_periodo_idx ON ausencias (loja_id, inicio, fim);
```

O agendamento recusa `vendedoraId` com ausência cobrindo o dia, na camada que
já recusa dia fora do expediente (`lib/agenda-core/src/slots.ts:77`), com
`VENDEDORA_AUSENTE` + detalhe nomeando pessoa e período.

**Fora do escopo:** ausência não cancela nem remarca o que já está agendado —
só impede o novo. Remarcação em lote é decisão de produto e não foi pedida.

---

# Bloco 2 — destravado pelas respostas

## E152 — a lavagem tem fim REAL, não só previsto

**Fecha:** A1 (o que sobrou dele) · **destravado por P1** · **escopo trocado**

A 1ª versão desta spec propunha *consertar a régua*. **P1 disse que a régua
está certa**: uma semana, lavanderia externa. Então o defeito não é o número —
é que **a lavagem é a única etapa do ciclo sem data real**.

A assimetria está no schema, e é gritante quando se olha de perto. O uso tem
duas datas reais que encurtam a janela quando a realidade diverge do previsto:

| Etapa | Data prevista | Data real | Quem a usa |
|---|---|---|---|
| retirada | `casamentoData − usoDiasAntes` | **`retiradaDataReal`** ✅ | `disponibilidade.ts:158` |
| devolução | `casamentoData + usoDiasDepois` | **`devolucaoDataReal`** ✅ | `:235` |
| lavagem | `[fimUso+1, fimUso+7]` | **nenhuma** ❌ | `:244-251` |

`janelasDoBloqueio` calcula a lavagem sempre por soma
(`artifacts/api-server/src/lib/disponibilidade.ts:244-251`):

```ts
if (regra.lavagemDiasDepois > 0) {
  janelas.push({
    inicio: addDias(fimUso, 1),
    fim: addDias(fimUso, regra.lavagemDiasDepois),
```

**A peça volta da lavanderia e continua ocupada até o sétimo dia**, mesmo
pendurada na arara. Ninguém tem como dizer ao sistema que ela chegou.

**Conserto — simétrico ao que já existe:**

```sql
ALTER TABLE bloqueio_vestidos ADD COLUMN lavagem_concluida_em timestamptz;
```

Em `janelasDoBloqueio`, a janela de LAVAGEM termina em `lavagemConcluidaEm`
quando ela existe, exatamente como `devolucaoDataReal` já encurta o USO. E
como colapsar janela **só reduz ocupação, nunca cria conflito** — a razão que
o próprio código dá para o caso da prova (`routes/agenda.ts:371-377`) —, não
há revalidação a fazer.

Na tela da reserva (`pages/reservas/[bloqueioId].tsx`), um campo ao lado de
retirada e devolução: **"voltou da lavanderia em"**.

**O que isto resolve, em português:** a dona sabe que a peça voltou na
quarta-feira; hoje ela fica presa até domingo. E o caso *Adelita* do papel —
uma peça alugada de novo em 7 dias — passa a ser **registrável**: a dona marca
que a lavagem terminou (ou que não houve), e a segunda locação entra. Hoje o
sistema recusa e não oferece caminho nenhum.

**O que isto NÃO é:** um jeito de furar a régua. A janela só encurta com
alguém afirmando um fato — a peça voltou —, e fica gravado quem afirmou e
quando, como toda data real do bloqueio.

**Sobra registrada:** a evidência que ameaçava o A1 continua sem resposta —
`CHLOE → se sabe que tá 15 dias` (21–27/09, item 10). Com P1 respondida
("uma semana"), a leitura mais provável é que os 15 dias sejam **férias de
funcionária** (o mesmo caderno usa a expressão em *"Volta da Marilza 15
dias"*, e há um "ISA" — nome de vendedora — rabiscado ao lado), não prazo de
locação. Fica como leitura provável, não como fato.

## ~~E153 — modelo e peça~~ · **CANCELADO por P2**

**P2 respondeu "dois vestidos".** `Arnalda P` e `Arnalda G` são peças
diferentes, não um modelo em dois tamanhos. Não há hierarquia modelo → peça a
construir: `vestidos` continua plano e cada linha é uma peça única.

**Era o único épico irreversível, o único com prazo e o mais caro dos oito.**
Uma pergunta o eliminou.

O que sobrevive dele é o **Caminho B**, que não depende de estrutura nenhuma:
dar à peça o **contador de locações** e o **preço de realuguel** (A4). O papel
registra a contagem 7 vezes em 14 semanas — `1º Aluguel` (YOKO, Adelita,
Andreia), `2º Aluguel` (Nixia), `2º` (BLARY), `Realuguel` (Fencyella, Adelita)
—, e a contagem **já é calculável** hoje (`routes/vestidos.ts:268-315` conta
provas, reservas, contratos e receita por peça). Falta a régua de preço que a
lê, e ela ainda depende de uma resposta: **o `7.600` ao lado de "Realuguel" é
valor ou código de peça?** Enquanto isso não se souber, A4 não vira épico.

*(O texto integral do Caminho A, com o DDL de `modelos` e a estratégia de
migração, está no commit `a59fdf7` — preservado no histórico para o caso de o
acervo revelar peças duplicadas de verdade.)*

## Ordem de execução

Com P1, P2 e P3 respondidas, **não sobrou bloqueio nenhum**. São 7 épicos, em
sequência, sem nada esperando decisão:

```
1. E148  ── 1 linha, risco zero. Aquece a esteira.
2. E149  ── catálogo de cor e categoria. BASE dos dois seguintes.
      ├─ 3. E150  tipo 1: peça única entra no acervo   ·· E2E completo
      └─ 4. E154  tipo 2: estoque, avisa sem bloquear  ·· E2E completo
5. E155  ── tipo 3: confecção na fila da costureira    ·· E2E completo
6. E151  ── ausência da vendedora
7. E152  ── a lavagem ganha data real                  ·· E2E completo
```

**Por que sequencial e não paralelo:** os épicos compartilham **um banco de
dev** (`DATABASE_URL`) e **uma suíte E2E** cuja loja é eleita no
`global-setup` (S-D27, e a regra 16 do método existe justamente porque dado
compartilhado mordeu antes). Dois agentes rodando `test:e2e` ao mesmo tempo
disputam as mesmas 147 specs, as mesmas cabines e o mesmo expediente. Worktree
isolado resolveria o git; não resolveria o banco.

Além disso, **E149 é dependência dura de E150 e E154** (a categoria
"Acessório" e as cores vêm do catálogo que ele cria), e o método exige um
commit por épico com a suíte lida inteira entre eles (regras 10, 11 e 14).

**E153 foi cancelado por P2** — era o único irreversível, o único com prazo, e
o mais caro. Com "dois vestidos" como resposta, o cadastro do acervo pode
começar a qualquer momento, em paralelo à execução destes sete.

## O que esta spec deliberadamente não faz

- **Não importa o papel.** As 29 fotos cobrem 14 semanas e faltam o verso da
  última página e as semanas de 28/09 a 11/10 (S-A2). A forma do cadastro é o
  objetivo, não o histórico.
- **Não mexe no expediente** (B2 domingo, B4 provas às 18:30). São defaults
  configuráveis e ninguém perguntou qual é o expediente real. Fica na S-A8,
  junto da auditoria das premissas categóricas escritas em comentário — a que
  diz "domingo fechado, **como todo ateliê de noiva**"
  (`configuracao-inicial.ts:125`) é contrariada 7 vezes pelo próprio ateliê.
- **Não trata compra/reposição de estoque** (E154) nem a transição
  produção → acervo (E155).

## Como se verifica que funcionou

| Épico | A prova |
|---|---|
| E148 | Configurações lê `60 min` na régua padrão, `90 min` com `provaDuracao: 3` |
| E149 | Não é possível cadastrar "Verde" e "verde"; o dropdown tem as opções do catálogo, não as grafias do banco |
| E150 | `POST /contratos` com item apontando `vestidoId` fora de `bloqueioVestidoIds` responde `422 ITEM_SEM_RESERVA`; o contrato montado pela tela continua fechando |
| E154 | Comprometer 3 saiotes num dia em que a loja tem 2 **avisa e deixa fechar**; a lista de vestidos não mostra saiote |
| E155 | Uma confecção aparece na fila da costureira ordenada pelo prazo, ao lado dos ajustes, e distinguível deles |
| E151 | Agendar prova com vendedora ausente responde `VENDEDORA_AUSENTE` nomeando pessoa e período |
| E152 | Marcar "voltou da lavanderia" numa reserva libera a peça a partir daquele dia; sem a marca, a janela segue os 7 dias da régua |
| ~~E153~~ | **cancelado por P2** |

Cada épico fecha com **um commit de código** e o `docs(...)` que registra o hash
no rastreador. Os que mudam o que a trilha grava ou o formato que uma tela lê —
**E150, E154, E155 e E152** — rodam o **E2E completo** antes do commit (regra 11).

---

# 4ª versão — o bloco fechou, e duas respostas abrem o próximo

Os sete épicos da 3ª versão estão executados e commitados (`8633011` … `a8d094a`;
os relatórios em `docs/revisao/2026-08-04-arqueologia-legado/execucao/`). Esta
seção registra **duas respostas novas da dona**, no mesmo formato das três
primeiras: o que ela disse, o que isso resolve, e o que passa a ser possível.

## P4 — "Vira." ✅

*A pergunta era: depois do casamento, a peça confeccionada vira item do acervo?*

**Vira.** Então existe uma transição **produção → acervo** que nem a spec nem o
E155 modelaram — o E155 registrou a pergunta e não inventou a resposta, e este é
o épico que ela paga.

O que a resposta significa em números: a manga da Dayfini foi feita para uma
noiva, cobrada uma vez, e **volta a render** — ela entra na lista que a próxima
noiva folheia, com código, reserva e conflito próprios, como qualquer peça. Sem
a transição, cada peça sob medida some do sistema no dia seguinte ao casamento e
volta a existir só como frase no contrato — que é exatamente o estado de que o
E150 tirou o bolero.

### E156 — a confecção vira peça do acervo

**Fecha:** P4 · a transição que o E155 deixou escrita e não modelada

`vestidos` ganha a proveniência, e não o contrário:

```sql
ALTER TABLE vestidos ADD COLUMN origem_ajuste_id text REFERENCES ajustes(id) ON DELETE SET NULL;
```

A direção importa. A peça do acervo é o que sobrevive; o trabalho da costureira
é de onde ela veio. Apontar ao contrário (`ajustes.vestidoId`) faria a fila
carregar um campo que só interessa depois que ela terminou.

**Três decisões, e as três seguem doutrina que já existe aqui:**

1. **É um gesto, não um gatilho.** Nada vira peça sozinho quando o casamento
   passa. É a mesma razão do E100/F37 e do E151: o sistema não toma decisão
   irreversível pela loja — quem decide se aquela manga entra no acervo é quem
   vai alugá-la de novo.
2. **O preço é digitado.** `ajustes.custo` é o que a **costureira** cobrou;
   `vestidos.precoBase` é o que a **noiva** paga para alugar. São números
   diferentes, e derivar um do outro seria inventar margem.
3. **A peça nasce ATIVA e sem reserva nenhuma** — o histórico dela começa no dia
   em que virou acervo. O contrato antigo continua apontando a confecção pelo
   `ajusteId` do item (E155); nada é reescrito para trás.

**Onde:** na fila da costureira, no trabalho `CONFECCAO` já `FEITO` — *"virou
peça do acervo"*, abrindo o cadastro com nome e descrição preenchidos.

**Fora do escopo:** foto (o cadastro de vestido já a tem), e transformar peça de
acervo de volta em produção — não existe caminho de volta e ninguém pediu.

## P5 — "É valor." ✅

*A pergunta era: o `7.600` ao lado de "Realuguel" é valor ou código de peça?*

**É valor.** A ambiguidade que segurava o A4 desde a trilha A cai: o único
número monetário das 29 fotos é dinheiro, e a releitura da trilha B já apontava
para lá — **ponto de milhar**, e nenhum dos 8 códigos observados usa ponto.

**O A4 deixa de ser impressão e vira épico.** O papel registra a contagem de
locações **7 vezes em 14 semanas** — `1º Aluguel` (YOKO, Adelita, Andreia),
`2º Aluguel` (Nixia), `2º` (BLARY), `Realuguel` (Fencyella, Adelita) —, o que
significa que o ateliê **precifica pela vez que a peça sai**, e o sistema tem um
preço só.

### E157 — a peça sabe quantas vezes saiu, e o preço acompanha

**Fecha:** A4 🟡 · **destravado por P5**

**A contagem já existe, e é da vida inteira.** `GET /vestidos/utilizacao`
(`routes/vestidos.ts:259-330`) conta provas, reservas e contratos por peça, e o
recorte `de`/`ate` é **opcional** — sem ele, `recorte()` devolve lista vazia de
filtros e a conta cobre tudo (`:274-277`). Não há motor a construir: há um
número que ninguém está lendo na hora certa.

O que falta é a régua de preço:

```sql
ALTER TABLE vestidos ADD COLUMN preco_realuguel numeric(10,2);
```

**Nulo = a peça não tem preço de segunda saída**, e o orçamento segue com o
`precoBase` — que é o comportamento de hoje, e por isso a coluna nasce sem
migração de dados. Quando existe, o item de orçamento que aponta uma peça **já
alugada antes** sugere o preço de realuguel, e a tela diz por quê: *"2ª saída
desta peça — preço de realuguel"*.

**A decisão de projeto: sugere, não impõe.** É a mesma família do E154 — a
vendedora vê o número e o motivo, e pode digitar outro. Preço é conversa; travar
o campo transformaria uma régua útil num atrito na frente da noiva.

**O que continua em aberto, e não bloqueia:** *quanto* é o preço de realuguel de
cada peça. É um número por peça que a dona digita, como o `precoBase` — o épico
entrega o campo e a régua, não a tabela de preços do ateliê.

## Ordem

| Épico | Fecha | Depende de |
|---|---|---|
| **E156** — a confecção vira peça do acervo | P4 | E155 (existe confecção) |
| **E157** — contagem de locações e preço de realuguel | A4 · P5 | E150 (o acessório também é peça que circula) |

Os dois são independentes entre si. O **E157 é o de maior retorno** — mexe no
preço de toda peça que sai pela segunda vez; o **E156 é o mais barato** — uma
coluna, um gesto e uma tela que já existe.
