# Ângulo 5 — contrato-tela-servidor
**Rodada 2, base 89b38c8** · localizador + cético por achado

Seis achados sobreviveram ao cético; nenhum foi refutado. O cético mudou duas
coisas, e as duas ficam registradas onde valem: a severidade do sétimo par
criar×editar subiu de 🔵 para 🟡, e duas consequências do achado da parcela
negativa estavam ERRADAS no diagnóstico do localizador — a versão corrigida é a
que está abaixo, com a errada anotada por extenso, porque é o que este arquivo
existe para guardar.

## Sobreviventes

### 1. 🟠 O spec não exporta `parcela.origem`, e a tela volta a fazer a pergunta errada que a S26 consertou no servidor — reparo cobrado antes do carnê trava o "Gerar plano" para sempre

**Âncora:** `artifacts/moscow-noivas/src/pages/contratos/[id].tsx:613` ·
`artifacts/api-server/src/routes/contratos.ts:1342` ·
`lib/api-spec/openapi.yaml:6268–6295` ·
`artifacts/api-server/src/routes/reservas.ts:826`

**Evidência.** A tela decide na linha 538: `{parcelas.length > 0 ? (` …lista…
e na 613: `) : podeCriarParcela && contratoAtivo ? (` …formulário Gerar plano.
O servidor, pós-S26, pergunta certo (contratos.ts:1342):
`const jaTemCarne = contrato.parcelas.some((p) => p.origem === "PLANO");`. O
schema `Parcela` do spec (openapi.yaml:6268–6295) declara
id/numero/valorPrevisto/status/… e NÃO declara `origem`. E reservas.ts:826
grava `origem: "AVARIA"` com o comentário: "S26: o reparo NÃO é carnê — é o
que permite ao contrato ainda gerar o dele."

**Mecanismo.** A cobrança de avaria (reservas.ts:826) e a parcela avulsa do
E71 criam parcelas com origem AVARIA/AVULSA num contrato ainda sem carnê — a
ordem do balcão que a própria S26 documenta. O servidor aceita o gerar-plano
nesse estado (só recusa quando existe origem PLANO). Mas o schema `Parcela` do
OpenAPI nunca ganhou o campo `origem`: o `GetContratoResponse.parse` STRIPA a
coluna que o banco devolve (api.ts:5921–5942 é `zod.object` sem passthrough —
zod não-strict descarta chave desconhecida; o parse está em contratos.ts:742),
então a tela não tem como fazer a pergunta certa — e usa a heurística pré-S26
`parcelas.length > 0` (linhas 538/613) para decidir se mostra o formulário. A
tela é o ÚNICO caller de `useGerarPlanoParcelas`. Com uma única parcela de
avaria, a tela renderiza a lista e o formulário de gerar plano deixa de
existir; não há outro caminho na UI.

**Consequência.** Peça volta avariada, o conserto de R$ 350,00 é cobrado, e o
contrato de R$ 5.000,00 fica sem botão "Gerar plano": o card mostra "Total do
plano R$ 350,00" com o alerta vermelho de divergência (linha 604) e nenhuma
ação. A venda de R$ 5.000,00 é parcelada fora do sistema — o MESMO prejuízo
que a S26 mediu, agora vivo na camada da tela porque o contrato OpenAPI nunca
transportou o conserto.

**Veredito do cético.** Confirmado em todas as âncoras; não é duplicata (a
S-M3 é outra camada) nem sítio de sobra aberta. O único contorno é remover a
parcela de avaria, gerar o plano e recobrar — obscuro, não sinalizado na UI e
inviável se o reparo tiver recebimento parcial. Por isso 🟠 e não 🔴: bloqueia
fluxo, não corrompe dado. **Enumera sobra:** nenhuma.

### 2. 🟡 `OrcamentoItemInput.quantidade` sem piso e sem inteiro no CRIAR (o EDITAR tem `minimum: 1`) — e o `onAddItem` da tela também não tem a guarda que o `onEditarItem` tem

**Âncora:** `lib/api-spec/openapi.yaml:5932` ·
`artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:485` ·
`artifacts/api-server/src/routes/orcamentos.ts:470`

**Evidência.** openapi.yaml:5932 (`OrcamentoItemInput`):
`quantidade: { type: integer }` × openapi.yaml:5938 (`OrcamentoItemUpdate`):
`quantidade: { type: integer, minimum: 1 }`. O zod gerado do Add é
`zod.number().optional()` (api.ts:5174), sem `.min` e sem `.int`; o do Update
tem `.min(1)` (api.ts:5202). A tela ([id].tsx:485):
`const quantidade = Number(values.quantidade) || 1;` sem checagem — o editar
(linhas 540/545) faz `Math.trunc(...)` e recusa `< 1`, 55 linhas abaixo. A
rota (orcamentos.ts:470) insere via `...parsed.data` sem guarda, e não há
check constraint no schema nem nas migrations.

**Mecanismo.** As três camadas erram juntas e só no criar: o spec declara
`minimum: 1` no Update e nada no Input; o zod gerado do Input aceita -1 e 2.5
(o orval nem emite `.int()` do `type: integer`); a tela, campo
`<Input inputMode="numeric">` de texto livre, envia `Number("-1") = -1`. O
servidor insere via spread e `brutoEmCentavos` (dinheiro.ts:38) multiplica:
`centavos(valorUnitario) * quantidade` — quantidade negativa SUBTRAI do total.
Decimal ("1.5") passa o zod e estoura na coluna `integer` do Postgres → 500.

**Consequência.** Orçamento com vestido R$ 5.000,00 e serviço R$ 800,00 com
Qtd digitada "-1": 5.000×1 + 800×(−1) = R$ 4.200,00 em silêncio; a noiva
aceita e a guarda VALOR_TOTAL_NAO_BATE do POST /contratos (contratos.ts:268–
280) deriva dos mesmos itens e PRENDE o contrato ao total errado — o sistema
inteiro fica consistente em R$ 4.200,00 numa venda de R$ 5.800,00. Qtd "1.5" →
500 "Tente novamente" sem dizer o campo.

**Veredito do cético.** Confirmado camada por camada; não duplica fecho de
hoje. 🟡 pelo gatilho raro: o campo nasce "1", e o erro plausível "1,5" vira
`NaN || 1 = 1` e não dispara. **Enumera sobra:** S-M9 (é sítio legítimo da
varredura criar×editar).

### 3. 🟡 `ContaPagarInput.valorPrevisto` e `Recorrencia.valor` sem piso — a anatomia exata da S-M2 ("o guard de um centavo existia só no navegador") nas portas de CRIAÇÃO que a S-M2 não varreu

**Âncora:** `lib/api-spec/openapi.yaml:6376` ·
`artifacts/api-server/src/routes/financeiro.ts:174–178` ·
`artifacts/api-server/src/lib/recorrencias.ts:137` ·
`artifacts/api-server/src/lib/caixa.ts:260`

**Evidência.** openapi.yaml:6376 (`ContaPagarInput`):
`valorPrevisto: { type: number }` — sem minimum, enquanto a irmã
`PagarContaInput` (linha 6387) ganhou `minimum: 0.01` na S-M2 e a parcela
avulsa (linha 3371) tem `exclusiveMinimum: 0`. `RecorrenciaInput.valor` (6488)
e `RecorrenciaUpdate.valor` (6496): `valor: { type: number }`. A rota
(financeiro.ts:174–178) insere `...parsed.data` cuja única guarda é
`colaboradorId`; o schema (financeiro.ts:88, 213) é decimal notNull sem check.
As telas guardam sozinhas: pagar.tsx:326
`if (valor === null || Number.isNaN(valor) || valor <= 0)`, folha.tsx:171
idem.

**Mecanismo.** O zod gerado do spec é a única validação do servidor — padrão
do repo, dito na própria anotação da S-M2 em 6379–6381. Sem minimum,
`POST /lojas/{id}/financeiro/contas-pagar` com valorPrevisto -3200 ou 0
responde 201 e a linha entra PREVISTA. Toda a leitura financeira soma essa
conta como saída: `abertoEmCentavos` (caixa.ts:260) soma a conta negativa —
uma saída de -R$ 3.200,00 AUMENTA o caixa projetado. Recorrência com valor
negativo repete a conta todo mês via `montarContasDaCompetencia`
(recorrencias.ts:123/141), que copia `r.valor` sem olhar o sinal.

**Consequência.** Uma conta a pagar de -R$ 3.200,00 (aceita via API; a tela
recusa) faz o "a pagar" cair R$ 3.200,00 e a curva de `projetarCaixa` subir
R$ 3.200,00 acima do real — o alerta de caixa cala exatamente sobre um buraco
desse tamanho, a mesma cegueira que a S-M4 acabou de pagar para medir.
Recorrência de SALÁRIO com valor -R$ 2.000,00 gera uma "despesa" que INFLA o
caixa todo mês.

**Veredito do cético.** Confirmado; não é duplicata — a S-M2 (`5d062bd`)
cobriu só as portas de pagamento, e a anotação do próprio spec o confirma. As
telas recusam `valor <= 0`, o que restringe o gatilho à API direta — por isso
🟡, não 🟠. **Enumera sobra:** nenhuma.

### 4. 🟡 `ContratoInput.parcelas[].valorPrevisto` sem piso — a rota valida só a SOMA, e uma parcela negativa entra no carnê que nenhum recebimento consegue fechar

**Âncora:** `lib/api-spec/openapi.yaml:6230` ·
`artifacts/api-server/src/routes/contratos.ts:288–289`

**Evidência.** openapi.yaml:6226–6231 (`ContratoInput.parcelas.items`):
`required: [numero, valorPrevisto, vencimento]` …
`valorPrevisto: { type: number }` — sem minimum, sem piso no numero. O zod
gerado (api.ts:5790–5795) é `zod.number()` sem `.min`. A rota
(contratos.ts:288–289):
`const somaC = parcelasInput.reduce((acc, p) => acc + centavos(p.valorPrevisto), 0); if (somaC !== centavos(contratoData.valorTotal))`
— a única guarda é a igualdade da soma; a linha 599 insere como veio. O schema
(financeiro.ts:30) não tem CHECK.

**Mecanismo.** POST /contratos com valorTotal 5000 e parcelas
`[{numero:1, valorPrevisto: 6000}, {numero:2, valorPrevisto: -1000}]` passa: a
soma bate em 500000 centavos exatos e cada parcela é inserida como veio. A
parcela de -R$ 1.000,00 nasce PREVISTA e é impagável — contratos.ts:1052
recusa qualquer recebimento (entrandoC ≥ 1 > saldoC = -100000 → 422
VALOR_ACIMA_DO_SALDO), e o piso da S-M2 recusa fechar o que este buraco deixa
abrir. A tela nunca monta esse corpo (o carnê sai de `montarPlanoParcelas`,
que recusa negativos em plano.ts:41/48/75) — o caminho é a API.

**Consequência (a corrigida pelo cético).** O horizonte mostra
**R$ 6.000,00 a receber num contrato de R$ 5.000,00** — inflado em R$ 1.000,00
que nunca chega — porque `saldoAbertoC` NUNCA devolve negativo (caixa.ts:86–88,
`Math.max(0, …)`): a parcela de -R$ 1.000,00 vira zero no agregado em vez de
compensar. E a fila de cobrança lista uma parcela de -R$ 1.000,00 impagável.

**O que o localizador errou, por extenso (é a parte que mais vale):** o
diagnóstico original dizia (1) que `saldoAbertoC` devolvia -100000 e o
agregado "parecia certo" — é o contrário: o clamp de caixa.ts:86–88 zera o
negativo e o agregado fica ERRADO para cima; e (2) que cancelar com "estornar"
tentava devolver dinheiro que nunca entrou — não tenta: contratos.ts:861
filtra `valorRecebido > 0` e a linha 869 clampa em 0. Mitigação parcial que o
cético achou: o DELETE de parcela PREVISTA (contratos.ts:1222) remove a linha
à mão.

**Veredito do cético.** O buraco existe nas quatro camadas lidas; gatilho só
por API e recuperável — 🟡 confirmada. **Enumera sobra:** nenhuma.

### 5. 🟡 Os *Update perdem o piso de dinheiro que os *Input têm: `precoRealuguel`, `ItemEstoque.preco` e `Ajuste.custo` aceitam negativo no PATCH — e `precoBase` não tem piso em lado nenhum

**Âncora:** `lib/api-spec/openapi.yaml:5055` ·
`artifacts/api-server/src/routes/vestidos.ts:463–464` e `843–844` ·
`artifacts/api-server/src/routes/agenda.ts:842–843`

**Evidência.** VestidoInput:5033 `precoRealuguel: { type: number, minimum: 0 }`
× VestidoUpdate:5055 `precoRealuguel: { type: ["number", "null"] }` (o null é
o "apague" deliberado do E157 — o minimum é que se perdeu).
ItemEstoqueInput:5353 `preco: { type: number, minimum: 0 }` ×
ItemEstoqueUpdate:5360 `preco: { type: ["number", "null"] }`.
AjusteInput:5566 `custo: { type: number, minimum: 0 }` × AjusteUpdate:5572
`custo: { type: ["number", "null"] }`. E precoBase: 5032 e 5052,
`{ type: number }` nos dois lados. O zod gerado é fiel ao spec — os update
bodies são `zod.number().nullish()` sem `.min()` (api.ts:1148–1149,
1851–1852) — e a prova de que o gerador carrega o piso quando o spec o tem é
`updateItemEstoqueBodyQuantidadeMin = 0` na linha 1844, colado ao preco sem
min na 1852. Os três handlers espalham sem guarda (vestidos.ts:463–464
`updateData = { ...vestidoData, ... }`, vestidos.ts:843–844 e agenda.ts:842–843
`.set({ ...parsed.data, ... })`), e as colunas são decimal sem check
(lib/db/src/schema/vestidos.ts:45, 61, 168; atendimentos.ts:164).

**Mecanismo.** O zod gerado dos Update é a única validação do servidor e os
três handlers fazem update por spread: PATCH com -500 grava -500. As telas
guardam sozinhas (vestido-form.tsx:46 recusa `v < 0`; a confecção prefila o
valorUnitario com `String(conf.custo)` em orcamentos/[id].tsx:1040, onde a
guarda de valor pega o negativo) — o caminho é a API, mas o dado ruim persiste
e volta em toda leitura.

**Consequência.** PATCH /vestidos com precoRealuguel -500 grava a peça com
preço de segunda saída de -R$ 500,00; a ficha e a sugestão de preço do
orçamento exibem o negativo. Ajuste.custo -R$ 200,00 aparece como `brl(-200)`
na fila da costureira e prefila o item que cobra a confecção. É a imagem em
espelho do achado do quantidade: lá o criar perdeu o piso do editar, aqui o
editar perdeu o do criar — dois lados da mesma varredura.

**Veredito do cético.** Confirmado camada por camada; não é duplicata (a S-M2
era `PagamentoInput.valorPago`; a S-M11 era `Number("")` no estoque). 🟡 pelo
gatilho raro — só chamada direta à API. **Enumera sobra:** S-M9.

### 6. 🟡 Sete *Update perdem o `minLength: 1` dos *Input — PATCH com string vazia esvazia nome, código e descrição que o criar exige

**Âncora:** `lib/api-spec/openapi.yaml:5050` ·
`artifacts/api-server/src/routes/vestidos.ts:463–464` ·
`artifacts/api-server/src/routes/agenda.ts:227`

**Evidência.** VestidoInput:5030–5031 `codigo`/`nome` com `minLength: 1` ×
VestidoUpdate:5049–5050 sem. O mesmo par existe em MembroEquipeUpdate.nome
(4755×4832), AtributoUpdate.nome (4916×4922), AtributoOpcaoUpdate.valor
(4938×4943), LeadUpdate.noivaNome (5117×5131), CabineUpdate.nome (5417×5421) e
AjusteUpdate.descricao (5564×5570) — diff mecânico Input×Update sobre
`components.schemas`. O zod gerado espelha o buraco: CreateVestidoBody usa
`zod.string().min(1)` (api.ts:982–983), UpdateVestidoBody usa
`zod.string().optional()` sem min (api.ts:1146–1147). Os handlers espalham sem
guarda, a coluna text notNull aceita `""` e nenhum teste prega o caso.

**Mecanismo.** PATCH /vestidos `{"nome": "", "codigo": ""}` responde 200 e
grava as duas colunas vazias. As telas exigem min 1 nos formulários
(vestido-form.tsx:27–28), então o gatilho é API/integração — mas o dado vazio
depois quebra a leitura em toda tela que monta "codigo · nome".

**Consequência.** Uma peça sem código nem nome no acervo: a busca não a
encontra, o card exibe " · " e a linha da agenda de provas perde a referência.
Lead com noivaNome `""` vira uma noiva sem nome na fila de cobrança. São sete
portas da mesma forma criar×editar.

**Veredito do cético.** Confirmado nos sete pares, literalmente. O cético
corrigiu a severidade: o localizador propôs 🔵 (limpeza), mas é defeito real
de persistência de dado degradado — **🟡**, com gatilho raro porque as telas
exigem min 1. **Enumera sobra:** S-M9.

## Refutados

Nenhum achado deste ângulo foi refutado — os seis propostos pelo localizador
sobreviveram ao cético, todos com as âncoras relidas neste run. O trabalho do
cético apareceu de outro jeito: uma severidade subiu (achado 6, 🔵 → 🟡) e
duas consequências do achado 4 estavam erradas e foram trocadas pela conta
certa (o clamp de `saldoAbertoC` e o filtro do estorno — registradas na seção
do achado).

| Título | Âncora | Refutação do cético |
|---|---|---|
| — | — | (tabela vazia: zero refutados) |

## Cobertura

**Teto de 10 NÃO atingido** — os seis achados acima são todos os que
sobreviveram à releitura das três camadas.

Base 89b38c8, enumeração por `git ls-files` (601 arquivos no escopo). As
varreduras mecânicas que deram LIMPO e valem registro, porque a rodada 3 não
precisa refazê-las:

1. **As 195 operações do openapi.yaml × os registros Express batem 1:1.** Os
   cinco "faltantes" do primeiro diff eram registros multi-linha
   (portal.ts:664/678, financeiro.ts:570), conferidos um a um.
2. **Nenhuma rota lê `req.body.*` ou `req.query.*` cru** — tudo passa pelo zod
   gerado, e toda resposta 2xx passa por `Response.parse` (as `res.json`
   multi-linha de admin/dashboard/comissao/orcamentos-publico foram abertas e
   todas embrulham parse).
3. **Nenhum parâmetro de query declarado no spec é ignorado** pela rota que o
   serve.
4. **Os campos de corpo que o grep não achava nas rotas** (casamentoHorario,
   algoAMais, naoQuerUsar, tetoOrcamento, provaDiasAntes etc.) persistem via
   spread e têm coluna no schema — não são defeito.
5. **Enums do spec × pgEnums de `lib/db/src/schema/common/enums.ts` sem
   drift.** Recorrencia [SALARIO, DESPESA, FORNECEDOR] é subconjunto
   deliberado (TIPOS_RECORRENCIA em recorrencias.ts:17 confirma); temperatura
   atencao/critico bate com o filtro de leads.ts:256; futuras true/false de
   bloqueios é string enum de propósito e a rota compara `=== "true"/"false"`.
6. **`diaVencimento` sem bounds no spec é inócuo** —
   `vencimentoDaCompetencia` (recorrencias.ts:76) grampeia em
   [1, últimoDia].
7. **Desconto PERCENTUAL > 100 e VALOR > bruto são grampeados em zero** por
   `liquidoEmCentavos` (dinheiro.ts:67–68) — sem inflação possível pelo lado
   positivo; negativo só via API e cai no mesmo grampo do lado errado,
   observado mas sem consequência além dos achados de piso já listados.
