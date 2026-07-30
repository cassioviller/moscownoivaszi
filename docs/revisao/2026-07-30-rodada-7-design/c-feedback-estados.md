# Trilha C — a ação responde bem; é a FALHA que fica muda: onde a API não respondeu, a tela afirma zero

O caminho feliz desta camada está maduro: toda mutação de dinheiro amostrada
desabilita o botão no `isPending` com rótulo "…ndo", o toast de sucesso nomeia o
que aconteceu, e os vazios de primeiro uso ensinam o próximo passo — a regra do
E99 pegou. O buraco é o irmão que ninguém desenhou: **o que a tela diz quando a
API falha ou ainda não respondeu**. Quatro telas — entre elas a fila de trabalho
diária e o painel de dinheiro da dona — respondem a isso afirmando "vazio" ou
"R$ 0,00" com todas as letras, e metade dos toasts de erro do app ainda mostra o
protocolo (`HTTP 409 Conflict: …`) em vez da frase que o próprio servidor
escreveu para gente. E na régua E10, a cláusula que o teste não cobre — o TEXTO
da confirmação — falhou exatamente onde ela avisa que mora: na revisão.

**Método e ambiente.** Esta trilha é mais de código que de captura, por
necessidade: carregando e erro quase não existem em captura estática — dos 81
PNGs de `capturas/`, nenhum mostra um esqueleto ou um alerta de falha; o que
elas mostram são vazios e pós-ação. Li linha a linha (em
`artifacts/moscow-noivas/src/`): `components/estado/index.tsx`,
`lib/erro-api.ts`, `mensagens/index.tsx` inteiro, `financeiro/conciliacao.tsx`,
`dashboard.tsx`, `noivas/funil.tsx`, `permissoes/index.tsx`, os vazios e erros
de `noivas/index`, `vestidos/index`, `orcamentos/index+[id]`,
`contratos/index+[id]`, `atendimentos/index+novo`, `provas`, `reservas`,
`ajustes`, `catalogo`, `equipe`, `financeiro/receber+pagar+folha`,
`comissoes`, `minha-comissao`, `configuracoes/privacidade+captacao`,
`noiva-portal`, `login` — e as 16 `AlertDialog` uma a uma; mais
`lib/api-client-react/src/custom-fetch.ts` e `api-server/src/routes/equipe.ts`
e `agenda.ts` onde o erro atravessa a borda. Capturas lidas:
`mensagens--claro.png`, `financeiro-conciliacao--claro.png`,
`dashboard--claro.png`, `financeiro-receber--claro.png` (viewport 1280×800,
banco de dev — "80 mensagens" e nomes `E2E *` são fixture; locale desconhecida,
e nenhum achado daqui depende dela). Pistas assumidas: da trilha A, o vazio de
`minha-comissao` (veredito no C6); da trilha B, os toasts com `err.message` cru
(vira o C4) e o comentário F26 desatualizado em `mensagens/index.tsx:149-153`
(fica com o épico do B2, que já mexe naquelas linhas — nada a acrescentar).

---

## C1 🟠 — A fila do dia não tem carregando nem erro: "Fila vazia — ninguém esperando mensagem" é o que ela afirma enquanto não sabe

**Código:** `src/pages/mensagens/index.tsx` — a tela dispara **4 queries**
(atendimentos `:68`, parcelas abertas `:87`, orçamentos enviados `:94`, portais
`:104`) e **lê zero vezes** `isLoading` ou `isError` (grep no arquivo: 0
ocorrências; o único estado lido é `desfazerContato.isPending`, `:355`). Tudo é
derivado de `?? []`, então carregando e erro são indistinguíveis de "não há
nada": o subtítulo afirma **"Fila vazia — ninguém esperando mensagem"**
(`:200-202`), e cada seção crava **"Todas as noivas das próximas 48h já foram
procuradas."** (`:275`), **"Ninguém em atraso."** (`:388`), **"Nenhum orçamento
vencendo."** (`:453`). **Captura:** `mensagens--claro.png` — a tela cheia; o
estado mentiroso é dinâmico e não aparece em captura estática.

O cenário: a recepcionista abre "Mensagens de hoje" às 9h — é a tela que o
próprio dashboard promete como "o que precisa da sua atenção agora" — num
momento em que a rede oscilou. A tela diz, em frase afirmativa, que ninguém
espera mensagem. Ela fecha e segue o dia: as confirmações das próximas 48h não
saem, as cobranças não saem, e nenhum pixel disse que houve falha. Mesmo sem
falha, o flash existe todo dia: enquanto as parcelas abertas da loja inteira
descem, o cabeçalho afirma "Fila vazia". É exatamente a classe que o D7/E99 já
consertou no diálogo de fechar comissões — *"a tela AFIRMAVA 'nenhuma comissão
a lançar' enquanto o preview ainda estava carregando"*
(`src/pages/comissoes/index.tsx:577-582`) — e das 44 telas de loja esta é a
única que consome queries sem ler nenhum dos dois estados. O conserto tem molde
pronto no repo: `<Carregando>` e `<Erro>` de `components/estado/index.tsx`.

## C2 🟠 — A conciliação desenha o veredito com o lado do sistema vazio — e, se a query falhar, o veredito errado fica e ensina a relançar dinheiro

**Código:** `src/pages/financeiro/conciliacao.tsx` — o resultado é computado de
`parcelas.data ?? []` e `pagamentos.data ?? []` (`:113-142`) e desenhado sempre
que há extrato (`{conciliacao && …}`, `:262`), **sem gate nenhum de
`isLoading`/`isError`** das duas queries (`:83-94`; o arquivo não lê nem um nem
outro — só `marcar.isPending`). A sequência real: a dona escolhe o arquivo → as
queries são habilitadas naquele instante → no MESMO render o `useMemo` roda com
`data` ainda `undefined` → `conciliarExtrato(transacoes, [])`. **Exemplo
numérico:** um extrato de 45 transações mostra **"Bateu 0 · Só no banco 45 ·
Só no sistema 0"** até as queries chegarem — e, se uma delas falhar, mostra
isso PARA SEMPRE, sem uma linha de erro. A tela ainda instrui: *"Entrou ou saiu
dinheiro que o sistema não registrou — lance em receber ou pagar"*
(`:323-333`). **Captura:** `financeiro-conciliacao--claro.png` — só o estado
pré-upload existe em captura; o defeito é dinâmico.

O caminho do dano: a dona confia no veredito, abre Pagar e relança uma saída
que o sistema já tinha — o caixa passa a contar o mesmo dinheiro duas vezes, e
a régua do repo ("um DRE que fecha com um centavo de diferença vira
desconfiança") diz o preço disso. O conserto é o mesmo do C1: enquanto
`parcelas.isLoading || pagamentos.isLoading`, esqueleto; em `isError`, `<Erro>`
com "Tentar novamente" — e o veredito só quando as duas responderam.

## C3 🟠 — No painel da dona, a falha vira "R$ 0,00": o dashboard trata o erro em 2 queries e engole nas outras — e funil e permissões ficam mudos do mesmo jeito

**Código:** `src/pages/dashboard.tsx:66-71` — `useGetDashboard` desestrutura só
`data` e `isLoading`; não há leitura de erro. Falhou a query (rede, 5xx), a
tela renderiza os fallbacks como se fossem medição: **"Noivas ativas 0"**
(`:247`, `dashboard?.totalLeadsAtivos || 0` — e os 3 contadores irmãos), **"A
receber — próximos 30 dias R$ 0,00"** (`:316`, `brl(dashboard?.
receberProximos30Dias ?? 0)`) e **"A pagar R$ 0,00"** (`:331`). O contraste
está no MESMO arquivo: `atendimentosQuery` e `paradosQuery` têm o ramo
`isError` com frase própria (`:372-376`, `:456-460`) — a régua existe ali e não
chegou ao dinheiro. O card "Minha comissão" simplesmente some na falha
(`:340`, `comissaoDoMes?.temRegra &&`), indistinguível de "sem regra".
**Captura:** `dashboard--claro.png` — os cards com dados; o zero de erro é
dinâmico.

Na mesma classe, mais mudas ainda: **o funil** desenha cada coluna com
**"Vazia"** e total 0 quando a query falha (`src/pages/noivas/funil.tsx:264` —
só `isLoading` é lido; `:303-307` o texto), e **Permissões** fica com o título
e uma página em branco (`src/pages/permissoes/index.tsx:35-40` — duas queries
sem leitura de erro; `:113-121` — com `perfis === undefined` nenhum ramo
desenha nada). O cenário do dashboard é o que dói: a dona abre o painel de
manhã, lê "A receber R$ 0,00" e liga para a vendedora achando que o mês parou —
um zero de verdade e um zero de falha têm exatamente os mesmos pixels, numa
tela onde os dois números são "a linha que a dona procura ao abrir" (comentário
do próprio arquivo, `:303`).

## C4 🟠 — 49 toasts de erro em 29 arquivos mostram o protocolo e jogam fora a frase que o servidor escreveu — a régua E92 chegou a 23 arquivos e parou

**Código:** grep por `err instanceof Error ? err.message` em `src/pages/` e
`src/components/`: **49 ocorrências em 29 arquivos** (27 de `pages/` — os
piores: `equipe/index.tsx` com 6, `vestidos/[id]/editar.tsx` e
`admin/index.tsx` com 4). `mensagemApi` (`src/lib/erro-api.ts:47-77`, a régua
do E92) é usada em 23 arquivos — a adoção parou na metade. E o que a pessoa lê
é pior do que "HTTP 409": `custom-fetch.ts:150-171` monta a mensagem como
`HTTP <status> <statusText>` + o campo `error` do corpo — e **não** lê o campo
`detalhe`, porque procura `detail`/`message` (grafia de outra convenção). Ou
seja: o toast mostra **"HTTP 409 Conflict: CONVITE_PENDENTE"** e descarta *"Use
reenviar ou cancele o convite existente"* que o servidor mandou junto
(`api-server/src/routes/equipe.ts:245`).

O cenário: a gerente reenvia um convite e falha (`equipe/index.tsx:203-205`) —
lê protocolo e código em caixa alta; a vendedora agenda num slot que outra
acabou de tomar (`atendimentos/novo.tsx:361-363`) — o servidor explica a recusa
em português (`agenda.ts:263`, `DETALHE_RECUSA`) e o toast mostra o código. Em
cada um desses 29 arquivos o conserto é a troca de uma expressão por
`mensagemApi(err, <fallback da tela>)` — a assinatura já aceita o fallback que
está lá. (A trilha B viu isto de relance e apontou para F/C; assumo o mecanismo
aqui — a voz das frases continua com a F.)

## C5 🟠 — Três confirmações de dinheiro fora da cláusula do texto do E10: o estorno de pagamento não diz nem quanto nem de quê, e o do contrato diz o valor ERRADO

A régua E10 (replit.md, "A régua da ação destrutiva") manda a confirmação
**nomear o objeto e o que se perde — o valor em dinheiro quando houver** — e
diz, com o motivo escrito, que `destrutivas-varredura.test.ts` só cobre a
AUSÊNCIA de confirmação: *"a segunda cláusula é prosa e mora na revisão"*.
Esta é a revisão, e ela achou três fora, todas de dinheiro:

- **`src/pages/financeiro/pagar.tsx:806-811`** — "Estornar este pagamento?"
  desfaz uma saída de caixa **sem citar valor nem descrição** ("A saída de
  caixa some e a conta volta para em aberto"); o estado só carrega
  `{pagamentoId, contas}` (`:146`, `:591-594`), mas a linha clicada tem
  `valorPago` e descrição à mão. Numa carteira com dezenas de saídas, quem
  clicou na linha errada confirma sem ter como perceber — o texto que a irmã
  `receber.tsx:398-425` ganhou no E10/E99 existe exatamente por isso.
- **`src/pages/contratos/[id].tsx:769`** — o estorno cita
  `brl(confirmacao.parcela.valorPrevisto)`, e o caixa perde o **RECEBIDO**.
  **Exemplo numérico:** parcela de R$ 1.000,00 com R$ 300,00 recebidos
  (PARCIAL — o botão aparece para ela, `:547-549`): o diálogo diz que desfaz o
  recebimento de "(R$ 1.000,00)"; o que sai do caixa são R$ 300,00. O
  comentário da própria `receber.tsx:406-409` chama essa troca pelo nome: *"a
  tela mentindo sobre dinheiro num clique sem volta"*.
- **`src/pages/financeiro/pagar.tsx:785-789`** — "Remover esta conta?" nomeia a
  descrição e cala o valor ("o valor em dinheiro quando houver" é a cláusula).

As outras 13 `AlertDialog` do app passam na régua — várias exemplarmente
(comissões nomeia competência, valor e consequência em três diálogos,
`comissoes/index.tsx:818-824`, `:1167-1174`, `:1199-1203`). O conserto dos três
é passar ao estado o que a linha já sabe e escrever o número certo.

## C6 🟡 — O vazio de filtro sem resultado oferece a saída em umas telas e cala nas outras — e "Nada por aqui neste filtro" não diz qual filtro

Quando a busca/filtro não casa nada, o app tem dois comportamentos: **vestidos**
(`src/pages/vestidos/index.tsx:571-581`) e **atendimentos**
(`src/pages/atendimentos/index.tsx:574-587`) explicam e põem o botão "Limpar
filtros" no próprio vazio; **receber** (`financeiro/receber.tsx:302`) e
**pagar** (`financeiro/pagar.tsx:503`) dizem só **"Nada por aqui neste
filtro."** — sem nomear a janela ativa (o padrão é o mês corrente,
`resolverIntervalo`) nem oferecer alargá-la — e **noivas**
(`noivas/index.tsx:208`) diz "Nenhuma noiva nesta lente no momento." sem botão.
O caso que custa é o do B4, visto daqui: a noiva está no balcão querendo
adiantar a parcela do mês que vem; a tela de Receber responde "Nada por aqui
neste filtro" — o vazio sabe por que está vazio (a janela) e não conta, nem
oferece "ver os próximos meses". O conserto cabe no `<Vazio>` canônico com
`acao`. **Veredito da pista da trilha A** (`minha-comissao/index.tsx:210`): a
frase "Nenhuma competência sua foi fechada ainda." dá o porquê e o `CardTitle`
"Meses fechados" dá o contexto; quem fecha competência é a dona, então não há
ação honesta a oferecer à vendedora — **não sobe a achado**, e migrar ou não
para `<Vazio>` é higiene, não defeito.

## C7 🟡 — A ação irreversível da LGPD não conta quantas noivas vai anonimizar: o número só aparece DEPOIS de feito

**Código:** `src/pages/configuracoes/privacidade.tsx:83-88` — o diálogo diz o
QUE se perde ("Nome, contato e local do casamento… DE FORMA IRREVERSÍVEL") mas
não QUANTAS são; a contagem existe e chega no toast **depois** (`:41-49`,
`"N noivas anonimizadas"`). A dona confirma às cegas se são 3 ou 300 — e não há
tela onde conferir antes (o recorte "perdidas há mais de 24 meses" não é um
filtro que exista em Noivas). Pela régua E10, o objeto da confirmação é uma
classe de tamanho desconhecido para quem clica. O conserto pede o número antes:
um dry-run no servidor ou o endpoint devolver a contagem para o diálogo exibir.

---

## O que está BEM — não mexer

1. **Toda mutação amostrada desabilita no `isPending` com rótulo de gerúndio** —
   receber (`components/dialogo-receber-parcela.tsx:190-191`), pagar
   (`financeiro/pagar.tsx:698-699`), folha (`folha.tsx:441-442`), fechar
   comissão (`comissoes/index.tsx:570-571`), gerar contrato
   (`orcamentos/[id].tsx:1189-1190`), cancelar contrato
   (`contratos/[id].tsx:702-703`), convidar (`equipe/index.tsx:613-614`),
   agendar (`atendimentos/novo.tsx:706-707`), salvar vestido
   (`vestidos/vestido-form.tsx:200-201`), catálogo (`catalogo/novo.tsx:148`).
   Zero portas de duplo clique encontradas na amostra.
2. **O toast de sucesso nomeia o que aconteceu, nunca um "Salvo" genérico** —
   "Recebimento estornado", "Vestido fora de linha", a grade nomeia a mudança
   inteira ("Noiva → cabine, slot", `agenda/grade.tsx:162`), e a folha distingue
   "Competência já estava gerada" de "Contas lançadas" (`folha.tsx:364`) —
   ~40 títulos amostrados.
3. **Criar navega para o que criou**: noiva nova → ficha (`noivas/nova.tsx:40`),
   vestido novo → detalhe (`vestidos/novo.tsx:52`), atributo → catálogo
   (`catalogo/novo.tsx:72`); o agendamento reseta e oferece a confirmação de
   WhatsApp dentro do próprio toast (`atendimentos/novo.tsx:341-356`).
4. **`components/estado/index.tsx`** é a camada certa, com as decisões escritas
   nela (o `<Erro>` nasceu matando a perna `err.message` do componente velho) —
   é o molde de C1–C3, não algo a redesenhar. A coexistência com `ErroListagem`
   é decisão do E99 (trilha A, "está BEM" 8) — não é divergência a consertar:
   os 6 usos de `ErroListagem` também saem em `mensagemApi`.
5. **Os vazios de primeiro uso ensinam o caminho** — noivas
   (`noivas/index.tsx:194-206`), vestidos (`vestidos/index.tsx:559-569`),
   contratos (`contratos/index.tsx:77-93`), ajustes com contagem do que há
   adiante (`ajustes/index.tsx:195-218`), provas (`provas/index.tsx:109-118`),
   equipe nomeando o botão certo (F42, `equipe/index.tsx:410-418`), catálogo
   (`catalogo/index.tsx:68-76`). A regra do E99 ("porquê + próximo passo")
   virou prática mesmo fora do componente `<Vazio>`.
6. **O erro de listagem com "Tentar novamente" é o padrão de fato** — 20+ telas
   com `Alert destructive` + `mensagemApi` + refetch (`noivas/index.tsx:176-186`,
   `financeiro/receber.tsx:288-298`, `agenda/index.tsx:157-167`,
   `provas/index.tsx:92-101`…). C1–C3 são as exceções, não a regra.
7. **O estorno de Receber é a régua E10 aplicada com o valor CERTO e o porquê
   escrito** (`financeiro/receber.tsx:398-425`) — nomeia noiva, parcela e o
   RECEBIDO, com o comentário explicando por que não o previsto. É o molde do
   conserto de C5.
8. **O portal da noiva trata 404/410 como veredito, não como falha**
   (`noiva-portal.tsx:36-38`, `:137` — `retry: false` comentado, frase própria
   "Este link expirou. Peça um novo para a sua vendedora.").
9. **O diálogo de fechar comissões distingue "carregando" de "zero"**
   (`comissoes/index.tsx:577-598`, D7/E99) — a prova de que a classe de C1–C3
   já tem conserto com precedente no repo.

## Pistas laterais — de outras trilhas

- **(F — o plural entre parênteses)** O app pluraliza à mão com capricho
  (`mensagens/index.tsx:202`), mas "**movimento(s) conferido(s)**" sai num toast
  de conciliação (`financeiro/conciliacao.tsx:201-203`), "**vestido(s)**" num
  diálogo de revogação (`noivas/[leadId]/lookbook.tsx:276-279`) e "**ajuste(s)
  de costura**" chega do próprio servidor (`api-server/src/routes/agenda.ts:420`).
  Três "(s)" contra a voz do resto.
- **(F — título de diálogo sem pergunta)** Das 16 `AlertDialog`, 15 titulam com
  pergunta; "Remover ajuste" (`reservas/[bloqueioId].tsx:949`) é a única
  afirmativa seca — e a pergunta está duplicada na descrição.
- **(D — a falha do dashboard também é de hierarquia)** Enquanto o C3 não for
  fechado, qualquer instrumentação de "número mais usado" do painel (lente da
  trilha D) mede zeros de falha junto com zeros de verdade — as duas trilhas se
  tocam no mesmo `:316`.
- **(B — confirmada de cá)** O comentário F26 (`mensagens/index.tsx:149-153`)
  segue afirmando a paridade que o B2 mostrou não existir; o épico do B2 corrige
  a prosa junto — registrado lá, nada novo a abrir.
