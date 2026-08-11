# 08 — corridas — a S-M7 e a S-M18 trancaram o CONTRATO; o aceite e o cancelamento da reserva ficaram de fora, e é por ali que as duas noivas ainda se cruzam

**Revisão ótica dos papéis**, base `980fce5` · ângulo 08
**Arquivos lidos:**
`artifacts/api-server/src/lib/aceite-orcamento.ts` (inteiro) ·
`artifacts/api-server/src/routes/orcamentos-publico.ts` (inteiro) ·
`artifacts/api-server/src/routes/portal.ts:300-357` ·
`artifacts/api-server/src/routes/orcamentos.ts:60-158, 305-399, 407-419, 598-753` ·
`artifacts/api-server/src/routes/contratos.ts:180-660` ·
`artifacts/api-server/src/routes/reservas.ts:100-274, 630-800` ·
`artifacts/api-server/src/lib/estados.ts:43-55` ·
`artifacts/api-server/src/lib/erros.ts:180-249` ·
`artifacts/api-server/src/lib/disponibilidade.ts:300-332` ·
`lib/db/src/schema/contratos.ts` (inteiro) ·
`lib/db/scripts/apply-sql-extras.ts` (inteiro) ·
`artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:833-850, 1482-1483` ·
`artifacts/moscow-noivas/src/pages/orcamento-publico.tsx:149-153` ·
testes: `sm7-corrida-reserva-exclusiva-api.test.ts`, `sm22-corrida-check-then-write-api.test.ts`,
`lote17-agenda-concorrencia-api.test.ts`, `e150-item-sem-reserva-api.test.ts`,
`contrato-bloqueios-api.test.ts` (os cinco, inteiros ou nos `describe`/`it`)

## A resposta à pergunta do briefing, antes dos achados

**Sim, o caminho aceite → reserva → contrato ficou de fora das duas varreduras.**
A S-M7 (`75882f0`) trancou UM sítio: o `POST /contratos` contra OUTRO
`POST /contratos` (`contratos.ts:541-557`). A S-M18/S-M22 (`d4bdc76`) trancou dez
sítios, e no fluxo do orçamento pegou **só o `PATCH /orcamentos/:id`**
(`orcamentos.ts:363-368`). Ficaram sem tranca, e cada um é uma corrida abaixo:

| Rota | Tranca? | Achado |
|---|---|---|
| `POST /orcamentos/:id/recusar` (`orcamentos.ts:731-751`) | **nenhuma** — sem transação | A08.3 |
| `POST /orcamentos/:id/aprovar` (`orcamentos.ts:707-729`) | **nenhuma** — sem transação | A08.3 |
| `PATCH /reservas/:id` status=CANCELADA (`reservas.ts:150-187`) | transação, mas a guarda lê ANTES da tranca | A08.2 |
| `POST /contratos`, guarda de lead ativo (`contratos.ts:184-193`) | lida no pool, nunca relida | A08.1 |
| `POST /contratos`, `canceladoEm` do bloqueio (`contratos.ts:323-330`) | lido no pool, **não** relido sob a tranca da S-M7 | A08.2 |
| `lib/aceite-orcamento.ts:20-25` (versão/hash) | lido no pool, fora da transação de `:28` | A08.4 |

## A08.1 — duas vendedoras, duas abas, dois contratos ATIVOS para a MESMA noiva 🟠

**Âncora:** `artifacts/api-server/src/routes/contratos.ts:184-193` (lido)

**O que a linha diz** (literal):

```ts
  // 2. Um lead não pode ter dois contratos ATIVOS ao mesmo tempo.
  const [ativoExistente] = await db.select({ id: contratosTable.id }).from(contratosTable)
    .where(and(
      eq(contratosTable.leadId, contratoData.leadId),
      eq(contratosTable.lojaId, lojaId),
      eq(contratosTable.status, "ATIVO"),
    ));
  if (ativoExistente) {
    res.status(409).json({ error: "CONTRATO_ATIVO_DUPLICADO", detalhe: "Este lead já possui um contrato ativo" });
```

É `db` (pool global), não `tx`. A transação só começa em `:521`, e o único
`FOR UPDATE` dela (`:541-547`) é **condicionado a `if (bloqueioIds.length > 0)`**
— contrato sem reserva nenhuma (SERVIÇO, AJUSTE, peça de descrição livre; os
dois últimos casos do `e150-item-sem-reserva-api.test.ts:149-194` fecham 201 sem
bloqueio) atravessa a transação inteira **sem tomar tranca alguma**.

**A corrida, passo a passo:**
- T1 (Ana, aba 1) `POST /contratos` para a noiva L, orçamento O1, R$ 5.000,00 →
  `:184` devolve vazio.
- T2 (Bia, aba 2) `POST /contratos` para a MESMA noiva L, orçamento O2,
  R$ 4.200,00 → `:184` devolve vazio (T1 ainda não commitou).
- T1 entra na transação `:521`. Sem `bloqueioIds`, nenhum `FOR UPDATE`. INSERT.
  COMMIT.
- T2 idem. INSERT. COMMIT.
- **Resultado: dois contratos ATIVO para o lead L, os dois 201.** O
  `CONTRATO_ATIVO_DUPLICADO` nunca dispara.

**UNIQUE que salve:** **não existe.** `lib/db/src/schema/contratos.ts:12-63` tem
um índice só, `contratos_loja_fechado_em_idx` (`:60`), que não é único; o único
UNIQUE da tabela é `orcamento_id` (`:18`) e ele não morde aqui, porque são dois
orçamentos diferentes. `lib/db/scripts/apply-sql-extras.ts` — o arquivo que
carrega tudo que o `push` não gera — tem exatamente duas constraints, ambas em
`bloqueio_vestidos` (`:22-24` e `:41-47`). **Nada no banco impede o segundo
ATIVO.** A garantia é 100% do código, e o código lê no pool.

**Número medido:** a régua de comissão é a que o próprio arquivo escreve em
`contratos.ts:650-651`: *"num contrato de R$ 4.200,00 a 5% são R$ 210,00"*. Com
os dois contratos vivos, a mesma venda paga **R$ 250,00 (Ana, sobre
R$ 5.000,00) + R$ 210,00 (Bia, sobre R$ 4.200,00) = R$ 460,00** de comissão, e
o faturamento do mês soma **R$ 9.200,00** onde a noiva assinou uma vez. O portal
da noiva não denuncia: `portal.ts:301-309` é um `findFirst` com
`orderBy: desc(contratosTable.fechadoEm)` — ela baixa o PDF de UM dos dois, sem
aviso de que existe outro.

**A régua atual:** ausente. O `sm7-corrida-reserva-exclusiva-api.test.ts` (lido
inteiro, 133 linhas) tem dois `it`, e os dois são sobre **um bloqueio disputado
por dois contratos** — nenhum sobre **um lead** disputado por dois contratos. O
`contrato-bloqueios-api.test.ts` (`:55-139`) é todo sequencial.

## A08.2 — a reserva cancelada num lado e contratada no outro: os DOIS sentidos passam 🟠

**Âncoras** (as quatro, lidas):

1. `artifacts/api-server/src/routes/contratos.ts:323-330` — a leitura do bloqueio,
   **no pool**, é a única que olha `canceladoEm`:

```ts
  const bloqueiosEncontrados = bloqueioIds.length > 0
    ? await db.select().from(bloqueioVestidosTable)
        .where(and(
          inArray(bloqueioVestidosTable.id, bloqueioIds),
          eq(bloqueioVestidosTable.lojaId, lojaId),
          isNull(bloqueioVestidosTable.canceladoEm),
        ))
    : [];
```

2. `artifacts/api-server/src/routes/contratos.ts:541-557` — a tranca da S-M7,
   que **não relê `canceladoEm`**:

```ts
      for (const bloqueioId of [...bloqueioIds].sort()) {
        await tx.select({ id: bloqueioVestidosTable.id })
          .from(bloqueioVestidosTable)
          .where(and(eq(bloqueioVestidosTable.id, bloqueioId), eq(bloqueioVestidosTable.lojaId, lojaId)))
          .for("update");
      }
      const presosAgora = await tx
        .select({ bloqueioId: contratoBloqueiosTable.bloqueioId })
        ...
      if (presosAgora.length > 0) return { corrida: true as const };
```

Ela seleciona `{ id }` — o resultado **nem é inspecionado** — e a reconferência
que vem depois pergunta só por `contrato_bloqueios`. `canceladoEm` fica de fora.

3. `artifacts/api-server/src/routes/reservas.ts:157-166` — a guarda do
   cancelamento, dentro da transação mas **antes de qualquer tranca no bloqueio**:

```ts
          const presos = await tx.select({ contratoId: contratoBloqueiosTable.contratoId })
            .from(contratoBloqueiosTable)
            .innerJoin(contratosTable, eq(contratosTable.id, contratoBloqueiosTable.contratoId))
            .where(and(
              inArray(contratoBloqueiosTable.bloqueioId, bloqueiosDaReserva.map((b) => b.id)),
              eq(contratosTable.status, "ATIVO"),
            ));
          if (presos.length > 0) {
            throw new ReservaPresaAContrato(presos.length);
          }
```

4. `artifacts/api-server/src/routes/reservas.ts:182-187` — o soft-cancel, que é o
   **primeiro** statement da transação a tocar a linha do bloqueio:

```ts
        await tx.update(bloqueioVestidosTable)
          .set({ canceladoEm: new Date(), updatedAt: new Date() })
```

**A corrida, sentido A — o contrato nasce segurando uma reserva morta:**
- T1 (vendedora) `POST /contratos` citando `bloqueioVestidoIds: [B]`. `:323-330`
  lê B com `canceladoEm` nulo → passa. `:404` (já contratado?) → não. `:433`
  (disponibilidade) → livre. `:470-487` (E150) → `vestidosReservados` contém a
  peça, passa.
- T2 (a dona, na tela de reservas) `PATCH /reservas/R` com `status: "CANCELADA"`.
  `:150` acha B, `:157` não acha contrato ativo (T1 não commitou), `:182`
  soft-cancela B. **COMMIT.**
- T1 entra na transação `:521`. `FOR UPDATE` em B — **pendura**, porque T2 tinha
  a linha; T2 commita, T1 adquire. Relê `contrato_bloqueios`: vazio. Segue.
  INSERT do contrato ATIVO + INSERT de `contrato_bloqueios(contrato, B)`.
  **COMMIT, 201.**
- **Resultado: contrato ATIVO preso a um bloqueio com `cancelado_em`
  preenchido.** É palavra por palavra o defeito que a S-M24 diz ter fechado, no
  comentário `contratos.ts:318-322`: *"um bloqueio SOFT-CANCELADO era aceito como
  reserva do contrato novo: a venda nascia ATIVA segurando uma reserva morta que
  a disponibilidade ignora"*. A S-M24 pôs o filtro na leitura do pool; a S-M7 pôs
  a tranca sem levar o filtro junto.

**A corrida, sentido B — o vestido volta ao mercado com o contrato ativo:**
- T1 entra na transação `:521`, toma `FOR UPDATE` em B, relê, insere o contrato
  ATIVO e o vínculo. **Ainda não commitou.**
- T2 `PATCH /reservas/R` CANCELADA. `:131` faz UPDATE em `reservas` (tranca a
  linha da reserva — que T1 nunca toca, então não serializa nada). `:150` é
  `SELECT` puro, não pega tranca: enxerga B. `:157` conta contratos ativos — o
  vínculo de T1 não commitou, **conta zero** → `ReservaPresaAContrato` não é
  lançada.
- `:182` UPDATE em B → **pendura** na tranca de T1. T1 commita. O UPDATE de T2
  reavalia o `WHERE (reserva_id = R AND cancelado_em IS NULL)` — ainda
  verdadeiro — e cancela. **COMMIT.**
- **Resultado: contrato ATIVO de pé e a reserva dele cancelada,** com o 409
  `RESERVA_COM_CONTRATO` (`reservas.ts:241-247`) nunca disparado. A frase que
  esse 409 existe para dizer — *"cancele o contrato primeiro, ou o vestido da
  noiva voltaria ao mercado"* — descreve exatamente o que acabou de acontecer.

**Número medido:** a EXCLUDE do banco (`apply-sql-extras.ts:41-47`) é
`WHERE (ocupacao_inicio IS NOT NULL AND cancelado_em IS NULL)` — **um bloqueio
soft-cancelado sai do índice**. Logo, nos dois sentidos a peça volta a aparecer
livre: a noiva B reserva o mesmo vestido para o mesmo sábado e fecha
R$ 4.000,00, enquanto o contrato da noiva A, de R$ 5.000,00, segue cobrando
parcelas sobre a mesma peça. **R$ 9.000,00 prometidos sobre um vestido só**, e a
loja descobre na retirada — o mesmo número que o comentário `:321-322` usa para
justificar a S-M24.

**UNIQUE que salve:** **não existe.** A PK de `contrato_bloqueios` é
`(contratoId, bloqueioId)` (`lib/db/src/schema/contratos.ts:111`) e aceita os
dois pares; a EXCLUDE só olha bloqueios NÃO cancelados, e o bloqueio em questão
está cancelado. **A garantia é só do código, e o código não relê o campo.**

**A régua atual:** ausente nos dois sentidos. O
`sm7-corrida-reserva-exclusiva-api.test.ts:50-108` monta contrato × contrato,
nunca contrato × cancelamento. O `sm22-corrida-check-then-write-api.test.ts` tem
dois `it` (`:43` parcela × recebimento, `:91` cabine × atendimento) — a reserva
não está entre eles. O `contrato-bloqueios-api.test.ts:55` até exercita
"cancelar liberta as duas", mas em sequência.

## A08.3 — a noiva aceita no mesmo segundo em que a loja recusa: o "sim" e o "não" se sobrescrevem, e não há volta 🟠

**Âncoras** (as três, lidas):

`artifacts/api-server/src/routes/orcamentos.ts:746-748` — o `/recusar`, **sem
transação e sem condição de status no `WHERE`**:

```ts
  await db.update(orcamentosTable)
    .set({ status: "RECUSADO", updatedAt: new Date() })
    .where(and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)));
```

`artifacts/api-server/src/lib/aceite-orcamento.ts:30-41` — o CAS do aceite, que
guarda **só `aceitoEm`**, nunca o status:

```ts
    const [atualizado] = await tx
      .update(orcamentosTable)
      .set({ aceitoEm: agora, ..., status: "APROVADO", aprovadoEm: agora, updatedAt: agora })
      .where(and(eq(orcamentosTable.id, orcamento.id), isNull(orcamentosTable.aceitoEm)))
```

`artifacts/api-server/src/lib/estados.ts:45-50` — os dois destinos são terminais:

```ts
export const TRANSICOES_ORCAMENTO: Record<OrcamentoStatus, OrcamentoStatus[]> = {
  RASCUNHO: ["ENVIADO", "APROVADO", "RECUSADO"],
  ENVIADO: ["APROVADO", "RECUSADO"],
  APROVADO: [],
  RECUSADO: [],
};
```

**A corrida, sentido A — o aceite morre num beco:**
- T1 (noiva, no link público) `POST /orcamentos/publico/aceite`.
  `orcamentos-publico.ts:86-93` lê `aceitoEm` nulo e status `ENVIADO` → passa.
- T2 (vendedora, achando que a noiva sumiu) `POST /orcamentos/:id/recusar`.
  `orcamentos.ts:741` lê `ENVIADO` → passa. UPDATE `status = 'RECUSADO'`.
  **COMMIT, 204.**
- T1 executa a transação de `aceite-orcamento.ts:28`. O `WHERE` é
  `isNull(aceitoEm)` — ainda verdadeiro — então grava `aceitoEm`,
  `aceiteVersao`, `aceiteHash` e `status = 'APROVADO'`. **COMMIT, 200.**
- Ordem inversa (aceite commita primeiro): o UPDATE de `:746` não tem condição
  de status e **sobrescreve o APROVADO por RECUSADO**, deixando `aceitoEm` e
  `aceiteHash` preenchidos. Também 204, também sem erro para ninguém.

**Resultado:** o orçamento fica `RECUSADO` **com aceite gravado** (ou `APROVADO`
depois de a loja ter dito não, conforme a ordem). E **não há saída**:
`estados.ts:49` dá `RECUSADO: []`, o `/aprovar` recusa explicitamente
`RECUSADO` (`orcamentos.ts:717-720`: `if (orcamento.status === "APROVADO" ||
orcamento.status === "RECUSADO")` → 422 `TRANSICAO_INVALIDA`), editar os itens
é 422 `ORCAMENTO_RECUSADO` (`orcamentos.ts:78-83`, aplicado em `:499`, `:618` e
`:651`) e o `POST /contratos` devolve 422 `ORCAMENTO_NAO_APROVADO`
(`contratos.ts:216-219`). O portal da noiva continua exibindo "aceito em ...".

**Número medido:** um orçamento de **R$ 5.000,00** aceito pela noiva fica
impossível de virar contrato — o único caminho é refazer o orçamento inteiro,
gerar link novo (`orcamentos.ts:667`) e **pedir à noiva que aceite de novo**. Os
R$ 5.000,00 não são perdidos, mas o aceite registrado é: a versão e o hash que
provam o que ela concordou não têm mais para onde ir, e o `DELETE` que limparia
a linha destrói justamente esse comprovante (`orcamentos.ts:401-405`:
*"apagar um APROVADO destruía o comprovante do aceite"*).

**O irmão sem noiva nenhuma:** o par `/aprovar` × `/recusar` tem a mesma forma —
`:724-726` e `:746-748` são dois UPDATEs sem condição de status. Duas vendedoras,
uma aprovando e outra recusando, recebem **204 as duas** e o último a commitar
manda. 🟡, mesmo achado, mesmo conserto.

**UNIQUE que salve:** **nenhum.** Não há coluna gerada, CHECK ou trigger sobre
`orcamentos.status`; `apply-sql-extras.ts` não toca a tabela. O único UNIQUE
perto do assunto é `orcamento_versoes_numero_unq`
(`lib/db/src/schema/orcamentos.ts:112`), que protege outra coisa. **A máquina de
estados vive inteiramente no processo, e nenhuma das duas rotas a relê sob
tranca** — enquanto o `PATCH /orcamentos/:id` ao lado (`:363-368`) tem
`FOR UPDATE` + reconferência desde a S-M22.

**A régua atual:** ausente. `git grep` nos `__tests__` não devolve nenhum arquivo
de corrida sobre orçamento; os três de concorrência que existem são
`sm7-...` (contratos), `sm22-...` (parcelas e cabines), `lote17-...` (agenda) e
`e94-recebimento-concorrencia` (financeiro).

## A08.4 — a versão que o aceite congela é lida FORA da transação que a grava 🟡

**Âncora:** `artifacts/api-server/src/lib/aceite-orcamento.ts:20-28` (lido)

**O que a linha diz** (literal):

```ts
  const [versao] = await db
    .select({ numero: orcamentoVersoesTable.numero, hash: orcamentoVersoesTable.hash })
    .from(orcamentoVersoesTable)
    .where(eq(orcamentoVersoesTable.orcamentoId, orcamento.id))
    .orderBy(desc(orcamentoVersoesTable.numero))
    .limit(1);

  const agora = new Date();
  const aceito = await db.transaction(async (tx) => {
```

`db`, não `tx`, e **acima** do `db.transaction`. O hash que vira prova jurídica
do aceite (`aceiteHash`, a régua que o `POST /contratos` confere em
`contratos.ts:236-247`) é lido numa conexão do pool e gravado noutra transação.

**A corrida, passo a passo:**
- T1 (noiva) chama o aceite; a linha `:20` devolve a versão N (hash H1).
- T2 (ateliê) `PATCH /orcamentos/:id` com `status: "ENVIADO"` sobre um orçamento
  em RASCUNHO — `orcamentos.ts:378-380` chama `criarVersaoEnviada`, que insere a
  versão N+1 com outro hash. COMMIT.
- T1 entra na transação e grava `aceiteVersao = N`, `aceiteHash = H1`.
- **Resultado:** o aceite aponta uma versão que já não é a última. O
  `POST /contratos` compara o conteúdo VIVO contra H1 (`contratos.ts:237-238`:
  `if (vivo.hash !== orcamento.aceiteHash)`) e devolve 422
  `ORCAMENTO_DIVERGE_DO_ACEITE` — a venda trava, mas com a mensagem errada
  ("Os itens mudaram depois do envio que a noiva aceitou"), quando o que mudou
  foi a versão sob os pés do aceite.

**Alcance real, medido na leitura:** a janela é estreita porque
`criarVersaoEnviada` só roda em duas portas — `:378` (`virandoEnviado`, exige
`existente.status !== "ENVIADO"`) e `:699-701` (`POST .../link`, exige
`status === "RASCUNHO"`). Como `TRANSICOES_ORCAMENTO.ENVIADO` não inclui
`RASCUNHO` (`estados.ts:47`), **não há caminho de volta a RASCUNHO** e uma
segunda versão só nasce se a primeira transição ENVIADO ainda estiver em voo.
Por isso 🟡 e não 🟠: o defeito é de forma (leitura fora da transação que grava),
e o estreitamento vem de outro invariante, não de uma guarda.

**Número medido:** não aplicável — o dinheiro não muda de valor aqui; o que se
perde é a correspondência entre o hash gravado e a versão vigente. Nenhum
exemplo numérico, portanto **nenhuma afirmação de dinheiro** (regra 19).

**A régua atual:** ausente. `aceite-orcamento.ts` tem o comentário de corrida em
`:29` (*"duas abas aceitando ao mesmo tempo gravam UM aceite"*) e em `:60-64` (a
releitura de quem perdeu), mas os dois falam de **aceite × aceite** — não de
aceite × versão.

## A08.5 — duas noivas aceitam a MESMA peça no mesmo segundo: o banco protege a RESERVA, e ninguém protege o ACEITE 🟠

**Âncoras** (as três, lidas):

`artifacts/api-server/src/lib/aceite-orcamento.ts` — **as 71 linhas do arquivo,
lidas inteiras: nenhuma cita vestido, bloqueio, reserva ou disponibilidade.**
Os imports (`:1`) são `orcamentosTable, orcamentoVersoesTable, auditLogTable`.

`verificarDisponibilidade` existe em três arquivos de produção só
(`disponibilidade.ts`, `contratos.ts`, `reservas.ts`) — `orcamentos.ts` e
`orcamentos-publico.ts` **não estão na lista**. Nenhuma rota de orçamento
consulta disponibilidade de peça, nem ao montar o item, nem ao enviar, nem ao
aceitar.

`lib/db/scripts/apply-sql-extras.ts:41-47` — a única defesa real da peça:

```sql
          EXCLUDE USING gist (
            vestido_id WITH =,
            daterange(ocupacao_inicio, ocupacao_fim, '[]') WITH &&
          )
          WHERE (ocupacao_inicio IS NOT NULL AND cancelado_em IS NULL);
```

**A corrida, passo a passo:**
- Orçamento O-A (noiva A, R$ 5.000,00) e O-B (noiva B, R$ 4.800,00), os dois com
  um item `tipo: "VESTIDO"`, `vestidoId: V` — o MESMO vestido. Nada recusou isso:
  o `POST /orcamentos/:id/itens` não pergunta se V está livre.
- T1 e T2, no mesmo segundo, `POST /orcamentos/publico/aceite`, uma por link.
- **As duas passam.** Os dois orçamentos ficam `APROVADO` com `aceitoEm`.
- Depois, na reserva: a primeira vendedora a criar o bloqueio de V ganha; a
  segunda leva 409 — `VESTIDO_INDISPONIVEL` pelo `verificarDisponibilidade`
  (`reservas.ts`) ou `CONFLITO_DE_DISPONIBILIDADE` pela EXCLUDE
  (`erros.ts:210-219`), e o `lote17-agenda-concorrencia-api.test.ts:143` prova
  que essa metade funciona sob corrida de verdade.
- **Resultado:** a noiva perdedora tem um **aceite que não pode virar contrato**.
  O `POST /contratos` recusa com 422 `ITEM_SEM_RESERVA` (`contratos.ts:476-486`)
  porque não há bloqueio para V, e o orçamento **é terminal**: `APROVADO: []`
  (`estados.ts:48`), item não se edita (`orcamentos.ts:72-77` → 422
  `ORCAMENTO_APROVADO` em `:499`, `:618`, `:651`), o orçamento não se apaga
  (`orcamentos.ts:416-419` → 409). Trocar V por outro vestido é impossível
  **dentro do orçamento que ela aceitou**.

**Número medido:** R$ 4.800,00 de venda aceita pela noiva B ficam sem porta de
saída — não por conflito de agenda, que o sistema sabe explicar, mas por
**estado terminal**: para vender a ela outra peça, o ateliê tem de criar
orçamento novo, gerar link novo e obter aceite novo, e a única coisa que a
vendedora lê na tela é *"O contrato vende uma peça que não está reservada"*
(`contratos.ts:479`) — uma frase que não diz que a peça já é de outra noiva.

**UNIQUE que salve:** o **acervo** está protegido (EXCLUDE gist, e o
`ocupacaoFisica` de `disponibilidade.ts:316-332` garante `ocupacao_inicio` não
nulo para toda RESERVA_CASAMENTO com data, então a EXCLUDE morde). O **aceite**
não tem nada: nenhum UNIQUE, nenhuma FK, nenhuma checagem liga
`orcamento_itens.vestido_id` à disponibilidade da peça. É o vão do PROGRESSO,
visto do lado da concorrência: **o gate não é só "o aceite não reserva" — é
"dois aceites podem prometer a mesma peça, e o sistema só descobre no contrato,
quando os dois orçamentos já são imutáveis."**

**A régua atual:** ausente. O `e150-item-sem-reserva-api.test.ts` (lido inteiro,
195 linhas, 6 `it`) prova que a peça sem reserva é recusada, mas **sempre com um
lead só** — nenhum caso com duas noivas apontando o mesmo `vestidoId`.

## A08.6 — o duplo clique: o aceite é idempotente, o contrato é salvo pelo banco com a frase errada 🔵

**Âncoras** (lidas):
- Aceite: `orcamentos-publico.ts:85-89` e `portal.ts:345-349` — os dois têm
  `if (orcamento.aceitoEm) { res.json(...); return; }`, e embaixo o CAS de
  `aceite-orcamento.ts:40` mais a releitura de `:65-70` (*"Perdida a corrida, o
  que vale é o que ficou gravado: relê-se a linha"*). **Dois cliques, um aceite,
  o mesmo carimbo nas duas respostas. Correto, e é o melhor sítio do fluxo.**
- Contrato: `contratos.ts:221-226` lê `jaVinculado` no pool; quem salva de
  verdade é `lib/db/src/schema/contratos.ts:18` —
  `orcamentoId: text("orcamento_id").unique()`.

**A corrida, passo a passo:** duas abas em "Gerar contrato" do mesmo orçamento
aceito. As duas passam por `:221-226` (nenhuma vê a outra), as duas inserem; a
segunda viola o UNIQUE e o handler global mapeia 23505 → 409 com
`error: "REGISTRO_DUPLICADO"`, `detalhe: "Já existe um registro com estes
dados."` (`erros.ts:191-198`). **Nenhum contrato duplicado — o banco segura.**
O que sai errado é a frase: a vendedora lê a genérica em vez de *"Orçamento já
pertence a outro contrato"* (`contratos.ts:224`), que é a que explica o que
fazer. A tela já defende o clique único (`orcamentos/[id].tsx:1482`:
`disabled={createContrato.isPending}`), então o caso vive em duas abas ou curl.

**Número medido:** não há — o dinheiro não dobra, o UNIQUE impede. Sem exemplo
numérico, **não é achado de dinheiro** (regra 19). 🔵 pelo texto, não pelo
estrago.

**Ressalva que remete a A08.1:** essa proteção **só existe quando há
`orcamentoId`**. `ContratoInput` não o exige (é o que a S-D29 registra em
`contratos.ts:496-497`), e contrato sem orçamento não tem UNIQUE nenhum — é
exatamente por isso que A08.1 é 🟠 e este é 🔵.

## Visto de passagem

- **Botão que sempre falha:** `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:842-843`
  oferece *"Voltar para rascunho"* exatamente quando `orcamento.status === "ENVIADO"`,
  e `TRANSICOES_ORCAMENTO.ENVIADO = ["APROVADO", "RECUSADO"]`
  (`artifacts/api-server/src/lib/estados.ts:47`) — o `PATCH` responde 422
  `TRANSICAO_INVALIDA` **em 100% dos cliques** (`orcamentos.ts:322-327`). Não é
  corrida; é do ângulo 07/02, mas a âncora está lida. 🟡
- **A reconferência da S-M22 no `PATCH /orcamentos/:id` é parcial:**
  `orcamentos.ts:368` é `if (recusaConteudoCongelado(agora.status) && mexeNoDesconto)`
  — sob a tranca, só o **desconto** é reconferido. A validade da transição
  (`:322`) continua decidida pela leitura do pool, então um `PATCH
  {status:"RECUSADO"}` concorrente com o aceite passa pela tranca sem ser
  reperguntado, com o mesmo desfecho da A08.3. 🟡
- **`presosPorContratoAtivo` sobrevive em duplicata:** a lista é montada no pool
  em `contratos.ts:332-344` e refeita sob tranca em `:548-555`. O comentário
  `:530-532` explica a escolha (*"A guarda de cima FICA — ela dá os quatro erros
  na ordem que os testes pregam"*), e ela é defensável; o registro aqui é que
  **é o único dos cinco checks de bloqueio que ganhou a segunda leitura** — os
  outros quatro (`:347` não encontrado, `:377` outra noiva, `:412` data diverge,
  `:433` disponibilidade) seguem valendo só pelo que o pool disse. 🔵
- **Nenhum teste de corrida cobre orçamento:** os quatro arquivos de
  concorrência do repositório são `sm7-corrida-reserva-exclusiva-api.test.ts`,
  `sm22-corrida-check-then-write-api.test.ts`,
  `lote17-agenda-concorrencia-api.test.ts` e
  `e94-recebimento-concorrencia-api.test.ts` (mais
  `s33-corrida-delete-loja-api.test.ts`). **Zero sobre aceite, zero sobre
  orçamento, zero sobre cancelamento de reserva.** A técnica de corrida
  determinística já existe e é reutilizável: `sm7-...:64-91` segura um vínculo
  não commitado numa segunda conexão do `pool` e dispara a rota com
  `Promise.resolve(agent.post(...))` — as corridas A08.1, A08.2 e A08.3 são
  reproduzíveis com o mesmo molde, sem `sleep` de sorte. 🔵
