# 04 — Renato (dono/gerente) — o sistema mede o que FECHOU e o que está ABERTO, e é cego exatamente para o meio: o "sim" da noiva que ainda não virou contrato

**Revisão ótica dos papéis**, base `980fce5` · ângulo 04

**Arquivos lidos:**
`artifacts/api-server/src/routes/dashboard.ts` ·
`artifacts/moscow-noivas/src/pages/dashboard.tsx` ·
`artifacts/moscow-noivas/src/pages/orcamentos/index.tsx` ·
`artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx` (240-300) ·
`artifacts/moscow-noivas/src/pages/noivas/conversao.tsx` ·
`artifacts/moscow-noivas/src/pages/noivas/funil.tsx` (1-120) ·
`artifacts/moscow-noivas/src/pages/reservas/index.tsx` ·
`artifacts/moscow-noivas/src/pages/vestidos/utilizacao.tsx` ·
`artifacts/moscow-noivas/src/lib/financeiro/auditoria.ts` ·
`artifacts/api-server/src/routes/orcamentos.ts` (1-200, 320-400, 400-470, 700-753) ·
`artifacts/api-server/src/routes/leads.ts` (195-215, 224-285, 330-420) ·
`artifacts/api-server/src/routes/reservas.ts` (380-410, 448-462, 918-945) ·
`artifacts/api-server/src/routes/vestidos.ts` (305-390) ·
`artifacts/api-server/src/lib/aceite-orcamento.ts` ·
`artifacts/api-server/src/lib/auditoria.ts` (1-190) ·
`lib/funil-core/src/etapas.ts` · `lib/funil-core/src/parado.ts` ·
`lib/api-zod/src/generated/types/orcamento.ts` ·
`lib/db/src/schema/contratos.ts` · `lib/db/src/schema/financeiro.ts` ·
commit `425f570` (S-M26)

**Medição:** banco `moscow_base` (o que carrega as 132 peças do legado), lido
em 2026-08-11 por `psql`, somente `SELECT`.

---

## A04.1 — Nenhum cartão do painel conta o orçamento ACEITO que não virou contrato 🟠

**Âncora:** `artifacts/api-server/src/routes/dashboard.ts:99-100` (lido)

**O que a linha diz, literal:**

```
      .from(orcamentosTable)
      .where(and(eq(orcamentosTable.lojaId, lojaId), eq(orcamentosTable.status, "ENVIADO"))),
```

E o cartão que consome esse número, `artifacts/moscow-noivas/src/pages/dashboard.tsx:440-445` (lido):

```
                <CardTitle className="text-sm font-medium text-muted-foreground">Orçamentos abertos</CardTitle>
...
                <div className="text-2xl font-bold">{dashboard?.totalOrcamentosAbertos || 0}</div>
                <p className="text-xs text-muted-foreground">Aguardando resposta</p>
```

**O defeito:** os quatro contadores do painel são `totalLeadsAtivos`,
`atendimentosHoje`, `totalOrcamentosAbertos` (**ENVIADO**) e
`totalContratosAtivos` (**contrato ATIVO**). O orçamento **APROVADO sem
contrato** — a vítima exata do gate E150 — não está em nenhum dos quatro. Não é
"aguardando resposta" (a resposta veio, e foi sim) e não é contrato. É o vão
entre dois cartões, e o painel não tem um quinto.

**O que Renato NÃO enxerga:** que existe venda ganha e não escriturada. Ele abre
"Seu dia", lê "Orçamentos abertos 0 · Contratos fechados 0" e conclui que não há
nada acontecendo — quando há um sim assinado esperando alguém reservar o vestido.

**Número medido** (`moscow_base`, 2026-08-11):

```sql
select o.id, o.status, o.aprovado_em, o.aceito_em, c.id as contrato_id
from orcamentos o left join contratos c on c.orcamento_id = o.id
where o.status='APROVADO';
--  status  |        aprovado_em         |         aceito_em          | contrato_id
-- APROVADO | 2026-08-10 22:01:13.451+00 | 2026-08-10 22:01:13.451+00 | (null)
```

O valor bruto desse orçamento, pela mesma régua de
`brutoEmCentavos`/`liquidoEmCentavos` (sem desconto — `desconto_tipo` é NULL):

```sql
select coalesce(sum(oi.valor_unitario*oi.quantidade),0) ... -- 5200.00
```

**R$ 5.200,00** — dois itens: `Monalisa` R$ 5.000,00 (vestido
`a0869a9d…`) + `abc` R$ 200,00. A noiva é **Camila**
(lead `0dad7dc3…`), etapa `ORCAMENTO_ABERTO`, `casamento_data` **NULL**.

E o agravante que fecha o caso do gate: **Camila tem ZERO bloqueios**
(`select count(*) from bloqueio_vestidos where lead_id='0dad7dc3…'` → 0), e o
vestido L014 "Monalisa" que ela aceitou **já está reservado para outras duas
noivas** — Ana (casamento 2026-07-18) e Carla (2026-09-12). O contrato dela
bate no E150, e o vestido que ela disse sim já tem dona.

**A régua atual:** `e2e/03-dashboard.spec.ts` e os testes de API do dashboard
conferem os quatro contadores que existem. Nenhum teste falha por o quinto não
existir — a ausência não tem régua, por construção.

---

## A04.2 — Não existe, em lugar nenhum do código, uma consulta agregada que cruze orçamento com contrato 🟠

**Âncora (prova da ausência, `git grep`, não `grep -r`):**

```
$ git grep -n "leftJoin(contratosTable" -- artifacts/
(zero linhas)

$ git grep -n "contratosTable.orcamentoId" -- artifacts/
artifacts/api-server/src/routes/contratos.ts:117
artifacts/api-server/src/routes/contratos.ts:222
artifacts/api-server/src/routes/orcamentos.ts:426
artifacts/api-server/src/routes/orcamentos.ts:448
```

As quatro são **de um orçamento por vez**: 117 é o filtro `?orcamentoId=` da
lista de contratos, 222 é a guarda de "esse orçamento já virou contrato" no
`POST /contratos`, 426 e 448 são a guarda do `DELETE`. Nenhuma varre a loja.

**O que a linha diz, literal** (`artifacts/api-server/src/routes/orcamentos.ts:424-426`, lido):

```
    .select({ id: contratosTable.id })
    .from(contratosTable)
    .where(eq(contratosTable.orcamentoId, orcamentoId));
```

**O defeito:** a informação **existe no banco** — `lib/db/src/schema/contratos.ts:18`
(lido) declara `orcamentoId: text("orcamento_id").unique().references(...)`, ou
seja, a ligação 1:1 está modelada e indexada. O que falta é uma consulta que a
use no plural. A tela mais próxima, `/orcamentos`, oferece o filtro
`{ chave: "APROVADO", rotulo: "Aprovados" }`
(`artifacts/moscow-noivas/src/pages/orcamentos/index.tsx:49`, lido), mas o card
que ela desenha (linhas 308-337, lido) mostra **nome · "Criado em …" · valor ·
badge de status** — e nada que diga se já virou contrato. Renato filtra
"Aprovados", vê 40 cartões idênticos e não tem como saber quais 3 são as
vítimas do gate sem abrir os 40 um por um.

O tipo da resposta confirma a impossibilidade:
`lib/api-zod/src/generated/types/orcamento.ts:13-42` (lido) — a interface
`Orcamento` tem `aceitoEm`, `aceiteVersao`, `valorTotal`, `lead`, `itens`, e
**não tem `contratoId` nem `temContrato`**. O dado não desce.

**O que Renato NÃO enxerga:** a lista de "quem já disse sim e ainda não assinou",
que é a única fila de venda com dinheiro certo em cima. É o trabalho de maior
retorno do dia dele, e é o único que o sistema não sabe montar.

**Número medido:** a consulta que falta, escrita à mão, custa uma linha:

```sql
select o.id, l.noiva_nome, o.aprovado_em
from orcamentos o
join leads l on l.id = o.lead_id
left join contratos c on c.orcamento_id = o.id
where o.status = 'APROVADO' and c.id is null;
```

Em `moscow_base` ela devolve **1 linha, R$ 5.200,00**. É pouco porque a base é
nova; o ponto é que o número é 1 e não 0, e mesmo assim nenhuma tela o mostra.

**A régua atual:** `artifacts/api-server/src/__tests__/e124-acervo-busca-api.test.ts:201-205`
(lido pelo grep) testa exatamente o caso de **UM** orçamento sem contrato via
`?orcamentoId=`. A varredura da loja não tem teste porque não tem código.

---

## A04.3 — `aprovadoEm` é gravado em três lugares e lido em nenhum 🟡

**Âncora:** `lib/db/src/schema/orcamentos.ts:25` (lido)

**O que a linha diz, literal:**

```
  aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
```

As três escritas (todas lidas):

- `artifacts/api-server/src/lib/aceite-orcamento.ts:37` — `aprovadoEm: agora,`
- `artifacts/api-server/src/routes/orcamentos.ts:372` — `...(virandoAprovado ? { aprovadoEm: new Date() } : {}),`
- `artifacts/api-server/src/routes/orcamentos.ts:725` — `.set({ status: "APROVADO", aprovadoEm: new Date(), updatedAt: new Date() })`

As leituras:

```
$ git grep -rn "aprovadoEm\|aprovado_em" -- lib/ artifacts/moscow-noivas/ e2e/
(só `lib/db/migrations/*` — DDL e snapshots. Nenhum consumidor.)
```

**O defeito:** o carimbo da aprovação existe, tem fuso, é escrito nos três
caminhos que aprovam — e não sai do banco. `Orcamento` no contrato da API não o
declara, então nenhuma tela pode mostrá-lo. `aceitoEm` (o irmão, do aceite
público) **está** exposto e é o que a noiva vê; `aprovadoEm` é o do lado de
dentro, e é justamente ele que responde "há quantos dias esse sim está parado".

**O que Renato NÃO enxerga:** a **idade** do orçamento aceito. Não há como
ordenar por "aceito há mais tempo", não há badge "parado há 12 dias", não há
corte. Nem no caso de Camila, cujo `aprovado_em` (2026-08-10 22:01) está lá,
íntegro, invisível.

**A régua atual:** nenhuma. Não há teste que leia `aprovadoEm` fora dos helpers
de fixture (`artifacts/api-server/src/__tests__/helpers.ts:267`), que o
**escrevem**.

---

## A04.4 — Aprovar um orçamento internamente não deixa linha de auditoria; o aceite público deixa 🟡

**Âncora:** `artifacts/api-server/src/routes/orcamentos.ts:707-729` (lido)

**O que as linhas dizem, literal** (722-726):

```
  // Aprovar NÃO mexe na etapa do lead — o funil só avança para
  // CONTRATO_FECHADO quando um contrato é efetivamente fechado.
  await db.update(orcamentosTable)
    .set({ status: "APROVADO", aprovadoEm: new Date(), updatedAt: new Date() })
    .where(and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)));
```

Contagem no arquivo inteiro:

```
$ git grep -n "registrarAuditoria" -- artifacts/api-server/src/routes/orcamentos.ts
artifacts/api-server/src/routes/orcamentos.ts:3    (o import)
artifacts/api-server/src/routes/orcamentos.ts:450  (acao: "ORCAMENTO_REMOVIDO")
```

**Duas ocorrências: o import e o DELETE.** Comparado com os vizinhos —
`contratos.ts` 6, `financeiro.ts` 7, `equipe.ts` 6, `reservas.ts` 5.

**O defeito:** o `POST /aprovar` roda sob `requireModulo("leads", "editar")`, ou
seja, o autor **está identificado na requisição** e é descartado. O irmão
público, `aceitarOrcamentoEnviado`
(`artifacts/api-server/src/lib/aceite-orcamento.ts:47-56`, lido), insere
`acao: "ORCAMENTO_ACEITO"` com `usuarioNome: "${noivaNome} (link público)"`.
O caminho de dentro da loja — o que uma vendedora usa quando a noiva diz sim no
balcão — não escreve nada. O mesmo vale para `POST /recusar` (731-751, lido) e
para o `PATCH` que muda `descontoTipo`/`descontoValor` (320-400, lido): o
desconto **é o preço da venda** e sua alteração não tem autor.

**O que Renato NÃO enxerga:** "quem aprovou este orçamento de R$ 5.200,00, e
quando?" e "quem deu esse desconto?". A trilha da loja responde quem estornou
uma parcela de R$ 50,00 e quem removeu uma cabine, e não responde quem
transformou uma proposta em acordo fechado — que é o estado do qual, por
`recusaConteudoCongelado` (linha 71-85, lido), **não se volta**.

**A régua atual:** `artifacts/api-server/src/__tests__/sm24-estados-terminais-api.test.ts`
cobre a trilha do cancelamento de reserva; não há teste que exija linha de
auditoria na aprovação.

---

## A04.5 — `RESERVA_CANCELADA` existe no servidor e falta no espelho da tela: o desfazer do gate sai como código cru e não é filtrável 🟡

**Âncoras (as duas lidas):**

- `artifacts/api-server/src/lib/auditoria.ts:150` —
  `RESERVA_CANCELADA: "Reserva cancelada (vestidos liberados)",`
- `artifacts/moscow-noivas/src/lib/financeiro/auditoria.ts:17-63` (`ROTULO_ACAO`)
  e `:66-102` (`ACOES_FILTRAVEIS`) — **`RESERVA_CANCELADA` não aparece em
  nenhum dos dois.**

**O que a linha diz, literal** (`artifacts/moscow-noivas/src/lib/financeiro/auditoria.ts:11-15`):

```
/**
 * ESPELHO de `ROTULO_ACAO` em api-server/src/lib/auditoria.ts, que rotula o
 * CSV — tela e planilha têm de chamar a mesma coisa pelo mesmo nome. Aqui o
 * mapa é FROUXO (`Record<string, …>` com fallback no código cru) de propósito:
 * ação nova nasce no servidor, e tela velha lendo trilha nova não pode quebrar.
 */
```

**Número medido** (diff das duas listas, feito no repositório):

```
servidor 38 · front rótulo 35 · front filtro 35
servidor \ rótulo-front: [ RESERVA_CANCELADA, USUARIO_EXCLUIDO, LOJA_EXCLUIDA ]
servidor \ filtro-front: [ RESERVA_CANCELADA, USUARIO_EXCLUIDO, LOJA_EXCLUIDA ]
```

`USUARIO_EXCLUIDO` e `LOJA_EXCLUIDA` são atos globais (`lojaId: null`, ver
`artifacts/api-server/src/lib/auditoria.ts:185-190`, lido) e não caem na trilha
de uma loja. **Sobra uma, e é a que interessa a este ângulo:
`RESERVA_CANCELADA`** — escrita em `artifacts/api-server/src/routes/reservas.ts:171`
(lido), a única no arquivo que não é um `*_REMOVIDA`.

**O defeito:** o comentário promete espelho, e o espelho parou uma ação atrás.
Na tela de auditoria a linha aparece com o código cru na coluna Ação
(`artifacts/moscow-noivas/src/pages/financeiro/auditoria.tsx:253` — lido:
`{ROTULO_ACAO[item.acao] ?? item.acao}`) e o select de filtro não a oferece
(`:140-143`, lido).

**O que Renato NÃO enxerga:** cancelar a reserva é **desfazer o gate** — solta
o vestido e derruba o contrato que aquele orçamento aceito ia gerar. É o gesto
que ele mais precisaria auditar no fluxo inteiro, e é o único da família que a
tela dele não sabe nomear nem filtrar.

**A régua atual:** `artifacts/moscow-noivas/src/lib/financeiro/auditoria.test.ts`
testa `acaoFiltravel("CONTA_PAGA")` e `acaoFiltravel("XPTO")`; não há teste que
compare as duas listas. É por isso que a divergência passou.

---

## A04.6 — A conversão é medida pela ETAPA do lead, e o aceite não move a etapa: o "sim" não converte, não perde, e não tem tempo 🟡

**Âncoras (todas lidas):**

- `artifacts/api-server/src/routes/leads.ts:201` —
  ``convertidos: sql<number>`count(*) filter (where ${inArray(leadsTable.etapa, [...ETAPAS_CONVERTIDA])})` ``
- `lib/funil-core/src/etapas.ts:31` —
  `export const ETAPAS_CONVERTIDA: EtapaLead[] = FUNIL_LEAD.slice(FUNIL_LEAD.indexOf("CONTRATO_FECHADO"));`
- `artifacts/api-server/src/routes/orcamentos.ts:722` — "Aprovar NÃO mexe na etapa do lead"
- `artifacts/api-server/src/lib/aceite-orcamento.ts:28-58` — a transação inteira
  do aceite público: grava `aceitoEm`, `aceiteVersao`, `aceiteHash`, `status`,
  `aprovadoEm`, `updatedAt` e a auditoria. **Nenhuma chamada a
  `avancarEtapaLead`.** O lead fica onde estava.

**O defeito:** a régua da conversão é `etapa >= CONTRATO_FECHADO`. Como nem o
"Aprovar" interno nem o aceite público mexem na etapa, a noiva que disse sim
permanece em `ORCAMENTO_ABERTO`. No relatório
`artifacts/moscow-noivas/src/pages/noivas/conversao.tsx:169-184` (lido) ela cai
no denominador de "Noivas", fora de "Fecharam" e fora de "Perderam" — um limbo
sem rótulo. No kanban do funil ela ocupa a mesma coluna de quem acabou de
receber um rascunho.

Confirmado no banco: o lead de Camila, com o orçamento **aceito ontem**, está em
`etapa = 'ORCAMENTO_ABERTO'`.

**O que Renato NÃO enxerga:** (a) **quantos orçamentos viram contrato** — o
relatório mede lead→contrato, nunca orçamento→contrato; (b) **em quanto tempo** —

```
$ git grep -in "tempo médio\|tempoMedio\|ciclo de venda\|diasAteContrato\|leadTime" -- artifacts/ lib/
(zero linhas em código; único hit é um comentário sobre vencimento no openapi.yaml)
```

Não existe nenhuma medida de duração no funil. "Do orçamento ao contrato leva
quantos dias?" não tem onde ser respondida.

E o fallback humano também não pega: a fila "Precisam de contato" do painel roda
`leadParado` (`lib/funil-core/src/parado.ts:54-70`, lido), que só acende acima
de `DIAS_ATENCAO = 7` **sem contato**. Uma noiva que aceitou e com quem a
vendedora conversa a cada 3 dias nunca acende — apesar de o vestido dela estar
solto e o contrato, impossível.

**A régua atual:** `e2e/20-conversao-leads.spec.ts` cobre a tela de conversão
como ela é. Nenhum teste afirma que orçamento aceito deveria contar em algum
lugar.

---

## A04.7 — "Utilização do acervo" mede reserva e contrato em EIXOS DE DATA DIFERENTES, então a subtração não dá a peça travada 🟡

**Âncora:** `artifacts/api-server/src/routes/vestidos.ts:347-372` (lido)

**O que as linhas dizem, literal:**

```
    // Reservas de casamento ativas com data no período.
    db
      .select({ vestidoId: bloqueioVestidosTable.vestidoId, qtd: count() })
      .from(bloqueioVestidosTable)
      .where(and(
        ...
        ...recorte(bloqueioVestidosTable.casamentoData),
      ))
```

e, quinze linhas abaixo, para a mesma linha da tabela:

```
      .where(and(
        ...
        eq(contratosTable.status, "ATIVO"),
        ...recorte(contratosTable.fechadoEm),
      ))
```

**O defeito:** `reservas` é recortado por **data do casamento**; `contratos` é
recortado por **data de fechamento do contrato**. São a mesma peça na mesma
linha, contadas em dois calendários. A coluna "Reservas" e a coluna "Contratos"
não são comparáveis, e portanto "reservas − contratos" — a conta que daria
"reservado e não vendido" — não significa nada.

**Número medido** (derivado do código, período padrão "Últimos 12 meses" =
`de = 2025-08-11`, `ate = 2026-08-11`, de `utilizacao.tsx:32-37,63-66`, lido):

- Vestido A, contrato fechado em **2026-08-01** para casamento em
  **2027-05-15**, R$ 5.000,00. `casamentoData` cai fora da janela → **reservas
  0**; `fechadoEm` cai dentro → **contratos 1 · receita R$ 5.000,00**. A linha
  diz que o vestido está reservado zero vezes no exato ano em que foi vendido.
- Vestido B, casamento em **2026-06-27** (dentro), contrato fechado em
  **2025-03-10** (fora). Linha: **reservas 1 · contratos 0 · receita "—"**. Ele
  aparece como peça que ocupa arara e não fatura — e é uma venda de R$ 5.000,00
  cumprida no período.

E o pior caso é o silencioso: `usoTotal(v) = provas + reservas + contratos`
(`utilizacao.tsx:51-53`, lido) e o badge "sem uso" só acende com `usoTotal === 0`
(`:181, 200-204`). Um vestido **reservado e nunca contratado** tem `usoTotal = 1`
→ **não** ganha o badge, some no meio da tabela com receita "—" e curva C. É
exatamente o vestido travado sem venda, e é o que a tela mais disfarça.

**Medição no banco** de quanto isso vale hoje (`moscow_base`):

```sql
select count(*) filter (where casamento_data >= date '2026-08-11') as futuras,
       count(*) filter (where casamento_data <  date '2026-08-11') as passadas,
       count(distinct vestido_id) as pecas_travadas
from bloqueio_vestidos where tipo='RESERVA_CASAMENTO' and cancelado_em is null;
--  futuras | passadas | pecas_travadas
--       89 |       27 |            103
```

**116 reservas de casamento ativas, sobre 103 peças distintas — 78% das 132 do
acervo — e `select count(*) from contratos` devolve 0.** Cento e três vestidos
comprometidos, nenhuma venda escriturada, e nenhuma tela do sistema soma isso.
(A base é a carga do legado, então o zero de contratos é de origem, não de
vazamento; o que o número prova é a **cegueira**: qualquer que fosse o valor
real, não há onde lê-lo.)

**A régua atual:** nenhum teste compara os dois eixos de data da
`/vestidos/utilizacao`.

---

## A04.8 — As reservas cujo casamento já passou saem da tela por padrão, e são as mais suspeitas 🔵

**Âncora:** `artifacts/moscow-noivas/src/pages/reservas/index.tsx:35` (lido)

**O que a linha diz, literal:**

```
  const paramsReservas = { futuras: passadas ? ("false" as const) : ("true" as const) };
```

e o servidor, `artifacts/api-server/src/routes/reservas.ts:397` (lido):

```
      ...(futuras === "true" ? [gte(bloqueioVestidosTable.casamentoData, hoje)] : []),
```

**O defeito:** o "Livro de reservas" abre em `futuras=true`. Uma reserva **não
cancelada** cujo casamento já passou não aparece — está atrás do botão "Ver
reservas anteriores" (`:71-73`, lido), num modo cujo cabeçalho promete
"Casamentos já realizados". Só que uma reserva ativa com casamento no passado e
**sem contrato** não é um casamento realizado: é uma reserva que ninguém fechou
nem cancelou.

**Número medido:** das 116 reservas ativas de `moscow_base`, **27 têm
`casamento_data` anterior a 2026-08-11** — 23% do livro fora da tela padrão. E
as 116 têm o lead em `etapa = 'NOVO'`
(`select l.etapa, count(*) … group by 1` → `NOVO | 116`), então a coluna de
etapa que a tela desenha (`:136-140`, lido, `etapaLabel(r.lead.etapa)`) escreve
"Novo" 116 vezes — informação constante é informação nenhuma.

**O que Renato NÃO enxerga:** a fila de "reserva viva, casamento passado, sem
contrato" — o vestido que está preso no papel e livre na arara, ou o contrário.

---

## Visto de passagem

- **Os números de dinheiro do painel NÃO mentem — eles se calam.**
  `lib/db/src/schema/financeiro.ts:14` (lido):
  `contratoId: text("contrato_id").notNull().references(() => contratosTable.id, ...)`.
  Parcela só nasce de contrato, então `receberProximos30Dias`
  (`dashboard.ts:124-139`), a projeção (`projecao.tsx:65-99`, só
  `useListParcelas`/`useListContasPagar`/`useListSaldoReferencia`/
  `useListPagamentos`) e a DRE (`dre.tsx:62`, `useGetDre`) **não contam
  orçamento aprovado como receita**. Está certo — e é o outro lado da A04.1: os
  R$ 5.200,00 de Camila não aparecem em cartão nenhum, nem inflado nem
  reservado. Registro aqui porque a pergunta "esse número mente?" foi feita e a
  resposta, com âncora, é não.
- `artifacts/api-server/src/routes/reservas.ts:455` (lido) recusa
  `RESERVA_CASAMENTO` sem `casamentoData` com 400
  `RESERVA_SEM_DATA_DE_CASAMENTO`. Camila tem `casamento_data` NULL no lead —
  então, além de ninguém ter reservado, a vendedora **não conseguiria** reservar
  sem antes preencher a data do casamento. É um segundo portão antes do E150, e
  ele não aparece em nenhuma mensagem do fluxo do orçamento. (Pertence ao
  ângulo 02, mas foi visto daqui.)
- `artifacts/api-server/src/routes/reservas.ts:925-928` (lido) — o comentário já
  registrado: "no banco de desenvolvimento **61 das 63 avarias** vivem em
  bloqueio sem noiva (61 deles `RESERVA_CASAMENTO`, o que é suspeito por si —
  virou sobra)". Continua aberto, e conversa com a A04.7.
- `artifacts/moscow-noivas/src/pages/noivas/conversao.tsx:290` (lido) — a coluna
  "Reservou" do desempenho por vendedora vem de
  `atendimentosTable.desfecho = 'RESERVOU'` (`leads.ts:376`), que é o **desfecho
  declarado do atendimento**, não a existência de um `bloqueio_vestidos`. São
  dois "reservou" com nomes iguais e fontes diferentes na mesma tela do dono.
  Não medi a divergência; anoto a âncora.
- A tabela `vestidos` de `moscow_base` (`\d vestidos`, lido) tem `categoria` e
  **não tem** coluna "tipo de peça" — as 132 peças sem classificar da S-A27 são
  atributo de catálogo, não coluna do acervo. Nenhuma tela lista "peça sem
  classificação", mas isso é ângulo de acervo, não deste.
