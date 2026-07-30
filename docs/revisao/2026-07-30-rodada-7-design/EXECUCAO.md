# Rodada 7 (design) — rastreador de diagnóstico e execução

**Branch:** `rodada-7-design` · **Base:** `0b861b4` (tip de `rodada-6/execucao`)
**Tema:** design, UI/UX e experiência de uso do aplicativo INTEIRO — decisão do
dono em 2026-07-30, no lugar do code review geral que o fim da rodada 6
planejava. As lentes E' (UI + ambiente adverso) e F' (UX + a voz do sistema)
previstas no METODO para a R7 rodam AQUI; as demais lentes da R7 (traçador,
arqueologia, etc.) ficam para uma rodada futura de código.
**Modo de trabalho:** autônomo e SEQUENCIAL, sem aprovação intermediária. Cada
fase escreve o próprio arquivo e faz o próprio commit ao terminar — uma sessão
interrompida perde no máximo a fase em curso.

## Como retomar esta rodada

1. Leia este arquivo. A tabela "Estado das fases" diz onde parou; a de épicos
   (criada pela fase de backlog) diz o que falta executar.
2. `git log --oneline main..rodada-7-design` — um commit por fase/épico.
3. **Nada é dado por feito sem commit.** Fase marcada ✅ sem hash não
   sobreviveu — refaça.
4. As regras acumuladas do `docs/revisao/METODO.md` valem integralmente:
   âncora `arquivo:linha` em todo achado, "o que está BEM" por trilha,
   passada adversarial antes de consolidar, rastreabilidade 100%, um épico por
   commit, sobras na tabela deste arquivo no mesmo commit, E2E completo quando
   muda o que alguma tela lê.
5. Se a fila de execução estiver no meio: pegue o primeiro épico ⬜ da tabela
   de épicos, leia o épico no backlog
   (`docs/propostas/2026-07-30-rodada-7-design-backlog.md`) e as Sobras daqui.

## As capturas — a evidência visual desta rodada

`capturas/` tem **27 rotas × (claro 1280×800 · escuro 1280×800 · mobile
390×844)**, capturadas em 2026-07-30 ~02:20 com o app de pé e o banco de dev
(loja `84e539bd`, dados de seed E2E + resíduos de fixture). O `manifest.json`
mapeia rota → arquivos; `AMBIENTE.md` declara o que se sabe e o que NÃO se
sabe do ambiente da captura (regra 6 do método). Os PNGs ficam FORA do git
(7,5 MB — ver `.gitignore`); o que o commit carrega é manifest + ambiente.
O script que as gerou viveu no scratchpad de uma sessão anterior e se perdeu
(por isso o diretório nasceu chamado `undefined/`) — recriá-lo versionado é
trabalho desta rodada (ver Sobras, S-D1).

**Regra para achado visual:** a âncora é dupla — o arquivo da captura (o que
se vê) E o `arquivo:linha` do código que desenha aquilo (onde se mexe). Achado
que depende de locale/navegador não vira 🔴 sem contraprova variando o
ambiente: as capturas não declaram locale, e foi exatamente assim que a rodada
6 inflou o E1.

## As lentes desta rodada

| Trilha | Lente | A pergunta que ela faz |
|---|---|---|
| A | Consistência visual | Espaçamento, tipografia, cor, componentes: as telas parecem UM sistema ou uma colagem? Onde o mesmo conceito tem duas caras? |
| B | Usabilidade e fluxos | Quantos cliques custam as tarefas de todo dia da vendedora? Onde o fluxo obriga a saber o que o sistema deveria saber? Formulário que perde trabalho? |
| C | Feedback e estados | O que a tela diz carregando, vazia, com erro, depois de agir? Confirmação destrutiva nomeia o que se perde? O silêncio onde devia haver resposta? |
| D | Informação e busca | A pessoa ACHA o que procura? Listas com filtro/busca à altura do volume real (533 vestidos, 3 anos de loja)? A informação mais usada está a um olhar ou enterrada? Hierarquia dentro de cada tela? |
| E | Responsividade e ambiente adverso | 390px de verdade: o que quebra, dobra, esconde ou vira alvo de 20px? Fonte grande, contraste, teclado, leitor de tela. |
| F | A voz do sistema | O microcopy como personagem: culpa a pessoa? explica? é o mesmo em toda tela? Título, botão, vazio, erro e toast falam a mesma língua? |

Depois das seis: **passada adversarial** (tenta derrubar cada 🔴 e cada 🟠
caro — regra 7), **consolidação G** (achado→épico, rastreabilidade 100%) e
**backlog** (`docs/propostas/2026-07-30-rodada-7-design-backlog.md`).

## Estado das fases

| Fase | Arquivo | Estado | Commit |
|---|---|---|---|
| Trilha A — consistência visual | `a-consistencia-visual.md` | ✅ | `1123cc2` |
| Trilha B — usabilidade e fluxos | `b-usabilidade-fluxos.md` | ✅ | `00b1814` |
| Trilha C — feedback e estados | `c-feedback-estados.md` | ✅ | `e65c8b7` |
| Trilha D — informação e busca | `d-informacao-busca.md` | ✅ | `33a60cb` |
| Trilha E — responsividade e ambiente adverso | `e-responsividade.md` | ✅ | `3f0b3a6` |
| Trilha F — a voz do sistema | `f-voz-do-sistema.md` | ✅ | |
| Adversarial — refutar os 🔴/🟠 | `adversarial.md` | ⬜ | |
| Consolidação G | `g-consolidado.md` | ⬜ | |
| Backlog em épicos | `../../propostas/2026-07-30-rodada-7-design-backlog.md` | ⬜ | |

Legenda: ⬜ pendente · 🟨 em andamento · ✅ feito e commitado

## Estado dos épicos

*(a fase de backlog preenche esta tabela; épicos desta rodada começam em E120
para não colidir com E105–E115 da rodada 6 nem com os E116+ que o fechamento
dela possa reclamar)*

| Épico | O que resolve | Esforço | Estado | Commit |
|---|---|---|---|---|

## Sobras — visto de passagem sem épico

Regra 12 do método: a sobra entra aqui no MESMO commit que a viu.

| # | O quê | Peso | Origem |
|---|---|---|---|
| S-D1 | **O script de captura de telas não existe no repo.** As 81 capturas de hoje foram geradas por um script de scratchpad que se perdeu (o diretório nasceu `undefined/` — a env var do destino não existia). Recriar como `scripts/` versionado, declarando ambiente (browser, locale, viewport) no manifest — é a ferramenta de verificação visual desta rodada e das próximas. | 🟡 | montagem da rodada |
| S-D2 | **O manifest da captura não declara ambiente.** Viewport foi recuperado dos PNGs (1280×800 / 390×844); navegador segue desconhecido. A trilha E provou a locale pelos próprios PNGs: interface **en-US** ("July 2026" em `financeiro-folha--390.png`, `mm/dd/yyyy` em `financeiro-auditoria--390.png`). O script recriado (S-D1) deve declarar isso no manifest. | 🔵 | montagem da rodada |
| S-D3 | **Quatro primitivos com 0 usos seguem em `src/components/ui/`** (`empty.tsx`, `avatar.tsx`, `pagination.tsx`, `progress.tsx` — contagem do inventário). O E99 mediu que a poda não muda um byte do bundle (tree-shaken), então o custo não é rede: é busca e manutenção — quatro arquivos que o `find` devolve e ninguém chama. Podar como higiene, ou adotar (`empty`/`pagination` têm candidatos nas trilhas C e D). | 🔵 | trilha A |
| S-D4 | **`ContratoInput` aceita `vendedoraId` do CORPO** (`lib/api-spec/openapi.yaml:5652-5664`; validado só como "é da loja" em `api-server/src/routes/contratos.ts:149`), enquanto a régua do replit.md para autoria é "vem da SESSÃO, não do corpo". Aqui não é autoria pura — a vendedora da venda pode legitimamente ser outra pessoa (é o achado B1) —, mas a superfície permite atribuir a venda (e a comissão) a qualquer colega por curl, sem tela. Decidir na execução do B1 se o servidor passa a exigir coerência com `orcamento.vendedoraId` quando houver orçamento. | 🟡 | trilha B |
| S-D5 | **`GET /lojas/:id/orcamentos` embute `itens: true` de todos os orçamentos da loja** (`api-server/src/routes/orcamentos.ts:126-131`) para uma lista que não desenha valor nenhum (achado D1) — o payload cresce com a história inteira e ninguém o lê. Quando o épico do D1 der busca/página à listagem, a rota deve mandar os itens só onde alguém os consome (`?leadId=` do perfil já os usa; a listagem geral não). | 🟡 | trilha D |
| S-D6 | **`useIsMobile` tem 0 consumidores** (`moscow-noivas/src/hooks/use-mobile.tsx`; grep no `src/` inteiro — o app decide mobile por breakpoint CSS, que é o certo). Mesma classe da S-D3: podar como higiene, ou adotar se algum épico da rodada precisar de decisão em JS. | 🔵 | trilha E |

## Diário de sessões

### Sessão 1 — 2026-07-30

- Rodada criada por decisão do dono: melhorar design/UI/UX do app inteiro, em
  modo autônomo e sequencial, no formato do METODO. Branch `rodada-7-design`
  a partir de `0b861b4`.
- Capturas de 27 rotas (claro/escuro/390px) encontradas em `undefined/`,
  movidas para `capturas/`, dimensões medidas dos próprios PNGs; manifest e
  `AMBIENTE.md` commitados, PNGs fora do git. Duas sobras registradas (S-D1,
  S-D2).
- **Trilha A (consistência visual) entregue.** Tese: o esqueleto é UM sistema
  (tokens com WCAG provada, serif, `brl()` sem exceção); a colagem está nos
  detalhes onde a régua existe e não chega — o badge de status sem gramática
  (6 mapeamentos contraditórios em 7 telas, "Faltou" indistinguível de
  "Agendado" na fila), o degrau maior do dinheiro fora da escala do dono em 11
  de 15 pontos (o mesmo R$ 39.688,00 sans-bold no dashboard e serif em Minha
  comissão), e a navegação entre visões irmãs com 4 caras em 4 grupos do menu.
  Contagem: **0 🔴 · 3 🟠 · 3 🟡 · 1 🔵** (A1–A7), 9 itens de "está BEM"
  ancorados, 6 pistas laterais (a mais cara: `text-primary` como texto normal a
  2,71:1 em `mensagens/index.tsx:379` — trilha E). Uma sobra nova (S-D3).
- **Trilha B (usabilidade e fluxos) entregue.** Tese: as sete jornadas medidas
  estão curtas (noiva nova + agendamento em 11 cliques sem beco; costureira a 1
  clique por peça) — o que sobrou de caro é o sistema perguntando o que já sabe
  e calando o que acabou de fazer: o contrato nasce da vendedora QUE CLICOU
  (`orcamentos/[id].tsx:595`, a mesma classe que o E98 fechou na agenda —
  R$ 210,00 de comissão trocam de bolso num contrato de R$ 4.200,00 a 5%),
  cobrar por `/cobranca` custa +3 gestos de rastro por noiva enquanto
  `/mensagens` carimba sozinha, a fila de cobrança não marca o que já saiu, a
  parcela do balcão não se acha pelo nome, e o único botão colorido do orçamento
  em rascunho é "Aprovar" — o passo que a própria tela desaconselha. S13 medido:
  8 telas de formulário perdem tudo no clique da sidebar, 6 sem nem o
  `beforeunload` pronto. Contagem: **0 🔴 · 5 🟠 · 6 🟡 · 0 🔵** (B1–B11), 10
  itens de "está BEM" ancorados, 5 pistas laterais (a mais cara: 53 toasts em 31
  arquivos ainda mostram `err.message` cru — trilha F). Uma sobra nova (S-D4).
- **Trilha C (feedback e estados) entregue.** Tese: o caminho feliz está maduro
  (toda mutação amostrada desabilita no `isPending`, o toast de sucesso nomeia o
  que aconteceu, os vazios de primeiro uso ensinam) — o que ninguém desenhou é a
  FALHA: a fila do dia dispara 4 queries e lê zero vezes `isLoading`/`isError`,
  afirmando "Fila vazia — ninguém esperando mensagem" enquanto não sabe
  (`mensagens/index.tsx:200-202`); a conciliação desenha o veredito com o lado
  do sistema vazio (extrato de 45 transações → "Bateu 0 · Só no banco 45") e
  ensina a relançar dinheiro que existe; o dashboard vira a falha em
  "A receber R$ 0,00" (`dashboard.tsx:316`); 49 toasts de erro em 29 arquivos
  mostram "HTTP 409 Conflict: CÓDIGO" e descartam o `detalhe` que o servidor
  escreveu (o builder do cliente procura `detail`, não `detalhe` —
  `custom-fetch.ts:150-171`); e 3 confirmações de dinheiro estão fora da
  cláusula do texto do E10 — o estorno do contrato cita o PREVISTO onde o caixa
  perde o RECEBIDO (R$ 1.000,00 no diálogo, R$ 300,00 no caixa). Contagem:
  **0 🔴 · 5 🟠 · 2 🟡 · 0 🔵** (C1–C7), 9 itens de "está BEM" ancorados, 4
  pistas laterais. Nenhuma sobra nova fora do escopo de UX; a pista da A
  (vazio de minha-comissao) recebeu veredito — não sobe a achado — e a da B
  (comentário F26) fica com o épico do B2, que já mexe naquelas linhas.
- **Trilha D (informação e busca) entregue.** Tese: a informação do DIA está
  bem servida (busca de noivas server-side que acha por dígitos do telefone,
  recortes no banco, 13 filtros na URL) — o que não aguenta 3 anos de loja é o
  ACERVO e a pergunta do telefone: contratos e orçamentos não têm busca nem
  página e o servidor manda o mais ANTIGO primeiro (o contrato da semana
  passada é o último de ~290 cards), a lista de noivas fica com o default
  `antigos` que só ela não escolheu (a noiva de ontem na página 34), a ficha
  não sabe quando é a próxima prova, o saldo devedor (R$ 5.880,00 de um
  contrato de R$ 8.400,00 em 10×) só aparece no diálogo de CANCELAR, e o
  filtro em `useState` de 6 telas morre a cada ida-e-volta, não só no F5.
  Contagem: **0 🔴 · 5 🟠 · 5 🟡 · 0 🔵** (D1–D10), 9 itens de "está BEM"
  ancorados, 5 pistas laterais (a mais cara: a listagem de orçamentos baixa
  `itens` da história inteira para não mostrar valor nenhum — virou a sobra
  S-D5). As pistas herdadas foram assumidas: valor no card de orçamento →
  D1, selects sem teto de vestidos → D8, "Hoje na loja" sem link → D9; a do
  C sobre o `:316` do dashboard fica com o épico do C3. Duas decisões
  registradas conferidas e respeitadas (E99 parte 7, E100 parte 3).
- **Trilha E (responsividade e ambiente adverso) entregue.** Tese: o miolo
  aguenta os 390px (tabelas rolam por dentro, o toque arrasta com delay certo,
  `brl()` não dobra linha em 27 capturas) — o que estoura é a MOLDURA: fileiras
  de flex sem quebra dão rolagem lateral à página e escondem o botão do dia
  ("Novo Vestido" 100% fora da tela, o WhatsApp da Cobrança invisível numa
  linha de ~560px para um card de ~326px, o total "Recebido R$ 90.100,00" com
  os dígitos finais fora da borda), e duas réguas do próprio repo ficaram pela
  metade — os 44px que não chegaram ao botão `default` (36px, os 60 alvos que
  o E92 mediu e adiou) e o contraste que não chegou ao rosa como texto (2,71:1
  em 11 pontos, um deles o preço no portal da noiva, vivo porque a varredura
  do E8 lê linha a linha e o prettier quebrou o par). Enter não conclui nenhum
  fluxo de dinheiro: zero `<form>` no financeiro (5 teclas onde a convenção é
  1). Contagem: **0 🔴 · 4 🟠 · 9 🟡 · 0 🔵** (E1–E13), 10 itens de "está BEM"
  ancorados, 2 pistas laterais. Pistas herdadas assumidas: contraste do
  `text-primary` (A) → E4, dinheiro em `type=number` (B) → E11, filtros de
  /vestidos em 390px (D) → E13 (consolida com D8). Uma sobra nova (S-D6) e a
  locale das capturas provada en-US pelos próprios PNGs (evidência anotada na
  S-D2).
- **Trilha F (a voz do sistema) entregue.** Tese: a voz que o E92/E96/E100
  criaram é boa e é UMA (sucesso em "objeto + particípio" sem exceção, 15 de
  16 confirmações perguntando com o objeto no título, zero
  "Confirmar"/"OK"/inglês/código cru no app inteiro) — o que sobrou são cinco
  formulações para "falhou" (76 toasts "Erro ao X" contra os 14 da voz que o
  METODO celebra), duas gramáticas de validação (20 "é obrigatório" contra 10
  imperativos que dizem o conserto — a mesma função da folha usa as duas),
  "Ateliê" no menu contra "atelier" em 8 frases (duas ditas à noiva no
  portal), "lente" dos documentos de revisão vazando para o vazio de
  /noivas, e um bolsão pré-E92 mapeado: o módulo de cadastro de vestidos
  concentra os únicos 3 "com sucesso", 4 dos 6 "..." e 3 dos 9 Title Case.
  Contagem: **0 🔴 · 0 🟠 · 4 🟡 · 6 🔵** (F1–F10), 10 itens de "está BEM"
  ancorados, 4 pistas laterais (a mais cara: F5+F8+F9+`type=number` da B
  apontam o MESMO bolsão — um épico único no módulo vestidos fecha 6 desvios).
  Pistas herdadas assumidas: "anteriores/passadas" (A) → F7, "(s)" e "Remover
  ajuste" (C) → F6/F7, "lente" (D) → F4; a da B (53 toasts crus) confirmada
  como C4 — a F acrescenta o TÍTULO do toast (F1), não o mecanismo. Nenhuma
  sobra nova fora do escopo de UX.
