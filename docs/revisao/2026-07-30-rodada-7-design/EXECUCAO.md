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
| Trilha B — usabilidade e fluxos | `b-usabilidade-fluxos.md` | ✅ | |
| Trilha C — feedback e estados | `c-feedback-estados.md` | ⬜ | |
| Trilha D — informação e busca | `d-informacao-busca.md` | ⬜ | |
| Trilha E — responsividade e ambiente adverso | `e-responsividade.md` | ⬜ | |
| Trilha F — a voz do sistema | `f-voz-do-sistema.md` | ⬜ | |
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
| S-D2 | **O manifest da captura não declara ambiente.** Viewport foi recuperado dos PNGs (1280×800 / 390×844); navegador e locale seguem desconhecidos. Enquanto isso, nenhum achado dependente de plataforma sobe de 🟡 sem contraprova (regra 6). | 🔵 | montagem da rodada |
| S-D3 | **Quatro primitivos com 0 usos seguem em `src/components/ui/`** (`empty.tsx`, `avatar.tsx`, `pagination.tsx`, `progress.tsx` — contagem do inventário). O E99 mediu que a poda não muda um byte do bundle (tree-shaken), então o custo não é rede: é busca e manutenção — quatro arquivos que o `find` devolve e ninguém chama. Podar como higiene, ou adotar (`empty`/`pagination` têm candidatos nas trilhas C e D). | 🔵 | trilha A |
| S-D4 | **`ContratoInput` aceita `vendedoraId` do CORPO** (`lib/api-spec/openapi.yaml:5652-5664`; validado só como "é da loja" em `api-server/src/routes/contratos.ts:149`), enquanto a régua do replit.md para autoria é "vem da SESSÃO, não do corpo". Aqui não é autoria pura — a vendedora da venda pode legitimamente ser outra pessoa (é o achado B1) —, mas a superfície permite atribuir a venda (e a comissão) a qualquer colega por curl, sem tela. Decidir na execução do B1 se o servidor passa a exigir coerência com `orcamento.vendedoraId` quando houver orçamento. | 🟡 | trilha B |

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
