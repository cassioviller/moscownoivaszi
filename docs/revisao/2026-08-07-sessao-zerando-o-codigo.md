# Sessão de 2026-08-07 — o dia em que o backlog de código zerou

**Branch `main`** · base `2fe18f2` (o fecho da véspera) · **17 commits**, publicados
em cinco pushes com autorização da dona do repositório (`git push` conferido:
`origin/main` = `main` no fim).

Régua na abertura: API 1082 · frontend 529 · E2E 161 · typecheck verde em 4
projetos. Régua no fim: **API 1086 · frontend 530 · E2E 164 · typecheck verde
em 5 projetos** — o `lib/api-spec` entrou (S-D44), e o E2E ganhou o spec da
ficha da costureira.

A sessão abriu sem plano herdado — como o fecho da véspera prometia — e
escolheu trabalho: **as sete sobras de código do backlog, uma a uma, mais a
dívida de spec anotada no "Como retomar"**. No fim não resta linha de código
pronto em nenhum dos três rastreadores: **as 13 sobras abertas são TODAS
perguntas da folha** (`docs/propostas/2026-08-06-folha-de-perguntas.md`, agora
com 13 — as 11 originais mais S43 e S-D48, que nasceram hoje já medidas e
viraram as perguntas 12 e 13).

## Os oito fechos, na ordem

| # | Hash | O quê |
|---|---|---|
| 1 | `475b991` | **S40** — `pagar.tsx` tinha SEIS pontos de oferta sem gate (a sobra dizia dois); a tela espelha o guard do servidor, e a varredura S36 ganhou o caso que a deixava cega: tela sem gate nenhum era "outra conversa" |
| 2 | `05cf366` | **S42** — `conciliacao.tsx`, a última tela de financeiro que escrevia sem gate; a `DIVIDA_ANOTADA` da régua esvaziou |
| 3 | `c092e71` | **S-D44** — `lib/api-spec` entrou no typecheck e a régua nova casa os 11 pacotes com quem o typecheck alcança; no primeiro giro o tsc achou o `prettier: true` morto (virou S-D48) |
| 4 | `015a0db` | **S-D47** — o quarto primitivo com `h-9` cru ganhou o piso dos 44px, altura E largura; `BreadcrumbEllipsis` morreu por medição (não é alvo) |
| 5 | `a38f994` | **S-D45** — o spec 41 apaga o que cria; a faxina levou 300+300 (eram 274 na sobra — +2 por passada, treze vezes num dia) |
| 6 | `fda7cf2` | **S-D46** — 26 lojas zumbis + 44 perfis + 24 usuários, com a guarda inversa da do E106 e o DELETE da S18 verbatim |
| 7 | `f0f1f49` | **S41** — a régua "id de corpo é 422" estava furada em SEIS sítios (a sobra dizia dois); e o N+1 do `POST /contratos` morreu preservando a precedência dos quatro erros |
| 8 | `948b97d` | **A dívida do S-A17** — `e2e/60-ficha-do-trabalho.spec.ts`, os três caminhos da ficha, fixture com resíduo zero |

Cada fecho tem o vermelho-antes literal no commit, e cada linha riscada tem o
hash nos rastreadores (regra 21). Nasceram duas sobras (S42 fechou no mesmo
dia; S43 e S-D48 estão na folha), e o `CLAUDE.md` foi atualizado a cada fecho —
sete vezes, porque a linha envelhece a cada commit e a sessão levou a sério.

## O que a execução ensinou

1. **A regra 20 pagou em quatro dos oito fechos.** A S40 dizia dois botões e
   eram seis pontos de oferta; a S41 dizia dois sítios e eram seis; a S-D45
   dizia 274 e eram 300; a S-D47 mandava conferir o breadcrumb e ele não era
   alvo. Remedir antes de consertar não é cerimônia — é onde metade do
   trabalho de verdade apareceu.

2. **Régua que pula o caso vazio deixa o defeito viver no vazio.** A varredura
   S36 conferia QUAL módulo a tela pede — e pulava tela que não pedia nenhum.
   `pagar.tsx`, a tela de dinheiro saindo, viveu ali. O mesmo desenho estava na
   cobertura de typecheck (`--if-present` acerta o pacote mudo e não faz nada)
   e as duas réguas novas fecham o mesmo buraco em domínios diferentes:
   população que não afirma nada não é população conferida.

3. **Typecheck novo acha defeito velho no primeiro giro.** O `tsc` sobre
   `orval.config.ts` reprovou `prettier: true` — opção que o orval 8 ignora em
   silêncio desde a atualização. O codegen reproduz os `generated/` commitados
   byte a byte, então a formatação está desligada há tempo e ninguém viu.
   Ligar custa 232 arquivos reformatados que as varreduras leem por forma
   (regra 13) — por isso virou pergunta (S-D48), não conserto.

4. **Faxina de dado compartilhado se mede em três tempos** — antes (a
   população e o dinheiro: zero PARCIAL/PAGA nas 26 lojas), durante (26+44+24,
   os números do DELETE) e depois (E2E completo verde: 161/161). A migração
   fica em `docs/migracoes/` com os três tempos escritos, porque faxina sem
   diff é como a onda 0: o registro é o único rastro.

## O adendo do mesmo dia — a folha foi respondida

O registro acima fechava com "13 perguntas esperando gente". **Elas foram
respondidas na própria sessão**, e a tarde fez o resto:

- **Doze das treze fecharam por decisão escrita** (regra 21), cada linha
  riscada no seu rastreador com a frase da resposta. Dez eram "o comportamento
  atual é a decisão"; a S39 confirmou que a dona ANOTA a data do casamento (o
  campo existe, passa a ser usado); a S-A3 confirmou o mesmo caminho comercial
  (classificar as 496 peças virou a S-A27).
- **Duas respostas eram código, e ele foi feito no mesmo dia:** a S-D36
  (`74c540f` — a tela de perfis globais ganha o "Novo perfil", que nasce sem
  acesso nenhum, E2E no spec 46) e a S-A16 (`8179ae5` — a lavagem do estoque
  configurável por loja, default 0, atravessando schema → openapi → codegen →
  cálculo → telas, com banco-virgem verde e o exemplo da sobra pregado em
  teste: o saiote e o vestido do mesmo contrato voltam juntos).
- A resposta da S-A16 veio melhor que as duas opções que a folha oferecia —
  "configurável" em vez de "mesma semana ou zero". Pergunta bem medida não
  garante que as alternativas listadas esgotam a resposta.

## Como retomar

1. **Não há linha de código aberta em rastreador nenhum** — rodada 6 zerada,
   rodada 7 zerada, arqueologia com 2. A régua é **API 1089 · frontend 530 ·
   E2E 165 · typecheck verde em 5**, banco-virgem verde.
2. **As 2 sobras que restam esperam gente, não código:** S-A2 (o verso da
   última página do caderno e as semanas de 28/09 a 11/10 — as 136 saídas
   contadas são piso, não total) e S-A27 (classificar as 496 peças do acervo
   com a dona — uma tarde, o vocabulário já existe).
3. **Duas configurações novas esperam a dona usar:** a data do casamento no
   cadastro (S39 — a curva da Conversão ganha matéria-prima conforme as fichas
   forem preenchidas) e a lavagem do estoque em "Cabines & horário" (S-A16 —
   está em 0, o comportamento de sempre, até ela dizer o número).
4. A quarta régua (`scripts/banco-virgem.ts`, ~40 s) continua obrigatória
   antes de mexer em seed, schema ou `global-setup` — rodou verde no fecho
   da S-A16.
