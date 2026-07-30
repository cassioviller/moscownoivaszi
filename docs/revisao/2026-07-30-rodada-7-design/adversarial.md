# Passada adversarial — 22 🟠 desafiados, 21 sobreviveram à releitura, 1 caiu de grau

**Rodada 7 (design), sessão 1 — 2026-07-30** · regra 7 do método.

A rodada não tem nenhum 🔴, então o alvo foram os **22 🟠** das seis trilhas —
todos, não só os de épico caro: com essa contagem, desafiar tudo custa menos que
escolher. Para cada um: reli a âncora no código de verdade (nenhuma citação foi
aceita de segunda mão), procurei a régua/decisão/teste que já o cobriria (as
decisões registradas da rodada 6, os comentários-régua no próprio código, o
`git log -S` quando a origem importava), perguntei se o banco de dev explica o
sintoma e se o cenário sobrevive ao caminho real da persona. Reabri 4 capturas
(`vestidos--390`, `financeiro-receber--390`, `financeiro-cobranca--390` e a
conferência de `contratos--390` pela trilha) e refiz a conta de contraste do E4
a partir dos tokens, do zero. Resultado: **as trilhas citaram com precisão** —
das 22 âncoras, 22 batem com o código; as duas correções que a passada
acrescenta são um número (C4: 47, não 49) e uma nota de decisão (D2: o
comentário do openapi que parecia decisão não tem medida).

---

## Trilha A

### A1 🟠 — o badge sem gramática — **SOBREVIVEU**

Refutações tentadas: (1) *o texto do badge sempre desambigua* — verdade, mas o
miolo do achado é a contradição entre telas, e ela é literal: reli os 7 pontos
(`dashboard.tsx:424-431` FALTOU→outline; `atendimentos/index.tsx:315` e
`provas/index.tsx:163` TUDO→secondary; `agenda/index.tsx:274` ativa=default;
`vestidos/[id].tsx:287-289` ativo=secondary; `contratos/index.tsx:115`
cancelado=destructive; `orcamentos/index.tsx:244` recusado=outline). O mesmo
"Agendado" muda de cor a um clique do dashboard para a fila, e na fila o estado
que pede reação (Faltou) é indistinguível de relance do estado em dia — na tela
que a recepcionista varre todo dia. (2) *Régua existente*: os RÓTULOS têm casa
(`lib/formatos.ts:49`, com teste); as VARIANTES não têm nenhuma — grep no
`replit.md` e em `lib/` devolve zero convenção de badge. (3) Dado de dev não
participa. A refutação falhou nos três flancos.

### A2 🟠 — o degrau maior do dinheiro fora da própria decisão — **SOBREVIVEU**

A refutação mais promissora era uma decisão registrada: o cuidado (a) do E99
proíbe a reescrita dos 92 call-sites (`E99.md:492`). Ela falha porque a medida
dessa decisão é "poda e adoção **onde a divergência já custou**, nada mais" — e
o A2 documenta exatamente onde custa: o MESMO R$ 39.688,00 sans-bold no
dashboard e serif em Minha comissão, a um clique; Entradas serif e A RECEBER
sans NA MESMA tela do financeiro. Reli os 11 pontos, todos literais:
`dashboard.tsx:315/330/350` (`text-2xl font-bold`, sem serif e **sem
`tabular-nums`** — o dashboard é o único degrau de topo sem alinhamento de
coluna), `cobranca.tsx:318` via `CardTitle` que é `<div font-semibold>`
(`ui/card.tsx:32-41`, confirmado), `fluxo.tsx:295/302`, `minha-comissao`
:99/112/127/165 (serif num tamanho que não existe na escala), e os dois
overrides `money-lg text-2xl`/`text-4xl` (`comissoes/index.tsx:698`,
`dre.tsx:197`). O achado pede a adoção no degrau da decisão do dono, não a
reescrita recusada.

### A3 🟠 — navegação entre visões irmãs com quatro caras — **CAIU → 🟡**

Reli as quatro âncoras e as quatro são fiéis — mas **não são o mesmo gesto**, e
o próprio achado admite ao propor "DUAS línguas". As abas de Atendimentos
(`atendimentos/index.tsx:498-514`, `setAba` — estado local) e as pílulas de
Configurações (`configuracoes/index.tsx:81-88`, `Tabs defaultValue` — estado
local) alternam a visão SEM sair da tela; os link-setas do fluxo
(`fluxo.tsx:154-174`, `<Link to>`) e os botões ghost da agenda
(`agenda/index.tsx:126-131`, `<Link to>`) NAVEGAM para outra rota. São dois
conceitos com duas caras cada, não um conceito com quatro — e as duas telas que
dividem a cara "tabs" (fila diária vs. Configurações, tela de dona, rara) quase
não coabitam uma jornada. O que sobra é real: dentro de cada gesto há dois
desenhos, e "aba sublinhada à mão vs. `ui/tabs`" é divergência de primitivo.
Mas o custo é de reconhecimento na primeira vez, não "tempo ou erro todo dia" —
não há clique perdido contado, nem erro possível (o clique errado é reversível
no ato). Pela régua de severidade, é fricção contornável: **🟡**. Parecia pior
porque a soma "quatro caras em quatro grupos do menu" mistura os dois gestos
numa conta só.

## Trilha B

### B1 🟠 — o contrato nasce da vendedora que clicou — **SOBREVIVEU**

O achado mais sólido da rodada; a releitura só o reforçou.
`orcamentos/[id].tsx:595` envia `vendedoraId: user!.id` fixo; o diálogo
(:1058-1196) não tem o campo; `openapi.yaml:5323-5329` confirma que
`Orcamento.vendedoraId` é obrigatório e desce no GET (o dado para pré-preencher
está em memória); `contratos.ts:149` valida só "é da loja" (o comentário B4/E91
ali é sobre outra classe); `lib/comissao.ts:238-279` agrega por `vendedoraId`
do contrato. A refutação pelo caminho da persona falha por causa do PRÓPRIO
produto: o aceite da noiva é assíncrono pelo portal (E74), então "quem clica
Gerar contrato de manhã não é quem vendeu à noite" é o fluxo desenhado, não um
acaso. E o precedente E98 (`E98.md:170-172`) nomeia esta classe com as mesmas
palavras — fechou a porta da agenda e deixou esta, a única que paga comissão.
A conta bate: 5% de R$ 4.200,00 = R$ 210,00.

### B2 🟠 — cobrar por /cobranca não deixa rastro — **SOBREVIVEU**

Grep no arquivo inteiro: `cobranca.tsx` não tem UMA ocorrência de
`registro`/`criarRegistro` — o `<a href={wa}>` de :154-160 é nu, e o único
registro da tela é o formulário manual do `historico-contato.tsx:127+`. A irmã
registra no clique (`mensagens/index.tsx:421`). A melhor prova de que não é
decisão: o comentário F26 (`mensagens/index.tsx:147-153`) afirma que /cobranca
"já gravava" — a paridade era o DESENHO; hoje só existe de um lado. O relógio
do "parado há N dias" zerado pelo registro está confirmado no comentário-régua
de `historico-contato.tsx:27-33`, e o link "Ver a cobrança completa"
(:377-383) manda a fila do dia exatamente para a porta sem rastro.

### B3 🟠 — a fila de cobrança não marca o que já saiu — **SOBREVIVEU**

`enviadas` é `useRef` (:159) — dedup sem re-render, nada muda na tela; o
`onSuccess` invalida `listParcelas`, que não muda com um registro de cobrança,
então a linha fica idêntica. A seção "Procurar para confirmar" (:302-317,
:332-363) remove a linha e oferece "Não procurei" — o desenho existe 20 linhas
acima, no mesmo arquivo. A prosa da própria tela ("Desça a fila clicando",
:202) institui o fluxo que o defeito quebra a cada interrupção.

### B4 🟠 — a parcela do balcão não se acha pelo nome — **SOBREVIVEU**

Refutação tentada: *o caminho natural do balcão é pessoa-primeiro (Noivas →
ficha → contrato)*. Falha porque o custo permanece diário (5 cliques +
digitação por parcela recebida no balcão, contra 1 busca que a tela poderia
ter) e porque a metade fora-da-janela é pior que busca ausente: a antecipada
não EXISTE na tela sem ajustar duas datas sabendo o vencimento de cabeça
(`resolverIntervalo`, :96; controles conferidos em :236-276 — De/Até e 4
pills, nenhum campo de texto). O E3/E98 pôs o nome da noiva nessas linhas por
ser "a tela mais trabalhosa do sistema" — a busca é a metade que faltou.

### B5 🟠 — o único botão colorido é o passo que a tela desaconselha — **SOBREVIVEU**

Refutação tentada: *o aviso vermelho do F19 dentro do diálogo é a rede, e o
clique errado é reversível (Cancelar)*. Falha porque o achado não é sobre o
dano do clique — é sobre o corrimão: em RASCUNHO/ENVIADO a `acaoPrimaria` é
Aprovar (:688-692, literal) e o envio à noiva mora num menu de ícone sem
rótulo (:694-711), enquanto o fluxo desenhado pelo produto (E74/E75) começa
pelo envio. E a troca de primária por estado não contraria decisão nenhuma —
é o padrão que o MESMO cabeçalho já usa (APROVADO → Gerar/Ver contrato,
:674-687). Nenhuma decisão registrada cobre a escolha de Aprovar como
primária.

## Trilha C

### C1 🟠 — a fila do dia afirma "vazia" enquanto não sabe — **SOBREVIVEU**

Grep no arquivo: 1 única leitura de estado de query
(`desfazerContato.isPending`, :355) para 4 queries disparadas — zero
`isLoading`/`isError`. As frases afirmativas conferidas (:200-202 "Fila vazia
— ninguém esperando mensagem."). Refutação tentada: *cache do react-query
esconde o flash*. Falha: a primeira abertura do dia não tem cache, e o caso
de ERRO afirma o falso vazio para sempre. O precedente D7/E99
(`comissoes/index.tsx:577-598`) prova que o repo já trata esta classe como
defeito.

### C2 🟠 — a conciliação desenha o veredito com o lado do sistema vazio — **SOBREVIVEU**

A sequência de corrida é literal: as queries habilitam quando `janela` nasce
do parse do arquivo (:82-94, `enabled: !!paramsRecebidas`), o `useMemo` roda
com `data` ainda `undefined` e cai em `?? []` (:117, :130), e o render é
gateado só por `{conciliacao && …}` (:262) — nenhuma leitura de
`isLoading`/`isError` no arquivo além de `marcar.isPending`. A instrução que
ensina a relançar está em :323-333, conferida. O caminho do dano (relançar →
caixa conta duas vezes) atravessa a régua de dinheiro do repo — é o 🟠 mais
perto de 🔴 da rodada.

### C3 🟠 — a falha vira "R$ 0,00" no painel da dona — **SOBREVIVEU**

`dashboard.tsx:66-71` desestrutura só `data`/`isLoading` — literal; os
fallbacks `?? 0`/`|| 0` desenham zero de falha idêntico a zero de verdade; o
contraste está no mesmo arquivo (:372-376 com ramo `isError`). Funil
(`funil.tsx:264`, só `isLoading`) e Permissões (`permissoes/index.tsx:35-40`)
conferidos. Nada a refutar — o próprio arquivo contém a régua e a violação.

### C4 🟠 — os toasts que mostram o protocolo — **SOBREVIVEU, número corrigido: 47 em 27 arquivos**

O grep de hoje devolve **47 ocorrências em 27 arquivos** de `pages/` (a trilha
disse 49 em 29; os piores batem: `equipe/index.tsx` 6,
`vestidos/[id]/editar.tsx` 4, `admin/index.tsx` 4). O mecanismo é literal:
`custom-fetch.ts:151-171` procura `title`/`detail`/`message`/
`error_description`/`error` — **não** `detalhe` —, então a mensagem vira
`HTTP 409 Conflict: CONVITE_PENDENTE` e joga fora o "Use reenviar ou cancele o
convite existente" de `equipe.ts:245`. `mensagemApi` lê `detalhe` certo
(`erro-api.ts:58`) — a régua existe, a adoção parou. A consolidação deve
carregar o número corrigido.

### C5 🟠 — três confirmações de dinheiro fora da cláusula do E10 — **SOBREVIVEU**

Os três diálogos relidos, literais: "Estornar este pagamento?" sem valor nem
descrição (`pagar.tsx:806-811` — o ramo de rateio até conta as contas, mas
nunca o dinheiro), o estorno do contrato citando `valorPrevisto`
(`contratos/[id].tsx:769`, botão visível para PARCIAL via `teveRecebimento`,
:547), "Remover esta conta?" sem valor (:785-789). A refutação morre no
próprio repo: o comentário de `receber.tsx:399-409` enuncia a regra com o
MESMO exemplo numérico do achado (PARCIAL de R$ 1.000,00 com R$ 300,00 —
"escrever R$ 1.000,00 aqui seria a tela mentindo sobre dinheiro num clique sem
volta"). O achado é a régua da casa aplicada às três que escaparam.

## Trilha D

### D1 🟠 — contratos e orçamentos não se acham — **SOBREVIVEU**

Servidor conferido: `contratos.ts:117` `orderBy: fechadoEm` ascendente sem
`desc`, sem `limit`/`offset`, sem `q`; `orcamentos.ts:130` idem por
`createdAt`. O card de orçamento sem valor (:231-249, literal). Refutação por
decisão registrada: o E99 parte 7 recusou paginar **/vestidos** com a medida
"filtrar 533 em memória é instantâneo" — a medida é de memória/render e não
cobre acervo comercial pesquisável; nenhuma decisão toca contratos/orçamentos.
Dado de dev não explica: a ordem ascendente é do código, não da fixture.

### D2 🟠 — a lista de noivas abre nos leads de 2023 — **SOBREVIVEU (a única quase-decisão encontrada não tem medida)**

A passada achou o que mais parecia uma decisão registrada:
`openapi.yaml:1243-1247` — "A lista lê como histórico (mais antiga primeiro)…
Default preservado: os pickers de agenda/orçamentos e a lista já contam com a
ordem antiga" — nascido no E27 (commit `32e6016`, o kanban). A refutação falha
porque a frase preserva o **default da API** por compatibilidade, sem medida
de que antigos-primeiro serve a LISTA — e os dois irmãos que escolheram de
propósito pedem `recentes` explícito (`funil.tsx:244`,
`combobox-noiva.tsx:91`). O conserto do D2 (a tela passar
`ordem: "recentes"`) nem toca o default preservado. **Nota para o épico:**
atualizar o comentário do openapi junto, senão ele volta a parecer decisão.

### D3 🟠 — a ficha não sabe quando é a próxima prova — **SOBREVIVEU**

As queries da ficha são três e só três (`[leadId]/index.tsx:89-110`: lead,
orçamentos `?leadId=`, contratos `?leadId=`) — nenhuma de agenda. O portal
mostra "Suas próximas provas" à noiva (`noiva-portal.tsx:306-311`) enquanto a
vendedora, na tela de "quem ela é", não tem o dado. O caminho alternativo
(fila → aba Provas → busca por nome) existe e custa 2 telas + digitação por
ligação — o cenário sobrevive.

### D4 🟠 — o saldo devedor só existe no diálogo de CANCELAR — **SOBREVIVEU**

A conta pronta em `oQueSeraDesfeito` (:155-164, `aberto:
reais(somaCentavos(abertas, saldoAberto))` — literal), exibida só em :639+;
o destaque `money-lg` da tela é o Valor Total (:433); o rodapé soma o
PREVISTO (:558-563). E o contraste é do próprio produto: o portal dá "Falta
pagar" à noiva (`noiva-portal.tsx:585-588`, conferido). A informação existe
dos dois lados da borda; só a tela da vendedora não a desenha.

### D5 🟠 — o filtro morre em qualquer navegação — **SOBREVIVEU**

`atendimentos/index.tsx:112-118`: busca, vendedora, situação, janela e aba em
`useState` (só `?quando=` na URL); `vestidos/index.tsx:145-152` idem;
`noivas/index.tsx` com a PÁGINA em estado. O lado certo conferido:
`receber.tsx:92-96` em `useSearchParams`. Unmount no React Router descarta o
estado — o custo da ida-e-volta é real e diário, e a convenção da casa já
existe em 13 telas. Nada a refutar.

## Trilha E

### E1 🟠 — a fileira sem quebra esconde o botão de criar — **SOBREVIVEU**

Captura reaberta (`vestidos--390.png`): o header termina em "Novo vesti…"
cortado e o botão do dialog está 100% fora — confirmado pixel a pixel. Código
literal: header `flex items-center justify-between` sem wrap
(`vestidos/index.tsx:287-313`), `whitespace-nowrap` em todo Button
(`ui/button.tsx:8`), `<main>` só com `overflow-y-auto`
(`app-layout.tsx:174`). Dado de dev não participa (o corte é do header, não
do volume). O cenário (cadastrar com a noiva ao lado) é o uso desenhado da
porta rápida.

### E2 🟠 — os totais de receber cortados na borda — **SOBREVIVEU**

Captura reaberta (`financeiro-receber--390.png`): "A receber" e "Recebido"
atravessam a borda direita com dígitos fora da tela, enquanto "Em atraso",
sozinho na linha de baixo, sai inteiro — a prova de que é a DUPLA que não
cabe. `ResumoCard` conferido (`helpers.tsx:42`, `min-w-[9rem] flex-1` com
`money-lg` dentro). Dinheiro ilegível no degrau de topo para a dona no
celular; o conserto num componente fecha receber, pagar e folha.

### E3 🟠 — o WhatsApp da cobrança fora da tela — **SOBREVIVEU**

Captura reaberta (`financeiro-cobranca--390.png`): a linha da Ana termina em
"[Receber] [C…" — Contrato cortado, WhatsApp invisível. Código literal: o
wrapper :105 tem `flex-wrap`, o grupo interno :121 não. A ação que só faz
sentido no celular é a única que o celular não mostra; o conserto é uma
classe.

### E4 🟠 — o rosa como texto a 2,7:1 — **SOBREVIVEU (conta refeita: 2,68:1)**

Refiz a conta do zero a partir dos tokens: `hsl(350 25% 65%)` =
rgb(188,143,151), luminância 0,327; fundo `hsl(40 33% 98%)`, luminância
0,961 → **2,68:1** (a trilha arredondou 2,71 — mesma vizinhança, abaixo até
dos 3:1 de componente). A fresta da varredura é literal:
`escala-dinheiro.test.ts:62-64` exige `brl(` e `text-primary` NA MESMA linha,
e `noiva-portal.tsx:404-405` os separa — ofensor vivo com CI verde. Os 10
links conferidos por grep. Regra 6 não se aplica: contraste é conta de token,
independe de locale/navegador. Nenhuma decisão contra o `--primary-texto` que
o E92 deixou desenhado — só a entrega que ficou no meio.

---

## O que a passada acrescenta à consolidação

1. **A3 desce a 🟡** — dois gestos × duas caras, não um conceito × quatro; o
   trabalho de unificar primitivos continua valendo como polimento de
   consistência.
2. **C4 carrega o número corrigido**: 47 toasts em 27 arquivos (grep de hoje),
   não 49 em 29.
3. **O épico do D2 atualiza o comentário de `openapi.yaml:1243-1247` junto** —
   é a única prosa no repo que ainda defende antigos-primeiro para a lista, e
   sem medida.
4. **Nenhuma âncora falsa em 22** — as seis trilhas citaram o que leram; a
   passada não achou nenhum achado apoiado em dado de fixture nem nenhum que
   contrarie decisão registrada com medida de pé.
