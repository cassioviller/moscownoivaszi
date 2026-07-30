# Consolidação G — o dia de hoje está pronto e as réguas são boas; a rodada achou aonde elas não chegaram

**Rodada 7 (design), sessão 1 — 2026-07-30** · branch `rodada-7-design`
Consolida: 6 trilhas (A–F) + passada adversarial · **58 achados** (0 🔴 ·
21 🟠 · 30 🟡 · 7 🔵, graus finais do adversarial) → **23 épicos**
(E120–E142) · rastreabilidade 100% na tabela do fim.

## A frase da rodada

**As réguas da rodada 6 venceram o caminho feliz do dia; o que a rodada 7
achou foi aonde elas não chegaram — a falha que fica muda, o acervo de 3 anos
que não se acha e a moldura do celular que esconde o botão do dia.**

As seis trilhas contam a mesma história por seis lentes: o miolo de cada
camada está certo E TEM NOME (`brl()` sem exceção nas 27 capturas, toda
mutação no `isPending`, a busca de noivas que acha por dígitos do telefone, a
voz "objeto + particípio" em 40+ toasts, os kanbans que arrastam com o delay
certo) — e quase todo achado é uma régua EXISTENTE que parou no meio do
caminho: `mensagemApi` chegou a 23 arquivos e faltaram 27; os 44px chegaram a
`sm`/`icon` e não ao `default`; a escala do dinheiro existe e o degrau de topo
está fora dela em 11 de 15 pontos; a paridade de rastro de cobrança foi
DESENHADA (o comentário F26 a afirma) e só existe de um lado. A rodada 6 disse
"o miolo está certo e as bordas não o usam"; a rodada 7 mede o mesmo padrão na
superfície: **o defeito dominante é adoção, não desenho** — e por isso 19 dos
23 épicos têm o molde pronto no próprio repo.

## Como consolidei

Li as seis trilhas e a adversarial commitadas em
`docs/revisao/2026-07-30-rodada-7-design/`, apliquei os três vereditos da
passada (A3 → 🟡; C4 com o número corrigido, 47 toasts em 27 arquivos; a nota
do D2 sobre `openapi.yaml:1243-1247`), conferi as decisões registradas citadas
(E99 parte 7, E100 parte 3 — nenhum épico as contraria) e agrupei por
**problema**, não por trilha: 58 achados viram 23 épicos, e os agrupamentos
que valem dinheiro estão nomeados abaixo. Critério de escopo: cada épico cabe
num commit e tem tema coeso; ordem por valor para quem usa (a rodada não tem
🔴, então os 🟠 de todo dia vão primeiro, começando pelo que mexe em dinheiro
e pelo 🟠 "mais perto de 🔴" que a adversarial apontou, o C2).

**Os agrupamentos (N achados de M trilhas → 1 épico):**

- **A4 + F5 são o MESMO achado** (Title Case; a A contou o slot do botão, a F
  contou os nove rótulos) e **A7 + F10 são o MESMO achado** (a linha de
  propósito ausente — as MESMAS 5 telas, lista por lista). Os dois pares, mais
  A6, F2, F3, F4, F6, F7 e F8, são uma única passada de strings → **E138**
  (11 achados, 2 trilhas).
- **D8 + E13 são o mesmo problema em duas viewports** (a parede de filtros de
  /vestidos; a E manda o teto valer também para a coluna) → **E135**.
- **B4 + C6 se tocam na mesma tela e no mesmo cenário** (a noiva no balcão e a
  tela de Receber que não busca nem explica a janela) e **D1 + D2** são a
  mesma pergunta ("cadê o registro recente?") em telas irmãs → **E124**
  (4 achados, 3 trilhas).
- **C4 + F1 são o mesmo toast em duas camadas** (o corpo que joga fora o
  `detalhe` e o título "Erro ao X") → **E122**.
- **B1 + B5 + B6 moram no mesmo arquivo e no mesmo fluxo**
  (`orcamentos/[id].tsx`: quem vendeu, qual o passo primário, o que
  pré-preencher) → **E120**.
- **B11 + E11 + F9 apontam o mesmo bolsão** (o módulo de cadastro de vestidos,
  pré-régua em voz, dinheiro e portas — a pista de consolidação da trilha F)
  → **E134** (3 achados, 3 trilhas).
- **E1 + E2 + E3 + E5 são a mesma classe de CSS** (fileira de flex sem quebra
  em 390px) → **E126**; **E4 + E7 + A5** são a mesma classe de token (cor
  semântica sem token e fora da varredura) → **E127**; **B8 + D9 + D10** são o
  mesmo arquivo (`dashboard.tsx`) → **E132**; **C1 + C2 + C3** são a mesma
  classe de estado (a tela afirma zero enquanto não sabe) → **E121**.

## Os épicos — E120 a E142, em ordem de valor

### E120 — O contrato nasce de quem vendeu, e o diálogo para de perguntar o que o orçamento já sabe · **M**
Fecha **B1 🟠, B5 🟠, B6 🟡** (tudo em `orcamentos/[id].tsx`). Select de
vendedora no diálogo "Gerar contrato" nascendo de `orcamento.vendedoraId` (o
dado já desce no GET), a ação primária trocando por estado (antes do aceite, a
primária é enviar à noiva — o padrão que o próprio cabeçalho já usa para
APROVADO) e `dataCasamento` pré-preenchida do lead. É o épico que mexe em
dinheiro: R$ 210,00 de comissão trocam de bolso num contrato de R$ 4.200,00 a
5%, na única porta que paga comissão (precedente E98/F12). **Decide a S-D4 no
mesmo commit**: se o servidor passa a exigir coerência com
`orcamento.vendedoraId` quando houver orçamento.

### E121 — A tela para de afirmar zero enquanto não sabe: carregando e erro na fila do dia, na conciliação e nos painéis · **M**
Fecha **C1 🟠, C2 🟠, C3 🟠**. O C2 é o 🟠 mais perto de 🔴 da rodada
(veredito da adversarial): a conciliação desenha "Bateu 0 · Só no banco 45"
com o lado do sistema ainda `undefined` e ENSINA a relançar dinheiro que
existe — vai primeiro dentro do épico. Molde pronto: `<Carregando>`/`<Erro>`
de `components/estado` e o precedente D7/E99 em `comissoes/index.tsx:577-598`.
Cobre também funil e permissões (mesma classe, C3).

### E122 — O erro mostra a frase que o servidor escreveu: `detalhe` no builder, `mensagemApi` nos 27 arquivos, um título só para a falha · **M**
Fecha **C4 🟠** (número final da adversarial: **47 toasts em 27 arquivos**) e
**F1 🟡** (76 "Erro ao X" contra a voz de 14). Dois movimentos:
`custom-fetch.ts:150-171` passa a ler `detalhe`, e cada toast troca
`err.message` por `mensagemApi(err, fallback)`. Leva a pista da F: os 14
fallbacks "Falha inesperada ao…" duplicados migram para o do `<Erro>` canônico.

### E123 — Cobrar deixa rastro pelas duas portas, e a fila marca o que já saiu · **M**
Fecha **B2 🟠, B3 🟠**. O WhatsApp de `/cobranca` carimba o
`registro-cobranca` no clique (a paridade que o comentário F26 afirma e o
código não cumpre — **corrigir a prosa de `mensagens/index.tsx:149-153`
junto**), e a fila de `/mensagens` ganha o desenho que a seção irmã já tem 20
linhas acima: a linha sai ao cobrar, com desfazer. 30 gestos por sexta-feira
de 10 inadimplentes deixam de existir.

### E124 — O que se procura se acha: busca, página e recentes-primeiro onde mora o volume de 3 anos · **G**
Fecha **D1 🟠, D2 🟠, B4 🟠, C6 🟡**. Contratos e orçamentos ganham busca +
página + `desc` no servidor (hoje o contrato da semana passada é o último de
~290 cards) e o card de orçamento passa a mostrar o valor; a lista de noivas
pede `ordem: "recentes"` (1 linha contra 33 cliques de "Próxima"); Receber
ganha busca por noiva e o vazio que nomeia a janela e oferece alargá-la. Notas
da adversarial: **atualizar o comentário de `openapi.yaml:1243-1247`** (a
única prosa que ainda defende antigos-primeiro, sem medida) e coordenar a
**S-D5** (a rota de orçamentos para de embutir `itens` da história inteira).
A decisão E99 parte 7 (/vestidos sem página) fica de pé — nada aqui a toca.

### E125 — A ficha responde o telefone: próxima prova e saldo devedor na tela de "quem ela é" · **M**
Fecha **D3 🟠, D4 🟠**. A ficha pede a agenda (a query recortada por `leadId`
já existe em outras telas) e o contrato desenha o aberto fora do diálogo de
cancelar (`somaCentavos(abertas, saldoAberto)` já está escrita em
`contratos/[id].tsx:162`). O portal já responde as duas perguntas à noiva; a
vendedora deixa de somar 7 parcelas de cabeça por ligação.

### E126 — A moldura cabe nos 390px: a fileira quebra e o botão do dia volta para a tela · **M**
Fecha **E1 🟠, E2 🟠, E3 🟠, E5 🟡**. `flex-wrap`/`min-w-0` no padrão (não só
nas 4 instâncias com captura): o header de Vestidos ("Novo Vestido" 100% fora
da tela), o `ResumoCard` (R$ 90.100,00 sem o último dígito — fecha receber,
pagar e folha num componente), o grupo de ações da Cobrança (o WhatsApp
invisível numa linha de ~560px para um card de ~326px) e a linha de Equipe.
Inclui matar a rolagem lateral da página (`overflow-x` do `<main>`).

### E127 — As cores semânticas ganham token e entram na varredura: `--primary-texto`, `--aviso`, e a fresta da linha fecha · **M**
Fecha **E4 🟠** (rosa como texto a 2,68:1 em 11 pontos, um deles o preço no
portal da noiva), **E7 🟡** (contador do sino branco sobre rosa, 2,79:1) e
**A5 🟡** (5 tons de âmbar em 3 telas, mais o verde/vermelho cru do backup).
O conserto do E4 já está desenhado desde o E92 (`--primary-texto: 350 30%
42%`, 6,48:1); o épico cria o token, migra os pontos e **fecha a fresta da
varredura por linha** (`escala-dinheiro.test.ts:62-64` não vê o par que o
prettier separou em `noiva-portal.tsx:404-405`). A auditoria das OUTRAS
varreduras de grep contra a mesma fresta vira sobra (S-D7).

### E128 — A confirmação de dinheiro diz o número certo: o RECEBIDO no estorno, o valor na remoção, a contagem na LGPD · **M**
Fecha **C5 🟠, C7 🟡**. As três `AlertDialog` fora da cláusula do texto do E10
(estorno de pagamento sem valor, estorno de contrato citando R$ 1.000,00 onde
o caixa perde R$ 300,00, remoção de conta sem valor) e o diálogo da LGPD
ganhando a contagem ANTES do clique. Molde: `receber.tsx:398-425`, que enuncia
a regra com o mesmo exemplo numérico. Leva de carona o asterisco órfão de
`contratos/[id].tsx:693` (pista B/F, mesma tela).

### E129 — O filtro sobrevive à navegação: as 6 telas de `useState` passam para a URL · **M**
Fecha **D5 🟠**. Atendimentos, noivas (inclusive a PÁGINA), orçamentos,
contratos, vestidos e conciliação entram na convenção que 13 telas do mesmo
app já seguem (`useSearchParams`). A ida-e-volta diária para de zerar 3 gestos
de filtro, e o link filtrado passa a viajar.

### E130 — O status ganha gramática: uma tabela semântica para o badge, e um primitivo por gesto de navegação · **M**
Fecha **A1 🟠, A3 🟡**. Uma tabela variante-por-semântica (em dia / em
andamento / terminou bem / terminou mal / inativo) morando num lugar só — o
movimento do E99 com a escala de dinheiro — mata as 6 combinações
contraditórias em 7 telas ("Faltou" deixa de ser o cinza de "Agendado" na
fila). O A3, no grau final 🟡, entra como a parte de primitivo: dentro de cada
gesto (alternar visão vs. navegar), um desenho só.

### E131 — O degrau maior do dinheiro entra na escala do dono nos 11 pontos que ficaram fora · **M**
Fecha **A2 🟠**. Adoção de `money-lg`/`money-md` nos 11 call-sites medidos
(dashboard sem nem `tabular-nums`, cobrança via `CardTitle` sans, fluxo,
minha-comissao com degrau inventado) e remoção dos 2 overrides de tamanho. O
mesmo R$ 39.688,00 deixa de mudar de cara a um clique. Respeita o cuidado (a)
do E99: adoção onde a divergência já custou, não reescrita dos 92.

### E132 — O painel responde: todo cartão navega, e a costureira ganha o dela · **M**
Fecha **B8 🟡, D9 🟡, D10 🟡** (tudo em `dashboard.tsx`). Os 4 contadores
ganham `Link` (hoje prometem clique com `hover-elevate` e não respondem),
"Hoje na loja" ganha a porta para a fila, e a 4ª persona do E66 ganha o cartão
de ajustes da semana (o padrão "some quando vazio" já existe em `:232-247`).
**Depois do E121** — mesmo arquivo, e clicável só faz sentido quando o zero de
falha não se disfarça de dado.

### E133 — O formulário avisa antes de perder: o hook existente nas 6 telas nuas · **P**
Fecha **B7 🟡**. `use-confirmar-saida` adotado em vestido-form (2 telas),
interesses (o formulário preenchido com a noiva falando), catálogo (2) e
atendimentos/config — uma linha por tela, cobre a metade do dano hoje. A
migração do roteador (`useBlocker`) segue sendo a sobra S13 da rodada 6.

### E134 — O módulo vestidos entra nas réguas de 2026: voz, dinheiro e uma porta de criação honesta · **M**
Fecha **B11 🟡, E11 🟡, F9 🔵** — o bolsão pré-E92 que 3 trilhas apontaram
(com F5/A4 e F8 levados pelo E138 nas strings que são só capitalização). Os 3
`type="number"` de dinheiro viram `inputMode="decimal"` (a regra está escrita
no próprio repo), os "com sucesso"/"..." saem, e a porta rápida declara o que
fica faltando (foto e características — as que casam vestido com noiva) com
caminho "completar agora".

### E135 — A parede de filtros ganha teto: os mais usados à mostra, o resto atrás de "mais filtros" — e colapsada no celular · **M**
Fecha **D8 🟡, E13 🟡**. O `atributosAtivos.map` sem teto vira "N mais usados
+ mais filtros"; abaixo de `md`, o bloco colapsa atrás de "Filtrar (N)". A
decisão E99 parte 7 continua de pé: o conserto é de layout, não paginação.
**Sequenciar com o E134** (mesmo arquivo `vestidos/index.tsx`), qualquer ordem.

### E136 — Teclado e leitor de tela alcançam o que o dedo alcança: `<form>` no dinheiro, "Reagendar…" sem arrasto, headings nos cards · **G**
Fecha **E6 🟡, E10 🟡, E12 🟡**. O financeiro ganha semântica de formulário
(Enter conclui — hoje 5 teclas onde a convenção é 1), os dois kanbans ganham o
fallback de diálogo que também serve o toque de pontaria difícil, e
`CardTitle` vira heading de verdade (52 arquivos deixam de ser planos para o
leitor de tela).

### E137 — A régua dos 44px fecha: os dois overrides de 24px caem e o `default` mobile é decidido com o dono · **P**
Fecha **E8 🟡, E9 🟡**. Os dois `className="h-6 w-6"` (o X do sino colado no
link, o do checklist de devolução) ganham alvo tocável, e a decisão adiada
pelo E92 (o `default` de 36px contra os 60 alvos medidos em Atendimentos) é
tomada de uma vez — o registro do E92 é adiamento, não recusa com medida.

### E138 — Uma passada de voz: uma grafia, uma capitalização, uma gramática de validação e a linha de propósito nas 5 telas mudas · **M**
Fecha **A4 🟡 + F5 🔵** (mesmo achado: Title Case, 9 rótulos + "CPF Cliente"),
**A7 🔵 + F10 🔵** (mesmo achado: a linha de propósito nas mesmas 5 telas,
mais o "Acesso ao sistema" do login), **A6 🟡** (a volta que chama /financeiro
de dois nomes e "Auditoria"/"Trilha de auditoria"), **F2 🟡** (validação:
imperativo que diz o conserto), **F3 🟡** (ateliê/atelier — 8 a 1 com o menu),
**F4 🟡** ("lente" fora dos documentos de revisão), **F6 🔵** (os 3 "(s)", um
vindo do servidor em `agenda.ts:420` — mexe na rota), **F7 🔵**
(anteriores/passadas + o título sem pergunta) e **F8 🔵**
(Escolha/Selecione + placeholder "5000"). Strings, um commit. **Depois do
E122**, que define o título da falha — esta passada não toca toast de erro.

### E139 — Fechar o mês vira roteiro: três passos numerados com estado na Folha · **M**
Fecha **B10 🟡**. O bloco "fechar o mês" (comissões fechadas? contas pagas?
enviado?) com links, na tela onde o F31/E103 já pôs a porta — os dados dos
três estados já estão nas queries dessas telas. Mata a ordem decorada de 5
visitas a 4 telas, uma vez por mês.

### E140 — O WhatsApp entra no cadastro inline, no único momento em que é grátis · **P**
Fecha **B9 🟡**. Um campo opcional no popover do `combobox-noiva` — o número
está na mão da recepcionista naquele segundo, e sem ele a confirmação das 48h
não sai. Não mexe na decisão F4 (a origem obrigatória fica como está).

### E141 — ⌘K: a busca de noivas a um atalho de qualquer tela · **M**
Fecha **D6 🟡**. O cmdk já está pago e buscando noivas dentro de formulários
(`combobox-noiva.tsx`); o épico o eleva a atalho global com a mesma busca
server-side. Multiplica o valor de E124/E125 (toda pergunta por pessoa deixa
de custar 3 cliques + digitação). Sem dependência dura; melhor depois do E124.

### E142 — O relatório de conversão aprende a pergunta "e neste período?" · **P**
Fecha **D7 🟡**. Parâmetro de período na rota (`leads.ts:197-225` hoje agrega
a história inteira) e o recorte na URL como os relatórios vizinhos — a
campanha do trimestre deixa de valer 15% do número que a tela mostra.

**Dependências explícitas:** E132 depois de E121 (mesmo `dashboard.tsx`, e
cartão clicável pressupõe zero honesto) · E138 depois de E122 (o título da
falha é do E122) · E134 e E135 em sequência entre si (mesmo
`vestidos/index.tsx`), ordem livre · E141 rende mais depois de E124. Todo o
resto é independente.

**Esforço somado:** 4 P · 17 M · 2 G (E124, E136).

## Rastreabilidade — 100% dos 58 achados

| Achado | Grau final | Resumo | Destino |
|---|---|---|---|
| A1 | 🟠 | Badge de status sem gramática (6 mapeamentos contraditórios em 7 telas) | **E130** |
| A2 | 🟠 | Degrau maior do dinheiro fora da escala em 11 de 15 pontos | **E131** |
| A3 | 🟡 (adversarial) | Dois gestos de navegação com dois desenhos cada | **E130** |
| A4 | 🟡 | Botão primário em duas capitalizações | **E138** (mesmo achado que F5) |
| A5 | 🟡 | Aviso sem token (5 tons em 3 telas; backup reinventa verde/vermelho) | **E127** |
| A6 | 🟡 | A volta ao pai com dois nomes para a mesma rota | **E138** |
| A7 | 🔵 | 5 telas sem a frase de propósito | **E138** (mesmo achado que F10) |
| B1 | 🟠 | Contrato nasce da vendedora que clicou; comissão lê o campo | **E120** |
| B2 | 🟠 | Cobrar por /cobranca não deixa rastro; /mensagens deixa | **E123** |
| B3 | 🟠 | A fila de cobrança não marca o que já saiu | **E123** |
| B4 | 🟠 | A parcela do balcão não se acha pelo nome; a antecipada nem está na tela | **E124** |
| B5 | 🟠 | O único botão colorido é o passo que a tela desaconselha | **E120** |
| B6 | 🟡 | O diálogo do contrato pergunta a data que a ficha sabe | **E120** |
| B7 | 🟡 | 8 telas de formulário perdem tudo no clique da sidebar (6 sem aviso) | **E133** |
| B8 | 🟡 | Metade dos cartões do painel é morta com cara de clicável | **E132** |
| B9 | 🟡 | O cadastro inline não pede o WhatsApp | **E140** |
| B10 | 🟡 | Fechar o mês: 5 visitas a 4 telas, ordem em lugar nenhum | **E139** |
| B11 | 🟡 | Duas portas de criação em Vestidos; a rápida cria peça invisível | **E134** |
| C1 | 🟠 | A fila do dia afirma "vazia" enquanto não sabe | **E121** |
| C2 | 🟠 | A conciliação desenha o veredito com o lado do sistema vazio | **E121** (primeiro do épico) |
| C3 | 🟠 | A falha vira "R$ 0,00" no painel; funil e permissões mudos | **E121** |
| C4 | 🟠 | 47 toasts em 27 arquivos mostram o protocolo (número da adversarial) | **E122** |
| C5 | 🟠 | Três confirmações de dinheiro fora da cláusula do E10 | **E128** |
| C6 | 🟡 | O vazio de filtro não nomeia a janela nem oferece saída | **E124** |
| C7 | 🟡 | A LGPD não conta quantas noivas antes do clique | **E128** |
| D1 | 🟠 | Contratos e orçamentos sem busca/página, mais antigo primeiro | **E124** |
| D2 | 🟠 | A lista de noivas abre nos leads de 2023 | **E124** (+ comentário do openapi) |
| D3 | 🟠 | A ficha não sabe quando é a próxima prova | **E125** |
| D4 | 🟠 | O saldo devedor só existe no diálogo de CANCELAR | **E125** |
| D5 | 🟠 | O filtro morre em qualquer navegação (6 telas em useState) | **E129** |
| D6 | 🟡 | Sem busca global/atalho; cmdk já pago | **E141** |
| D7 | 🟡 | Conversão soma a vida inteira; sem período | **E142** |
| D8 | 🟡 | Parede de filtros sem teto em /vestidos | **E135** |
| D9 | 🟡 | "Hoje na loja" sem caminho para a fila | **E132** |
| D10 | 🟡 | O painel cala para a costureira | **E132** |
| E1 | 🟠 | Fileiras sem quebra escondem o botão de criar (4 telas por captura) | **E126** |
| E2 | 🟠 | Totais de receber cortados na borda (ResumoCard) | **E126** |
| E3 | 🟠 | O WhatsApp da cobrança fora da tela em 390px | **E126** |
| E4 | 🟠 | Rosa como texto a 2,68:1 em 11 pontos (conta da adversarial) | **E127** |
| E5 | 🟡 | Equipe em 390px mostra 4–6 caracteres da identidade | **E126** |
| E6 | 🟡 | Enter não conclui nenhum fluxo de dinheiro (zero `<form>` no financeiro) | **E136** |
| E7 | 🟡 | Contador do sino branco sobre rosa (2,79:1) | **E127** |
| E8 | 🟡 | Dois alvos de 24px por override de className | **E137** |
| E9 | 🟡 | O botão `default` segue 36px no mobile (adiamento do E92, não recusa) | **E137** |
| E10 | 🟡 | Arrastar é a única porta de reagendar/mover etapa | **E136** |
| E11 | 🟡 | 3 campos de dinheiro em `type="number"` | **E134** |
| E12 | 🟡 | `CardTitle` é `<div>`; página plana para leitor de tela | **E136** |
| E13 | 🟡 | 390px: primeira dobra de /vestidos é 100% filtro | **E135** (mesmo problema que D8) |
| F1 | 🟡 | Cinco formulações para "falhou" (76 "Erro ao X") | **E122** |
| F2 | 🟡 | Validação em duas gramáticas (20 declarativas × 10 imperativas) | **E138** |
| F3 | 🟡 | "Ateliê" no menu × "atelier" em 8 frases | **E138** |
| F4 | 🟡 | "Lente" vazou para o vazio de /noivas | **E138** |
| F5 | 🔵 | Nove rótulos Title Case; "CPF Cliente" | **E138** (mesmo achado que A4) |
| F6 | 🔵 | O "(s)" em 3 frases, uma do servidor | **E138** (inclui `agenda.ts:420`) |
| F7 | 🔵 | "anteriores"/"passadas"; o único diálogo sem pergunta | **E138** |
| F8 | 🔵 | "Escolha"×"Selecione"; placeholder "5000" | **E138** |
| F9 | 🔵 | "com sucesso" e "..." concentrados no módulo vestidos | **E134** |
| F10 | 🔵 | 5 telas mudas + "Acesso ao sistema" no login | **E138** (mesmo achado que A7) |

Nada ficou fora: os 58 achados têm épico. As **pistas laterais** foram todas
assumidas por trilhas posteriores ou anotadas no épico que toca as mesmas
linhas (F26 → E123; os 14 fallbacks → E122; o asterisco órfão → E128; a
auditoria das varreduras de grep → sobra S-D7); as **sobras S-D1–S-D7** seguem
na tabela do rastreador — são trabalho fora do escopo de UX desta rodada, não
achados perdidos. As duas decisões registradas citadas (E99 parte 7, E100
parte 3) permanecem de pé em todos os épicos.
