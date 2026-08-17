# A fila do `/code-review max` — a execução

A tabela de épicos abaixo é a **fila**. A **fonte da verdade do que continua
aberto é a tabela S-R2…S-R19** da conferência —
[`2026-08-16-conferencia-do-contrato/EXECUCAO.md`](../2026-08-16-conferencia-do-contrato/EXECUCAO.md),
seção *"O que o `/code-review max` achou depois"* —, e é lá que cada linha é
riscada com o hash do commit que a fecha (regra 21). **Conte aquela tabela,
não este arquivo.**

Plano: [`2026-08-16-a-fila-do-review-max-plano.md`](../../propostas/2026-08-16-a-fila-do-review-max-plano.md)
· Base: `619f347d`

## O que a revisão abriu

Dez ângulos sobre `fb3dcb50`, **19 achados**, conferidos um a um antes de
entrar na tabela — nenhum descartado. A S-R1 (a suíte de API vermelha no
`main`) fechou em `3c71d474` e virou a **regra 35**. Eram **18 abertos:
1 🔴 · 7 🟠 · 8 🟡 · 2 🔵**, em **6 épicos**. Sete deles nasceram da fila do
mesmo dia (E242, E244, E245, higiene, E248).

**A FILA ESTÁ INTEIRA EXECUTADA** — contado em 17/08/2026, com as quatro
réguas fechadas: **as 18 estão riscadas, ZERO S-R abertas.** O E249 e o E250
saíram na mão; o **E251, E252, E253 e E254 saíram de quatro agentes em
paralelo**, divididos pelo recurso compartilhado
([o plano](../../propostas/2026-08-17-as-15-abertas-com-agentes-plano.md)), e
integrados um a um.

**Régua do fecho: API 1905 (272 arquivos) · frontend 1037 (113 arquivos) ·
E2E 187 em 6,5 min, 0 skipped · banco virgem inteiro (16) · typecheck verde
em 5 projetos.**

**O repositório tem agora 8 sobras abertas: 0 🔴 · 0 🟠 · 3 🟡 · 5 🔵** — as
**sete** que os agentes acharam de passagem (tabela abaixo) e a **S-M17**, que
espera o dump de uma instalação real que ainda não existe. Começou o dia em
15. **Conte as tabelas, não este parágrafo.**

**O que o lote ensinou sobre o diagnóstico, e é o que vale guardar:** das 14
sobras executadas, **nove tinham o mecanismo ou o número errado** — e nas duas
direções. Para MENOS: o dano da S-R2 era R$ 48.000,00 e não R$ 12.000,00 (o
caput da 16ª multiplica por peça); a S-R15 tinha cinco citações em dois
manuais e não uma; o S-R8 tinha dois ciclos; a S-R16 tinha três ações, e a
terceira é a que não tem volta. Para MAIS: o dano vivo da S-R5 era R$ 0,00
(nenhuma parcela com mês cheio de mora); a S-R7 descrevia o par de opções ao
contrário, e o mecanismo não pode produzir aquele par. E uma estava **errada
na causa**: a **S-R11** culpava a visibilidade pool × `tx`, quando em READ
COMMITTED as duas leituras veem o mesmo instante — o conserto que ela
prescrevia teria dado verde sobre caminho torto. Quem fecha é a tranca.

*Uma correção de contagem, feita aqui em 17/08:* o cabeçalho da conferência
publicava *"1 🔴 · 8 🟠 · 8 🟡 · 2 🔵"*, que soma **19** para **18** linhas.
Contadas uma a uma, as 18 são **1 🔴 · 7 🟠 · 8 🟡 · 2 🔵**. O número errado
tinha sido copiado para o ponteiro, para o plano e para este arquivo.

## A fila

| Épico | Tese | Fecha | Estado |
|---|---|---|---|
| ~~**E249**~~ | ~~a data do papel segue o casamento, e todo mundo lê a mesma data~~ | S-R2 🔴, S-R3 🟠, S-R12 🟡 | ✅ `458adf11` · [relatório](execucao/E249.md) — o papel recalcula pela janela nova quando o casamento é adiado (hora preservada, e só cede à 4ª); `disponibilidade.ts` lê `fimPrevistoDaDevolucao` pelo SELECT que já existia; o `PATCH /contratos` derruba a fila. Vermelho antes: `expected 48000 to be +0` — e a sobra dizia R$ 12.000,00, porque o caput da 16ª multiplica POR PEÇA. API 1878 · E2E 187 |
| ~~**E250**~~ | ~~o que se escreve num banco que já existe~~ | S-R5 🟠, S-R9 🟠 | ✅ `91012acb` · [relatório](execucao/E250.md) — a faxina apaga o índice de exemplo pela marca (que virou constante), e NÃO um filtro no leitor, que desfaria a decisão do E242; o backfill da S-A27 ganha `loja_id` nas três pontas e a vírgula vira `JOIN … ON`. **A sobra errava para MENOS o alcance do S-R9 e para MAIS o dano vivo do S-R5**: hoje ele cobra R$ 0,00 (nenhuma das 110 parcelas tem mês cheio de mora). Duas réguas novas, as duas medidas em vermelho. API 1881 · banco virgem 16 |
| ~~**E251**~~ | ~~as portas ao lado, segunda passada~~ | S-R4 🟠, S-R8 🟠, S-R10 🟡, S-R11 🟡, S-R13 🟡 | ✅ `0bff780c` · [relatório](execucao/E251.md) — as duas pontas do ciclo tomam as linhas na mesma ordem (**eram DOIS ciclos, não um**), `perdoar-mora` decide sob `FOR UPDATE`, e a conta do atraso sobe de dentro da transação. **A S-R11 errava o mecanismo** e está dito na linha dela. Vermelho antes: 10 de 13, com `deadlock detected` literal nas duas pernas e `expected 4250 to be 3750`. Retrato de trancas 45/13/14 → 50/10/12, dívida 14 → 12 |
| ~~**E252**~~ | ~~o envio à contabilidade é por ATO, não por parcela~~ | S-R6 🟠 | ✅ `4d271353` · [relatório](execucao/E252.md) — declarar é por ATO, no molde da conciliação do E235; o carimbo da parcela vira DERIVADO. Migração com backfill rodada no `heliumdb` (`INSERT 0 0`, 0 de 322 carimbadas). **A armadilha tem número**: limpar o carimbo declararia R$ 1.400,00 sobre R$ 1.000,00 recebidos |
| ~~**E253**~~ | ~~as telas apagam e mostram o que o banco tem~~ | S-R7 🟠, S-R16 🟡, S-R17 🟡, S-R19 🔵 | ✅ `a5c9c630` · [relatório](execucao/E253.md) — o alvo do apagar vem da identidade e a lista encolhe por `reset`, não por `remove()` (que ligaria o `isDirty`); as invalidações viram famílias nomeadas, com varredura contra a sexta grafia. **As quatro sobras erravam para MAIS.** Frontend 1017 → 1037 (108 → 113 arquivos) |
| ~~**E254**~~ | ~~a letra e a régua~~ | S-R14 🟡, S-R15 🟡, S-R18 🔵 | ✅ `f0f4b5d6` · [relatório](execucao/E254.md) — o seletor que nunca existiu (um e-mail não é um UUID), as CINCO citações mortas em DOIS manuais, e a cerca que só cercava quem já tinha nome. **A regra 34 fechada com execução pelo orquestrador**: com a guarda removida de propósito, o `e2e/64` novo reprova com `Received: 1`; o velho passaria |

## Decisões

| Pergunta | Recomendação | Estado |
|---|---|---|
| **E249** — casamento adiado: a data de devolução do papel recalcula pela janela nova, anda os mesmos dias, ou fica onde está? | **Recalcula pela janela nova** (E224: janela de uso andando até dia de expediente), preservando a hora; a retirada anda junto | aberta — executada na recomendação |

## Sobras

Sobra NOVA, vista de passagem durante esta execução, entra aqui no mesmo
commit que a viu (regra 12) e sai riscada no que a fecha (regra 21). As
S-R\* não moram aqui: elas moram na tabela da conferência.

| ID | Sev. | Onde | O que | Estado |
|---|---|---|---|---|
| S-RM11 | 🟡 | `dashboard.tsx:244,247` e `:321`, e mais nove sítios | **A mesma classe da S-RM7 fora do sino — e MAIOR que a sobra que a revelou.** `hojeLocal()` aparece **38 vezes em 17 telas**, e **11 delas dentro de um `useMemo`** sem o dia nas dependências. Duas foram lidas e conferidas pelo agente do E256: a fila de cobrança do painel e o `deHoje` da agenda **ficam em ontem numa aba deixada aberta pela virada**. O `useDiaLocal()` já existe (E256); falta julgar as onze uma a uma — nem toda leitura de `hojeLocal()` num `useMemo` é defeito | aberta (E256, 17/08) — **medida: 38 sítios, 17 telas, 11 em `useMemo`** |
| S-RM12 | 🔵 | `sino-aviso-de-erro.test.tsx:37-39` | **O harness mente sobre memoização**: as mocks devolvem `{ data: [] }` NOVO a cada chamada, então toda dependência parece instável. Foi ele que quase fez o agente do E256 confirmar a razão errada do E253 (mediu 4 chamadas em 4 renders). Teste que mede o próprio harness em vez do código é a classe da regra 34 vista pelo avesso | aberta (E256, 17/08) |
| S-RM13 | 🔵 | `financeiro/folha.tsx` ("Enviar à contabilidade") × `e2e/**` | **Nenhum E2E abre esta porta**, e o E252 e o E256 mexeram nos dois lados dela (o envio virou por ATO; o campo da resposta virou `recebimentos`). O toast diz *"N saída(s) e M recebimento(s) do período"* — lendo `undefined`, ele imprime *"undefined recebimentos"* em vez de estourar, que é o pior modo de falhar. Mesma classe da S-RM3 e da S-CF2 | aberta (E256, 17/08) |
| ~~S-RM5~~ | 🟡 | `CLAUDE.md` (a régua) × `2026-08-11-otica-dos-papeis/EXECUCAO.md:246` | ~~**O ponteiro mandava procurar um defeito já consertado.** Ele publicava *"o frontend reprova entre 00:00 e 03:00 UTC pela S-O119"*, e a **S-O119 fechou no E198** — está riscada. Medido pelo agente do E253: **1037 verdes às 01:57, 01:59 e 02:04 UTC**, três vezes dentro da janela dada como maldita. Classe S-A5 com o custo INVERTIDO: em vez de esconder trabalho, ensina a atribuir ao fuso um vermelho verdadeiro — e eu repeti a frase no plano deste lote, de onde ela foi para o prompt de quatro agentes~~ | ✅ riscado no `CLAUDE.md` e no plano em 17/08 |
| ~~S-RM6~~ | 🟡 | `comissoes/index.tsx` (`onGerarFechamento`) | ~~**A S-R16 não era uma ação, eram TRÊS**, e a terceira é a que não tem volta: **"Fechar competência"**. Competência fechada é imutável e a prévia passa a responder da memória do fechamento (`routes/comissao.ts:963-969`) — depois do clique, o número na tela e o que virou conta a pagar ficavam com fontes diferentes. Fechada junto no E253; fica registrada porque o diagnóstico da S-R16 não a continha~~ | ✅ `a5c9c630` (E253) — registrada por ser correção ao diagnóstico |
| ~~S-RM7~~ | 🔵 | `sino-notificacoes.tsx:241` | ~~O `useMemo` que decide o id do aviso **não depende do dia**: numa aba aberta pela virada da meia-noite o aviso conserva o id de ontem até o poll mexer numa dependência. **Declarado, não consertado** — o conserto recalcularia a lista a cada render~~ | ✅ `0c136b19` (E256) — **e a razão de ela estar aberta era factualmente ERRADA**: o E253 dizia que o conserto recalcularia a lista a cada render, e `hojeLocal()` devolve STRING, que é dependência estável (medido: o corpo do `useMemo` roda 1 vez em 4 renders, antes e depois). A sobra também era incompleta — pôr o dia nas dependências é necessário e insuficiente, porque o poll de 5 min não re-renderiza quando a fila segue em erro. Entrou `useDiaLocal()`, que re-renderiza UMA vez por virada, e o sino lê o dia dele em TRÊS sítios: o id do aviso, a frase do caixa negativo e a **janela da agenda**, que não estava na sobra e pedia as 24h de ontem |
| ~~S-RM8~~ | 🔵 | `moscow-noivas` (todos os `useFieldArray`) | ~~A classe que produziu a S-R7: **um campo `id:` no schema de um array de `useFieldArray`** é sobrescrito pela chave do próprio hook, e a identidade some da linha — daí o alvo passar a ser resolvido por posição. Não varrido (era escopo de outro épico), e é barato de procurar~~ | ✅ `0c136b19` (E256) — **fechada por varredura, população 1**: o repositório tem UM `useFieldArray`, com UM `z.array(z.object)`, já pago pelo E253. Zero ofensores. Fica a cerca para o próximo, com o vermelho CONSTRUÍDO (regra 34): devolvendo `opcaoId` ao nome `id`, ela nomeia o arquivo |
| ~~S-RM9~~ | 🔵 | `lib/api-spec/openapi.yaml:8243` (`EnviarContabilidadeResultado.parcelas`) | ~~Desde o E252 o campo conta **RECEBIMENTOS**, não parcelas — a descrição já dizia *"Recebimentos declarados"*, e o NOME do campo é que ficou meio passo atrás. Renomear mexe no spec, nos dois clientes gerados e na tela, para um número cujo significado não muda para quem lê a frase~~ | ✅ `0c136b19` (E256) — **a sobra dizia quatro frentes; são SEIS**: 1 no spec, 3 gerados, 1 na rota, 1 na tela e **9 asserções em 2 testes de API** (a varredura por `marcados` achava só duas). `parcelas` → `recebimentos`. Vermelho: com a rota no nome velho, 7 de 7 em `500 RESPOSTA_FORA_DO_CONTRATO` |
| ~~S-RM10~~ | 🟡 | o prompt de todo agente com worktree | ~~**O worktree de agente nasce sem `node_modules`.** Antes de qualquer régua: `pnpm install --frozen-lockfile` (15,9 s) e `pnpm run typecheck:libs` da raiz — senão o `tsc` cospe **TS6305 `lib/api-client-react/dist/index.d.ts` has not been built** e 30 erros fantasmas, e o agente vai caçar defeito que não existe. Irmã da regra 29, e cabe no prompt como ela~~ | ✅ `2656568d` — **fechada por REGRA, não por código**: virou a emenda da regra 29 no METODO (o primeiro gesto do agente com worktree tem duas linhas, não uma). Sobra cujo conserto é uma regra fecha quando a regra está escrita |
| S-RM2 | 🟡 | `docs/manuais/*.html` × as telas que elas citam | **A prosa citada dos manuais não tem régua, e o E254 provou com um caso vivo.** São **161 aspas curvas em `<em>`** nos manuais; **82 batem literalmente com a tela e 79 não**. A família nova que o E254 escreveu (aspa que nomeia cláusula, em qualquer tag) cobre **13**. A prova é `docs/manuais/vendedora.html:800`: frase de sistema, envelhecida pelo E248, corrigida à mão no E254 — e nenhuma régua olhava para ela. **O atalho foi tentado e reprovou na regra 34**: a peneira automática por segmentos fixos derruba 79 → 52 e **aprova o próprio `:800`** (o segmento que sobra tem 17 caracteres); não entrou, e foi certo não entrar | aberta (E254, 17/08) — **medida pelo agente, 161/82/79 contadas** |
| ~~S-RM3~~ | 🔵 | `e2e/64-portas-ganham-tela.spec.ts` × `admin/index.tsx:493,585` | ~~`e2e/64` é o **único E2E que abre `/admin`**, e `editar-loja-${loja.id}` e `editar-usuario-${u.id}` nunca são clicados por spec nenhum. É a mesma tela da S-R19, e a mesma classe da S-CF2 (a porta que ganhou tela e nenhum E2E encena)~~ | ✅ `517cf46d` (E257, feito pelo orquestrador porque a régua é o E2E) — a loja vazia e a pessoa nova passam a ser EDITADAS antes de apagadas, sobre as fixtures que já existiam. Três asserções por metade: o diálogo abriu, abriu no ALVO (o campo vem com o nome da fixture — é o `reset`), e o BANCO mudou. Vermelho da regra 34: com `onSalvarLoja` sem o `mutateAsync`, o toast "Loja atualizada" aparece e o banco fica com o nome velho — `Received: "E2E Loja vazia 1786935640613"`. **A única das quinze do dia que não precisou de correção nenhuma** — e ela nasceu de quem já estava DENTRO do arquivo |
| S-RM4 | 🔵 | `varredura-manuais-textos` × JSX | A varredura compara a citação do manual com o **código-fonte cru**, e o JSX parte frases no meio: três das 11 declarações do E254 tiveram de escolher um fragmento mais curto que a frase da tela (`noivas/[leadId]/index.tsx:692-694`, `contratos/index.tsx:252-253`, `peca-exclusiva.ts:72-73`). A régua vale; o que ela compara é menos do que promete | aberta (E254, 17/08) |
| ~~S-RM1~~ | 🟡 | `disponibilidade.ts` (`janelasSemOlharCancelamento`) × `reservas.ts` (`PATCH /reservas`) × `contratos.ts` (`POST /contratos`) | ~~**A data do papel agora ESTICA a janela física, e ninguém revalida os dias que ela estica.** Desde o E249/S-R3, `fimUsoPrevisto` é `fimPrevistoDaDevolucao` — e o papel do E224 anda para a frente até dia de expediente, logo é `≥ casamento + usoDiasDepois`. O `PATCH /reservas` valida a disponibilidade do candidato pela JANELA (`casamento + 2`) e grava um papel que pode ir a `+3` ou `+4`; o `POST /contratos` grava `dataDevolucao` vinda da sugestão da tela sem consultar disponibilidade nenhuma. Nos dias entre a janela e o papel a peça fica ocupada por uma escrita que o 409 não viu. Casamento sábado, janela até segunda (fechada), papel na terça: a terça é ocupada sem ter sido validada. **Não é regressão do E249** — o `POST /contratos` já gravava assim desde o E224; o que o E249 fez foi dar efeito de ocupação a um campo que antes não tinha nenhum. O conserto é passar o papel novo ao candidato antes de validar (e validar no `POST /contratos`), e mora na mesma família da S-R8: precisa da ordem de trancas do E251~~ | ✅ `0bff780c` (E251) — `dataDevolucaoDoPapel` desce DENTRO do candidato nas duas portas, então a disponibilidade valida os mesmos dias que a escrita vai ocupar. Nascida no E249 e fechada no lote seguinte |
