# Fechar o contrato — o plano do que resta

**Aberto em 13/08/2026**, depois de a sessão fechar E213, E222 e E218.
Base: `3b26e8a4` · Trilha: [`2026-08-13-contrato-de-papel/`](../revisao/2026-08-13-contrato-de-papel/EXECUCAO.md)

> ## ⚠️ Este plano envelheceu no mesmo dia, e é isso que ele documenta
>
> **Atualizado em 13/08/2026, depois do lote de cinco agentes** (`c34ac624`).
> Três coisas que ele afirma já eram falsas horas depois de escritas:
>
> - **"13 sobras"** — são **21**. Seis fecharam no lote e **catorze nasceram
>   dele**, que é o que se espera de trabalho que termina em varredura.
> - **A "leva B" já foi executada**: S-C30 (virou régua, 9 sítios), S-C33 (o
>   derivado do schema) e S-C10 (o número morto) estão fechadas.
> - **O `main` foi publicado** (`11e5ba89..c34ac624`) e a **S-C63 foi rodada** em
>   `moscow_base`, com as duas colunas conferidas no banco.
>
> **A lição é a do ponteiro, e vale mais que o plano:** documento que descreve
> estado envelhece a cada commit, e quem abre a sessão seguinte lê o estado velho
> como se fosse o de hoje — foi a S-A5 da arqueologia, e o `CLAUDE.md` já pagou
> por isso. **Conte na tabela do `EXECUCAO.md`, nunca aqui.**

Este plano cobre **tudo o que ainda está aberto** na trilha do contrato: os
épicos que faltam, os dois que precisam nascer, as 13 sobras, as 4 pendências da
dona e os dois itens de fora da fila.

---

## O que resta, contado e não deduzido

| natureza | quantos | quais |
|---|---|---|
| Épicos da fila original | **4** | E215, E217, E220 e o E219 (bloqueado) |
| Épicos que precisam **nascer** | **2** | E223 (a porta de troca) e E224 (o gesto da retirada) |
| Sobras abertas | **13** | **5 🟡** (S-C10, S-C11, S-C32, S-C34, S-C35) e **8 🔵** |
| Pendências que **não são software** | **4** | P1, P2, P3, P4 — todas da dona |
| Decisões da dona ainda abertas | **2** | D4 e D7, travam só o E220 |

**Oito dos doze épicos originais estão executados**, e com eles as Ondas A e B
inteiras — menos o E219.

---

## A lição que ordena este plano

Quatro épicos seguidos ensinaram a mesma coisa, de quatro formas diferentes:

> **O plano do contrato supõe portas que o sistema não tem.**

- **E213** — a régua faltava na porta **ao lado**: o `POST /receber` recusava os
  R$ 515,00 que as outras três leituras já mostravam.
- **E222** — o campo existia e **nenhuma tela** o oferecia: 1 de 723.
- **E219** — a porta **não existe**: trocar de traje é cancelar e refazer.
- **E215** — a porta existe, o campo é **opcional**, e por isso está em **0 de
  723**.

Por isso **cada bloco abaixo começa com o que medir**, e a medição vem antes da
primeira linha de código. Ela se responde com `git ls-files` e um `SELECT`, custa
minutos, e nos quatro casos mudou o tamanho do épico.

**A segunda régua que ordena o plano:** só entra código onde há **gesto**. Régua
sem gesto é a sobra que fica aberta esperando alguém preencher pela API.

---

## Bloco 1 — o que destrava o resto (E215)

**O achado de maior alcance da auditoria**, e a fase 0 já está fechada
(`3b26e8a4`): a dona decidiu que os campos nascem **obrigatórios no fecho**.

### A ordem interna, que não é estilo

Inverter trava o fecho de contrato numa loja que ainda não tem onde preencher.

1. **As colunas na ficha** (`leads`): CPF, RG, estado civil, profissão,
   nascimento, e-mail e o endereço inteiro (logradouro, número, complemento,
   bairro, CEP, cidade, estado). A ficha é o cadastro da noiva.
2. **A ficha ganha os campos na tela** — sem isto, o passo 4 é uma parede.
3. **O contrato congela a cópia** no fecho, como já faz com o preço e o
   desconto. O retrato é o que o PDF do E220 vai imprimir; a ficha continua
   viva e editável.
4. **Só então a obrigatoriedade**: o `POST /contratos` recusa o que falta,
   **nomeando o campo** — no molde do `campos: [{ campo, motivo }]` que as
   guardas do E218 e do E222 já usam.

### O que medir antes

- Quantos leads têm cada campo hoje: **nenhum tem nenhum** (a ficha não tem um
  dado civil), mas confira antes de escrever o `NOT NULL` de qualquer coluna.
- **Onde o dado pessoal sai**: a exportação LGPD e o expurgo. O expurgo é
  `set({…})` de **lista curada à mão** (`routes/leads.ts:390`) — a mesma classe
  da S-C33. **Campo pessoal novo entra nas duas pontas ou nasce fora da lei.**

### O cuidado que vai cobrar

O `POST /contratos` passa a recusar por 11 campos. **Meça a fixture antes**: o
E2E e o seed criam contratos sem nenhum deles, e estreitar a porta sem olhar
reprova a suíte por dado de teste, não por defeito — é o que o E198 aprendeu com
o `e87`, e o que o E222 evitou por medir.

**Custo:** a onda cara. O próprio plano original diz que a Onda C pesa mais que
as ondas A e B juntas, e este é o épico grande dela. **Uma sessão inteira**, com
migração, duas telas e as duas pontas da LGPD.

---

## Bloco 2 — a rescisão (E217)

Não depende do E215 e pode ser feito antes dele, se a sessão for curta.

**O E216 já entregou o predicado** (a peça exclusiva). O relatório dele deixa
dois avisos que este épico tem de respeitar, e os dois estão em
[`execucao/E216.md`](../revisao/2026-08-13-contrato-de-papel/execucao/E216.md):

- **descontar o PRÓPRIO contrato** da contagem de saídas — senão a 12ª nunca
  dispara;
- **escolher e DECLARAR** a base do *"valor integral do aluguel"*: item ou
  contrato. As duas leituras dão números diferentes, e a decisão fica escrita.

Entra também a **coluna do prazo da 18ª** (D3, já decidida: é campo por contrato,
não constante), a dedução de 60%, a devolução em 30 dias e a reserva que nunca
volta (8ª §2º).

### O que medir antes

Quantos contratos foram **cancelados** e o que a rota de cancelar faz hoje —
`canceladoMotivo` e `canceladoEm`, e nada de conta. É a cláusula com o maior
risco de a régua nascer sobre um gesto que a loja não usa: **conte os
cancelamentos reais antes de desenhar a devolução.**

**Custo:** médio. Migração de uma coluna, conta pura, uma tela.

---

## Bloco 3 — as duas portas que precisam nascer

Os dois épicos abaixo **não estão na fila original**. Eles existem porque a
medição os encontrou, e cada um destrava trabalho que hoje está parado.

### E223 — a troca de peça do contrato (destrava o E219)

Hoje `contrato_itens` e `contrato_bloqueios` recebem escrita em **um único
sítio**: o `INSERT` do `POST /contratos`. Não há `PATCH`, `PUT` nem `DELETE`.
**Trocar de traje é cancelar o contrato e fazer outro** — e isso apaga a trilha
financeira junto.

A porta precisa: trocar a peça, **libertar a reserva antiga**, **prender a nova**
(com o mesmo `verificarDisponibilidade` do fecho), refazer o snapshot de preço e
deixar rastro. Só depois dela o **E219** tem onde morar — a guarda da 17ª (sem
troca após 7 dias, nem às sextas e sábados).

**Uma decisão para a dona, e ela é do negócio:** *"após 7 dias da data da
locação"* conta a partir do **fecho do contrato** ou da **retirada**? A leitura
coerente é o fecho — trocar de modelo depois de a peça sair não existe —, mas a
palavra é do instrumento e quem confirma é ela.

**Custo:** alto. É épico de porta, com corrida de reserva no meio — a mesma
classe do E162 e da S-M7.

### E224 — o gesto da retirada e da devolução (fecha S-C35 e S-C36)

O E222 pôs a régua do expediente na porta, e o campo continua sem tela: **1 de
723** contratos tem retirada, **nenhum** tem devolução, e o PDF imprime os dois
rótulos sempre vazios (S-C36).

Entra o campo no fecho e na edição do contrato, com os **defaults da 5ª** (10:30
e 18:00) já sugeridos — que o E222 deixou prontos como constantes.

**Custo:** baixo. É tela sobre régua que já existe.

---

## Bloco 4 — o documento (E220)

**Trava em três coisas**, e duas não são código: **D4**, **D7** e o **E215**.

O PDF passa a ser o instrumento com as 21 cláusulas, com os números vindos de
**constantes** — as mesmas que os épicos desta trilha criaram: os 40% da 8ª §1º,
os 20 dias do § único, os 2% e 1% da 9ª, as faixas da 14ª e 15ª, a diária e a
multa da 16ª, os degraus da 17ª.

**A régua obrigatória** já está prevista no plano original: a irmã da
`varredura-manuais-prazos` (E184), pregando **os números das cláusulas do PDF
contra as constantes do código**. Sem ela, o papel e o código divergem em
silêncio — que é exatamente a doença que o E184 achou nos manuais.

Nasce também a **validação de CNPJ**, que não existe em lugar nenhum do
repositório: o exemplo semeado hoje (`12.345.678/0001-99`) é **inválido**, e o
número que vai impresso em todo contrato entra sem conferência.

**Custo:** alto, e é o último por construção.

---

## Bloco 5 — as 13 sobras, em três levas

**Conte a tabela, não este parágrafo.** Elas estão agrupadas por quando fecham,
não por severidade.

### Leva A — fecham junto com o épico que as gerou

| sobra | fecha em |
|---|---|
| **S-C35** 🟡 e **S-C36** 🔵 | **E224** — são o mesmo gesto ausente, visto na tela e no papel |
| **S-C1** 🔵 (dano constatado na entrega) | **E217**, que já mexe na rescisão e na avaria |

### Leva B — as que são régua medindo a si mesma

| sobra | o que fazer |
|---|---|
| **S-C33** 🔵 | **Trocar a lista curada por um derivado do schema.** Duas colunas em dois épicos seguidos nasceram invisíveis para a detecção de CAS (E212 e E213) — a lista não é sustentável, e a régua acusando código certo é a direção mais cara |
| **S-C30** 🔵 | Uma linha: escapar o NBSP em `e165-pdf-fala-a-verdade.test.ts:19`. **Já cobrou dois testes ao E221 e um ao E218** — enquanto não fechar, todo teste novo que compare dinheiro paga o pedágio |
| **S-C10** 🟡 | Remedir os *"61 das 63 avarias"* e decidir se o argumento sobrevive. São **8 sítios versionados**, e os comentários argumentam com o número — não é troca de texto |

Estas três valem um épico só, de régua, e ele é barato. **A S-C30 primeiro**, que
é uma linha e para de cobrar pedágio.

### Leva C — as que esperam gesto ou decisão

| sobra | o que falta |
|---|---|
| **S-C34** 🟡 | Uma linha na mensagem de cobrança: nomear a multa que ela já cobra |
| **S-C32** 🟡 | A fila do atraso — hoje só se descobre abrindo a ficha da reserva, e o valor cresce sozinho |
| **S-C11** 🟡 | O `PATCH /avarias/:id` que falta a quem digitou R$ 1.500,00 no lugar de R$ 150,00 |
| **S-C31** 🔵 | Datar o recebimento parcial pelo dia de cada ato — o E221 já criou a trilha de onde tirar |
| **S-C21** 🔵 e **S-C22** 🔵 | Esperam a dona: mostrar a exclusividade no lookbook é decisão de venda, e o filtro só dói quando houver peça marcada |
| **S-C20** 🔵 | **Os manuais, depois da onda C** — pela lição do E196, manual se reescreve ao fim da onda, não quando alguém tropeça |

---

## Bloco 6 — o que não é código

### As 4 pendências da dona

| # | o que | por quê |
|---|---|---|
| **P1** | Corrigir a página 6 do molde | O CNPJ da assinatura é de **outra inscrição** — e os dois números passam na validação |
| **P2** | Olhar os contratos **já assinados** com aquela página | Decisão jurídica, não de software |
| **P3** | Preencher os dados reais da loja em *Configurações* | O banco ainda tem o exemplo; **o lugar é a tela**, não o código |
| **P4** | Escolher o índice da **correção monetária** da 9ª | IPCA, IGP-M e INPC dão três números para a mesma dívida. O E213 declara que não corrige, em vez de calar |

### As 2 decisões que travam o E220

**D4** — o PDF do sistema deve virar o instrumento com as 21 cláusulas?
**D7** — representante legal e chave PIX entram no cadastro da loja?

**Elas podem ser respondidas a qualquer momento** — nada além do E220 espera por
elas, e o E221 provou isso: o recibo saiu sem que nenhuma das duas fosse
respondida.

### Os dois itens fora da fila

- **Publicar o `main`.** São **31 commits** à frente do `origin`, e a trilha do
  contrato inteira está inédita. O costume da casa é publicar no mesmo dia, com
  autorização da dona — e o custo de deixar para trás está medido na regra 29:
  todo worktree de agente nasce em `origin/main`, e cada agente atrasado gasta o
  primeiro gesto se reposicionando.
- **Registrar a regra do E2E no `METODO.md`.** A sessão passou a rodá-lo **uma
  vez por lote** em vez de por commit, a pedido da dona, e a regra 11 ainda diz o
  contrário. Os números que justificam estão medidos: **E2E 7 min, suíte de API
  10 min** — o gargalo não era o E2E. O que se perde é **localização**: um
  vermelho no fim não diz qual épico quebrou. Regra aplicada e não registrada é
  o que a próxima sessão lê errado.

---

## A ordem sugerida, e a razão dela

1. **Publicar o `main`** e **registrar a regra do E2E**. Baratos, e o primeiro
   fica mais caro a cada commit.
2. **S-C30** — uma linha, e para de cobrar pedágio em todo teste de dinheiro.
3. **E224** — o gesto da retirada. Baixo custo, fecha duas sobras, e dá
   população para a régua que o E222 já construiu.
4. **E215** — a sessão inteira dele. Destrava o E220 e é o de maior alcance.
5. **E217** — a rescisão. Pode subir para antes do E215 se a sessão for curta.
6. **E223** → **E219** — a porta de troca e, sobre ela, a guarda da 17ª.
7. **D4 e D7 respondidas** → **E220**, e com ele a régua que prega o papel contra
   as constantes.
8. **A leva B das sobras** (S-C33 e S-C10) e **a leva C**, conforme a dona
   priorizar.
9. **Os manuais** (S-C20), **depois** da onda C — nunca antes.

## O que este plano não faz

Não estima horas. As referências medidas hoje são: **E218 ~1 h**, **E222 ~1 h30**
(régua, quatro colunas, duas telas, migração), e o fechamento do **E213**
(medição, relatório e dois commits) **~1 h**. O E215, o E223 e o E220 são de
outra natureza — **é um plano de sessões, não de horas**, e a Onda C sozinha pesa
mais que as duas primeiras juntas.

E não decide nada que seja da dona: as 4 pendências, as 2 decisões, a base do
*"valor integral"* do E217 e a contagem dos 7 dias do E219 estão marcadas como
perguntas, não como escolhas minhas.
