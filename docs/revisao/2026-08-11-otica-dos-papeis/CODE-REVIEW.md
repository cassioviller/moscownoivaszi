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
| 1 | `artifacts/api-server/src/routes/contratos.ts` | ✅ **feito** | 10 (9 correção, 1 limpeza) |
| 2 | `artifacts/api-server/src/lib/aceite-orcamento.ts` | ✅ **feito** | 10 (7 correção, 3 limpeza) |
| 3 | `artifacts/api-server/src/routes/reservas.ts` | ✅ **feito** | 10 (todos de correção) |

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

✅ **Feito.** 1.482 linhas, 39 agentes, 1,79 M tokens — o maior dos três. Os
quatro ângulos levantaram 34 candidatos, todos verificados; **10 defeitos
distintos** sobreviveram ao corte (8 CONFIRMED, 2 PLAUSIBLE), agrupando 24 dos
34. Ficaram de fora as sobras de qualidade pura.

**A tese:** duas famílias explicam quase tudo. A primeira é **check-then-write**
— guarda lida no pool, escrita sem reconferência dentro da transação — e ela
atinge quatro portas: cancelar contrato, criar com reserva, estornar avulso e o
PATCH. A segunda é **guarda que se desliga sozinha no nulo**, e atinge duas: a
prova de data do PATCH e o próprio portão E150.

## O dinheiro, medido

**K1 · O cancelamento lê as parcelas fora da transação** (`:943`, a leitura em
`:902`). Um recebimento que commita na janela vira PAGA, escapa do
`inArray(status, STATUS_ABERTO)` **e** de `idsComRecebimento`, e sobrevive ao
cancelamento com o dinheiro dentro. **Medido:** cancelamento com `destinoPago:
"estornar"` no mesmo segundo do Pix de R$ 700,00 → contrato CANCELADO com uma
parcela PAGA viva de R$ 700,00, que `entrouDinheiro` (`caixa.ts:82`) conta no
caixa realizado **para sempre** — enquanto a trilha grava `totalRecebido: 0`,
`totalEstornado: 0`. A loja devolveu R$ 700,00 que o caixa jura ter recebido, e
não há linha que explique.

**K3 · `CONTRATO_ATIVO_DUPLICADO` lido só no pool** (`:184`). O `FOR UPDATE` da
S-M7 (`:541`) só tranca bloqueios, e **nem roda quando `bloqueioIds` está
vazio**; não há unique em `contratos.lead_id` — o unique existe só em
`orcamento_id`. **Medido:** dois contratos ATIVOS de R$ 5.000,00 para a mesma
noiva, a ficha somando 2 × 10 × R$ 500,00 = **R$ 10.000,00 a receber sobre uma
venda de R$ 5.000,00**, com a comissão fechando sobre o dobro. É o estrago da
S-M3 entrando por outra porta.

**K7 · O estorno avulso não reconfere o status do contrato** (`:1201`) —
PLAUSIBLE. O UPDATE de `:1240-1243` reconfere o status da PARCELA e omite o do
CONTRATO. **Medido:** R$ 1.000,00 de sinal somem do caixa realizado e reaparecem
como cobrança aberta de uma venda morta — no horizonte, no aging e na régua de
cobrança da noiva.

## A peça prometida duas vezes

**K2 · A reconferência da S-M7 não relê `canceladoEm`** (`:543`). Ela relê só
`id` e só refaz a prova de `presosPorContratoAtivo`. **Medido:** o contrato nasce
201 preso a uma reserva morta; `verificarDisponibilidade` ignora bloqueios
cancelados e a EXCLUDE também; o mesmo vestido é vendido de novo no mesmo sábado
— **R$ 9.000,00 prometidos sobre uma peça**, descobertos na retirada. É
exatamente o defeito que a S-M24 declara fechado no comentário de `:317-322`.

**K4 · O E150 aceita bloqueio de MANUTENCAO como se fosse reserva** (`:444`).
`vestidosReservados` aceita bloqueio de QUALQUER tipo, e MANUTENCAO nasce sem
`casamentoData` (`reservas.ts:455-460`) — o que **desliga sozinha** a guarda de
data de `:412`. **Medido:** venda de R$ 4.000,00 satisfeita por uma janela de
manutenção de 01/03–05/03, e outra de R$ 4.000,00 com reserva legítima de 10/05
que não conflita com março. **Dois contratos, R$ 8.000,00, o mesmo vestido no
mesmo sábado — o dobro-prometido que o E150 existe para impedir.**

**K5 · A guarda de data do PATCH se desliga no nulo** (`:853`), e o PATCH nunca
chama `verificarDisponibilidade` — embora o comentário de `:826-834` afirme que
ele repete "as duas provas que o POST faz". O contrato passa a prometer 10/05 com
o envelope físico sem cobrir o dia.

## O gate, dito pelo próprio arquivo

**K6 · O 422 do E150 descreve a consequência e não diz a ação** (`:476`). A tela
só envia bloqueios `RESERVA_CASAMENTO` **com `leadId` da noiva**
(`orcamentos/[id].tsx:274-284`), e a peça costuma estar segura por bloqueio com
`lead_id` NULO — o caso que **o próprio arquivo mede em `:388-390`: 61 de 63** —
que `reservas.ts:512` continua permitindo criar. O diálogo manda
`bloqueioVestidoIds: []`, o POST responde 422, e a vendedora lê que a peça "não
tem reserva neste contrato" sem instrução nenhuma. **A venda aceita não fecha por
tela nenhuma.** É o A02.4 do ângulo da vendedora, agora com o número do próprio
código.

**K10 · O 409 `VESTIDO_INDISPONIVEL` é o único erro do arquivo sem `detalhe`**
(`:441`). Nenhum consumidor traduz o código: `MENSAGENS_ERRO`
(`orcamentos/[id].tsx:98-110`) não o lista e `POR_FAIXA` (`erro-api.ts:39-42`) só
cobre 401 e 403. Com a noiva na frente, a vendedora lê **"Tente novamente"** —
uma frase que manda repetir o gesto que vai falhar sempre. O payload `conflitos`,
que sabe a resposta, não é lido por tela nenhuma.

## Os dois restantes

**K8** (`:867`, PLAUSIBLE): o PATCH confere ATIVO no pool e o UPDATE não repete a
condição — contrato CANCELADO com dados alterados **depois** do cancelamento, e o
PDF imprimindo a data nova. O idioma de tranca já usado no DELETE de parcela
(`:1300-1304`) não foi aplicado aqui. **K9** (`:1359`): o número da parcela
avulsa é calculado em memória e a colisão vira o 409 genérico
`REGISTRO_DUPLICADO` — "Já existe um registro com estes dados", no meio de um
fluxo de dinheiro, que é literalmente o caso que `erros.ts:181-185` registra ter
sido lido como regressão financeira por dois minutos.

## O cruzamento

| Code review | Ângulo | O que muda |
|---|---|---|
| K3 (contrato duplicado) | A08.1 | Mesmo defeito, mesma medida — duas lentes independentes |
| K6 (422 sem ação) | A01.4 e A02.3 | Três lentes; o review achou o 61-de-63 dentro do próprio arquivo |
| K2 (`canceladoEm` não relido) | A08.2 | O ângulo viu os dois sentidos; o review provou por que a tranca não alcança |
| K10 (erro sem tradução) | A02.3 | O ângulo viu o schema sem o campo; o review viu o erro sem `detalhe` |

**K1, K4, K5, K7, K8 e K9 são novos** — seis de dez, a mesma proporção dos outros
dois alvos.

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

---

# Alvo 3 — `artifacts/api-server/src/routes/reservas.ts`

✅ **Feito.** 1.083 linhas, 30 agentes, 1,48 M tokens. Os quatro ângulos
levantaram 37 candidatos; a verificação **matou 1** e manteve 36, consolidados
em **10 defeitos distintos — todos de correção**. Nenhum de limpeza sobreviveu
ao corte: os de reuso e eficiência existiam, mas ficaram abaixo dos dez piores.

**A tese:** este arquivo guarda a peça que o contrato exige, e **quatro das suas
portas escrevem sem tranca** enquanto o `POST /contratos` tranca exatamente as
linhas que elas mexem (`contratos.ts:544`). A S-M22 fechou dez sítios de
check-then-write; **nenhum deles foi aqui**.

## As quatro corridas — todas com o mesmo desfecho medido

O desfecho é sempre o mesmo e vale escrever uma vez: **contrato ATIVO de
R$ 5.000,00 cobrando as 9 parcelas, com o vestido solto de volta ao mercado** —
porque o bloqueio soft-cancelado sai da disponibilidade (`disponibilidade.ts:409`)
E do EXCLUDE do banco (`WHERE cancelado_em IS NULL`), então outra noiva reserva
a MESMA peça para a MESMA data. **A dupla promessa só aparece na retirada.**

**R1 · Cancelar reserva não tranca as linhas de bloqueio** (`:157`). A contagem
de contratos ATIVOS que a S-M24 pôs roda sem tranca; o `POST /contratos` tranca
b1 e commita no meio; o cancelamento, que já leu zero, grava `canceladoEm` por
cima.

**R2 · O DELETE reconta com o `bloqueioIds` lido no POOL** (`:284`). O
`FOR UPDATE` da linha 330 tranca a reserva, mas o `POST /bloqueios` tranca a
linha do **vestido** (`:493`), nunca a da reserva — então o bloqueio nascido na
janela não é reconferido, `if (bloqueioIds.length)` pula a recontagem inteira, e
o `ON DELETE CASCADE` o leva junto. **A API responde 201 para quem criou e 204
para quem apagou**, e a auditoria grava `bloqueios: 0`.

**R3 · A propagação de data revalida sem `FOR UPDATE`** (`:213`). O POST e o
PATCH de bloqueio trancam a linha do vestido; esta porta não. O EXCLUDE só
compara envelopes FÍSICOS, e o par PROVA×FÍSICA passa sem 23P01.

**R4 · A transição de status é validada fora da transação** (`:119`).
CANCELADA é terminal (`TRANSICOES_RESERVA.CANCELADA = []`) e ainda assim vira
CONCLUIDA: as duas requisições leem CONFIRMADA, as duas são aprovadas, e a
segunda grava por cima. **A reserva fica CONCLUIDA com todos os vestidos soltos e
uma trilha dizendo que ela foi cancelada.**

## As seis guardas ausentes — não dependem de tempo

**R5 · `leadId` e `reservaId` provados só contra a loja** (`:450`). O bloqueio da
noiva B pendura na reserva da noiva A. Consequência de dinheiro: a linha 935
compara `bloqueioDaAvaria.leadId`, então **o reparo do vestido que A alugou só
pode ser cobrado no carnê de B** — e cobrá-lo em A devolve 422
`AVARIA_DE_OUTRA_NOIVA`. Mesma classe do S2/E107, que `escopo-loja.ts:127` já
documenta.

**R6 · O PATCH propaga `casamentoData` sem perguntar aos contratos ATIVOS**
(`:195`). O PDF e o portal seguem dizendo 10/05, a janela de 10/05 fica livre
para outra noiva, e o `PATCH /contratos` responde "mude a reserva primeiro" —
a reserva que já mudou. É a mesma divergência que `contratos.ts:414` e `:852`
recusam nas duas pontas.

**R7 · O POST de bloqueio aceita reserva CANCELADA** (`:517`). O bloqueio nasce
**invisível para a disponibilidade e visível para o EXCLUDE** — a tela mostra o
vestido livre, e o INSERT da próxima noiva morre em 23P01 com um 409 que não diz
qual reserva é. Sem saída a não ser apagar na mão. A S-M24 mandou estado
terminal ser terminal em toda porta; esta ficou de fora.

**R8 · O soft-cancel não toca em `atendimentos`** (`:182`). A prova segue
AGENDADA apontando bloqueio cancelado; a peça é alugada para outra e sai na
retirada; **a noiva chega para a prova e o vestido não está no ateliê**. E se
alguém concluir o atendimento, `agenda.ts:529-536` carimba `provaDataReal` num
bloqueio morto. Confirma o A05.2 do ângulo da costureira.

**R9 · `cobrar` lê o contrato no pool e insere a parcela depois** (`:891`). O
cancelamento em massa do contrato roda no meio, e a parcela de **R$ 480,00**
nasce fora dele: contrato CANCELADO com parcela viva no carnê, no aging e no
extrato do portal.

**R10 · Reservar exige `vestidos`; contratar exige `leads`** (`:428`). A
Recepção tem `leads` ver+criar e `vestidos` só ver
(`configuracao-inicial.ts:108`). Ela monta a venda, o contrato morre em 422
mandando reservar, ela clica em reservar e leva **403 ACESSO_NEGADO_MODULO** —
e nenhuma das duas mensagens diz que o problema é permissão. **É a prova em
código do que o ângulo 06 tinha deduzido pela tela.**

## O cruzamento

| Code review | Ângulo | O que muda |
|---|---|---|
| R10 (permissão cruzada) | A06.4 | O ângulo viu o botão gateado na tela; o review achou os dois `requireModulo` divergentes e o perfil que cai no meio |
| R8 (atendimento órfão) | A05.2 | Duas lentes, mesmo defeito — sobe de confiança |
| R5 (lead × reserva) | A05.3 e A06.5 | Três lentes; o review acrescentou a consequência de dinheiro da avaria |
| R1, R2, R3, R4 | A08.2 | O ângulo apontou um sentido; o review achou **quatro portas**, não uma |

**Seis são novos.** E o padrão que emerge dos dois alvos já lidos é um só: **as
varreduras anteriores (S-M7, S-M18/S-M22, S-M24) acertaram o padrão e erraram o
alcance.** Elas fecharam os sítios que enumeraram; o que ficou de fora da
enumeração continua aberto, e é sempre no mesmo lugar — a fronteira entre duas
rotas que mexem na mesma linha.

---

# As 4 fatias do `max` — disparadas em 2026-08-11, base `adf77c8`

Os três alvos de cima fecharam com **30 defeitos**. As quatro fatias rodam agora
sobre o fluxo inteiro, com o servidor ao lado da tela que fala com ele.

**A instrução que separa esta passada da anterior:** cada fatia foi mandada
caçar **o vão entre dois arquivos**, não o defeito dentro de um. Está escrito na
letra de cada prompt — "defeito que mora só dentro de um arquivo já foi
procurado antes; o que interessa aqui é o vão entre dois". É a regra 22 virada
em instrução de busca.

| Fatia | Run ID | Script |
|---|---|---|
| F1 · orçamento e aceite | `wf_f902dab2-254` | `code-review-wf_f902dab2-254.js` |
| F2 · contrato e dinheiro | ✅ **feita — 15 defeitos** | `code-review-wf_46e32def-6ea.js` |
| F3 · reserva e acervo | ✅ **feita — 15 defeitos** | `code-review-wf_e422fb0e-599.js` |
| F4 · agenda e atendimento | ✅ **feita — 15 defeitos** | `code-review-wf_be4aed57-907.js` |

Mesma regra de gravação: a seção de cada fatia é escrita assim que ela termina.
Retomada por run ID só vale nesta sessão.

## O placar até aqui — 89 achados de duas lentes

| Lente | Achados | Onde |
|---|---|---|
| 8 ângulos (ótica de papel) | 59 — 3 🔴, 26 🟠, 23 🟡, 7 🔵 | `achados/01..08` |
| 3 code reviews `high` | 30 — 26 correção, 4 limpeza | este arquivo |
| 4 fatias `max` | ⏳ rodando | este arquivo |

**A medida que mais importa para o método:** em cada um dos três alvos, **seis
dos dez defeitos eram novos** — invisíveis para os oito ângulos. E vários dos que
se repetiram só ganharam número, exemplo ou causa raiz quando a segunda lente
passou. Três vezes a mesma proporção não é coincidência: **a ótica de papel e a
leitura por dentro cobrem áreas diferentes**, e usar uma só teria deixado
metade do repositório sem olhar.

## O padrão único dos três alvos — e o que ele implica para o conserto

As varreduras anteriores (S-M7, S-M18/S-M22, S-M24) **acertaram o padrão e
erraram o alcance**. Escolheram a régua certa — relê sob tranca dentro da
transação; estado terminal é terminal em toda porta — e fecharam os sítios que
conseguiram enumerar. O que ficou fora da enumeração continua aberto, sempre no
mesmo lugar: **duas rotas que escrevem na mesma linha, e só uma toma a tranca.**

Consertar caso a caso repete o ciclo pela quarta vez. O que os três relatórios
sugerem é uma régua **enumerável e verificável por varredura**:

> Toda porta que escreve em `bloqueio_vestidos`, em `reservas` ou em
> `contratos` toma `FOR UPDATE` na linha do vestido e relê o que vai provar
> **dentro** da transação — e a varredura que conta as portas roda no CI, não na
> memória de quem revisa.

Isso é proposta, não decisão: entra no consolidado para a dona decidir.

---

# Fatia 4 — agenda e atendimento

✅ **Feita.** 6 arquivos, ~2.600 linhas, 49 agentes, 2,58 M tokens. **64 achados
verificados**, colapsados em **15 defeitos distintos**. É a maior colheita de
qualquer passada desta revisão — e a instrução de caçar o vão entre arquivos
explica por quê: **nove dos quinze só existem na fronteira.**

**A tese:** a régua de agendamento é **re-derivada em três lugares** — a tela do
dia, a tela de agendar e a rota — e **as três divergem**. Não há uma fonte da
verdade sobre quanto dura uma prova, quem segura uma cabine, ou que dia é hoje.

## As três réguas que discordam

**G8 · A tela do dia esquece `provaDuracao`** (`agenda/index.tsx:108`). Monta o
expediente com abertura, fechamento e `dias`, e **perde o quarto campo** — que a
rota (`agenda.ts:83-89`) e a tela irmã (`novo.tsx:299-310`) carregam do mesmo
GET. Toda prova vira 1 slot: a célula das 14:30 fica acesa, aceita o card, e o
servidor devolve 422 sobre um destino que a própria tela pintou como livre.
**A ironia está medida:** a loja SEM regra cai no `EXPEDIENTE_PADRAO`, que traz
`provaDuracao: 2` — **só a loja configurada erra.**

**G9 · A tela filtra `situacao`, o servidor não** (`novo.tsx:317`). A tela tira
CONCLUIDO e FALTOU das ocupadas; o servidor busca concorrentes sem olhar
situação. O slot aparece habilitado, o POST recusa — e **a grade do dia, na tela
ao lado, apaga a mesma célula.** Duas telas da mesma agenda dizendo coisas
opostas sobre o mesmo horário.

**G4 · A janela de busca usa uma duração e a régua usa outra** (`agenda.ts:113`).
`regra?.provaDuracao ?? 1` contra o expediente efetivo montado três linhas acima.
Loja sem regra: a janela é de 30 min, a ocupação é de 60 — **a prova das 14:10
fica fora do SELECT** e duas noivas entram na mesma cabine às 14:50, sem UNIQUE
que pegue.

**G11 · A semana é montada no fuso do navegador** (`semana.tsx:48`), enquanto os
atendimentos são recortados pelo dia da LOJA. Navegador em UTC às 02:00 de
segunda = 23:00 de domingo em São Paulo: **a semana corrente inteira não é
buscada**, e o botão "Esta semana" leva à seguinte. É a fronteira que sobrou da
S-M25, agora com o mecanismo inteiro.

## O que corrompe DADO, não tela

**G1 · Concluir uma prova carimba `provaDataReal` sem revalidar nada**
(`agenda.ts:531`) — e essa é exatamente a coluna que `PATCH /reservas` classifica
como "mudouJanelas" e protege com `FOR UPDATE` + `verificarDisponibilidade` +
409. O comentário da linha 527 justifica a ausência dizendo que colapsar janela
nunca cria conflito; **só é verdade se a data real cair dentro da janela
derivada, e o POST aceita a prova em qualquer dia.** Medido: prova de A concluída
em 14/10 sobrepõe a janela FÍSICA de B — o estado que a outra porta recusaria com
409, entrando por um UPDATE sem sequer a tranca do vestido.

**G2 · O `bloqueioId` é provado contra a loja, não contra a noiva**
(`agenda.ts:374`) — pareamento que **só o formulário garante**. Prova na ficha da
Ana com o vestido da Beatriz, e ao concluir, o carimbo cai **no bloqueio da
Beatriz**: a janela dela colapsa para um dia em que ela não provou nada, e a peça
é liberada antes da hora. Confirma o A05.3 e o A06.5 pelos dois lados.

**G3 · Trocar só a vendedora pula `recusaDeMover` inteiro** (`agenda.ts:463`).
`mudouMovimento` olha `inicio` e `cabineId` e nada mais — nem VENDEDORA_AUSENTE
nem VENDEDORA_OCUPADA são consultados. **A vendedora de férias recebe atendimento
com 200**, e a grade, que consulta a MESMA função com as ausências, nunca teria
aceitado.

**G5 · O `FOR UPDATE` tranca a cabine; o conflito de vendedora atravessa
cabines.** É o achado A06.2 dos ângulos, agora com a causa: a S-M22 fechou o eixo
da cabine e **deixou o eixo da vendedora vivo**.

## As perdas silenciosas

**G6 · Desativar uma cabine some com os atendimentos dela** (`grade.tsx:119` e
`semana.tsx:104`) — e o 409 do DELETE **recomenda exatamente isso**: "Desative-a
se ela saiu de uso". As 4 provas continuam no banco, continuam AGENDADO, as
noivas continuam recebendo confirmação, e **no dia ninguém vê que existem.**

**G10 · Mover um atendimento não zera `confirmadoEm`** (`agenda.ts:492`). A noiva
confirmou 14:00, a recepção arrastou para 17:00, e a tela segue contando "1
confirmou pelo portal". **Ninguém avisa a noiva, e ela chega às 14:00.** O mesmo
com `remarcacaoPedidaEm`, que fica na tela de Mensagens para sempre.

**G14 · A fila "Falta procurar" ignora `remarcacaoPedidaEm`** (`index.tsx:216`) —
re-deriva à mão a régua que já vive em `mensagens-do-dia.ts:65` e esquece o
terceiro fato. A recepção manda "confirme sua presença hoje às 14h" **para quem
avisou às 9h que não vem.**

**G12** (`agenda.ts:1065`): o PUT de regras aceita abertura 9 e fechamento 5 — a
validação existe só no formulário. A loja inteira para de agendar e **nenhuma
tela diz por quê.** **G13** (`index.tsx:252`): o botão de WhatsApp não tem gate de
permissão nem trata o 403 — a noiva é procurada, o contato não é gravado, e a
próxima pessoa procura de novo. **G15** (`grade.tsx:137`): o diálogo de reagendar
não passa por `recusaDeMover` — a doutrina do E27 invertida justamente para quem
usa teclado e celular, que é quem o diálogo foi criado para atender.

**G7** confirma o A06.3: o POST aceita `PROVA` sem `bloqueioId`, e o comentário
de `index.tsx:154-159` **diz que isso foi consertado** ao matar o diálogo antigo.
Foi consertado na tela; a rota nunca soube.

## O que esta fatia prova sobre o método

Nove dos quinze defeitos **não existem dentro de nenhum arquivo** — existem entre
dois. `provaDuracao` está certo na rota e certo em `novo.tsx`; o defeito é a
terceira cópia. O filtro de `situacao` está certo na tela; o defeito é o servidor
não concordar. A instrução de caçar a fronteira não foi retórica: **foi o que
achou dois terços do resultado.**

---

# Fatia 2 — contrato e dinheiro

✅ **Feita.** 5 arquivos, ~2.400 linhas, 48 agentes, 2,61 M tokens. **48 achados
verificados**, condensados em **15 defeitos distintos**. Três frentes: a corrida
do cancelamento, **o papel que o PDF imprime**, e o vão tela×servidor.

**O achado que muda o dia:** a fatia abriu uma frente que nenhuma lente anterior
tinha tocado — **o documento que a noiva assina**. Cinco dos quinze defeitos
estão no PDF, e o ângulo 07, que revisou o dinheiro inteiro e não achou um
centavo errado, não olhou o papel. A aritmética está certa; **o que se imprime
dela, não.**

## O PDF — cinco defeitos no documento assinável

**P11 · A partir de 15 parcelas, as assinaturas são desenhadas fora da página**
(`contrato-do-papel.ts:129`). Página única, MediaBox [0 0 595 842], sem quebra.
**Medido, replicando a aritmética:** contrato de R$ 9.000,00 em entrada + 18
parcelas = 19 linhas; "OBSERVACOES" cai em y=62, e as quatro linhas do bloco de
assinatura em **y=−15, −33, −59 e −77**. O PDF sai válido, abre normalmente, e
**não tem onde a noiva e a loja assinam**. Com 24 parcelas some a seção de
observações; com 36 somem seis linhas do próprio carnê. E `numParcelas` aceita
até 360 — o campo da tela oferece `max={360}`.

**P10 · Contrato CANCELADO imprime igual a um vivo** (`contratos.ts:775`). A
rota não filtra status e o montador descarta as parcelas CANCELADA — então some
a seção "Plano de pagamento" e **o papel parece um contrato à vista em aberto**,
sem uma palavra sobre o cancelamento. O botão "Baixar PDF" não é gated por
`contratoAtivo`.

**P12 · O plano impresso soma mais que o total impresso** (`:92`). O filtro só
descarta CANCELADA, então a parcela de avaria entra: **R$ 5.350,00 listados sob
"Valor total: R$ 5.000,00"**, sem nenhuma linha que reconcilie. E o PDF é
regerado do estado atual a cada download — **o contrato assinado por R$ 5.000,00
passa a imprimir R$ 5.350,00 depois da avaria.**

**P14 · O sinal de menos do desconto vira "?"** (`:125`). O montador escreve
U+2212; o desenhista só sabe WinAnsi e troca todo codePoint > 255 por `?`. Sai
**«Desconto: ?R$ 500,00 (10%)»** — em TODO contrato com desconto, nos dois
chamadores (loja e portal). O abatimento fica sem sinal, lido como mais uma
cobrança.

**P13 · A observação some a partir de ~95 caracteres** (`:134`). Uma linha de
`Tj` em x=50, sem quebra: os caracteres finais são desenhados fora da página, e
o `\n` digitado não vira quebra visual — as frases colam. No exemplo medido, o
que fica de fora é **a multa de R$ 150,00 por dia de atraso**.

## A corrida do cancelamento, e o dinheiro que não volta

**P1** (`:902`) é o K1 do review anterior visto com mais alcance: `parcelasAntes`
lido no pool decide quem tem recebimento. **Medido:** R$ 2.000,00 recebidos na
janela ficam PAGOS e vivos no caixa, a trilha grava `totalEstornado` sem eles, **e
não há volta — `POST /estornar` exige contrato ATIVO.** O dinheiro que a loja
declarou ter devolvido soma receita para sempre.

**P3 · Cancelar não desfaz `contratoFechadoEm` nem a etapa** (`:927`). A curva de
sazonalidade (`leads.ts:432`) filtra por essa coluna: **a venda cancelada segue
contada como fechada**, e a curva que diz à dona em que mês vai faltar vestido
superestima a demanda. A noiva também fica no kanban em CONTRATO_FECHADO sem
contrato nenhum.

**P2 · A renumeração do `gerar-plano` obsoleta o `numero` da trilha** (`:1470`).
A parcela PAGA de R$ 350,00 é movida de 1 para 11, e a auditoria continua dizendo
"parcela 1" — **quem conferir o caixa pela trilha casa o recebimento com a linha
errada**, que é exatamente o oposto da razão declarada de a trilha existir.

## O vão tela × servidor

**P6 · "Remover" oferecido em parcela PARCIAL** (`[id].tsx:536`). A tela usa
`estaAberta` (PREVISTA + PARCIAL); o servidor só aceita PREVISTA. O toast diz
**"Só parcelas em aberto podem ser removidas" sobre uma parcela que ESTÁ em
aberto** — uma contradição literal, sem gesto possível.

**P7 · Parcela removida do carnê não tem volta.** O plano passa a somar
R$ 4.500,00 de R$ 5.000,00, o alerta acende, `temCarne` segue true e o servidor
responde 409 JA_TEM_PLANO para sempre. **Não existe gesto nenhum na aplicação que
devolva os R$ 500,00.**

**P8 · O alerta de divergência grita em todo contrato com avaria** (`:196`) —
soma AVULSA e AVARIA e compara com `valorTotal`, num estado que o servidor
considera correto. **O alarme que existe para denunciar carnê corrompido deixa de
ser lido justamente quando a divergência for verdadeira.**

**P9** é o K10 do review de `contratos.ts` reconfirmado por outra passada, agora
com a prova de ausência: `grep conflitos` em `artifacts/moscow-noivas/src` **não
devolve um único sítio**.

**P4 e P5** são dois 500 que deveriam ser 422: o estorno perdedor faz
`parse(undefined)` e a vendedora lê "Não consegui falar com o sistema" numa ação
que já tinha acontecido; e `numParcelas: 2.5` sobe uma exceção não tratada — **a
única validação do carnê que não devolve 422**.

**P15** fecha a fatia com o defeito mais silencioso: `descontoValor === 0` é "sem
desconto" para a régua do dinheiro e "com desconto" para o papel e para a tela.
**O mesmo registro, dois arquivos, duas respostas.**

---

# Fatia 3 — reserva e acervo

✅ **Feita.** 5 arquivos, ~2.400 linhas, 61 agentes, 3,10 M tokens — a maior
passada da revisão. **65 achados verificados**, colapsados em **15 defeitos**.

**A tese:** a avaria — o dinheiro que a loja cobra quando a peça volta danificada
— **não fecha por caminho nenhum**. Três defeitos independentes a bloqueiam em
pontos diferentes, e cada um sozinho já bastaria.

## A avaria: cobrada em 3% dos casos, e nem sempre

**V1 · A foto é barrada em 100 KB, não nos 2 MiB anunciados** (`reservas.ts:834`).
`app.ts:64` monta `express.json({limit:"6mb"})` **só** na rota de foto de vestido;
o resto cai no `express.json()` padrão. **Medido:** o teto real é ≈75 KiB, e a
foto de celular tem 1,5 MB — **20× o limite**. O cliente autoriza 2 MiB, o
servidor declara 2 MiB, e os dois mentem por **27×**. O 422 `FOTO_MUITO_GRANDE`
da linha 834 é código morto. E a suíte é verde porque o único teste manda um PNG
1×1 de **70 bytes**.

**V14 · Sem `leadId` no bloqueio, a tela não oferece cobrar**
(`[bloqueioId].tsx:111`). `useListContratos` roda com `enabled: !!reserva?.leadId`.
E o servidor mede, na própria letra (`reservas.ts:920-929`), que **61 das 63
avarias do banco vivem em bloqueio sem noiva**. A rota cobraria; a única tela que
expõe a cobrança não desenha o botão. **O reparo nunca vira parcela em 97% das
avarias do banco.**

**V2 · A tela decide "já cobrada" por `parcelaId`, o servidor por `cobrancaViva`**
(`[bloqueioId].tsx:705`) — e o payload nem carrega o status da parcela. Contrato
cancelado, parcela do reparo CANCELADA junto: o servidor **volta a aceitar**
cobrar e remover; a tela mostra "Cobrado — ver parcela" para sempre e esconde os
dois botões. **R$ 800,00 que não entram no carnê novo, e uma avaria impossível de
limpar.** O ciclo sem saída que `reservas.ts:765-788` diz ter sido fechado
continua fechado do lado do cliente.

**V3 · `AVARIA_DE_OUTRA_NOIVA` compara só o `leadId` nulável** (`:931`) e nunca
cai para `reservaId → reservas.lead_id`, que é NOT NULL. **O dono existe e não é
perguntado:** R$ 1.500,00 de reparo caem no carnê da noiva B por um dano que ela
não causou, e o extrato do portal dela mostra a cobrança.

**V11 e V15** fecham o cerco: duas cobranças simultâneas colidem na UNIQUE e a
perdedora lê **"Já existe um registro com estes dados"** — que se lê como "já
cobrei este reparo", então a vendedora para de tentar e **os R$ 500,00 da segunda
avaria nunca entram**. E o `DELETE /avarias` é o único DELETE do arquivo sem
`FOR UPDATE`: a avaria some enquanto a cobrança nasce, deixando **parcela viva de
R$ 1.500,00 sem foto, sem descrição e sem avaria que a sustente** — o cenário
literal que o cabeçalho do E97/F23 diz existir para impedir.

## O `casamentoData` que ninguém consegue corrigir

**V5 · A data do casamento do bloqueio é gravada uma vez e nunca mais muda**
(`:551`). O `UpdateBloqueioBody` não tem o campo; a única porta que a altera exige
`bloqueio.reservaId` — e **nenhum cliente do repositório escreve esse vínculo**:
`novo.tsx:260-267` omite `reservaId`, e `useCreateReserva`/`useUpdateReserva` têm
**zero chamadores** em `artifacts/` e `e2e/`. **Medido:** a noiva muda o casamento
de 12/09 para 03/10, a ficha passa a dizer 03/10, o bloqueio fica em 12/09 para
sempre. O vestido fica bloqueado na semana errada e **LIVRE na semana do
casamento de verdade** — outra noiva o reserva sem conflito nenhum.

**V12 · `casamentoData: null` vira 01/01/1970** (`:191`). `.optional()` só
curto-circuita em `undefined`; `new Date(null)` é uma data válida. O casamento
some da lente "Reservas" e reaparece sob **"janeiro de 1970"**, com o vestido
liberado no calendário para a data real.

## As telas que oferecem o que não existe

**V7 · A ficha nunca lê `canceladoEm`** (`:507`). O livro de reservas esconde o
item cancelado, mas `provas/`, `ajustes/` e `ajustes/[ajusteId]` **continuam
linkando para a ficha**, que desenha "Vestido ainda no ateliê" e o botão
"Registrar retirada". **A peça sai do ateliê para uma noiva cuja reserva a loja
cancelou** — enquanto a disponibilidade já a anuncia livre para outra.

**V6 · Os três campos de movimentação nascem preenchidos com a data do
CASAMENTO** (`:253`) — inclusive devolução e volta da lavanderia, que são sempre
posteriores a ela. Um clique sem tocar no campo grava `lavagemConcluidaEm`
**anterior ao início da lavagem**, e pela régua de `disponibilidade.ts:259` **a
janela de lavagem deixa de existir**: o vestido fica disponível enquanto está na
lavanderia.

**V15 · O botão "Registrar avaria" não faz nada para quem tem `editar` sem
`criar`** (`:1103`) — perfil que `permissoes.ts:98` documenta como "válido e
comum". O `getElementById(...)?.scrollIntoView` engole a chamada, o diálogo fecha,
a página não se move um pixel, e **nenhum toast explica**. O F25 existe justamente
porque "passado esse momento o vestido já voltou para a arara".

## As corridas que faltavam

**V10** (`:111`): o PATCH de reserva é a única rota de escrita do módulo que **não
tranca nada** — duas transições partem do mesmo status e a reserva fica CONFIRMADA
com todos os bloqueios cancelados. **V8** (`:280`) é o R2 do review anterior com
o mecanismo completo. **V13** (`:292`): o DELETE de reserva ignora a coluna legada
`contratos.bloqueio_vestido_id` que o DELETE irmão conta **de propósito** — o
contrato fica com o vínculo nulo e **as parcelas seguem sendo cobradas** sobre um
vestido que voltou ao mercado.
