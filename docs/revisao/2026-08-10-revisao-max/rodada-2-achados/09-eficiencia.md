# Ângulo 9 — eficiencia
**Rodada 2, base 89b38c8** · localizador + cético por achado

Quatro achados sobreviveram ao cético, os quatro na mesma família: a classe que
o B10/E91 fechou — "o Postgres NÃO cria índice para FK" — deixou tabelas de
fora, e cada uma delas está no caminho de uma tela quente. Três 🟡 e um 🔵.
Nenhum enumera sítio de S-M9, S-M10, S-M17 ou S-M18.

## Sobreviventes

### 1. 🟡 `registros_cobranca` sem índice em `lead_id` — o agregado mais chamado do sistema varre a tabela inteira

**Âncora:** `lib/db/src/schema/financeiro.ts:225`

**Evidência.** `registrosCobrancaTable` é definida nas linhas 225–234 e fecha
SEM bloco de índices — nem `lead_id`, nem `loja_id`. E
`ultimo-contato.ts:23` faz
`.where(inArray(registrosCobrancaTable.leadId, leadIds)).groupBy(registrosCobrancaTable.leadId)`.

**Mecanismo.** O Postgres não cria índice para FK — a regra que o próprio
schema de parcelas registra no B10/E91 (`financeiro.ts:59-62`: "o Postgres NÃO
cria índice para FK — sem estes dois ... varrem a tabela inteira de TODAS as
lojas"). `registros_cobranca` ficou fora dessa varredura. `ultimoContatoPorLead`
filtra por `inArray(leadId, ...)` e é chamado em 5 pontos quentes: `listLeads`
(`leads.ts:144` — cada página de /noivas), `leads/parados` (`leads.ts:243` —
que o SINO polla a cada 5 min em toda tela, `sino-notificacoes.tsx:88-92`),
`listParcelas` (`financeiro.ts:143` — /receber, /cobranca, /mensagens,
projeção) e o detalhe do lead (`leads.ts:464`, `547`). O histórico da ficha
(`leads.ts:729`) filtra pela mesma coluna. Abrir o funil dispara 12 colunas
(`funil.tsx:189` mapeia ETAPAS_LEAD, 12 etapas) = 12 chamadas de `listLeads` =
12 seq scans da tabela inteira num render. Cada registro nasce de um clique de
cobrança/contato — a tabela só cresce.

**Consequência.** Com ~15.000 registros acumulados (18 meses de fila de
cobrança a ~30 contatos/dia), o sino varre 15.000 linhas a cada 5 minutos por
pessoa logada (4 pessoas = 48 varreduras/hora), e abrir o funil custa 12
varreduras de 15.000 linhas para desenhar 12 colunas de 25 noivas — onde um
índice em `lead_id` responderia com ~250 lookups. Nenhum real se perde; o que
cresce é a latência da tela mais aberta do sistema e a carga do banco,
linearmente com o histórico.

**Cético (🟡 confirmada).** A âncora confere: `financeiro.ts:225-234` define
a tabela sem bloco de índices, e as migrações versionadas
(`0000_flat_rachel_grey.sql:659-661`) criam só as FKs — zero `CREATE INDEX`
para a tabela. Não há guarda em nenhuma camada. Os pontos quentes verificam:
`ultimo-contato.ts:23` filtra por `inArray(leadId, ...)`, chamado em
`leads.ts:144/243/464/547` e `financeiro.ts:143`; `leads.ts:68` e `729`
filtram a mesma coluna; o sino polla `leads/parados` com `refetchInterval`
(`sino-notificacoes.tsx:88-92`, no diretório `artifacts/moscow-noivas`); o
funil dispara 12 `useListLeads` independentes (`funil.tsx:189` + `289`). Não é
duplicata de nenhum dos 15 fechos nem sítio das 4 sobras abertas. Defeito real
pela régua do B10/E91; o gatilho dói só com meses de acúmulo.

**Sobra que enumera:** nenhuma.

### 2. 🟡 `orcamentos` sem índice em `loja_id`/`lead_id` e `orcamento_itens` sem índice em `orcamento_id` — lista, fila de mensagens e dashboard varrem as tabelas de todas as lojas

**Âncora:** `lib/db/src/schema/orcamentos.ts:43`

**Evidência.** `}, (t) => ({ publicoTokenUnq: uniqueIndex("orcamentos_publico_token_unq").on(t.publicoToken), }));`
— o ÚNICO índice de `orcamentos` é o do token público; `orcamentoItensTable`
(linhas 50–70) fecha sem bloco de índice nenhum, e `routes/orcamentos.ts:165`
faz `db.select().from(orcamentoItensTable).where(inArray(orcamentoItensTable.orcamentoId, ids))`
em toda listagem.

**Mecanismo.** Toda consulta de orçamento começa em
`eq(orcamentosTable.lojaId, lojaId)` (`routes/orcamentos.ts:130`) e as quentes
somam `status` (fila de /mensagens pede `status=ENVIADO`,
`mensagens/index.tsx:109`) ou `leadId` (ficha da noiva). O dashboard conta
ENVIADO por loja em todo load da home (`dashboard.ts:100`). Sem índice em
`loja_id`, cada uma é seq scan da tabela de TODAS as lojas — e a listagem
paginada roda DUAS (count + página, `orcamentos.ts:139-141`). Em seguida, o
`valorTotal` de cada orçamento da página busca os itens por
`inArray(orcamentoId, ids)` (linha 165) — `orcamento_itens` também não tem
índice em `orcamento_id` (o irmão `contrato_itens` TEM: `contratos.ts:85`
`contrato_itens_contrato_idx`), então é um terceiro seq scan. É a mesma classe
que o B10/E91 fechou em parcelas, contratos e leads — estas duas tabelas
ficaram de fora.

**Consequência.** Com 3 lojas × 800 orçamentos (2.400 linhas) e ~7.000 itens,
cada página de /orcamentos custa 2 varreduras de 2.400 + 1 varredura de 7.000
para devolver 24 linhas; a fila de mensagens e o card "orçamentos abertos" do
dashboard pagam a varredura cheia a cada abertura de home. Com os índices,
seriam ~24 lookups. Custo hoje em dezenas de ms; cresce linear com o histórico
e multiplica pelo número de lojas.

**Cético (🟡 confirmada).** Âncoras conferidas neste run:
`lib/db/src/schema/orcamentos.ts:41-43` tem só o `uniqueIndex` do
`publicoToken`, e `orcamentoItensTable` (linhas 49–69) fecha sem índice; a
varredura de todos os `CREATE INDEX` das 13 migrações de `lib/db/migrations`
confirma que não há guarda em camada nenhuma — enquanto os irmãos da mesma
classe (`contrato_itens_contrato_idx`, `contratos_loja_fechado_em_idx`,
`leads_loja_etapa_idx`, `parcelas_loja_vencimento_idx`,
`itens_estoque_loja_idx`) todos existem, provando que o B10/E91 fechou a
classe e deixou estas duas tabelas de fora. Os sítios quentes são reais:
`routes/orcamentos.ts:130` filtra por `lojaId`, `139-141` roda count + página
(duas passadas), `165` faz `inArray` em `orcamento_itens.orcamentoId`
(terceira), e `dashboard.ts:99-100` conta ENVIADO por loja em todo load da
home. FK em Postgres não cria índice implícito, então `references()` não
salva. Não é duplicata de nenhum dos 15 fechados nem sítio das 4 sobras
abertas. Seq scans de ~11.800 linhas para devolver 24 custam dezenas de ms
hoje e crescem linear com o histórico — defeito real de custo baixo, sem perda
de dinheiro ou dado.

**Sobra que enumera:** nenhuma.

### 3. 🟡 `bloqueio_vestidos` sem índice btree em `loja_id` — cada escolha de data no acervo varre os bloqueios de todas as lojas

**Âncora:** `lib/db/src/schema/atendimentos.ts:32`

**Evidência.** `bloqueioVestidosTable` é definida nas linhas 32–72 e fecha sem
bloco de índices; os únicos índices da tabela vivem em
`apply-sql-extras.ts:41-47` (EXCLUDE gist em `vestido_id` + daterange,
PARCIAL: `WHERE ocupacao_inicio IS NOT NULL AND cancelado_em IS NULL`).

**Mecanismo.** `buscarBloqueiosAtivos({ lojaId })`
(`disponibilidade.ts:407-431`) filtra `eq(lojaId)` + `isNull(canceladoEm)` — o
índice gist parcial é por `vestido_id` e não serve a consulta por loja, e
btree nenhum existe. O chamador quente é o batch de disponibilidade
(`vestidos.ts:232`): a tela do acervo dispara
`GET /vestidos/disponibilidade?data=` a cada data escolhida
(`vestidos/index.tsx:219`) e o detalhe do vestido a cada abertura
(`vestidos/[id].tsx:183`) — cada chamada é um seq scan da tabela inteira, de
todas as lojas, com dois LEFT JOINs em cima. A tabela cresce com toda reserva,
prova e manutenção e nunca encolhe (soft-cancel via `cancelado_em`).

**Consequência.** Com 3 lojas × 2 anos de operação (~4.000 bloqueios),
escolher uma data no acervo com a noiva na cabine custa varrer 4.000 linhas +
joins para responder pelos vestidos de UMA loja — e a vendedora testa várias
datas em sequência. Um índice `(loja_id, cancelado_em)` reduziria a ~1.300
lookups da loja. Sem perda de dado; latência da tela de venda crescendo com o
histórico das outras lojas.

**Cético (🟡 confirmada).** O achado fica de pé em todas as âncoras lidas
neste run: `atendimentos.ts:32-72` define a tabela sem bloco de índices —
enquanto `atendimentosTable:138` e `ausenciasTable:217`, no MESMO arquivo,
declaram índices por loja; a assimetria é visível. O único índice é o EXCLUDE
gist de `apply-sql-extras.ts:41-47`, por `(vestido_id, daterange)` e PARCIAL
em `ocupacao_inicio IS NOT NULL AND cancelado_em IS NULL` — a consulta batch
(`disponibilidade.ts:407-431`) filtra `eq(lojaId)`+`isNull(canceladoEm)` sem o
predicado de `ocupacao_inicio`, logo nem o índice parcial é aplicável, e
`loja_id` não está nele. Grep em `lib/db/migrations` e `docs/migracoes` não
devolve NENHUM btree em `bloqueio_vestidos.loja_id` (só a FK em
`0000_flat_rachel_grey.sql:617`, e Postgres não indexa coluna de FK
automaticamente). O caminho quente confere — `vestidos.ts:232` chama
`buscarBloqueiosAtivos({lojaId})` com dois LEFT JOINs, disparado pelo acervo a
cada data escolhida e pelo detalhe a cada abertura, e o soft-cancel garante
que a tabela só cresce. Não é duplicata de nenhum dos 15 fechados nem das 4
sobras abertas. Seq scan de ~4.000 linhas custa milissegundos hoje (não é 🟠),
mas é defeito real de custo baixo e crescente na leitura mais quente da venda
— mais que 🔵 limpeza.

**Sobra que enumera:** nenhuma.

### 4. 🔵 No recorte `?leadId=` da lista de orçamentos, os itens descem do banco duas vezes

**Âncora:** `artifacts/api-server/src/routes/orcamentos.ts:150`

**Evidência.** `...(leadId ? { itens: true as const } : {}),` dentro do `with`
do `findMany` (linha 150) — e logo abaixo, incondicionalmente:
`const itensDaPagina = ids.length ? await db.select().from(orcamentoItensTable).where(inArray(orcamentoItensTable.orcamentoId, ids)) : [];`
(linhas 164–166).

**Mecanismo.** Quando `leadId` vem na query (ficha da noiva), o relational
builder já traz os itens de cada orçamento para a resposta — e a consulta
seguinte, que existe para calcular o `valorTotal` da página pela régua única
(`liquidoEmCentavos`), busca EXATAMENTE as mesmas linhas de novo. As duas
leituras são redundantes nesse ramo: o cálculo poderia consumir `o.itens`
quando a relação já veio. No ramo sem `leadId` (listagem geral) não há
duplicação — a segunda consulta é a única.

**Consequência.** Custo pequeno e constante — 1 query e um punhado de linhas a
mais por abertura de ficha de noiva (1–3 orçamentos, ~5–10 itens duplicados).
É limpeza: o defeito é de clareza (duas fontes para o mesmo dado na mesma
resposta), não de escala.

**Cético (🔵 confirmada).** Confirmado por leitura direta:
`routes/orcamentos.ts:150` inclui `itens` no `with` quando há `leadId`, e as
linhas 164–166 rebuscam as mesmas linhas de `orcamento_itens`
incondicionalmente para o `valorTotal` (linhas 173–181). Nenhuma camada
elimina a redundância, não é duplicata dos 15 fechos nem sítio das 4 sobras
abertas. Custo real porém mínimo (1 query por ficha de noiva) — é
limpeza/clareza, exatamente 🔵.

**Sobra que enumera:** nenhuma.

## Refutados

Nenhum candidato chegou ao cético e caiu — os quatro reportados sobreviveram
com a severidade confirmada. Três candidatos foram deliberadamente NÃO
reportados pelo localizador, com o porquê registrado na Cobertura abaixo.

| Título | Âncora | Refutação do cético |
|---|---|---|
| — | — | — |

## Cobertura

**Teto atingido: não.** Cobertura sem teto — 4 achados verdadeiros, todos
lidos neste run.

**Notas do localizador.** Três candidatos foram deliberadamente NÃO
reportados, com o porquê:

1. **`atendimentos` sem índice `(loja_id, inicio)`** — a janela de/ate da
   agenda e do sino filtra por `inicio`, mas a unique
   `(loja_id, vendedora_id, inicio)` de `atendimentos.ts:133` dá ao planner um
   btree com prefixo `loja_id` e `inicio` como coluna de filtro no próprio
   índice; o custo residual é varrer as entradas da loja, ordens de grandeza
   menor que os seq scans dos achados reportados.
2. **`contrato_bloqueios.bloqueio_id` sem índice para o lookup reverso**
   (`reservas.ts:154`, `contratos.ts:325-336`) — a PK
   `(contrato_id, bloqueio_id)` não serve o prefixo, mas a tabela é minúscula
   (1–2 linhas por contrato) e as consultas já vêm limitadas por `inArray`
   pequeno.
3. **A busca do balcão em /receber e a fila de /mensagens derrubarem a janela
   e baixarem TODAS as parcelas abertas da loja** é decisão documentada e
   testada (E124/B4, `receber.tsx:132-139` — "a pessoa na sua frente não tem
   janela"), não defeito.

A invalidação do TanStack está saudável: `chavesDoCaixa`
(`lib/financeiro/cache.ts`) cobre o movimento de caixa por prefixo de loja, o
`staleTime` tem piso declarado (`lib/cache.ts`) e as queries por linha
(`historico-contato`) são lazy por `enabled`. N+1 clássico de rota não sobrou
nenhum que se tenha conseguido ancorar — os laços com `await` em rotas são
escrita transacional deliberada (renumeração de parcelas
`contratos.ts:1401`, fechamento de comissão `comissao.ts:1208`, `FOR UPDATE`
ordenado `contratos.ts:535`). Nenhum dos achados enumera sítio de
S-M9/S-M10/S-M17/S-M18.
