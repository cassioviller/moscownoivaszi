# S-C222 + S-C213 + S-C102 — as varreduras de manual ganham o olhar para dentro, os dois recados viram citação, e a trilha da mora guarda a frase

**Trilha do contrato de papel, lote das azuis de 2026-08-15 (bloco 7)** · branch `sobras-bloco7` · base `7650b480` (E219)
Fecha: **S-C222** 🔵, **S-C213** 🔵, **S-C102** 🔵 — três commits, um por sobra (áreas disjuntas: régua nova, manual+régua existente, rota+teste)
Suíte: API **1699 passed | 1 failed (1700, 237 arquivos — o failed é o `backup-download`, vermelho conhecido de worktree)** · frontend **956 → 961 (102 arquivos)** · typecheck verde — medidas no banco próprio `moscow_wt_bloco7`

**E2E obrigatório e NÃO rodado — worktree não isola porta.**

## O que se mediu antes da primeira linha

- **A base do worktree não era a base da tarefa.** O worktree nasceu em
  `cbcd8b30` — o MESMO hash em que três dos quatro agentes do lote de 14/08
  nasceram atrasados —, 12 commits atrás do `7650b480` que a tarefa manda usar.
  Reposicionado antes de qualquer medição (`git checkout -B sobras-bloco7
  7650b480`); medir ali teria descrito a S-C102 com a âncora antiga e a
  contagem de moldes sem os 3 do E224.
- **As três âncoras andaram, e uma delas estava incompleta no enunciado** —
  ver as correções abaixo.
- **A calibragem da régua nova mediu ANTES de pregar**, e o que ela achou de
  passagem é maior que a própria sobra: **quatro das cinco frases que negam
  existência de UI nos manuais são falsas hoje** (S-C270, no Visto de
  passagem).

## Correções ao enunciado das sobras

- **S-C213** — as duas âncoras: o recado interpolado está em
  `lib/financeiro-core/src/reserva.ts:151-154` (o enunciado diz `reserva.ts:152`
  sem o pacote; a rota `artifacts/api-server/src/routes/reservas.ts` também
  existe e não é ela); o recado partido andou de `reservas/[bloqueioId].tsx:945-947`
  para **`:1117-1119`**, como o enunciado previu. E uma correção de fato: o
  recado do prazo **já era citável e citado** — a vendedora o prega como molde
  desde o E224 (`vendedora.html:844`, `data-tela="dias antes da retirada "`).
  O que o veto do paralelo travava não era a citabilidade, era **o manual do
  proprietário poder citá-lo**: os dois contornos em prosa estavam na tabela
  "Quando o sistema diz não" dele (`proprietario.html:706` e `:708`), e é lá
  que as duas citações nasceram.
- **S-C222** — o contorno do E196 que a sobra descreve **já não está no
  manual**: o lote de S-C96 o removeu (`costureira.html:454` hoje ensina o
  contrário, com o conselho envelhecido CITADO entre aspas curvas). A régua
  nasce sobre corpus limpo, e o vermelho teve de ser **plantado** (regra 34).
  E a regra aprovada ("célula pregada não pode contradizer prosa do mesmo
  documento") precisou de duas restrições que só a medição deu — sem elas, a
  régua reprovava os cinco manuais CERTOS em nove pontos (abaixo).
- **S-C102** — a âncora andou de `contratos.ts:1956-1963` para
  **`:2522-2543`** (o bloco do `registrarAuditoria` da `MORA_RECEBIDA`), como
  o enunciado previu. A premissa da sobra confere: `detalhe` gravava `valor`,
  `diasDeAtraso`, `multa`, `juros` e nenhuma frase, e a descrição da parcela
  (`:2514`) carregava a explicação inteira desde a S-C71 — coluna editável,
  enquanto `audit_log` é append-only.

## S-C222 — a quarta varredura: o manual não contradiz a si mesmo (`135107f3`)

`varredura-manuais-contradicao.test.ts` (5 testes). Duas metades:

1. **Contradição interna** — negação de existência de UI (*"não
   tem/há/existe/está + tela/botão/formulário"*, até duas palavras no meio)
   cruzada com a **identidade dos chips do mesmo documento**.
2. **Dívida declarada** — toda negação de UI entra numa tabela pregada com o
   motivo, cobrada nas DUAS direções: frase nova sem declaração reprova, e
   dívida que o manual já pagou reprova até a baixa (a lição do E186 — tabela
   de dívida também envelhece).

**O que a calibragem mudou no desenho, medido:**

- A primeira versão do elo (toda palavra ≥ 5 letras do rótulo do chip) deu
  **nove falsos positivos em cinco manuais**: "noiva", "prova" e "reserva"
  estão em chip demais, e `Registrar retirada` era acusado pela palavra
  "registrar" numa frase sobre outro gesto. O elo virou **a identidade do
  chip: as palavras depois da primeira** (a ação — Registrar, Criar, Nova…),
  e os falsos foram a zero com o plantado do E196 ainda detectado
  (`Nova confecção` → "confecção").
- Sem tratar **fechamento de bloco como fim de frase**, o título *"Prova de
  noiva sem reserva"* colava no parágrafo seguinte e fabricava **quatro
  contradições** na recepção que eram um `<h3>` grudado num `<p>`.
- `gesto` e `campo` ficaram FORA da lista de substantivos de UI, declarado no
  arquivo: *"não há gesto nenhum para disparar um aviso"* (vendedora) é frase
  verdadeira que entrava, e `campo` tem população zero.
- Texto entre aspas curvas sai antes de tudo: o manual CITA ali (inclusive o
  conselho envelhecido que ele manda ignorar), não afirma.

**Ponto cego declarado no próprio arquivo**: a negação que não nomeia
identidade de chip nenhum não é contradição interna — quem a segura é a
dívida declarada. E o tamanho desse buraco foi medido na abertura: é a S-C270.

## S-C213 — os dois recados viram citação com o pedaço literal declarado (`b3a00ec2`)

As duas linhas em prosa da tabela do proprietário viraram citações entre
aspas curvas com `data-tela`:

- o carnê depois do prazo: exibe a frase inteira com exemplo preenchido e
  prega **` dia(s) depois do limite.`** — o pedaço contíguo da SEGUNDA
  sentença (`reserva.ts:154`), que a vendedora não prega (ela prega
  `dias antes da retirada `, da primeira);
- a peça fora do rol: exibe o recado inteiro com uma peça de exemplo e prega
  **`atrasou e não está no rol de itens do`** — o pedaço contíguo da linha
  1117 do JSX.

A contagem de moldes subiu `toBe(9)` → `toBe(11)`, com a razão escrita no
teste. Era a linha que quatro agentes em paralelo não podiam tocar; este lote
é serial nela, como a recomendação previu.

## S-C102 — a trilha da mora guarda a frase que a tela contou (`282fcb7c`)

Uma linha no `detalhe` da `MORA_RECEBIDA` (`contratos.ts:2541`):
`explicacao: mora?.explicacao ?? ""` — a MESMA frase de `explicacaoDaMora`
(uma grafia só, o helper `moraDe`), com a declaração de alcance (*"Sem
correção monetária — o contrato não nomeia índice."*) dentro. O teste prova
que ela chega **e que é a mesma do carnê**: a descrição da linha de MORA tem
de ser exatamente `"Multa e juros (cláusula 9ª) — " + detalhe.explicacao` —
se as duas grafias divergirem um dia, é este assert que acusa.

## Verificação

Cada conserto com o vermelho literal, medido antes do verde:

- **S-C213 (contagem)**: com as citações no manual e a régua velha —
  `expected 11 to be 9`.
- **S-C213 (molde 1 vivo, regra 34)**: recado do JSX reescrito de propósito →
  `o manual cita o que a tela não tem: docs/manuais/proprietario.html · recado
  (molde): «atrasou e não está no rol de itens do»`.
- **S-C213 (molde 2 vivo)**: frase de `reserva.ts` mudada de propósito →
  `docs/manuais/proprietario.html · recado (molde): « dia(s) depois do
  limite.»`. Desfeitas as quebras: **3 passed**, e as varreduras de menu e
  prazos seguem verdes (12 passed).
- **S-C222 (acha o plantado, regra 34)**: a frase do E196 replantada na
  costureira → **as duas metades** reprovam: `chip «Nova confecção» × «A
  confecção pura não tem tela onde ser cadastrada hoje.» (elo: confecção)` na
  contradição interna, e a mesma frase como `frase nova negando UI sem
  declaração` na dívida. Removida: **5 passed**.
- **S-C222 (cobra a baixa)**: a frase `ainda não tem botão` removida da
  vendedora de propósito → `dívida declarada que o manual já não tem — dê
  baixa na tabela: docs/manuais/vendedora.html · «ainda não tem botão»`.
- **S-C222 (ignora o que não é)**: o par da S-C180 está no próprio arquivo —
  citação entre aspas, negação de outra coisa ("não tem janela") e **o falso
  positivo medido na calibragem** como caso pregado de ignorar.
- **S-C102**: o assert novo contra o código de antes → `a trilha da mora não
  guarda a frase (S-C102): expected undefined to be defined`. Com a linha:
  **e213 21 passed · sc50 8 passed**.

Suítes finais, no banco próprio (`moscow_wt_bloco7`, criado com
`createdb` + `push` + seed):

- **API: 1699 passed | 1 failed (1700, 237 arquivos), zero skipped** — o
  único vermelho é o `backup-download-api.test.ts:77`
  (`expected "Content-Disposition" … got 404`), **o conhecido de todo
  worktree**: `res.download` recusa caminho com componente oculto e todo
  worktree vive sob `.claude/`. Não é deste lote; no `main` ele passa. Fora
  ele, a contagem é a da base — nenhum teste de API novo, o assert da S-C102
  entrou em teste existente.
- **Frontend: 961 passed (102 arquivos)** — era 956 (101); +5 da varredura
  nova.
- **Typecheck: verde** nos 5 projetos.
- **E2E: NÃO rodado** — worktree não isola porta; é do integrador.

## O que eu errei

A primeira versão da dívida declarada da noiva dizia **"verdade hoje — o
portal mostra a retirada e não a devolução"**, escrita a partir da nota do
manual em vez de medida contra a tela — exatamente o erro da entrega 4 do
S-C96 (deduzir em vez de ler). Medido antes do commit final: o portal mostra
`devolucaoPrevista`/`devolucaoFeitaEm` desde o E230
(`noiva-portal.tsx:603-615`), e o motivo foi corrigido para ENVELHECIDA
(S-C270) no amend. A régua nova quase nasceu com uma mentira pregada dentro.

## Visto de passagem (→ tabela de Sobras, faixa do bloco 7)

| Sobra | O que é | Sev. |
|---|---|---|
| **S-C270** | **Os manuais não foram reescritos depois da onda E223–E232, e quatro frases afirmam que não existe UI que existe.** A regra do E196 (manual se reescreve depois da onda) parou na reescrita da manhã de 14/08; os épicos da tarde/noite a envelheceram: `proprietario.html:463-465` diz *"o gesto não existe em tela nenhuma"* e lista o perdão como trabalho anotado, `vendedora.html:761` diz *"Perdoar a multa é decisão que ainda não tem botão"* **e ensina o contorno** (*"quem quiser abrir mão combina com a dona e recebe o principal"*) — o botão **Perdoar multa** existe desde o E226 (`contratos/[id].tsx:933`, `6d1cf08a`); e `noiva.html:341` manda *"dizer a data em voz alta"* porque *"a data de DEVOLUÇÃO não está nesta tela"* — o portal a mostra desde o E230 (`noiva-portal.tsx:603-615`, `f88802d9`). As quatro estão **pregadas como dívida declarada com o ID S-C270** na `varredura-manuais-contradicao`; a reescrita dá baixa e a varredura cobra. Quando os manuais citarem o chip «Perdoar multa», a contradição interna passa a valer para essas frases | 🟡 |
| **S-C271** | **Quatro varreduras de manual, quatro extrações próprias.** `varredura-manuais-contradicao` e `varredura-manuais-textos` extraem os chips `class="btn"` com regexes irmãs, e as quatro enumeram `docs/manuais/*.html` por `git ls-files` cada uma à sua maneira. É o mesmo movimento da S-C75/S-C79 (helper compartilhado de enumeração) aplicado aos manuais — fundir quando aquele helper nascer, não antes | 🔵 |

## Proposta de capacidade (para o integrador levar ao `replit.md`, se valer)

Os manuais têm agora **quatro varreduras**: menu (`varredura-manuais`),
números (`-prazos`), citações (`-textos`) e contradição interna + dívida de
negação (`-contradicao`). A convenção editorial nova que a quarta impõe:
**frase que nega existência de tela/botão/formulário num manual ou é
verdadeira e declarada na tabela da varredura, ou reprova a suíte.**
