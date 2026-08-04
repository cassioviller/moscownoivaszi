# O acervo ganha a identidade que o papel já tem

**Spec de execução · 2026-08-04** (2ª versão — os três tipos de acessório)
branch `rodada-7-sobras`
Diagnóstico: `docs/revisao/2026-08-04-arqueologia-legado/` (trilhas A e B,
adversarial, 29 fotos do sistema em papel)

> **O que mudou da 1ª versão.** O E150 tratava "acessório" como uma coisa só.
> São **três**, com naturezas diferentes, e enfiá-las na mesma tabela produziria
> ou um acervo cheio de saiote que ninguém procura, ou um bolero único sem
> reserva. Esta versão separa as três e acrescenta os épicos **E154** e
> **E155**. A numeração de E148–E153 não mudou.

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

O 🔴 do diagnóstico é o segundo, e desceu para 🟠 depois que a apuração mostrou
que ele tem **um** exemplo, não três (ver E152).

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

## As três perguntas que bloqueiam o Bloco 2

O **Bloco 1 inteiro** (E148–E151, E154, E155) não depende de resposta nenhuma.

### P1 — Quantos dias a peça fica parada depois do casamento, e a lavagem é interna ou terceirizada?

Hoje o sistema grava `lavagemDiasDepois: 7`
(`artifacts/api-server/src/lib/configuracao-inicial.ts:132`), e essa é a
**única** fonte da colisão do A1. Com as janelas separadas, para dois
casamentos em sábados consecutivos:

```
uso 1  (D=12/09):  09/09 ─ 14/09
uso 2  (D=19/09):            16/09 ─ 21/09     ← 1 dia de FOLGA entre os usos
lavagem 1:              15/09 ──────── 21/09   ← é só isto que colide
```

**Os dois usos não se tocam.** E em 29 fotos não há **um único** registro de
lavagem — a agenda anota prova, retirada, troca e férias, nunca a lavanderia.

### P2 — Uma "Arnalda P" e uma "Arnalda G" são o mesmo vestido em dois tamanhos, ou dois vestidos?

O caderno mostra as duas saindo **na mesma semana, para noivas diferentes**
(17–23/08, itens 1 e 12; de novo em 14–20/09, itens 8 e 10), e numeração de
unidade: `Arnica **2** G (Busto grande) Original`, `Shelly **2**`.

### P3 — Quantas peças do acervo têm mais de uma unidade?

Se for "quase nenhuma", o E155 não se paga. Se for "as mais pedidas têm 2 ou
3", ele é obrigatório: hoje elas viram linhas separadas com nomes quase iguais,
e **o lookbook da noiva mostra a mesma foto duas vezes**
(`lib/db/src/schema/lookbooks.ts:36`).

### E um dimensionamento, que não bloqueia nada

Dos acessórios do ateliê, **quantos são de cada tipo?** Contei nas 14 semanas
do caderno entre **10 e 13 nomes distintos** de acessório — é uma tarde de
digitação, não uma semana. Mas a proporção entre tipo 1 e tipo 2 muda quanto
vale investir no E154.

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

# Bloco 2 — depende das respostas

## E152 — a régua de ocupação (só se P1 disser que precisa)

**Fecha:** A1 🟠 (era 🔴) · **bloqueado por P1**

**Se P1 disser "2 dias para todo mundo":** um `UPDATE` e uma linha na tela de
Configurações. Fim.
**Se disser "depende da peça":** `lavagem_dias_depois` ganha override por
categoria (a do E149), lido em `buscarRegra`
(`artifacts/api-server/src/lib/disponibilidade.ts:341-356`).

**A força da evidência, declarada.** O diagnóstico citou três pares de semanas
consecutivas; **só um sobrevive**:

| Par | Semana N | Semana N+1 | Vale? |
|---|---|---|---|
| **Adelita** | Larissa · *"Novo que chegou / 1º Aluguel"* | Mª Fernanda · *"Realuguel"* | **sim** |
| Konte | **Larissa** | **Larissa** | não — mesma noiva, registro movido |
| Shellyane | Isabela | Letícia · *"Shellyane **P**"* | não — o `P` pode ser outra peça |

E há uma anotação que ameaça o achado e que a foto não resolve: `CHLOE → se
sabe que tá 15 dias` (21–27/09, item 10). Se a locação dura 15 dias, peça
nenhuma sai em semanas consecutivas — mas o mesmo caderno usa "15 dias" para
ausência de funcionária (*"Volta da Marilza 15 dias"*), e há um "ISA" — nome de
vendedora — rabiscado ao lado. **P1 resolve.**

## E153 — modelo e peça (só no Caminho A)

**Fecha:** o ponto 5 do diagnóstico · **bloqueado por P2 e P3**

### Caminho A — se "Arnalda P" e "Arnalda G" são o mesmo vestido

A noiva escolhe o **modelo** (pela foto); a loja entrega uma **peça** (a que
serve nela). Hoje as duas coisas são a mesma linha.

```sql
CREATE TABLE modelos (
  id           text PRIMARY KEY,
  loja_id      text NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  nome         text NOT NULL,                      -- "Arnalda"
  preco_base   numeric(10,2) NOT NULL,
  observacoes  text,
  ativo        boolean NOT NULL DEFAULT true,
  UNIQUE (loja_id, nome)
);

ALTER TABLE vestidos ADD COLUMN modelo_id    text REFERENCES modelos(id);
ALTER TABLE vestidos ADD COLUMN unidade      integer NOT NULL DEFAULT 1;
ALTER TABLE vestidos ADD COLUMN qualificador text;   -- "Busto grande", "Original"
ALTER TABLE vestidos ADD CONSTRAINT vestidos_modelo_tamanho_unidade_unq
  UNIQUE (modelo_id, tamanho, unidade);
```

| Passa a ser do MODELO | Continua na PEÇA |
|---|---|
| foto (`vestido_fotos`) | `codigo` — a etiqueta física (4113) |
| atributos (`vestido_atributos`) | `tamanho`, `unidade`, `qualificador` |
| cor, categoria (E149) | `status` |
| `preco_base` | reservas, itens, avarias |

**Seis tabelas referenciam `vestidos.id`** e todas continuam apontando para a
**peça**, que é o que sai da arara — nenhuma migração de FK: `bloqueio_vestidos`
(`atendimentos.ts:34`), `contrato_itens` (`contratos.ts:75`), `orcamento_itens`
(`orcamentos.ts:54`), `lookbook_itens` (`lookbooks.ts:36`), `vestido_fotos` e
`vestido_atributos` (`vestidos.ts:62,83`). As duas últimas **mudam de dono** e
são a parte cara.

**O ganho que se mede:** um ateliê com 3 unidades de um modelo manda hoje um
lookbook com **a mesma foto três vezes** e guarda três cópias do mesmo JPEG.

**Migração** (`docs/migracoes/2026-08-04-e153-modelo-peca.sql`): cada vestido
vira um modelo de mesmo nome com uma peça de `unidade 1`; onde dois nomes só
diferirem por sufixo de tamanho (`^(.*) (P|M|G|GG)$`), o script **propõe** a
fusão num relatório e **não a executa** — *Arnalda* × *Arnica* já mostrou que
semelhança de grafia não basta.

### Caminho B — se forem peças independentes

`vestidos` continua plano; o E153 some. Resta dar à peça o **contador de
locações** e o **preço de realuguel** (A4), que o papel registra 7 vezes em 14
semanas: `1º Aluguel` (YOKO, Adelita, Andreia), `2º Aluguel` (Nixia), `2º`
(BLARY), `Realuguel` (Fencyella, Adelita). A contagem já é calculável
(`routes/vestidos.ts:268-315`); falta a régua de preço que a lê — e ela depende
de saber se o `7.600` é valor ou código.

---

## Ordem de execução

```
E148 (1 linha)          ─── independente, faça primeiro
      │
E149 (catálogo)         ─── base: dá "Acessório" ao E150 e a cor a todos
      ├── E150 (tipo 1: peça única)     ── E2E completo (regra 11)
      ├── E154 (tipo 2: estoque)
      └── E155 (tipo 3: confecção)      ── reusa a fila da costureira
E151 (ausência)         ─── independente dos acessórios

           ↓ respostas P1, P2, P3

E152 (régua)            ─── UPDATE, ou override por categoria
E153 (modelo × peça)    ─── só no Caminho A, e ANTES do acervo entrar
```

**E153 é o único irreversível na prática.** Depois de 500 vestidos digitados,
mudar a forma custa recadastrar. Ele cabe **antes** do "cadastrar os primeiros
vestidos" que o `replit.md` chama de primeiro passo pendente — ou é abandonado
de vez.

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
| E152 | Duas reservas da mesma peça em sábados consecutivos deixam de colidir — ou colidem de propósito, se P1 mandar |
| E153 | Um modelo com 3 unidades aparece **uma vez** no lookbook e guarda **um** par de fotos |

Cada épico fecha com **um commit de código** e o `docs(...)` que registra o hash
no rastreador. Os que mudam o que a trilha grava ou o formato que uma tela lê —
**E150, E154, E155 e E153** — rodam o **E2E completo** antes do commit (regra 11).
