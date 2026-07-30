# Trilha B — as jornadas de todo dia estão curtas; o que sobrou de caro é o sistema perguntando o que já sabe e calando o que acabou de fazer

As sete jornadas medidas cabem em poucos cliques — cadastrar e agendar uma
noiva nova custa 11 gestos sem beco nenhum, a costureira marca uma peça em 1
clique, receber uma parcela achada custa 2. O que resta não é distância: é o
fluxo cobrando conhecimento que o sistema tem (a vendedora do orçamento, a data
do casamento, o vencimento da parcela antecipada) e engolindo rastro que
acabou de produzir (a cobrança feita em `/cobranca` não se registra sozinha; a
fila de `/mensagens` não marca o que já saiu). E o botão mais colorido do
orçamento é exatamente o passo que a própria tela desaconselha.

**Método e ambiente.** Percorri pelo código as sete jornadas do escopo,
contando cliques: (1) noiva nova por telefone, (2) parcela no balcão, (3)
cobrança da semana, (4) orçamento→envio→contrato, (5) o dia da costureira, (6)
fechar o mês, (7) trocar foto de vestido. Arquivos lidos linha a linha (em
`artifacts/moscow-noivas/src/`): `layout/sidebar.tsx`, `cabecalho-detalhe.tsx`,
`noivas/nova.tsx`, `noivas/noiva-form.tsx`, `noivas/[leadId]/index.tsx`,
`noivas/[leadId]/interesses.tsx`, `atendimentos/novo.tsx`,
`atendimentos/index.tsx` (recorte), `combobox-noiva.tsx`,
`financeiro/receber.tsx`, `financeiro/cobranca.tsx`, `financeiro/fluxo.tsx`,
`financeiro/folha.tsx` (cabeçalho), `comissoes/index.tsx` (recorte),
`dialogo-receber-parcela.tsx`, `historico-contato.tsx`, `mensagens/index.tsx`,
`orcamentos/index.tsx`, `orcamentos/[id].tsx` inteiro, `ajustes/index.tsx`,
`dashboard.tsx`, `vestidos/index.tsx` (recorte), `vestidos/vestido-form.tsx`,
`vestidos/[id]/editar.tsx`, `hooks/use-confirmar-saida.ts` — mais
`lib/api-spec/openapi.yaml` e `api-server/src/routes/contratos.ts` onde o fluxo
atravessa a borda. Capturas lidas: `dashboard`, `financeiro-receber`,
`financeiro-cobranca`, `mensagens`, `orcamento-detalhe` (todas `--claro.png`,
viewport 1280×800, banco de dev — "80 mensagens prontas" e nomes `E2E *` são
artefato de fixture; locale desconhecida, e nenhum achado aqui depende dela).
Trilha anterior: A (assumi a pista das duas portas de criação em Vestidos, ver
B11).

**As contagens, jornada a jornada:**

1. **Noiva nova por telefone → agendada:** 11 cliques + 2 digitações pelo
   caminho curto (Agenda → Novo Agendamento → combobox: digitar nome → botão de
   origem cadastra inline → cabine ×2 → vendedora ×2 → data → slot → Agendar).
   Sem beco: reserva de prova nasce inline (E65), horário livre se oferece
   (E64). O furo é o WhatsApp que fica para trás (B9).
2. **Parcela no balcão:** 4 cliques quando a linha está na janela do mês
   (Financeiro → A receber → Receber → Registrar, com valor/data já
   preenchidos). Fora da janela, a linha **não existe na tela** e não há busca
   (B4).
3. **Cobrança da semana:** em `/mensagens`, 1 clique por noiva com rastro
   automático — mas sem marca do que já saiu (B3). Em `/cobranca`, 1 clique
   cobra e o rastro custa +3 gestos por noiva (B2).
4. **Orçamento → contrato:** criar da ficha é 1 clique; cada item ~4 gestos;
   prévia do carnê ao vivo. Enviar para a noiva custa 2 cliques num menu
   invisível enquanto "Aprovar" é o único botão colorido (B5); o contrato
   pergunta a data de casamento que a ficha sabe (B6) e grava a vendedora
   errada em silêncio (B1).
5. **O dia da costureira:** a fila abre já no recorte "esta semana", ordenada
   pelo prazo real (prova, senão casamento), e marcar uma peça é 1 clique na
   própria fila. A jornada mais bem servida do app.
6. **Fechar o mês:** 5 visitas a 4 telas (Comissões → Folha → Pagar → Folha →
   DRE), ordem escrita em lugar nenhum (B10).
7. **Trocar a foto de um vestido:** 5 cliques (Vestidos → busca → card →
   Editar → Trocar foto), salva na hora. Bem servida.

---

## B1 🟠 — Gerar contrato grava como vendedora QUEM CLICOU, sem campo nem aviso — e a comissão lê esse campo

**Código:** `src/pages/orcamentos/[id].tsx:595` — o `POST /contratos` envia
`vendedoraId: user!.id`, fixo; o diálogo "Gerar contrato"
(`[id].tsx:1058-1196`) tem CPF, forma, data e plano — **nenhum campo diz de
quem é a venda**. O orçamento sabe quem vendeu (`Orcamento.vendedoraId` é
obrigatório no contrato da API — `lib/api-spec/openapi.yaml:5324-5330`) e a
tela não o lê. O servidor aceita o corpo
(`api-server/src/routes/contratos.ts:149, 364`), e a comissão é somada por
`contratos.vendedora_id` (`api-server/src/lib/comissao.ts:238-279`; as FKs de
vendedora em `contratos` e `comissao_fechamentos` são a régua do E91).
**Captura:** `orcamento-detalhe--claro.png` — o diálogo sai deste botão.

O cenário: a vendedora Ana monta e envia o orçamento de R$ 4.200,00; a noiva
aceita à noite; de manhã a dona, com a noiva na loja, clica "Gerar contrato".
O contrato nasce da dona. Numa escada de 5%, **R$ 210,00 de comissão trocam de
bolso em silêncio**, e o erro só aparece semanas depois, no fechamento de
comissões — se aparecer. A rodada 6 nomeou exatamente esta classe e a fechou na
porta da agenda (E98/F12: *"`vendedoraId: user!.id` — quem estava logada virava
a responsável, sem perguntar… e a comissão lê esse campo"*,
`docs/revisao/2026-07-25-rodada-6/execucao/E98.md:170`); a porta do contrato —
a única que paga comissão diretamente — ficou com o mesmo defeito. O conserto
da tela é um select de vendedora no diálogo, nascendo em
`orcamento.vendedoraId` (o dado já desce no GET).

## B2 🟠 — Cobrar por `/cobranca` não deixa rastro sozinho; a MESMA cobrança em `/mensagens` deixa — e é `/cobranca` o destino do link "completa"

**Código:** `src/pages/financeiro/cobranca.tsx:151-160` — o botão WhatsApp da
linha abre o wa.me e **não registra nada** (nenhum `onClick` além do href; o
único caminho de registro na tela é o formulário manual do
`historico-contato.tsx:127-160`). Em `/mensagens`, o mesmo gesto carimba um
`registro-cobranca` no próprio clique (`src/pages/mensagens/index.tsx:416-426`,
F26/E97) — e o comentário dessa correção
(`mensagens/index.tsx:149-153`) afirma uma paridade que hoje não existe.
**Capturas:** `financeiro-cobranca--claro.png` (Receber · Contrato · WhatsApp,
sem registro) vs `mensagens--claro.png`.

O custo é diário e duplo. Primeiro, gestos: registrar o contato em `/cobranca`
custa **+3 por noiva** (expandir "Histórico" → observação → "Registrar
contato"); numa sexta-feira com 10 noivas em atraso são 30 gestos que a porta
irmã faz de graça. Segundo, dado: quem pula o registro deixa a noiva cobrada
constando como parada — o registro é o que zera o relógio do "parado há N dias"
(`historico-contato.tsx:27-28`), então ela reaparece como lead frio no
dashboard no dia seguinte à cobrança. E a fila do dia manda a pessoa para cá:
"Ver a cobrança completa" (`mensagens/index.tsx:377-383`) é o link de quem tem
mais de meia dúzia para cobrar. Duas portas, o mesmo ato, rastros diferentes.

## B3 🟠 — A fila de cobrança de `/mensagens` não marca o que já saiu — a seção irmã, na mesma tela, marca e tem desfazer

**Código:** `src/pages/mensagens/index.tsx:390-434` — a lista "Lembrar de um
valor em aberto" desenha cada inadimplente igual antes e depois do clique: o
`registrarCobranca` grava no banco e o `enviadas` (`:159-179`) evita duplicata,
mas **nada muda na tela** — sem risco, sem selo, sem seção "já cobradas hoje".
Vinte linhas acima, "Procurar para confirmar" remove a linha ao clicar e ainda
oferece o desfazer "Não procurei" (`:302-317`, `:332-363`).
**Captura:** `mensagens--claro.png` — as duas seções lado a lado (o "80
mensagens" do topo é resíduo de fixture; o mecanismo é o de produção).

O cenário: a recepcionista desce a fila — a tela pede isso em prosa: *"Desça a
fila clicando"* (`:202`) — manda 6 cobranças, o telefone toca, ela volta e a
lista está idêntica. Onde parou mora só na memória dela; a linha 7 e a linha 5
têm a mesma cara. O custo é reler a lista a cada interrupção ou cobrar a mesma
noiva duas vezes no WhatsApp (o dedup protege o banco, não a conversa). O
desenho que falta já existe 20 linhas acima, no mesmo arquivo.

## B4 🟠 — A noiva veio pagar no balcão e a parcela dela não se acha pelo nome — e a antecipada nem está na tela

**Código:** `src/pages/financeiro/receber.tsx:236-276` — os únicos controles
são De/Até e os quatro filtros de status; a lista sai ordenada por vencimento
(`:172`). Não há busca por noiva. A janela padrão é o mês corrente
(`resolverIntervalo`, `:96`), então a parcela que vence no mês que vem — o caso
clássico de quem aparece no balcão querendo adiantar — **não existe na tela**
até alguém ajustar dois campos de data, o que exige saber o vencimento de
cabeça. **Captura:** `financeiro-receber--claro.png` — cabeçalho com datas,
pills e nenhum campo de busca.

O caminho que sempre funciona existe e ninguém o ensina: Noivas → busca (server,
`noivas/index.tsx:130`) → ficha → contrato → Receber — 5 cliques + digitação, e
o E3/E98 já pôs o nome da noiva em cada linha desta tela justamente porque "a
tela mais trabalhosa do sistema" era anônima. A metade que falta é a busca:
com 3 anos de loja e dezenas de parcelas vencendo por mês, achar a linha da
pessoa que está na sua frente é a operação nº 1 desta tela, e hoje ela é feita
com o olho. (O mecanismo de busca é pauta da trilha D; o custo de jornada é
daqui.)

## B5 🟠 — O único botão colorido do orçamento em rascunho é "Aprovar" — o passo que a própria tela desaconselha; enviar para a noiva mora atrás do "…"

**Captura:** `orcamento-detalhe--claro.png` — chip "Sem aceite da noiva" ao
lado do título e, na mesma linha, o botão primário rosa "Aprovar".
**Código:** `src/pages/orcamentos/[id].tsx:688-692` — em RASCUNHO/ENVIADO a
`acaoPrimaria` é Aprovar; "Link para a noiva" e "Marcar como enviado" estão nas
`acoes` do dropdown (`:694-711`). E o próprio diálogo de aprovar avisa, em
vermelho: *"Ao aprovar agora, o botão de aceite some do portal dela — você fica
sem a prova digital"* (`:742-748`, F19/E74).

O fluxo que o produto quer (E74/E75: enviar → noiva aceita → aprovar → contrato)
custa 2 cliques num menu de ícone sem rótulo; o atalho que queima o aceite
custa 1 clique no único botão com cor. A vendedora que acabou de montar os
itens e quer "mandar para a noiva" varre a tela e a única ação visível é
Aprovar — o F19 pôs o aviso certo dentro do diálogo, mas o aviso é a rede, não
o corrimão. Trocar a primária por estado resolve: em RASCUNHO/ENVIADO sem
aceite, a primária é o link/envio; Aprovar sobe a primária quando o aceite
existe (o mesmo padrão que a tela já usa para APROVADO → "Gerar/Ver contrato",
`:674-687`).

## B6 🟡 — O diálogo do contrato pergunta a data do casamento que a ficha já sabe

**Código:** `src/pages/orcamentos/[id].tsx:300` — `dataCasamento: ""` nos
defaults do formulário; o campo é pedido em `:1128-1140`. O lead completo já
está em memória nessa hora (`leadCompleto`, `:212-217`), com `casamentoData`
preenchida desde o cadastro. O padrão de pré-preencher com esse mesmo dado já
existe no repo: a reserva inline usa `leadQ.data?.casamentoData` como valor do
campo (`src/pages/atendimentos/novo.tsx:227-229`).

O custo tem duas formas: redigitar uma data que o sistema mostrou na tela
anterior, ou — pior, porque o campo é opcional — pular e gerar contrato sem
data de casamento, em silêncio. É um `defaultValues` lendo
`lead?.casamentoData` quando o diálogo abre.

## B7 🟡 — S13 medido: 8 telas de formulário perdem tudo no clique da sidebar; 6 delas nem o aviso barato têm

A causa é conhecida e fica quieta (S13 da rodada 6: `useBlocker` não existe com
`BrowserRouter`; `use-confirmar-saida.ts:31-42` cobre só fechar/recarregar a
aba). O que esta trilha mede é a exposição:

- **Meio-protegidas (só contra fechar/recarregar; sidebar descarta em
  silêncio):** `noivas/noiva-form.tsx:101` (8 campos) e
  `atendimentos/novo.tsx:165` (8 campos + grade de slots).
- **Sem proteção nenhuma, nem o `beforeunload` que já existe pronto:**
  `vestidos/novo.tsx` e `vestidos/[id]/editar.tsx` (via
  `vestido-form.tsx` — 7 campos + uma seleção por atributo do catálogo),
  `noivas/[leadId]/interesses.tsx:118-125` (catálogo inteiro + 3 campos — o
  formulário preenchido **durante o atendimento**, com a noiva falando),
  `catalogo/novo.tsx` (12 campos), `catalogo/[atributoId]/editar.tsx` (10),
  `atendimentos/config.tsx`.

O pior caso concreto: a vendedora anota os interesses da noiva na conversa —
uma seleção por atributo ativo mais teto e observações —, clica em "Noivas" na
sidebar para conferir outra coisa, e volta para o formulário zerado; nada
avisou. Adotar o hook existente nas 6 telas nuas é uma linha por tela e cobre a
metade do dano hoje; a migração do roteador continua sendo a sobra S13.

## B8 🟡 — Metade dos cartões do painel navega e metade é morta — com a mesma cara

**Captura:** `dashboard--claro.png` — "Noivas ativas 851", "Atendimentos hoje
3", "Orçamentos abertos 0", "Contratos fechados 216" em cima; "A receber" e "A
pagar" logo abaixo, visualmente idênticos. **Código:**
`src/pages/dashboard.tsx:250-300` — os quatro contadores não têm `Link` (têm
até `hover-elevate`, que promete clique); `:306` e `:321` — os dois de dinheiro
têm. O card de comissão também navega (`:341`).

A dona vê "Atendimentos hoje 3", clica, nada acontece; o mesmo gesto dois
centímetros abaixo abre Contas a receber. Cada contador tem destino óbvio
(noivas, atendimentos, orçamentos, contratos) — é um `Link` por card, e o
painel inteiro passa a responder ao clique da mesma forma.

## B9 🟡 — O cadastro inline não pede o WhatsApp — e a jornada "chegou por telefone" termina numa confirmação que não dá para enviar

**Código:** `src/components/combobox-noiva.tsx:126-131` — o cadastro no clique
manda só `noivaNome` + `origem` (decisão F4, correta para a origem; o telefone
ficou de fora). Na mesma jornada, o toast pós-agendamento só oferece "mandar a
confirmação?" quando há WhatsApp (`src/pages/atendimentos/novo.tsx:341-356`),
e a fila do dia degrada para o lápis "Sem WhatsApp"
(`mensagens/index.tsx:320`; a captura `mensagens--claro.png` mostra a fila
inteira nesse estado — fixture, mas o mecanismo é esse).

O cenário é o da jornada 1 ao pé da letra: a noiva está **no telefone** — o
número está na mão da recepcionista naquele segundo — e o fluxo rápido o deixa
para depois ("Complete a ficha depois", `combobox-noiva.tsx:142`). Completar
custa +5 gestos noutra hora (Noivas → busca → ficha → Editar dados → salvar), e
"depois" compete com a loja cheia: a confirmação das próximas 48h sai sem link
ou não sai. Um campo opcional de WhatsApp no popover do cadastro inline captura
o dado no único momento em que ele é grátis.

## B10 🟡 — Fechar o mês continua sendo 5 visitas a 4 telas com a ordem em lugar nenhum

**Código:** o próprio repo admite —
`src/components/layout/sidebar.tsx:79-83`: *"Fechar o mês são oito telas sem
ordem declarada, e a que a loja mais precisa achar era a escondida"* (F31/E103,
que consertou só a porta da Folha). A sequência que funciona: Comissões →
"Fechar competência" (`comissoes/index.tsx:571`) para a comissão virar conta a
pagar; Folha → gerar salários (`folha.tsx:1-13`); Pagar → pagar as contas;
Folha de novo → baixar CSV e "marcar como enviado"; DRE para conferir. O hub
`/financeiro` lista os destinos sem ordem (`fluxo.tsx:153-174`), e Comissões
mora fora dele.

Quem fecha é a dona, uma vez por mês — frequência baixa demais para decorar e
alta demais para redescobrir. Se comissão fecha depois do CSV, a conta dela sai
no envio seguinte (o `isNull(enviadoContabilidadeEm)` segura a correção — por
isso é 🟡, não 🟠: a ordem errada custa confusão e retrabalho, não dinheiro).
Um bloco "fechar o mês" na Folha — três linhas numeradas com links e o estado
de cada passo (comissões fechadas? contas pagas? enviado?) — mataria a
memorização; os dados dos três estados já estão nas queries dessas telas.

## B11 🟡 — Vestidos tem duas portas de criação lado a lado, e a rápida cria a peça que as indicações não acham

(Pista da trilha A, assumida.) **Código:**
`src/pages/vestidos/index.tsx:301-313` — "Novo vestido (completo)" (página) e
"Novo Vestido" (dialog) dividem o mesmo cabeçalho sem nada que diga quando usar
qual. A diferença não é só conforto: o dialog não tem fotos nem características
do catálogo (`:318` em diante — código, preço, nome e básicos), e são as
características que casam vestido com interesse da noiva
(`vestido-form.tsx:119-141`: *"usadas para indicar este vestido às noivas"*).
Quem usa sempre a porta rápida — a de botão primário — povoa o acervo com peças
invisíveis para a curadoria, e a foto/atributos ficam devendo uma segunda visita
de edição que nada agenda. Ou a porta rápida declara o que fica faltando (e
aponta "completar agora"), ou vira uma porta só.

---

## O que está BEM — não mexer

1. **A corrente da jornada 1 fechou de ponta a ponta na rodada 6 e está
   sólida:** ficha → "Agendar atendimento" com `?noiva=`
   (`noivas/[leadId]/index.tsx:270-277` + `atendimentos/novo.tsx:120-127`),
   volta contextual `← Agenda?dia=` (`novo.tsx:392-398`), reserva de prova
   nascendo inline (`novo.tsx:213-260`, E65) e a grade que oferece só horário
   livre (E64). 11 cliques, zero becos.
2. **O cadastro inline com a origem no mesmo clique**
   (`combobox-noiva.tsx:126-151`, F4) — a pergunta impossível de pular sem
   default silencioso. B9 pede um campo a mais, não outro desenho.
3. **`DialogoReceberParcela` é o melhor formulário do app**
   (`dialogo-receber-parcela.tsx:93-98`): saldo — não o previsto — já no campo,
   hoje na data, `inputMode="decimal"`, e a corrida de dois caixas tratada com
   frase própria (`:57-62`). Receber, achada a linha, são 2 cliques.
4. **Receber sem sair da cobrança** (`cobranca.tsx:141-150, 234-245`, F28): a
   parcela mais antiga escolhida sozinha, o mesmo diálogo compartilhado.
5. **"Procurar para confirmar" é o desenho de fila certo**
   (`mensagens/index.tsx:302-317, 332-363`): carimba no clique, a linha sai,
   "Não procurei" desfaz. É o molde para B3, não algo a mexer.
6. **A prévia do carnê é o mesmo array que o POST envia**
   (`orcamentos/[id].tsx:144-188, 303-347`, F16/E95) — a noiva pergunta "quanto
   por mês?" e a resposta está na tela antes do contrato existir.
7. **A fila da costureira** (`ajustes/index.tsx:81-99, 195-218`): recorte
   "esta semana" por padrão, prazo real (prova > casamento) mandando na ordem,
   checklist interativo na própria fila e o vazio que conta quantos ajustes há
   mais adiante. Jornada 5 inteira em 1 clique por peça.
8. **A sidebar serve as jornadas:** 5 grupos/18 itens espelham os gates do
   backend, "Mensagens de hoje" tem gate de OU para quem só vê financeiro
   (`sidebar.tsx:37-46`, F9), a Folha está no menu (F31) e nenhuma tarefa
   diária está a mais de 1 clique do seu grupo. Não achatar nem reagrupar.
9. **O "próximo passo" da ficha** (`noivas/[leadId]/index.tsx:292-311`, F5):
   uma frase e um botão em vez de oito cards para ler — e some quando não há o
   que fazer.
10. **Editar vestido salva a foto na hora, fora do submit**
    (`vestidos/[id]/editar.tsx:97-113`): a jornada 7 não tem estado
    intermediário para perder.

## Pistas laterais — de outras trilhas

- **(F/C — a régua do erro não chegou na metade do app):** 53 toasts em 31
  arquivos de `pages/` ainda mostram `err.message` cru em vez de
  `mensagemApi()` (ex.: `noivas/nova.tsx:44`, `noivas/[leadId]/index.tsx:135`,
  `atendimentos/novo.tsx:362`) — a régua do E92 (`lib/erro-api.ts`) existe e a
  vendedora segue lendo `HTTP 404 Not Found` nessas telas. Medido por grep;
  trilha F confere frase a frase.
- **(E — dinheiro em `type="number"`):** 3 campos de dinheiro violam a regra
  escrita no próprio repo (*"Nunca type=number para dinheiro"*,
  `dialogo-receber-parcela.tsx:147-149`): `vestido-form.tsx:98` e
  `vestidos/index.tsx:343` (preço do vestido), `interesses.tsx:214` (teto). No
  celular sobe QWERTY e a roleta do scroll muda o valor.
- **(D — a lista de orçamentos não mostra valor):**
  `orcamentos/index.tsx:231-249` — cada card traz nome, data e status; para
  achar "o orçamento de R$ 8 mil" abre-se um por um. O total já é calculável
  dos itens que o GET traz.
- **(C — o comentário F26 afirma o que o código não faz mais):**
  `mensagens/index.tsx:149-153` diz que `/financeiro/cobranca` "já gravava um
  registro-cobranca" — hoje só grava pelo formulário manual (ver B2); quem for
  mexer ali precisa corrigir a prosa junto.
- **(D — "Hoje na loja" não linka a fila):** o card do dashboard
  (`dashboard.tsx:363-370`) lista os atendimentos mas não tem caminho para
  `/atendimentos`; o link só aparece no estado vazio (`:383`).
