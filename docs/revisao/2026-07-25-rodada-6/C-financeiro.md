# Trilha C — Domínio financeiro: dinheiro, datas, comissão

**Rodada 6** · commit `01729db` · concluída em 2026-07-25

## Resumo executivo

O motor puro é bom. `@workspace/financeiro-core` é sério: soma em centavos
inteiros, separa dia-de-negócio de instante com duas funções distintas
(`diaDeNegocio`/`diaLocal`), e o E79 **não** duplicou a agregação em SQL como se
temia — o servidor recorta linhas no banco e passa as MESMAS funções do core.
Fluxo e DRE fecham entre si por construção, e `ratearRestante` tem prova de
propriedade com `fast-check`. Nada disso precisa mexer.

O problema está **nas bordas** — onde o número sai do motor ou nunca entra nele.
Quase todos os onze achados abaixo são de código que reimplementa à mão o que o
core já resolve:

- **duas fórmulas para o mesmo líquido** (uma em centavos, uma em float): 1,32%
  das vendas com desconto percentual são recusadas com um 422 que ninguém sabe
  destravar (C1);
- **a tela de orçamento** monta o plano de parcelas sozinha, com `Math.floor`
  sobre float — 1,77% dos carnês saem diferentes do que a rota `gerar-plano`
  geraria, silenciosamente (C2);
- **`Number()` no lugar de `parseValor`** nos dois campos de dinheiro da tela de
  venda: quem digita "5.800" cria um item de R$ 5,80 (C3);
- **`alerta-caixa` esqueceu o status `PARCIAL`** nas duas pernas do SQL, e por
  isso discorda do `/financeiro/fluxo` e da tela de projeção sobre o mesmo caixa
  (C4);
- **o estorno de comissão maior que o mês é cobrado inteiro de novo** no mês
  seguinte, consumindo base que já foi consumida — e há teste blindando o
  comportamento (C5).

Contagem: **11 achados — 1 🔴 · 4 🟠 · 4 🟡 · 2 🔵**.

O caso de borda não testado que mais assusta: **parcela `PARCIAL` no
`alerta-caixa`** (C4). `fluxo-endpoint-api.test.ts:63` e
`dre-endpoint-api.test.ts:62` montam uma PARCIAL de propósito;
`alerta-caixa-api.test.ts` e `alerta-caixa-unit.test.ts` não têm a palavra —
e é justamente lá que ela está fora do SQL.

## Achados

### C1 — O líquido do orçamento é calculado em float num lado e em centavos no outro: o `POST /contratos` recusa 1,32% das vendas com desconto percentual

- **Onde:** `artifacts/api-server/src/routes/contratos.ts:57-62` (`liquidoEmCentavos`)
  contra `artifacts/api-server/src/routes/orcamentos.ts:63-69`,
  `artifacts/api-server/src/lib/visao-noiva.ts:65-71` e
  `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:185-193`
- **O quê:** duas fórmulas para o MESMO líquido. O validador do contrato faz
  `Math.round((brutoC * (100 - valor)) / 100)` em centavos inteiros; o orçamento, a
  visão da noiva e a tela fazem `round2(bruto * (1 - valor/100))` em reais float.
  São algebricamente iguais e numericamente diferentes: sempre que o resultado cai
  exatamente em meio centavo, o caminho float chega ali por baixo (`…4999999`) e
  arredonda para o outro lado.
- **Exemplo que erra:** itens somando **R$ 1.000,50**, desconto **5%**.
  - tela / orçamento / portal da noiva: `1000.50 * 0.95 = 950.4749999999999` →
    **R$ 950,47**
  - `contratos.ts`: `round(100050 * 95 / 100) = round(95047.5)` → **R$ 950,48**
  - O front manda `valorTotal: 950.47`; o servidor devolve **422
    `VALOR_TOTAL_NAO_BATE`** — *"Itens menos desconto (950.48) difere do valor
    total (950.47)"*. A venda trava e não há nada que a vendedora possa fazer na
    tela, porque os dois números são "certos".
  - Acontece também com bruto em reais inteiros: **R$ 1.051,00 com 2,5%** →
    `1024,73` (servidor) contra `1024,72` (tela).
- **Frequência (medida, node em scratchpad):** varrendo bruto de R$ 1.000,00 a
  R$ 20.000,00 (passo 1 centavo) contra os descontos usuais
  (2,5/5/7,5/10/12,5/15/20/25/30%), **226.119 de 17.100.009 combinações divergem —
  1,32%**. Restringindo a brutos em reais inteiros ainda são 1.521 de 171.009
  (0,89%).
- **Por que importa:** o E88 unificou `round2` *do lado errado da fronteira*. O
  `replit.md` diz "dinheiro soma em CENTAVOS INTEIROS", e `contratos.ts:53-56` até
  documenta que a fórmula existe para bater "EXATAMENTE como o frontend" — mas
  copia a álgebra, não a aritmética. Pior: quando o orçamento tem versão ENVIADA
  (E75), o `totalLiquido` congelado no snapshot **e no hash** é o valor float
  (`orcamentos.ts:63-69`), então o número que a noiva ACEITOU é 950,47 e o único
  contrato que o servidor aceita gerar é de 950,48 — um centavo a mais do que ela
  assinou, com o hash do aceite apontando para o outro.
- **Sugestão:** uma função só, em centavos, em `@workspace/financeiro-core`
  (`liquidoEmCentavos(brutoC, tipo, valor)`), consumida pelas duas rotas do
  servidor, pela `visao-noiva` e pela tela. `round2` deixa de ser régua de dinheiro
  e vira formatação. O A3 pediu a unificação; o que falta dizer é que ela tem de
  ser **em centavos** — unificar as três cópias no `round2` fecharia o 422 e
  deixaria a conta errada nos três lugares de forma consistente.
- **Severidade:** 🔴

### C2 — O rateio de parcelas do front erra por `Math.floor` de float: um plano que dividia exato sai com a última parcela até 11 centavos maior

- **Onde:** `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:433` contra
  `artifacts/api-server/src/lib/parcelas.ts:13` (`ratearRestante`)
- **O quê:** aprofundamento numérico do **A1**. A fórmula do front,
  `Math.floor((restante / numParcelas) * 100) / 100`, é *algebricamente* a mesma do
  servidor (`Math.floor(restanteCentavos / n)`) — `(restanteC/100/n)*100 === restanteC/n`
  em matemática, não em IEEE-754. Quando a divisão exata cai num binário não
  representável, o produto por 100 chega em `…99999998` e o `floor` **derruba um
  centavo inteiro** das n−1 primeiras parcelas, empilhando os n−1 centavos na
  última.
- **Exemplo que erra:** restante **R$ 1.282,00 em 10x** (divide exato em R$ 128,20).
  - front: `1282/10 = 128.2` → `128.2*100 = 12819.999999999998` → `floor` = 12819
    → **128,19 ×9 + 128,29**
  - servidor (`ratearRestante`): **128,20 ×10**
  - Um carnê perfeitamente redondo sai desigual, e a última parcela leva 10
    centavos a mais.
  - Outro, com a divisão também exata: restante **R$ 1.000,02 em 7x** (exato em
    R$ 142,86) → front `142,85 ×6 + 142,92`; servidor `142,86 ×7`.
- **Frequência (medida):** restante de R$ 1.000,00 a R$ 20.000,00 × n de 2 a 12 →
  **369.293 de 20.900.011 planos divergem (1,77%)**. Cerca de 1 em cada 56
  contratos sai com um carnê diferente do que a rota `gerar-plano` teria gerado.
- **Por que a guarda não pega:** a soma sempre fecha (`round2(restante − base*(n−1))`
  absorve tudo na última), então **`PARCELAS_NAO_BATEM` (`contratos.ts:187-196`)
  nunca dispara**. Varri 14,1 milhões de combinações (total × entrada × n): zero
  falhas de soma. O erro é 100% silencioso — a única testemunha é o carnê impresso.
  E `lote25-rateio-parcelas-unit.test.ts` prova por propriedade a implementação que
  a tela **não** chama.
- **Sugestão:** ver A1 (a tela para de montar parcelas, ou `ratearRestante` sobe
  para o core). Se a tela tiver de continuar calculando, a correção mínima é fazer
  o `floor` **sobre centavos inteiros** (`Math.floor(centavos(restante)/n)`), nunca
  sobre `(reais/n)*100`.
- **Severidade:** 🟠

### C3 — Os dois campos de dinheiro da tela de venda usam `Number()` em vez de `parseValor`: quem digita "5.800" cria um item de R$ 5,80

- **Onde:** `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:288` e `:325`
  (`valorUnitario` do item) e `:409` (`entrada` do contrato); os inputs são texto
  livre com rótulo "Valor unitário" / "Entrada (R$)" (`:945-953`)
- **O quê:** `financeiro-core` tem `parseValor` escrito exatamente para isto, com o
  comentário explicando o engano ("`1.234` são mil duzentos e trinta e quatro, não
  um e pouco — ponto de milhar é o padrão pt-BR, e ler isso errado por mil vezes é
  o tipo de engano que só aparece no fechamento"). `folha.tsx:63`, `receber.tsx:67`
  e `pagar.tsx:76` o importam. **A tela de orçamento — a que fecha a venda — não.**
- **Exemplo que erra:**
  - vestido de R$ 5.800,00, a vendedora digita `5.800` → `Number("5.800") = 5.8` →
    item de **R$ 5,80**. Passa na validação (`Number.isFinite && > 0`), entra no
    orçamento, vira snapshot do contrato e base de comissão.
  - a mesma pessoa digita `5.800,00` → `Number(...) = NaN` → toast "Valor unitário
    inválido" (o item pelo menos não entra).
  - entrada de R$ 3.000,00 digitada como `3.000` → `Number(...) = 3` → entrada de
    **R$ 3,00** e R$ 2.997,00 empurrados para as parcelas; digitada como `3.000,00`
    → `NaN || 0` → **entrada zero, sem nenhum aviso** (`:409` faz `|| 0`, e
    `entrada < 0 || entrada > total` não pega o zero).
- **Por que importa:** os dois erros produzem um documento plausível — um carnê
  íntegro cuja soma fecha e cujo 422 nunca dispara. O de R$ 5,80 tem chance de ser
  notado; o da entrada zerada não tem: o total do contrato está certo, só o dinheiro
  que a noiva entregou na assinatura deixou de existir no plano.
- **Sugestão:** `parseValor` nos três pontos, distinguindo `null` (não digitou) de
  `NaN` (digitou errado) como o resto do app já faz. Ideal: um `<InputMoeda>` único
  que já devolve centavos — hoje cada tela remonta a leitura do teclado.
- **Severidade:** 🟠

### C4 — `alerta-caixa` esqueceu o status `PARCIAL` nas DUAS pernas do SQL: o alerta do dashboard discorda do fluxo e da projeção sobre o mesmo caixa

- **Onde:** `artifacts/api-server/src/routes/financeiro.ts:846-860` — o `or(...)`
  filtra `eq(status, "PAGA")` para o saldo e `eq(status, "PREVISTA")` para a curva.
  Compare com `/financeiro/fluxo` (`:692-693`,
  `inArray(status, ["PREVISTA","PARCIAL"])`) e com `GET /financeiro/parcelas`
  (`:119`, "E79: 'aberta' é a régua única do `estaAberta` (PREVISTA/PARCIAL, E49)")
- **O quê:** o E49 criou `PARCIAL`, e `caixa.ts:42-53` o trata nos dois eixos —
  `estaAberta` (PREVISTA **ou PARCIAL**) e `teveRecebimento` (PAGA **ou PARCIAL**).
  O motor está certo; o SQL que o alimenta nunca foi atualizado. A parcela
  meio-recebida **não chega ao motor**, nem como dinheiro que entrou, nem como
  dinheiro que ainda vai entrar.
- **Exemplo que erra:** âncora de saldo conferida ontem em **R$ 5.000,00**. Parcela
  de R$ 10.000,00 com **R$ 6.000,00 recebidos hoje** (status `PARCIAL`, saldo
  R$ 4.000,00 vencendo em 10 dias). Contas a pagar no horizonte: R$ 8.000,00.
  - `GET /financeiro/fluxo` → `resumo.entradas` inclui os R$ 6.000 e
    `horizonte.aReceber` inclui os R$ 4.000. A tela `/financeiro/projecao` (que
    busca `status=abertas` + `recebidasDe`) chega ao mesmo lugar: saldo de hoje
    **R$ 11.000**, curva termina em **+R$ 7.000**.
  - `GET /financeiro/alerta-caixa` → `saldoHoje` = **R$ 5.000** (os R$ 6.000 não
    vieram do SQL) e a curva não tem a entrada de R$ 4.000: piso **−R$ 3.000** e
    `diaNegativo` preenchido.
  - Resultado: o sino e o dashboard anunciam "o caixa fura em X" enquanto a tela de
    projeção, clicada no segundo seguinte, mostra o caixa positivo. **Nenhum dos
    dois números explica o outro.**
- **Por que importa:** é o pior modo de falha possível para um alerta — ele erra
  para o lado do alarme falso, e alarme que toca sem motivo treina a loja a
  ignorá-lo (a própria doc de `alerta.ts:16-19` argumenta isso). E o erro é
  sistemático: toda loja que usa recebimento parcial vê o alerta subestimar o caixa.
- **Sugestão:** trocar os dois `eq(status, …)` por `inArray(status, ["PAGA","PARCIAL"])`
  e `inArray(status, ["PREVISTA","PARCIAL"])`. Melhor ainda: exportar do core as
  duas listas de status (`STATUS_ABERTOS`, `STATUS_COM_RECEBIMENTO`) para que o SQL
  e o motor não possam divergir de novo — é a mesma classe de bug que o E79 resolveu
  em `/financeiro/parcelas` e deixou passar aqui.
- **Teste que falta:** `alerta-caixa-api.test.ts` e `alerta-caixa-unit.test.ts` não
  mencionam `PARCIAL`; `fluxo-endpoint-api.test.ts:63` e `dre-endpoint-api.test.ts:62`
  montam uma de propósito. O buraco é exatamente onde o bug mora.
- **Severidade:** 🟠

### C5 — Estorno de comissão maior que o mês é cobrado INTEIRO de novo no mês seguinte: a base já consumida evapora

- **Onde:** `artifacts/api-server/src/routes/comissao.ts:1024-1053` (o
  `netC = brutoC - estorno.totalC` e o `reconciliados = netC >= 0 ? … : []`) e
  `:190-253` (`estornosPendentes`, que sempre devolve `cent(c.valorTotal)` cheio)
- **O quê:** o estorno §6.4 é **tudo-ou-nada por fechamento**. Se o mês não absorve
  o estorno inteiro, nada é reconciliado e o **valor cheio** volta a pesar no mês
  seguinte — mas a base daquele mês já foi consumida (a vendedora recebeu zero). Não
  existe coluna de saldo residual: `contratos.comissaoEstornadaEm` é um carimbo
  binário. O comentário em `:1051` diz "o saldo segue pendente e carrega para a
  competência seguinte", e é precisamente o *saldo* que não existe — carrega o total.
- **Exemplo que erra:** faixa única de 10%. Contrato de **R$ 20.000** fechado em
  set/2025, setembro fechado (ela recebeu R$ 2.000). O contrato é cancelado em
  outubro → estorno pendente R$ 20.000.
  - **out/2025:** vende R$ 5.000. `netC = 5.000 − 20.000 = −15.000` → comissão
    **R$ 0**, `totalVendas` gravado **0**, nada reconciliado.
  - **nov/2025:** vende R$ 8.000. `netC = 8.000 − 20.000 = −12.000` → comissão
    **R$ 0**, ainda pendente.
  - **dez/2025:** vende R$ 25.000. `netC = 25.000 − 20.000 = 5.000` → comissão
    **R$ 500**, estorno reconciliado.
  - Somando out+nov+dez ela vendeu **R$ 38.000** e devia R$ 20.000 → base correta
    **R$ 18.000**, comissão **R$ 1.800**. Recebeu **R$ 500**. **R$ 1.300 a menos**,
    porque os R$ 20.000 foram descontados três vezes (5.000 + 8.000 + 20.000 de base
    consumida contra uma dívida de 20.000).
  - `lote9-comissao-api.test.ts:317-367` **testa e blinda esse comportamento**: o
    teste chama-se "estorno maior que o mês CARREGA" e afirma
    `expect(novembro.body[0].estornoPendente).toBe(20000)` depois de outubro ter
    consumido 5.000.
- **Agravante de tela:** `minha-comissao/index.tsx:105-106` mostra *"Já com
  R$ 20.000,00 de estorno abatido"* num mês em que ela recebeu zero — a vendedora lê
  que a dívida foi quitada e no mês seguinte ela reaparece inteira.
- **Por que importa:** é dinheiro de pessoa, calculado errado a favor da loja, sem
  nenhuma linha na tela que denuncie. Quanto maior o estorno em relação ao mês, pior
  — e o caso extremo (a vendedora que parou de vender) é exatamente o que a baixa
  manual do I10 existe para socorrer, o que sugere que o desenho já sabia que o
  arrasto era problemático.
- **Sugestão:** guardar o **residual**. Ou uma coluna
  `comissao_fechamentos.estornoAbsorvidoC` + `estornoResidualC` (o mês absorve
  `min(brutoC, estornoPendente)` e carrega o resto), ou reconciliação por CONTRATO
  (os cancelados que couberem no mês são carimbados; os que não couberem carregam) —
  a segunda é menos precisa mas cabe no modelo atual sem coluna nova. Em qualquer
  caso o teste do lote9 precisa mudar de asserção junto, porque ele hoje afirma o
  bug.
- **Severidade:** 🟠

### C6 — `vencimento` da entrada nasce como INSTANTE (`new Date()`), e das 21h à meia-noite cai no dia seguinte

- **Onde:** `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:430` —
  `vencimento: new Date().toISOString()`; a mesma função já usa
  `new Date(\`${values.primeiroVencimento}T12:00:00-03:00\`)` na linha 434 e
  `diaParaISO` (`lib/formatos.ts:102`) nas datas de casamento
- **O quê:** `vencimento` é **data de negócio** — o `replit.md` e
  `financeiro-core/datas.ts:6-8` dizem que ela nasce ancorada ao meio-dia de São
  Paulo, para que o dia UTC já seja o dia certo. A parcela de entrada nasce com o
  instante cru do clique.
- **Exemplo que erra:** contrato gerado em **24/07/2026 às 21h30** (SP). O
  `vencimento` da entrada vira `2026-07-25T00:30:00Z`.
  - `diaDeNegocio()` (`datas.ts:33`, `toISOString().slice(0,10)`) → **2026-07-25**.
    É o que `estaAtrasada`, `previstoNaJanela`, `projetarCaixa` e o aging de
    cobrança usam.
  - `diaLocalSP()` (`lib/folha.ts:51`, `Intl` no fuso da loja) → **24/07/2026**. É o
    que o CSV de parcelas para a contadora imprime (`financeiro.ts:1103`).
  - A mesma linha do banco é lida com dois dias diferentes por dois consumidores do
    mesmo sistema. Em 31/12 às 22h a entrada também troca de **mês** — e de
    competência no DRE de vencimentos e no "a receber nos próximos 30 dias".
- **Por que importa:** é exatamente o erro que a decisão de arquitetura descreve, no
  arquivo que tem a função certa importada três linhas acima. Some ao C2 (a mesma
  função monta o plano à mão) e ao C10 (o servidor espaça por 30 dias, a tela por
  mês): a tela de "Gerar contrato" é o ponto do sistema com mais aritmética não
  compartilhada.
- **Sugestão:** `diaParaISO(hojeLocal())` para a entrada. E, ao mover o rateio para
  o core (C2/A1), levar junto a construção do vencimento — quem faz a parcela faz a
  data dela.
- **Severidade:** 🟡

### C7 — A vigência de comissão é resolvida por competência inteira: uma escada criada dia 20 reprecifica os 19 dias anteriores

- **Onde:** `artifacts/api-server/src/routes/comissao.ts:154-189` (`regrasVigentes`
  filtra `vigenciaInicio < fim-da-competência` e pega a mais recente)
- **O quê:** o filtro é `< fim` (início do mês seguinte), não `<= início da venda`.
  Duas regras dentro do mesmo mês → a **mais nova governa o mês inteiro**, inclusive
  as vendas fechadas antes de ela existir.
- **Exemplo que erra:** Ana tem escada de 4% desde 2020. Em **20/06** a gerente cria
  uma escada de 8% com `vigenciaInicio: 2026-06-20`. Ana já tinha vendido R$ 50.000
  entre 01/06 e 19/06 e vende mais R$ 30.000 depois.
  - Esperado (leitura literal de "vigência"): 50.000 × 4% + 30.000 × 8% = R$ 4.400.
  - Código: a regra de 20/06 é a mais recente com `vigenciaInicio < 2026-07-01`, logo
    rege tudo → 80.000 × 8% = **R$ 6.400**.
  - O preview ao vivo muda de R$ 2.000 para R$ 6.400 **no instante em que a escada é
    salva**, para vendas que já estavam registradas.
- **Nuance:** pode ser deliberado — a comissão já é retroativa por faixa
  (`lib/comissao.ts:5-9`) e um mês tem uma base só, não uma base por dia; misturar
  duas escadas num acumulado único é ambíguo. O problema é que **nada diz isso**: o
  docstring de `regrasVigentes` promete "a regra que valia naquele mês" (singular),
  o default de `vigenciaInicio` foi corrigido justamente para o mês seguinte
  (`:336-343`, com o comentário sobre reprecificação retroativa) e o único teste
  (`lote9-comissao-api.test.ts:370-406`) só usa vigências em virada de mês. O caso
  do meio do mês nunca foi exercitado.
- **Sugestão:** decidir e escrever. Ou (a) recusar `vigenciaInicio` que não seja o
  primeiro dia de uma competência — o modelo passa a ser "escada por mês", sem
  ambiguidade; ou (b) manter e documentar em `lib/comissao.ts` que a vigência tem
  granularidade de MÊS, com um teste que fixe o comportamento. (a) é mais honesta
  com o nome do campo.
- **Severidade:** 🟡

### C8 — O DRE é regime de CAIXA e o produto o chama de "por competência"; `contas_pagar.competencia` não entra na conta

- **Onde:** `lib/financeiro-core/src/dre.ts:6` ("DRE simples, REGIME DE CAIXA")
  contra `replit.md:105` ("recortes (DRE **por competência**, projeção de saldo)") e
  a tela `artifacts/moscow-noivas/src/pages/financeiro/dre.tsx:39-46`, cujo seletor
  se chama "competência"
- **O quê:** `GET /financeiro/dre` recorta pelo **instante** do recebimento e do
  pagamento (`financeiro.ts:766-784`) e ignora completamente a coluna
  `contas_pagar.competencia`, que existe, é preenchida pelas recorrências
  (`lib/recorrencias.ts:117`) e pelo fechamento de comissão (`comissao.ts:1038`), e
  sai no CSV de contas a pagar (`financeiro.ts:1063`).
- **Exemplo que erra:** salário de **junho** (recorrência com `competencia: "2026-06"`,
  vencimento 05/07) pago em 05/07. O DRE de **junho** não o vê; o DRE de **julho**
  mostra dois salários (o de maio pago em 05/06 já foi para junho, e o de junho cai
  aqui). O mesmo vale para toda comissão, cujo vencimento é sempre dia 5 do mês
  seguinte (`lib/comissao.ts:294-300`): **nenhuma comissão aparece no DRE da
  competência que a gerou**. Uma loja que fecha junho com R$ 40.000 de receita e
  R$ 12.000 de folha/comissão de junho lê "resultado de junho" sem esses R$ 12.000.
- **Por que importa:** o dado para o DRE por competência **já está no banco** —
  a coluna existe e está preenchida. O número que a tela mostra é defensável (é o
  caixa do mês), mas o nome que ele carrega promete outra coisa, e é sobre esse nome
  que alguém decide se contrata. Não é bug de aritmética: é uma divergência entre o
  que o motor calcula e o que o produto diz que ele calcula.
- **Sugestão:** decidir. Ou renomear a tela e o `replit.md` para "DRE de caixa"
  (barato, honesto, e o fluxo continua batendo com ela por construção), ou acrescentar
  um recorte por competência ao lado — `dreDoIntervalo` já é puro, um irmão
  `drePorCompetencia(contas, pagamentos, competencia)` cabe no core. O que não pode
  seguir é o mesmo nome para as duas coisas.
- **Severidade:** 🟡

### C9 — `gerar-plano` do servidor espaça por 30 DIAS; a tela espaça por MÊS — e o número 0 significa coisas diferentes nos dois

- **Onde:** `artifacts/api-server/src/routes/contratos.ts:833` (`venc0.getTime() +
  i * periodicidadeDias * DIA_MS`, default 30) contra
  `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:438` (`addMonths(primeiro, i-1)`)
- **O quê:** terceira divergência do mesmo par de implementações (C2 é o valor, C6 é
  a data da entrada, esta é o espaçamento). Duas diferenças:
  - **espaçamento:** 12 parcelas a partir de 10/01/2026 → tela: 10/01, 10/02 …
    10/12 (dia fixo). Servidor: 10/01, **09/02, 11/03**, 10/04, 10/05, **09/06,
    09/07, 08/08, 07/09, 07/10, 06/11, 06/12** — só 3 das 12 caem no dia
    combinado, e a última vence **4 dias antes**. Para a noiva que combinou "todo
    dia 10", nove parcelas vencem em outro dia.
  - **semântica do `primeiroVencimento`:** na tela é o vencimento da **parcela 1** (a
    entrada vai para "hoje", `:430`); no servidor é o vencimento da **entrada**, e a
    parcela 1 cai 30 dias depois (`offsetInicial`, `:830-836`). O mesmo campo do
    mesmo diálogo produziria carnês deslocados em um mês conforme a porta usada.
- **Por que importa:** hoje só a tela é usada, então a divergência está latente — mas
  a correção do A1/C2 (fazer a tela chamar `gerar-plano`) mudaria o carnê de todo
  mundo **sem que ninguém tenha pedido**, porque o conserto do valor arrasta a
  mudança da data. Vale saber disso antes, não durante.
- **Sugestão:** ao unificar, decidir explicitamente: mensal por dia fixo (com o
  grampo de fim de mês que `vencimentoDaCompetencia` já sabe fazer,
  `lib/recorrencias.ts:66-73`) é o que a loja combina com a noiva; 30 dias corridos é
  o que o código faz. E alinhar o significado de `primeiroVencimento` nos dois lados.
- **Severidade:** 🟡

### C10 — `addDias`/`inicioDoDia` têm duas implementações no servidor, e o módulo financeiro usa a que não é do core

- **Onde:** `artifacts/api-server/src/routes/financeiro.ts:68`
  (`import { addDias, inicioDoDia } from "../lib/disponibilidade"`) contra
  `lib/financeiro-core/src/datas.ts:38,72`; some `lib/folha.ts:51` (`diaLocalSP`,
  em `DD/MM/AAAA`) e `financeiro-core/datas.ts:28` (`diaLocal`, em `YYYY-MM-DD`),
  que são a mesma pergunta em dois formatos
- **O quê:** as implementações são hoje **equivalentes** (conferi linha a linha:
  mesmo offset fixo -03:00, mesma aritmética em UTC-meio-dia) — o achado é de
  fronteira, não de resultado. Mas as fronteiras de dia de TODO o financeiro
  (`gte(recebidoEm, inicioDoDia(...))` em fluxo, DRE, alerta, exportações) passam
  por uma cópia que vive no módulo de **disponibilidade de vestidos** e evolui com
  ele.
- **Por que importa:** o dia em que uma cópia ganhar tratamento de DST, de fuso por
  loja, ou trocar o offset fixo por `Intl`, o SQL e o motor passam a recortar janelas
  diferentes — e o sintoma será um movimento da virada do dia que aparece no fluxo e
  não no DRE. É a divergência mais cara de diagnosticar porque não quebra nada:
  muda um número.
- **Sugestão:** `financeiro.ts` importa de `@workspace/financeiro-core`; a cópia em
  `disponibilidade.ts` fica só para o domínio de reservas (ou também passa a
  reexportar do core). Depende do A12 — hoje `financeiro-core` não está nas
  referências de projeto do api-server.
- **Severidade:** 🔵

### C11 — `comissoes/index.tsx:191` soma dinheiro em float — convenção violada, sem consequência mensurável

- **Onde:** `artifacts/moscow-noivas/src/pages/comissoes/index.tsx:191` —
  `linhas.reduce((soma, l) => soma + l.valorTotal, 0)`
- **O quê:** o único ponto do frontend que ainda soma reais em float; `folha.tsx`,
  `receber.tsx` e `pagar.tsx` já usam `somaCentavos` do core.
- **Honestidade sobre o impacto:** procurei o erro visível e **não existe**. Com
  valores de 2 casas e dezenas de termos, o erro acumulado fica na ordem de 1e-10, e
  `brl()` (`lib/formatos.ts:92`) formata com `maximumFractionDigits: 2` — o centavo
  errado precisaria de ~1e13 em vendas para aparecer. É débito de convenção, não
  defeito de número.
- **Por que ainda vale corrigir:** é a linha que alguém copia para a próxima tela, e
  na próxima o valor pode não ter 2 casas.
- **Sugestão:** `reais(somaCentavos(linhas, (l) => l.valorTotal))`, uma linha.
- **Severidade:** 🔵

## O que está BEM (não mexer)

- **`financeiro-core` é o acerto estrutural do repo.** Centavos inteiros em toda
  soma, `diaDeNegocio` e `diaLocal` como funções *separadas* com docstring dizendo
  qual usar quando, tipos estruturais para que a linha do drizzle e o objeto da API
  entrem iguais. As decisões contraintuitivas estão escritas com o porquê
  (`caixa.ts:36-53`, `projecao.ts:9-13`, `comissao.ts:4-18`).
- **O E79 não duplicou a agregação.** A pergunta cara ("o motor SQL e o
  `financeiro-core` produzem o mesmo número?") tem resposta: **não há motor SQL**. O
  servidor recorta linhas por data no banco e chama `resumoCaixa`/`dreDoIntervalo`/
  `entradasPorMeio` — as mesmas funções que o frontend rodava. `porMeio.total ===
  resumo.entradas` e `DRE.receitas === fluxo.entradas do mesmo intervalo` são
  verdadeiros **por construção**, não por coincidência. Era o risco número um da
  trilha e ele foi desarmado no desenho.
- **`ratearRestante` com prova de propriedade** (`lote25-rateio-parcelas-unit.test.ts`):
  soma exata para qualquer valor/n, sobra só na última, ida-e-volta reais↔centavos
  preservada. É o padrão que os outros cálculos deveriam seguir.
- **`estaAberta`/`teveRecebimento`/`saldoAberto` como régua única do E49.** Cobrança,
  aging, horizonte e projeção usam o **saldo**, nunca o previsto — "cobrar de novo o
  que já foi pago é o erro que a noiva percebe primeiro" está no código. O C4 é
  justamente o lugar onde essa régua não foi aplicada.
- **A idempotência das recorrências** (`lib/recorrencias.ts` + índice único parcial +
  `onConflictDoNothing`): check-then-insert *e* rede no banco, com o dedup largo do
  salário escolhendo conscientemente errar para o lado seguro. O grampo do
  `diaVencimento` ao último dia do mês (31/02 → 28/02) está resolvido e comentado.
- **`vencimentoDaCompetencia` e `vencimentoComissao`** ancoram no meio-dia SP, do
  jeito certo, com o comentário explicando por quê.
- **`parseValor`**, e o cuidado de distinguir `null` de `NaN`. O C3 é o lugar onde
  ela não foi usada, não um problema dela.
- **O fechamento de comissão lê tudo DENTRO da transação** (`comissao.ts:1000-1013`,
  com o tipo `Cliente` existindo só para isso), trata a violação de unique como 409
  idempotente, e a reabertura (E54) desfaz exatamente as três coisas que o fechamento
  fez — incluindo devolver `comissaoEstornadaEm` a NULL só nos contratos que **este**
  fechamento reconciliou.
- **O rateio do pagamento multi-conta** (`financeiro.ts:304-308`, apontado pela
  trilha A como "a aritmética menos testada"): conferi e está **correto** — centavos
  inteiros, proporcional ao previsto, última conta absorve o resíduo, invariante
  `sum(itens.valor) === valorPago` preservado por construção. Convenção diferente do
  `ratearRestante` (round proporcional vs. floor uniforme), o que é adequado: aqui o
  peso importa.
- **`receber.tsx:191` e `pagar.tsx:283`** tratam `recebidoEm`/`data` como INSTANTE
  corretamente: hoje → `new Date()`, dia passado → `diaParaISO` (meio-dia SP). É o
  contraexemplo exato do C6, na mesma base de código.

## Pistas para as outras trilhas

- **D (frontend):** o C3 pede um `<InputMoeda>` compartilhado — hoje cada tela remonta
  a leitura do teclado e uma delas errou. Vale ver se `orcamentos/[id].tsx` é a única
  ou se há outros `Input inputMode="decimal"` sem `parseValor` fora de
  `pages/financeiro/`. E `pages/financeiro/projecao.tsx:64-102` faz quatro queries
  encadeadas (âncora → janela → recebidas/pagamentos) para chegar ao mesmo número que
  `GET /financeiro/alerta-caixa` devolve pronto: além do over-fetch, é a **causa
  estrutural** do C4 — duas implementações do saldo de hoje, uma no cliente e uma no
  servidor.
- **E/F (UI/UX):** o C1 aparece para a vendedora como um 422 com texto técnico no
  clique mais importante do funil ("Itens menos desconto (950.48) difere do valor
  total (950.47)") — vale ver como o diálogo "Gerar contrato" trata erro de mutation.
  O C5 tem uma face de tela em `minha-comissao/index.tsx:105-106`: "Já com R$ X de
  estorno abatido" é falso quando o mês não absorveu o estorno, e é a única
  informação que a vendedora tem sobre o próprio dinheiro. O C6/C9 dizem que a
  entrada aparece no carnê com data "hoje" e as parcelas com dia móvel — pode ser
  atrito real na conversa com a noiva.
- **G (consolidação):** **C1, C2, C3, C6 e C9 são UM épico só** — "a tela de
  orçamento para de calcular dinheiro" —, e ele fecha junto com A1 e A3. É o item de
  maior retorno da rodada: cinco achados, um arquivo, uma direção (subir a aritmética
  para `financeiro-core` e a tela passar a chamá-la). C4 é isolado e barato (duas
  linhas de SQL + dois testes) e deveria ir antes de tudo, por ser o único que faz
  dois números do sistema discordarem em produção hoje. C5 é o único que precisa de
  **decisão de produto** (o residual do estorno) antes de virar código, e arrasta uma
  coluna nova e a reescrita de um teste que hoje afirma o comportamento errado —
  provavelmente épico próprio. C8 pode ser resolvido com uma linha de `replit.md` ou
  com um endpoint novo; a diferença de custo entre as duas saídas é grande o
  bastante para valer a pergunta explícita.
- **B (backend):** o C4 e o B6 se somam — o `receber` perde dinheiro por lost update,
  e quando o recebimento parcial dá certo o alerta de caixa não o enxerga. As duas
  correções tocam a mesma parcela `PARCIAL` por ângulos opostos.
