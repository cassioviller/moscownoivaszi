# Moscow Noivas — como se trabalha neste repositório

Sistema interno de um ateliê de noivas. O **que** o sistema é, como rodar e os
invariantes que já valem estão em **`replit.md`** — leia antes de mexer em
código.

Este arquivo é sobre o **como**. Ele é curto de propósito; cada seção aponta
para o documento que manda.

## Leia no começo da sessão

1. **`docs/revisao/METODO.md`** — como este sistema é revisado, criticado e
   ampliado. As **regras acumuladas** no fim do arquivo valem para o trabalho de
   hoje, e a seção de crítica diz por que cada uma existe, com a evidência que a
   motivou. Não é história: é o contrato.

2. **O estado de hoje (2026-08-16, madrugada).** Não há trilha em curso com
   fila de código: **toda linha de código aberta em rastreador nenhum é
   ZERO.** O que existe está nas tabelas de Sobras — **conte, não deduza**; a
   linha aberta é a que NÃO está riscada:

   | Trilha | Rastreador | Estado |
   |---|---|---|
   | Ótica dos papéis | `2026-08-11-otica-dos-papeis/` | EXECUTADA — E158–E197, E210, E238–E240 e as sobras S-O até a S-O146; **ZERO sobras abertas** (contadas em 16/08) |
   | O contrato de papel vira regra | `2026-08-13-contrato-de-papel/` | EXECUTADA — E211–E237 e as sobras S-C; **ZERO sobras abertas**; P1–P3 decididas em 16/08 (jurídico e gesto da instalação, fora do sistema); a P4 virou o IPCA em E237, a P5 foi confirmada — **nada aberto** |
   | Revisão max | `2026-08-10-revisao-max/` | fechada — resta **S-M17** 🟡, que espera um dump de instalação real (**a instalação real ainda não existe** — respondido em 16/08) |
   | Arqueologia do legado | `2026-08-04-arqueologia-legado/` | fechada — **ZERO sobras abertas** (a S-A2 fechou por decisão em 16/08: não há mais fotos, as 136 saídas ficam como piso); a S-A27 foi classificada em 16/08 (126 Noiva · 5 Acessório · 1 pendente, L084) |
   | Rodadas 6 e 7 | `2026-07-25-rodada-6/`, `2026-07-30-rodada-7-design/` | fechadas, ZERO sobras |

   **O que aconteceu por último**, e onde está contado: a noite de 15/08 e a
   madrugada de 16/08 fecharam as 27 🔵 da ótica (E238–E240, três agentes em
   paralelo), a fila das sobras que elas fizeram nascer
   ([`2026-08-15-as-sobras-do-lote-das-27-plano.md`](docs/propostas/2026-08-15-as-sobras-do-lote-das-27-plano.md):
   S-O120 → S-O140/143 → S-O121 → higiene → S-O130 → S-O93 medida → S-O131),
   e três achados no caminho: **S-O144** (o E2E escolhia a loja por NOME e há
   duas "Moscow Noivas" desde o seed real — o `auth.setup` e o spec 02 passaram
   a escolher pela CHAVE), **S-O145** (o spec 16 só passava porque o dev tem
   atraso) e **S-O146** 🟠 (a edição de atributo caía ao abrir, no `main`, e
   nenhum E2E a abria). A narrativa completa de como cada trilha chegou aqui —
   E211 a E240, as ondas, os lotes paralelos, as lições de medição — está
   preservada, palavra por palavra, em
   [`docs/revisao/2026-08-16-ponteiro-historico.md`](docs/revisao/2026-08-16-ponteiro-historico.md);
   as lições que viraram regra estão no `METODO.md`.

   **A conferência do código novo está FEITA e abriu a fila seguinte** (16/08):
   sete lentes de leitura pura sobre o que entrou desde `cd990767` (a véspera
   do E211) — ~10,4 mil linhas em 127 arquivos — deram **0 🔴 · 7 🟠 · 17 🟡 ·
   ~30 🔵**, consolidados em
   [`2026-08-16-conferencia-do-contrato/G-consolidado.md`](docs/revisao/2026-08-16-conferencia-do-contrato/G-consolidado.md)
   e ordenados em **E241–E248** (dinheiro primeiro: a rescisão que devolve
   DUAS vezes sob "estornar", o seed que inventa IPCA e a 9ª cobra, a mora que
   é "de hoje" contra o fato datado; depois a 16ª que cobra pela janela e o
   papel diz outra data — decisão da dona; a porta ao lado; o E2E com data
   marcada para reprovar em 15/10/2026; as réguas de letra; os manuais). A
   tabela do consolidado é a fila; **conte, não deduza.** O rastreador da
   fila é [`2026-08-16-conferencia-do-contrato/EXECUCAO.md`](docs/revisao/2026-08-16-conferencia-do-contrato/EXECUCAO.md)
   e o plano é [`2026-08-16-conferencia-do-contrato-plano.md`](docs/propostas/2026-08-16-conferencia-do-contrato-plano.md).
   **A FILA E241–E248 ESTÁ INTEIRA EXECUTADA** (16/08, tarde e noite:
   `e9231ce1`, `3029efba`, `c4e152b1`, `d880b43a`, `a736229f`, `f373a65e`,
   `fb00bd96`, `5096469b` — 7 🟠 e 17 🟡 fechados, ZERO abertos; as três
   decisões executadas na recomendação — o IPCA de exemplo só na instalação de
   teste, a 16ª pelo papel, a conta a pagar que não nasce sob "estornar" —
   estão na tabela de Decisões do rastreador para a dona confirmar). O lote de
   higiene 🔵 também fechou (`484f429b`, 13 de 17). **Na noite de 16/08 a dona
   respondeu às perguntas que restavam**: as três decisões (E241, E242, E244)
   CONFIRMADAS na recomendação; a S-CF3 fechada por decisão (as réguas ficam
   grossas de propósito); a S-CF2 fechada com o `e2e/65` (`206d3e51`, E2E 187);
   a S-A2 fechada por decisão (não há mais fotos — as 136 saídas ficam como
   piso); P1–P3 decididas (jurídico/gesto da instalação, fora do sistema); a
   S-M17 fica aberta porque **a instalação real ainda não existe**. 

   **E então a dona rodou um `/code-review max` do app inteiro, e ele abriu a
   fila seguinte.** Dez ângulos sobre `fb3dcb50`, **19 achados**, conferidos um
   a um antes de entrar na tabela (nenhum descartado): o primeiro era que **a
   suíte de API estava VERMELHA no `main`** — o `e2e/65` só entrou nas
   varreduras que enumeram por `git ls-files` depois do `git add`, e este
   ponteiro publicava "API 1865 verde" (consertado em `3c71d474`; virou a
   **regra 35** do METODO). Os outros **18 entraram ABERTOS** na tabela de
   Sobras da conferência como **S-R2…S-R19 — 1 🔴 · 7 🟠 · 8 🟡 · 2 🔵**, e
   **sete nasceram da fila daquele dia** (E242, E244, E245, higiene, E248).

   **Essa é a fila em curso, e ela já começou a andar.** O plano é
   [`2026-08-16-a-fila-do-review-max-plano.md`](docs/propostas/2026-08-16-a-fila-do-review-max-plano.md)
   — as 18 em **seis épicos, E249 a E254**, dinheiro primeiro — e o rastreador
   é [`2026-08-16-review-max/EXECUCAO.md`](docs/revisao/2026-08-16-review-max/EXECUCAO.md).
   **A fonte da verdade do que continua aberto é a tabela S-R da conferência**,
   que é onde cada linha é riscada com o hash. **Conte, não deduza.**

   **O E249 está FEITO** (`458adf11`): o 🔴 saiu da fila. Casamento adiado
   passa a mover as duas datas que o papel imprime, recalculando pela janela
   nova (E224) e preservando a hora; `disponibilidade.ts` — o QUARTO sítio da
   16ª, que o E244 não converteu — passa a ler `fimPrevistoDaDevolucao` pelo
   SELECT que já existia; e o `PATCH /contratos`, única porta que EDITA a data
   do papel, derruba a fila de atrasos. **O número da sobra estava errado para
   MENOS**: o caput da 16ª multiplica POR PEÇA, e o vermelho medido foi
   `expected 48000 to be +0` — R$ 12.000,00 é o dano de UMA peça. O E249 abriu
   a **S-RM1** 🟡 (a data do papel agora estica a janela física e ninguém
   revalida os dias que ela estica).

   **Contado em 17/08: o repositório tem 17 sobras abertas — 0 🔴 · 6 🟠 ·
   9 🟡 · 2 🔵.** São as 15 S-R que restam, mais a **S-M17** (que espera a
   instalação real) e a **S-RM1**. A fila de hoje é o **E250** (o índice de
   exemplo e o backfill que cruza lojas), depois E251, E252, E253, E254.

   A régua do E241 achou a suíte de API vermelha no `main` desde `ec53e2d6`
   (consertada em `c8dda201`). Também: as duas
   últimas sobras da ótica fecharam (S-O131 "ganha tela" e a S-O146 🟠 que ela
   achou — a edição de atributo caía ao abrir), a S-A27 foi classificada e o
   `heliumdb` perdeu 725 contas e 451 pagamentos fantasmas de E2E.

3. **A régua e a publicação.** Hoje a régua é **API 1878 (268 arquivos) ·
   frontend 1017 (108 arquivos) · E2E 187 · typecheck verde em 5 projetos** —
   as quatro medidas em série no fecho do E249 (17/08). A API inteira leva ~11,6 min no
   `heliumdb`; o E2E, ~6,5 min, e é a régua que **agente nenhum pode rodar**
   (worktree isola arquivo e banco e NÃO isola porta — e dois E2E ao mesmo
   tempo precisam de banco, portas **e checkout** próprios, medido na S-O93:
   o `e2e/.auth/admin.json` é uma sessão que só vale no servidor que a criou).
   O frontend reprova entre 00:00 e 03:00 UTC pela S-O119 — confira a hora
   antes de procurar defeito. `scripts/banco-virgem.ts` é a quarta régua
   (instalação nova, ~1 min): rode-a antes de mexer em seed, schema ou
   `global-setup`.

   **O `main` está 33+ commits À FRENTE de `origin/main`** (= `017a28d4`, 16/08
   de manhã; a conferência, a fila do review max e os docs não estão
   publicados). Confira com
   `git rev-list --count origin/main..main` antes de assumir — esta linha
   envelhece a cada commit. Todo worktree de agente nasce em `origin/main`
   (regra 29), e o primeiro gesto de todo agente é conferir a própria base.

   **E o banco de `DATABASE_URL` é o `heliumdb`, não o `moscow_base`** — os
   dois existem e não contam a mesma história (`moscow_base` é a loja: 132
   peças do legado, 0 contratos). `SELECT current_database()` antes de escrever
   o nome do banco num relatório.

Se a trilha mudar, é aqui que o ponteiro muda. **Foi a S-A5 da arqueologia que
mandou este ponteiro estar certo** — ele passou uma rodada inteira apontando
para a anterior, e quem abrisse a sessão leria o estado errado como se fosse o
de hoje. E foi a compactação de 16/08 que o fez caber numa tela: 610 linhas de
narrativa viraram história em arquivo próprio, e o que fica aqui é o que se
precisa saber para começar.


## As regras que mais mordem no dia a dia

Estão todas no METODO, com a prova. Estas quatro são as que se esquece:

- **Nada é dado por feito sem commit.** Se o rastreador diz ✅ e não há hash, o
  trabalho não sobreviveu — refaça.
- **Um épico por commit**, escopo fechado. O que aparecer fora do escopo vira
  **sobra**, não conserto.
- **Sobra vista de passagem entra na tabela de Sobras do rastreador no mesmo
  commit** (regra 12). A nota do épico é onde o raciocínio mora; o rastreador é
  onde o trabalho é reclamado. Achado que fica só na nota de um épico fechado
  não vira trabalho — foi assim que um 🔴 quase se perdeu.
- **Mudou o que a trilha grava, ou o formato do que alguma tela lê, roda o E2E
  completo antes do commit** (regra 11). Verde em unidade + API + typecheck é o
  piso, não a régua.

E a que sustenta todas: **nenhum achado sem `arquivo:linha` que você leu, e
nenhum achado de dinheiro sem exemplo numérico.** Sem âncora, é impressão.

## Onde cada coisa é anotada

O ID do épico (`E94`) é a chave que costura tudo — ele aparece igual em todas as
camadas, e é assim que se navega de uma para a outra.

| Camada | Onde | O que responde |
|---|---|---|
| Método | `docs/revisao/METODO.md` | Como olhamos, e onde a lente falhou |
| Diagnóstico | `docs/revisao/<data>-rodada-N/A–F` | O que está errado, com âncora e número |
| Consolidação | `.../G-consolidado.md` | O que é o MESMO problema; onde foi parar cada achado |
| Plano | `docs/propostas/<data>-rodada-N-*.md` | O que fazer, em que ordem, com que cuidado |
| Execução | `.../EXECUCAO.md` + `.../execucao/E9X.md` | O que foi feito, e o que o plano errou |
| Migração | `docs/migracoes/<data>-e9X-*.sql` | O DDL que um banco existente precisa |
| Capacidade | `replit.md` | O que passou a ser verdade do sistema |

**Descoberta sobre como RODAR ou OBSERVAR o sistema vai para o `replit.md`**
(regra 8), não para o relatório da trilha. Relatório é achado; `replit.md` é
capacidade.

## O formato do relatório de execução (`execucao/E9X.md`)

O que a rodada 6 convergiu, do E91 ao E94:

```
# E9X — <a tese do épico, em frase>
**Rodada N, sessão M** · branch `...` · base `<hash>` (épico anterior)
Fecha: <achados com severidade>
Suíte: API 616 → 625 · frontend 208 → 213 · E2E 131 · typecheck verde

## <as correções ao diagnóstico, ANTES do código>   ← abre o arquivo
## <uma seção por achado, não por arquivo>
## Verificação          ← cada conserto citado VERMELHO ANTES, literal
## Visto de passagem    ← e cada item também vai para a tabela de Sobras
```

Duas coisas fazem esse arquivo valer mais que o diff, e as duas são
contraintuitivas: **o que o plano errou** e **o que você errou**. O E94 registra
um assert que o executor escreveu errado enquanto o código estava certo — é a
página mais útil do arquivo.

## Commits

Um épico, um commit de código, e em seguida um
`docs(rodada-N): registra o hash do E9X no rastreador`.

O assunto é a **tese** do épico, não um rótulo:
`fix(financeiro): E94 — todo movimento de dinheiro deixa rastro, e a régua é uma só`.

O corpo tem um parágrafo por achado fechado, dizendo o defeito, o conserto e o
número medido — e termina na contagem das três suítes.

## Voz

A documentação deste repo é escrita em **português, em frases afirmativas, com
o número medido junto**. Não "pode divergir": *1,77% dos planos divergem — R$
1.282,00 em 10x sai como 128,19 ×9 + 128,29*. Não "melhorou a performance": *a
tela pedia 3.400 linhas para desenhar 20*. Mantenha o tom — ele é o que faz
esses arquivos serem lidos depois.
