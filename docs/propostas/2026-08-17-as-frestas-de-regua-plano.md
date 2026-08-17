# As frestas de régua — o plano do fecho das 15

**Escrito em 2026-08-17**, sobre `b9476f04` (a S-RM34 fechada por decisão, o
ponteiro movido). A dona pediu o plano do que sobrou.

Contadas nas tabelas, não deduzidas: **14 S-RM** no rastreador do review max e
a **S-M17** no da revisão max de 10/08 — **0 🔴 · 0 🟠 · 4 🟡 · 11 🔵**. As
catorze S-RM nasceram todas do fecho das 9, e **quatro delas foram achadas
pelas réguas que os próprios épicos daquele lote escreveram**. É por isso que
este lote tem o nome que tem: **a maioria do trabalho aqui é conserto de régua,
não conserto de tela** — o sistema não perdeu dinheiro em nenhuma das quinze, e
três réguas estão medindo menos do que anunciam.

## Uma sai sem código, e é a quarta vez que ela sai assim

**S-M17 🟡 — não é minha para fechar, e a resposta não mudou desde 16/08.** Ela
pede o dump de uma **instalação real** para separar o passivo da S-M3; no dev
são **0 linhas `AVULSA` em 309 parcelas**, então não há backfill a fazer, e o
predicado candidato precisa ser conferido contra dados reais antes de virar
migração. A dona respondeu que **a instalação real ainda não existe**. Fica
aberta, com a razão visível — e este plano diz isso ANTES de começar.

Sobram **catorze com código**.

## O que eu medi antes de escrever este plano

Reli as catorze contra o código (regra 20). **Nove estão exatas. Cinco mudam, e
três delas mudam o TAMANHO — as três para mais.**

### A S-RM25 é a única da família em que o dia congelado é um TETO

A sobra a descreve como "a S-RM18 no quinto arquivo", e a S-RM18 fechou no E264
com **três das oito desmentidas no dano**, porque `de` e `desde` são PISO: a
chave congelada pede uma janela mais larga e nada some. Aqui não:

```
projecao.tsx:84   const hoje = hojeLocal();
projecao.tsx:93   const janela = ancoraDia ? { de: ancoraDia, ate: hoje } : undefined;
projecao.tsx:96   queryKey: getListPagamentosQueryKey(activeLojaId!, janela),
```

O `hoje` entra como **`ate`**. Teto que fica para trás não alarga: **esconde.**
Numa aba aberta na virada, o recebimento de hoje não entra no realizado desde a
âncora, e a projeção de caixa desenha a curva a partir de um saldo menor do que
o que a loja tem. **É a única das nove da família que perde dado em vez de
pedir demais**, e a sobra não fazia essa distinção. As âncoras também andaram
dois dígitos: a sobra diz `:82` → `:91` → `:94`, e hoje são `:84` → `:93` →
`:96`.

### A S-RM28 pede um conserto no núcleo, e o núcleo não é dela

A sobra ancora em `financeiro-core/src/datas.ts:188` — o
`if (ini > fim) [ini, fim] = [fim, ini];` — e diz "× as 4 telas de janela".
As quatro telas conferem (`financeiro/{folha,receber,pagar,fluxo}.tsx`). O que
ela não diz é que **o `resolverIntervalo` tem seis chamadores, e dois são a
API**: `routes/financeiro.ts:1215` e `:1291`, com a tolerância documentada em
`lib/intervalo.ts:41`. Mexer na troca de pontas dentro do core muda o contrato
de duas rotas para consertar o silêncio de quatro telas. **O conserto é da
TELA**, e disso decorre uma pergunta que é da dona (abaixo).

### A S-RM39 conta uma linha, e são duas

A âncora andou dez linhas — `folha.tsx:524` é hoje `folha.tsx:534` — e o
tamanho medido é **241 caracteres, não 240**. E dez linhas acima existe a
mesma coisa: `:519`, **206 caracteres**, dois ternários de plural interpolados
na mesma string. A classe é a mesma e a população é **2**.

### A S-RM33 agora tem número

A sobra diz "as outras varreduras não foram conferidas". Contadas:
`toBeGreaterThanOrEqual` aparece **30 vezes em 13 varreduras**. Quatro delas
vivem no `varredura-manuais-textos.test.ts`, que é território de outro épico
deste lote — **sobram 26 pisos em 12 arquivos** para conferir.

### A S-RM38 tem o conserto escrito no código que ela acusa

Os dois 410 do `routes/manuais.ts` carregam **`detalhe` diferentes** — `:29`
diz *"O PDF deste manual não está no servidor"* (o `existsSync` falhou) e `:46`
diz *"não está acessível no servidor"* (o `res.download` recusou). Os testes
afirmam só o status, então o vermelho não diz qual dos dois aconteceu, e foi
exatamente essa ambiguidade que custou ao agente do E262 uma reversão de
`artifacts/` para provar que o defeito era anterior ao épico dele. **Afirmar o
corpo é o conserto**, e ele nomeia a causa na próxima vez sozinho.

### O que confere

A S-RM26 (`utilizacao.tsx:49` e `:67`, e a régua cega em `datas-varredura.test.ts:207`,
que procura o NOME `hojeLocal`), a S-RM27 (**seis telas**, contadas uma a uma),
a S-RM29 (`use-escrita-na-url.ts:52-54`), a S-RM30 (`textoDaTela()` em `:178-189`
junta o arquivo inteiro, comentário incluído), a S-RM32 (`proprietario.html:728`),
a S-RM35 (o manual escreve `<em>Fechar com a contabilidade</em>` sem aspa e a
tela já escreve com curva desde o E262), a S-RM36 (`restore-drill.ts:43-45`,
população 1) e a S-RM37 (`captacao.tsx:36`) foram reconferidas e estão exatas.

**Uma tem de ser remedida dentro do épico**: a **S-RM31** diz "quatro citações
conferidas duas vezes" e nomeia cinco âncoras, e a assertiva que existe hoje
(`varredura-manuais-textos.test.ts:574`) fixa `repetidas.length` em **3**. Os
dois números não podem estar certos ao mesmo tempo.

## A pergunta que vira código depois de virar resposta

**S-RM28 — quando a pessoa inverte as pontas da janela, a tela avisa ou
corrige em silêncio?** Hoje ela corrige em silêncio: digitar `De = 2026-08-31`
sobre um `Até = 2026-01-01` devolve oito meses, o campo "De" passa a exibir
outra data — a que o `resolverIntervalo` decidiu — e nada na tela diz que houve
troca. Na folha, esse intervalo alimenta um carimbo de mão única.

**Recomendação: a tela AVISA, e o núcleo não muda.** A troca existe para ser
tolerante com URL montada à mão, e a API depende dela em duas rotas; tirá-la
seria consertar quatro telas quebrando duas portas. O que falta é uma linha
visível ao lado da janela quando `ini > fim` chegou trocado — *"as datas
estavam invertidas e foram trocadas"* —, nas quatro telas, com a folha
carregando também a confirmação do carimbo. Custo: uma função no
`lib/financeiro/datas.ts` que devolve se houve troca, mais quatro linhas de
JSX.

**Se a resposta for outra**, a alternativa é a tela RECUSAR a inversão e manter
o que a pessoa digitou por último — mais honesto com o gesto, mais caro em
código, e diverge do que a URL faz. Executo na recomendação se não houver
resposta antes do épico, e registro a decisão na tabela do rastreador de
qualquer modo (regra 21).

## Os cinco épicos

| Épico | Tese | Fecha | Onde mexe |
|---|---|---|---|
| **E265** — a janela não reinterpreta o gesto em silêncio | S-RM28 🟡, S-RM29 🔵 | `lib/financeiro/datas.ts`, `financeiro/{folha,receber,pagar,fluxo}.tsx`, `hooks/use-escrita-na-url.ts` (só o docblock) |
| **E266** — o dia atrás de uma indireção | S-RM25 🟡, S-RM26 🔵, S-RM27 🔵 | `financeiro/projecao.tsx`, `vestidos/utilizacao.tsx`, `noivas/helpers.ts`, `reservas/helpers.ts`, `lib/ajustes-prazo.ts`, `lib/datas-varredura.test.ts` |
| **E267** — o corpus da régua é a TELA, não o comentário | S-RM30 🟡, S-RM31 🔵, S-RM32 🔵 | `lib/varredura-manuais-textos.test.ts`, `docs/manuais/*.html` (menos a `proprietario:615`) |
| **E268** — a régua publica o número que mediu, e diz por que reprovou | S-RM33 🔵, S-RM38 🔵 | as 12 outras varreduras, `__tests__/{backup-download,e236-manuais}-api.test.ts` |
| **E269** — a frase do card, dos dois lados | S-RM35 🔵, S-RM36 🔵, S-RM37 🔵, S-RM39 🔵 | `financeiro/folha.tsx` (só `:519` e `:534`), `docs/manuais/proprietario.html:615`, `lib/varredura-aspa-reta.test.ts` |

**O E265 e o E266 vão na frente em valor** — são os dois 🟡 que mexem no que
uma pessoa vê: a janela que decide sozinha sobre um carimbo irreversível, e a
projeção de caixa que esconde o recebimento de hoje. **O E267 é o terceiro**
porque é a régua que hoje aprova frase que a tela não escreve, e é ela que vai
julgar os outros dois. Os dois últimos são higiene com número.

**Os cinco cabem em paralelo pela regra 24** — nenhum toca banco, nenhum roda
E2E, nenhum toca tabela de Sobras nem o `CLAUDE.md` —, e os pontos de contato
estão nomeados abaixo. **Se forem sequenciais, a ordem é a da tabela.**

## Os quatro pontos de encontro, nomeados antes de acontecerem

**1. `financeiro/folha.tsx` é tocado por DOIS épicos.** O E265 mexe no
intervalo (`:98`) e no aviso ao lado dele; o E269 mexe nas duas frases de card
(`:519` e `:534`). **Mais de quatrocentas linhas de distância, sem
sobreposição.** Se houver conflito, ele é meu para resolver.

**2. `docs/manuais/proprietario.html` é tocado por DOIS épicos.** O E267 mexe
no `:728` (o grifo de uma palavra) e o E269 no `:615` (o `data-tela` que cresce
de 28 para 58 caracteres). **113 linhas de distância.**

**3. `varredura-manuais-textos.test.ts` é do E267, inteiro — inclusive os
quatro `toBeGreaterThanOrEqual` dele.** O E268 varre as outras doze e tem ordem
explícita de não abrir este arquivo. Sem essa linha, os dois épicos escrevem no
mesmo lugar pelo mesmo motivo.

**4. O E269 quebra em várias linhas a frase que a régua do E267 cobra.** A
`pendencia` do `:534` contém `“Fechar com a contabilidade”`, que é a citação da
S-RM35; partido o template literal, a leitura **crua** do corpus deixa de casar
e só a **renderizada** casa (`renderizarTs`, `:156-158`, colapsa a quebra em
espaço). Os dois agentes não enxergam um ao outro. **A régua que decide é
minha, depois da integração**, e a regra é a que a dona já deu na S-RM16: a
tela é a verdade, o manual a segue.

## O que cada épico tem permissão de NÃO fazer

**E268 — os 26 pisos podem não virar 26 `toBe`.** Piso existe legitimamente
onde a população cresce por fora (varredura de spec que acompanha rotas novas)
e é fresta onde o número é publicado como medida. **O trabalho é dar veredito a
cada um dos 26, não trocar os 26** — e o relatório diz quantos viraram `toBe`,
quantos ficaram `>=` e por quê. Nenhum segue sem julgamento (regra 31).

**E267 — as 8 citações que ficarem vermelhas não se fecham apagando a
declaração.** Tirado o comentário do corpus, oito das 549 perdem o verde. Cada
uma tem de receber um veredito escrito — a tela passa a dizer a frase, ou o
manual passa a citar o que a tela diz. **O caso vivo já tem nome**: o
`recepcao.html:332` cobra *"você não pode ver"* e a tela escreve *"Você não tem
permissão para ver … desta noiva."* (`sem-lista.tsx:45`).

**E265 e E266 não têm essa permissão.** Os consertos são mecânicos e a
população está contada: quatro telas de janela e nove sítios de dia.

## O contrato dos agentes

Vale tudo o que os quatro planos anteriores fixaram: divisão pelo recurso
compartilhado, ninguém toca tabela de Sobras nem `CLAUDE.md`, ninguém roda E2E
nem suíte inteira de API, e **a régua completa é do orquestrador** (regra 25).

**O primeiro gesto do worktree tem TRÊS linhas** (regra 29 com a emenda de
17/08): conferir a base contra `b9476f04`, `pnpm install --frozen-lockfile`, e
`pnpm run typecheck:libs` da raiz. Sem a terceira, o `tsc` cospe `TS6305` e
trinta erros que parecem do código recém-escrito. **O `main` está 75 commits à
frente de `origin/main`**, então o worktree nasce velho por construção.

**Arquivo NOVO se indexa antes de medir** (`git add -N`, regra 35). O E268 é o
épico exposto: ele mexe em réguas que enumeram por `git ls-files`, e é a família
inteira do vermelho que ficou escondido no `main` até `3c71d474`.

**O número de suíte que cada relatório publicar tem de ter sido medido onde é
afirmado** (regra 36), e **a recontagem depois da integração é a que vale** —
no fecho das 9 os quatro agentes mediram 1070, 1056, 1054 e 1057 nos worktrees
deles, e o `main` integrado deu **1078**. A régua de cada agente é
`pnpm --filter @workspace/moscow-noivas test` (**1078 hoje, 120 arquivos**)
mais o typecheck do pacote; o E268 roda também os arquivos de API que tocar.

**A régua do orquestrador, ao fim do lote, são as cinco**: API 1905 (272) ·
frontend 1078 (120) · E2E 188 (0 skipped) · banco virgem 16 · typecheck em 5
projetos. **O E2E é obrigatório neste lote** — o E265 muda o que quatro telas
de janela montam, e o `e2e/15` é justamente quem preenche De e Até em sequência
e clica em "Declarar o mês" (`:301-313`), que é a cena que o E261 devolveu ao
gesto humano (regra 11).

**E o E269 mexe em duas frases que E2E nenhum afirma** — nenhum spec cita
*"Fechar com a contabilidade"*, *"em aberto no mês"* nem *"ainda não
enviado"* (medido por `grep` sobre `e2e/*.spec.ts`, zero ocorrências). A régua
dele é a do E267, e é por isso que o ponto de encontro 4 existe.

## O que fica no fim

**Este plano não promete um número de sobras abertas no fim**, e a razão está
medida quatro vezes: o das 8 previu uma e ficaram sete; o das 7 não prometeu e
abriram oito; o das 9 abriu quinze. **Trabalho que constrói régua nova enxerga
mais do que fecha** — e este lote é feito quase só de régua, então a expectativa
honesta é que ele enxergue bastante.

O que ele promete é o que dá para prometer: **as catorze com código fecham ou
dizem por que não, a S-M17 fica aberta pela razão já escrita, a pergunta da
S-RM28 é respondida antes de virar código (regra 5), e o que nascer entra na
tabela com âncora e medida no mesmo commit** (regra 12).
