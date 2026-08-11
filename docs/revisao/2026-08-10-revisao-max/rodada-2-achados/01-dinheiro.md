# Ângulo 1 — dinheiro
**Rodada 2, base 89b38c8** · localizador + cético por achado

Três achados sobreviveram ao cético, os três 🟡. O núcleo do dinheiro está
limpo: toda soma conferida corre em centavos inteiros com conversão na borda, e
o rateio de pagamento absorve o resto na última conta como o plano de parcelas.
O que sobrou vive nas bordas — a validação assimétrica entre criar e editar, a
faixa que ninguém prega e a grafia que só uma das duas bordas do mesmo módulo
sabe ler.

## Sobreviventes

### 1. Criar item de orçamento aceita quantidade negativa — e a tela deixa passar; editar exige ≥ 1

**🟡 · `lib/api-spec/openapi.yaml:5932` · enumera sítio da S-M9**

**Evidência.** `OrcamentoItemInput` (openapi.yaml:5932) declara
`quantidade: { type: integer }` — sem minimum; `OrcamentoItemUpdate`
(openapi.yaml:5938) declara `quantidade: { type: integer, minimum: 1 }`. No
gerado que roda na borda: `AddOrcamentoItemBody` →
`"quantidade": zod.number().optional()` (nem o `.int()` sobrevive) contra
`UpdateOrcamentoItemBody` → `zod.number().min(1)`. E a tela alimenta o buraco:
`pages/orcamentos/[id].tsx:485` —
`const quantidade = Number(values.quantidade) || 1;` valida `valorUnitario`
(linhas 489–496) mas nunca a quantidade, enquanto o editar da MESMA tela valida
(`[id].tsx:545: if (quantidade < 1)`).

**Mecanismo.** O `POST /lojas/:lojaId/orcamentos/:orcamentoId/itens`
(routes/orcamentos.ts:362–470) prova tipo, loja e peça, mas nunca olha
quantidade nem sinal do valor. A vendedora que digita "-1" no campo quantidade
envia −1 (`Number("-1")` é truthy), o Zod gerado aceita, e o item entra no
banco. Dali em diante TODAS as réguas são coerentes com o número errado:
`brutoEmCentavos` soma `centavos(valorUnitario) * quantidade` (dinheiro.ts:38)
com quantidade negativa, o `POST /contratos` valida
`liquidoC === centavos(valorTotal)` contra o mesmo bruto, a versão ENVIADA
congela, o aceite assina e o carnê rateia o total reduzido. Nenhuma guarda
dispara porque todas conferem contra a mesma soma. O caminho do EDITAR está
fechado nas três camadas (tela, spec, zod) — é exatamente a assimetria
criar×editar da S-M9, num sítio novo.

**Consequência.** Orçamento com vestido de R$ 3.500,00 mais item "Ajuste de
barra" quantidade −1 × R$ 200,00: bruto = 350000c − 20000c = R$ 3.300,00. A
noiva aceita R$ 3.300,00, o contrato fecha em R$ 3.300,00, o carnê cobra
R$ 3.300,00 — R$ 200,00 do serviço nunca são cobrados, e a linha do item mostra
"−R$ 200,00" como se fosse desconto. Pela API direta o mesmo buraco aceita
`valorUnitario` negativo (sem minimum nas duas grafias) e quantidade 2.5 (o zod
gerado perdeu o integer), que estoura 500 no INSERT da coluna integer.

**Veredito do cético — mantido, 🟡.** Não há guarda em camada nenhuma:
openapi.yaml:5932 sem minimum (vs 5938 com minimum:1 no update), zod gerado
api.ts:5174 é `zod.number().optional()` sem `.min`/`.int` (vs :5202 `min(1)`),
a rota orcamentos.ts:362–478 nunca olha quantidade e espalha `parsed.data` no
insert (:474), a tela cria com `z.string()` sem regra ([id].tsx:130) e
`Number(values.quantidade)||1` (:485) deixa −1 passar (só o editar barra,
:545), e a coluna é integer sem check (schema/orcamentos.ts:67). Conta refeita:
350000c + 20000c·(−1) = R$ 3.300,00, e contrato/aceite/carnê conferem contra a
mesma soma — nenhuma régua dispara. Não duplica S-M2/S-M11/S-M12 e enumera
sítio legítimo da S-M9.

### 2. `descontoValor` sem teto: 150% de desconto zera o orçamento em silêncio (e negativo aumenta o preço)

**🟡 · `lib/financeiro-core/src/dinheiro.ts:67` · sobra: nenhuma**

**Evidência.** dinheiro.ts:67:
`if (tipo === "PERCENTUAL") return Math.max(0, Math.round((brutoC * (100 - valor)) / 100));`
— o clamp engole qualquer percentual acima de 100. Na borda, nada segura:
openapi.yaml `OrcamentoInput`/`OrcamentoUpdate` declaram
`descontoValor: { type: number }` sem minimum/maximum (gerado:
`"descontoValor": zod.number().optional()` em `CreateOrcamentoBody` e
`UpdateOrcamentoBody`), o PATCH (routes/orcamentos.ts:247–300) só valida
transição de status e congelamento de APROVADO, e a tela só bloqueia
`valor <= 0` (pages/orcamentos/[id].tsx:596:
`if (!descontoTipo || !Number.isFinite(valor) || valor <= 0)`).

**Mecanismo.** A vendedora escolhe PERCENTUAL e digita "150" pensando em
R$ 150,00 — a tela aceita (150 > 0), o servidor aceita, e `liquidoEmCentavos`
devolve `Math.max(0, round(brutoC × (100−150)/100))` = 0. O total do orçamento
vira R$ 0,00 em todas as leituras (listagem, visão da noiva,
`conteudoEnviado`), e marcar ENVIADO congela a versão com totalLiquido R$ 0,00
no snapshot E no hash — a mesma mecânica de congelamento que a trilha C mediu
no 422 do meio centavo. O aceite da noiva assina R$ 0,00. Pela API direta o
buraco tem o outro lado: `descontoValor: -10` PERCENTUAL faz
`(brutoC × 110)/100` — um "desconto" que COBRA 10% a mais, sem nenhum aviso.

**Consequência.** Orçamento de R$ 5.000,00 + desconto PERCENTUAL 150 →
totalLiquido = max(0, 500000 × (−50)/100) = R$ 0,00 enviado e aceitável pela
noiva; a renegociação parte de um aceite congelado em zero. No sentido inverso,
PERCENTUAL −10 via API: R$ 5.000,00 → R$ 5.500,00 cobrados com rótulo de
desconto.

**Veredito do cético — mantido, 🟡.** Nenhuma camada guarda a faixa:
dinheiro.ts:67 clampa >100 para zero e aceita negativo (o `!valor` da linha 66
deixa −10 passar); openapi.yaml:5895/5902 declara `descontoValor` sem
minimum/maximum e o zod gerado é `number().optional()`; o PATCH de
orcamentos.ts só valida transição e congelamento de APROVADO; a coluna é
numeric(10,2) sem CHECK; a tela ([id].tsx:596) só bloqueia `valor <= 0`, então
150 atravessa. Conta refeita: 500.000c × (100−150)/100 → max(0, −250.000) =
R$ 0,00; PERCENTUAL −10 via API → 500.000 × 110/100 = R$ 5.500,00. Não duplica
os fechados (`5d062bd` tocou só `PagamentoInput.valorPago`) nem é sítio das
sobras abertas. Testes pregam 100% → 0, mas nada acima de 100 nem negativo. 🟡
confere: o zero é visível na tela e editável até APROVADO; o lado negativo
exige API direta.

### 3. OFX com milhar pt-BR ("1.500,00") vira NaN e a transação some do extrato em silêncio

**🟡 · `lib/financeiro-core/src/extrato.ts:50` · sobra: nenhuma**

**Evidência.** extrato.ts:50–51:
`const valor = Number(trnamt.replace(",", "."));` /
`if (!data || !Number.isFinite(valor) || valor === 0) continue;` — com o
comentário da linha 49 admitindo o gatilho: "OFX fala decimal com PONTO; alguns
bancos brasileiros mandam vírgula." O ramo CSV do MESMO arquivo lê essa grafia
certo via `parseValor` (extrato.ts:84).

**Mecanismo.** `"1.500,00".replace(",", ".")` produz `"1.500.00"`, `Number`
devolve NaN, e o `continue` da linha 51 descarta a transação SEM erro — o parse
ainda devolve as demais linhas, então `parseExtrato` responde `ok: true` e
ninguém sabe que faltou uma. O banco que manda vírgula decimal (o caso que a
linha 49 documenta) é o mesmo que escreve ponto de milhar acima de mil: toda
transação ≥ R$ 1.000,00 desse arquivo some. A conciliação (`conciliarExtrato`,
extrato.ts:212) casa por valor EXATO em centavos: o recebimento verdadeiro cai
em `soSistema` e a tela manda lançar de novo — a mesma consequência que a S-M5
mediu para a linha fatiada errada, agora pela borda OFX. As duas bordas do
mesmo módulo leem a mesma grafia de forma diferente: o CSV pela régua
`parseValor`, o OFX por um replace de uma vírgula só.

**Consequência.** Extrato OFX com `<TRNAMT>1.500,00`: a transação é
descartada, o PIX de R$ 1.500,00 já lançado no sistema aparece como "só no
sistema", e o gesto natural — lançar de novo — conta R$ 1.500,00 duas vezes no
caixa. Num mês em que toda entrada acima de mil sofre o mesmo, a conciliação
declara o mês inteiro divergente.

**Veredito do cético — mantido, 🟡.** Evidência conferida em
lib/financeiro-core/src/extrato.ts:50–51 neste run: `replace(",", ".")` de UMA
vírgula transforma "1.500,00" em "1.500.00", `Number` devolve NaN e o
`continue` descarta a transação em silêncio (`parseExtrato` ainda responde
`ok:true`, linha 163). Não há guarda em nenhuma camada: o teste de unidade
(extrato-unit.test.ts:26,32) só prega OFX com ponto decimal ("1500.00",
"-230.50"); a tela (conciliacao.tsx:110) chama `parseExtrato` da lib direto,
parse é client-side, sem Zod/middleware sobre o conteúdo do arquivo;
`parseValor` (dinheiro.ts:89) lê a grafia certo mas o ramo OFX não o usa — a
assimetria entre as duas bordas do módulo é real. Não é duplicata: S-M5
(`d9e4d59`) consertou o delimitador do CSV em `parseCSVComDelimitador`, nenhum
fecho de hoje toca a linha 50. Conta refeita: transação de R$ 1.500,00 some, o
movimento verdadeiro cai em `soSistema` (extrato.ts:244, casamento por centavos
exatos na 229) e o relançamento conta R$ 1.500,00 duas vezes. 🟡 confirmado:
gatilho exige banco fora do spec (vírgula decimal, que o comentário da linha 49
admite) E valor ≥ R$ 1.000,00.

## Refutados

| Título | Âncora | A refutação do cético em uma frase |
|---|---|---|
| `sum(numeric)` SQL da receita de utilização perderia centavo | `routes/vestidos.ts:386` | O `sum` sobre numeric é exato no Postgres e o arredondamento acontece só na saída — a soma não perde nada. |
| `brl(quantidade × valorUnitario)` em float nas linhas de item da tela | `pages/orcamentos/[id].tsx` (linhas de item) | O erro de float fica abaixo de 0,005 e o arredondamento de exibição sempre o recupera — nenhum centavo errado chega à tela. |
| Reduce em reais float da curva ABC | `pages/vestidos/utilizacao.tsx:87` | A curva só compara razões entre si, sem exibir centavo — o float não muda nenhuma classificação. |
| `cent`/`real` locais duplicando o core | `routes/comissao.ts:63` | É duplicata textual de `centavos`/`reais` do core com o mesmo comportamento — limpeza de código, não defeito de dinheiro. |

## Cobertura

**Teto de 10 achados: NÃO atingido — 3 achados verdadeiros valeram mais que 10
plausíveis.**

Varredura do ângulo dinheiro sobre a base `89b38c8`, enumerada por
`git ls-files` (601 arquivos no escopo), como manda a régua de varredura do
METODO. Lidos integralmente neste run:

- **financeiro-core** — dinheiro, plano, caixa, dre, projecao, saldo, alerta,
  extrato;
- **api-server** — comissao (lib + rota), financeiro/rateio `quitarContas`,
  contratos POST/receber/gerar-plano, orcamentos, contrato-do-papel, fluxo,
  folha, vestidos/utilizacao;
- **frontend** — `lib/financeiro/*`, previa-do-carne, dialogo-receber-parcela,
  pagar, cobranca, orcamentos/[id], preco-da-saida.

O núcleo está limpo: toda soma conferida corre em centavos inteiros com
conversão na borda, e o rateio de pagamento absorve o resto na última conta
como o plano de parcelas.

**Nota do localizador (fica em nota, não como achado, por ser alcançável só por
API direta):** `ContratoInput` aceita `valorTotal` e
`parcelas[].valorPrevisto` sem piso (openapi.yaml:6216/6230) enquanto a parcela
avulsa exige `exclusiveMinimum: 0` (openapi.yaml:3371) — uma parcela negativa
compensada passa na guarda de soma e nunca é cobrável (`saldoAberto` clampa em
0), deixando o cobrável real maior que o `valorTotal`. É candidata a sítio da
varredura S-M9 se a régua dela cobrir criar×criar.
