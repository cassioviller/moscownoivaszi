# 07 — orçamento (conteúdo e preço) — o hash prova o que a noiva viu, e é justamente por isso que a venda aceita não tem saída: nada reenvia um orçamento ENVIADO, e a única correção que o 422 sugere é a que a API proíbe

**Revisão ótica dos papéis**, base `980fce5` · ângulo 07

**Arquivos lidos:**
`artifacts/api-server/src/lib/conteudo-orcamento.ts` (inteiro, 47 linhas) ·
`artifacts/api-server/src/lib/aceite-orcamento.ts` (inteiro, 71) ·
`artifacts/api-server/src/lib/visao-noiva.ts` (1–96) ·
`artifacts/api-server/src/lib/contrato-do-papel.ts` (inteiro, 141) ·
`artifacts/api-server/src/lib/contrato-pdf.ts` (inteiro, 180) ·
`artifacts/api-server/src/lib/estados.ts` (1–60) ·
`artifacts/api-server/src/routes/orcamentos.ts` (inteiro, 753) ·
`artifacts/api-server/src/routes/orcamentos-publico.ts` (inteiro, 101) ·
`artifacts/api-server/src/routes/contratos.ts` (1–285, 280–699, 1375–1482) ·
`lib/financeiro-core/src/dinheiro.ts` (inteiro, 102) ·
`lib/financeiro-core/src/plano.ts` (inteiro, 110) ·
`lib/db/src/schema/orcamentos.ts` (55–113) ·
`lib/api-zod/src/generated/api.ts` (5030–5075, 5926–5946, `UpdateOrcamentoItemBody`) ·
`artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx` (88–130, 255–404, 590–731, 820–880) ·
`artifacts/api-server/src/__tests__/e115-orcamento-aceite-api.test.ts` (inteiro, 109)

---

## O que a aritmética faz certo (dito antes dos defeitos, porque muda o que se procura)

A régua do dinheiro **é uma só e está em centavos inteiros**, e isso foi conferido
ponta a ponta, não assumido:

- `lib/financeiro-core/src/dinheiro.ts:35-39` — `brutoEmCentavos` converte cada
  unitário **antes** de multiplicar pela quantidade.
- `dinheiro.ts:61-69` — `liquidoEmCentavos` é a única fórmula do líquido.
- Os **quatro** leitores a chamam, literalmente a mesma função: a listagem
  (`orcamentos.ts:228`), o congelamento (`conteudo-orcamento.ts:41-43`), a visão
  da noiva (`visao-noiva.ts:71-75`), a tela (`[id].tsx:305-306`) e o
  `POST /contratos` (`contratos.ts:268-269`).
- Toda coluna de dinheiro é `decimal(10,2) mode:"number"` — nenhum `real`, nenhum
  float no banco (`schema/orcamentos.ts:74,106-108`, `schema/contratos.ts:31,80`).
- `plano.ts:45-50` (`ratearRestante`) fecha **exato**: `restante − base×(n−1)` na
  última. `contratos.ts:287-297` compara a soma das parcelas com o total em
  centavos e com igualdade **exata**. **Não há S-M3 aqui**: `valorTotal` não é
  campo do `UpdateContratoBody` (grep de `valorTotal` em `contratos.ts` devolve
  10 sítios, nenhum num PATCH), então o total não muda debaixo de um carnê já
  fechado.

**Nenhum achado de centavo neste ângulo.** Procurei e não existe: a divergência
de arredondamento é a que o E95 já matou. Os cinco defeitos abaixo não são de
arredondamento — são de **porta**.

E a resposta direta à pergunta do briefing, com âncora: **o valor do contrato é
COPIADO**, nunca recalculado com preço de hoje. `contratos.ts:249-259` copia
`valorUnitario` dos itens vivos e `contratos.ts:266-267` copia o desconto; o
`precoBase` do vestido é lido uma única vez, na tela, na hora de ADICIONAR o item
(`[id].tsx:1133`, `precoDaSaida`). O preço que o contrato cobra é o do dia em que
o item entrou no orçamento — não o do aceite, não o de hoje.

---

## A07.1 — o orçamento aceito com item editado depois do envio é um beco sem saída: o 422 manda desfazer exatamente o que a API proíbe 🟠

**Âncora:** `artifacts/api-server/src/routes/contratos.ts:236-246` (lido)

**O que a linha diz** (`:238-244`, literal):

```ts
      if (vivo.hash !== orcamento.aceiteHash) {
        res.status(422).json({
          error: "ORCAMENTO_DIVERGE_DO_ACEITE",
          detalhe:
            "Os itens mudaram depois do envio que a noiva aceitou — o contrato tem de nascer do que ela viu. " +
            "Refaça os itens como estavam, ou crie e envie um novo orçamento para novo aceite.",
```

**O defeito:** a guarda está **certa** — é o E115, e ele existe por bom motivo. O
defeito é que a **primeira saída que a própria mensagem oferece é impossível**, e
a segunda também está fechada:

1. *"Refaça os itens como estavam"* → `PATCH /lojas/:lojaId/orcamentos/itens/:itemId`
   → `orcamentos.ts:617-623` chama `recusaConteudoCongelado(pai.status)` e o
   status é `APROVADO` (o aceite o gravou em `aceite-orcamento.ts:36`) → **422
   `ORCAMENTO_APROVADO`**, com o detalhe *"Orçamento aprovado não muda mais — crie
   um novo orçamento para renegociar"* (`orcamentos.ts:75-79`). O `POST` de item
   (`:499-504`) e o `DELETE` de item (`:650-656`) devolvem o mesmo 422.
2. *"crie e envie um novo orçamento"* → funciona, mas custa **um segundo aceite da
   noiva** pelo link — e o antigo não sai da frente: `DELETE /orcamentos/:id`
   responde **409 `ORCAMENTO_APROVADO`** (`orcamentos.ts:416-421`, *"O aceite da
   noiva (versão e hash) mora neste orçamento — ele não se apaga."*).

O `POST /contratos` não tem `valorTotal` que salve: a conferência de hash está em
`:238`, **antes** da conferência de `valorTotal` em `:270`. Mandar 5.000, 5.500 ou
qualquer outro número dá o mesmo 422.

**Número medido:** item de **R$ 5.000,00** congelado na versão 1
(`orcamento_versoes.total_liquido = 5000.00`, `hash` = sha256 de
`{"itens":[{"tipo":"VESTIDO","descricao":"…","valorUnitario":5000,"quantidade":1}],"descontoTipo":null,"descontoValor":null,"totalBruto":5000,"totalLiquido":5000}`),
editado para **R$ 5.500,00** enquanto ENVIADO (permitido de propósito pelo E75),
noiva aceita os R$ 5.000,00 que viu. A partir daí:

| gesto da vendedora | resposta |
|---|---|
| `POST /contratos` valorTotal 5500 | 422 `ORCAMENTO_DIVERGE_DO_ACEITE` |
| `POST /contratos` valorTotal 5000 | 422 `ORCAMENTO_DIVERGE_DO_ACEITE` (o hash é conferido antes) |
| `PATCH` do item de volta para 5000 | 422 `ORCAMENTO_APROVADO` |
| `DELETE` do orçamento | 409 `ORCAMENTO_APROVADO` |
| voltar para rascunho e reenviar | 422 `TRANSICAO_INVALIDA` (ver A07.2) |

**R$ 5.000,00 aceitos pela noiva, R$ 5.500,00 pedidos pela loja, R$ 0,00
contratáveis.** A venda inteira sai do sistema — e o caso não é raro: mexer no
preço de um orçamento ENVIADO é a coisa mais comum que uma negociação faz.

**A régua atual:** `artifacts/api-server/src/__tests__/e115-orcamento-aceite-api.test.ts`
**prova as duas metades do beco em dois testes separados e não junta as duas.**
O teste de `:55-74` deixa o orçamento exatamente neste estado e para no 422; o
teste de `:76-98` prova, num orçamento novo, que `PATCH` de item, `POST` de item,
`DELETE` de item e `PATCH` de desconto todos devolvem 422 em APROVADO
(`:81-97`). Ninguém encadeou os dois. **A suíte está verde e a venda está presa.**

---

## A07.2 — a versão 2 não existe: nenhum caminho reenvia um orçamento ENVIADO, e a tela oferece o botão que sempre falha 🟠

**Âncoras:** `artifacts/api-server/src/routes/orcamentos.ts:693` e `:699` (lidas),
`artifacts/api-server/src/lib/estados.ts:45-50` (lida),
`artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:842-844` (lida)

**O que as linhas dizem** (literais):

`orcamentos.ts:693` e `:699`, dentro do `POST /orcamentos/:id/link`:

```ts
        ...(orcamento.status === "RASCUNHO" ? { status: "ENVIADO" as const } : {}),
…
    if (orcamento.status === "RASCUNHO") {
      await criarVersaoEnviada(tx, lojaId, orcamentoId);
    }
```

`estados.ts:45-50`:

```ts
export const TRANSICOES_ORCAMENTO: Record<OrcamentoStatus, OrcamentoStatus[]> = {
  RASCUNHO: ["ENVIADO", "APROVADO", "RECUSADO"],
  ENVIADO: ["APROVADO", "RECUSADO"],
  APROVADO: [],
  RECUSADO: [],
};
```

`[id].tsx:842-844`:

```tsx
          ...(editavel && orcamento.status === "ENVIADO"
            ? [{ rotulo: "Voltar para rascunho", onClick: () => onMudarStatus("RASCUNHO"), desabilitada: atualizar.isPending }]
            : []),
```

**O defeito:** `criarVersaoEnviada` tem **exatamente duas** chamadas em todo o
repositório — `orcamentos.ts:379` (guardada por `virandoEnviado`, `:352`, que
exige que o status **anterior** não fosse ENVIADO) e `orcamentos.ts:700` (guardada
por `status === "RASCUNHO"`). As duas só disparam **saindo de RASCUNHO**. E
RASCUNHO é inalcançável a partir de ENVIADO (`estados.ts:47`). **Logo: um
orçamento ENVIADO nunca ganha uma versão 2.** O `coalesce(max(numero),0) + 1` de
`orcamentos.ts:138-141` e o `uniqueIndex("orcamento_versoes_numero_unq")` de
`schema/orcamentos.ts:112` são maquinaria para um número que nenhum caminho de
código produz.

A consequência é o par de números divergentes que causa a A07.1:

- A **noiva** lê sempre a v1: `visao-noiva.ts:37-42` ordena por
  `desc(orcamentoVersoesTable.numero)` com `limit(1)`, e só existe a 1.
- A **vendedora** lê sempre o vivo: `[id].tsx:304-308` calcula `totais` de
  `orcamento?.itens` (a lista viva do `GET`), e o diálogo se intitula
  `Gerar contrato — {brl(totais.liquido)}` (`[id].tsx:1319`) e envia
  `valorTotal: totais.liquido` (`[id].tsx:705`).
- Reenviar o link **não** conserta: `POST /link` renova o token por 7 dias
  (`orcamentos.ts:683`, `CONVITE_TTL_MS` = `auth.ts:11`) e serve a mesma v1.
- E o botão que a vendedora acharia para consertar — *"Voltar para rascunho"* —
  é oferecido pela tela em todo orçamento ENVIADO editável e devolve **422
  `TRANSICAO_INVALIDA`** em `orcamentos.ts:322-328`, virando o toast *"Esse
  orçamento não pode ir para esse status agora."* (`[id].tsx:107`).

**Número medido:** orçamento de **R$ 5.000,00** editado para **R$ 5.500,00**.
A tela da vendedora imprime `Total: R$ 5.500,00` (`[id].tsx:967`); o portal da
noiva imprime `totalLiquido` da v1 = **R$ 5.000,00** (`visao-noiva.ts:53-54`).
**R$ 500,00 de diferença, duas pessoas, dois papéis, zero avisos** — nenhuma das
duas telas diz que existe uma versão congelada diferente do que está na frente
dela. E os únicos dois gestos de reenvio (o botão "Voltar para rascunho" e
"Copiar link da noiva") produzem, respectivamente, um 422 garantido e um link
novo com o preço velho.

**A régua atual:** **nenhuma.** Nenhum teste em `__tests__/` nem em `e2e/` afirma
`versaoNumero` ≥ 2; o único que toca o campo é
`aceite-orcamento-api.test.ts:87`, e ele afirma `toBe(1)`. Não há teste de que
"Voltar para rascunho" faça alguma coisa — `git grep onMudarStatus` devolve 3
sítios, todos no mesmo arquivo de tela.

---

## A07.3 — o teto do desconto só vale para PERCENTUAL; o mesmo `Math.max(0, …)`, uma linha abaixo, engole VALOR — e a mensagem do 422 manda a vendedora para a porta aberta 🟠

**Âncoras:** `lib/financeiro-core/src/dinheiro.ts:67-68` (lidas),
`artifacts/api-server/src/routes/orcamentos.ts:62` (lida),
`artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:609-616` (lidas)

**O que as linhas dizem** (literais):

`dinheiro.ts:67-68` — as duas metades do clamp, adjacentes:

```ts
  if (tipo === "PERCENTUAL") return Math.max(0, Math.round((brutoC * (100 - valor)) / 100));
  return Math.max(0, brutoC - centavos(valor)); // VALOR
```

`orcamentos.ts:62` — a guarda que o S-M23 (`db45820`) acrescentou:

```ts
  if (tipo === "PERCENTUAL" && typeof valor === "number" && valor > 100) {
```

e o `detalhe` que ela devolve, `orcamentos.ts:65`:

> `"Desconto percentual não passa de 100 — para um valor em reais, troque o tipo para VALOR."`

**O defeito:** o S-M23 diagnosticou o mecanismo com precisão — *"o clamp de
`liquidoEmCentavos` engole qualquer percentual acima de 100"* (`orcamentos.ts:52-56`)
— e fechou **uma** das duas linhas do clamp. A linha `:68` faz exatamente a mesma
coisa e não tem teto em porta nenhuma:

| porta | teto PERCENTUAL | teto VALOR |
|---|---|---|
| Zod (`CreateOrcamentoBody`/`UpdateOrcamentoBody`, `api.ts:5056`, `:5207`) | `.min(0)` — sem máximo | `.min(0)` — sem máximo |
| API `POST /orcamentos` (`orcamentos.ts:255-259`) | ✅ 422 `DESCONTO_INVALIDO` | ❌ nada |
| API `PATCH /orcamentos` (`orcamentos.ts:342-349`) | ✅ 422 (par efetivo) | ❌ nada |
| Tela (`[id].tsx:609-616`) | ✅ toast destrutivo | ❌ só `valor <= 0` (`:602`) |
| PDF (`contrato-do-papel.ts:118-126`) | — | ❌ imprime o abatimento reconciliado, não o gravado |

E a mensagem do 422 **aponta para a porta aberta**: a vendedora que digita `150`
em PERCENTUAL é instruída, na letra, a *"trocar o tipo para VALOR"* — onde
nenhuma guarda a espera. A tela repete a instrução em `[id].tsx:612`: *"Para um
valor em reais, troque o tipo para R$."*

**Número medido** (calculado linha a linha):

Orçamento com 1 item — vestido, `valorUnitario` 4800.00, `quantidade` 1.

- `brutoEmCentavos` (`dinheiro.ts:38`): `centavos(4800) × 1` = **480000**.
- Desconto `VALOR`, `descontoValor` = 5000 (a vendedora digita no campo do
  desconto o **total** que negociou — o mesmo engano de campo que o S-M23 mediu).
- `liquidoEmCentavos` (`dinheiro.ts:68`): `Math.max(0, 480000 − centavos(5000))`
  = `Math.max(0, 480000 − 500000)` = `Math.max(0, −20000)` = **0**.
- `conteudoEnviado` congela `totalBruto: 4800`, `totalLiquido: 0` e o hash desse
  objeto (`conteudo-orcamento.ts:44-45`). **A noiva aceita R$ 0,00.**
- `POST /contratos` (`contratos.ts:268-280`): `liquidoC` = 0, então o **único**
  `valorTotal` que passa é `0`. A tela manda exatamente esse (`[id].tsx:705`) e
  intitula o diálogo `Gerar contrato — R$ 0,00` (`[id].tsx:1319`). **201.**
- Carnê: `montarPlanoParcelas({ totalCentavos: 0 })` → `restante = 0` → `n = 0`
  (`plano.ts:82-83`) → **nenhuma parcela**. A noiva não deve nada.
- PDF (`contrato-do-papel.ts:122-125`): `brutoC` = 480000;
  `abatimentoC = 480000 − Math.round(0 × 100)` = **480000**. O papel que ela
  assina imprime `Subtotal: R$ 4.800,00 · Desconto: −R$ 4.800,00 · Valor total:
  R$ 0,00`.

**Uma locação de R$ 4.800,00 fecha em R$ 0,00, com carnê vazio e um PDF
formalmente coerente.** E o desconto **impresso** (R$ 4.800,00) não é o desconto
**gravado** em `contratos.desconto_valor` (R$ 5.000,00): o papel e o banco
divergem em **R$ 200,00** para o mesmo contrato, porque `abatimentoC` é derivado
de `bruto − valorTotal` e reconcilia por construção (`contrato-do-papel.ts:117`).

O caso silencioso, sem zerar, é o mais provável no balcão: bruto R$ 5.800,00
(vestido 5.000 + véu 800), desconto VALOR digitado como `5.000` querendo dizer
"fica cinco mil" → `max(0, 580000 − 500000)` = 80000 → **R$ 800,00**. A loja
combinou R$ 5.000,00 e o sistema congelou R$ 800,00 — **R$ 4.200,00 a menos**,
sem um aviso em porta nenhuma. O percentual equivalente (13,79%) seria recusado se
digitado como `150`; o mesmo estrago em reais passa com 201.

**A régua atual:** o único uso de desconto `VALOR` nos testes de orçamento é
`e115-orcamento-aceite-api.test.ts:96` — e ele espera **422 por
`ORCAMENTO_APROVADO`**, não por valor. `git grep descontoValor` nos três testes do
briefing (`lote13`, `e95`, `e115`) devolve 3 sítios, e o de `e95:106` usa
`descontoValor: 5` em PERCENTUAL. **Nenhum teste exercita desconto VALOR maior que
o bruto.**

---

## A07.4 — a validade não é conferida em porta nenhuma: o aceite fora do prazo passa, e o contrato nasce com o preço do dia em que o item entrou 🟡

**Âncoras:** `artifacts/api-server/src/routes/orcamentos.ts:274` e `:107` (lidas),
`artifacts/api-server/src/routes/orcamentos-publico.ts:80-83` (lidas),
`artifacts/api-server/src/routes/contratos.ts:216` (lida),
`artifacts/moscow-noivas/src/lib/mensagens-do-dia.ts:126` (lida)

**O que as linhas dizem:**

`orcamentos.ts:274` grava a validade por construção —

```ts
    validade: parsed.data.validade ?? ancoraDeNegocio(addDias(hojeLocal(), VALIDADE_PADRAO_DIAS)),
```

com `VALIDADE_PADRAO_DIAS = 30` (`:107`). E a **única** porta que fecha algo no
caminho público é a do **token**, não a da validade —
`orcamentos-publico.ts:80-83`:

```ts
  if (!orcamento.publicoExpiraEm || orcamento.publicoExpiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }
```

**O defeito:** `git grep validade` sobre `artifacts/api-server/src/lib` e
`.../routes` devolve **cinco** ocorrências no caminho do orçamento (a sexta,
`equipe.ts:355`, é do convite) e **nenhuma** delas é uma comparação com o
relógio: `visao-noiva.ts:49` e `:81` a **exibem**; `orcamentos.ts:274` a
**grava** (`:268` e `:664` são comentário).
`aceite-orcamento.ts` (as 71 linhas, lidas
inteiras) não cita a palavra. `contratos.ts:216` só pergunta
`orcamento.status !== "APROVADO"`. **A validade é decoração de tela.** Quem a lê
de verdade é o lembrete do dashboard, `mensagens-do-dia.ts:126` —

```ts
      if (o.status !== "ENVIADO" || !o.validade) return false;
```

— e ele **para de ver o orçamento no instante em que o aceite o torna APROVADO**,
que é exatamente o instante em que o vencimento passaria a importar.

**Número medido:** orçamento aberto em **2026-06-01** sem validade explícita →
`validade` = **2026-07-01** (30 dias, `orcamentos.ts:107,274`). Item: vestido a
**R$ 6.000,00**, copiado do `precoBase` na hora de adicionar (`[id].tsx:1133`).
O link morre em 7 dias (`auth.ts:11`), mas `POST /orcamentos/:id/link`
(`orcamentos.ts:667-705`) **não olha validade nenhuma** — só recusa RECUSADO
(`:677`). Em **2026-08-11** a vendedora clica "Copiar link da noiva": token novo,
mais 7 dias. A noiva aceita em **2026-08-12** — **42 dias depois do vencimento**.
Passa: 200 no aceite, `status` → APROVADO, `POST /contratos` 201.

Se `vestidos.preco_base` subiu para **R$ 6.800,00** entre junho e agosto — o
reajuste normal de dois meses —, o contrato nasce em **R$ 6.000,00**, porque
`contratos.ts:249-259` copia o `valorUnitario` do item e **nunca** relê o
`precoBase`. **R$ 800,00 por peça**, e o sistema não tem uma linha que diga que a
proposta estava vencida.

**A régua atual:** `e95-orcamento-contrato-api.test.ts:179-197` prova que a
validade é **gravada** (30 dias no default, `:188`; explícita manda, `:197`).
Nenhum teste em `__tests__/` ou `e2e/` tenta aceitar ou contratar um orçamento
com validade no passado.

---

## A07.5 — o hash cobre 4 das 7 colunas do item: `vestidoId`, `itemEstoqueId` e `ajusteId` ficam de fora, e é `vestidoId` que o gate da reserva lê 🟡

**Âncoras:** `artifacts/api-server/src/lib/conteudo-orcamento.ts:35-40` (lidas),
`lib/db/src/schema/orcamentos.ts:61-75` e `:103` (lidas),
`artifacts/api-server/src/routes/contratos.ts:249-259` (lidas)

**O que a linha diz** — `conteudo-orcamento.ts:35-40`, o que entra no hash:

```ts
    .map((it) => ({
      tipo: it.tipo,
      descricao: it.descricao,
      valorUnitario: it.valorUnitario,
      quantidade: it.quantidade,
    }));
```

e `schema/orcamentos.ts:103` confirma que a versão congelada guarda o mesmo
recorte: `/** Itens congelados: [{tipo, descricao, valorUnitario, quantidade}]. */`

**O defeito:** `orcamento_itens` tem **sete** colunas de conteúdo
(`schema/orcamentos.ts:61-75`): `tipo`, `vestidoId`, `itemEstoqueId`, `ajusteId`,
`descricao`, `valorUnitario`, `quantidade`. O hash cobre **quatro**. As três de
fora são precisamente as que apontam **qual peça física** — e `vestidoId` é a que
o gate do E150 lê (`contratos.ts:470-474`) e a que o snapshot do contrato grava
(`contratos.ts:251`).

Como `UpdateOrcamentoItemBody` (`api.ts`, lido) só aceita
`{descricao, valorUnitario, quantidade}`, a troca não se faz por PATCH — mas se
faz por `DELETE` + `POST` do item, os dois liberados enquanto ENVIADO
(`orcamentos.ts:499-504`, `:650-656` só mordem em APROVADO/RECUSADO). Com **um
item** — o orçamento de vestido típico — a recriação preserva a ordem do
`sort` por `createdAt` (`conteudo-orcamento.ts:34`) e o objeto serializado sai
**byte a byte idêntico**: `vivo.hash === orcamento.aceiteHash` em
`contratos.ts:238`, e o contrato nasce 201 apontando **outra peça**.

**Número medido:** item `VESTIDO` · descrição `"Vestido Ricca Sposa"` ·
`valorUnitario` **5.000,00** · `quantidade` 1 · `vestido_id = A`. Congela o hash de
`{"itens":[{"tipo":"VESTIDO","descricao":"Vestido Ricca Sposa","valorUnitario":5000,"quantidade":1}],"descontoTipo":null,"descontoValor":null,"totalBruto":5000,"totalLiquido":5000}`.
Apagado e recriado com o mesmo texto, o mesmo **R$ 5.000,00** e `vestido_id = B`:
o `conteudo` é o mesmo objeto, o sha256 é o mesmo, o aceite continua "válido",
e `contrato_itens.vestido_id` grava **B**. **O hash certifica R$ 5.000,00 e não
certifica qual vestido** — e o portal da noiva nunca soube o id, porque a versão
congelada também não o guarda (`schema/orcamentos.ts:103`). A noiva aceitou um
papel que nomeia a peça só em texto livre; o sistema entregou outra, e a prova
digital diz que está tudo certo.

Fica 🟡 e não 🟠 porque o dinheiro não muda: é a **identidade da peça** que o
hash não prende. Mas a peça é o objeto do contrato, e o caderno do ateliê já
registra a mesma descrição saindo para noivas diferentes
(`contratos.ts:458-459`).

**A régua atual:** `git grep -c aceiteHash` sobre `artifacts/api-server/src/__tests__`
e `e2e/` devolve **ZERO** — o campo que é a prova digital do aceite não é nomeado
por nenhum teste. O único que exercita o mecanismo é
`e115-orcamento-aceite-api.test.ts:73`, e ele prova só a divergência de **valor**.
Nenhum teste afirma o que o hash **não** cobre.

---

## Visto de passagem

Cada item abaixo tem âncora lida, mas ou não tem número de dinheiro (e por isso
não virou achado, regra 19) ou é observação de método.

- **`tetoOrcamento` (E33) não existe no servidor.** `git grep tetoOrcamento` em
  `artifacts/api-server/src` devolve **zero** sítios. O aviso vive só em
  `[id].tsx:319-322`, e a comparação está correta (centavos inteiros, com o
  raciocínio do float documentado em `:313-318`). Contrato montado fora da tela
  ignora o teto — mas o teto é aviso por decisão, não trava, então isto é resposta
  à pergunta do briefing ("o teto vale em todas as portas?"), não defeito.
- **As três portas de item continuam lendo o status no pool, sem tranca.**
  `orcamentos.ts:499`, `:617` e `:650` fazem check-then-write; a S-M22 pôs
  `FOR UPDATE` + reconferência **só** no `PATCH` de orçamento (`:363-368`) e no
  `DELETE` (`:439-449`). A corrida (noiva aceitando enquanto a vendedora edita um
  item) não desvia dinheiro — ela cai no 422 do hash — mas **cai direto na A07.1**,
  e aí não há gesto de recuperação.
- **`aceiteHash` pode ser nulo e o gate se desliga sozinho.**
  `aceite-orcamento.ts:34-35` grava `versao?.hash ?? null`, e `contratos.ts:236`
  é `if (orcamento.aceiteHash)`. Hoje isso não é alcançável pela API —
  `CreateOrcamentoBody` (`api.ts:5051-5058`) não tem `status`, então todo
  orçamento nasce RASCUNHO e toda ida a ENVIADO congela uma versão. Vale para
  linhas legadas anteriores ao E75, e para qualquer futuro que deixe criar já
  ENVIADO.
- **Empate de `createdAt` reordena o hash.** `conteudo-orcamento.ts:34` ordena por
  `new Date(it.createdAt).getTime()` — milissegundos. O Postgres grava
  microssegundos; dois itens no mesmo milissegundo empatam e o `sort` estável cai
  na ordem que a consulta devolveu, que é diferente no congelamento
  (`orcamentos.ts:124-127`, relational builder) e na conferência
  (`contratos.ts:227-228`, `select` sem `orderBy`). Cada item entra por um POST
  HTTP próprio, então o empate é improvável — mas o desempate por `id` custaria
  uma linha e tiraria a dúvida.
- **`descontoValor` é `decimal(10,2)` e serve aos dois tipos.** Um percentual de
  12,345% é gravado 12.35 pelo banco (`schema/orcamentos.ts:106`). Numa base de
  R$ 4.800,00 a diferença é `Math.round(480000×(100−12.345)/100)` = 420744 contra
  `Math.round(480000×(100−12.35)/100)` = 420720 — **R$ 0,24**. Sem consequência
  hoje (a tela só oferece o campo livre), e registrado só para não ser redescoberto.
- **O PDF não imprime nem o número do orçamento, nem a versão, nem o hash.**
  `contrato-pdf.ts:50-121` (`montarLinhas`, lida inteira) desenha loja, noiva,
  itens, valores, parcelas, datas, observações e as duas assinaturas. O papel que
  a noiva assina não carrega nenhuma referência ao aceite que o sistema guarda —
  os dois documentos não se citam.
