# Trilha D — a informação do DIA está bem servida; o ACERVO de 3 anos não se acha, e a resposta que a noiva pede ao telefone não mora na ficha

**Rodada 7 (design), sessão 1 — 2026-07-30** · branch `rodada-7-design`

Método: parti do mapa da trilha D no `inventario.md` §4 (8 buscas, 13 filtros
na URL, 9 que morrem no F5, paginação em 2 listagens, 6 telas sem filtro) e
julguei tela a tela lendo o código que desenha cada listagem
(`noivas/index.tsx`, `contratos/index.tsx`, `orcamentos/index.tsx`,
`atendimentos/index.tsx`, `vestidos/index.tsx`, `mensagens/index.tsx`,
`financeiro/receber.tsx`, `financeiro/conciliacao.tsx`, `dashboard.tsx`,
`noivas/[leadId]/index.tsx`, `contratos/[id].tsx`, `provas/index.tsx`,
`ajustes/index.tsx`, `sidebar.tsx`) e as rotas que as servem
(`api-server/src/routes/leads.ts`, `contratos.ts`, `orcamentos.ts`). Capturas
consultadas: `dashboard`, `noivas`, `noivas-ficha`, `vestidos`, `contratos`,
`orcamentos`, `atendimentos`, `mensagens`, `financeiro-receber` (variante
`--claro`, viewport 1280×800; locale desconhecida — `capturas/AMBIENTE.md`).
Contagens e nomes das capturas (`851 noivas`, `E2E Noiva Playwright`,
`Decote 1784…`) são artefato do banco de dev; o que julguei foi o MECANISMO,
com a lente de escala declarada nos cenários: uma loja de 3 anos, ~8 contratos
por mês (~290 contratos), ~800 leads.

Duas decisões registradas foram respeitadas: o E99 parte 7 recusou paginar
`/vestidos` com medida (o filtro de 533 em memória é instantâneo — o achado D8
é sobre a LINHA DE FILTROS, não sobre o volume), e o sino do portal foi
recusado no E100 parte 3 (nada aqui o contraria).

## D1 🟠 — Contratos e orçamentos não se acham: sem busca, sem página, e o mais antigo vem primeiro

**Âncoras:** `artifacts/moscow-noivas/src/pages/contratos/index.tsx:29`
(baixa a loja inteira), `:17-21` e `:33` (o único filtro é status, em
memória); `artifacts/api-server/src/routes/contratos.ts:117`
(`orderBy: contratosTable.fechadoEm` — ascendente, o mais antigo primeiro);
`artifacts/moscow-noivas/src/pages/orcamentos/index.tsx:64` e `:80-83` (idem,
filtro só por situação), `:231-249` (o card mostra nome, data e status — **não
mostra o valor**); `artifacts/api-server/src/routes/orcamentos.ts:130`
(`orderBy: orcamentosTable.createdAt`, ascendente). Capturas:
`capturas/contratos--claro.png` e `capturas/orcamentos--claro.png` — nas duas,
o topo da lista é o registro mais ANTIGO (contratos fechados em 10/01 antes
dos demais; orçamento de 07/07 acima do de 21/07), e sete cards de orçamento
idênticos se distinguem apenas pela data de criação.

**Cenário:** a dona quer o contrato da Mariana, fechado semana passada.
`/contratos` não tem campo de busca; com ~290 contratos em 3 anos (8/mês), o
dela é um dos ÚLTIMOS cards — a ordem ascendente põe o passado em cima, então
o contrato de que se precisa hoje exige rolar a lista inteira (~290 cards ×
~100 px ≈ 29.000 px) ou Ctrl+F do navegador, que ninguém ensinou. O caminho
que funciona é dar a volta: Noivas → buscar "Mariana" → ficha → card
Contratos → clicar — 4 gestos mais a digitação, para uma tela cujo nome é
exatamente "Contratos". Em `/orcamentos` é pior: além de não haver busca, o
card não diz o valor — "o orçamento de R$ 8 mil" (pista da trilha B, assumida
aqui) só se acha abrindo um por um, e desde o E115 renegociar É criar novo
orçamento, então uma noiva com 2-3 versões é o caso normal, não a exceção. O
contraste está a uma tela de distância: `/noivas` busca no servidor por nome,
noivo e dígitos do telefone, com paginação (`leads.ts:120-133,151-155`).

**Número:** 2 telas comerciais × 0 campos de busca × 0 páginas; o registro
mais recente — o mais provável de ser procurado — é o último da rolagem nas
duas.

## D2 🟠 — A lista de noivas abre nos leads mais antigos: o default é `antigos` e a tela não pede outra ordem

**Âncoras:** `artifacts/moscow-noivas/src/pages/noivas/index.tsx:68-76` (os
params são `q`/`etapa`/`pagina`/`porPagina` — `ordem` não é passado);
`lib/api-spec/openapi.yaml:1251` (`enum: [antigos, recentes], default:
antigos`); `artifacts/api-server/src/routes/leads.ts:151-155` (o `desc` só
com `ordem === "recentes"`). Os dois irmãos pedem certo:
`noivas/funil.tsx:244` e `components/combobox-noiva.tsx:91` mandam
`ordem: "recentes"` explícito — a lista em cards é a única vista que fica com
o default.

**Cenário:** com ~800 leads em 3 anos, a vendedora abre `/noivas` e a página 1
são os 24 leads de 2023 — perdidos e devolvidos, na maioria. A noiva
cadastrada ontem mora na página 34 de 34, atrás de 33 cliques em "Próxima".
Não há controle de ordenação na tela (`noivas/index.tsx:123-167` — busca,
etapa e alternador de vista; ordem, nenhum), então a pergunta natural da lista
("quem entrou por último?") não tem resposta sem buscar por nome. O funil ao
lado responde recentes-primeiro por coluna — a mesma tela, duas ordens, e só
uma delas escolhida de propósito.

**Número:** 1 linha de conserto (passar `ordem: "recentes"` nos params) contra
33 cliques de "Próxima" para achar a noiva de ontem sem busca.

## D3 🟠 — A ficha da noiva não sabe quando é a próxima prova

**Âncoras:** `artifacts/moscow-noivas/src/pages/noivas/[leadId]/index.tsx:89-110`
(as queries da ficha: lead, orçamentos, contratos — **nenhuma de
atendimentos/provas**) e `:379-556` (os cards, enumerados: O casamento,
Contato, Histórico de contato, Orçamentos, Contratos, Portal, Lookbook,
Interesses); `src/lib/proximo-passo.ts:55-64` (o banner sabe a ETAPA, não a
agenda — sugere "Agendar o atendimento" sem saber se já há um marcado).
Captura: `capturas/noivas-ficha--claro.png`. O contraste:
o PORTAL mostra as próximas provas à noiva (E78/E85, `noiva-portal.tsx`), e
`/provas` recorta futuras no servidor (`provas/index.tsx:44-46`).

**Cenário:** a noiva liga: "que dia mesmo é a minha prova?". A vendedora abre
a ficha — a tela feita para "quem ela é" — e a resposta não está em nenhum dos
8 cards. O caminho real: `/atendimentos` → aba Provas → buscar o nome (3
gestos + digitação, `atendimentos/index.tsx:118,186-188`), ou `/provas` e
procurar o nome no mês certo com os olhos. A informação existe, recortada no
banco por `leadId` em outras telas; a ficha simplesmente não a pede. O mesmo
vale para "quando é o próximo atendimento dela" — o dado que o banner de
próximo passo precisaria para parar de sugerir agendar o que já está agendado.

**Número:** 8 cards na ficha, 0 respondem a pergunta mais frequente do
telefone; a resposta custa 2 telas e uma digitação.

## D4 🟠 — O saldo devedor não existe em tela nenhuma da loja: a soma do aberto só aparece no diálogo de CANCELAR

**Âncoras:** `artifacts/moscow-noivas/src/pages/contratos/[id].tsx:427-434`
(o destaque `money-lg` é o **Valor Total**), `:155-164` (`oQueSeraDesfeito`
calcula `recebido` e `aberto` — a conta existe), `:639-691` (o único lugar que
a mostra: o diálogo de cancelamento), `:518-522` (o "faltam" é por parcela
PARCIAL, nunca do contrato), `:558-563` (o rodapé soma o PREVISTO do plano,
não o aberto). Na ficha, o card Contratos mostra `valorTotal`
(`noivas/[leadId]/index.tsx:524`). O contraste de novo é o portal: a noiva vê
"falta pagar" somado pelo link dela (E100/F36), a vendedora não vê em tela
nenhuma.

**Cenário:** a mesma ligação de D3, segunda pergunta: "quanto falta pagar?".
Contrato de R$ 8.400,00 em 10×, entrada e 3 parcelas recebidas — faltam
R$ 5.880,00. A tela lista as 10 linhas com status e a vendedora soma 7 valores
de cabeça, ou cancela… não: abre o diálogo de cancelar só para LER a soma que
ele calcula, e volta. O dado mais consultado do contrato vivo (o quanto ainda
entra dele) é o único agregado que a tela não desenha — e é o que o dashboard
promete no card "A receber", loja inteira, sem o recorte por noiva.

**Número:** a soma de 1 linha (`somaCentavos(abertas, saldoAberto)`) já está
escrita em `:162`; falta exibi-la fora do diálogo. 10 parcelas − 3 pagas = 7
somas mentais por ligação, hoje.

## D5 🟠 — O filtro morre em QUALQUER navegação, não só no F5 — e a metade financeira do app prova que o certo já é convenção da casa

**Âncoras (quem perde):**
`artifacts/moscow-noivas/src/pages/atendimentos/index.tsx:112-118` (busca,
vendedora, situação, janela e aba em `useState`; só `?quando=historico` vai à
URL — `:110`); `noivas/index.tsx:47-50` (busca, etapa e PÁGINA);
`orcamentos/index.tsx:62`; `contratos/index.tsx:28`;
`vestidos/index.tsx:145-152` (busca + 5 filtros; só a data vai à URL);
`financeiro/conciliacao.tsx:169`. **Quem faz certo:**
`financeiro/receber.tsx:94-96` (`filtro`/`ini`/`fim` em `useSearchParams`),
mais pagar, fluxo, cobrança, DRE, auditoria, comissões, ajustes
(`ajustes/index.tsx:67-69`), utilização — 13 telas, pelo inventário §4.

**Cenário:** filtro em `useState` não morre só no F5 — morre no unmount. A
vendedora filtra a fila de atendimentos por ela mesma, aba Provas, clica numa
noiva para conferir um detalhe e volta: **filtros zerados, refaz os 3
gestos** — a cada ida-e-volta, o dia inteiro. Na lista de noivas é a PÁGINA
que se perde: conferiu a ficha na página 3, voltou, está na 1. E o link não
carrega nada: a dona filtra `/atendimentos` por uma vendedora e manda a URL —
a colega abre a fila padrão, sem filtro, sem saber o que era para ver (a
pergunta 3 da trilha: em `/financeiro/receber` o link viaja com `?filtro=`;
nas 6 telas acima, viaja vazio).

**Número:** 6 telas de trabalho diário no lado errado da convenção que outras
13 do mesmo app já seguem.

## D6 🟡 — Não há busca global nem atalho: a ficha, do lugar errado, custa 3 cliques + digitação — e cada busca sabe uma coisa diferente

**Âncoras:** `artifacts/moscow-noivas/src/components/layout/sidebar.tsx:121-179`
(o conteúdo completo da barra: logo, sino, trocar de loja, 18 links — nenhum
campo de busca); `noivas/index.tsx:57-61` (debounce de 300 ms da única busca
que resolve pessoa); `components/combobox-noiva.tsx:91,174` (cmdk já está no
bundle e buscando noivas dentro de formulários);
`atendimentos/index.tsx:186-188` (a busca da fila só olha `noivaNome` —
telefone não acha, enquanto `leads.ts:125-131` acha por dígitos).

**Cenário:** a noiva no telefone, a vendedora em `/financeiro/receber`. O
caminho medido: sidebar "Noivas" (1 clique) → clicar no campo de busca (2) →
digitar + 300 ms de debounce → "Detalhes" (3). Uns 6-10 segundos quando se
sabe o caminho; no celular, +1 gesto (menu → Sheet). É contornável — por isso
🟡 e não 🟠 —, mas multiplica os achados D1/D3/D4: sem atalho, TODA pergunta
por pessoa passa por essa escada, e de uma tela de formulário a escada ainda
descarta o que estava digitado (S13 da trilha B). O primitivo para o
Ctrl+K/⌘K já está pago: `ui/command.tsx` (cmdk) é dependência viva do
combobox.

**Número:** 3 cliques + digitação de qualquer tela; 8 campos de busca no app e
0 acessíveis por teclado de onde a pessoa está.

## D7 🟡 — O relatório de conversão soma a vida inteira da loja: não há recorte de período

**Âncoras:** `artifacts/api-server/src/routes/leads.ts:197-225` (o `WHERE` é
só `lojaId`; agrupa por origem e motivo sobre TODOS os leads da história);
`artifacts/moscow-noivas/src/pages/noivas/conversao.tsx:50-63` (as queries não
passam parâmetro de período — não existe para passar).

**Cenário:** a dona muda o investimento de Instagram para indicação de
cerimonialistas e quer saber, três meses depois, se funcionou. O relatório
responde "de onde vêm as noivas **desde sempre**": com 3 anos e ~800 leads, os
~120 do trimestre novo movem a taxa consolidada uns poucos pontos — a campanha
nova fica invisível dentro da média histórica. A pergunta natural do relatório
("e NESTE período?") não tem como ser feita, enquanto DRE, fluxo, auditoria e
utilização — os relatórios financeiros vizinhos — todos recortam por
competência ou janela na URL.

**Número:** 0 parâmetros de período num relatório de tendência; 120 leads
novos diluídos em 800 históricos ≈ o trimestre pesa 15% do número que a tela
mostra.

## D8 🟡 — A dobra de /vestidos vira parede de filtros: um Select por atributo ativo do catálogo, sem teto

**Âncoras:** `artifacts/moscow-noivas/src/pages/vestidos/index.tsx:470-488`
(o `atributosAtivos.map` desenha um `<Select>` por atributo, na mesma fileira
de busca + 3 selects fixos + data); captura `capturas/vestidos--claro.png` —
a viewport 1280×800 INTEIRA é filtro, nenhum vestido visível. (Pista da
trilha A, assumida aqui; o volume da captura é artefato de fixture — o
mecanismo sem teto é real.)

**Cenário:** um catálogo de loja real com 8 atributos (decote, volume, renda,
manga, cauda, tom, tecido, silhueta) põe 13 controles antes do primeiro
vestido — e o E99 já resolveu a rede (thumb + lazy), então o custo aqui é de
LAYOUT e de escaneabilidade: a vendedora com a noiva na cabine rola filtros
para chegar ao acervo. A decisão do E99 de não paginar fica de pé; o que falta
é a fileira de filtros ter teto (os N mais usados + "mais filtros"
recolhido), não a lista ter página.

**Número:** na captura, 0 vestidos na primeira dobra; com 8 atributos reais,
13 controles antes do conteúdo.

## D9 🟡 — "Hoje na loja" não tem caminho para a fila de atendimentos

**Âncoras:** `artifacts/moscow-noivas/src/pages/dashboard.tsx:363-370` (o
título do card não linka nada), `:380-386` (o único link do card, no estado
VAZIO, vai para `/agenda`), `:412-423` ("Iniciar" existe na linha, mas
concluir com desfecho só existe na fila). (Pista da trilha B, assumida aqui.)

**Cenário:** a recepcionista abre o dia pelo painel, vê os 3 atendimentos,
inicia o primeiro — e para CONCLUIR com desfecho (o gesto que alimenta funil e
orçamento) precisa da fila `/atendimentos`, a única tela do fluxo para a qual
o card não aponta: sidebar, 2 gestos, todo dia. Cada linha linka a FICHA da
noiva e o vazio linka a AGENDA — os dois vizinhos têm porta; a fila, que é a
continuação natural do card, não.

**Número:** 3 destinos possíveis a partir do card (ficha, agenda, fila); 2 têm
link, e o que falta é o do trabalho.

## D10 🟡 — O painel "Seu dia" cala para a costureira: nenhum cartão de ajustes

**Âncoras:** `artifacts/moscow-noivas/src/pages/dashboard.tsx:60-142` (as
queries do painel: dashboard, leads parados, atendimentos, parcelas,
orçamentos, minha comissão — **ajustes não é pedido**; `grep -i ajuste`
devolve zero no arquivo, idem em `components/sino-notificacoes.tsx`);
`artifacts/moscow-noivas/src/pages/ajustes/index.tsx:67-76` (a fila dela
existe, com recorte `semana|todos|feitos` na URL).

**Cenário:** o E66 deu a cada persona a abertura do próprio dia — dona
(dinheiro), vendedora (comissão + esfriando), recepcionista (agenda) — e a
costureira ficou de fora: ela loga, "Seu dia" mostra agenda e noivas (se os
módulos dela deixarem) e NADA sobre os 5 ajustes que vencem esta semana. Ela
navega para `/ajustes` por hábito, não por aviso; um ajuste da semana só a
alcança se ela lembrar de olhar. O padrão do painel já sabe fazer isso — o
cartão da fila de mensagens some quando vazia e conta quando não
(`dashboard.tsx:232-247`); falta o irmão de ajustes.

**Número:** 4 personas no comentário do E66 (`dashboard.tsx:53-57` cita 3 +
recepcionista), 1 sem nenhum cartão.

## O que está BEM — não mexer

- **A busca de noivas é a régua do app** — server-side com `q`/`etapa`/
  `pagina`, debounce de 300 ms, `keepPreviousData`, e acha por nome da noiva,
  nome do NOIVO e **dígitos do telefone com ou sem máscara** ("11988" acha
  "(11) 98888-7777") — `noivas/index.tsx:57-87` +
  `api-server/src/routes/leads.ts:120-133`. É exatamente a busca de quem
  atende telefone. D1 e D6 pedem que ela se ESPALHE, não que mude.
- **O combobox de noiva dentro dos formulários** busca no servidor (`?q=`, 20
  por página, `ordem: "recentes"`) e cadastra no clique
  (`components/combobox-noiva.tsx:91,174`) — o padrão cmdk que o D6 propõe
  elevar a atalho global já vive aqui.
- **A metade financeira tem filtro linkável por construção**:
  `receber.tsx:94-96`, pagar, fluxo, cobrança, DRE, projeção, auditoria,
  comissões, utilização, ajustes — 13 telas com estado na URL (inventário §4).
  E o filtro "Atrasadas" de receber ignora a janela de propósito (F29/E98,
  comentário em `receber.tsx:104-118`): atraso não tem janela. Não "unificar"
  isso para baixo.
- **Atendimentos pede o RECORTE, não o acervo** — 90 dias para trás, `de` sem
  `ate` para nunca esconder o futuro, "carregar mais antigo" dobra a janela
  (`atendimentos/index.tsx:131-146`). A fila aguenta 3 anos por construção; é
  o modelo para o D1.
- **Provas e ajustes recortam no servidor e no estado certo**
  (`provas/index.tsx:44-46`; `ajustes/index.tsx:67-76` com `recorte` na URL).
- **O dashboard por persona (E66) cumpre o que promete para 3 das 4
  personas** — e o número da fila de mensagens é o MESMO da tela, por régua
  compartilhada (`dashboard.tsx:99-131`, `lib/mensagens-do-dia`). O padrão
  "cartão que some quando não há nada" (`:232-247`) é o certo.
- **A ficha responde "o que fazer agora" em uma frase** — o banner de próximo
  passo (`noivas/[leadId]/index.tsx:299-311`, `lib/proximo-passo.ts`) e o
  WhatsApp clicável no primeiro card (`:412-431`). D3 acrescenta a agenda ao
  que ele sabe; a ideia está certa.
- **A fila de cobrança ordena piores-primeiro pela régua do core**
  (`mensagens/index.tsx:182-185`) — ordenação com opinião, como deve ser numa
  fila de trabalho.
- **A decisão do E99 parte 7 fica de pé**: filtrar 533 vestidos em memória é
  instantâneo; nada nesta trilha pede paginação em `/vestidos`.

## Pistas laterais — de outras trilhas

- **(B/backend — payload)** `GET /lojas/:id/orcamentos` embute `itens: true`
  de TODOS os orçamentos da loja (`api-server/src/routes/orcamentos.ts:126-131`)
  — e a lista que o consome não mostra valor nenhum (D1): o dado desce inteiro
  para não ser lido. Quando o D1 der busca/página à lista, a rota deve parar
  de mandar os itens da história toda. Registrada como sobra S-D5.
- **(F — voz)** O vazio da lista filtrada de noivas diz "Nenhuma noiva nesta
  **lente** no momento" (`noivas/index.tsx:208`) — "lente" é vocabulário dos
  documentos de revisão vazando para a tela da vendedora.
- **(C — estados)** As listas de contratos e orçamentos usam `Alert` manual
  com frase fixa em vez do `Erro` canônico com `mensagemApi`
  (`contratos/index.tsx:63-73`, `orcamentos/index.tsx:204-214`) — mesma classe
  dos 53 toasts que a trilha B contou.
- **(E — 390px)** A fileira de filtros de `/vestidos` (D8) em 390 px vira uma
  COLUNA de selects — a captura `vestidos--390.png` merece o olhar da trilha E
  junto com o teto proposto no D8.
- **(A — consistência)** A lista de contratos rotula o botão primário de
  "Novo contrato (via orçamento)" e ele NAVEGA para outra listagem
  (`contratos/index.tsx:42-45`) — um botão `+` que não cria; vale conferir
  contra a gramática de ação primária que a trilha A mapeou.
