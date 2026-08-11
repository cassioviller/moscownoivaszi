# Ângulo 3 — transacao
**Rodada 2, base 89b38c8** · localizador + cético por achado

O ângulo caçou a forma check-then-write — a guarda lida no pool e a escrita na
transação sem reconferir — e a escrita multi-tabela sem transação. **Oito
achados sobreviveram ao cético: sete 🟡 e um 🔵.** Sete dos oito são sítios da
mesma família da S-M7, e por isso **enumeram a S-M18** em vez de abrir sobra
nova. Nenhum achado foi refutado.

## Sobreviventes

### 1. 🟡 DELETE /contas-pagar lê a guarda de PAGA no pool e apaga na transação sem reconferir — o pagar concorrente deixa uma saída órfã no caixa

**Âncora:** `artifacts/api-server/src/routes/financeiro.ts:426` · **enumera S-M18**

A linha 379 recusa apagar conta PAGA — `res.status(409).json({ error:
"CONTA_JA_PAGA", detalhe: "Estorne o pagamento antes de remover a conta" })` —
mas o SELECT que sustenta a recusa roda no pool (linha 373). O
`db.transaction` das linhas 425-426 então executa `tx.delete(contasPagarTable)`
por id, sem filtro de status e sem reler. E `pagamento_itens.conta_pagar_id` é
`{ onDelete: "cascade" }` (`lib/db/src/schema/financeiro.ts:142`).

**Mecanismo.** Entre o SELECT do pool e o `tx.delete` cabe um POST
`/contas-pagar/:id/pagar` inteiro. O pagar commita (pagamento + pagamento_item
+ status PAGA via `quitarContas`, linhas 292-326); o DELETE apaga a conta
incondicionalmente — o `pagamento_item` cai pela cascata da FK, e o
`pagamento`, que não referencia a conta, fica. O invariante que o próprio
arquivo declara na linha 276 — `sum(itens.valor) === pagamento.valorPago` —
quebra, e o estorno do pagamento (linha 531: `contaIds =
pagamento.itens.map(...)`) não restaura nada, porque os itens já não existem.
O conserto é o da S-M7: reler a conta com `FOR UPDATE` dentro da transação e
recusar se PAGA.

**Consequência.** Conta de R$ 500,00 paga e apagada no mesmo segundo: o caixa
realizado fica com uma saída de R$ 500,00 sem contrapartida em conta nenhuma,
o DRE conta uma despesa que não aponta obrigação, e o caminho de desfazer
(estornar o pagamento) devolve zero contas — o rastro dos R$ 500,00 está
quebrado dos dois lados.

**Cético.** Confirmado, âncoras conferidas neste run: a guarda roda no pool
(financeiro.ts:373-382), o `tx.delete` (linha 426) apaga por id, a FK é
cascade. Não há guarda noutra camada — o comentário das linhas 366-368 declara
o invariante mas nada o impõe sob concorrência. Não é duplicata: S-M16
(`c4ee0ad`) não tocou financeiro.ts e S-M7 (`75882f0`) consertou outro sítio.
Exemplo numérico refeito: `valorPago=500` e `sum(itens)=0`. Correção menor: o
estorno ainda apaga o pagamento órfão (linha 538), então existe caminho de
limpeza — mas nada sinaliza o órfão. Gatilho raro, dano real: **🟡 confirmada.**

### 2. 🟡 DELETE /parcelas lê PREVISTA no pool e apaga na transação sem reconferir — o recebimento concorrente é deletado junto e o dinheiro some do caixa

**Âncora:** `artifacts/api-server/src/routes/contratos.ts:1262` · **enumera S-M18**

As linhas 1231-1233 recusam a parcela não-PREVISTA (`PARCELA_NAO_PREVISTA`,
422), mas a leitura é do pool (SELECT na linha 1225). A linha 1262 executa
`tx.delete(parcelasTable).where(eq(parcelasTable.id, existente.id))` — sem
filtro de status. O receber da mesma parcela (linhas 1082-1095) tem CAS, mas o
CAS protege o receber, não este delete.

**Mecanismo.** A vendedora clica em remover a parcela enquanto a recepção
lança o recebimento dela. O POST `/parcelas/:id/receber` commita primeiro — o
CAS casa, a parcela vira PAGA com `valorRecebido` gravado e trilha
PARCELA_RECEBIDA. O DELETE, que já tinha lido PREVISTA no pool, entra na
transação e apaga a linha sem recondicionar o WHERE ao status. A forma do
conserto está DUAS linhas de rota acima no mesmo arquivo: o estorno (linhas
1193-1196) condiciona o UPDATE a `inArray(status, ["PAGA","PARCIAL"])` e trata
zero linhas — bastava o delete exigir `status = 'PREVISTA'` e responder 409
quando não casar.

**Consequência.** Parcela de R$ 500,00 recebida e apagada na mesma janela: os
R$ 500,00 entraram na gaveta, a trilha diz PARCELA_RECEBIDA e
PARCELA_REMOVIDA (esta só com o valorPrevisto), e o caixa realizado — que soma
parcelas com `recebidoEm` — perde a linha. Dinheiro físico presente, sistema
dizendo que nunca entrou.

**Cético.** Confirmado: contratos.ts:1225 lê no pool, 1231-1233 checa fora da
transação, 1262 deleta só por id — a transação (linha 1247) não reconfere
nada. Constraint nenhuma bloqueia DELETE por status, e o S-M16 (`c4ee0ad`)
consertou itens-estoque/ajustes, não este sítio. O idioma do conserto está
literalmente em 1193-1201. Conta refeita e fechada. Sítio legítimo da S-M18:
**🟡 confirmada.**

### 3. 🟡 Reabrir fechamento de comissão lê "conta PAGA?" no pool e apaga a conta na transação sem reconferir — o pagamento concorrente da comissão fica órfão

**Âncora:** `artifacts/api-server/src/routes/comissao.ts:998` · **enumera S-M18**

As linhas 975-986 leem o status da conta do fechamento no pool e respondem 409
`COMISSAO_JA_PAGA` se PAGA. As linhas 998-1001 executam
`tx.delete(contasPagarTable)` incondicional, dentro da transação.

**Mecanismo.** A guarda que o comentário da rota chama de "a guarda que
protege o dinheiro" (linha 952) é lida no pool global. Entre ela e o
`tx.delete` cabe o POST de pagamento que quita a conta da comissão
(`quitarContas`). O pagamento commita; o reabrir então apaga o fechamento e a
conta — a cascata de `pagamento_itens.conta_pagar_id` leva o item, e a saída
fica sem contrapartida, exatamente o estado que a guarda existe para impedir
("reabrir deixaria uma saída de caixa sem contrapartida", linha 953). O
conserto é reler a conta com `FOR UPDATE` dentro da transação e recusar se
PAGA — a forma da S-M7/S33.

**Consequência.** Comissão de R$ 800,00 da vendedora: o financeiro paga
enquanto o admin reabre o fechamento. Ficam no banco uma saída de R$ 800,00
sem conta e sem fechamento, os contratos com `comissaoEstornadaEm` resetado, e
a competência reaberta — o próximo fechamento gera conta NOVA de R$ 800,00 e a
loja paga a mesma comissão duas vezes: R$ 1.600,00 saem por R$ 800,00 devidos.

**Cético.** Confirmado com âncoras lidas neste run: guarda no pool
(comissao.ts:975-986), `tx.delete` incondicional (998-1001), sem `FOR UPDATE`
nem reconferência. Nenhuma outra camada fecha a janela: `quitarContas`
(financeiro.ts:292-326) também não trava a linha e sua própria guarda é
check-then-write no pool (339-348); e o schema agrava — a FK é `onDelete:
"cascade"` (`lib/db/src/schema/financeiro.ts:142`), então o banco apaga o item
calado em vez de RESTRICT, quebrando o invariante declarado em
financeiro.ts:276. Não é duplicata: `c4ee0ad` só tocou DELETE /comissao/regras
neste arquivo, e nenhum commit em `89b38c8..HEAD` toca comissao.ts. Correção
ao texto: a saída órfã ainda é estornável por pagamentoId (financeiro.ts:518),
só não por conta. **🟡 mantida.**

### 4. 🟡 POST e PATCH de bloqueios verificam disponibilidade no pool e escrevem sem tranca — a corrida PROVA×FÍSICA passa por baixo do EXCLUDE, que só cobre o envelope físico

**Âncora:** `artifacts/api-server/src/routes/reservas.ts:390` · **enumera S-M18**

As linhas 390-399 chamam `verificarDisponibilidade({...})` sem `executor` —
roda no pool; a linha 403 faz `db.insert(bloqueioVestidosTable)` sem transação
nem `FOR UPDATE`. O cinto do banco (`lib/db/scripts/apply-sql-extras.ts:43-47`)
é `EXCLUDE USING gist (vestido_id WITH =, daterange(ocupacao_inicio,
ocupacao_fim, '[]') WITH &&)` — e `ocupacaoFisica`
(`artifacts/api-server/src/lib/disponibilidade.ts:316-321`) filtra `classe ===
"FISICA"`: a janela de PROVA não entra no envelope. O PATCH (linhas 490-508)
tem a mesma forma.

**Mecanismo.** Duas vendedoras criam bloqueios do mesmo vestido no mesmo
segundo: reserva B com casamento 2026-10-10 e reserva A com casamento
2026-10-25. Pela régua default, a PROVA de A é [11/10..21/10] e a FÍSICA de B
é [07/10..19/10] (uso+lavagem) — `conflitos()` acusa, e o caminho sequencial
responde 409 VESTIDO_INDISPONIVEL. Concorrentes, cada
`verificarDisponibilidade` no pool não vê o INSERT não-commitado da outra; e o
EXCLUDE compara só os envelopes físicos — A [22/10..03/11] e B [07/10..19/10]
são disjuntos — então NENHUM dos dois dispara 23P01 e os dois commitam. Fica
gravado um par que a própria régua da casa declara conflitante.

**Consequência.** A prova da noiva A fica marcada para os dias em que o
vestido está na rua com a noiva B (ou na lavanderia) — a noiva chega ao ateliê
e a peça não está na arara. É o mesmo estado que o 409 VESTIDO_INDISPONIVEL
existe para impedir, materializado só quando os dois cliques se cruzam.

**Cético.** Confirmado no código lido: reservas.ts:390-403 (POST) e 490-508
(PATCH) fazem check-then-write no pool, e o EXCLUDE cobre só o envelope físico
— `ocupacaoFisica` filtra classe FISICA enquanto `conflitos()`
(disponibilidade.ts:296-300) acusa PROVA×FISICA. Exemplo numérico refeito com
REGRA_DEFAULT (14/3/2/7) e bate. Não é duplicata: S-M7 (`75882f0`) só tocou
contratos.ts; o teste de corrida existente (lote17:143-181) usa a MESMA data
de casamento, caso em que o EXCLUDE decide — o par de envelopes disjuntos não
tem backstop nem teste. Correção de âncora: o caminho correto do helper é
`artifacts/api-server/src/lib/disponibilidade.ts`, não `lib/disponibilidade.ts`.
**🟡 confirmada.**

### 5. 🟡 POST/PATCH de atendimentos: a recusa de cabine ocupada é lida no pool e a UNIQUE só cobre o instante exato — a sobreposição multi-slot do E40 não tem cinto nenhum sob concorrência

**Âncora:** `artifacts/api-server/src/routes/agenda.ts:353` · **enumera S-M18**

As linhas 353-367 chamam `recusaDeMoverAtendimento(lojaId, {...}, {})` e a
linha 369 faz `db.insert(atendimentosTable)` — leitura e escrita no pool, sem
transação. O próprio helper admite a janela (linhas 63-65): "entre este SELECT
e o UPDATE cabe outra requisição. Quem segura de verdade continua sendo a
UNIQUE (cabine, inicio)". Mas a UNIQUE é `unique().on(t.cabineId, t.inicio)`
(`lib/db/src/schema/atendimentos.ts:130`) — instante EXATO — e o E40 fez o
conflito ser de INTERVALO (linhas 97-99: "uma prova ocupa vários slots, então
o conflito não é mais só do instante exato").

**Mecanismo.** O comentário da rota (linhas 347-350) descreve o defeito
sequencial que o E115 fechou: "uma prova às 17h30 ocupava a cabine até 19h e o
POST às 18h respondia 201". A versão concorrente dele continua aberta: a prova
das 17h30 e o atendimento das 18h00 na mesma cabine, postados no mesmo
segundo, têm `inicio` DIFERENTES — a UNIQUE não casa — e cada
`recusaDeMoverAtendimento` no pool não vê o INSERT não-commitado do outro. Os
dois respondem 201. A afirmação da linha 64 era verdadeira antes do E40 e
deixou de ser; nenhum EXCLUDE de intervalo existe para atendimentos.

**Consequência.** Duas noivas na mesma cabine no mesmo horário: a prova das
17h30 ainda está em curso quando a das 18h00 chega. A grade desenha as duas
células e a recepção descobre com as noivas na porta — o defeito que o E115
mediu e fechou no caminho sequencial, reaberto pela janela de concorrência.

**Cético.** Confirmado: agenda.ts:353-369 (POST) e :418 (PATCH) fazem
check-then-insert no pool; a UNIQUE é (cabineId, inicio) — instante exato — e
o próprio agenda-core admite em mover.ts:195-198 que a sobreposição de
intervalo do E40 é só pré-checagem ("As UNIQUE do banco ainda são a garantia
do instante exato"). O único EXCLUDE de intervalo do sistema é o de
bloqueio_vestidos (apply-sql-extras.ts:33-51); nenhum existe para
atendimentos. O lote17 (specs das linhas 80-141) só corre colisões de MESMO
inicio — o caso prova 17h30 × atendimento 18h00 sob concorrência não tem teste
nem cinto de banco. Sítio da S-M18: **🟡 mantida.**

### 6. 🟡 DELETE e PATCH de orçamento leem a guarda de APROVADO no pool — o aceite público concorrente commita e o comprovante da noiva é destruído (ou o líquido aceito muda)

**Âncora:** `artifacts/api-server/src/routes/orcamentos.ts:330` · **enumera S-M18**

As linhas 330-336 recusam apagar o APROVADO — `res.status(409).json({ error:
"ORCAMENTO_APROVADO", detalhe: "O aceite da noiva (versão e hash) mora neste
orçamento — ele não se apaga." })` — mas o status foi lido no pool (linha
323); a linha 357 faz `tx.delete(orcamentosTable)` incondicional. Mesma forma
no PATCH: guarda de desconto em APROVADO nas linhas 274-283, `tx.update`
incondicional na linha 290. O aceite
(`artifacts/api-server/src/lib/aceite-orcamento.ts:28-41`) é um CAS que seta
APROVADO por link público, sem sessão.

**Mecanismo.** A noiva aceita pelo link público no instante em que a vendedora
apaga (ou repactua o desconto de) o orçamento ENVIADO. O aceite commita
primeiro — CAS em `aceitoEm IS NULL`, status vira APROVADO, versão e hash
carimbados. O DELETE, que leu ENVIADO no pool, entra na transação e apaga a
linha sem reconferir: `orcamento_versoes` — onde mora a versão CONGELADA e o
hash que a noiva acabou de aceitar (comentário das linhas 316-318) — cai em
cascata. No PATCH, o desconto muda o líquido de um orçamento que JÁ FOI
aceito. O conserto é condicionar o delete/update a `status <> 'APROVADO'` no
próprio WHERE e tratar zero linhas, o idioma que o repositório já usa no
receber (contratos.ts:1082).

**Consequência.** A noiva tem a tela dizendo "aceito em 10/08 às 14h02" e o
ateliê não tem mais o documento: versão, hash e trilha do quê foi aceito
sumiram com a cascata. Num desacordo sobre valor — um orçamento de R$ 5.000,00
com desconto repactuado no mesmo segundo do aceite — não existe mais o
registro congelado que o E74/E75 criou exatamente para esse desacordo.

**Cético.** Confirmado com leitura direta: guarda fora da transação, WHERE sem
recondicionamento de status (delete linha 357, update linha 290). O escritor
concorrente existe e é sem sessão: o CAS do aceite roda via link público
(orcamentos-publico.ts:97) e portal (portal.ts:355). A destruição é real:
`lib/db/src/schema/orcamentos.ts:89` tem onDelete cascade em
orcamento_versoes, levando versão e hash aceitos. Não há guarda noutra camada
e não é duplicata de S-M16 nem S-M7. Correção de âncora: o caminho do helper é
`artifacts/api-server/src/lib/aceite-orcamento.ts`, não
`lib/aceite-orcamento.ts`. Gatilho raro, mas quando dispara destrói o
comprovante do E74/E75: **🟡 confirmada.**

### 7. 🟡 Os DELETEs de reserva e de bloqueio contam a história no pool e apagam na transação sem recontar — o registro nascido na janela cai na cascata que a guarda existe para impedir

**Âncora:** `artifacts/api-server/src/routes/reservas.ts:265` · **enumera S-M18**

As linhas 229-248 rodam as três contagens (avarias, `vinculosAtivos` de
contratos ATIVOS, atendimentos) em `db.select` no pool; a linha 250 decide o
409; as linhas 265-276 abrem `db.transaction` e fazem
`tx.delete(reservasTable)` sem reconferência. DELETE de bloqueio idêntico:
contagens nas linhas 542-557, `tx.delete` na 583. (A mesma forma está no
DELETE de cabine da S-M1, agenda.ts:268-289.)

**Mecanismo.** Entre a contagem no pool e o `tx.delete` cabe um POST inteiro:
uma avaria registrada com foto-prova, uma prova agendada, ou o POST /contratos
prendendo o bloqueio — o `FOR UPDATE` da S-M7 tranca a linha do bloqueio, mas
o DELETE do bloqueio serializa DEPOIS dele e segue apagando: o vínculo
recém-commitado cai pela cascata de `contrato_bloqueios`. A guarda viu zero e
o 204 sai com a cascata levando o que nasceu na janela — exatamente o dano que
o E115 mediu. O conserto é recontar dentro da transação após `FOR UPDATE` na
linha-pai, a forma da S33.

**Consequência.** O contrato ATIVO fica sem vínculo com a peça — o vestido da
noiva volta a aparecer disponível e pode ser prometido de novo; ou a avaria
com a foto-prova de um reparo já cobrado some, deixando a parcela da cobrança
sem o documento que a sustenta. Gatilho raro (duas ações no mesmo segundo),
dano idêntico ao que motivou as guardas.

**Cético.** Âncoras conferidas neste run: contagens no pool
(reservas.ts:229-248; bloqueio 542-557), `tx.delete` (275/583) sem recontagem.
Nenhuma guarda noutra camada: os quatro FKs da cascata são onDelete cascade
(atendimentos.ts:69,88; avarias.ts:30; contratos.ts:107), nenhum RESTRICT — o
filho commitado na janela cai em silêncio, e READ COMMITTED não bloqueia o
delete do pai. Não é duplicata: S-M16/E115 criaram estas guardas (o achado é a
janela que elas deixaram), S-M7 fechou o check-then-write da CRIAÇÃO de
reserva, sítio diferente. **🟡 confirmada.**

### 8. 🔵 PATCH /atendimentos escreve em duas tabelas fora de transação — o carimbo de provaDataReal pode não acompanhar a conclusão da prova

**Âncora:** `artifacts/api-server/src/routes/agenda.ts:477` · **sem sobra — achado próprio do ângulo**

As linhas 459-462 fazem `db.update(atendimentosTable)` no pool. As linhas
476-482 — `if (parsed.data.situacao === "CONCLUIDO" && existente.tipo ===
"PROVA" && existente.bloqueioId)` — fazem um segundo
`db.update(bloqueioVestidosTable).set({ provaDataReal: ... })` independente,
também no pool, sem transação envolvendo os dois.

**Mecanismo.** Concluir uma PROVA é uma operação de duas escritas: a situação
no atendimento e o colapso da janela no bloqueio (E37: "a conclusão do
atendimento é a fonte da verdade"). As duas rodam como statements
independentes: se o processo cai ou o segundo UPDATE falha entre elas, o
atendimento fica CONCLUIDO com a janela de prova do bloqueio inteira — até 14
dias de ocupação PROVA que já aconteceu. O erro é conservador (ocupação a
mais, nunca a menos — o comentário das linhas 474-475 nota que colapsar só
reduz), por isso 🔵 e não 🟡: é a única escrita multi-tabela sem transação que
a varredura do ângulo encontrou, e o conserto é envolver as duas num
`db.transaction` como o resto do arquivo já faz.

**Consequência.** Uma prova concluída na segunda-feira segue ocupando a agenda
de disponibilidade do vestido até a data prevista — a vendedora vê
"indisponível" num vestido cuja prova já aconteceu, e a data que o E37 quis
liberar continua presa até alguém editar a reserva à mão.

**Cético.** Evidência conferida em agenda.ts:459-462 e 476-483 — dois UPDATEs
no pool sem transação, num arquivo que usa `db.transaction` em 278/526/869;
disponibilidade.ts:200-201 confirma que sem `provaDataReal` a janela PROVA
inteira segue ocupando. Não é duplicata (S-M7/S-M18 são check-then-write; isto
é write+write). Fica de pé como 🔵: erro conservador, gatilho é queda do
processo entre dois awaits, e autocorrigível — a condição da linha 476 testa
`parsed.data` e não a transição, então reenviar o PATCH CONCLUIDO reexecuta o
carimbo, e a edição manual da reserva também grava `provaDataReal`.
**🔵 confirmada.**

## Refutados

Nenhum achado do ângulo foi refutado — os oito que o localizador levantou
passaram pelo cético com âncora reconferida e severidade mantida.

| Título | Âncora | Refutação do cético |
|---|---|---|
| — | — | — |

## Cobertura

**Teto de 10 achados NÃO atingido: 8 achados, nada cortado.**

Notas do localizador — o que foi conferido e NÃO virou achado:

1. **O handler central de erros** (`artifacts/api-server/src/lib/erros.ts:190-246`)
   traduz 23505→REGISTRO_DUPLICADO, 23503→VINCULO_EXISTENTE,
   23P01→CONFLITO_DE_DISPONIBILIDADE e 40P01/40001→OPERACAO_CONCORRENTE,
   caminhando a cadeia de `cause` — nenhum 23505 cru vazando foi encontrado.
   Os dois try/catch locais (comissao.ts:1169, equipe.ts:334) traduzem para
   códigos ainda mais específicos.
2. **O idioma CAS** (UPDATE condicional ao estado lido) já protege os sítios
   de dinheiro mais quentes: receber parcela (contratos.ts:1082-1095, B6),
   estornar (1193-1196, S6), aceite de orçamento (lib/aceite-orcamento.ts:40),
   confirmar/remarcar do portal (portal.ts:414, 508-511), convite
   (equipe.ts:334) e fechamento de comissão (comissao.ts:1180-1195 lê tudo
   dentro da tx + unique).
3. **O duplo-pagar concorrente de conta a pagar** é segurado pela UNIQUE de
   `pagamento_itens.conta_pagar_id` (`lib/db/src/schema/financeiro.ts:142`) —
   o perdedor leva 409 REGISTRO_DUPLICADO genérico em vez de CONTA_JA_PAGA,
   custo de clareza que não virou achado por ser 🔵 de mensagem, não defeito
   de dado.
4. **POST /contratos** carrega o conserto da S-M7 (contratos.ts:534-549) e não
   foi reaberto.
