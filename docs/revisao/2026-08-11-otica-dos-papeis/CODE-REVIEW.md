# Code review por arquivo — os três arquivos quentes do gate

**Aberto em 2026-08-11**, base `05eb1d2` (`main` local, 2 commits de documentação
à frente de `origin/main`). Pedido da dona, na letra:

> `/code-review high artifacts/api-server/src/routes/contratos.ts`
> `/code-review high artifacts/api-server/src/lib/aceite-orcamento.ts`
> `/code-review high artifacts/api-server/src/routes/reservas.ts`
> "e vá anotando tudo que for fazendo e descobrindo em um documento caso caia
> a sessão"

## Por que não foi o `/code-review ultra`

O `ultra` revisa um **diff** — branch atual ou PR. O tema desta revisão é código
**não modificado** no `main`. Antes dos commits de hoje ele recusava três vezes
por diff vazio; depois deles o diff passou a ser 4.022 linhas da documentação
dos 8 ângulos, e ele revisaria a prosa achando que revisou o sistema. A forma
que aceita **caminho** é a não-ultra, um arquivo por vez — que é esta.

O `ultra` fica para o **conserto**, quando os épicos virarem branch e houver
diff real de tranca em transação e de máquina de estados.

## Como este arquivo é escrito

Uma seção por alvo, gravada **assim que o alvo termina** — não no fim dos três.
Se a sessão cair, o alvo que já tem seção está pago e não se refaz. A tabela
abaixo é a fila; conte o que tem seção, não deduza.

| # | Alvo | Estado | Achados |
|---|---|---|---|
| 1 | `artifacts/api-server/src/routes/contratos.ts` | ⏳ rodando | — |
| 2 | `artifacts/api-server/src/lib/aceite-orcamento.ts` | ✅ **feito** | 10 (7 correção, 3 limpeza) |
| 3 | `artifacts/api-server/src/routes/reservas.ts` | ⏳ rodando | — |

### Os três disparados em paralelo — como retomar se a sessão cair

Cada alvo é um workflow de revisão (vários agentes de achado por ângulo, mais um
verificador independente por local achado). Os três correm ao mesmo tempo. **Se
a sessão cair antes de a seção do alvo existir neste arquivo, o trabalho do
workflow NÃO se perde** — os agentes já concluídos voltam do cache:

| Alvo | Run ID | Script |
|---|---|---|
| 1 · contratos | `wf_b4268826-564` | `code-review-wf_b4268826-564.js` |
| 2 · aceite-orcamento | `wf_e4adec97-d19` | `code-review-wf_e4adec97-d19.js` |
| 3 · reservas | `wf_7ad38c46-f45` | `code-review-wf_7ad38c46-f45.js` |

Os scripts vivem em
`~/.claude/projects/-home-runner-workspace/bd5ae487-d28a-4f60-89a9-9b09aa57dc1b/workflows/scripts/`.
Retomar: `Workflow({scriptPath: "<script acima>", resumeFromRunId: "<run id>"})`.
O `journal.jsonl` do diretório de transcrição diz o que cada agente devolveu —
leia-o antes de concluir que um resultado veio vazio.

**Retomada só vale na MESMA sessão.** Se a sessão morreu, os run IDs não
resolvem: refaça o alvo que não tem seção aqui. É por isso que a seção é
gravada assim que o alvo termina, e não no fim dos três.

## Na fila depois destes três — o `max` do fluxo completo, em 4 fatias

Decidido com a dona em 2026-08-11, com o recorte e o momento escolhidos por
ela: **API + telas, agora, sobre o código de hoje** — não depois dos consertos.
O motivo do "agora" é que o cruzamento com os 59 achados dos oito ângulos
adianta boa parte da etapa 4.

O fluxo completo mede **~9.200 linhas em 13 arquivos**. Uma passada `max` única
sobre isso dilui o esforço; por isso vai fatiado por fronteira, cada fatia com
contexto fechado e o servidor junto da tela que fala com ele — porque foi
exatamente na fronteira entre dois arquivos que a conferência de 2026-08-05
achou três defeitos que quatro rodadas de revisão não tinham achado (regra 22).

| Fatia | Arquivos | Linhas |
|---|---|---|
| **F1 · orçamento e aceite** | `routes/orcamentos.ts`, `routes/orcamentos-publico.ts`, `lib/aceite-orcamento.ts`, `lib/conteudo-orcamento.ts`, `pages/orcamentos/[id].tsx`, `pages/orcamento-publico.tsx` | ~2.660 |
| **F2 · contrato e dinheiro** | `routes/contratos.ts`, `lib/contrato-do-papel.ts`, `pages/contratos/[id].tsx`, mais `estados.ts` e `dinheiro.ts` | ~2.400 |
| **F3 · reserva e acervo** | `routes/reservas.ts`, `pages/reservas/[bloqueioId].tsx`, `pages/reservas/index.tsx`, `pages/reservas/helpers.ts`, `escopo-loja.ts` | ~2.400 |
| **F4 · agenda e atendimento** | `routes/agenda.ts`, `pages/atendimentos/novo.tsx`, `pages/agenda/{index,grade,semana}.tsx`, `agenda-core/src/mover.ts` | ~2.600 |

**A sobreposição é de propósito.** `contratos.ts`, `aceite-orcamento.ts` e
`reservas.ts` são revistos duas vezes: uma sozinhos, no `high` de hoje, e outra
ao lado da tela que fala com eles, no `max`. Duas lentes diferentes sobre o
mesmo arquivo é o desenho, não desperdício — e a divergência entre as duas
passadas, se houver, é achado por si só.

Cada fatia grava a sua seção neste arquivo assim que termina, pela mesma regra
dos alvos de cima.

## O que esta revisão NÃO é

Ela não substitui a **etapa 4** (verificação âncora por âncora dos 59 achados
dos 8 ângulos, regra 20). São coisas diferentes com propósitos diferentes:

- os **8 ângulos** olharam o fluxo por ótica de papel — o que quebra na vida de
  quem usa;
- este **code review** olha três arquivos por dentro — correção, reuso,
  simplificação, eficiência.

O cruzamento entre os dois é achado por si só: defeito que aparece nas duas
lentes é candidato a subir de severidade no consolidado; defeito que aparece só
aqui é o que a ótica de papel não alcança.

## Contexto que o revisor precisa ter (dos 8 ângulos, ainda NÃO verificados)

Os três arquivos são exatamente onde o gate mora. O que os ângulos disseram
sobre eles, para o revisor não redescobrir do zero — **e para ser conferido, não
assumido**:

- `contratos.ts:448` / `:470-486` — o E150 exige bloqueio por peça de acervo
- `contratos.ts:184-193` — `CONTRATO_ATIVO_DUPLICADO` lido no pool, nunca relido
- `contratos.ts:541` — o `FOR UPDATE` da S-M7 dentro de `if (bloqueioIds.length > 0)`
- `contratos.ts:236` — `if (orcamento.aceiteHash)`, guarda que se desliga sozinha
- `aceite-orcamento.ts:16-71` — não encosta em reserva; `db` fora da transação em `:20-25`
- `reservas.ts:507` — o único criador de reserva do repositório, atrás de sessão + módulo
- `reservas.ts:157` — conta contratos ativos antes de qualquer tranca

---

# Alvo 1 — `artifacts/api-server/src/routes/contratos.ts`

⏳ em curso — nada gravado ainda.

---

# Alvo 2 — `artifacts/api-server/src/lib/aceite-orcamento.ts`

✅ **Feito.** 71 linhas de código, 20 agentes, 933 mil tokens. Os quatro ângulos
de achado levantaram 27 candidatos; a passada de verificação **matou 3** e
manteve 24, que se consolidaram em **10 defeitos distintos** — 7 de correção
(6 CONFIRMED, 1 PLAUSIBLE) e 3 de limpeza.

**A régua deste arquivo:** 71 linhas produziram 10 defeitos. É a maior densidade
de qualquer arquivo já revisado neste repositório — e o motivo é estrutural: é a
única escrita de estado que acontece **sem sessão**, feita pela pessoa que menos
pode conferir o resultado.

## Os sete de correção

**C1 · O CAS não reconfere o status sob a transação** (`:40`). O compare-and-swap
guarda só `isNull(aceitoEm)` e grava `APROVADO` incondicionalmente. A
pré-condição de status que o docstring (`:12-14`) delegou a quem chama é
conferida no pool e nunca reestabelecida dentro do `tx`, enquanto `/recusar`
(`orcamentos.ts:747`) e `/aprovar` (`:724`) escrevem a MESMA linha sem transação
e sem condição de status. **Medido:** orçamento de R$ 12.400,00 recusado às
14:00:00 volta a `APROVADO` às 14:00:00,2 pelo aceite que leu o pool às
13:59:59,8. RECUSADO é terminal (`estados.ts:49`), a vendedora lê "recusado" na
tela, e `POST /contratos` fecha os R$ 12.400,00 sobre a proposta que a loja
negou. Na ordem inversa é o espelho: orçamento RECUSADO carregando o comprovante
do aceite, com o badge "Aceito pela noiva" em `orcamentos/[id].tsx:757`.

**C2 · O aceite grava a versão mais alta, não a que a noiva viu** (`:20`).
`desc(numero)` lido com `db` fora da transação; o cliente não informa versão nem
hash. **Medido:** ela vê e aceita R$ 5.000,00 na aba antiga, a linha 20 lê a
versão 2 nascida no meio, e o contrato sai **R$ 5.500,00 — R$ 500,00 acima** —
passando por baixo da guarda do E115, porque o hash gravado é o da versão nova.

**C3 · `?? agora` inventa um carimbo de aceite que não foi gravado** (`:70`).
Perdida a corrida, `jaAceito?.aceitoEm ?? agora` não distingue "outro já aceitou"
de "a linha não existe mais". Se o orçamento é apagado no meio (um ENVIADO se
apaga), o UPDATE casa zero linhas, a auditoria não roda, e a API responde **200
com um `aceitoEm` inventado**. A noiva lê "Aceito em 11/08/2026 14:02" e o
ateliê não tem registro nenhum.

**C4 · A transação do aceite não tranca a linha** (`:28`). A S-M22 escolheu
`FOR UPDATE` + reconferência para serializar contra este CAS e aplicou o padrão
em dois lugares — **mas o próprio CAS não participa de tranca alguma**. As três
portas de item (`orcamentos.ts:499`, `:613`, `:646`) leem o status do pai no pool
e escrevem soltas. **Medido:** aceite grava hash de R$ 5.000,00 às 14:02:00; o
`POST /itens` que leu ENVIADO um instante antes insere um véu de R$ 1.500,00 às
14:02:00,1. O vivo vira R$ 6.500,00 e o orçamento entra em **beco permanente** —
422 para sempre no contrato, e as três portas de item agora recusam com
`ORCAMENTO_APROVADO`. Só refazendo tudo e pedindo novo aceite.

**C5 · O hash não cobre `observacoes` nem `validade`** (`:32`). A página pública
mostra os dois lendo a **linha viva**, e o `PATCH` só barra mexer no desconto
quando APROVADO — texto livre passa. **Medido:** a observação muda de "entrada de
R$ 1.500,00 e 7x R$ 500,00" para "entrada de R$ 2.500,00 e 5x R$ 500,00", o
total continua R$ 5.000,00, o hash continua batendo. O comprovante que ela
guarda passa a afirmar **R$ 1.000,00 a mais de entrada** sob o mesmo "Aceito em".

**C6 · O aceite não confere a validade** (`:12`). Nem a rotina nem os dois
chamadores olham `orcamento.validade`; só o TTL do link. **Medido:** proposta
vencida em 10/07 aceita em 11/08 na mesma página que diz "válida até 10/07/2026"
— e o contrato fecha em R$ 5.000,00 com a coleção já remarcada para R$ 5.800,00.
**R$ 800,00 abaixo do preço vigente.**

**C7 · `aceiteHash` nulo desliga a guarda do E115** (`:35`) — PLAUSIBLE, e a
única do lote que depende de dado, não de código. Sem versão congelada a rotina
grava `null` em silêncio, e a guarda em `contratos.ts:236` é `if
(orcamento.aceiteHash)`. **Medido:** ela lê R$ 5.000,00, o item sobe para
R$ 8.000,00 enquanto ENVIADO, ela aceita, o hash grava nulo, a guarda é pulada
inteira e o contrato nasce dos itens vivos — **R$ 3.000,00 a mais**. É
exatamente o caso que o comentário de `contratos.ts:230-235` diz existir para
impedir. **Confirma-se com uma contagem no `moscow_base`:** ENVIADOs sem linha em
`orcamento_versoes`. Se der zero, o achado morre.

## Os três de limpeza

O retorno `Promise<Date>` esconde se a rotina gravou ou perdeu a corrida, e por
isso as duas rotas duplicam a pré-condição (`:19`); o aceite custa três idas ao
banco em série, quatro para quem perde (`:28`) — e mover a leitura para dentro do
`tx` **fecha a janela do C2 de quebra**; e `updatedAt: agora` (`:38`) repete à
mão o que o `$onUpdate` do schema já faz, plantando a dúvida que já foi copiada
para `orcamentos.ts:725` e `:747`.

## O cruzamento com os oito ângulos

Quatro dos dez já tinham sido vistos pela ótica de papel, e **isso os promove**:

| Code review | Ângulo | O que muda |
|---|---|---|
| C1 (CAS × /recusar) | A08.3 | O ângulo viu o estado impossível; o review deu o exemplo de R$ 12.400,00 nas duas ordens |
| C2 (versão por `desc`) | A03.6 | O ângulo disse "fechado por sorte"; o review mostra a porta aberta pelo RASCUNHO→ENVIADO |
| C6 (validade) | A03.4 e A07.4 | Três lentes independentes, mesmo defeito |
| C7 (hash nulo) | A03.7 | O ângulo já pedia contagem no banco; o review concorda e fica PLAUSIBLE |

**Seis são novos** — nenhum dos oito ângulos os viu. Os mais graves são C3 (o
carimbo inventado), C4 (o beco por corrida com as portas de item) e C5 (o
comprovante que muda depois do aceite). É a resposta empírica para a pergunta que
abriu esta revisão: a ótica de papel e a leitura por dentro **não se substituem**.
