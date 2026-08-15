# 2026-08-15 — a fila do que restava: E223 → E219, e o lote paralelo dos blocos 5–8

A sessão pegou **tudo o que a trilha do contrato tinha de código executável** e
executou: os dois épicos que restavam (o E223, que precisava nascer, e o E219,
que esperava por ele desde 13/08), a S-C234 em série, e **vinte sobras azuis em
paralelo** — quatro agentes, um por bloco da
[proposta de recomendações](../propostas/2026-08-14-recomendacoes-para-o-que-restou.md),
cada um em worktree e banco próprios, integrados por cherry-pick em série.

**O que sobrou aberto na trilha não é código desta fila**: o E220 (travado em
D4/D7), a S-C51 (modelagem, com a contadora) e 21 🔵. A S-C270 🟡 — os
manuais atrás da onda, pregada na varredura que nasceu no mesmo lote — abriu
e **fechou no mesmo dia**: os cinco manuais foram reescritos contra a onda
inteira na sequência da integração ([relatório](2026-08-13-contrato-de-papel/execucao/S-C270.md)),
com a régua de contradição cobrando cada baixa. Conte na tabela do
`EXECUCAO.md`.

## Os commits

| O quê | Hash |
|---|---|
| E223 — a porta de trocar peça | `7455bc39` |
| E219 — a guarda da 17ª | `c0071940` |
| S-C234 — a prova não varre o passado | `920fb4b1` |
| Bloco 5 (S-C160–163) | `a43f4bd8` |
| Bloco 6 (S-C56, 75/76/78/79/182 · S-C181) | `f0e77faa` · `eb217cbb` |
| Bloco 7 (S-C213 · S-C102 · S-C222) | `5832144d` · `2f7077e7` · `cdaf73b7` |
| Bloco 8 (S-C21 · S-C232 ×2+1 · S-C77 · S-C221 · S-C89 · S-C87) | `5c320e84` · `bc95cd43`/`476171a4`/`4eb260bb` · `6312cc3e` · `a800129c` · `c0d6bfb4` · `7adfb95b` |

Régua no fecho da integração: **API 1726 (242 arquivos) · frontend 974 (104)
· typecheck verde nos 5 projetos · E2E completo no fecho de cada lote** (o
primeiro: 177 em 6,9 min; o segundo está na última seção).

## O que o paralelo ensinou desta vez — quatro lições, três de ferramenta

1. **O worktree do harness nasceu 48 commits atrás da base, nos QUATRO.**
   Todos nasceram em `cbcd8b30` — nem o `origin/main` (regra 29), nem a ponta
   local: um hash de dias atrás. A regra do lote de 14/08 ("o primeiro gesto é
   conferir a própria base") estava no prompt, **e os quatro conferiram e se
   reposicionaram** antes de medir qualquer coisa. É a primeira vez que a
   lição roda como PROCEDIMENTO em vez de tropeço.
2. **Agente que "espera notificação" para o turno — e o integrador precisa
   mandar esperar NO Bash.** Três dos quatro dispararam a própria suíte em
   background e encerraram o turno "aguardando a notificação"; o turno
   encerrado não acorda sozinho para quem orquestra. O conserto é de prompt:
   espera de agente é `until grep -q "Test Files" <log>; do sleep 15; done`
   no próprio Bash, e o turno só termina com a resposta final escrita.
3. **Zero conflitos de cherry-pick em CÓDIGO, um conflito no RELATÓRIO — do
   bloco 8 consigo mesmo.** Os arquivos foram cruzados antes de disparar (a
   lição da Faixa C), e a única colisão foi o `S-C21-bloco8.md`, que cada um
   dos 7 commits do agente D reescrevia incrementalmente. Resolução mecânica:
   tomar sempre o incoming; a última versão é a inteira.
4. **O agente que esbarra em área alheia PARA e declara — e funcionou.** O D
   deixou a metade da tela da S-C232 escrita no relatório (3 linhas, o arquivo
   era do lote do A); o integrador aplicou depois dos picks (`4eb260bb`).
   Custo do respeito à fronteira: um commit pequeno a mais. Custo de não
   respeitar: o cherry-pick que não entra.

## As correções que os agentes fizeram ao plano — de novo, todas de medição

- **S-C162 fechou SEM código**: as duas frases liam lista já guardada por
  `isError` — o enunciado supunha o mesmo caminho da S-C160 e não era. E a
  família tinha um **quinto sítio** que sobra nenhuma citava
  (`conversao.tsx:246`), consertado no mesmo commit.
- **"14 varreduras" eram 16 — mais 10 de uma grafia que o glob nunca contou**
  (`*-varredura.test.ts`, → S-C260). E a população das portas era **315, não
  304**: onze arquivos entraram em dois dias sob um piso verde — a S-C79
  acontecendo ao vivo na própria régua que a fecha.
- **O `null` da S-C232 não era recusado — era CONVERTIDO em 01/01/1970** pelo
  `zod.coerce.date()`, e recusado por acidente pelo expediente da 4ª. A classe
  sobrevive fora dela (916 `coerce.date()` no gerado, → S-C281).
- **A invalidação sugerida para o cache da fila errava 2 de 3 gestos**
  (receber não muda a fila; perdoar é da carteira da 9ª) — as 10 portas reais
  estão enumeradas no próprio cache.
- **A S-C221 citava a Costureira, e a Recepção passava pela mesma porta** — o
  fecho pela PERMISSÃO pegou as duas.

## O serial no meio do paralelo

A S-C234 coube entre o disparo e a integração porque **nenhum agente tocava o
motor de conflito** — e a medição achou a mesma classe na SUGESTÃO
(`proximaDataLivre` propunha `hoje+14` com `hoje+3` livre). De brinde, a
pegadinha da virada UTC×SP depois das 21h ficou escrita no teste: a cena
"relativa a agora" se monta sobre `hojeLocal()`, nunca sobre `Date.now()` cru.

## E2E do fecho (lote 2)

Medido em série, no banco de dev, depois da integração completa: **177 passed
em 6,6 min, zero skipped** — a mesma contagem do lote 1 (as cenas novas da 17ª
já tinham entrado lá). A régua completa da sessão, medida nesta ordem:

**API 1726 (242 arquivos) · frontend 974 (104 arquivos) · E2E 177 · typecheck
verde nos 5 projetos.** E a higiene fechada: os quatro worktrees do lote
podados **depois** da conferência de `patch-id` contra o `main`, branches
apagados, e o banco órfão `moscow_wt_e226` (de uma sessão anterior) dropado —
`psql -l` termina com zero `moscow_wt_*`.
