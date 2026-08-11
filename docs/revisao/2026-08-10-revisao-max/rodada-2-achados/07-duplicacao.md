# Ângulo 7 — duplicacao
**Rodada 2, base 89b38c8** · localizador + cético por achado

Três achados sobreviveram ao cético, os três com as duas cópias lidas neste
run. Nenhum achado foi refutado. Oito famílias de duplicação foram varridas e
confirmadas consistentes — estão listadas na Cobertura, para que a próxima
rodada não as reabra.

## Sobreviventes

### 1. 🟠 O diálogo de receber parcela existe em duas grafias, e a do contrato perde a data do recebimento

**Âncora:** `artifacts/moscow-noivas/src/pages/contratos/[id].tsx:340` · sobra enumerada: nenhuma

**Evidência.** `contratos/[id].tsx:327-341` (`onReceber`):
`await receber.mutateAsync({ ... data: { valorRecebido: valor, recebidoEm: new Date().toISOString(), ...(formaRecebimento ? { formaRecebimento } : {}) } })`
— o diálogo da página (linhas 763-812) tem campo de valor e forma, mas NENHUM
campo de data. A cópia canônica, `components/dialogo-receber-parcela.tsx:49-54`,
lista as "três coisas que o tornam correto e que uma segunda cópia perderia", e
a 2ª é exatamente esta: "`recebidoEm` é um INSTANTE. Para hoje vale o agora
real; para um dia passado, meio-dia de São Paulo mantém o dia local correto" —
implementada nas linhas 86 e 111-112
(`dataRecebimento === hojeLocal() ? new Date().toISOString() : diaParaISO(dataRecebimento)`).

**Mecanismo.** F28/E98 extraiu o diálogo de receber para o componente
compartilhado (usado por `financeiro/receber.tsx:473` e
`financeiro/cobranca.tsx:454`) justamente para que não existisse segunda cópia
— mas a página do contrato manteve a dela (estado nas linhas 116-119, submit em
327-354, markup em 763-812). As duas gravam pela MESMA rota
`POST /parcelas/:id/receber`, e divergem em: (1) a cópia do contrato carimba
`recebidoEm = agora` sempre, sem campo de data — o recebimento de um dia
passado é impossível de registrar no dia certo por ali, e a vendedora nem vê
que uma data está sendo gravada; (2) a cópia do contrato não tem `<form>` — o
conserto do E136 ("o diálogo de dinheiro MAIS usado do sistema não tinha
`<form>`") foi aplicado só no componente, então Enter/tecla "ir" do celular não
submete na tela do contrato; (3) `rotuloParcela` está reescrito localmente
(linha 377) apesar de o componente exportá-lo. O `recebidoEm` é o instante pelo
qual fluxo de caixa, DRE, tendência e conciliação datam a entrada
(`financeiro-core/caixa.ts:108-111`, `entradasDoIntervalo` por
`instanteNoIntervalo(recebidoEm)`).

**Consequência.** A noiva paga R$ 1.500,00 por Pix no sábado 08/08;
segunda-feira a vendedora, na ficha do contrato (o caminho natural — o botão
"Receber" está na linha da parcela, `contratos/[id].tsx:570`), registra o
recebimento. O sistema grava `recebidoEm` = 10/08: o fluxo de caixa de sábado
fecha R$ 1.500,00 menor que o extrato do banco, o de segunda R$ 1.500,00
maior, e a conferência do dia 08 acusa diferença que não existe. Pela tela
Receber/Cobrança o mesmo lançamento sairia no dia certo — o dia do dinheiro
depende de QUAL tela foi usada.

**Veredito do cético (🟠 confirmada).** Confirmado com todas as âncoras lidas
neste run: `contratos/[id].tsx:340` carimba
`recebidoEm = new Date().toISOString()` sempre, o diálogo local (763-811) não
tem campo de data nem `<form>`, e `rotuloParcela` está reescrito na linha 377;
a cópia canônica (`dialogo-receber-parcela.tsx:86, 111-112, 148-153, 169-175`)
tem data, a lógica hoje-vs-dia-passado e o `<form>` do E136, e é usada só por
`receber.tsx:473` e `cobranca.tsx:454` — a página do contrato não a importa.
Não há guarda noutra camada: o servidor grava o instante do cliente verbatim
(`api-server/src/routes/contratos.ts:1087`) e o caixa data a entrada por ele
(`financeiro-core/caixa.ts:110`). Não é duplicata de nenhum dos 15 fechos de
hoje nem das 4 sobras abertas, e não há decisão escrita mantendo a cópia do
contrato. O exemplo de dinheiro fecha: R$ 1.500,00 pagos sábado 08/08 e
lançados segunda pela ficha do contrato saem datados de 10/08 — o caixa de
sábado fica R$ 1.500,00 menor que o extrato e o de segunda R$ 1.500,00 maior.

### 2. 🟡 "Lead ativo" tem duas réguas: o console da rede conta DEVOLVIDO como ativo, o dashboard da loja não

**Âncora:** `artifacts/api-server/src/routes/admin.ts:670` · sobra enumerada: nenhuma

**Evidência.** `admin.ts:668-671` (`GET /admin/consolidado`):
``.from(leadsTable).where(sql`${leadsTable.etapa} <> 'PERDIDO'`)`` alimenta o
campo `leadsAtivos` da resposta (linha 705). `dashboard.ts:89-92`
(`GET /lojas/:lojaId/dashboard`):
`.from(leadsTable).where(and(eq(leadsTable.lojaId, lojaId), ne(leadsTable.etapa, "PERDIDO"), ne(leadsTable.etapa, "DEVOLVIDO")))`
alimenta `totalLeadsAtivos` (linha 161).

**Mecanismo.** As duas consultas respondem a mesma pergunta — quantos leads
ativos a loja tem — sob o mesmo nome de campo (`leadsAtivos` no consolidado,
`totalLeadsAtivos` no dashboard; `openapi.yaml:417-421` e `6821-6823`), mas o
filtro do consolidado exclui só PERDIDO enquanto o do dashboard exclui PERDIDO
e DEVOLVIDO. DEVOLVIDO é a etapa final feliz do funil (enums:
NOVO → … → CASAMENTO_REALIZADO → DEVOLVIDO): toda noiva que casou e devolveu o
vestido termina ali, para sempre. A régua do consolidado, portanto, não diverge
por um caso raro — ela diverge por TODO cliente concluído, e a diferença só
cresce com a vida da loja.

**Consequência.** Uma loja com 120 leads históricos, sendo 60 DEVOLVIDO e 20
PERDIDO: a dona da loja abre o dashboard e lê 40 leads ativos; a dona da rede
abre o console e lê 100 na linha da MESMA loja — 2,5× o número real, inflado
por todo casamento já realizado. Os dois números têm o mesmo nome na tela e
nunca vão bater, e a divergência aparece exatamente para quem compara lojas
para decidir onde investir atenção.

**Veredito do cético (🟡 confirmada).** Achado fica de pé, com todas as
âncoras conferidas neste run: `admin.ts:668-671` filtra só
`etapa <> 'PERDIDO'` e alimenta `leadsAtivos` (linha 706), enquanto
`dashboard.ts:92` exclui PERDIDO e DEVOLVIDO para `totalLeadsAtivos`
(linha 161). DEVOLVIDO é a etapa final feliz do funil (`enums.ts:5-17`, depois
de CASAMENTO_REALIZADO), então a divergência cresce com toda cliente
concluída. Não há guarda em nenhuma camada: o spec
(`lib/api-spec/openapi.yaml:421` e `6823` — o achado citava
`artifacts/openapi.yaml`, que não existe) declara os campos como integer sem
régua; o único teste (`consolidado-api.test.ts:37`) só afirma >= 1 e não fixa
o filtro; nenhum doc versionado registra decisão de incluir DEVOLVIDO. E as
duas telas prometem a MESMA régua: o console rotula "Noivas no funil"
(`admin/index.tsx:119`) e o dashboard "Noivas ativas / No funil"
(`dashboard.tsx:396-401`) — uma noiva DEVOLVIDO já saiu do funil, logo o
rótulo do console contradiz a própria consulta. Não é duplicata dos 15 fechos
de hoje nem tem a forma de nenhuma das 4 sobras abertas. Severidade 🟡
mantida: gatilho certo, mas o custo é um contador gerencial inflado, sem perda
de dinheiro ou dado.

### 3. 🟡 O cartão da fila do dia no dashboard ignora a metade persistente do "já cobrada hoje" (S-D13) e promete mais mensagens do que a fila mostra

**Âncora:** `artifacts/moscow-noivas/src/pages/dashboard.tsx:203` · sobra enumerada: nenhuma

**Evidência.** `dashboard.tsx:201-205`:
`const aContatar = aContatarNaJanela(...).length; const emAtraso = agingDeParcelas(parcelasAbertas.data ?? []).noivas.length; const vencendo = orcamentosVencendoNaJanela(...).length; return resumoDaFila(aContatar + emAtraso + vencendo);`
— todas as inadimplentes contam. `mensagens/index.tsx:253-263`:
`const filaCobranca = ... particionaPorCobranca(inadimplentes, new Map([...persistentes, ...marcas])) ... const totalFila = aContatar.length + filaCobranca.aCobrar.length + orcamentosVencendo.length;`
— onde
`persistentes = marcasPersistentesDeCobranca(inadimplentes, hojeLocal(), diaLocal)`
(linha 258) tira da fila quem já foi cobrada no dia de hoje da loja.

**Mecanismo.** O F7 criou `lib/mensagens-do-dia` com o contrato explícito de
que "duas contagens da mesma fila divergem no primeiro ajuste de janela — e
divergir aqui é pior que não contar: o painel prometeria três mensagens e a
fila mostraria cinco" (`mensagens-do-dia.ts:9-12`), e o próprio dashboard
afirma contar "com a MESMA régua" (`dashboard.tsx:157-158`). A S-D13 depois
mudou a régua da fila de cobrança em /mensagens: noiva com `ultimoContatoEm`
caindo no dia de hoje da loja sai de `aCobrar`
(`mensagens-do-dia.ts:183-194`). O call-site do dashboard ficou para trás:
soma `aging.noivas.length` inteiro, sem aplicar
`marcasPersistentesDeCobranca` — apesar de o dado já estar em mãos
(`agingDeParcelas` devolve `ultimoContatoEm` por noiva, `cobranca.ts:87` e
`184`) e de as duas funções serem exportadas do mesmo módulo. É a S-M13 em
forma de contagem: a mesma régua em duas grafias, uma atualizada e uma não.

**Consequência.** Manhã com 2 atendimentos a confirmar, 6 noivas inadimplentes
e 1 orçamento vencendo: a recepcionista cobra 4 noivas pela fila (cada uma com
registro gravado e `ultimoContatoEm` de hoje), volta ao dashboard e o cartão
segue dizendo "9 mensagens prontas para enviar" enquanto /mensagens mostra 5.
O número só se corrige à meia-noite da loja. O cartão que existe para dizer "o
que precisa da sua atenção agora" superconta o dia inteiro de trabalho de
cobrança — a divergência exata que o F7 declarou ser pior que não contar.

**Veredito do cético (🟡 confirmada).** Achado fica de pé, verificado nas três
âncoras: `dashboard.tsx:203` soma `agingDeParcelas(...).noivas.length` inteiro
(e o arquivo importa só `agingDeParcelas`, linha 50), enquanto
`mensagens/index.tsx:251-263` aplica `marcasPersistentesDeCobranca` +
`particionaPorCobranca` e conta só `aCobrar` — a divergência que
`mensagens-do-dia.ts:9-12` declara ser pior que não contar. Não há guarda
noutra camada: `agingDeParcelas` já devolve `ultimoContatoEm` por noiva
(`cobranca.ts:87/157/184`), o dado está em mãos e não é usado; os testes de
`mensagens-do-dia.test.ts` pregam a biblioteca, não o call-site do dashboard.
Não é duplicata (S-D13 fechou só /mensagens; não está na tabela de hoje nem é
sítio das 4 sobras abertas). Conta do exemplo confere: 2+6+1=9 no cartão
contra 2+2+1=5 na fila após 4 cobranças do dia.

## Refutados

Nenhum achado deste ângulo foi refutado: os três que o localizador levantou
sobreviveram ao cético com severidade mantida.

| Título | Âncora | Refutação do cético |
|---|---|---|
| — | — | — |

## Cobertura

**Teto atingido: não.** 3 achados verdadeiros, cada um com as duas cópias
lidas neste run.

Famílias varridas e CONFIRMADAS consistentes (não reportadas):

- **Régua de dígitos do WhatsApp** — `equipe.ts:59` `viraLinkDeWhatsApp` é
  cópia de `whatsapp.ts:15-19`, mas idêntica e com comentário "está anotado
  como sobra", logo já reclamada.
- **escaparCsv/montarCsv** — `exportar.ts` é espelho declarado e byte-idêntico
  de `api-server/lib/csv.ts`.
- **diaLocal/inicioDoDia/addDias triplicados** (`disponibilidade.ts`,
  `financeiro-core/datas.ts`, `agenda-core/slots.ts`) — mesmas escolhas
  (en-CA, -03:00 fixo, UTC-meio-dia), sem divergência.
- **Janela de prova** front (`janela-de-prova.ts`: prova−uso) vs API
  (`disponibilidade.ts:210-212`) — algebricamente iguais.
- **Busca de lead por dígitos** — `leads.ts:110-115` e `busca-lead.ts:27-35`
  idênticas com `padraoDeBusca` compartilhado (S-M14).
- **parseValor/brl/plano/saldoAberto/estaAberta/STATUS_ABERTO** —
  centralizados no financeiro-core, call-sites conferidos (dashboard, admin
  consolidado, portal, contratos).
- **Competência da comissão** (`comissao.ts:215-216`, meia-noite -03:00) vs
  `intervaloDaCompetencia` do core — representações diferentes do mesmo corte.
- **recebidoNoMes do consolidado** (`recebido_em >= inicioMes`) segue a régua
  E115 do core (`teveRecebimento`).

Observação lateral ao achado 1: a cópia do contrato também não tem `<form>`
(E136 aplicado só no componente) e redefine `rotuloParcela` localmente —
citados no mecanismo, não como achados separados.
