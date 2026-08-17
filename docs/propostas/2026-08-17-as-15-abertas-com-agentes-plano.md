# As 15 abertas, em quatro agentes — o plano do lote

**Escrito em 2026-08-17**, sobre `8cadc512` (E249 e E250 registrados).
Autorizado pela dona no mesmo dia: *"faça um plano para fechar as 15 abertas
com subagentes, e lance eles"*.

Fonte da verdade do que está aberto: a tabela **S-R** da conferência
([`2026-08-16-conferencia-do-contrato/EXECUCAO.md`](../revisao/2026-08-16-conferencia-do-contrato/EXECUCAO.md))
mais as duas linhas que moram fora dela. **Contadas em 17/08: 15 abertas —
0 🔴 · 4 🟠 · 9 🟡 · 2 🔵.**

## O que existe, e onde cada uma vai parar

| Épico | Sobras | Onde mexe |
|---|---|---|
| **E251** — as portas ao lado, segunda passada | S-R4 🟠, S-R8 🟠, S-R10 🟡, S-R11 🟡, S-R13 🟡, **S-RM1** 🟡 | `routes/contratos.ts`, `routes/reservas.ts`, `routes/financeiro.ts` (só `trilhaDosRecebimentos`), `lib/disponibilidade.ts` |
| **E252** — o envio à contabilidade é por ATO | S-R6 🟠 | `lib/db/schema/financeiro.ts`, `routes/financeiro.ts` (só `contabilidade/enviar`), 1 migração |
| **E253** — as telas apagam e mostram o que o banco tem | S-R7 🟠, S-R16 🟡, S-R17 🟡, S-R19 🔵 | `moscow-noivas/src/pages/**` |
| **E254** — a letra e a régua | S-R14 🟡, S-R15 🟡, S-R18 🔵 | `e2e/64-*.spec.ts`, `docs/manuais/noiva.html`, `lib/fila-de-atrasos-cache.ts` |
| **S-M17** 🟡 | — | **não fecha neste lote**, e a razão é escrita: ela espera o dump de uma instalação REAL, e a instalação real ainda não existe (respondido pela dona em 16/08). Fica aberta, declarada. |

Conta: 6 + 1 + 4 + 3 = **14 fechadas**, 1 declarada. 15.

**A S-RM1 vai para o E251 por CONFLITO, não por assunto.** O conserto dela —
passar a data nova do papel ao candidato antes de validar disponibilidade — não
precisa de tranca nenhuma; o que ele precisa é de não colidir com o E251 no
`PATCH /reservas`, que é o mesmo arquivo e quase a mesma região. Dois agentes
escrevendo ali seriam um conflito garantido.

## Por que QUATRO agentes, e por que não mais

A máquina tem **4 CPUs e ~4 GB livres**. A suíte de API inteira leva 11,6 min
sozinha; quatro delas ao mesmo tempo não terminariam — e o que reprovasse não
diria se reprovou por defeito ou por falta de CPU.

O contorno é a própria **regra 11**, que já manda o contrário do que a
intuição pede: *"durante o trabalho, mede-se o ARQUIVO tocado (6 s), não a
suíte (596 s)"*. Nenhum agente roda suíte inteira. Cada um roda os arquivos que
tocou, e **a régua completa é do orquestrador** (regra 25) — que é a lição do
lote de 13/08, quando três commits entraram no `main` com os relatórios
abrindo em *"E2E obrigatório e NÃO rodado"*.

## A divisão é pelo RECURSO COMPARTILHADO (regra 24)

Este repositório tem três recursos únicos, e o plano trata os três:

**1. O banco.** *"Worktree isola arquivo e NÃO isola banco"* — `workers: 1` no
playwright, `fileParallelism: false` no vitest, um só `DATABASE_URL`. Os dois
agentes que precisam de banco (E251 e E252) **criam o seu**, com a receita que
o `banco-virgem.ts` já pratica e que foi **executada antes de este plano ser
escrito** (regra 28 — receita não conferida é sobra nova):

```bash
B=e25X_$$ && createdb $B
U=$(node -e "const u=new URL(process.env.DATABASE_URL);u.pathname='/'+process.argv[1];console.log(u.toString())" $B)
cd lib/db && DATABASE_URL="$U" pnpm run push     # schema + extras
# ... e daí em diante, DATABASE_URL="$U" na frente de cada vitest
dropdb --if-exists $B                            # no fim, sempre
```

Medido em 17/08: um banco novo, `push`, e `e249-o-papel-segue-o-casamento`
passa **13/13** sem seed nenhum — as fixtures da API montam a própria loja.

**2. As tabelas de Sobras.** *"Toda linha fechada mexe no mesmo arquivo, então
agente nenhum as toca, e quem risca com o hash é quem orquestra."* Nenhum dos
quatro edita `EXECUCAO.md` de rastreador nenhum, nem o `CLAUDE.md`. Sobra vista
de passagem vai no relatório final do agente, **com âncora `arquivo:linha`**, e
eu a escrevo na tabela.

> **Errata de 17/08, achada pelo agente do E253 e conferida:** o prompt dele
> repetia, do `CLAUDE.md`, que *"o frontend reprova entre 00:00 e 03:00 UTC
> pela S-O119"*. **A S-O119 fechou no E198** e está riscada em
> `2026-08-11-otica-dos-papeis/EXECUCAO.md:246`. Medido: 1037 verdes às 01:57,
> 01:59 e 02:04 UTC. Um plano que carrega defeito morto ensina a atribuir ao
> fuso um vermelho verdadeiro — S-A5 com o custo invertido.

**3. As portas do E2E.** Nenhum agente roda E2E — worktree não isola porta, e
`e2e/.auth/admin.json` é uma sessão que só vale no servidor que a criou
(S-O93). O E2E é meu, no fecho do lote.

**E os arquivos.** O E251 e o E252 são os únicos que se cruzam, em
`routes/financeiro.ts`. A divisão é por REGIÃO e está no prompt dos dois: o
E251 mexe em `trilhaDosRecebimentos` (~`:851`) e o E252 em
`contabilidade/enviar` (~`:1690`). Quem encostar fora da sua região devolve o
achado como sobra em vez de consertar.

## O que cada agente tem de fazer, sem exceção

1. **Conferir a base** (regra 29): o worktree nasce em `origin/main`, que está
   **36 commits atrás**. Primeiro gesto: `git rev-parse HEAD` tem de dar
   `8cadc512`; se não der, `git reset --hard 8cadc512`.
2. **Conferir a sobra ANTES de consertar** (regras 20 e 23): reler a âncora,
   remedir o número. Das 48 sobras da conferência de 05/08, 4 estavam mortas e
   9 descreviam errado o mecanismo — e **nos dois épicos deste lote que já
   rodaram, a sobra errou o número nas duas direções** (o E249 subestimava por
   fator 4; o E250 apresentava como vivo o que estava armado). O relatório abre
   com as correções ao diagnóstico, antes do código.
3. **Vermelho ANTES, literal** (regra 34): quebrar de propósito o que o teste
   novo deveria proteger e colar a saída. Teste que passa nas duas versões do
   código não prega nada.
4. **Dinheiro traz exemplo numérico** (regra 2), e nenhum achado sem
   `arquivo:linha` que o agente leu (a régua que sustenta todas).
5. **Escrever o relatório** em `docs/revisao/2026-08-16-review-max/execucao/E2XX.md`,
   no formato da casa, terminando em *"o que isto ensinou sobre o diagnóstico"*
   (regra 9). O que não estiver no `git` não existe (regra 32).
6. **Um commit** com o épico inteiro, na branch do worktree. Assunto = a tese,
   não um rótulo.
7. **Não** rodar suíte inteira, **não** rodar E2E, **não** tocar tabela de
   Sobras nem `CLAUDE.md`, **não** publicar nada.

## O que o orquestrador faz depois (regra 25)

Um épico por vez, e a régua ANTES de declarar feito:

1. Integra o épico no `main`.
2. Roda **a suíte de API inteira** (~11,6 min) + **typecheck** — é ela que pega
   o efeito colateral em arquivo que ninguém abriu.
3. **Frontend** quando o épico toca tela; **banco virgem** quando toca migração
   ou schema (E252); **E2E completo** uma vez no fecho do lote, e obrigatório
   antes do commit que muda o que a trilha grava ou o que alguma tela lê
   (regra 11 — o E251 e o E253 mudam).
4. Risca as sobras na tabela da conferência com o hash, escreve as sobras
   novas que os agentes acharam, e move o ponteiro.

**Nada é dado por feito sem commit no `main` com a régua rodada.** Se um agente
voltar com o épico incompleto, o que ele fechou entra e o resto volta para a
tabela como sobra — não como promessa.
