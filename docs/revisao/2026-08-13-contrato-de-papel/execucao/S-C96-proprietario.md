# S-C96 (proprietário) — quem decide passa a saber o que o contrato cobra, e o que ele não cobra de propósito

**Trilha do contrato de papel** · branch `worktree-agent-a42e70009988aa9ea` ·
base `d5733a96` (a fundação do lote: a régua dos manuais aprende dinheiro)
Fecha: a fatia `proprietario.html` da **S-C96 🟡**
Réguas: `varredura-manuais` · `varredura-manuais-prazos` · `varredura-manuais-textos`
— **3 arquivos, 13 testes, verdes** · typecheck verde em 5 projetos

---

## O que o plano errou

### 1. O manual não tinha "0 ocorrências de retirada" — tinha zero de tudo, e a régua que o pregaria não existia

A tarefa media a dívida certa (`proprietario.html` com **0** de "cláusula",
"avaria", "multa", "juros", "rescisão", "exclusiva", e nem "retirada"), mas
supunha uma porta que a árvore não tinha: **as 13 constantes do contrato não
eram citáveis**. A `varredura-manuais-prazos` conhecia **5 réguas, todas de
tempo em milissegundos** (`CONVITE_TTL_MS`, `SESSAO_TTL_MS`, `LOOKBOOK_TTL_MS`,
`PORTAL_TTL_MS`, `VALIDADE_PADRAO_DIAS`), e o teste
*"toda régua citada por um manual existe no código"* reprovaria qualquer célula
`data-regua="TAXA_LIMPEZA_MAXIMA"`.

Pior: **duas das treze não existiam como constante.** `DEDUCAO_DA_RESCISAO_PCT`
e `PRAZO_DEVOLUCAO_DA_LOJA_DIAS` eram **números soltos** — o `0.4` dentro do
cálculo (`rescisao.ts:191` na base antiga) e o `30` dentro da rota
(`contratos.ts:1847`). **Um manual não pode prometer o que não tem nome**, e é
exatamente essa a doença que este lote existe para curar: número solto envelhece
calado. As duas nasceram na fundação (`d5733a96`), e só depois disso este
documento pôde citá-las.

É a mesma forma dos quatro épicos anteriores da trilha — *o plano supõe portas
que o sistema não tem* —, agora do lado da documentação.

### 2. Havia uma TERCEIRA régua, e a tarefa citava duas

A tarefa mandava rodar `varredura-manuais` e `varredura-manuais-prazos`. Existe
a **`varredura-manuais-textos`** (E210), que prega o que a tarefa mais cobrava
— **regra 22** — e que a tarefa não nomeou: ela exige que todo `<span
class="btn">` e todo recado entre aspas curvas da coluna `<th>O recado</th>`
exista **literalmente** no código da tela.

Ela reprovou três recados meus, e **estava certa nos três**:

```
docs/manuais/proprietario.html · recado: «O contrato pede o restante pago até […] dias antes da retirada (parágrafo único)…»
docs/manuais/proprietario.html · recado: «…atrasou e não está no rol de itens do contrato.»
docs/manuais/proprietario.html · recado: «Esta parcela mudou enquanto você digitava…»
```

Os três eram meus, e por três motivos diferentes: o primeiro tem a constante
**interpolada** no meio (`O contrato pede o restante pago até ${…} dias antes da
retirada`, `reserva.ts:152`), então a frase inteira não existe em lugar nenhum
do código; o segundo está **quebrado em três linhas** no JSX
(`reservas/[bloqueioId].tsx:945-947`) e não é contíguo; o terceiro eu **truncei
com reticências** quando o literal cabia inteiro (`contratos.ts:2332`).

**A lição é a do E210 na direção que ele não previu: reticência quebra citação.**
Aspas curvas naquela coluna são uma promessa de literalidade, e "…" é uma
promessa quebrada com aparência de citação.

### 3. E o conserto óbvio dela era o errado

O mecanismo que a régua oferece para frase montada com dado dentro é o
`data-tela="molde"`. Só que o teste
*"molde é a exceção declarada, e continua sendo exceção"* prega a contagem
**exata** (`expect(moldes.length).toBe(9)`). Somos **quatro agentes em manuais
diferentes**; se cada um subir a contagem, os quatro `cherry-pick` colidem na
mesma linha — que é o custo que este lote já pagou uma vez, na numeração de
sobras da Faixa C.

**Reescrevi os dois recados montados como prosa descritiva** (sem aspas curvas,
fora do alcance da régua) e **restaurei o terceiro por inteiro**, que era o
único que precisava só de honestidade. Zero moldes novos, zero conflito.
O molde continua sendo a forma certa para os dois primeiros — **a contagem é do
integrador**, e vai na tabela de Sobras como **S-C213**.

### 4. A tarefa mandava listar S-C60 e S-C51 como decisões — e o argumento de uma delas já tinha caído

A **S-C60** não é mais *"a loja segura peça sem dona?"* com o custo em aberto: o
argumento que a protegia (a parede de 97%) **foi remedido e vale 0 de 116** em
`moscow_base`, e o **lado do dinheiro já fechou** na S-C80 (`b1a21d00`) — cobrar
avaria de peça sem dona é **422 `AVARIA_SEM_DONA`** hoje, não 201. Escrever
"espera decisão" sem dizer isso repetiria o erro da entrega 4 deste mesmo manual
ao contrário: apresentar como aberto o que já foi metade resolvido. O manual diz
as duas metades.

---

## As três coisas que o manual passou a dizer, e uma que ele teve de confessar

### A seção 3, nova — "O que o contrato cobra"

Entrou entre *O mapa do financeiro* e *Receber e pagar*, e empurrou as sete
seguintes (as antigas 3–9 viraram 4–10, no índice e nos `h2`). É a posição certa
pela ordem do dinheiro: **de onde ele vem** antes de **como se recebe**.

**13 células `data-regua`**, uma por constante, todas na tabela
*"Os números, cláusula por cláusula"* — e nenhum dos treze números aparece solto
na prosa do documento, que é a regra que o integrador cobrou. Onde a prosa
precisava do número, ela aponta para a tabela ("a faixa da tabela acima", "o
múltiplo está na tabela acima").

A seção diz, além dos números: **o que dispara cada cobrança e onde o dinheiro
aparece** (avaria e atraso viram parcela no carnê; a devolução da rescisão vira
**conta a pagar** do tipo `Devolução`; o reajuste da 17ª vira **parcela nova**,
sem mexer no total do contrato); **a régua que não vira parede** (a justificativa
gravada das 14ª/15ª, com a frase literal da tela); **o que avisa × o que
recusa**, com o número que decidiu a diferença (101 dos 311 contratos ativos têm
entrada abaixo da sugestão da 8ª §1º — por isso ela avisa; o prazo do parágrafo
único recusa); e **as três omissões deliberadas** (a correção monetária da 9ª,
a 13ª que devolve tudo, a 18ª que não dispara sem prazo pactuado).

### A confissão: duas capacidades existem e nenhuma tela as alcança

Enquanto media as âncoras, encontrei **duas do formato da S-C151** — o defeito
que a trilha já viu três vezes (E222, E197, S-C151): a capacidade existe na API
e nenhuma tela chega nela.

- **Perdoar a multa da 9ª.** Rota `POST`/`DELETE
  /lojas/:lojaId/parcelas/:parcelaId/perdoar-mora` (`contratos.ts:2352` e
  `:2429`), hook gerado (**20 ocorrências** em
  `lib/api-client-react/src/generated/api.ts`), e **0 usos em todo
  `artifacts/moscow-noivas/src`** — medido case-insensitive: `perdoar` dá 2
  ocorrências no frontend, as duas prosa em arquivos sem relação. O **selo** do
  perdão É lido (`noiva-portal.tsx:691`); o **gesto** não existe.
- **Pactuar a antecedência da 18ª.** `prazoDevolucaoReservaDias` aparece **0
  vezes em `pages/`** (79 arquivos), **0 em `e2e/`** e 3 em `routes/`. Sem ele
  preenchido a 18ª nunca dispara — e não há por onde preenchê-lo.

**O manual DIZ as duas.** Calar seria a regra do E196 outra vez, e dizer sem
ressalva seria pior: o proprietário leria "o sistema registra quem perdoou" e
iria procurar um botão que não existe. As duas entram como sobras.

### A "Dados da loja" mentia por omissão

A seção 10 dizia *"Nome, endereço e telefone"*. São **quatro** campos —
`dados-da-loja.tsx:112-113` tem o **CNPJ**, com placeholder
`00.000.000/0000-00`. Corrigido, e amarrado à **P3**: é a única das oito
pendências que se resolve sozinha, em cinco minutos, **na tela**.

E fica dito o que o sistema **não** faz: `cnpj` é `type: string` puro no spec
(`openapi.yaml:5181, 5191, 5198, 5211`) — sem `pattern`, sem `format`. **Não há
validação de CNPJ em lugar nenhum do sistema hoje**, o que é justamente o que
torna a P1 séria: os dois números da página 6 são CNPJs válidos, e nenhuma
conferência automática os separaria.

### A seção "O que espera uma decisão sua", reescrita a partir da tabela de hoje

Eram 4 itens decididos e 1 aberto. Agora são **8 abertos**, agrupados por quem
responde, cada um com **o que muda em cada resposta**: as 4 pendências
(**P1** o CNPJ da página 6, **P2** os contratos já assinados com ela, **P3** os
dados reais da loja, **P4** o índice da correção monetária), as **2 decisões que
travam o E220** (**D4** o PDF virar o instrumento, **D7** representante legal e
chave PIX no cadastro), as **2 escolhas de produto** (**S-C60** e **S-C51**), e
as duas menores ainda de pé (a confecção sem prazo próprio — **S-O50**, hoje 🔵,
conferida na tabela da ótica dos papéis, linha 181 — e o perfil "Proprietária"
no gênero errado, ainda literal em `configuracao-inicial.ts:139`).

As quatro decididas em 12/08 ficaram, ao fim, sob **"As quatro que você já
decidiu"** — o oposto do erro da entrega 4, que listava como pendente o que já
tinha sido decidido.

---

## Verificação

**Antes**, no `main` (`cf3613c5`), em `docs/manuais/proprietario.html`:

| termo | ocorrências |
|---|---|
| cláusula · avaria · multa · juros · rescisão · exclusiva | **0** cada |
| retirada | **0** |
| células `data-regua` | **0** |

**Depois**: **13 células `data-regua`**, uma por constante do contrato —
`RESERVA_PCT`, `PRAZO_ANTES_DA_RETIRADA_DIAS`, `MULTA_DE_MORA_PCT`,
`JUROS_DE_MORA_MENSAL_PCT`, `DEDUCAO_DA_RESCISAO_PCT`,
`MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL`, `PRAZO_DEVOLUCAO_DA_LOJA_DIAS`,
`TAXA_LIMPEZA_MINIMA`, `TAXA_LIMPEZA_MAXIMA`, `TETO_DO_DANO_EM_ALUGUEIS`,
`MULTA_DE_ATRASO`, `DIAS_PARA_EXTRAVIO`, `MULTIPLICADOR_DE_EXTRAVIO`.

### O vermelho da régua nova, provocado de propósito

Régua que nunca reprovou não é régua. Troquei **um** número — o teto da 14ª, de
`R$ 2.500,00` para `R$ 2.400,00` — e rodei:

```
FAIL  src/lib/varredura-manuais-prazos.test.ts > … > e o número que o manual escreve é o número que a constante vale
AssertionError: o manual promete um prazo que o código não pratica: expected [ Array(1) ] to deeply equal []
```

Desfeito, e verde. **Fica provado que as 13 células estão realmente presas à
fonte**, e não são decoração — inclusive que a régua aceita o ponto de milhar
(`2500` casa com `R$ 2.500,00`), que era o único risco tipográfico da tabela.

### O vermelho que eu não provoquei

A `varredura-manuais-textos` reprovou sozinha, com os três recados transcritos
na seção *O que o plano errou*. Consertado sem tocar na régua.

### As três, verdes

```
 RUN  v4.1.10 /home/runner/workspace/.claude/worktrees/agent-a42e70009988aa9ea/artifacts/moscow-noivas

 Test Files  3 passed (3)
      Tests  13 passed (13)
   Duration  1.39s
```

### Typecheck, da raiz

```
typecheck:libs  → tsc --build            ✓
typecheck:e2e   → tsc -p e2e/tsconfig    ✓
lib/api-spec typecheck: Done
scripts typecheck: Done
artifacts/api-server typecheck: Done
artifacts/moscow-noivas typecheck: Done
```

**API e E2E não rodados** — não são exigidos por esta tarefa, e o E2E não é
rodável em worktree (isola arquivo e banco, **não isola porta**).

### Estrutura do documento

14 `<section>` abertas e 14 fechadas · 12 `<table>` e 12 `</table>` · 12
`<tbody>` e 12 `</tbody>` · 12 `.rolagem` (toda tabela dentro do contêiner que
rola). Numeração dos passos **1…10, consecutiva**, e o índice bate com os `h2`.

---

## Visto de passagem

Cada um destes entra na tabela de Sobras do rastreador no mesmo commit
(regra 12). Faixa reservada: **S-C210+**.

| # | O que | Severidade |
|---|---|---|
| **S-C210** | **O perdão da multa da 9ª não tem tela.** Rotas `POST`/`DELETE /lojas/:lojaId/parcelas/:parcelaId/perdoar-mora` (`contratos.ts:2352`, `:2429`), hook gerado (**20 ocorrências** em `lib/api-client-react/src/generated/api.ts`), e **0 usos** em `artifacts/moscow-noivas/src` (`grep -ri perdoar` dá 2 hits, os dois prosa sem relação). A decisão de 13/08 foi *"cobrar por padrão, perdoar por gesto"*, e **o gesto não existe** — só se perdoa pela API. O **selo** já é lido (`noiva-portal.tsx:691`), o que torna o buraco invisível: a tela sabe desenhar o perdão que ninguém consegue dar. Terceira ocorrência do formato do E222/E197/S-C151 | 🟡 |
| **S-C211** | **A antecedência da 18ª não tem tela.** `contratos.prazo_devolucao_reserva_dias` (D3) aparece **0 vezes em `pages/`** (79 arquivos), **0 em `e2e/`**, 3 em `routes/`. `null` é "não pactuado" e a 18ª **não dispara** — então hoje a cláusula que devolve sem dedução a quem pagou tudo e avisou a tempo **nunca se aplica**, e não por decisão: por falta de campo. Irmã da S-C151 (a `iniciativa` da 13ª), no mesmo épico E217 | 🟡 |
| **S-C212** | **`MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL` é constante que ninguém lê.** Declarada em `exclusividade.ts:98` e testada em `exclusividade.test.ts:61`, mas **`rescisao.ts` não a importa**: a 12ª está implementada como *"a fração exclusiva fica inteira com a loja"* (`rescisao.ts:203-209`). **Mudar a constante hoje não muda a conta** — o docstring dela promete o contrário (*"o dia em que a dona renegociar, muda-se aqui e a porta continua igual"*). É a classe do E186: a régua descreve um mecanismo que o código não usa. Agravante novo: **o manual do proprietário agora a cita numa célula `data-regua`**, então o papel promete um número que o cálculo ignora | 🟡 |
| **S-C213** | **Dois recados do contrato não são citáveis literalmente, e o mecanismo para isso tem contagem travada.** O do prazo da retirada tem a constante **interpolada** (`reserva.ts:152`) e o da peça fora do rol está **quebrado em três linhas** de JSX (`reservas/[bloqueioId].tsx:945-947`) — nenhum dos dois existe como frase contígua no código, que é o que a `varredura-manuais-textos` exige. O mecanismo previsto é o `data-tela="molde"`, mas o teste prega `expect(moldes.length).toBe(9)`, e **quatro agentes em paralelo não podem subir a mesma linha**. Contornado com prosa descritiva; o molde é a forma certa, e a contagem é do integrador | 🔵 |
| **S-C214** | **`CONVITE_TTL_MS` é citado sem régua.** `proprietario.html` diz *"O convite **vale 7 dias**"* na seção Equipe, em `<p>`, e a `varredura-manuais-prazos` **conhece essa régua** — mas ela só lê células `<td class="prazo" data-regua=…>`. O número está solto exatamente como os do contrato estavam, e envelhece calado. Fora do escopo deste épico (a seção é de equipe, não de contrato), e o conserto é mecânico: virar tabela | 🔵 |

**E uma observação de ferramenta, para o `replit.md` se o integrador concordar**
(regra 8): o worktree deste agente nasceu **7 commits atrás** do `main` e **sem
`node_modules`**. O `pnpm install` do `replit.md:137` é obrigatório e leva
**6,4 s** — sem ele o `vitest` falha com `Cannot find package 'vitest'` vindo de
`/home/runner/workspace/node_modules/.vite-temp/`, o que **parece** defeito de
configuração compartilhada e é só instalação faltando. O `replit.md` já avisa
que esquecê-lo "falha em SILÊNCIO" no `drizzle-kit`; no `vitest` ele falha alto,
mas apontando para o diretório errado.
