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
5. O diagnóstico e o backlog estão FECHADOS: a fila de execução começa no
   E120. Pegue o primeiro épico ⬜ da tabela de épicos, leia o épico no backlog
   (`docs/propostas/2026-07-30-rodada-7-design-backlog.md`) — incluindo a seção
   "Perguntas ao dono" do topo, cujos defaults valem sem resposta — e as
   Sobras daqui. Toda "Primeira ação" do backlog é mapear EXECUTANDO antes de
   escrever.

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
| Trilha F — a voz do sistema | `f-voz-do-sistema.md` | ✅ | `87cfbb1` |
| Adversarial — refutar os 🔴/🟠 | `adversarial.md` | ✅ | `71d3053` |
| Consolidação G | `g-consolidado.md` | ✅ | `0f1b794` |
| Backlog em épicos | `../../propostas/2026-07-30-rodada-7-design-backlog.md` | ✅ | `cb2ac37` |

Legenda: ⬜ pendente · 🟨 em andamento · ✅ feito e commitado

## Estado dos épicos

A ordem da tabela é a ordem de execução (a numeração já satisfaz as
dependências: E132 depois de E121, E138 depois de E122, E134/E135 adjacentes,
E141 depois de E124). O detalhe de cada épico — A dor, escopo, cuidados,
testes, primeira ação — está no backlog
(`docs/propostas/2026-07-30-rodada-7-design-backlog.md`), que abre com as
**6 perguntas ao dono (P1–P6)** e o default conservador que a execução segue
para cada uma.

| Épico | O que resolve | Esforço | Estado | Commit |
|---|---|---|---|---|
| E120 | O contrato nasce de quem vendeu (B1, B5, B6 + decide S-D4/P1) | M | ✅ | `8af14b4` |
| E121 | A tela para de afirmar zero enquanto não sabe (C1, C2, C3) | M | ✅ | `f919679` |
| E122 | O erro mostra a frase do servidor: `detalhe` + `mensagemApi` nos 27 (C4, F1) | M | ✅ | `5b73445` |
| E123 | Cobrar deixa rastro pelas duas portas; a fila marca o que saiu (B2, B3) | M | ✅ | `2c780b1` |
| E124 | Busca, página e recentes-primeiro no acervo de 3 anos (D1, D2, B4, C6 + S-D5) | G | ✅ | `a0b18c1` |
| E125 | A ficha responde o telefone: próxima prova e saldo devedor (D3, D4) | M | ✅ | `21695c4` |
| E126 | A moldura cabe nos 390px: a fileira quebra (E1, E2, E3, E5) | M | ✅ | `413c99b` |
| E127 | `--primary-texto`, `--aviso` e a fresta da varredura por linha (E4, E7, A5) | M | ✅ | `8ac81c6` |
| E128 | A confirmação de dinheiro diz o número certo (C5, C7) | M | ✅ | `ef33c43` |
| E129 | O filtro sobrevive à navegação: 6 telas para a URL (D5) | M | ✅ | `c2fa5bd` |
| E130 | A gramática do badge de status + um primitivo por gesto (A1, A3) | M | ✅ | `8d14198` |
| E131 | O degrau maior do dinheiro entra na escala nos 11 pontos (A2) | M | ✅ | `6182e57` |
| E132 | O painel responde: cartões navegam, costureira ganha o dela (B8, D9, D10) | M | ✅ | `cfa827f` |
| E133 | O formulário avisa antes de perder: hook nas 6 telas nuas (B7) | P | ✅ | `fce6368` |
| E134 | O módulo vestidos entra nas réguas: voz, dinheiro, porta honesta (B11, E11, F9) | M | ✅ | `7d698ef` |
| E135 | A parede de filtros ganha teto, colapsada no celular (D8, E13) | M | ✅ | `db5ed1d` |
| E136 | Teclado e leitor de tela: `<form>` no dinheiro, reagendar sem arrasto, headings (E6, E10, E12) | G | ✅ | `15737c0` |
| E137 | A régua dos 44px fecha: overrides caem, `default` mobile decidido (E8, E9) | P | ✅ | |
| E138 | Uma passada de voz: grafia, capitalização, validação, linha de propósito (11 achados A/F) | M | ⬜ | |
| E139 | Fechar o mês vira roteiro: três passos com estado na Folha (B10) | M | ⬜ | |
| E140 | O WhatsApp no cadastro inline (B9) | P | ⬜ | |
| E141 | ⌘K: a busca de noivas de qualquer tela (D6) | M | ⬜ | |
| E142 | O relatório de conversão aprende "e neste período?" (D7) | P | ⬜ | |

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
| S-D7 | **As varreduras de grep por linha têm uma fresta de formatação.** O prettier separou `text-primary` de `brl(` em `noiva-portal.tsx:404-405` e o ofensor vive com CI verde porque `escala-dinheiro.test.ts:62-64` exige os dois NA MESMA linha (é o miolo do E4; o E127 fecha essa instância). Auditar as outras varreduras da mesma técnica (`destrutivas-varredura`, `datas-varredura`) contra a mesma quebra — pista da trilha E, assumida pela consolidação como trabalho de teste, fora do escopo de UX. | 🟡 | consolidação G |
| S-D8 | **Dois erros do `POST /contratos` fora da régua de erro da casa:** `api-server/src/routes/contratos.ts:282` responde `{ error: "Bloqueio not found" }` (inglês, sem código) e `:346` responde `{ error: "dataCasamento do contrato diverge da data do bloqueio" }` — a FRASE no campo do CÓDIGO, sem `detalhe`. O `mensagemApi` da tela mapeia por código (`MENSAGENS_ERRO` de `orcamentos/[id].tsx`), então os dois caem no cru para a vendedora, no clique que fecha a venda. Candidato natural ao E122 (o épico do erro que mostra a frase do servidor). | 🟡 | execução E120 |
| S-D9 | **O vazio de Permissões está fora da régua do `<Vazio>` e é quase inalcançável.** "Nenhum perfil encontrado." (`pages/permissoes/index.tsx`) não diz por que nem o próximo passo — e os perfis do sistema sempre existem: se a lista veio vazia, a notícia certa é outra. Decidir entre remover o ramo ou dar frase com saída. | 🔵 | execução E121 |
| S-D10 | **O cartão da fila (F7) do dashboard aparece de repente.** `filaDeMensagens` deriva de 3 queries com `?? []`: enquanto elas contam, o cartão fica AUSENTE e salta na tela segundos depois do resto do painel. Mesma classe do E121 vestida de ausência — não afirma zero, por isso não subiu a conserto; o custo é o salto de layout na tela de abertura. | 🔵 | execução E121 |
| S-D11 | **A classe do S-D8 continua fora do `POST /contratos`:** `api-server/src/routes/reservas.ts:328,424,505,638` respondem `{ error: "Bloqueio not found" }`, `lookbooks.ts` tem 2 × "Foto not found", `admin.ts` tem "Loja/Perfil/Usuario not found" — inglês no campo do código, sem `detalhe`. Com o E122, `mensagemApi` mostra o `detalhe` do servidor em toda tela; nessas rotas ele cai no fallback genérico onde o servidor sabia o motivo. | 🟡 | execução E122 |
| S-D12 | **O dicionário da tela sombreia o `detalhe` quando o código é reutilizado:** `MENSAGENS_ERRO` de `pages/orcamentos/[id].tsx:92` traduz `REFERENCIA_INVALIDA` como "Essa noiva não é desta loja.", mas `api-server/src/routes/contratos.ts:307` usa o MESMO código para reserva de outra noiva, com detalhe próprio e melhor — a régua lê o código primeiro e mostra a frase da noiva para um problema de reserva. Ou o servidor especializa o código, ou o dicionário sai da frente do detalhe nesse caso. | 🟡 | execução E122 |
| S-D13 | **A marca de "já cobrada" da fila de `/mensagens` é da sessão de tela** (E123/B3, `lib/mensagens-do-dia.ts` — `MarcasCobranca`): sobrevive à interrupção do telefone, que é o cenário do achado, e morre no F5 com os registros ainda no banco — depois do reload as linhas voltam à fila e um segundo clique grava um segundo registro do dia. Marcar "cobrada hoje" atravessando reload exigiria os registros do dia em LOTE (hoje `GET /leads/:leadId/cobrancas` é por noiva). Decisão de escopo do E123, registrada para o dono poder pedir a versão persistente. | 🔵 | execução E123 |
| S-D14 | **O seed do `16-cobranca-historico.spec.ts:31-37` lê `id` de `GET /equipe`, que expõe `usuarioId`** — o ramo de criar contrato só roda quando o banco não tem NENHUMA parcela vencida, então nunca roda no banco de dev cheio e o `vendedoraId: undefined` dormindo lá falharia com `CORPO_INVALIDO`. Descoberto porque o spec do E123 copiou o molde e o vermelho-antes veio do seed, não do assert. Consertar o 16 quando ele for tocado. | 🔵 | execução E123 |
| S-D15 | **`{ error: "Lead not found" }` vive em 8 pontos de `routes/leads.ts`** (:81, :434, :459, :512, :550, :600, :680, :712) — a classe da S-D8/S-D11 (inglês no campo do código, sem `detalhe`), no arquivo que o E123 tocou. O 404 da rota nova do E123 já nasceu na régua (`REGISTRO_DE_COBRANCA_NAO_ENCONTRADO` + detalhe); os 8 vizinhos ficam para o épico que fechar a S-D11. | 🟡 | execução E123 |
| S-D16 | **`orcamentos/[id].tsx:235` baixa a lista COMPLETA de contratos da loja para um único `find(c => c.orcamentoId === id)`** — 615.041 bytes medidos no banco de dev (518 contratos) só para alternar "Gerar/Ver contrato" quando o orçamento está APROVADO. Com o E124 a rota pagina, mas esta chamada segue sem página de propósito (o find precisa do acervo). Um `?orcamentoId=` no `GET /contratos` — a mesma classe do `?leadId=` do E62 — faz isso custar uma linha. | 🟡 | execução E124 |
| S-D18 | **`SelectTrigger` fica em 36px no mobile** (`ui/select.tsx`, `h-9`) — o mesmo raciocínio que levou o Button `default` a `min-h-11 md:min-h-9` no E137 vale para ele (medido: os 2 únicos alvos <44px restantes de /atendimentos a 390px são SelectTriggers; todos os selects de filtro do app têm a mesma altura). As ABAS custom do tablist (E97/E130) medem ~37px — mesma classe. Fora do escopo dos achados E8/E9, que mediram Button; a mudança é uma palavra em cada primitivo. | 🔵 | execução E137 |
| S-D17 | **14 specs do E2E criam recurso (lead, vestido, cabine, contrato…) e não têm `afterAll`** (levantamento por grep: 16, 17, 18, 19, 21, 24, 27, 28, 29, 30, 31, 35, 36, 37) — a família S18/S25. O spec 49 era o 15º e o único DETERMINISTICAMENTE explosivo (provas de 90 min acumulando no mesmo dia +6 da vendedora compartilhada saturaram o expediente na cadência de uma suíte por épico — 146/147 na primeira passada do E125); ganhou `afterAll` no próprio E125 porque bloqueava a regra 11. Os outros 14 vazam sem colidir (stamps únicos), mas são a fonte do acervo-lixo que a S25 mediu. Auditar e dar limpeza a cada um quando for tocado — ou de uma vez num épico de higiene de suíte. | 🟡 (infra de teste) | execução E125 |

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
- **Passada adversarial entregue.** A rodada não tem 🔴, então os **22 🟠**
  das seis trilhas foram desafiados um a um: toda âncora relida no código de
  verdade, 4 capturas reabertas, a conta de contraste do E4 refeita do zero
  (2,68:1) e o `git log -S` usado onde a origem de uma suposta decisão
  importava. Resultado: **21 sobreviveram, 1 caiu** — o A3 desce a 🟡 (as
  "quatro caras" da navegação são dois gestos distintos com duas caras cada;
  o custo é reconhecimento, não tempo/erro diário). Três notas para a
  consolidação: o C4 carrega o número corrigido (47 toasts em 27 arquivos,
  não 49 em 29), o épico do D2 atualiza o comentário sem medida de
  `openapi.yaml:1243-1247` junto, e nenhuma das 22 âncoras se apoiava em dado
  de fixture nem contrariava decisão registrada com medida de pé. Nenhuma
  sobra nova.
- **Consolidação G entregue.** A frase da rodada: *as réguas da rodada 6
  venceram o caminho feliz do dia; a rodada 7 achou aonde elas não chegaram —
  a falha que fica muda, o acervo de 3 anos que não se acha e a moldura do
  celular que esconde o botão do dia*. Os **58 achados** das seis trilhas
  (0 🔴 · 21 🟠 · 30 🟡 · 7 🔵, graus finais do adversarial) viraram **23
  épicos, E120–E142** (4 P · 17 M · 2 G), com rastreabilidade 100% — nada fora
  por decisão ou artefato; os três pares duplicados entre trilhas (A4=F5,
  A7=F10, D8=E13) foram fundidos, e o maior agrupamento (E138, a passada de
  voz) fecha 11 achados de 2 trilhas num commit de strings. Ordem por valor:
  E120 (a comissão que troca de bolso) e E121 (o C2, o 🟠 mais perto de 🔴)
  abrem a fila; dependências explícitas: E132 depois de E121, E138 depois de
  E122, E134/E135 em sequência. As três notas da adversarial foram carregadas
  (C4=47/27, o comentário do openapi no E124, a conta 2,68:1 no E127). Uma
  sobra nova (S-D7, a fresta das varreduras por linha).
- **Backlog em épicos entregue**
  (`docs/propostas/2026-07-30-rodada-7-design-backlog.md`). Os 23 épicos
  E120–E142 no formato da rodada 6 — A dor com âncoras / Feito significa /
  Escopo técnico / Cuidados / Testes / Primeira ação —, cada "Primeira ação"
  sendo mapear EXECUTANDO (um grep, um teste que falha, uma medição), a lição
  das 5 vezes em que o backlog da rodada 6 errou por ler sem executar. As **6
  decisões de produto viraram perguntas ao dono (P1–P6) com default
  conservador escrito** — nenhum épico bloqueado: vendedora do contrato
  rastreada e não travada (P1), recentes-primeiro (P2), `default` mobile a
  44px (P3), grafia "ateliê" (P4), duas portas em Vestidos com a rápida
  declarando o que falta (P5), a tabela semântica do badge (P6). Ordem de
  execução = ordem numérica (as 4 dependências da consolidação ficam
  satisfeitas por construção); esforço somado 4 P · 17 M · 2 G; regra 11
  marcada explicitamente nos épicos que mudam o que a trilha grava ou o que a
  tela lê (E120, E123, E124, E128, E138, E142 condicional). Tabela de épicos
  deste rastreador preenchida com os 23 ⬜. Nenhuma sobra nova.

### Sessão 2 — 2026-07-30

- **E120 entregue** (`execucao/E120.md`). A execução abre a fila pelo épico que
  mexe em dinheiro trocando de bolso: o diálogo "Gerar contrato" ganhou o
  select "Vendedora da venda" nascendo de `orcamento.vendedoraId` (B1 — era
  `vendedoraId: user!.id`, e R$ 210,00 de comissão num contrato de R$ 4.200,00
  a 5% iam para quem clicou), a primária do rascunho sem aceite virou "Link
  para a noiva" com "Aprovar" a um clique no menu (B5), e a data do casamento
  vem da ficha (B6). **S-D4 decidida pela P1**: o servidor aceita a divergência
  e grava `CONTRATO_VENDEDORA_DIVERGENTE` dentro da transação, com os dois
  lados nomeados — o mapeamento executado imprimiu o rastro de hoje e ele era
  **zero linhas** (`expected [] to have a length of 1`). Régua mecânica nova
  (`vendedora-da-venda-varredura.test.ts`: `vendedoraId` de sessão em payload,
  proibido — 2ª ocorrência da classe E98) e jornada E2E nova
  (`52-orcamento-vira-contrato.spec.ts`, a prova no banco:
  `contrato.vendedoraId === maria.id` com a admin logada). Suítes: API
  852 → 855 · front 314 → 315 · E2E 137 → 139 · typecheck verde. Uma sobra
  nova (S-D8, os dois erros do `POST /contratos` fora da régua de erro).

### Sessão 3 — 2026-07-30

- **O E120 estava órfão: pronto, ✅ no rastreador, e sem commit.** A sessão 2
  morreu entre escrever o relatório (05:27) e commitar. Esta sessão verificou
  o working tree intocado — typecheck verde, front 315/315, API 855/855, as
  contagens exatas do relatório — e o commitou sem mudar um byte (`8af14b4` +
  `6786f39`); a suíte E2E completa desta sessão (139/139) cobriu os 2 specs
  novos dele antes do commit do E121. A lição está no relatório do E121: o elo
  mais fraco da rodada autônoma é o fim da sessão, não o código.
- **E121 entregue** (`execucao/E121.md`). Três telas afirmavam zero enquanto
  não sabiam, e a decisão de quando uma tela PODE afirmar virou função pura —
  `lib/estado-consulta.ts`: pronto é unânime, erro ganha de carregando,
  consulta desligada por permissão não conta. **C2** (o 🟠 mais perto de 🔴):
  a conciliação desenhava "Bateu 0 · Só no banco 45" com o sistema em voo —
  reproduzido em teste (`conciliarExtrato(45, []) → casadas 0, soExtrato 45`)
  — e ensinava a relançar dinheiro; agora o veredito nem é computado sem as
  duas respostas, com esqueleto por seção e `<Erro>` com refetch. **C1**: a
  fila do dia lia 0 × o estado das 4 queries que dispara; o cabeçalho ganhou
  "Contando a fila do dia…"/"Parte da fila não carregou" e cada seção o próprio
  erro (`portais` fora do gate de propósito — só enriquece o link). **C3**: a
  falha do painel virou UMA notícia com saída no lugar de seis zeros
  ("A receber R$ 0,00" etc.), "Minha comissão" distingue falha de "sem regra",
  o funil falhado diz "A coluna não carregou" (o arquivo não tinha UMA
  ocorrência de `isError`) com total "—", e Permissões saiu do branco. A seção
  Testes do backlog pediu render test que o repo decidiu não ter (E99,
  comentário do `estado-erro.test.ts`) — convertido em decisão pura + varredura
  de adoção nas cinco telas, vermelho antes com 4 AssertionError literais.
  Suítes: API 855 (servidor intocado) · front 315 → 325 · E2E 139/139 completa
  antes do commit · typecheck verde. Duas sobras novas (S-D9, S-D10).

### Sessão 4 — 2026-07-30

- **E122 entregue** (`execucao/E122.md`). O servidor escrevia a explicação e o
  cliente a jogava fora em duas camadas: o builder (`custom-fetch.ts`) não lia
  `detalhe` — o toast dizia "HTTP 409 Conflict: CONVITE_PENDENTE" e descartava
  "Use reenviar ou cancele o convite existente" — e 47 toasts em 27 arquivos
  (número da adversarial, conferido exato no mapa) ainda liam `err.message` no
  lugar da régua `mensagemApi` (que passou de 23 para 47 arquivos). O título
  canônico da falha foi decidido e aplicado: **"Não deu para <verbo>"** — os
  76 `title: "Erro ao X"` migraram, mais 16 da mesma classe em ternários e
  args de helper que o grep da trilha não contava, 36 títulos irmãos em
  `AlertTitle`/`titulo=` e os 6 "Não foi possível X"; exceções deliberadas:
  "Não consegui entrar" (login) e "Essa mudança não é possível agora" (recusa
  de regra). Os 13 (não 14) blocos "Falha inesperada ao…" viraram o `<Erro>`
  canônico. **S-D8 fechada**: os dois erros do `POST /contratos` entraram na
  régua (`RESERVA_NAO_ENCONTRADA`; `DATA_DIVERGE_DA_RESERVA` convergindo para
  o molde que o PATCH do mesmo arquivo já tinha, 240 linhas abaixo). Varredura
  nova (`erro-cru-varredura.test.ts`, arquivo inteiro, lição S-D7): reprovava
  27 arquivos por `err.message` e 49 por título "Erro …"; hoje zero e zero.
  Suítes: API 855 → 856 · front 325 → 331 · E2E 139/139 completa antes do
  commit · typecheck verde. Duas sobras novas (S-D11, S-D12).

### Sessão 5 — 2026-07-30

- **E123 entregue** (`execucao/E123.md`). As duas portas de cobrar passaram a
  deixar o MESMO rastro: o WhatsApp de `/financeiro/cobranca` carimba o
  `registro-cobranca` no clique (B2 — antes registrar custava +3 gestos por
  noiva; o vermelho-antes foi o E2E esperando um POST que nunca saiu:
  `waitForResponse: Test timeout of 60000ms exceeded`), e a fila de
  `/mensagens` adota o desenho da seção irmã (B3): a linha sai ao cobrar para
  "Já cobradas · nome · valor · hora", com "Não cobrei" de volta — o dedup
  `enviadas` virou estado com forma (`MarcasCobranca`, 4 funções puras + 6
  testes em `mensagens-do-dia`). O que o backlog não listou: **"com desfazer"
  exigia uma rota** — desfazer só no visual deixaria no banco um contato que
  não houve — e nasceu `DELETE /leads/:leadId/cobrancas/:registroId` na régua
  do E115 (404 com código+detalhe, escopo loja+lead, trilha
  `REGISTRO_COBRANCA_DESFEITO` dentro da transação; 4 testes de API,
  vermelho-antes `expected 204, got 404`). A prosa de
  `mensagens/index.tsx:149-153` que afirmava a paridade inexistente foi
  corrigida no mesmo commit. Suítes: API 856 → 860 · front 331 → 337 · E2E
  completo 141/141 (2 specs novos, `53-cobranca-duas-portas`) · typecheck
  verde. Três sobras novas (S-D13 marca de sessão, S-D14 seed do spec 16,
  S-D15 os 8 "Lead not found" de leads.ts).

### Sessão 6 — 2026-07-30

- **E124 entregue** (`execucao/E124.md`). O acervo de 3 anos se acha: a
  primeira ação mediu o antes com o app de pé — `GET /contratos` devolvia
  **615.041 bytes, 518 contratos, o de 2026-01-10 no topo** e o de hoje no fim;
  `GET /orcamentos`, 246.611 bytes com 216 `itens` embutidos que **nenhuma tela
  lia** (nem o `?leadId=` da ficha — a metade "o perfil já os usa" da S-D5 era
  suposição, corrigida no relatório). Os dois GETs ganharam
  `q`/`status`/`pagina`/`porPagina`/`ordem` (default `recentes`, P2) com a
  busca do `listLeads` extraída para `lib/busca-lead.ts` (índices trigram já
  cobrem: EXPLAIN em 0,685 ms), resposta paginada `{total, itens}` — o formato
  atravessou 8 consumidores via typecheck —, telas com debounce+página no molde
  de /noivas e o card de orçamento mostrando `brl(valorTotal)` agregado pela
  régua única (2 × 3.000 − 10% = 5.400, com teste). **D2**: 1 linha
  (`ordem: "recentes"`) e o comentário sem medida do openapi trocado pelo
  motivo verdadeiro. **B4**: Receber ganhou a busca do balcão — com busca a
  query pede abertas SEM janela ("a pessoa na sua frente não tem janela"),
  decisão pura em `lib/financeiro/busca.ts` com 9 testes. **C6**: os vazios de
  receber/pagar nomeiam a janela ("Nada com vencimento entre 01/07 e 31/07")
  com "Ver os próximos 3 meses"/"Voltar ao mês atual", e /noivas trocou
  "nesta lente" por `<Vazio>` com "Limpar filtros" (a instância de "lente" do
  E138 saiu junto — nota no relatório). Duas correções de plano registradas:
  `status` de contratos PRECISOU descer ao servidor (página fatiada +
  refiltro no cliente = contagem mentirosa) e o join de `vendedora` que o Zod
  descartava havia meses saiu da rota. A primeira passada completa do E2E
  terminou 143/144 — o vermelho era a regra 11 pegando o que o mapa não pegou:
  `05-leads.spec.ts` afirmava a noiva mais ANTIGA do banco na página 1, ou
  seja, afirmava a ordem que o D2 inverteu; o spec passou a buscar pelo nome e
  a segunda passada fechou 144/144 (spec novo `54-acervo-que-se-acha`).
  Suítes: API 860 → 867 · front 337 → 346 · E2E completo 144/144 · typecheck
  verde. Uma sobra nova (S-D16).

### Sessão 7 — 2026-07-30

- **E125 entregue** (`execucao/E125.md`) — e entregue DUAS vezes, no sentido do
  E120: a sessão que escreveu o código morreu antes do relatório e do commit
  (segunda ocorrência do elo fraco da rodada autônoma). Esta sessão conferiu o
  working tree contra o backlog, reconstruiu o vermelho-antes com `git show
  HEAD` + stash temporário e commitou. O épico em si: a ligação mais comum tem
  duas perguntas e a ficha não respondia nenhuma. **D3**: a ficha dispara
  `GET /atendimentos?leadId=&de=hoje` — o param `leadId` NÃO existia (o backlog
  supunha que sim; correção de plano) e nasceu no spec — e `proximaVisita`
  decide a próxima (AGENDADO futuro mais cedo); o banner de próximo passo
  recebe `temVisitaFutura`: NOVO com visita vira "Registrar os interesses
  dela", INTERESSES_PREENCHIDOS com visita cala, e enquanto a agenda conta o
  banner espera (régua do E121). **D4**: "Falta receber R$ 5.880,00" (o caso
  literal: 8.400 em 10×, entrada + 3 recebidas) no bloco de valores do contrato
  e no card Contratos da ficha — pela régua ÚNICA `abertoEmCentavos`, que era
  PRIVADA no core e tinha três escritas irmãs (diálogo de cancelar, portal);
  exportada, os três leitores convergiram e o `?leadId=` de contratos passou a
  embutir parcelas (a listagem geral segue sem — a lição S-D5/S-D16). A regra
  11 pegou dívida de infra: a primeira passada completa deu 146/147 e o
  vermelho era o spec 49 saturando a própria agenda (6 provas residuais de 90
  min no dia +6 — ele não tinha `afterAll`); ganhou limpeza, o spec 55 saiu da
  disputa do dia +6, e 140 atendimentos + 144 leads + 11 cabines residuais
  saíram do banco. Segunda passada: 147/147. Suítes: API 867 → 871 · front
  346 → 357 · E2E completo 147/147 · typecheck verde. Uma sobra nova (S-D17,
  os 14 specs sem `afterAll`).
- **E126 entregue** (`execucao/E126.md`). A moldura cabe nos 390px, medido
  antes/depois com script ad hoc (a S-D1 segue sobra): `main.scrollWidth`
  vestidos 656 → 390 ("Novo Vestido" estava em [502,656], 100% fora), cobrança
  594 → 390 (o WhatsApp em [457,571] voltou), contratos 419, pagar 414,
  receber 416 e reservas 437 → todos 390. O conserto é do PADRÃO: `flex-wrap`
  nas fileiras (headers de listagem, grupo de botões de pagar, linha do card
  de contrato, linha de parcela, ações de cobrança, `<li>` de equipe, chip de
  reservas com `truncate`), `max-sm:basis-full` no `ResumoCard` (a conta da
  primeira ação: `money-lg` real mede até 190px contra 144px de `min-w-[9rem]`
  — R$ 90.100,00 e R$ 90.100,09 viravam a mesma imagem) e, POR ÚLTIMO,
  `overflow-x-hidden` no `<main>` (ordem obrigatória do cuidado a). Desktop
  conferido intacto a 1280 (scrollW = clientW = 1024 nas 7 rotas). Duas
  correções de diagnóstico: o caso vivo do corte era R$ 100.500,00 (não o
  R$ 90.100,00 da captura — o caixa andou) e equipe NÃO estoura (o E5 lá é
  legibilidade, não overflow). O executor errou duas vezes a MESMA sintaxe
  (comentário JSX dentro do parêntese da arrow) e a de equipe derrubou a rota
  no dev — o typecheck pegou; lição no relatório: typecheck antes de medir.
  Suítes: API 871 · front 357 · E2E completo 147/147 · typecheck verde.
  Nenhuma sobra nova.
- **E127 entregue** (`execucao/E127.md`). As cores semânticas ganharam token
  com a conta ao lado e entraram na varredura: `--primary-texto` (claro
  350 30% 42% — 6,24/6,48/5,82 sobre background/card/muted; escuro 350 35% 72%
  — 7,27/6,64) nos 10 links que usavam o rosa da marca a 2,68:1; o preço do
  portal da noiva NÃO virou rosa-texto — virou `money-sm`, o molde do gêmeo do
  lookbook (regra E8: dinheiro não é rosa). `--aviso` (claro 35 90% 30% —
  5,60/5,82/5,22; escuro 40 85% 65% — 9,79/8,93) substituiu os 5 tons à mão de
  cobrança (o degrau âmbar→laranja virou intensidade de borda), orçamento e
  backup (que reinventava red/emerald onde `--destructive`/`--positivo` já
  existem). O sino trocou `text-white` cru pelo par testado de cada ramo. A
  fresta da varredura FECHOU com vermelho-antes literal: a varredura do E8
  reformulada para janela de 3 linhas reprovou `noiva-portal.tsx:405` (o par
  que o prettier separou) antes da migração — um ofensor, zero falsos
  positivos; `text-primary-texto` não escapa dela. 12 pares novos em
  `aparencia.test.ts`. Dois vistos de passagem no relatório (o "hoje" de
  `semana.tsx:176` na mesma classe, fora da lista da trilha; a variante `link`
  do Button com 0 usos). Suítes: API 871 · front 357 → 369 · E2E completo
  147/147 · typecheck verde. Nenhuma sobra nova.
- **E128 entregue** (`execucao/E128.md`). A confirmação de dinheiro diz o
  número certo, com a foto do antes: o diálogo de estorno aberto numa parcela
  PARCIAL viva do dev dizia **R$ 1.000,00** onde o caixa perde **R$ 400,00**
  (`capturas/e128/`). As frases viraram decisão pura
  (`lib/financeiro/confirmacoes.ts`, 6 testes com os casos literais): estorno
  cita o RECEBIDO, remoção de parcela o previsto (que ali é o certo), remoção
  de conta ganha o valor, estorno de pagamento nomeia descrição + fatia da
  linha (numa saída conjunta o total não desce por linha — a frase diz o lote
  e a fatia). A LGPD parou de confirmar às cegas: nasceu
  `GET /leads/expurgo/previa` (read-only, a MESMA `condicaoDoExpurgo` do
  UPDATE — uma escrita só) e o diálogo conta ANTES, na régua do E121
  (carregando não afirma; 0 desabilita; falha cai na frase sem contagem). O
  teste de API prova prévia = expurgo na mesma fixtura (2 = 2 → 0) e que o GET
  não escreve. De carona, o único asterisco-de-obrigatório do app saiu. Suítes:
  API 871 → 873 · front 369 → 375 · E2E completo 147/147 · typecheck verde.
  Nenhuma sobra nova.
- **E129 entregue** (`execucao/E129.md`). O filtro sobrevive à navegação: as 6
  telas de `useState` (contratos, orçamentos, noivas, atendimentos — a mais
  cara, 5 filtros zerando juntos —, vestidos e o recorte da conciliação)
  passaram para a URL na gramática nova de `lib/filtro-url.ts` (default FORA
  da URL, vazio é ausência, `?quando=historico` atravessa intacto; 14 testes)
  com `hooks/use-busca-na-url.ts` (debounce 300ms com `replace`, a URL manda
  no input, mudar a busca zera a página no MESMO gesto). O inventário da
  primeira ação deu a convenção pelos nomes das 18 telas certas; `q` veio do
  nome que a busca já tem no servidor. Medido no app vivo: digitar → `?q=`;
  pill → `?filtro=CANCELADO`; `/noivas?etapa=PERDIDO` abre com o select em
  "Perdido"; `/atendimentos?situacao=AGENDADO` → dashboard → voltar → filtro
  de pé. Os testes de MemoryRouter do backlog convertidos em decisão pura
  (o repo não tem infra de render — E99/E121). Suítes: API 873 · front
  375 → 389 · E2E completo 147/147 · typecheck verde. Nenhuma sobra nova.
- **E130 entregue** (`execucao/E130.md`). O status ganhou gramática: a matriz
  real montada por grep confirmou as 6 contradições ("Faltou" no MESMO cinza
  de "Agendado" na fila; Recusado `outline` onde Cancelado é `destructive`;
  cabine × vestido em pares opostos) e a tabela P6 virou
  `lib/status-badge.ts` (em dia/em andamento → default · terminou bem →
  secondary · terminou mal → destructive · inativo → outline · precisa de
  reação → `aviso`, a variante NOVA de Badge sobre o token do E127). As 7
  telas migraram + Configurações (2 instâncias da mesma classe, vistas ao
  abrir o arquivo). A varredura nasceu com a JANELA de 3 linhas (lição
  E127/S-D7 — a versão por linha teria deixado o dashboard escapar) e
  reprovou 4 telas antes da migração, literal. A3: duas línguas declaradas e
  aplicadas — alternar visão = aba sublinhada (Configurações deixou a única
  pílula `ui/tabs` do app), ir a outra tela = link-seta (Agenda trocou os
  ghosts por "Semana →"/"Fila de atendimentos →"); filtros intocados. Suítes:
  API 873 · front 389 → 401 · E2E completo 147/147 · typecheck verde. Nenhuma
  sobra nova.
- **E131 entregue** (`execucao/E131.md`). O degrau maior do dinheiro entrou na
  escala: o grep de reconferência achou **12 pontos** (não 11 — o cartão de
  comissão do painel é do E66, posterior à medição da trilha), todos migrados
  para `money-lg` mantendo cor semântica: dashboard ×3, os 3 cards de faixa da
  cobrança (o `CardTitle` sans virou `<p className="money-lg">` — CardTitle
  carrega `text-2xl font-semibold` de base e a disputa de utilitários é
  decidida pela ordem do stylesheet, não do className), fluxo ×2 e
  minha-comissão ×4 (o serif à mão num degrau inexistente). Os 2 overrides
  caíram (`comissoes:698 text-2xl`, `dre:197 text-4xl`). Adoção medida, não
  reescrita (cuidado a do E99): os 92 call-sites de `brl()` intocados. Visual:
  o painel com R$ 46.864,00 no MESMO serif de Minha comissão
  (`capturas/e131/`). Suítes: API 873 · front 401 · E2E completo 147/147 ·
  typecheck verde. Nenhuma sobra nova.
- **E132 entregue** (`execucao/E132.md`). O painel responde: os 4 contadores
  viraram Link para o destino óbvio (hrefs conferidos no app vivo, com escopo
  de loja), "Hoje na loja" ganhou "Fila de atendimentos →" (a língua do
  E130/A3) e a costureira ganhou o cartão "N ajustes para costurar esta
  semana" — some-quando-vazio, gate do módulo agenda, contando pelo MESMO
  conjunto da fila por construção: a régua da semana saiu do inline de
  `/ajustes` para `lib/ajustes-da-semana.ts` (5 testes; prova quando existe,
  senão casamento; atrasado é da semana). Correção de plano: `GET /ajustes`
  NÃO tem params — o "recorte semana" sempre foi decisão de cliente, e a
  extração é o que garante o número único. Prova visual com semeadura
  temporária (1 ajuste a 5 dias → cartão aparece e navega; removido em
  seguida) — que custou uma passada de E2E: o `casamento_data` movido sem
  anotar o original pôs o bloqueio no topo da lista de reservas e o
  `13-onda2` (que clica no `.first()` — a classe posicional do 05-leads/E124)
  caiu 146/147; dado consertado (+300 dias), segunda passada 147/147, lição no
  relatório. Suítes: API 873 · front 401 → 406 · E2E completo 146/147 →
  147/147 · typecheck verde. Nenhuma sobra nova.
- **E133 entregue** (`execucao/E133.md`). O hook de saída (E97) chegou às 6
  telas nuas — a pior delas o formulário de interesses, preenchido durante o
  atendimento com a noiva falando. O mapa da primeira ação pegou o que o plano
  de gabinete erraria: `vestido-form` e `config` são RHF **e** estado solto ao
  mesmo tempo (seleções de catálogo, nome de cabine) — o sujo honesto é a
  disjunção; interesses derivou o retrato contra o servidor (entries
  ordenadas) calando após salvar. Varredura de adoção nova
  (`confirmar-saida-adocao.test.ts`, 7 telas — as 5 migradas + as 2 do E97).
  Roteador intocado (S13 segue sobra). Suítes: API 873 · front 406 → 413 ·
  E2E completo 147/147 · typecheck verde. Nenhuma sobra nova.
- **E134 entregue** (`execucao/E134.md`). O módulo vestidos entrou nas réguas:
  os 3 `type="number"` de dinheiro (confirmados pelo grep — os outros 3 são
  contagens/horas, corretos) viraram `inputMode="decimal"` + `parseValor` com
  schema que distingue vazio de sujo (molde E95) e mensagens que dizem o
  conserto; a regra "nunca type=number para dinheiro", escrita desde o E92,
  ganhou VARREDURA (`type="number"` + `step="0.01"` em janela de 3 linhas —
  regra que vale por comentário não vale). Voz: os 3 únicos "com sucesso" do
  app e os 4 "..." datilografados do módulo saíram. P5 decidida pelo default:
  a porta rápida DECLARA o que não cria (DialogDescription) e o toast de
  sucesso oferece "Completar agora" para a edição da peça recém-criada.
  Suítes: API 873 · front 413 → 414 · E2E completo 147/147 · typecheck verde.
  Nenhuma sobra nova.
- **E135 entregue** (`execucao/E135.md`). A parede de filtros ganhou teto,
  medida antes: **176 comboboxes** renderizados antes do primeiro vestido nas
  duas viewports (fixture; o mecanismo sem teto é o real). Depois: 1280px
  abre com **3** (atributos atrás de "Mais filtros (N aplicados)"); 390px
  abre com **0** — o bloco inteiro atrás de "Filtrar (N)", chips dos ativos
  visíveis mesmo fechado ("Tamanho M" com `?tamanho=M`), e a primeira dobra
  voltou a ser acervo. Colapso é só exibição: o estado segue na URL (E129) e
  o filtro em memória segue instantâneo (E99 parte 7 de pé). O spec 27
  aprendeu o caminho novo (abrir "Mais filtros" antes do select). O executor
  errou a ordem de declaração (TDZ em `dataSelecionada`) — pego pela
  conferência visual, não pelo typecheck; adendo à lição do E126 no
  relatório. Suítes: API 873 · front 414 · E2E completo 147/147 · typecheck
  verde. Nenhuma sobra nova.
- **E136 entregue** (`execucao/E136.md`). Teclado e leitor de tela alcançam o
  que o dedo alcança: os **5 fluxos de dinheiro ganharam `<form>`** (receber,
  pagamento — inclusive rateado —, lançar despesa, gerar plano, folha; o
  inventário confirmou o ZERO absoluto de forms no financeiro; Cancelar
  virou `type="button"` explícito para não submeter), **as duas portas sem
  arrasto nasceram** — "Mover para…" no cartão do funil (a MESMA decisão do
  drop, incluindo o diálogo de motivo do PERDIDO; 10 etapas no menu, testado
  vivo) e "Reagendar…" no cartão da grade (diálogo hora+cabine sobre o MESMO
  PATCH, com form) — sensores de arrasto intocados; e **`CardTitle` virou
  `h3`** (1 arquivo, 52 consumidores; o item cortável NÃO precisou ser
  cortado — a suíte completa validou os seletores de heading). O executor
  errou o fio do onReagendar duas vezes (call site do DragOverlay, tipo no
  componente errado) — pego por typecheck + smoke. Suítes: API 873 · front
  414 · E2E completo 147/147 · typecheck verde. Nenhuma sobra nova.
- **E137 entregue** (`execucao/E137.md`). A régua dos 44px fechou em 3 linhas,
  medida antes/depois: /atendimentos a 390px tinha **153 alvos abaixo de
  44px** (os 36px eram o `default` do Button); o `default` ganhou
  `min-h-11 md:min-h-9` (P3 pelo default — reverter é 1 linha) e os 2
  overrides de 24px (X do sino, X do checklist de devolução) viraram
  `md:h-6 md:w-6` — no mobile vale o 44 do próprio `size="icon"`. Depois:
  /vestidos **0 de 763** alvos abaixo; /atendimentos com os `default`
  zerados — os 2 restantes são `SelectTrigger`, primitivo fora do achado
  (sobra nova S-D18, com as abas custom na mesma classe). Suítes: API 873 ·
  front 414 · E2E completo 147/147 · typecheck verde.
