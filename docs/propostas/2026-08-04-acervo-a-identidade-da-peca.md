# O acervo ganha a identidade que o papel já tem

**Spec de execução · 2026-08-04** · branch `rodada-7-sobras`
Diagnóstico: `docs/revisao/2026-08-04-arqueologia-legado/` (trilhas A e B,
adversarial, 29 fotos do sistema em papel)

## Por que agora, e não depois

O `replit.md` diz, sobre o seed do E147:

> **Ele não cadastra noiva, vestido, contrato nem parcela** — isso é trabalho
> da loja, e entra pela tela. (…) o único primeiro passo pendente é
> "cadastrar os primeiros vestidos".

**O acervo ainda não entrou.** As 29 fotos não são o legado de um sistema em
uso — são o que ainda vai ser digitado. Isso define a ordem desta spec e
inverte a que o diagnóstico propôs:

| | Custo se estiver errado |
|---|---|
| **Forma do cadastro** (identidade da peça, cor, acessório) | recadastrar o acervo inteiro, à mão, item por item |
| **Régua de ocupação** (a lavagem do A1) | um `UPDATE` de uma linha em `regra_disponibilidade` |

O 🔴 do diagnóstico é o segundo. Esta spec ataca o primeiro, e trata o A1 como
o que ele é: um número mal calibrado, barato de corrigir, que só morde depois
que houver operação.

## As três perguntas que bloqueiam — e o que muda em cada resposta

Nenhum épico do **Bloco 2** começa antes destas respostas (regra 5 do método).
O **Bloco 1** não depende de nenhuma delas e pode começar hoje.

### P1 — Quantos dias a peça fica parada depois do casamento, e a lavagem é interna ou terceirizada?

Hoje o sistema grava `lavagemDiasDepois: 7`
(`artifacts/api-server/src/lib/configuracao-inicial.ts:132`), e essa é a
**única** fonte da colisão que o diagnóstico chamou de A1. Refazendo a conta
com as janelas separadas, para dois casamentos em sábados consecutivos:

```
uso 1  (D=12/09):  09/09 ─ 14/09
uso 2  (D=19/09):            16/09 ─ 21/09     ← 1 dia de FOLGA entre os usos
lavagem 1:              15/09 ──────── 21/09   ← é só isto que colide
```

**Os dois usos não se tocam.** Com `lavagemDiasDepois ≤ 1`, a segunda locação
cabe. E em 29 fotos **não há um único registro de lavagem** — a agenda anota
prova, retirada, troca e férias, e nunca a lavanderia.

*Se a resposta for "2 dias, lavanderia da esquina":* o A1 morre com um
`UPDATE`, e o E152 abaixo some.
*Se for "7 dias mesmo, lavamos aqui e depende da peça":* o A1 vira o E152, e a
régua precisa deixar de ser uma só por loja.

### P2 — Uma "Arnalda P" e uma "Arnalda G" são o mesmo vestido em dois tamanhos, ou dois vestidos?

O caderno mostra as duas saindo **na mesma semana, para noivas diferentes**
(17–23/08, itens 1 e 12; e de novo em 14–20/09, itens 8 e 10). E mostra
numeração de unidade: `Arnica **2** G (Busto grande) Original`, `Shelly **2**`.

*Se forem o mesmo vestido em tamanhos diferentes:* **Caminho A** (modelo →
peça), abaixo.
*Se forem peças independentes que por acaso têm nome parecido:* **Caminho B** —
`vestidos` continua plano e esta spec encolhe pela metade.

### P3 — Quantas peças do acervo têm mais de uma unidade?

Se a resposta for "quase nenhuma", o Caminho A não se paga. Se for "as mais
pedidas têm 2 ou 3", ele é obrigatório — hoje elas viram linhas separadas com
nomes quase iguais, e **o lookbook da noiva mostra a mesma foto duas vezes**
(`lib/db/src/schema/lookbooks.ts:36` — `lookbook_itens` aponta para
`vestidos.id`, e `vestido_fotos` é por peça).

---

# Bloco 1 — não depende de resposta nenhuma

## E148 — a régua que a tela mostra é a régua que o sistema usa

**Fecha:** B1 🟠

`artifacts/moscow-noivas/src/pages/configuracoes/index.tsx:184` escreve
`{disponibilidade.provaDuracao} min`. O valor está em **slots de 30 minutos**
(`artifacts/api-server/src/routes/agenda.ts:93` —
`Math.max(1, regra?.provaDuracao ?? 1) * 30 * 60_000`; confirmado no
consumidor da grade, `pages/agenda/grade.tsx:171`: *"uma PROVA ocupa
`provaDuracao` slots"*). Com o default `provaDuracao: 2`, **toda loja nova
exibe "Duração da prova — 2 min" para uma prova de 60.**

**Conserto:** a tela multiplica por 30 e escreve o resultado.

```tsx
<span className="font-medium">{disponibilidade.provaDuracao * 30} min</span>
```

**Verificação:** com a régua padrão, a linha passa a ler `60 min`; com
`provaDuracao: 3` (usado em `e115-portal-agenda-api.test.ts:92`), `90 min`.

**Sobra que fica:** S-A7 — o campo não diz a unidade no nome. Renomear para
`provaDuracaoSlots`, ou guardar minutos e dividir na grade, resolve a classe;
está fora do escopo deste épico porque toca o OpenAPI, o codegen e 4 testes.

## E149 — cor e categoria saem do texto livre e entram no catálogo

**Fecha:** A3 🟠

Hoje `cor` e `categoria` são `text` livre (`lib/db/src/schema/vestidos.ts:46-47`),
preenchidas por campo de digitação
(`pages/vestidos/vestido-form.tsx:186-191` e `:204` — `<Input
placeholder="Branco" />`), e o filtro compara com igualdade estrita
(`pages/vestidos/index.tsx:262-263`) sobre opções derivadas dos valores brutos
(`:244-253`). "Verde", "verde" e "VERDE" viram três entradas no dropdown, cada
uma filtrando um pedaço do acervo.

**O mecanismo certo já existe e já é usado:** `atributosTable` /
`atributoOpcoesTable` (`lib/db/src/schema/vestidos.ts:14-36`), que o seed do
E147 popula com **7 atributos e 41 opções** — Silhueta, Decote, Manga, Tecido,
Cauda, Volume da saia, Brilho (`configuracao-inicial.ts:166-196`). **Cor ficou
de fora**, e é justamente o eixo pelo qual a segunda linha de negócio do
ateliê é buscada: **38 compromissos de festa/dama em 15 páginas de agenda,
indexados por cor e não por modelo**, em 15 cores distintas (verde, terracota,
marsala, vermelho, azul, azul serenity, pink, rosa, rosê, champagne, fúcsia,
laranja, amarela, dourado, dama).

**Conserto:**

1. O seed ganha dois atributos: **Cor** (as 15 do papel + branco, off-white,
   nude) e **Categoria** (Noiva, Festa, Dama, Madrinha, Debutante). Idempotente
   como os outros sete (`onConflictDoNothing`, id derivado da loja).
2. `vestidos.cor` e `vestidos.categoria` viram **legado lido, nunca escrito** —
   o mesmo tratamento que `contratos.bloqueio_vestido_id` recebeu no E72
   (`lib/db/src/schema/contratos.ts:89-95`: *"a coluna antiga fica como legado
   lido, nunca mais escrito"*).
3. `vestido-form.tsx` troca os dois `<Input>` por `<Select>` alimentado pelo
   catálogo, como já faz com os 7 atributos existentes.
4. `pages/vestidos/index.tsx` deixa de derivar `cores`/`categorias` dos valores
   brutos (`:250-252`) e passa a lê-las do catálogo — o filtro por atributo já
   existe e funciona (`:264-268`).

**Migração** (`docs/migracoes/2026-08-04-e149-cor-categoria.sql`): para cada
valor distinto de `cor` e `categoria` no banco, normalizar (minúsculas, sem
acento) e casar com a opção do catálogo; o que não casar vira opção nova, com
o valor original preservado. **Nada é descartado em silêncio** — o script
imprime o que casou e o que criou.

**Verificação:** cadastrar dois vestidos escrevendo "Verde" e "verde" deixa de
ser possível; o dropdown de cor passa a ter tantas entradas quanto o catálogo,
não quantas grafias existirem.

## E150 — o acessório vira peça, e o item que aponta peça exige reserva

**Fecha:** A2 🟠

O caderno numera a peça componente **como item do acervo, com ordem própria**.
A prova está na semana de 13–19/07, onde a mesma noiva ocupa duas linhas:

```
Gabriela  1) Dayfini + [apagado]
Gabriela  5) Manga renda c/ saia lisa   (Mesma noiva Dayfini)
```

Quem escreveu anotou entre parênteses *por que* o nome se repete. São 11
composições nas 14 semanas — `Bernarda + Bolero Ricca Sposa`,
`Kalina + Saiote 2 aros + crinol`, `Klosella + Solussaia + Manga`,
`Tamara + Bolero 2026`, `Lilya + NSA`, `Milla Nova (+ aplicações)` —, e
`Bolero Ricca Sposa` aparece em **duas semanas distintas com noivas
diferentes**: é peça que circula, não adjetivo.

No sistema, `orcamento_item_tipo` é `["VESTIDO", "SERVICO", "AJUSTE"]`
(`lib/db/src/schema/common/enums.ts:73-77`) — **não há acessório** —, e o
schema declara a descrição em texto como registro autoritativo
(`lib/db/src/schema/contratos.ts:66-69`). A lista de peças presas vem do corpo
da requisição, não dos itens (`routes/contratos.ts:296-303`), e nada valida
que um item com `vestidoId` tenha bloqueio correspondente (`:468-481`).

**Conserto, em duas partes:**

1. **O enum ganha `ACESSORIO`.** Acessório é peça do acervo com código próprio
   (bolero, mantilha, véu, saiote, crinol, manga avulsa) — cadastrado como
   `vestido` de categoria `Acessório` (o catálogo do E149 já traz a
   categoria). Isso mantém uma tabela só, e a distinção passa a existir onde
   importa: no item vendido e no filtro do acervo.
2. **O fechamento recusa item que aponta peça sem reserva.** Em
   `routes/contratos.ts`, depois da validação dos bloqueios (`:296-303`): todo
   item de tipo `VESTIDO` ou `ACESSORIO` com `vestidoId` não nulo precisa ter
   o `vestidoId` presente entre os bloqueios de `bloqueioIds`. Erro na régua
   da casa (E145):

```json
{
  "error": "ITEM_SEM_RESERVA",
  "detalhe": "O contrato vende uma peça que não está reservada — a peça pode sair para outra noiva no mesmo fim de semana.",
  "campos": [{ "campo": "itens", "motivo": "«Bolero Ricca Sposa» não tem reserva neste contrato" }]
}
```

**Por que isto não quebra o fluxo de hoje:** a tela já manda **todas** as
reservas da noiva não desmarcadas
(`pages/orcamentos/[id].tsx:638-641`), então o contrato montado pela interface
passa. Quem passa a ser recusado é o contrato que vende peça sem reservar —
que é exatamente o defeito.

**Regra 11:** este épico muda o que o fechamento grava. **E2E completo antes
do commit.**

## E151 — a ausência da vendedora existe, e a agenda a respeita

**Fecha:** A5 🟡

`grep -rniE "ferias|ausencia|indisponibilidade|folga"` em `artifacts/` e
`lib/` não devolve **nenhuma ocorrência de domínio**. A agenda tem cabine
(`lib/db/src/schema/loja.ts:45`) e `atendimentos.vendedoraId`
(`lib/db/src/schema/atendimentos.ts:70`), e nada que torne uma pessoa
indisponível num intervalo.

No papel, a ausência é a **primeira coisa que a página declara** — e mora no
caderno que conta as peças que saem, não na agenda de compromissos: **7 das 14
páginas do caderno**, todas entre 22/06 e 16/08. *Férias Marilza/Gabi*,
*Retorno Gabi*, *Volta da Marilza 15 dias*, *Férias Cris*, *Férias Jeni → 16 a
25*, *Férias Isa*, *Férias Marina*. Nas semanas de férias a agenda esvazia: 09
e 10/07 estão riscados com um X que atravessa as duas colunas; 18, 19, 22, 23
e 24 de agosto não têm um único compromisso.

**Conserto:**

```sql
CREATE TABLE ausencias (
  id          text PRIMARY KEY,
  loja_id     text NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  usuario_id  text NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  inicio      date NOT NULL,
  fim         date NOT NULL,
  motivo      text,                       -- "Férias", "Atestado", livre
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ausencias_loja_periodo_idx ON ausencias (loja_id, inicio, fim);
```

O agendamento passa a recusar `vendedoraId` com ausência cobrindo o dia, na
mesma camada que já recusa dia fora do expediente
(`lib/agenda-core/src/slots.ts:77`), com erro na régua da casa
(`VENDEDORA_AUSENTE` + detalhe nomeando a pessoa e o período).

**Fora do escopo:** ausência não cancela nem remarca o que já está agendado —
só impede o novo. Remarcação em lote é decisão de produto e não foi pedida.

---

# Bloco 2 — depende das respostas

## E152 — a régua de ocupação deixa de ser uma só (só se P1 disser que precisa)

**Fecha:** A1 🔴 · **bloqueado por P1**

`regra_disponibilidade` tem `loja_id` **unique**
(`lib/db/src/schema/loja.ts:28`): uma régua para o acervo inteiro. Um vestido
de renda pesada e um bolero levam os mesmos 7 dias de lavagem.

**Se P1 disser "2 dias para todo mundo":** o épico é um `UPDATE` e uma linha na
tela de Configurações. Fim.

**Se P1 disser "depende da peça":** `lavagem_dias_depois` ganha um override por
categoria (a categoria do E149), lido em `buscarRegra`
(`artifacts/api-server/src/lib/disponibilidade.ts:341-356`), que hoje devolve
uma régua por loja e passaria a devolver a régua efetiva da peça.

**A força da evidência, declarada:** o diagnóstico citou três pares de semanas
consecutivas. **Só um sobrevive ao escrutínio.** Fui atrás de quem é a noiva
em cada par:

| Par | Semana N | Semana N+1 | Vale? |
|---|---|---|---|
| **Adelita** | Larissa · *"Novo que chegou / 1º Aluguel"* | Mª Fernanda · *"Realuguel"* | **sim** — noivas diferentes |
| Konte | **Larissa** | **Larissa** | não — mesma noiva, é registro movido |
| Shellyane | Isabela | Letícia · *"Shellyane **P**"* | não — o `P` pode ser outra peça |

E há uma anotação que **ameaça o achado inteiro** e que não consigo resolver
pela foto: semana de 21–27/09, item 10 — `CHLOE → se sabe que tá 15 dias`. Se
a locação dura 15 dias, peça nenhuma sai em semanas consecutivas. O mesmo
caderno, porém, usa "15 dias" para ausência de funcionária (*"Volta da Marilza
15 dias"*), e há um "ISA" — nome de vendedora — rabiscado ao lado. **P1
responde isto de uma vez.**

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

O que muda de dono:

| Passa a ser do MODELO | Continua na PEÇA |
|---|---|
| foto (`vestido_fotos`) | `codigo` — a etiqueta física (4113) |
| atributos (`vestido_atributos`) | `tamanho`, `unidade`, `qualificador` |
| cor, categoria (E149) | `status` (ativo/manutenção/baixa) |
| `preco_base` | as reservas, os itens, as avarias |

**Seis tabelas referenciam `vestidos.id`** e todas continuam apontando para a
**peça**, que é o que de fato sai da arara — nenhuma migração de FK:
`bloqueio_vestidos` (`atendimentos.ts:34`), `contrato_itens`
(`contratos.ts:75`), `orcamento_itens` (`orcamentos.ts:54`), `lookbook_itens`
(`lookbooks.ts:36`), `vestido_fotos` e `vestido_atributos`
(`vestidos.ts:62,83`). As duas últimas **mudam de dono** e são a parte cara da
migração.

**O ganho que se mede:** `lookbook_itens` aponta para a peça
(`lookbooks.ts:36`) e `vestido_fotos` é por peça. Um ateliê com 3 unidades de
um modelo manda hoje um lookbook com **a mesma foto três vezes**, e paga o
armazenamento de três cópias do mesmo JPEG. Com o modelo dono da foto, o
lookbook passa a listar modelos e o número de fotos guardadas cai na razão
unidades/modelo.

**Migração** (`docs/migracoes/2026-08-04-e153-modelo-peca.sql`): cada vestido
existente vira um modelo de mesmo nome com uma peça de `unidade 1`; onde dois
vestidos da loja tiverem nome que só difira por sufixo de tamanho
(`^(.*) (P|M|G|GG)$`), o script **propõe** a fusão num relatório e **não a
executa** — juntar peças é decisão de quem conhece o acervo, e *Arnalda* ×
*Arnica* já mostrou que semelhança de grafia não basta.

### Caminho B — se forem peças independentes

`vestidos` continua plano. O E153 some, e do bloco resta apenas dar à peça o
**contador de locações** e o **preço de realuguel** (A4), que o papel registra
7 vezes em 14 semanas: `1º Aluguel` (YOKO, Adelita, Andreia), `2º Aluguel`
(Nixia), `2º` (BLARY), `Realuguel` (Fencyella, Adelita). A contagem já é
calculável — `routes/vestidos.ts:268-315` conta provas, reservas, contratos e
receita por peça. **O que falta é a régua de preço que lê a contagem**, e ela
depende de P2 do diagnóstico (o `7.600` é valor ou código).

---

## Ordem de execução

```
E148 (1 linha)  ──┐
E149 (catálogo) ──┼── Bloco 1: começa hoje
E150 (acessório)──┤   E149 antes de E150 (a categoria "Acessório" vem do catálogo)
E151 (ausência) ──┘

           ↓ respostas P1, P2, P3

E152 (régua)      ── UPDATE, ou override por categoria
E153 (modelo×peça)── só no Caminho A, e antes do acervo entrar
```

**E153 é o único irreversível na prática.** Depois que 500 vestidos estiverem
digitados, mudar a forma custa recadastrar. Ele deve caber **antes** do
"cadastrar os primeiros vestidos" que o `replit.md` chama de primeiro passo
pendente — ou ser abandonado de vez.

## O que esta spec deliberadamente não faz

- **Não importa o papel.** As 29 fotos cobrem 14 semanas e faltam o verso da
  última página e as semanas de 28/09 a 11/10 (S-A2). Digitar histórico não é
  o objetivo; a forma do cadastro é.
- **Não mexe no expediente** (B2 domingo, B4 provas às 18:30). São defaults
  configuráveis, e a pergunta "qual é o expediente real do ateliê" não foi
  feita. Fica na S-A8, junto com a auditoria das premissas categóricas
  escritas em comentário no `configuracao-inicial.ts` — a que diz "domingo
  fechado, **como todo ateliê de noiva**" (`:125`) é contrariada 7 vezes pelo
  próprio ateliê.
- **Não trata a confecção sob medida** (S-A4/S-A6), que aparece 3 vezes no
  papel — *"Siam + Manga **será confeccionada**"*, e dois compromissos de
  10:30 marcados só para "conversar sobre confecção de manga". Não é ajuste de
  peça existente (`ajustesTable`): é peça nova feita para a noiva, e não tem
  lugar no modelo. É a próxima trilha, não um épico desta.

## Como se verifica que funcionou

| Épico | A prova |
|---|---|
| E148 | Configurações lê `60 min` com a régua padrão, `90 min` com `provaDuracao: 3` |
| E149 | Não é possível cadastrar "Verde" e "verde"; o dropdown tem as opções do catálogo, não as grafias do banco |
| E150 | `POST /contratos` com item apontando `vestidoId` fora de `bloqueioVestidoIds` responde `422 ITEM_SEM_RESERVA`; o contrato montado pela tela continua fechando |
| E151 | Agendar prova com vendedora em ausência responde `VENDEDORA_AUSENTE` nomeando pessoa e período |
| E152 | Duas reservas da mesma peça em sábados consecutivos deixam de colidir (ou colidem de propósito, se P1 mandar) |
| E153 | Um modelo com 3 unidades aparece **uma vez** no lookbook e guarda **um** par de fotos |

Cada épico fecha com **um commit de código** e o `docs(...)` que registra o
hash no rastreador. Os que mudam o que a trilha grava ou o formato que uma
tela lê — **E150 e E153** — rodam o **E2E completo** antes do commit (regra
11).
