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
| E137 | A régua dos 44px fecha: overrides caem, `default` mobile decidido (E8, E9) | P | ✅ | `a3ecff2` |
| E138 | Uma passada de voz: grafia, capitalização, validação, linha de propósito (11 achados A/F) | M | ✅ | `7908493` |
| E139 | Fechar o mês vira roteiro: três passos com estado na Folha (B10) | M | ✅ | `f3af0dc` |
| E140 | O WhatsApp no cadastro inline (B9) | P | ✅ | `45aecc2` |
| E141 | ⌘K: a busca de noivas de qualquer tela (D6) | M | ✅ | `c6911a6` |
| E142 | O relatório de conversão aprende "e neste período?" (D7) | P | ✅ | `494fc1d` |

## Sobras — visto de passagem sem épico

Regra 12 do método: a sobra entra aqui no MESMO commit que a viu.

| # | O quê | Peso | Origem |
|---|---|---|---|
| S-D1 | **O script de captura de telas não existe no repo.** As 81 capturas de hoje foram geradas por um script de scratchpad que se perdeu (o diretório nasceu `undefined/` — a env var do destino não existia). Recriar como `scripts/` versionado, declarando ambiente (browser, locale, viewport) no manifest — é a ferramenta de verificação visual desta rodada e das próximas. | 🟡 | montagem da rodada |
| S-D2 | **O manifest da captura não declara ambiente.** Viewport foi recuperado dos PNGs (1280×800 / 390×844); navegador segue desconhecido. A trilha E provou a locale pelos próprios PNGs: interface **en-US** ("July 2026" em `financeiro-folha--390.png`, `mm/dd/yyyy` em `financeiro-auditoria--390.png`). O script recriado (S-D1) deve declarar isso no manifest. | 🔵 | montagem da rodada |
| ~~S-D3~~ | ~~**Quatro primitivos com 0 usos seguem em `src/components/ui/`** (`empty.tsx`, `avatar.tsx`, `pagination.tsx`, `progress.tsx` — contagem do inventário). O E99 mediu que a poda não muda um byte do bundle (tree-shaken), então o custo não é rede: é busca e manutenção — quatro arquivos que o `find` devolve e ninguém chama. Podar como higiene, ou adotar (`empty`/`pagination` têm candidatos nas trilhas C e D).~~ **FECHADA em `a77e3ef`, e o diagnóstico errava o custo — para MENOS.** A sobra repete do E99 que a poda "não muda um byte do bundle (tree-shaken)". Muda **1.147 bytes, todos de CSS**: build 1.473.740 → 1.472.593 B, com os 106 `.js`, o `index.html` e os 3 estáticos byte a byte idênticos e o `index-*.css` caindo de 72.943 para 71.796 B (1,57% dele). O `src/index.css:2` é `@import "tailwindcss"` sem `@source`, então o Tailwind v4 varre os fontes atrás de nomes de classe — os quatro pagavam CSS mesmo sendo tree-shaken do JS, e o E99 mediu o JS sem olhar o `index.css`. O ganho é 0,078% do build: a razão de podar continua sendo busca e manutenção, como a sobra diz. Prova de morte: `git ls-files` + grep pelos quatro caminhos sai com **exit 123 e zero linhas** sobre os 930 arquivos versionados. `ui/` cai de 33 para 29 arquivos, e saem junto as duas devDependencies órfãs. | 🔵 | trilha A · onda 1 de 2026-08-06 |
| ~~S-D4~~ | **FECHADA por DECISÃO no E120** (`8af14b4`) — a vendedora do corpo fica, e o que passou a existir é o rastro (`contratos.ts:565`, `CONTRATO_VENDEDORA_DIVERGENTE`). A decisão estava no diário da sessão 2 e nunca voltou para esta tabela. **Mas o rastro tem porta dos fundos, e virou a S-D29** ([conferência](../2026-08-05-conferencia-de-sobras.md)). O diagnóstico original: **`ContratoInput` aceita `vendedoraId` do CORPO** (`lib/api-spec/openapi.yaml:5652-5664`; validado só como "é da loja" em `api-server/src/routes/contratos.ts:149`), enquanto a régua do replit.md para autoria é "vem da SESSÃO, não do corpo". Aqui não é autoria pura — a vendedora da venda pode legitimamente ser outra pessoa (é o achado B1) —, mas a superfície permite atribuir a venda (e a comissão) a qualquer colega por curl, sem tela. Decidir na execução do B1 se o servidor passa a exigir coerência com `orcamento.vendedoraId` quando houver orçamento. | 🟡 | trilha B |
| ~~S-D5~~ | **FECHADA no E124** (`a0b18c1`): `orcamentos.ts:150` só embute `itens` no recorte `?leadId=`, e a listagem geral desce o agregado, paginada. **A metade que a sobra supunha era falsa** — o E124 mediu 246.611 bytes com 216 `itens` que nenhuma tela lia, nem o `?leadId=`. Residual honesto: `dashboard.tsx:130` e `mensagens/index.tsx:108` chamam sem paginar, e sem paginação não há LIMIT — custo zero hoje (0 orçamentos `ENVIADO` no banco), risco de crescimento. O diagnóstico original: **`GET /lojas/:id/orcamentos` embute `itens: true` de todos os orçamentos da loja** (`api-server/src/routes/orcamentos.ts:126-131`) para uma lista que não desenha valor nenhum (achado D1) — o payload cresce com a história inteira e ninguém o lê. Quando o épico do D1 der busca/página à listagem, a rota deve mandar os itens só onde alguém os consome (`?leadId=` do perfil já os usa; a listagem geral não). | 🟡 | trilha D |
| ~~S-D6~~ | ~~**`useIsMobile` tem 0 consumidores** (`moscow-noivas/src/hooks/use-mobile.tsx`; grep no `src/` inteiro — o app decide mobile por breakpoint CSS, que é o certo). Mesma classe da S-D3: podar como higiene, ou adotar se algum épico da rodada precisar de decisão em JS.~~ **FECHADA em `a77e3ef`**, e com a distinção que a onda 0 tinha aberto ao medir "10 consumidores, 7 deles cópia": não existe UM `useIsMobile` com consumidor remoto, existem **dois hooks, um por pacote**. O do app tem 0 consumidores e foi podado; o do `mockup-sandbox` é consumido pelo `sidebar.tsx:8` do próprio mockup, cujo `@` resolve dentro do mockup e nunca alcançou o hook do app. Aquele não é S-D6 — é paleta morta do sandbox, e é S23. | 🔵 | trilha E · onda 1 de 2026-08-06 |
| ~~S-D7~~ | ~~**As varreduras de grep por linha têm uma fresta de formatação.** O prettier separou `text-primary` de `brl(` em `noiva-portal.tsx:404-405` e o ofensor vive com CI verde porque `escala-dinheiro.test.ts:62-64` exige os dois NA MESMA linha (é o miolo do E4; o E127 fecha essa instância). Auditar as outras varreduras da mesma técnica (`destrutivas-varredura`, `datas-varredura`) contra a mesma quebra — pista da trilha E, assumida pela consolidação como trabalho de teste, fora do escopo de UX. **CONFERIDA, e a sobra mandou auditar os DOIS ARQUIVOS ERRADOS.** `destrutivas-varredura` e `datas-varredura` estão limpos — os dois leem o arquivo INTEIRO com `\\s*`, e o prettier pode quebrar o que quiser. **A fresta viva está na varredura da S28** (`s28-assert-tautologico-unit.test.ts:143`), que separa o defeito do sósia legítimo por adjacência medida em número de linha — `if (b.linha - a.linha > 1) continue;`. Medido: **898 de 3.108 declarações `const` nos arquivos que ela varre já continuam na linha seguinte (28,9%)**, e o defeito histórico que a motivou (duas chamadas longas de `request.get`) tem exatamente a forma que o prettier quebra. Ela também **se exclui da própria varredura** (`:170`). Nenhuma janela de vizinhança conserta isso: ali **a adjacência É a régua**. Segunda fresta, menor: `erros-regua-varredura.test.ts:76` lê por janela de 4 linhas mas a ÂNCORA exige `res.status(404).json` contíguo — 116 sites hoje, zero cadeias quebradas, verde por sorte de formatação. Família da S30. [conferência de 2026-08-05](../2026-08-05-conferencia-de-sobras.md) **FECHADA em `973c364`.** A auditoria pedida estava certa e o alvo errado: `destrutivas-varredura` e `datas-varredura` leem o arquivo inteiro com `\s*` e estão limpos — reconferidos, intocados. A fresta é a da S28, e a régua de linha nem pega mais o caso que a motivou: sobre a saída do `prettier 3.8.4` para o trecho de `58ea660^`, ela devolve `[]`. A unidade passou a ser "só há espaço e comentário entre o `;` de uma declaração e o `const` da outra" — **953 das 3.402 declarações `const` (28,0%) nos 265 arquivos de teste versionados** ocupavam mais de uma linha e eram descartadas antes de olhar o assert. A auto-exclusão virou `mascaraNaoExecutavel()`. E a "segunda fresta, menor" não era menor — era a mesma doença da S28 e da S30 juntas (âncora presa a uma linha MAIS janela fixa): a janela de 4 linhas saiu, a leitura passou a ser por parênteses balanceados, e a sonda de HEAD ficava VERDE com `res` quebrado em três linhas devolvendo `error: "Lead nao encontrado"`. | 🟡 | consolidação G · onda 1 de 2026-08-06 |
| ~~S-D8~~ | **FECHADA no E122**, com o segundo site reforçado no E145 (`c16b758`): `contratos.ts:319` responde `RESERVA_NAO_ENCONTRADA` e `:402` responde `DATA_DIVERGE_DA_RESERVA`, os dois com `detalhe` e o segundo nomeando as duas datas em dd/mm/aaaa. **O diagnóstico errou o custo:** `erro-api.ts:61-69` nunca mostra o campo `error` — sem código conhecido e sem `detalhe`, a vendedora recebia o fallback genérico da tela, e não a frase do servidor. O defeito era mais silencioso do que o descrito. O diagnóstico original: **Dois erros do `POST /contratos` fora da régua de erro da casa:** `api-server/src/routes/contratos.ts:282` responde `{ error: "Bloqueio not found" }` (inglês, sem código) e `:346` responde `{ error: "dataCasamento do contrato diverge da data do bloqueio" }` — a FRASE no campo do CÓDIGO, sem `detalhe`. O `mensagemApi` da tela mapeia por código (`MENSAGENS_ERRO` de `orcamentos/[id].tsx`), então os dois caem no cru para a vendedora, no clique que fecha a venda. Candidato natural ao E122 (o épico do erro que mostra a frase do servidor). | 🟡 | execução E120 |
| ~~S-D9~~ | ~~**O vazio de Permissões está fora da régua do `<Vazio>` e é quase inalcançável.** "Nenhum perfil encontrado." (`pages/permissoes/index.tsx`) não diz por que nem o próximo passo — e os perfis do sistema sempre existem: se a lista veio vazia, a notícia certa é outra. Decidir entre remover o ramo ou dar frase com saída.~~ **FECHADA em `3c463bb`, e a sobra subestimava o alcance: a frase morta estava em 3 telas, não 1** — `admin/perfis.tsx`, `equipe/index.tsx` e `permissoes/index.tsx`, todas com a mesma cópia. E o ramo é inalcançável para toda sessão que não seja superadmin: o `innerJoin` de `getPermissoes` garante que quem chegou lá tem perfil na lista, então o vazio nunca aparecia para quem a sobra imaginava. Nasce `lib/perfis-do-sistema.ts` com a frase compartilhada, e uma varredura que reprova quem escrever a própria. | 🔵 | execução E121 · onda 1 de 2026-08-06 |
| ~~S-D10~~ | ~~**O cartão da fila (F7) do dashboard aparece de repente.** `filaDeMensagens` deriva de 3 queries com `?? []`: enquanto elas contam, o cartão fica AUSENTE e salta na tela segundos depois do resto do painel. Mesma classe do E121 vestida de ausência — não afirma zero, por isso não subiu a conserto; o custo é o salto de layout na tela de abertura.~~ **FECHADA em `3c463bb`, e o número dobrou desde que a sobra foi escrita: são 2 cartões e 4 consultas, não 1 e 3.** O E132 acrescentou o segundo salto no mesmo lugar. Os dois passaram a ter o lugar reservado com esqueleto de caixa idêntica — a frase é fixa, repetida invisível —, e o número **sai** do cartão quando uma das 3 consultas falha: o `?? []` fazia o painel prometer menos do que a fila mostra. Sem vermelho, e a razão está no repo: o app não tem infraestrutura de render de página, então o que se testa é a decisão que a tela encapsula (`lib/estado-consulta.ts:14-16`), e a deste conserto já é a do E121. | 🔵 | execução E121 · onda 1 de 2026-08-06 |
| S-D11 | **A classe do S-D8 continua fora do `POST /contratos`:** `api-server/src/routes/reservas.ts:328,424,505,638` respondem `{ error: "Bloqueio not found" }`, `lookbooks.ts` tem 2 × "Foto not found", `admin.ts` tem "Loja/Perfil/Usuario not found" — inglês no campo do código, sem `detalhe`. Com o E122, `mensagemApi` mostra o `detalhe` do servidor em toda tela; nessas rotas ele cai no fallback genérico onde o servidor sabia o motivo. **Fechada no E145** (`c16b758`) — e a classe real eram 84 sites em 14 arquivos, com varredura para não voltar. | ✅ E145 | execução E122 |
| S-D12 | **O dicionário da tela sombreia o `detalhe` quando o código é reutilizado:** `MENSAGENS_ERRO` de `pages/orcamentos/[id].tsx:92` traduz `REFERENCIA_INVALIDA` como "Essa noiva não é desta loja.", mas `api-server/src/routes/contratos.ts:307` usa o MESMO código para reserva de outra noiva, com detalhe próprio e melhor — a régua lê o código primeiro e mostra a frase da noiva para um problema de reserva. Ou o servidor especializa o código, ou o dicionário sai da frente do detalhe nesse caso. **Fechada no E145** (`c16b758`): o servidor especializou — `RESERVA_DE_OUTRA_NOIVA`, sem entrada no dicionário. | ✅ E145 | execução E122 |
| S-D13 | **A marca de "já cobrada" da fila de `/mensagens` é da sessão de tela** (E123/B3, `lib/mensagens-do-dia.ts` — `MarcasCobranca`): sobrevive à interrupção do telefone, que é o cenário do achado, e morre no F5 com os registros ainda no banco — depois do reload as linhas voltam à fila e um segundo clique grava um segundo registro do dia. Marcar "cobrada hoje" atravessando reload exigiria os registros do dia em LOTE (hoje `GET /leads/:leadId/cobrancas` é por noiva). Decisão de escopo do E123, registrada para o dono poder pedir a versão persistente.**CONFERIDA na onda 1 de 2026-08-06: não fecha na faixa B, e o diagnóstico erra o mecanismo duas vezes.** (a) Ela diz que a versão persistente "exigiria os registros do dia em LOTE (hoje `GET /leads/:leadId/cobrancas` é por noiva)". **O lote JÁ EXISTE e não é esse endpoint:** `Lead.ultimoContatoEm` é `max(contatoData)` de `registros_cobranca` agregado numa query só (`leads.ts:59-70`, `ultimoContatoPorLead`), já usado em 4 sítios. Falta UM: a rota de parcelas monta o lead com `with: { contrato: { with: { lead: true } } }` — a linha crua, sem o agregado — e é justamente esse payload que a fila de cobrança carrega. (b) Semântica: `ultimoContatoEm` é "último contato de qualquer canal", não "cobrada HOJE" — a marca persistente precisa comparar contra o dia de negócio da loja, senão uma cobrança de anteontem tira a linha da fila de hoje. O conserto é uma chamada a função que já existe, mas dentro da rota (`financeiro.ts:141`), com fixture e teste de API: **encosta no banco, e por isso vai para a fila serial.** | 🔵 | execução E123 · onda 1 de 2026-08-06 |
| S-D14 | **O seed do `16-cobranca-historico.spec.ts:31-37` lê `id` de `GET /equipe`, que expõe `usuarioId`** — o ramo de criar contrato só roda quando o banco não tem NENHUMA parcela vencida, então nunca roda no banco de dev cheio e o `vendedoraId: undefined` dormindo lá falharia com `CORPO_INVALIDO`. Descoberto porque o spec do E123 copiou o molde e o vermelho-antes veio do seed, não do assert. Consertar o 16 quando ele for tocado. **Fechada no E146** (`115f0dd`): o spec lê `usuarioId`. | ✅ E146 | execução E123 |
| S-D15 | **`{ error: "Lead not found" }` vive em 8 pontos de `routes/leads.ts`** (:81, :434, :459, :512, :550, :600, :680, :712) — a classe da S-D8/S-D11 (inglês no campo do código, sem `detalhe`), no arquivo que o E123 tocou. O 404 da rota nova do E123 já nasceu na régua (`REGISTRO_DE_COBRANCA_NAO_ENCONTRADO` + detalhe); os 8 vizinhos ficam para o épico que fechar a S-D11. **Fechada no E145** (`c16b758`). | ✅ E145 | execução E123 |
| S-D16 | **`orcamentos/[id].tsx:235` baixa a lista COMPLETA de contratos da loja para um único `find(c => c.orcamentoId === id)`** — 615.041 bytes medidos no banco de dev (518 contratos) só para alternar "Gerar/Ver contrato" quando o orçamento está APROVADO. Com o E124 a rota pagina, mas esta chamada segue sem página de propósito (o find precisa do acervo). Um `?orcamentoId=` no `GET /contratos` — a mesma classe do `?leadId=` do E62 — faz isso custar uma linha. **Fechada no E144** (`7a03e44`). | ✅ E144 | execução E124 |
| S-D19 | **`lote17-agenda-concorrencia` flakou duas vezes hoje com `expected [201, 409] got [201, 500]`** — a corrida de reservas sob carga devolve 500 onde o teste espera o 409 da segunda chamada. Passou no rerun imediato as duas vezes (3/3), então é a família dos "três flakes" que o E104 da rodada 6 deixou anotados — mas um 500 numa corrida real é um defeito de rota, não só de teste: vale investigar se a transação converte conflito em erro genérico. **Fechada no E143** (`d7c2b7b`): não era transação — era o deadlock 40P01 da checagem especulativa do EXCLUDE gist, fora do mapa do handler; medido 34/300 corridas. | ✅ E143 | execução E140 |
| ~~S-D18~~ | ~~**`SelectTrigger` fica em 36px no mobile** (`ui/select.tsx`, `h-9`) — o mesmo raciocínio que levou o Button `default` a `min-h-11 md:min-h-9` no E137 vale para ele (medido: os 2 únicos alvos <44px restantes de /atendimentos a 390px são SelectTriggers; todos os selects de filtro do app têm a mesma altura). As ABAS custom do tablist (E97/E130) medem ~37px — mesma classe. Fora do escopo dos achados E8/E9, que mediram Button; a mudança é uma palavra em cada primitivo.~~ **FECHADA em `3c463bb`, e a grafia que a nota do E137 prescreve estava errada.** `min-h-11 md:h-9` deixaria o **DESKTOP em 44px**, porque `min-h-11` sem prefixo vale em toda largura e `min-height` limita a altura usada — a correção do mobile teria engordado o desktop em silêncio. Entrou a grafia do próprio `button.tsx:39`, `min-h-11 md:min-h-9`, no `SelectTrigger` e nas duas abas escritas à mão; o único select denso recebeu `md:min-h-8` para devolver os 32px. Acima de 768px o diff é no-op medido classe a classe, e o E2E roda só Desktop Chrome. | 🔵 | execução E137 · onda 1 de 2026-08-06 |
| ~~S-D22~~ | ~~**O spec 48 vaza vestido e reserva a cada run:** `e2e/48-avaria-vira-parcela.spec.ts:37-49` cria vestido `AVA-${stamp}` e bloqueio no beforeAll, e o afterAll (linha 66) só limpa parcelas/contrato/lead. Mesma família S-D17, spec fora da lista do E146. **Medida em 2026-08-05, na faxina da S-A13: são 121 vestidos `AVA…` e 121 avarias no banco de dev** — de 63 avarias em 25/07 para 121 em dez dias, uma por run. A faxina não os alcança de propósito (têm bloqueio e avaria, e a guarda dela poupa peça com referência), então esta sobra é a única saída. **É a mesma sobra que a rodada 6 chama de S25** — quem fechar uma risca as duas, que é a lição da S-D28/S-A5.~~ **FECHADA em `3b71a43`, junto com a irmã da outra trilha e com a S27 — as três eram a MESMA linha.** O `afterAll` que a sobra diz faltar **existe desde `5a1e038`** e apagava na ORDEM errada: o lead saía primeiro e, como `bloqueio_vestidos.lead_id` é `SET NULL`, a reserva ficava órfã em vez de sair. Agora o vestido sai antes, e a cascata leva bloqueio e avaria. Medido antes: **131 órfãs, 129 vestidos `AVA-` num acervo de 511 (25%), 127 avarias somando R$ 44.450,00**, nenhuma cobrada — e a taxa de +1 por passada foi medida DENTRO da sessão (130 → 131 entre a leitura do dossiê e a migração). Depois da faxina e de uma passada COMPLETA do E2E: **0 órfãs, 0 `AVA-`, 0 avarias**. A guarda da faxina admitiu **129 de 129** no ensaio em leitura pura, e as 2 noivas `E2E Avaria` ficaram de pé porque cada uma tem contrato — contrato é história, não fixture. | 🟡 | execução E146 · onda 2 de 2026-08-06 |
| ~~S-D23~~ | ~~**`pnpm run typecheck` não cobre `e2e/`** — nenhum tsconfig inclui o diretório; erro de tipo em spec só aparece em runtime. Régua interina: `playwright test --list` (compila os 57 arquivos sem executar nada). Dar um tsconfig ao `e2e/` fecha a fresta. **CONFERIDA, e a régua interina NÃO EXISTE — a sobra está subvalorizada.** O Playwright 1.61.1 transpila com **Babel** (`playwright/lib/transform/babelBundle.js`), que **apaga** os tipos em vez de conferi-los: `--list` prova que os arquivos fazem parse e carregam, e **nada** sobre tipos — `page.click(42)` passaria verde. É verificação de sintaxe vestida de typecheck. Hoje `--list` sai limpo com **156 testes em 61 arquivos** (60 specs + `auth.setup.ts`; a sobra dizia 57), e **o número de erros de tipo em `e2e/` segue desconhecido**, que é precisamente a consequência da sobra. Achado de passagem na mesma linha do `package.json:10`: o filtro `--filter "./scripts"` é **no-op** — o pacote não tem script `typecheck` e o `--if-present` engole. [conferência de 2026-08-05](../2026-08-05-conferencia-de-sobras.md)~~ **FECHADA em `acdd9b3`, e a régua interina que a sobra prometia não existia.** `playwright test --list` não confere tipo por dois motivos: o Playwright transpila com **Babel, que apaga os tipos** (`page.click(42)` passaria verde), e o `--list` **nem roda sem `globalSetup`**, porque 55 dos 63 arquivos leem `e2e/.state.json` no topo do módulo. Nasce `e2e/tsconfig.json`, pendurado no `pnpm run typecheck` como `typecheck:e2e`: **63 arquivos entram no programa e dão 0 erro** — o número que a sobra dizia desconhecido. Conferido por fora enxertando `page.click(42)` numa chamada real: `e2e/01-auth.spec.ts(31,22): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'`. Colateral: 37 specs importam `drizzle-orm` e ele não estava declarado em lugar nenhum que alcance a raiz — o Playwright resolvia, `node` e `tsc` não. | 🟡 | execução E146 · onda 1 de 2026-08-06 |
| S-D24 | **O spec 19 muta estado do seed e não restaura:** `e2e/19-orcamento-teto.spec.ts:62` deixa o teto de orçamento do lead do seed em 100.000 — não é lixo crescente, mas é estado que outro spec pode herdar. | 🔵 | execução E146 |
| S-D25 | **As cabines de runs antigos do spec 18 são desativadas, nunca apagadas** (`e2e/18-agenda-grade.spec.ts:39-45`) — lixo legado `Cabine E2E {timestamp}` que nenhum spec reclama. O afterAll do E146 impede as novas; as velhas pedem uma limpeza única. **Confirmada em 2026-08-05: as 186 cabines continuam lá.** A faxina da S-A13 (`e2bb58b`) ficou de propósito em vestidos e atributos — cabine desativada não é peça sem referência, e a guarda dela não serve; esta limpeza precisa da própria, que saiba distinguir `Cabine E2E {timestamp}` de cabine de loja viva. | 🔵 | execução E146 |
| ~~S-D20~~ | ~~**O 404 de rota desconhecida responde `{ error: "Rota não encontrada" }`** (`api-server/src/app.ts:114`) — frase no campo do código, fora do alcance da varredura do E145 (que lê só `src/routes/`). `lote1-auth.test.ts:43` prega a frase.~~ **FECHADA em `4ea4fe2`**, junto com a S34 e a S-D21. O 404 de rota desconhecida é o único que o E145 não alcançou, e por um motivo estrutural: ele mora em `app.ts:114` e a varredura parava em `routes/`. Virou `ROTA_NAO_ENCONTRADA`, e a varredura passou a cobrir o servidor inteiro para que o próximo não escape pelo mesmo lugar. | 🔵 | execução E145 · onda 2 de 2026-08-06 |
| ~~S-D21~~ | ~~**Frases no campo do código em status ≠ 404:** `admin.ts:668` (410), `auth.ts:43` (401), `auth.ts:166` (403), `reservas.ts:445`, `vestidos.ts:160,479`, `financeiro.ts:445` (400s) — a varredura do E145 cobre só 404; estendê-la a 4xx exige tratar os `error: parsed.error.message` dos 400 de validação. `lote1-auth.test.ts:36,67` prega duas das frases.~~ **FECHADA em `4ea4fe2`.** A **S34 e a S-D21 são a MESMA linha** (`financeiro.ts:445`) em duas trilhas — terceira vez neste repositório, depois de S-D28/S-A5 e S25/S-D22. **A S-D21 lista 7 sites e existem 21**, medidos um a um: 18 por `res.status(4xx).json(` e 3 nos corpos `message` dos rate-limiters, que não passam por `res` nenhum; quatro das sete âncoras dela já não apontavam para a linha certa. **Os 13 que nenhuma das três viu são os que mais rodam** — 8 em `middlewares/auth.ts`, no caminho de toda requisição autenticada. A varredura do E145 parava em `routes/` e passou a varrer `src/`: **414 sites em 19 arquivos**, contra 117 em 20 rotas. **O custo que nenhuma mediu:** as quatro páginas públicas leem `data.error` como CHAVE, então a noiva que esbarrava no teto de requisições lia *"Link inválido — confira se ele veio inteiro do WhatsApp"* sobre um link perfeito — e **nenhuma das 1.038 provas de API nem dos 161 specs podia ver**, porque os três limitadores são pulados sob `VITEST` e `E2E_SUITE`. | 🟡 | execução E145 · onda 2 de 2026-08-06 |
| S-D17 | **14 specs do E2E criam recurso (lead, vestido, cabine, contrato…) e não têm `afterAll`** (levantamento por grep: 16, 17, 18, 19, 21, 24, 27, 28, 29, 30, 31, 35, 36, 37) — a família S18/S25. O spec 49 era o 15º e o único DETERMINISTICAMENTE explosivo (provas de 90 min acumulando no mesmo dia +6 da vendedora compartilhada saturaram o expediente na cadência de uma suíte por épico — 146/147 na primeira passada do E125); ganhou `afterAll` no próprio E125 porque bloqueava a regra 11. Os outros 14 vazam sem colidir (stamps únicos), mas são a fonte do acervo-lixo que a S25 mediu. Auditar e dar limpeza a cada um quando for tocado — ou de uma vez num épico de higiene de suíte. **Fechada no E146** (`115f0dd`): 14/14 com afterAll por id capturado, E2E 147 verde em duas passadas seguidas; o 48 vaza ainda (S-D22). | ✅ E146 | execução E125 |
| S-D26 | **Os dois perfis do banco de dev ainda guardam o formato PLANO antigo** — medido em `psql`: `perfil-admin` e `perfil-vendedora` têm `{"leads": true, …}`, não `{ver, criar, editar}`. `normalizarAcessos` (`api-server/src/lib/permissoes.ts:37`) faz a ponte e nada quebra, mas ela é para sempre enquanto ninguém migrar as duas linhas — e desde o E147 toda instalação NOVA nasce no formato módulo × ação, então o dev é o único lugar onde o formato velho vive. Um `UPDATE` de duas linhas fecha, com o cuidado do E56/E60 (mudar permissão derruba as sessões de quem tem aquele perfil). **CONFERIDA: o número está errado por 18×, e o conserto proposto NÃO FUNCIONA.** São **37 perfis planos de 40** (só `Proprietária`, `Recepção` e um `Perfil Teste` estão em módulo × ação), não dois. E "um `UPDATE` de duas linhas fecha" é falso porque a **fonte segue aberta**: `helpers.ts:64` cria dois perfis por execução da suíte com `acessosModulos: { leads: true, … }` — formato plano, escrito hoje —, então o UPDATE seria desfeito na próxima passada. Pior: o insert de `configuracao-inicial.ts:465-475` usa **`.onConflictDoNothing()`**, então rodar o seed num banco que já tem `perfil-admin` plano **nunca** o corrige. A tabela `perfis` é GLOBAL, então qualquer instalação que já passou pelo formato velho fica presa nele. [conferência de 2026-08-05](../2026-08-05-conferencia-de-sobras.md) | 🔵 | execução E147 |
| ~~S-D28~~ | **JÁ ESTAVA FECHADA, e a tabela não sabia.** Ela é a MESMA sobra que a arqueologia registrou como S-A5 e fechou em 2026-08-05 (`3cdaa83`), com a tabela das três trilhas; o ponteiro voltou a mudar no mesmo dia, ao a arqueologia fechar (`4a1da4c`), e hoje aponta para a rodada 6. Duas trilhas registraram o mesmo achado com números diferentes e só uma soube que ele fechou — é o custo de a mesma coisa ter dois nomes. O diagnóstico original: **O ponteiro do `CLAUDE.md` está uma rodada atrás:** ele manda ler `docs/revisao/2026-07-25-rodada-6/EXECUCAO.md` como "o rastreador da rodada em curso", e o em curso é o da rodada 7 (`2026-07-30-rodada-7-design/EXECUCAO.md`, onde esta linha mora). O próprio arquivo diz "se a rodada mudar, é aqui que o ponteiro muda" — e ele não mudou. Custo: a sessão nova lê o diário errado. Uma linha. | 🟡 | execução E147 |
| ~~S-D27~~ | ~~**`e2e/global-setup.ts:75` elege a loja MAIS ANTIGA do banco** para os 147 specs. O risco está escrito na proposta de 2026-07-28 (§5) desde antes da rodada 7 e nunca entrou nesta tabela: no dia em que alguém apagar a loja de 2026-07-06, a suíte inteira muda de alvo sozinha, e o sintoma não é um teste vermelho — é o seed estourando em `duplicate key`, como já aconteceu uma vez. Fixar a eleição por id é pequeno e toca os 147. **CONFERIDA, e o risco DEIXOU DE SER HIPOTÉTICO.** O critério segue "a mais antiga" (`global-setup.ts:75-79`; a eleição por ordem física já foi consertada, o critério não). Medido: 24 lojas, e o pódio é `Moscow Noivas SP` (2026-07-06) seguida de **`Loja Teste 214cda2c` (2026-07-21)** — a herdeira é lixo de fixture, e **20 das 24 lojas são `Loja Teste …` ou `Loja Vazia …`**. Apagar a loja de 06/07 redireciona a suíte inteira para uma loja abandonada, sem um único vermelho. Nem a faxina da S18 nem a da S-A13 tocaram em `lojas`. O `e2e/.state.json` guarda o id certo mas é ESCRITO pelo global-setup (`:283`), não lido — não é trava. Hoje são **156 testes em 60 arquivos**, não 147. [conferência de 2026-08-05](../2026-08-05-conferencia-de-sobras.md)~~ **FECHADA em `e01bff4`, e a premissa dela estava errada: ninguém apaga a loja pelo produto** — o E106 recusa com 409 `LOJA_COM_HISTORICO`, e a eleita tem 815 contratos e 1.300 noivas. O vetor real é `psql` à mão, um recriar do banco ou um restore. **Medido:** 25 lojas, **23 delas lixo de fixture (92%)**, todas candidatas, e a margem era ZERO — nenhuma loja é mais velha que a do seed, então qualquer linha anterior ganhava. A herdeira imediata tinha 0 vestidos, 0 noivas, 0 cabines. **O silêncio custa 16 dos 156:** 12 passam contra qualquer loja por desenho (o laço de 6 telas só afirma que o heading monta e que nenhuma `/api` dá ≥400 — lista vazia devolve `200 []`) e 4 viram `skipped` sem contrato; o único assert de "esta loja tem dados" é satisfeito por zero, porque a tela renderiza `{total || 0}`. E o id **já existia em código** (`configuracao-inicial.ts:342`): o conserto não tocou spec nenhum. Régua de regressão: o `.state.json` sai **byte a byte idêntico**. | 🟡 | consolidação G · onda 2 de 2026-08-06 |
| ~~S-D38~~ | ~~**A suíte E2E não sobe num banco virgem, e o conserto da S-D27 encosta nisso.** Num banco vazio o `global-setup.ts:47-54` roda o seed oficial, que cria o horário com id DERIVADO da loja (`configuracao-inicial.ts:533`, `idDe(loja.id, "horario")`, `onConflictDoNothing()` sem alvo). Cento e trinta linhas depois, `global-setup.ts:185-187` insere o horário DELE — id `e2e-regra-disp`, mesmo `loja_id` — com `onConflictDoUpdate({ target: id })`. A tabela tem **DUAS** restrições únicas, medidas em `pg_constraint`: `regra_disponibilidade_pkey (id)` e `regra_disponibilidade_loja_id_unique (loja_id)`. O `ON CONFLICT ("id")` não cobre a segunda, e o setup morre com `duplicate key value violates unique constraint "regra_disponibilidade_loja_id_unique"` antes de a suíte começar. **Não aparece hoje porque este banco é anterior ao E147** — há UMA linha em `regra_disponibilidade`, de id `e2e-regra-disp`, e a do seed nunca existiu aqui. O docblock de `:178-184` conhecia as duas restrições e escolheu o alvo `id` para outro caso. **Importa agora:** a mensagem de erro que a S-D27 acabou de escrever manda o operador rodar o seed, e num banco virgem esse caminho morre logo depois. Conserto de uma linha: `target: regraDisponibilidadeTable.lojaId`. Não confirmado por execução — a fila é serial e o banco é um só; o experimento é `createdb` descartável mais `drizzle-kit migrate`.~~ **FECHADA em `3185812`. O mecanismo estava certo, o conserto de uma linha estava errado — e as duas coisas foram medidas no banco descartável `sd38_virgem`** (schema por `pnpm --filter @workspace/db run push`, que é como o dev aplica; o `drizzle-kit migrate` da sobra não é o caminho deste repo). Reprodução do defeito: `23505 duplicate key value violates unique constraint "regra_disponibilidade_loja_id_unique"`, `Key (loja_id)=(84e539bd-…)`, logo depois de o seed rodar. **Trocar o alvo para `lojaId` só troca um 23505 pelo outro:** com a linha órfã `e2e-regra-disp` apontando para outra loja, o mesmo `INSERT` estoura em `regra_disponibilidade_pkey`, `Key (id)=(e2e-regra-disp)` — provado por SQL no mesmo banco. Os dois conflitos são reais e vivem em bancos diferentes, e `ON CONFLICT` aceita um alvo só: não existe conserto de uma linha. O setup passa a LER a regra da loja antes e a escolher o caminho, e os dois casos foram exercitados — banco virgem do zero termina com uma linha, o id do seed preservado; órfã apontando para `e2e-loja-b` termina reapontada. O ajuste passou a gravar os cinco campos em vez de só os dias. | 🟠 | onda 2 de 2026-08-06 (S-D27) |
| S-D39 | **`bloqueioId` é gravado no `.state.json` e nenhum spec o lê.** `global-setup.ts:280` grava `bloqueioId: "e2e-bloqueio-1"`, a interface `E2EState` (`helpers.ts:6-19`) **não declara o campo**, e os 59 specs não o usam — `23-prova-data-real` e `48-avaria-vira-parcela` criam bloqueios próprios. A fixture existe e serve ao `13-onda2-telas.spec.ts:52-60`, que a acha pelo NOME da noiva, não pelo id. Ou o campo entra na interface, ou sai do state. | 🔵 | onda 2 de 2026-08-06 (S-D27) |
| S-D40 | **O número da S-A12 envelheceu de novo, e o crescimento tem taxa.** A conferência de 05/08 mediu 180 cabines na loja do seed; hoje são **206** (de 216 no banco inteiro), e só **3** têm id derivado do seed (`84e539bd-…-cabine-{1,2,3}`) — as outras 203 são acúmulo de spec. As lojas de fixture passaram de 20 para **23**, em 25. A faxina da S18/S-A13 não toca `lojas` nem `cabines`: o crescimento é de **~26 cabines por semana**. Casa com a S-D25, que mede a mesma população por outro recorte. | 🔵 | onda 2 de 2026-08-06 (S-D27) |
| ~~S-D29~~ | **FECHADA em `042d1b5`, e o número diz o tamanho do buraco: dos 796 contratos do banco de dev, 796 não têm orçamento.** O E120 guardava o caminho que ninguém percorre. Sem orçamento a referência passa a ser quem REGISTRA (a sessão); com orçamento continua sendo quem o montou, que é a comparação mais forte. A linha da trilha passa a dizer contra o que se comparou (`referenciaOrigem: ORCAMENTO | SESSAO`) — sem isso, "de Ana para Bia" não distingue montar um orçamento de registrar um contrato. **E havia um teste fixando o silêncio como se fosse a regra** ("contrato sem orçamento não grava — não há com o que divergir"): ele virou os dois casos honestos. Vermelho antes: `expected [] to have a length of 1 but got +0`. Rótulo trocado nos dois lados. API 1026 → 1027 · E2E 156. O diagnóstico original: **O rastro de vendedora divergente do E120 tem porta dos fundos, e ela é de dinheiro.** `contratos.ts:471-472` só calcula `vendedoraDivergente` quando `vendedoraDoOrcamentoId` está preenchido, e ele só é lido dentro do `if (contratoData.orcamentoId)` de `:205` — enquanto `orcamentoId` **não** está no `required` do `ContratoInput` (`openapi.yaml:6148`). Um `POST /contratos` **sem orçamento** atribui a venda, e a comissão que ela soma por `contratos.vendedora_id`, a qualquer colega da loja com **zero linhas de auditoria**: o `CONTRATO_VENDEDORA_DIVERGENTE` de `:565` nunca dispara nesse caminho. O E120 fechou a porta da frente e a decisão da S-D4 foi registrada como se fechasse as duas. Nasceu da [conferência de 2026-08-05](../2026-08-05-conferencia-de-sobras.md). | ✅ | S-D4 · [conferência de 2026-08-05](../2026-08-05-conferencia-de-sobras.md) · `042d1b5` |
| S-D30 | **Catorze varreduras ainda enumeram pelo DISCO com `readdirSync`, e a pior é a que o METODO cita como caso exemplar da regra 22.** A onda 1 consertou três (`s28-assert-tautologico-unit`, `varredura-reguas`, `erros-regua-varredura`, todas passando a `arquivos-versionados.ts` com `git ls-files -z`); ficaram **seis no servidor e oito no frontend**. A prova de que a fresta é real: com `artifacts/moscow-noivas/src/tmp/copia.ts` no disco e fora do git (`.gitignore:5`), as sondas de HEAD reprovavam por um arquivo que não é do repositório. A `s36-gate-da-tela-unit.test.ts:36` e `:73` é a mais cara — é a varredura que o METODO apresenta como exemplar ("achou dois defeitos na primeira execução, um deles vivo num perfil PADRÃO: a Recepção via Criar reserva e levava 403") e enumera telas E rotas pelo disco, nas duas pontas. **Os oito do frontend não são escopo perdido, são decisão de dono:** consertá-los pede uma SEGUNDA cópia de `arquivos-versionados.ts` dentro de `artifacts/moscow-noivas`, porque não há pacote de utilitário de teste compartilhado — e "cópia correta continua sendo cópia" é a frase que a própria `varredura-reguas.test.ts:141` usa. Mesma família da S29. | 🟡 | onda 1 de 2026-08-06 (S-D7) |
| S-D31 | **Nenhuma varredura deste repositório tinha piso de população, e varredura sobre conjunto vazio aprova tudo em silêncio.** Se a enumeração devolver zero por qualquer motivo — pasta renomeada, âncora de `import.meta.dirname` apontando para onde um arquivo não está mais, um `git ls-files` que falhe — o `expect(ofensores).toEqual([])` fica VERDE por não ter olhado nada. É o modo de falha mais caro de uma sonda, e é a mesma família da S30: a sonda diz guardar um número e guarda outra coisa. A onda 1 pôs piso nas três que tocou (`> 200` arquivos de teste na da S28, `> 200` fontes na `varredura-reguas`, `> 100` sites de 404 na `erros-regua`). As outras catorze não têm. | 🟡 | onda 1 de 2026-08-06 (S-D7) |
| S-D32 | **Quatro números diferentes circulam como "os formatadores `Intl` do sistema", e nenhum diz seu recorte.** A S30 dizia **quinze**; a conferência de 2026-08-05 corrigiu para **17**; o registro da sessão de 2026-08-06 mediu **25** depois da faxina de worktree; e a conta que a sonda faz é **36** em código de aplicação (17 no passivo + 19 nos sete arquivos-régua, com `formatos.ts` sozinho em 10), ou **46** se a varredura contar testes e E2E. Não são erros: são recortes diferentes que ninguém nomeou. Enquanto o recorte não estiver escrito ao lado do número, qualquer um deles vira "o número de formatadores" na próxima leitura — e foi exatamente assim que a S30 nasceu dizendo quinze. | 🔵 | onda 1 de 2026-08-06 (S-D7) |
| S-D33 | **A `varredura-reguas.test.ts` pula do item 2 para o item 4 nos comentários de seção, e não há item 3.** O arquivo tem `// ─── 1. "hoje" no relógio de quem executa ───` (`:77`), `// ─── 2. dinheiro lido fora da régua pt-BR ───` (`:107`) e, em seguida, `// ─── 4. formatador declarado fora dos arquivos-régua ───` (`:142`). Ou uma das cinco assinaturas do E111 foi removida sem o comentário, ou a numeração nunca casou com o consolidado — e a numeração existe justamente para casar a sonda com o diagnóstico. **Ninguém mexeu de propósito:** renumerar sem saber qual era o 3 apaga a pergunta em vez de respondê-la. | 🔵 | onda 1 de 2026-08-06 (S-D7) |
| S-D34 | **O `Input` fica em 36px no mobile — a MESMA classe da S-D18, no primitivo que ninguém mediu.** `input.tsx:11` traz `h-9` cru, o defeito que o `SelectTrigger` acabou de perder em `3c463bb`. A medição do E137 não o pegou porque contava alvos por PAPEL clicável, e campo de texto também é alvo de dedo. O `textarea.tsx:12` já está certo (`min-h-[60px]`). O conserto é uma palavra, a mesma grafia `min-h-11 md:min-h-9` de `button.tsx:39`. Ficou fora da onda 1 por escopo de arquivo, não por mérito. | 🟡 | onda 1 de 2026-08-06 (S-D18) |
| S-D35 | **O `AlertaCaixa` é o TERCEIRO cartão que aparece de repente no topo do painel, e fica ACIMA dos dois que a S-D10 nomeia.** Ele faz `if (!data) return null` sobre a própria consulta (`alerta-caixa.tsx:31`) e é renderizado antes dos avisos (`dashboard.tsx:322`). O silêncio enquanto carrega é decisão explícita do E103 ("nada a dizer é nada na tela") e não se discute — mas o LUGAR dele não é reservado: quando o alerta existe, ele empurra a página inteira para baixo depois da pintura, que é exatamente o que os outros dois faziam até `3c463bb`. | 🟡 | onda 1 de 2026-08-06 (S-D10) |
| S-D36 | **A tela de perfis globais edita e não cria:** `POST /admin/perfis` existe no servidor (`admin.ts:230`) e o app tem ZERO usos de `useCreatePerfil` (`admin/perfis.tsx:31`). É o que torna o vazio da S-D9 um beco — a tela do superadmin lista, deixa editar cada linha e não tem por onde repor o que falta. Decisão de produto, não defeito de código, mas é a razão pela qual o vazio novo ficou sem botão. | 🔵 | onda 1 de 2026-08-06 (S-D9) |
| S-D37 | **A listagem de parcelas abertas embute o `Lead` INTEIRO em cada parcela, e a fila de cobrança usa três campos dele** (nome, whatsapp, leadId): `financeiro.ts:141` monta `with: { contrato: { with: { lead: true } } }`, `cobranca.ts:63` consome três. É por aqui que a **S-D13** fecha barato — basta a rota chamar o agregado `ultimoContatoPorLead` que `leads.ts:59-70` já tem — e é também tráfego que ninguém mediu: cada parcela aberta carrega um objeto de noiva completo. | 🔵 | onda 1 de 2026-08-06 (S-D13) |
| S-D41 | **O seed imprime "seg–sáb, 9h–19h" e grava domingo–sábado, 9h–20h.** `scripts/seed.ts:54` traz o literal `"seg–sáb, 9h–19h"` na linha "Horário de funcionamento" do resumo; o `HORARIO_PADRAO` que ele acabou de aplicar (`configuracao-inicial.ts:148-157`) diz `diasFuncionamento: [0,1,2,3,4,5,6]` e `atendimentoFechamentoHora: 20`. Conferido no banco descartável `sd38_virgem`: o seed imprimiu a frase e a linha gravada tem `[0,1,2,3,4,5,6]` e `20`. **Os dois números que a linha erra são exatamente os dois que a S-A8 mudou** depois de a dona responder — domingo com hora marcada e o expediente até as 20h —, e é essa linha que ela lê para conferir se o ateliê ficou configurado do jeito dela. O resumo é a única prova que o script dá; ele diz que domingo está fechado quando o sistema vai abrir. | 🟡 | onda 2 de 2026-08-06 (S-D38) |
| S-D42 | **A hora de fechamento do E2E é a que o banco tiver, e os dois bancos discordam.** A fixture de `global-setup.ts` grava cinco campos da regra e **não** grava `atendimentoFechamentoHora`: o banco de dev está com **19** (medido em `psql`, linha `e2e-regra-disp`) porque nasceu antes da S-A8, e um banco novo nasce com **20**, que é o default de hoje. O `18-agenda-grade.spec.ts:102` comenta "expediente padrão 9h–19h" e afirma só a presença de `09:00` e `18:30`, que existem nas duas configurações — então a divergência passa em verde nos dois bancos, e nada no repositório diz qual é o expediente que a suíte pretende testar. Ou a fixture fixa a hora, ou o spec para de afirmar um expediente que ele não escolheu. | 🔵 | onda 2 de 2026-08-06 (S-D38) |
| S-D43 | **Nenhuma suíte deste repositório exercita o caminho do banco VIRGEM, e é o único caminho que um ateliê novo percorre.** As três suítes rodam contra o banco de `DATABASE_URL`, que existe desde antes do E147; o `global-setup.ts:47-56` tem um ramo inteiro — "banco sem admin, roda o seed oficial" — que nenhum run executa. Foi ali que a S-D38 viveu, e ela só apareceu porque alguém montou o experimento à mão: `createdb` + `pnpm --filter @workspace/db run push` + o setup, três minutos. A régua que falta é essa sequência num script versionado, contra um banco descartável, afirmando que o setup termina sem erro — sem ela, todo defeito de primeira execução continua invisível até um cliente novo o encontrar. | 🟡 | onda 2 de 2026-08-06 (S-D38) |

## Passada de sobras — 2026-07-30, depois do merge

O dono escolheu executar as sobras que mais rendem antes de abrir a rodada
de código. Plano: `docs/propostas/2026-07-30-passada-de-sobras.md` · branch
`rodada-7-sobras` a partir de `5f1fc85` (o merge desta rodada em `main`).
A numeração segue de onde a rodada parou; os relatórios vivem em
`execucao/E14X.md` como os demais.

| Épico | O que resolve | Estado | Commit |
|---|---|---|---|
| E143 | S-D19: 40P01 da corrida no EXCLUDE gist entra no mapa — nunca mais 500 onde é "outra pessoa chegou primeiro" | ✅ | `d7c2b7b` |
| E144 | S-D16: `?orcamentoId=` no GET /contratos; a tela do orçamento para de baixar o acervo | ✅ | `7a03e44` |
| E145 | S-D11+S-D12+S-D15: os 84 sites fora da régua (76 "not found" + 8 frases pt) viram código+detalhe, com varredura | ✅ | `c16b758` |
| E146 | S-D17 (+S-D14): os 14 specs E2E que criam recurso ganham `afterAll`; E2E rodado em dobro como prova | ✅ | `115f0dd` |
| E147 | Pedido do dono: o seed deixa de ser fixture e vira a CONFIGURAÇÃO inicial de um ateliê — perfis, cabines, horário, catálogo, escada e recorrências, parametrizado e idempotente; sobra um passo, "cadastrar os primeiros vestidos" | ✅ | `f5653ae` |

## Encerramento — 2026-07-30

**A fila fechou: 23/23 épicos (E120–E142), todos ✅ com hash, working tree
limpo.** Suítes na saída: **API 852 → 875 · frontend 314 → 417 · E2E
137 → 147 · typecheck verde** — e a regra 11 valeu integralmente: cada épico
rodou o E2E completo antes do commit (três precisaram de mais de uma passada,
e os três vermelhos intermediários estão contados nos relatórios, não
escondidos). As 6 perguntas ao dono (P1–P6) foram decididas pelos defaults
conservadores escritos no backlog — reverter qualquer uma é barato e o lugar
está anotado no épico que a decidiu.

**O que fica desta rodada além do código:** 4 regras novas no METODO (13–16,
cada uma com o custo que a motivou), as réguas de UI com varredura no
`replit.md`, e **19 sobras** na tabela acima (S-D1–S-D19) — as mais caras:
os 14 specs E2E sem `afterAll` (S-D17), o flake [201,500] do lote17 que
pode ser defeito de rota (S-D19) e o `?orcamentoId=` do contrato (S-D16).
Nenhuma bloqueia nada.

**O que a rodada NÃO fez, por decisão registrada no topo:** as lentes de
código da R7 (traçador, arqueologia, custo de mudança) — ficam para a
próxima rodada. O merge de `rodada-7-design` → `main` (170 commits) é
decisão do dono.

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
- **E138 entregue** (`execucao/E138.md`). A passada de voz, com o regrep da
  primeira ação corrigindo três contagens envelhecidas (16 "é obrigatório",
  não 20 — o E134 levou os de vestidos; "lente" já zero — saiu no E124; 2
  "(s)", não 3). Num commit: "ateliê" (P4) nas 8 frases visíveis (2 ditas à
  noiva); sentence case nos rótulos e "CPF Cliente" → "CPF da noiva" (o único
  "cliente" num sistema que fala "noiva"); os 16 "é obrigatório" viraram
  imperativo-que-ensina; "← Financeiro" nas 4 voltas e "Auditoria" no h1 (o
  nome da porta); "anteriores" nas gêmeas; zero "(s)" (folha + o detalhe de
  `agenda.ts`, a única linha de servidor — E2E completo por ela, regra 11);
  "Remover este ajuste?" (o único AlertDialogTitle sem pergunta);
  "Escolha…" ×2 e o placeholder "5000" → "5.000,00" no campo de dinheiro
  mais digitado; a linha de propósito nas 5 telas mudas (uma frase, ponto
  final); e o login trocou "Acesso ao sistema" por "O ateliê abre por aqui."
  A regra 11 pagou o E2E em TRÊS passadas (144 → 146 → 147): specs 33/42
  afirmavam o h1 renomeado (classe 05-leads), e o spec 18 desmascarou um
  defeito REAL fora do épico — a colisão por retângulo do dnd-kit soltava o
  card na cabine VIZINHA no fio do meio (a margem mudou com a limpeza de
  cabines do E125); virou `pointerWithin`, uma linha comentada, no commit
  pelo precedente do spec-49/E125. **E o executor commitou antes de ler a
  suíte** — a primeira passada veio 144/147 com o commit já feito (o `tail
  -4` cortou a saída); o conserto foi emendar ANTES de registrar o hash, e a
  lição está no relatório. Suítes: API 873 · front 414 · E2E completo
  147/147 na passada final · typecheck verde. Nenhuma sobra nova.
- **E139 entregue** (`execucao/E139.md`). Fechar o mês virou roteiro na
  Folha: o mapa executado provou que os três estados saem de rotas
  EXISTENTES (as pendências de comissão do sino, as contas da janela que a
  tela já pede, o `pendentesEnvio` que ela já derivava) — nenhum agregado
  novo. A decisão de exibição é pura (`estadoDoPasso`, 3 testes): carregando
  não vira pendente (E121 no nascimento), erro é "sem resposta". No app
  vivo, os três estados distintos na mesma tela: ✓ comissões, "1 conta em
  aberto. Pagar →" (com a janela na URL — E129), "134 movimentos não
  enviados". Suítes: API 873 · front 414 → 417 · E2E completo 147/147 ·
  typecheck verde. Nenhuma sobra nova.
- **E140 entregue** (`execucao/E140.md`). O WhatsApp entrou no cadastro
  inline do combobox — um `Input type="tel"` opcional no único momento em
  que o número é grátis (a noiva está NO TELEFONE); preenchido vai no mesmo
  POST (o shape já aceitava), vazio nada trava, e a decisão F4 (origem
  obrigatória no mesmo clique) fica de pé. Medido de ponta a ponta: cadastro
  com "11 98888-0140" → lead no banco com o número (smoke removido em
  seguida). Suítes: API 873 · front 417 · E2E completo 147/147 · typecheck
  verde. Nenhuma sobra nova.
- **E141 entregue** (`execucao/E141.md`). ⌘K/Ctrl+K abre a busca de noivas
  de qualquer tela logada — a MESMA busca server-side das listas (nome,
  noivo, dígitos), Enter navega à ficha; gatilho visível ao lado do sino
  (sidebar e header mobile); mudo com foco em input (cuidado b) e gateado
  por `leads.ver` (cuidado c). O cuidado (a) medido: entrada 333,87 →
  335,08 kB (+0,38 kB gzip — o listener e dois botões); o diálogo é um chunk
  LAZY de 1,59 kB que só desce no primeiro ⌘K. O executor errou o
  `CommandDialog` pronto (não repassa `shouldFilter` — o cmdk filtrava
  os uuids contra o texto e a lista vinha vazia; o smoke pegou): cmdk sobre
  busca de servidor é sempre `shouldFilter={false}`, como o combobox já
  sabia. Entradas de navegação "de carona" cortadas sem culpa (o backlog
  permitia). Suítes: API 873 · front 417 · E2E completo 147/147 · typecheck
  verde. Nenhuma sobra nova.
- **E142 entregue** (`execucao/E142.md`) — **e com ele a fila dos 23 épicos
  FECHA: E120–E142, todos ✅ com hash.** O relatório de conversão aprendeu
  "e neste período?": o teste de duas épocas provou o vermelho em número
  (pedindo 30 dias, a época de 2024 vinha junto), `de`/`ate` entraram no
  contrato e o recorte por `createdAt` (dia local) vale para os DOIS
  agregados — numerador e denominador do mesmo período por construção; sem
  params, a história inteira, como sempre. A tela ganhou o seletor com o
  estado na URL (gramática do E129) e "Ver a história inteira". O executor
  quase perdeu o `openapi.yaml`: um `String.replace` com `$'` no texto
  de replacement duplicou 40.893 linhas em silêncio e o codegen apagou
  `generated/` ao falhar — restaurado do HEAD, refeito com replacer em
  FUNÇÃO; a regra operacional está no relatório. Suítes: API 873 → 875 ·
  front 417 · E2E completo 147/147 · typecheck verde. Nenhuma sobra nova.
