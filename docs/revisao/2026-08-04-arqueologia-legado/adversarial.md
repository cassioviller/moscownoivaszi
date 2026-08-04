# Passada adversarial — tentando derrubar o 🔴 e os dois 🟠

**2026-08-04** · regra 7 do método: antes de consolidar, tenta-se refutar.

O procedimento aqui foi o mesmo do E120: para cada achado, escrever a melhor
defesa que o código poderia oferecer e depois ir ao código conferir se ela
existe. Três das seis defesas se sustentaram em parte; duas viraram reforço do
achado; uma o encolheu.

---

## A1 🔴 — a régua de 13 dias

### Defesa 1: "são duas peças homônimas, não a mesma Adelita"

**Sobrevive parcialmente — e o achado ficou com a ressalva.** Não há como
provar por foto que a *Adelita* de 07–13/09 e a de 14–20/09 são o mesmo
objeto físico. O que pesa contra a defesa é a semântica das próprias
anotações: a primeira diz **"Novo que chegou — 1º Aluguel"** e a segunda diz
**"Realuguel"**. "Realuguel" não é adjetivo de peça: é a segunda locação de
uma peça. Duas peças homônimas em que a segunda nasce já sendo "re" não é uma
história que se conte.

**Efeito:** o achado passou a declarar isso como indício forte, não prova.
Registrado no corpo do A1.

### Defesa 2: "a loja real deve ter configurado outros números"

**Derrubada.** Era a defesa mais promissora e é a que mais falha.
`configuracao-inicial.ts:127-136` (`HORARIO_PADRAO`) grava `usoDiasAntes 3`,
`usoDiasDepois 2`, `lavagemDiasDepois 7` em toda loja criada (`:476-479`), e
quem não tiver linha na tabela cai em `REGRA_DEFAULT`
(`disponibilidade.ts:37-42`) — os mesmos três números. Desde o E147 o seed é
"a configuração de um ateliê", então **a instalação nasce assim**. A defesa
exige que alguém tenha editado a régua à mão depois; não é o caso-base, é a
exceção.

**Efeito:** o achado ficou mais forte, com a âncora nova.

### Defesa 3: "registrar a devolução real encurta a janela e evita o conflito"

**Derrubada.** A devolução real não encurta a ocupação — ela a **desloca**. A
lavagem é derivada `[dev+1, dev+lavagemDiasDepois]` (`disponibilidade.ts:153`,
`:159`), então devolver na segunda-feira põe a lavagem até o domingo
seguinte. E a lavagem é classe `FISICA` (`:229`, `:240`), enquanto `conflitos`
dispara em qualquer sobreposição com ao menos uma FISICA (`:267-271`) — só
`PROVA × PROVA` é tolerado (`:11-12`). Não há caminho de datas reais que faça
a segunda locação caber.

**Efeito:** o achado ficou mais forte.

### Defesa 4: "o ateliê não usaria RESERVA_CASAMENTO para isso"

**Irrelevante.** O outro tipo é `MANUTENCAO`
(`lib/db/src/schema/common/enums.ts:35-38`), que é janela única e igualmente
FISICA. Não há terceiro caminho.

**Veredito A1: CONFIRMADO**, com a ressalva de identidade da peça declarada
no corpo.

---

## A2 🟠 — o conjunto

### Defesa 1: "o contrato prende todas as reservas da noiva, não só o vestido"

**Sustentada — e encolheu o achado.** Eu ia escrever que o fechamento prende
apenas o vestido principal. `pages/orcamentos/[id].tsx:638-641` manda
`bloqueioVestidoIds` com **todas** as reservas da noiva não desmarcadas na
tela, e a rota valida uma a uma (`routes/contratos.ts:296-303`). O N:N do E72
funciona ponta a ponta pela interface.

**Efeito:** a tese do achado foi reescrita. O que resta é verdadeiro e mais
estreito: a proteção **depende** de o acessório ter sido cadastrado como peça
do acervo e ter reserva própria, e nada no caminho da venda exige isso — o
enum `orcamento_item_tipo` (`enums.ts:73-77`) não tem lugar para acessório, e
o schema declara a descrição em texto como registro autoritativo
(`contratos.ts:66-69`).

### Defesa 2: "então basta cadastrar cada bolero como vestido — é disciplina, não defeito"

**Sustentada como possibilidade, insuficiente como resposta.** É de fato o que
o modelo pede hoje. Mas o sistema não tem como distinguir um bolero de um
vestido (ambos viram linha em `vestidos`), então toda contagem de acervo, a
tela de utilização e a receita por peça passam a misturar peça principal e
acessório. A disciplina resolve o conflito de reserva e cria um problema de
leitura.

**Veredito A2: CONFIRMADO com escopo corrigido**, 🟠 mantido.

---

## A3 🟠 — o filtro de cor

### Defesa 1: "quem cadastra escolhe de uma lista, a grafia não varia"

**Derrubada.** `pages/vestidos/vestido-form.tsx:186-191` desenha a cor como
`<Input placeholder="Branco" />` — texto digitado à mão, igual a tamanho
(`:178`) e categoria (`:204`). Não existe lista. A divergência de grafia é o
único comportamento possível do formulário.

**Efeito:** o achado ficou mais forte.

### Defesa 2: "a busca por texto cobre — quem procura verde digita verde"

**Derrubada.** A busca lê `nome` e `codigo`, nunca `cor`
(`pages/vestidos/index.tsx:260`). Digitar "verde" na caixa de busca não
encontra um vestido cuja cor é verde e cujo nome é "Ferula".

**Veredito A3: CONFIRMADO**, 🟠 mantido.

---

## O que esta passada custou e devolveu

Seis defesas escritas, seis conferidas no código. Uma encolheu um achado
(A2), três reforçaram os outros dois com âncora nova
(`configuracao-inicial.ts:127-136`, `disponibilidade.ts:267-271`,
`vestido-form.tsx:186-191`), uma virou ressalva declarada (A1/identidade da
peça), uma foi irrelevante.

**A lição de método:** as duas defesas que derrubei mais depressa — "a loja
configurou outro número" e "quem cadastra escolhe de uma lista" — eram
exatamente as que eu teria aceitado sem conferir, porque as duas *soam*
razoáveis. As duas estavam erradas, e nas duas a contraprova custou um `grep`.
