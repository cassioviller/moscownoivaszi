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
2. **O registro da última sessão** —
   `docs/revisao/2026-08-06-sessao-faixa-b.md`, fechado na madrugada de
   2026-08-07. A seção **"Como retomar"** é o roteiro, e a primeira coisa que
   ela diz é a que mais muda o dia: **não há plano em aberto** — o plano das
   cinco fases foi executado inteiro, e quem abre a próxima sessão **escolhe
   trabalho, não herda fila**.

   O registro traz também o que a execução ensinou e virou regra (28–31 do
   METODO), e a régua de varredura que continua valendo: **enumere com
   `git ls-files`, não com `find`/`grep -r`** — 65% do que o disco devolvia era
   cópia de worktree órfão, e desde `c98341e` as **16 varreduras** do
   repositório enumeram pelo versionamento, com piso de população.

   **Não há trilha nem plano em curso: o que resta é o BACKLOG DE SOBRAS das
   três.** Os épicos das três estão fechados, e as tabelas de Sobras continuam
   sendo a fonte da verdade de cada rastreador. **Conte-as, não deduza** — a
   linha aberta é a que NÃO está riscada, e o fecho de 2026-08-07 achou sete
   fechadas sem risco justamente por contar:

   | Trilha | Rastreador | Estado |
   |---|---|---|
   | Rodada 6 | `2026-07-25-rodada-6/` | fechada — 6 sobras abertas (3 🟡 · 3 🔵). Era o backlog mais pesado do repositório |
   | Rodada 7 (design) | `2026-07-30-rodada-7-design/` | fechada — 2 sobras abertas (0 🟡 · 2 🔵): S-D36, S-D48 |
   | Arqueologia do legado (29 fotos do papel) | `2026-08-04-arqueologia-legado/` | fechada em 2026-08-05 — 10 épicos, 6 sobras abertas (6 🟡 · 0 🔵) |

   **São 14 sobras abertas e nenhuma 🟠** — contadas nas três tabelas em
   2026-08-07, depois de seis fechos no mesmo dia: S40 (`475b991`, que pariu
   S42 e S43), S42 (`05cf366`), S-D44 (`c092e71`, que pariu a S-D48), S-D47
   (`015a0db`), S-D45 (`a38f994`) e S-D46 (`fda7cf2`) — e **o plano das cinco fases está EXECUTADO de
   ponta a ponta**: fase 0 e 1 no dia 06 (`49c5cdb`), fase 2 em seis épicos
   seriais (`60adc7c` → `f72628c`), fase 3 em quatro agentes de faixa B
   aplicados em série (B3 `cbe79f6`, B4 `cc9720f`, B1 `c98341e`, B2
   `f4cb527`), fase 4 nos sete épicos (S32 `f901275`, S33 `24e9054`, S35
   `cafe56c`, S10+S-A17 `8b9c574`, S30+S21 `d8ef73f`). Das 14 que restam,
   **11 são as perguntas da folha** (`2026-08-06-folha-de-perguntas.md`,
   esperando gente) e **3 são achados medidos no nascimento** (S41, S43, S-D48) — não há linha na
   tabela que não seja pergunta ou achado recém-medido. **O que destrava mais
   é uma conversa, não código:** `docs/propostas/2026-08-06-folha-de-perguntas.md`
   traz as onze, com o número medido e o que muda com cada resposta possível.

   A frase abaixo é a da conferência, e continua valendo pelo mesmo motivo: a
   **conferência de 2026-08-05** (`docs/revisao/2026-08-05-conferencia-de-sobras.md`)
   passou sete agentes de leitura pura sobre 48 linhas e achou três defeitos que
   quatro rodadas de revisão não tinham achado — os três na fronteira entre dois
   arquivos, que é o que a regra 22 diz não se pegar lendo nenhum dos dois. **As
   três fecharam no mesmo dia:** S37 (`85d5108`), S-D29 (`042d1b5`) e S-A25
   (`2912526`). Antes da conferência a tabela também dizia zero 🟠 — a diferença
   é que agora é verdade.

   **Tudo isso está no `main`, e o `main` está PUBLICADO.** Em 2026-08-07 o
   `origin/main` foi de `fe47ed5` para `d9c9f12` — **322 commits**,
   fast-forward puro, com autorização da dona do repositório. Antes disso o
   remoto estava parado na rodada 5, e isso tinha um custo que ninguém tinha
   ligado ao remoto: **todo worktree de agente nascia em `origin/main`**, 322
   commits atrás, e cada agente gastava o primeiro gesto se reposicionando
   (regra 29). Confira com `git rev-list --count origin/main..main` antes de
   assumir que ainda está em dia — esta linha envelhece a cada commit, e já
   envelheceu três vezes.

   Hoje a régua é **API 1086 · frontend 530 · E2E 161 · typecheck verde em 5
   projetos — o typecheck passou a incluir os 63 arquivos de `e2e/`** (S-D23,
   `acdd9b3`) **e o `scripts/`** (`60adc7c`), que nenhum `tsconfig` cobria. Há
   uma **quarta régua fora das suítes**: `scripts/banco-virgem.ts` (S-D43), que
   exercita o caminho da primeira execução — banco descartável, seed,
   `global-setup` — e é a única que enxerga defeito de instalação nova. **Rode-a
   antes de mexer em seed, schema ou `global-setup`**; leva ~40 s.

Se a trilha mudar, é aqui que o ponteiro muda. **Foi a S-A5 da arqueologia que
mandou este ponteiro estar certo** — ele passou uma rodada inteira apontando
para a anterior, e quem abrisse a sessão leria o estado errado como se fosse o
de hoje.

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
