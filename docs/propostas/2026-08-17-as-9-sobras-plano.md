# As 9 sobras — o plano do fecho

**Escrito em 2026-08-17**, sobre `f1f97c9e` (o fecho das 7 medido e o ponteiro
movido). A dona pediu: *"fechar essas 9 sobras, plano, plano de execução,
executar"*.

Contadas nas tabelas, não deduzidas: **8 S-RM** no rastreador do review max e a
**S-M17** no da revisão max de 10/08 — **0 🔴 · 2 🟠 · 2 🟡 · 5 🔵**. As oito
S-RM nasceram todas do fecho das 7, que é o retrato normal de um lote que
constrói régua nova.

## Uma sai sem código, e é a terceira vez que ela sai assim

**S-M17 🟡 — não é minha para fechar, e a resposta não mudou desde 16/08.** Ela
pede o dump de uma **instalação real** para separar o passivo da S-M3: no dev
são **0 linhas `AVULSA` em 309 parcelas**, então não há backfill a fazer, e o
predicado candidato precisa ser conferido contra dados reais antes de virar
migração. A dona respondeu que **a instalação real ainda não existe**. Fechá-la
exigiria uma decisão diferente da que já foi dada, e inventar migração sobre
dados que ninguém viu é pior do que deixá-la aberta. **Fica aberta, com a razão
visível — e este plano diz isso ANTES de começar, não no fim.**

Sobram **oito com código**.

## O que eu medi antes de escrever este plano

Reli as oito contra o código (regra 20). Seis estão exatas. **Duas mudam de
tamanho, e as duas para MAIS.**

### A S-RM17 dizia que o tamanho dela era desconhecido. Agora tem número.

A sobra fecha dizendo *"a mesma `atualizarParams` existe em outras telas de
janela do financeiro, e o tamanho da sobra é desconhecido por isso"*. Contado:

| A classe | Quantas | Onde |
|---|---|---|
| `new URLSearchParams(searchParams)` dentro de um handler (a fresta) | **8 telas** | `financeiro/{folha,receber,pagar,projecao}.tsx` · `comissoes/index.tsx` · `agenda/semana.tsx` · `vestidos/utilizacao.tsx` · `ajustes/index.tsx` |
| … dessas, as que também passam por `resolverIntervalo`, que **troca as pontas** | **3** | `financeiro/{folha,receber,pagar}.tsx` |
| … dessas, as que alimentam uma escrita **irreversível** | **1** | `financeiro/folha.tsx` — "Declarar o mês" |

A fresta é de oito; o **alargamento** silencioso é de três, porque é a troca de
pontas que transforma "perdi um parâmetro" em "abri uma janela de dois anos"; e
o **dano** é de uma, porque só a folha carimba de mão única. **As três camadas
são números diferentes e a sobra tinha zero deles.**

**E o conserto existe pronto na biblioteca**: `react-router@7.18.1` tipa
`SetURLSearchParams` como
`(nextInit?: URLSearchParamsInit | ((prev: URLSearchParams) => URLSearchParamsInit), …)`
— o **updater funcional** lê o valor do momento da aplicação, não o da
renderização em que o handler nasceu. Não é workaround: é a forma que a
biblioteca oferece para exatamente este hazard, e ela cabe nas oito.

### A S-RM22 nomeia uma linha, e a subfamília tem pelo menos três

A sobra registra `routes/catalogo.ts:110` (hoje `:114` depois do comentário que
o E259 escreveu) — `desmarque \"Atributo ativo\"`, aspa reta em volta de um
**rótulo fixo**, que é caso diferente do da interpolação. Ela pede que *"a
próxima passada decida a família inteira de uma vez, em vez de uma linha por
épico"*. Varrida, a subfamília tem **três sítios conhecidos**, e o terceiro não
está em sobra nenhuma:

- `routes/catalogo.ts:114` — `desmarque "Atributo ativo"` (S-RM22)
- `financeiro/folha.tsx:524` — `o envio é aqui embaixo, em "Fechar com a contabilidade"` (S-RM21)
- **`contratos/[id].tsx:315` — `Com "Devolvi o valor" marcado abaixo, a devolução sai do caixa agora`** — achado ao varrer para escrever este plano, e é dinheiro na frase ao lado

**A S-RM21 e a S-RM22 são a MESMA sobra vista de dois ângulos**, e o terceiro
sítio prova que separá-las produziria uma linha por épico, que é justamente o
que a S-RM22 pede para não acontecer.

### O que confere

A S-RM18 (7 chamadas em 4 arquivos), a S-RM19 (`editar.tsx:145` e `:180`, com
o segundo carregando DUAS aspas), a S-RM20 (`documento-na-porta.ts:41`,
`admin/perfis.tsx:81`), a S-RM23 (114 sem casa, 88 já batendo) e a S-RM24 (as 3
duplicatas fora do `<em>`) foram reconferidas e estão exatas.

## Os quatro épicos

| Épico | Tese | Fecha | Onde mexe | Quem executa |
|---|---|---|---|---|
| **E261** — a janela não alarga sozinha | S-RM17 🟠 | `financeiro/{folha,receber,pagar,projecao}.tsx`, `comissoes/index.tsx`, `agenda/semana.tsx`, `vestidos/utilizacao.tsx`, `ajustes/index.tsx` | agente |
| **E262** — a aspa reta sai das frases que uma pessoa lê | S-RM19 🟠, S-RM20 🔵, S-RM21 🔵, S-RM22 🔵 | `catalogo/[atributoId]/editar.tsx`, `admin/perfis.tsx`, `contratos/[id].tsx`, `lib/documento-na-porta.ts`, `routes/catalogo.ts`, `financeiro/folha.tsx` (só a `:524`) | agente |
| **E263** — os manuais, quarta passada: a citação ganha casa | S-RM23 🔵, S-RM24 🔵 | `docs/manuais/*.html`, `lib/varredura-manuais-textos.test.ts` | agente |
| **E264** — o dia fora do `useMemo` | S-RM18 🟡 | `components/barra-atendimento.tsx`, `provas/index.tsx`, `noivas/[leadId]/index.tsx`, `atendimentos/novo.tsx` | agente |
| **a linha da integração** | prova de ponta a ponta da S-RM17 | `e2e/15-onda5-pdf-e-folha.spec.ts` | **eu** |

**O E261 vai na frente em valor** — é o 🟠 sobre a escrita de mão única. **Os
quatro rodam em paralelo**, porque a divisão é por recurso: nenhum toca banco,
nenhum roda E2E, nenhum toca tabela de Sobras nem o `CLAUDE.md`.

**A linha da integração é minha e só existe depois do E261.** O teste do E260
põe a janela pela URL e diz na letra por quê: *"a janela entra pela URL, e não
por dois `fill()` seguidos, por causa da S-RM17"*. Fechada a S-RM17, o teste
volta ao **gesto humano** — preencher De e Até em sequência — e passa a ser a
prova de ponta a ponta de que a fresta fechou. É a regra 34 pelo avesso: o
vermelho já existe, gravado, medido e com a trilha de auditoria como prova.
**Agente nenhum pode fazê-la** (worktree não isola porta, S-O93).

## Os dois pontos de encontro, nomeados antes de acontecerem

Foi assim que os dois lotes anteriores não colidiram, e é a única coisa que
este plano precisa acertar de antemão.

**1. `financeiro/folha.tsx` é tocado por DOIS épicos.** O E261 mexe no
`atualizarParams` (`:316-323`) e o E262 mexe na frase do card (`:524`) —
**duzentas linhas de distância, sem sobreposição**. Os dois agentes têm ordem
explícita de não tocar a linha do outro, e a integração confere o arquivo
inteiro depois dos dois. Se houver conflito, ele é meu para resolver, não
deles.

**2. O E262 muda texto de tela que os manuais CITAM.** A régua
`varredura-manuais-textos` compara a citação do manual com o fonte da tela: se
o E262 tirar a aspa de uma frase que algum manual cita literalmente, a régua
fica vermelha — e quem conserta é **o manual**, que é do E263. Nenhum dos dois
enxerga o outro. **A régua que decide é minha, depois da integração**, e a
regra é a que a dona já deu na S-RM16: **a tela é a verdade, o manual a
segue.**

## O que cada épico tem permissão de NÃO fazer

**E263 — as 114 podem não caber todas.** O trabalho que a S-RM23 pede é de
**marcação**: envolver cada citação solta num `<span>` próprio dentro do
parágrafo, para que a declaração tenha onde morar. **88 das 114 já batem com a
tela** e entram sem declaração nenhuma; as 26 que não batem estão
classificadas (10 molde, 8 fala, 8 grifo). Se a marcação de alguma delas
deformar a leitura do manual — que é escrito para pessoas, não para a régua —,
**essa fica de fora com a razão escrita e o número dito**. O que não se aceita
é fechar sem dizer quantas entraram e quantas ficaram.

**E261 e E262 não têm essa permissão.** Os dois consertos são mecânicos e a
população está contada: oito telas e seis frases mais três rótulos.

## O contrato dos agentes

Vale tudo o que os três planos anteriores fixaram: divisão pelo recurso
compartilhado, ninguém toca tabela de Sobras nem `CLAUDE.md`, ninguém roda E2E
nem suíte inteira de API, e **a régua completa é do orquestrador** (regra 25).

**O primeiro gesto do worktree tem TRÊS linhas** (regra 29 com a emenda de
17/08): conferir a base contra o hash deste plano, `pnpm install
--frozen-lockfile`, e `pnpm run typecheck:libs` da raiz. Sem a terceira, o
`tsc` cospe `TS6305` e trinta erros que parecem do código recém-escrito.

**E o número de suíte que cada relatório publicar tem de ter sido medido onde é
afirmado** (regra 36) — e **nenhum dos três épicos do lote passado errou o
seu**, que é a primeira vez que isso acontece. A régua de cada agente é
`pnpm --filter @workspace/moscow-noivas test` (**1053 hoje, 117 arquivos**),
mais o typecheck do pacote; o E262 roda também, por arquivo, os testes de API
que tocam o que ele mexeu.

## O que fica no fim

**Este plano não promete um número de sobras abertas no fim**, e agora dá a
razão em vez de só a ressalva: o das 8 previu uma e ficaram sete; o das 7 não
prometeu e abriram oito. **Trabalho que constrói régua nova enxerga mais do que
fecha**, e os dois lotes anteriores confirmaram isso na mesma direção. O que
este plano promete é o que dá para prometer: **as oito com código fecham ou
dizem por que não, a S-M17 fica aberta pela razão já escrita, e o que nascer
entra na tabela com âncora e medida no mesmo commit** (regra 12).
