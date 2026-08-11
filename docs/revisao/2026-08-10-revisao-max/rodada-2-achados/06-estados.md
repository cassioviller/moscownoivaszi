# Ângulo 6 — estados

**Rodada 2, base 89b38c8** · localizador + cético por achado

Cinco achados sobreviveram ao cético; nenhum foi refutado, mas dois desceram de
🟠 para 🟡 pelo mesmo fato medido: a tela não oferece o gatilho, só a API
direta. Um candidato foi descartado pelo próprio localizador antes de chegar ao
cético.

## Sobreviventes

### 1. 🟡 POST /contratos aceita bloqueio soft-cancelado como reserva do contrato — a venda nasce ATIVA segurando uma reserva morta

**Âncora**: `artifacts/api-server/src/routes/contratos.ts:317`
(severidade do localizador 🟠; o cético confirmou o mecanismo e desceu para 🟡)

**Evidência**: a busca dos bloqueios não filtra `isNull(canceladoEm)`:

```ts
const bloqueiosEncontrados = bloqueioIds.length > 0
  ? await db.select().from(bloqueioVestidosTable)
      .where(and(inArray(bloqueioVestidosTable.id, bloqueioIds),
                 eq(bloqueioVestidosTable.lojaId, lojaId)))
  : [];
```

O próprio comentário da guarda (`contratos.ts:393-395`) afirma o invariante que
a busca ignora: «Contrato cancelado não conta — ele libera a peça (soft-cancel
do bloqueio) e a reserva volta ao mercado.»

**Mecanismo**: o cancelamento de contrato grava `canceladoEm` nos bloqueios
(`contratos.ts:947`) mas NÃO toca `reservasTable` — zero ocorrências de
`reservasTable` em `contratos.ts` — e a reserva segue CONFIRMADA na listagem.
Recriar o contrato apontando o mesmo `bloqueioVestidoIds` passa por TODAS as
guardas: a busca (`:317`) acha o bloqueio cancelado, a dona confere (`:370`),
`presosPorContratoAtivo` não o vê porque o contrato antigo é CANCELADO
(`:333`), a data bate (`:405`) e `verificarDisponibilidade` aprova — o motor de
conflito ignora bloqueios cancelados (`disponibilidade.ts:409`,
`isNull(canceladoEm)`) e `ignorarBloqueioId` exclui o próprio (`:430`). A
reconferência sob tranca do S-M7 (`contratos.ts:541-549`) também só pergunta
por contrato ATIVO. O vínculo é inserido (`:619`) e NADA limpa o `canceladoEm`
(`:629-635` só grava `leadId`). Resultado: contrato ATIVO cujo bloqueio
continua invisível para a disponibilidade.

**Consequência**: um contrato refeito de R$ 5.000,00 recebe 201 segurando uma
reserva morta; como a disponibilidade ignora o bloqueio, outra noiva reserva e
fecha contrato de R$ 4.000,00 sobre a MESMA peça para o MESMO fim de semana —
dois contratos ativos somando R$ 9.000,00 sobre um vestido, o dobro-prometido
que o comentário do E107 (`:385-391`) descreve, reaberto por esta porta.

**O que o cético mediu para descer a severidade**: a única tela que envia
`bloqueioVestidoIds` filtra `!b.canceladoEm`
(`artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:283`, `:690-692`) — a
vendedora NÃO vê nem escolhe a reserva morta, então o caso não acontece pela
UI; o gatilho é curl/API direta ou a janela estreita de um diálogo aberto
durante cancelamento concorrente. Gatilho raro, custo alto quando dispara.

**Sobra que enumera**: **S-M9**. O cético achou de bônus a assimetria
criar×editar que é exatamente a forma da S-M9: o PATCH filtra
`isNull(canceladoEm)` ao reler bloqueios (`contratos.ts:802`) e o POST não
(`:317`) — este sítio entra na varredura da S-M9.

### 2. 🟡 PATCH reserva → CANCELADA solta os vestidos de um contrato ATIVO sem guarda e sem trilha — os dois DELETEs recusam exatamente esse vínculo

**Âncora**: `artifacts/api-server/src/routes/reservas.ts:132`
(severidade do localizador 🟠; o cético confirmou tudo e desceu para 🟡)

**Evidência**:

```ts
if (dados.status === "CANCELADA") {
  // A constraint EXCLUDE do banco não enxerga o status da reserva —
  // soft-cancela os bloqueios vinculados para liberar os vestidos.
  await tx.update(bloqueioVestidosTable)
    .set({ canceladoEm: new Date(), ... })
    .where(and(eq(bloqueioVestidosTable.reservaId, reserva.id),
               isNull(bloqueioVestidosTable.canceladoEm)));
```

**Mecanismo**: a rota valida só a máquina de estados (`reservas.ts:112` —
CONFIRMADA→CANCELADA é transição válida em `estados.ts:59-64`) e soft-cancela
todos os bloqueios da reserva sem perguntar se algum está preso a contrato
ATIVO via `contratoBloqueios`. As portas irmãs perguntam: DELETE /reservas
(`:234-241`) e DELETE /bloqueios (`:545-554`) devolvem 409 contando «N
contrato(s) ativo(s) preso(s) ao vestido» — e o 409 ainda aponta para ESTA
porta como saída («Cancele os bloqueios (soft-cancel) em vez de apagar a
reserva», `:257`). Depois do soft-cancel a disponibilidade ignora o bloqueio
(`disponibilidade.ts:409`, `:417-421`) e a peça volta ao mercado. Não há
`registrarAuditoria` neste ramo — as únicas trilhas do arquivo estão nas linhas
267, 575 e 895; o cancelamento silencioso não deixa linha. O único teste do
ramo (`lote3-disponibilidade-api.test.ts:185-224`) não tem contrato na fixture
e prega só o caso feliz.

**Consequência**: o cancelamento encerra a reserva enquanto o contrato de
R$ 5.000,00 segue ATIVO cobrando parcelas — e o vestido dele volta disponível:
outra noiva o reserva para a mesma data e a dupla promessa só aparece na
retirada. Sem trilha, ninguém reconstitui quem soltou a peça nem quando. A rota
anula deterministicamente o invariante que a S-M7 trancou com `FOR UPDATE`.

**O que o cético mediu para descer a severidade**: NENHUM arquivo de frontend
chama `updateReserva`/`createReserva`/`deleteReserva` — zero ocorrências fora
do cliente gerado em `artifacts/moscow-noivas/src`; as páginas de reservas
operam só sobre bloqueios. A história da atendente não acontece por tela
nenhuma hoje; o gatilho exige chamada direta à API. Não é duplicata: a S-M16
(`c4ee0ad`) tocou itens-estoque e ajustes, nada de hoje tocou PATCH /reservas.

**Sobra que enumera**: nenhuma.

### 3. 🟡 Contrato CANCELADO é terminal só na porta de cancelar — o PATCH grava nele sem ler o status, e a prova de data vira vácuo

**Âncora**: `artifacts/api-server/src/routes/contratos.ts:820`

**Evidência**: a rota (`:770-830`) nunca lê `contrato.status`:

```ts
const [contrato] = await db.update(contratosTable)
  .set({ ...parsed.data, updatedAt: new Date() })
  .where(and(eq(contratosTable.id, contratoId as string),
             eq(contratosTable.lojaId, lojaId as string)))
  .returning();
```

**Mecanismo**: toda porta de parcela exige contrato ATIVO (receber `:1031`,
estornar `:1154`, remover `:1237`, avulsa `:1291`, gerar-plano `:1329`) e o
/cancelar recusa re-cancelar (`:847`). Só o PATCH não pergunta: cpf,
formaPagamento, dataCasamento, dataRetirada, dataDevolucao e observacoes de um
contrato CANCELADO seguem graváveis. Pior: a única guarda do PATCH — a
coerência de dataCasamento com a reserva (`:789-818`) — filtra bloqueios por
`isNull(canceladoEm)` (`:802`), e num contrato cancelado TODOS os bloqueios têm
`canceladoEm` (gravado pelo próprio cancelamento, `:947`), então o laço roda
vazio e a data muda sem prova nenhuma. `UpdateContratoBody` (api-zod gerado,
`:6000-6008`) não tem guarda; não há consumidor de `updateContrato` no
frontend, no e2e nem nos testes, e nenhum teste prega o comportamento.

**Consequência**: o arquivo morto é reescrevível. Depois que a trilha
CONTRATO_CANCELADO congelou motivo e valores (`:970-984`), qualquer PATCH
altera as datas e o CPF do registro, e o GET /pdf (`:751`) emite o contrato
cancelado com os dados novos — o documento diverge do que a auditoria diz que
foi cancelado. Não move dinheiro (`valorTotal` não está no
`UpdateContratoBody`), mas corrompe o registro que sustenta disputa com a
noiva. Gatilho raro (API direta), custo de registro — 🟡 confirmada pelo
cético, que também conferiu: não é sítio das sobras abertas (S-M9 é permissão
de forma criar×editar, S-M10 é campo vazio, S-M18 é check-then-write — aqui não
há check algum).

**Sobra que enumera**: nenhuma.

### 4. 🟡 Orçamento RECUSADO é terminal na máquina mas aceita escrita em itens e desconto — todas as guardas perguntam só por APROVADO

**Âncora**: `artifacts/api-server/src/routes/orcamentos.ts:380`

**Evidência**:

```ts
if (orcamento.status === "APROVADO") {
  res.status(422).json({ error: "ORCAMENTO_APROVADO", ... });
```

Mesma forma no PATCH de item (`:499`), no DELETE de item (`:532`) e na guarda
de desconto do PATCH (`:274-276`). Em `estados.ts:49`, `RECUSADO: []` — nenhuma
saída.

**Mecanismo**: `TRANSICOES_ORCAMENTO` declara RECUSADO como estado final sem
transição de volta (`estados.ts:45-50`), e o /link recusa gerar acesso («não há
o que a noiva rever de um não», `:559-561`). Mas as quatro portas de conteúdo —
POST item (`:380`), PATCH item (`:499`), DELETE item (`:532`) e desconto via
PATCH (`:274`) — só bloqueiam APROVADO. Um orçamento RECUSADO pode ter itens
adicionados, alterados e apagados e o desconto trocado, sem uso legítimo
possível: ele nunca poderá ser reenviado nem aprovado. O cético conferiu as
outras camadas: nenhum Zod/constraint/teste prega o caso (o único teste
RECUSADO é o do /link, `lote22:117-131`); o frontend bloqueia
(`[id].tsx:441`, `statusEditavel = RASCUNHO||ENVIADO`) e o próprio recusar
promete na tela «deixa de ser editável» (`[id].tsx:839`) — mas é a mesma guarda
só-de-tela que o E115 julgou insuficiente para APROVADO, e ela vaza na aba
defasada: A edita item de um orçamento que B acabou de recusar, e a API aceita.

**Consequência**: o registro do que a noiva recusou muda depois do não — um
orçamento recusado de R$ 3.500,00 pode virar R$ 500,00 (ou perder todos os
itens) e quem reler a proposta, ou comparar com o motivo de perda do lead,
encontra outra história. Deriva de registro, não de caixa; gatilho raro
(API direta ou aba defasada), custo baixo. Não é duplicata: a S-M16
(`c4ee0ad`) tocou deletes de itens-estoque/ajustes, não estas rotas.

**Sobra que enumera**: nenhuma.

### 5. 🟡 Fechar contrato em lead PERDIDO deixa a etapa em PERDIDO — a conversão conta a venda como perda e o expurgo LGPD não pergunta por contrato ATIVO

**Âncora**: `artifacts/api-server/src/routes/contratos.ts:693`

**Evidência**:

```ts
const etapaNova = avancarEtapaLead(lead.etapa, "CONTRATO_FECHADO");
```

Para lead PERDIDO, `avancarEtapaLead` devolve a própria etapa (`etapas.ts:59`:
`if (iAtual === -1 ...) return atual`), e o comentário `contratos.ts:681-683`
admite: «PERDIDO cai no mesmo buraco por outra porta: avancarEtapaLead não mexe
em quem está fora do funil.» O E94 consertou só o carimbo
(`contratoFechadoEm`), não a etapa.

**Mecanismo**: POST /contratos aceita lead em qualquer etapa (`:165-169` só
confere existência na loja) e devolve 201 com o lead seguindo PERDIDO. Duas
leituras passam a divergir do fato: /leads/conversao conta convertido por etapa
(`leads.ts:201`, filter etapa IN ETAPAS_CONVERTIDA) e conta o lead nas perdidas
(`:210`); e a `condicaoDoExpurgo` da LGPD (`leads.ts:282-289`) seleciona por
etapa=PERDIDO + `perdidaEm` < corte + não anonimizada — sem olhar contratos. O
expurgo (`:332-346`) zera whatsapp e noivoNome e vira noivaNome
«(anonimizada)». A noiva perdida há mais de 24 meses que voltou fecha contrato
sem ninguém reviver o kanban — o `perdidaEm` antigo fica (`carimboEtapa` só
grava se vazio, `leads.ts:44-48`, e o update do contrato `:695-701` não o
limpa) e ela entra na janela do expurgo com contrato ATIVO. O cético conferiu
os testes: `lote6-estados-unit.test.ts:31` prega o contrato do HELPER
(documentado), não a composição da rota; `lote6-estados-api.test.ts` cobre
EM_PROVAS, nunca PERDIDO; nenhum teste de expurgo semeia lead com contrato. Não
há decisão escrita sancionando o comportamento — o expurgo anonimizando quem
tem parcelas em aberto contradiz a própria justificativa da rota
(`leads.ts:276`).

**Consequência**: um contrato de R$ 5.000,00 entra no relatório de conversão
como perda (e no porMotivoPerda), enquanto /leads/sazonalidade o conta como
fechado via `contratoFechadoEm` — os dois relatórios discordam sobre a mesma
noiva. No pior caso, o expurgo LGPD apaga o whatsapp de uma noiva com parcelas
em aberto: a cobrança dos R$ 3.000,00 restantes fica sem telefone e o PDF do
contrato passa a dizer «(anonimizada)». Gatilho raro — exige `perdidaEm` ≥ 24
meses, venda sem reviver o kanban e expurgo rodado manualmente — por isso 🟡.

**Sobra que enumera**: nenhuma.

## Refutados

Nenhum sobrevivente foi derrubado pelo cético — os cinco ficaram de pé (dois
com severidade rebaixada de 🟠 para 🟡). Um candidato foi avaliado e descartado
pelo próprio localizador antes de virar achado:

| Título | Âncora | A refutação em uma frase |
|---|---|---|
| Destravar a origem do lead via PERDIDO→editar→reviver | `artifacts/api-server/src/routes/leads.ts:505` | Ao virar PERDIDO o lead sai da contagem de convertidos, então mudar a origem não reescreve número já contado — o cético derrubaria. |

## Cobertura

**Teto atingido: não.** Cinco achados verdadeiros, todos lidos neste run.

Áreas varridas e limpas neste ângulo:

- **Parcelas e contas a pagar** — todas as portas de dinheiro exigem contrato
  ATIVO ou recusam PAGA/CANCELADA (`contratos.ts:1023-1032`, `:1147-1156`,
  `:1231-1239`; `financeiro.ts:345`, `:379`, `:488`).
- **Estorno de pagamento e de parcela** — UPDATE condicional ao status
  (`contratos.ts:1193-1196`).
- **Convites** — `usadoEm`/`expiraEm` conferidos nas duas portas e aceite
  condicional (`convites.ts:49-115`).
- **Aceite público de orçamento** — exige ENVIADO e é idempotente
  (`orcamentos-publico.ts:86-93`).
- **As três portas PATCH de lead/orçamento/reserva** — validam transição pela
  máquina (`leads.ts:490`, `orcamentos.ts:264`, `reservas.ts:112`).

Nenhum achado deste ângulo enumera sítio das sobras S-M10, S-M17 ou S-M18. O
achado 1 enumera um sítio para a **S-M9** (POST `:317` sem o filtro que o PATCH
`:802` tem).
