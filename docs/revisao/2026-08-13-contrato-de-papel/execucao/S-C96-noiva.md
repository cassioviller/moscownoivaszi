# S-C96 (noiva) — a noiva aprende o que o contrato cobra dela, e cada número tem quem o pregue

**Trilha do contrato de papel, leva 2 (os manuais)** · branch `worktree-agent-ac6092aea21b7e712`
· base `d5733a96` (a fundação da leva: *"S-C95 — a régua dos manuais aprende dinheiro"*)
Fecha: a parte `noiva.html` da **S-C96 🟡**
Réguas: `varredura-manuais` **5 verdes** · `varredura-manuais-prazos` **5 verdes** · typecheck verde nos 5 projetos

## O que o plano errou, e o que eu errei

### 1. Duas das onze constantes da tarefa NÃO existiam quando o épico abriu

A tabela da tarefa listava onze réguas como se todas estivessem no código. Medido
antes da primeira linha de manual:

```
git grep -n "DEDUCAO_DA_RESCISAO_PCT\|PRAZO_DEVOLUCAO_DA_LOJA_DIAS" -- '*.ts' '*.tsx'
(nenhuma saída)
```

Os 60% eram o literal `* 0.4` em `rescisao.ts:191` e os 30 dias da 13ª §3º não
estavam em `rescisao.ts` nenhum. **O integrador nomeou as duas em `d5733a96`**,
que é a fundação em que este épico se apoia — e é o mesmo formato do achado do
E215: *o plano supõe portas que o sistema não tem*, aqui na forma de constantes
que o plano supõe nomeadas.

### 2. A régua não conhecia nenhuma das réguas do contrato

Na base em que este worktree nasceu, o `REGUAS` de
`varredura-manuais-prazos.test.ts:53-59` tinha **5 entradas, todas de TEMPO**
(`CONVITE_TTL_MS`, `SESSAO_TTL_MS`, `LOOKBOOK_TTL_MS`, `PORTAL_TTL_MS`,
`VALIDADE_PADRAO_DIAS`). Escrever `data-regua="MULTA_DE_MORA_PCT"` reprovaria em
*"toda régua citada por um manual existe no código"* (`:99-102`) — **e a reprova
não seria do manual**. É o buraco que o plano já previa (`plano:221-226`) e que a
fundação fechou.

### 3. O worktree nasceu 13 commits atrás — de novo

`git log --oneline -3` no primeiro gesto deu `cbcd8b30`, e o topo mandado pela
tarefa era `cf3613c5`: **13 commits de atraso**. É a mesma lição do lote das
quatro amarelas, agora com o número maior. Reposicionado antes de ler uma linha
de código.

### 4. O erro que foi meu: `git stash` perdeu o trabalho inteiro

Para rebasear sobre a fundação usei `git stash push --include-untracked` + `git
rebase` + `git stash pop`. O `pop` **devolveu o `vendedora.html` de outro agente
e não devolveu o meu `noiva.html`** — 22 células escritas viraram três, e o hash
do stash caído (`794bb5bb…`) responde `fatal: bad object`, então não houve
arqueologia possível. O manual foi **reescrito do zero**.

A regra do `PROGRESSO.md` vale aqui na direção da ferramenta: **num worktree que
compartilha o disco com outros agentes, `stash` não é lugar de guardar trabalho.**
Quem precisar limpar a árvore para rebasear, copie o arquivo para fora
(`cp` para o scratchpad) — que foi exatamente como a medição isolada abaixo foi
feita, e essa funcionou.

### 5. O que a tarefa afirmou e a leitura corrigiu: "a loja registra com foto"

A tarefa mandava escrever que a avaria é registrada **com foto**. A régua da
faixa (`avaria.ts`) não lê foto nenhuma — o campo existe em
`lib/db/src/schema/avarias.ts:53-55` (`foto_bytes`/`foto_mime`), e o comentário
diz **"Foto-evidência (opcional)"**. O manual afirma que o registro **aceita**
foto e pede que se fotografe; não afirma que toda avaria tem uma. É a lição da
entrega 4 dos manuais (dois erros de deduzir em vez de ler), e ela mordeu aqui.

## O defeito, medido

`noiva.html` conhecia a 7ª (o recibo, do E221) e calava o resto: **0 "avaria",
0 "multa", 0 "juros", 0 "rescisão", 0 "exclusiva"**.

E o mais grave é de assimetria, não de omissão: **a mora da 9ª já chega ao
celular dela desde o E213** e o manual não explicava de onde vinha. As três
portas, lidas:

- `artifacts/api-server/src/routes/portal.ts:270` — `mora: moraDe(p)` desce em
  cada parcela;
- `artifacts/moscow-noivas/src/pages/noiva-portal.tsx:703` — o número da direita
  é `p.mora.total` quando há mora não perdoada, e `p.valorPrevisto` quando não há.
  **É aqui que ela lê R$ 515,00 numa parcela de R$ 500,00**;
- `noiva-portal.tsx:689-696` — a explicação por extenso, `text-destructive`
  quando devida e `text-muted-foreground` quando perdoada.

## O achado que a escrita produziu: os dois números do topo não incluem a mora

Regra 22, as quatro leituras:

| o que | de onde sai | inclui mora? |
|---|---|---|
| "Falta pagar" | `portal.ts:250` → `abertoEmCentavos` (`caixa.ts:291-293`) | **não** |
| "Próxima parcela" | `portal.ts:252` → `saldoAberto` (`caixa.ts:126-128`) | **não** |
| a linha da parcela | `noiva-portal.tsx:703` → `p.mora.total` | **sim** |
| o recibo | `noiva-portal.tsx:738-743` | **sim**, e separa as metades |

`saldoAbertoC` é `previsto − recebido` (`caixa.ts:118`), sem acréscimo nenhum.
**Na mesma tela, a noiva de uma parcela de R$ 500,00 vencida há 30 dias lê
"Falta pagar R$ 500,00" em cima e R$ 515,00 na linha logo abaixo.** Não é erro de
conta — são duas perguntas diferentes —, mas é uma pergunta garantida no WhatsApp.
O manual passa a dizer isso com a frase de resposta pronta; a sobra **S-C200**
reclama o conserto na tela.

## O que a noiva passa a saber

Seção nova, **`#contrato`**, seis assuntos, cada um com a saída na mesma frase
que o valor:

1. **A parcela que vence (9ª)** — 2% + 1% ao mês, mês de 30 dias fixos; o exemplo
   R$ 500,00 → **R$ 515,00** decomposto em **R$ 10,00 de multa + R$ 5,00 de
   juros**; as três telas onde ela lê, citadas literalmente; **sem correção
   monetária**, e o porquê (`mora.ts:40-47`). Escrito também que a base é a
   **parcela e não o contrato** — R$ 10,00 contra R$ 100,00, dez vezes menos,
   pelo CDC art. 52 §1º —, porque é a favor dela e ela vai perguntar.
2. **Devolver no prazo (16ª)** — a diária (aluguel ÷ 6 dias da janela), a multa
   de **R$ 250,00 UMA por devolução** (`atraso.ts:186-187`, escalar fora do
   `map`), e o degrau dos 10 dias. A escada num vestido de R$ 3.000,00: **R$
   750,00 em 1 dia · R$ 4.750,00 em 9 · R$ 12.000,00 em 10**, com a saída em
   caixa própria — *"devolver na data combinada custa zero"* — e a segunda saída,
   avisar. Escrito também o caso misto: peças em faixas diferentes **somam**, e a
   multa entra uma vez.
3. **Dano e limpeza (14ª e 15ª)** — a faixa absoluta de R$ 350,00 a R$ 2.500,00 e
   o teto relativo de 5× o aluguel **daquela peça**; que a **15ª não tem piso**
   (`avaria.ts:101-112`), o que é a favor dela; a foto; a justificativa escrita.
4. **Desistir (8ª §2º, 11ª, 12ª, 18ª)** — os três degraus na ordem em que
   `rescisao.ts:166-192` os calcula, e a **tabela do que ela recebe** em cinco
   situações sobre R$ 2.200,00 pagos (R$ 0,00 · R$ 400,00 · R$ 0,00 · R$ 1.000,00
   · R$ 2.200,00). A 18ª ganhou caixa própria por ser a saída boa que ninguém
   conhece — e está dito que **ela não devolve a reserva**.
5. **Se a LOJA cancelar (13ª)** — devolve tudo, reserva incluída, em até 30 dias,
   e vira conta a pagar.
6. **Retirar e devolver (4ª e 5ª)** — terça a sábado, 10:30–19:00, **sábado até
   18:00** (`expediente-retirada.ts:37-54`); a locação das 10:30 às 18:00; e a
   nota de que o expediente **cadastrado** é o que vale, não o do papel.

A seção fecha com o que o portal **não** diz — e é a frase que muda o trabalho de
quem atende: **das seis, só a 9ª chega sozinha até ela.**

## Verificação

**Vermelho antes, literal.** Com as células escritas e a régua ainda sem conhecer
as constantes do contrato (a base `cf3613c5`, antes da fundação), a
`varredura-manuais-prazos` acusaria em *"toda régua citada por um manual existe
no código"* — `REGUAS` tinha as 5 de tempo e nenhuma das 13. Foi por isso que
este épico esperou `d5733a96`, e não por escolha de ordem.

**Verde depois**, com **só o `noiva.html` modificado** (o `vendedora.html` de
outro agente restaurado a HEAD para a medição não mentir):

```
✓ src/lib/varredura-manuais.test.ts (5 tests)
✓ src/lib/varredura-manuais-prazos.test.ts (5 tests)
Test Files  2 passed (2)
     Tests  10 passed (10)
```

`pnpm run typecheck` — **Done** nos 5 projetos.

**Contagem das células:** 25 `data-regua` no arquivo — as **3 de tempo** que já
existiam (`PORTAL_TTL_MS`, `VALIDADE_PADRAO_DIAS`, `LOOKBOOK_TTL_MS`) e **22
novas**, que são as **11 réguas do contrato citadas duas vezes cada**: uma na
tabela da seção onde o assunto é explicado, outra na tabela-resumo do fim. As
onze: `MULTA_DE_MORA_PCT`, `JUROS_DE_MORA_MENSAL_PCT`, `MULTA_DE_ATRASO`,
`DIAS_PARA_EXTRAVIO`, `MULTIPLICADOR_DE_EXTRAVIO`, `TAXA_LIMPEZA_MINIMA`,
`TAXA_LIMPEZA_MAXIMA`, `TETO_DO_DANO_EM_ALUGUEIS`, `DEDUCAO_DA_RESCISAO_PCT`,
`MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL`, `PRAZO_DEVOLUCAO_DA_LOJA_DIAS`.

**Contagem das palavras que faltavam**, medida no arquivo entregue (e não
estimada — a primeira escrita deste parágrafo trazia seis números de cabeça, e os
seis estavam errados): "multa" **41** · "juros" **18** · "avaria" **3** ·
"rescis…" **7** · "exclusiv…" **14** · "cláusula" **25**. Era `0/0/0/0/0/1`.

**E2E: obrigatório? não.** Nada aqui muda o que a trilha grava nem o formato do
que alguma tela lê — o commit é um `.html` de documentação e um `.md` de
relatório. A regra 11 não é acionada.

## Visto de passagem

- **S-C200 🟡 — o "Falta pagar" do portal não inclui a mora que a linha logo
  abaixo inclui.** `portal.ts:250` soma `abertoEmCentavos` (principal) e
  `noiva-portal.tsx:703` mostra `p.mora.total`. Na mesma tela: *"Falta pagar
  R$ 500,00"* e *R$ 515,00* na parcela. O mesmo vale para "Próxima parcela"
  (`portal.ts:252`). A régua do E213 já devolve `acrescimoC` por parcela, então o
  conserto é somar as metades no resumo — e é a mesma classe da **S-C41**, que é
  este defeito na tela da Cobrança, do lado da loja. Hoje o manual explica; o
  certo é a tela não precisar de explicação.
- **S-C201 🔵 — o portal não mostra a data de DEVOLUÇÃO.** `VestidoDaNoiva`
  (`artifacts/api-server/src/lib/visao-noiva.ts:184-191`) tem
  `retiradaPrevista` e `retiradaFeitaEm` e **nenhum campo de devolução**, embora
  `contratos.dataDevolucao` exista e saia no PDF (`contrato-pdf.ts:129`,
  rótulo `Devolucao`). É **a data que faz a conta da 16ª começar a correr** — a
  mais cara do contrato — e é a única data relevante que ela não vê na tela. O
  E224 acabou de criar o gesto que preenche o campo, então a população vai
  começar a existir agora.
- **S-C202 🔵 — nenhuma cláusula de dinheiro além da 9ª tem lugar no portal.**
  Avaria, atraso, extravio, rescisão e peça exclusiva são calculadas pelo
  sistema e **não descem em nenhuma seção** do `GET /portal`. A noiva descobre
  cada uma pela voz da vendedora, o que é o oposto da doutrina do E211 (o preço
  antes do gesto) que a 9ª já cumpre. O manual declara isso em caixa própria;
  fechar de verdade é produto, não redação.
- **Contaminação entre worktrees, para o integrador.** Durante esta sessão o
  `docs/manuais/vendedora.html` **de outro agente** apareceu modificado na minha
  árvore (41 linhas, itens de índice `#sai-e-volta`, `#avaria`, `#cobra`,
  `#desistir` sem as seções correspondentes ainda escritas), e a
  `varredura-manuais` reprovava por **5 âncoras mortas** que não são minhas.
  Guardei a cópia em `scratchpad/vendedora-leak.html` e restaurei o arquivo a
  HEAD **só para medir**; não commitei nem revertí nada dele. **Vermelho de
  worktree não é vermelho** — e desta vez a razão não foi o `res.download` do
  E169, foi arquivo de outro agente no meu disco.
