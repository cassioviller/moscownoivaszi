# Plano de ação — subagentes contra as 51 sobras

> **Leia antes:** este plano foi escrito em `3211e74`, **antes** da conferência.
> A **fase 0 dele já rodou** (`475d49f`), são **48 sobras** e não 51, e a
> conferência corrigiu seis pontos das fases seguintes — a tabela está em
> `docs/revisao/2026-08-06-sessao-faixa-b.md`. As mais caras: a **S-D8 está
> morta** (some da família da régua), a **S13 encolheu** para meia dúzia de
> linhas em `App.tsx`, e a **S-D23 não tem régua interina** nenhuma. A higiene
> da abertura acrescentou uma regra: **enumere com `git ls-files`**, porque
> `find`/`grep -r` leem o disco e 65% do que o disco devolvia era cópia órfã.

**2026-08-05** · branch `sobras-de-higiene` · base `3211e74`

As três trilhas somam **51 sobras abertas** (rodada 6: 19 · rodada 7: 20 ·
arqueologia: 12), **nenhuma 🟠 nem 🔴**. O trabalho é largo e raso — muitas
linhas independentes, cada uma pequena. É a forma que mais se beneficia de
paralelismo, e a que mais se machuca se o paralelismo ignorar o que o repositório
compartilha.

## A restrição que decide tudo: o banco é um só

Medido, não suposto:

- `playwright.config.ts:28` → `workers: 1`
- `artifacts/api-server/vitest.config.ts` → `fileParallelism: false`, com o
  comentário que já dizia por quê: *"testes de integração compartilham o mesmo
  banco; execução serial evita interferência entre arquivos de teste"*
- não existe `DATABASE_URL` de teste: `helpers.ts` e `e2e/global-setup.ts` usam o
  banco de dev
- o `webServer` do playwright sobe na `WEB_PORT` — dois E2E simultâneos colidem
  na porta antes de colidirem no banco

**Worktree isola arquivo, não isola banco.** Dois agentes em worktrees separados
rodando a suíte da API ao mesmo tempo escrevem na MESMA tabela: o vermelho que
sai daí não é regressão, é interferência — e vai custar a investigação inteira,
como custou no E107 com a S20.

Daí a regra que estrutura o plano: **o trabalho se divide pelo que precisa do
banco, não pelo assunto.**

| Faixa | O que cabe | Paralelismo | Verificação |
|---|---|---|---|
| **A — leitura** | conferir sobra, medir, varrer, ler foto | **livre** (6–8) | nenhuma; devolve achado com `arquivo:linha` |
| **B — código sem banco** | `moscow-noivas/`, docs, poda, `ui/` | **3–4**, worktree por agente | `tsc --noEmit` + `vitest run` do front (11s, sem banco) |
| **C — código com banco** | `api-server/`, migração, fixture, E2E | **fila de UM** | suíte da API + E2E completo, no worktree principal |

## O que os agentes NUNCA fazem

1. **Não commitam.** Devolvem diff e relatório; o commit é do orquestrador.
2. **Não tocam nos `EXECUCAO.md`.** As três tabelas de sobras são o ponto de
   contenção do repositório: toda linha fechada mexe no mesmo arquivo, e quatro
   agentes editando a mesma tabela produzem conflito garantido. **Quem escreve a
   linha riscada, com o hash, é o orquestrador** — e é o que mantém as regras 12
   e 21 honestas, porque só ele conhece o hash.
3. **Não rodam E2E nem a suíte da API** fora da faixa C.

## O contrato de prompt (vale para todo agente)

Sem isto o retorno não serve para commit neste repositório:

- **Nenhum achado sem `arquivo:linha` que você leu**, e nenhum achado de dinheiro
  sem exemplo numérico. Sem âncora, é impressão.
- **O número medido vai junto da frase.** Não "melhorou"; *"a tela pedia 3.400
  linhas para desenhar 20"*.
- **Português, frase afirmativa.**
- **Diga o que o diagnóstico da sobra errou.** É a parte mais útil do retorno: a
  sobra foi escrita há semanas e o código andou.
- **Escopo fechado.** O que aparecer fora vira sobra nova descrita, não conserto.

## Fase 0 — a sonda de sobra morta (faixa A, 6 agentes, ~1 rodada)

**É o maior retorno do conjunto, e há número para isso:** das oito 🟠 que a
rodada 6 apresentava como perigo, **três já não existiam** — 37% do backlog mais
pesado do repositório era defeito morto, e a próxima sessão teria ido
investigá-lo. E ontem, conferir duas linhas suspeitas deu **dois resultados
opostos**: a S-D28 estava morta, a S18 estava 2,7× pior.

Cada agente recebe 8–9 sobras e responde por linha, **sem consertar nada**:
morta / viva / viva e pior, com a âncora e o número de hoje.

Prioridade de lote (as mais prováveis de terem envelhecido):

- **Lote 1 — as que citam número de banco:** S27, S31, S-D26, S-A12, S25/S-D22,
  S-D25 (as duas últimas já remedidas hoje, servem de calibragem)
- **Lote 2 — as de régua de erro:** S34, S-D8, S-D20, S-D21 — o E145 varreu os
  404 depois de várias delas serem escritas
- **Lote 3 — as de poda e código morto:** S-D3, S-D6, S23, S29, S-A9, S33
- **Lote 4 — as de duplicação:** S8, S30, S35, S37
- **Lote 5 — as de tela:** S10, S13, S-D9, S-D10, S-D13, S-D18, S-A10, S-A17
- **Lote 6 — as de dado/negócio:** S16, S-A14, S-A16, S-A18, S-A24, S21, S24

O que sai daqui: um **mapa de veredito** que encurta o backlog antes de qualquer
conserto, e as linhas riscadas por decisão (regra 21).

## Fase 1 — a faixa B em paralelo (3–4 agentes, worktree cada)

Só o que não encosta no banco. Cada agente entrega diff + relatório no formato
`execucao/E9X.md`, com a **verificação citando o vermelho ANTES, literal**.

- **Agente B1 — poda:** S-D3, S-D6, S23 (as 4 cópias divergentes do
  `mockup-sandbox`), S29. Um só agente porque são o mesmo gesto e tocam os mesmos
  diretórios — separá-los é fabricar conflito.
- **Agente B2 — tela sem servidor:** S-D9 (vazio de Permissões), S-D10 (o cartão
  que salta), S-D18 (`SelectTrigger` a 36px).
- **Agente B3 — S13**, sozinho: `useBlocker` exige trocar `<BrowserRouter>` por
  data router e toca TODAS as rotas. É o único da faixa B que merece worktree
  próprio pelo risco, não pelo volume.
- **Agente B4 — infra de tipo:** S-D23 (dar `tsconfig` ao `e2e/`), S-D7 (a fresta
  de formatação das varreduras por linha).

## Fase 2 — a fila do banco (serial, um de cada vez)

Aqui não há paralelismo a ganhar. O ganho é **ordem**, e a ordem é por risco:

1. **S-D27** — `e2e/global-setup.ts:75` elege a loja MAIS ANTIGA para os 156
   specs. É a única sobra do repositório que falha **sem vermelho**: no dia em
   que a loja de 2026-07-06 sumir, a suíte troca de alvo sozinha. Vai primeiro
   porque toda a fase 2 roda E2E, e é ela que diz contra o que.
2. **S-D22 / S25** — o `afterAll` do spec 48. Para o único passivo que ainda
   dobra: 63 → **121 avarias** em dez dias.
3. **S-D25** — a limpeza única das 186 cabines, com guarda própria.
4. **S31** — o cascade de `lead_interesse_atributos` (foi o que abortou o script
   da S-A13).
5. **S16** — o carimbo `contrato_fechado_em`, com backfill pela tabela de
   contratos. É o único achado aberto que faz um **relatório mentir**.
6. **S27** — responder se a ROTA permite `RESERVA_CASAMENTO` sem noiva; a
   resposta muda a classe do achado.
7. **A família da régua de erro** — S34, S-D8, S-D20, S-D21 num épico só,
   estendendo a varredura do E145 a 4xx.

Cada item da fila: **um commit de código + um `docs(...)` com o hash**, e o E2E
completo antes do commit sempre que mexer no que a trilha grava (regra 11).

## Fase 3 — o orquestrador fecha

Por item entregue: ler o relatório, aplicar o diff, rodar a régua, commitar, e
**riscar a linha na tabela com o hash**. As sobras novas que os agentes
descreverem entram na tabela no mesmo commit (regra 12).

## O que este plano NÃO resolve

- **As sobras que não são de código** (S-A1, S-A2, S-A3) — a S-A2 depende de
  fotos que ninguém tirou, e nenhum agente as tira.
- **As decisões** (S-A24 "domingo com hora marcada", S-A16 a lavagem no estoque,
  S-D4 `vendedoraId` do corpo) — são perguntas para a dona do ateliê, e sobra
  fechada por decisão se risca com a resposta escrita, não com código.
- **A fila do banco não encolhe.** Sete itens seriais são sete itens seriais;
  subagente nenhum torna o E2E de 6,3 min paralelo.

## Higiene antes de começar

`git worktree list` mostra **três worktrees `prunable`** (dois de agentes de
épicos já fundidos, um de scratchpad). Podar antes, ou o primeiro agente da fase
1 herda lixo.
