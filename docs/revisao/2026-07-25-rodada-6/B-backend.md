# Trilha B — Backend: correção, segurança e dados

**Rodada 6** · commit `01729db` · concluída em 2026-07-25

## Resumo executivo

O sistema de permissão e escopo é bem melhor do que a média: `requireSessaoComLoja`
cruza o `:lojaId` da URL com a loja da sessão, `selecionar-loja` confere o vínculo
antes de gravar, `getPermissoes` é fail-closed, e o padrão de sub-recurso ("carrega
o filho, confere o PAI") está aplicado com rigor no checklist de ajuste, nas opções
de atributo, nas parcelas e nas avarias. As transações estão nos lugares certos,
as três idempotências que importam (fechamento de comissão, geração por
competência, aceite) têm constraint de banco embaixo do check-then-insert, e o
portal público checa TTL **e** revogação nas quatro rotas, sem exceção.

O que falha é sempre a mesma coisa em lugares diferentes: **o id que vem do CORPO**.
`lib/escopo-loja.ts` existe exatamente para isso, tem quatro funções prontas e um
docstring que descreve o ataque — e é usado só em `agenda.ts`, `reservas.ts`,
`lookbooks.ts` e `portal.ts`. Contrato (`vendedoraId`), orçamento (`leadId`), conta
a pagar (`colaboradorId`) e recorrência (`usuarioId`) entram sem conferência. Pior:
as rotas de **equipe** escrevem na tabela global `usuarios` pelo id do path, sem
cruzar com a loja — é a única falha de tenant deste código que não precisa de nada
além de um `curl` e o id da vítima, e ela derruba o administrador de outra loja.

Do lado dos dados, uma FK contraria explicitamente a decisão escrita no `replit.md`:
`contratos.vendedoraId` é `ON DELETE CASCADE`, então excluir uma vendedora apaga os
contratos e as parcelas PAGAS dela — e a rota que faz isso não tem guarda, nem
confirmação, nem trilha. Por fim, nenhuma das tabelas quentes tem índice em
`loja_id`, que é a primeira condição de literalmente toda query do sistema.

## Achados

### B1 — As rotas de equipe escrevem na tabela global `usuarios` SEM cruzar com a loja
- **Onde:** `artifacts/api-server/src/routes/equipe.ts:331-339` (o `where` é
  `eq(usuariosTable.id, params.data.usuarioId)`, sem nenhuma condição de loja),
  `:352` e `:421` (`encerrarSessoesDoUsuario`)
- **O quê:** `PATCH /lojas/:lojaId/equipe/:usuarioId` é gateado por
  `requireModulo("admin")` na loja da sessão (`:32`), e a troca de PERFIL está
  corretamente escopada (`:344-347` cruza `lojaId` × `usuarioId` em
  `usuarios_lojas`). Mas o UPDATE de `nome`/`ativo` vai direto na tabela global
  `usuarios` pelo id do path. A conferência de pertencimento só acontece no SELECT
  final (`:382-387`), **depois** que a transação commitou — o 404 é cosmético.
  `DELETE /lojas/:lojaId/equipe/:usuarioId` (`:392`) tem a irmã do mesmo problema:
  o `delete` de `usuarios_lojas` é escopado, mas o `encerrarSessoesDoUsuario` (`:421`)
  roda incondicionalmente sobre o id do path, e a rota responde 204 mesmo quando
  não removeu nada.
- **Por que importa:** cenário concreto. A dona da loja A tem o perfil Admin
  (`perfis.sistema`, módulo `admin`). Ela obtém o id da dona da loja B — ele aparece
  em qualquer resposta que traga `vendedora`/`criadoPorId`, ou vem de um usuário que
  atende às duas lojas — e dispara
  `PATCH /api/lojas/<A>/equipe/<id-da-dona-de-B>` com `{"ativo": false}`. Resultado:
  `usuarios.ativo` vira `false`; `buscarSessao` passa a devolver `null`
  (`lib/auth.ts:95`) e o login é recusado (`routes/auth.ts:39`); todas as sessões
  vivas dela caem (`:352`). A loja B fica sem administrador, derrubada por um tenant
  vizinho, e o registro de auditoria fica na loja A — onde a vítima nunca olha. O
  mesmo request com `{"nome": "…"}` renomeia qualquer usuário do sistema, inclusive
  um superadmin. Pelo DELETE, o efeito é um logout forçado repetível: DoS de sessão
  contra qualquer conta, sem tocar em dado nenhum.
- **Sugestão:** ler o vínculo `usuarios_lojas (lojaId, usuarioId)` ANTES de qualquer
  escrita e responder 404 quando não houver — `vendedoraNaLoja` em
  `lib/escopo-loja.ts:29` já faz exatamente isso e serve sem uma linha nova.
  Alternativamente, acrescentar o cruzamento por subquery no próprio `where` do
  UPDATE. Vale um teste de regressão no molde do `escopo-loja-api.test.ts`.
- **Severidade:** 🔴

### B2 — `contratos.vendedoraId` é `ON DELETE CASCADE`: apagar uma vendedora apaga os contratos e as parcelas PAGAS dela
- **Onde:** `lib/db/src/schema/contratos.ts:20`
  (`vendedoraId … references(() => usuariosTable.id, { onDelete: "cascade" })`),
  com `parcelas.contratoId` cascade (`lib/db/src/schema/financeiro.ts:14`),
  `contrato_itens.contratoId` cascade (`contratos.ts:63`),
  `comissao_fechamentos.vendedoraId` cascade (`comissao.ts:75`),
  `orcamentos.vendedoraId` cascade (`orcamentos.ts:16`) e
  `atendimentos.vendedoraId` cascade (`atendimentos.ts:67`). A porta é
  `artifacts/api-server/src/routes/admin.ts:273`
  (`db.delete(usuariosTable).where(eq(usuariosTable.id, …))`, sem guarda nenhuma).
- **O quê:** o `replit.md` fixa a regra — "campos de autoria são ON DELETE SET NULL,
  porque perder quem fez é recuperável e perder o registro do que aconteceu não é" —
  e o schema a respeita em `audit_log.usuarioId`, `pagamentos.colaboradorId`,
  `contas_pagar.colaboradorId`, `registros_cobranca.vendedorId` e
  `contratos.comissaoEstornoBaixaPor`, todos `set null`. As FKs de vendedora são a
  exceção, e como são `notNull` o `set null` sequer é possível: a única saída do
  banco é apagar a linha filha.
- **Por que importa:** cenário concreto. Uma vendedora sai do atelier. O superadmin
  abre Configurações → Usuários e exclui (`DELETE /api/admin/usuarios/:id`). O
  Postgres cascateia: somem todos os CONTRATOS que ela fechou, todas as PARCELAS
  deles (inclusive as PAGAS, com `recebidoEm`), o snapshot de itens, os vínculos de
  bloqueio, os orçamentos, os atendimentos e os fechamentos de comissão. O caixa
  realizado, o DRE e o histórico da noiva mudam retroativamente, sem erro, sem
  confirmação e sem trilha — a rota não chama `registrarAuditoria`, então não sobra
  nem o registro de que alguém apagou algo. O único freio existente hoje é
  `contratos.leadId` ser `restrict`, que protege o LEAD e não a vendedora.
- **Sugestão:** `onDelete: "restrict"` em `contratos.vendedoraId`,
  `comissao_regras.vendedoraId`, `comissao_fechamentos.vendedoraId` e
  `orcamentos.vendedoraId` (DDL versionado em `docs/migracoes/`, como manda o gotcha
  do `push`), e a rota traduzindo o 23503 no 409 que `classificarErro` já produz
  (`lib/erros.ts:86-88`): "esta pessoa tem contratos; inative em vez de excluir".
  Inativar (`usuarios.ativo`) já é o caminho suportado e preserva tudo.
- **Severidade:** 🔴

### B3 — Cancelar contrato com `destinoPago: "estornar"` apaga dinheiro recebido e NÃO deixa trilha
- **Onde:** `artifacts/api-server/src/routes/contratos.ts:507-519` (dentro da
  transação de `POST /lojas/:lojaId/contratos/:contratoId/cancelar`, iniciada em
  `:481`); compare com `POST /parcelas/:parcelaId/estornar` (`:674-699`), que
  registra `RECEBIMENTO_ESTORNADO`
- **O quê:** o cancelamento com `destinoPago: "estornar"` faz
  `set({ status: "CANCELADA", valorRecebido: null, recebidoEm: null, formaRecebimento: null })`
  em TODAS as parcelas PAGAS do contrato. A transação inteira (`:481-542`) não tem
  uma única chamada a `registrarAuditoria` — nem para o cancelamento em si, nem
  para o estorno em massa. `CONTRATO_CANCELADO` sequer existe em `ACOES_AUDITORIA`
  (`lib/auditoria.ts:11-34`).
- **Por que importa:** `valorRecebido` e `recebidoEm` são exatamente as colunas que
  alimentam o caixa realizado, o DRE e o `/financeiro/fluxo` (`financeiro.ts:672-695`
  filtra por `isNotNull(recebidoEm)`). Um cancelamento com `estornar` de um contrato
  com R$ 8.000 já recebidos derruba R$ 8.000 do realizado de um mês que talvez já
  tenha sido fechado com a contabilidade — e a tela de auditoria, que é a resposta
  da loja para "quem mexeu no caixa?", não mostra nada. A ação irmã e MENOR (estornar
  uma parcela) grava trilha; a maior não. Também é o caminho por onde a base de
  comissão muda sem rastro: o contrato vira CANCELADO e entra no estorno §6.4.
- **Sugestão:** acrescentar `CONTRATO_CANCELADO` à união de ações e registrá-lo
  dentro da mesma transação, com `motivo`, `destinoPago`, `valorTotal` e a soma do
  que foi desfeito nas parcelas — o `detalhe` do estorno avulso (`:690-696`) é o
  molde. Não é ganho de segurança, é ganho de reconstituição.
- **Severidade:** 🟠

### B4 — Ids do CORPO entram sem conferir a loja em quatro rotas de escrita
- **Onde:**
  - `routes/contratos.ts:247` — `vendedoraId: contratoData.vendedoraId` (nenhuma
    checagem entre `:106` e `:237`; `lead`, `orcamentoId` e `bloqueioVestidoId` são
    checados, a vendedora não)
  - `routes/orcamentos.ts:139-144` — `...parsed.data` inclui `leadId` cru
  - `routes/financeiro.ts:138-142` — `...parsed.data` inclui `colaboradorId`
    (`CreateContaPagarBody`)
  - `routes/financeiro.ts:571-581` — `usuarioId` da recorrência SALARIO
- **O quê:** `lib/escopo-loja.ts` foi escrito para este ataque e diz por quê no
  cabeçalho ("a FK do banco só garante que o id EXISTE, não a que loja pertence").
  Ele tem `leadNaLoja`, `cabineNaLoja`, `vendedoraNaLoja` e `reservaNaLoja` — e é
  importado só por `agenda.ts`, `reservas.ts`, `lookbooks.ts` e `portal.ts`.
  `comissao.ts` faz a checagem à mão em três rotas (`:322-329`, `:451-458`,
  `:1157-1164`), o que mostra que a regra é conhecida; contrato e orçamento passaram
  batido.
- **Por que importa:** dois efeitos, ambos concretos. (a) **Leitura cruzada**: um
  `POST /lojas/A/orcamentos` com o `leadId` de uma noiva da loja B cria uma linha em
  A apontando para B; o `GET /lojas/A/orcamentos` faz `with: { lead: true }`
  (`orcamentos.ts:118-122`) e devolve a ficha inteira da noiva da outra loja —
  `noivaNome`, `whatsapp`, `casamentoData`, `casamentoLocal`. Idem para
  `vendedoraId` no contrato: `GET /contratos` traz `with: { vendedora: true }`
  (`contratos.ts:87-90`), que inclui `email` e `isSuperAdmin`. (b) **Atribuição
  errada de dinheiro**: um contrato com `vendedoraId` de fora entra em
  `vendasDaCompetencia` (`comissao.ts:282-299`), que agrupa só por loja+status, e
  o fechamento gera uma conta a pagar de COMISSÃO nominal a alguém que não é da
  loja (`comissao.ts:1036-1046`) — sem que `POST /comissao/regras`, que exige o
  vínculo, jamais tenha sido chamado para ela.
- **Sugestão:** as quatro rotas chamam a função de escopo antes de inserir, com 422
  `REFERENCIA_INVALIDA` (o padrão de `lookbooks.ts:196-199`). E o
  `escopo-loja-api.test.ts` ganha os dois casos que faltam — contrato com vendedora
  de outra loja, orçamento com lead de outra loja —, que hoje passariam.
- **Severidade:** 🟠

### B5 — `acaoDoRequest` só conhece `/cancelar` e `/estornar`: POSTs que MUTAM (e um que DESTRÓI) caem em `criar`
- **Onde:** `artifacts/api-server/src/lib/permissoes.ts:96`
  (`if (metodo === "POST" && /\/(cancelar|estornar)$/.test(caminho)) return "editar"`)
- **O quê:** a exceção foi criada precisamente porque "a rota mentia sobre o que
  faz" (comentário em `:89-94`), mas a lista ficou com dois nomes. Os POSTs que
  mutam recurso existente e continuam derivando `criar`:
  - `POST /lojas/:lojaId/leads/expurgo` (`routes/leads.ts:280`) — **destrutivo e
    irreversível**
  - `POST /lojas/:lojaId/orcamentos/:id/aprovar` e `/recusar`
    (`routes/orcamentos.ts:322`, `:346`)
  - `POST /lojas/:lojaId/orcamentos/:id/link` (`routes/orcamentos.ts:288`) — mata o
    link anterior e vira RASCUNHO → ENVIADO
  - `POST /lojas/:lojaId/contas-pagar/:contaId/pagar` (`routes/financeiro.ts:155`)
  - `POST /lojas/:lojaId/financeiro/contabilidade/enviar` (`routes/financeiro.ts:1129`)
- **Por que importa:** o caso caro é o expurgo. Um perfil com `leads: {ver, criar}`
  e SEM `editar` — um estado válido e comum, "a estagiária cadastra noiva mas não
  altera" — pode disparar
  `POST /api/lojas/<id>/leads/expurgo` com `{"mesesInatividade": 0}` e anonimizar
  **todas** as noivas PERDIDAS da loja de uma vez (`leads.ts:291-310` sobrescreve
  `noivaNome`, `whatsapp`, `noivoNome`, `cerimonialista`, `casamentoLocal`). O
  próprio comentário do E77 diz "irreversível por desenho". A trilha registra
  `LEADS_ANONIMIZADOS`, então dá para saber quem foi — e nada mais. Os demais são
  menos graves, mas todos concedem a quem só pode CRIAR o poder de mudar o estado
  de algo que já existe.
- **Sugestão:** parar de inferir pelo sufixo. Ou (a) as rotas que mutam declaram a
  ação explicitamente — `requireModulo("leads", "editar")` no expurgo, aprovar,
  recusar e link; o portal já faz isso (`portal.ts:381`) —, ou (b) inverter o
  default: POST em caminho que termina em `:id/<verbo>` é `editar`, e só POST em
  coleção é `criar`. A opção (a) é menor e mais legível. Vale considerar uma quarta
  ação (`excluir`) só para o expurgo — hoje ele é a operação mais destrutiva do
  sistema atrás da permissão mais fraca que existe.
- **Severidade:** 🟠

### B6 — `POST /parcelas/:parcelaId/receber` é check-then-set: dois recebimentos simultâneos perdem um
- **Onde:** `artifacts/api-server/src/routes/contratos.ts:566` (o SELECT), `:592-609`
  (o cálculo do acumulado) e `:611-621` (o UPDATE, cujo `where` é só
  `eq(parcelasTable.id, existente.id)`)
- **O quê:** a rota lê `valorRecebido`, soma o que está entrando em centavos e grava
  o TOTAL — mas a leitura acontece fora da transação e o UPDATE não tem guarda de
  estado. Compare com os três lugares onde o repo faz certo: `portal.ts:255-259`
  (`isNull(confirmadoEm)` no `where`), `orcamentos-publico.ts:49-51`
  (`isNull(publicoAbertoEm)`) e `convites.ts:111-115` (`isNull(usadoEm)`) — os três
  com comentário explicando que é UPDATE condicional justamente por causa disso.
- **Por que importa:** cenário concreto de perda de dinheiro. Parcela de R$ 1.000,00
  ainda zerada. A recepção lança R$ 300,00 e, no mesmo segundo, a vendedora lança os
  R$ 700,00 do Pix que acabou de cair. Os dois requests leem `jaRecebidoC = 0`; o
  primeiro grava 300 (PARCIAL), o segundo grava 700 (PARCIAL) — o último a commitar
  vence, e a parcela fica com 700 em vez de 1.000. R$ 300 entraram no caixa da loja
  e não existem no sistema; a noiva segue devendo o que já pagou, e a trilha mostra
  DOIS `PARCELA_RECEBIDA` cujos valores não somam o `totalRecebido` gravado — o que
  torna o diagnóstico posterior possível, mas só para quem for procurar. O clique
  duplo no mesmo botão é a versão mais comum e produz o mesmo resultado.
- **Sugestão:** mover o SELECT para dentro da transação com `FOR UPDATE`, ou tornar
  o UPDATE condicional ao valor lido — `.where(and(eq(id, …), status !== 'PAGA',
  valorRecebido IS NOT DISTINCT FROM <lido>))` e responder 409 quando não retornar
  linha. A segunda opção é a que já está no vocabulário do repo.
- **Severidade:** 🟠

### B7 — `GET /lojas/:lojaId/dashboard` não tem gate de módulo e entrega números financeiros
- **Onde:** `artifacts/api-server/src/routes/dashboard.ts:19` — o único middleware é
  `requireSessaoComLoja`; a resposta inclui `receberProximos30Dias` (`:111`) e
  `pagarProximos30Dias` (`:112`)
- **O quê:** de todas as rotas `/lojas/:lojaId/…` do servidor, o dashboard e
  `/minha-comissao` (`comissao.ts:527`) são as únicas sem `requireModulo`. Em
  `/minha-comissao` isso é deliberado e está documentado (`:523-526`: o filtro é a
  sessão, `vendedoraId = req.usuario!.id`, e a colocação sai só como ordinal). No
  dashboard não há nada equivalente: a resposta é da LOJA inteira.
- **Por que importa:** cenário concreto. Uma costureira tem perfil só com
  `agenda: {ver}` — não vê financeiro, não vê leads, não vê comissão. Ela abre
  `/api/lojas/<id>/dashboard` (a tela inicial pede sozinha) e recebe a previsão de
  entrada e de saída de caixa dos próximos 30 dias, mais o total de contratos ativos
  e de leads da loja. É a informação que o gate `financeiro` existe para restringir,
  entregue pela porta ao lado. O `replit.md` é explícito: "a autoridade é sempre o
  servidor" — aqui o servidor não está exercendo nenhuma.
- **Sugestão:** decidir o que o dashboard é. Se é o painel de todo mundo, os campos
  de dinheiro só entram quando `podeNoModulo(permissoes, "financeiro", "ver")` (o
  contrato os marca como opcionais e a tela já esconde o card). Se é painel de
  gestão, `requireModulo("financeiro", "ver")` na rota inteira e a home de quem não
  tem passa a ser outra.
- **Severidade:** 🟠

### B8 — `DELETE /contas-pagar/:contaId` apaga a conta de COMISSÃO gerada por um fechamento, e o fechamento fica órfão
- **Onde:** `artifacts/api-server/src/routes/financeiro.ts:219-236` (a única guarda
  é `status === "PAGA"`); `lib/db/src/schema/comissao.ts:84`
  (`contaPagarId … { onDelete: "set null" }`)
- **O quê:** o fechamento de comissão gera uma `contas_pagar` tipo COMISSAO
  (`routes/comissao.ts:1036-1046`) e guarda o id em `comissao_fechamentos.contaPagarId`.
  O DELETE de conta a pagar não olha `tipo` nem `origemComissaoFechamentoId`: apaga
  a conta PREVISTA, e a FK zera o vínculo no fechamento em silêncio.
- **Por que importa:** cenário concreto. A tela de "Pagar" lista as contas do mês,
  incluindo "Comissão 2026-06 — Ana". Alguém acha que foi lançamento duplicado e
  remove. O fechamento de junho da Ana continua existindo (então `pendencias`
  não o acusa — `pendenciasDeFechamento` só procura competência SEM fechamento), o
  preview de junho responde `imutavel: true` com o valor apurado
  (`comissao.ts:642-663`), e a comissão simplesmente não tem mais conta a pagar.
  A Ana não recebe, e nada no sistema aponta para isso. Reabrir o fechamento também
  não repara: `comissao.ts:812-817` só apaga a conta se `contaPagarId` não for nulo —
  ele já é.
- **Sugestão:** recusar o DELETE quando `origemComissaoFechamentoId` não for nulo,
  com 409 dizendo que o caminho é reabrir o fechamento (mesma régua do "estorne o
  pagamento antes de remover a conta" já usada em `:230`). Alternativamente, um
  indicador em `GET /comissao/fechamentos` para fechamento com `contaPagarId` nulo
  que não seja de valor zero — hoje nada distingue "não gerou conta porque a
  comissão deu zero" de "a conta foi apagada".
- **Severidade:** 🟠

### B9 — Receber e estornar dinheiro de parcela está atrás do módulo `leads`, não de `financeiro`
- **Onde:** `artifacts/api-server/src/routes/contratos.ts:46`
  (`router.use("/lojas/:lojaId/parcelas", requireModulo("leads"))`), cobrindo
  `POST /parcelas/:id/receber` (`:558`), `POST /parcelas/:id/estornar` (`:649`) e
  `DELETE /parcelas/:id` (`:703`)
- **O quê:** o módulo `financeiro` gateia contas a pagar, pagamentos, fluxo, DRE,
  auditoria e recorrências (`routes/financeiro.ts:93-94`). O lado do RECEBIMENTO —
  o dinheiro que entra — está no módulo `leads`, junto com contratos. E o método
  resolve a ação: `receber` é POST → `criar`, então basta `leads: {criar}`.
- **Por que importa:** cenário concreto. O perfil "Vendedora" da fixture de teste
  concede `{leads, vestidos, agenda}` e nega `financeiro` de propósito
  (`__tests__/lote7-permissoes-api.test.ts:13-14`), justamente para provar que ela
  não entra no financeiro. Essa mesma vendedora pode registrar um recebimento de
  qualquer valor em qualquer parcela da loja — o que cria uma linha no caixa
  realizado e no DRE. Ela não pode VER o caixa, mas pode ESCREVER nele. E com
  `leads: {editar}` pode estornar (`estornar` cai em `editar` pela exceção do
  `acaoDoRequest`), desfazendo um recebimento registrado por outra pessoa. Pode ser
  decisão de produto ("quem fecha a venda registra o sinal"), mas então está
  indocumentada; se não é, é a maior brecha de separação de funções do sistema.
- **Sugestão:** se o recebimento pertence a quem vende, dizer isso num comentário
  em `contratos.ts:46` — a linha hoje não explica nada. Se não pertence, mover as
  rotas de parcela para `requireModulo("financeiro")` e deixar `leads` com a leitura
  (`GET /contratos/:id` já traz as parcelas).
- **Severidade:** 🟡

### B10 — Nenhuma tabela quente tem índice em `loja_id` — e ele é a primeira condição de toda query do sistema
- **Onde:** `lib/db/src/schema/` — varredura de todos os `index(`/`unique(`:
  `parcelas` (só `unique(contratoId, numero)`), `contas_pagar` (só o parcial de
  recorrência), `pagamentos` e `pagamento_itens` (**nenhum** índice),
  `contratos` (só `unique(orcamentoId)`), `contrato_itens` (nenhum), `leads`
  (nenhum), `orcamentos` (só o unique do token), `bloqueio_vestidos` (nenhum)
- **O quê:** `audit_log` tem `(lojaId, criadoEm)` (`auditoria.ts:34`), `convites`
  tem `lojaId` (`usuarios.ts:103`), `lookbooks` tem `(lojaId, leadId)`
  (`lookbooks.ts:26`), `comissao_regras` tem `(lojaId, vendedoraId, vigenciaInicio)`.
  Ou seja: a disciplina existe e foi aplicada às tabelas pequenas. Nas grandes, não.
  Vale lembrar que o Postgres **não** cria índice para FK — `parcelas.loja_id`,
  `pagamentos.loja_id` e `contratos.loja_id` são colunas sem estrutura nenhuma.
- **Por que importa:** toda query escopada por tenant começa em
  `where loja_id = ?`, e as do E79 acrescentam uma faixa de data sobre a mesma
  tabela: `financeiro.ts:672-695` (fluxo: parcelas por `recebidoEm` + pagamentos por
  `data` + parcelas abertas + contas abertas — quatro varreduras completas),
  `:766-783` (DRE), `:836-890` (alerta de caixa, chamado pelo sino a cada poll),
  `dashboard.ts:44-103` (sete agregados). Com uma loja e mil parcelas ninguém nota;
  com o multi-loja (E76) e três anos de histórico, cada request desses lê a tabela
  inteira de TODAS as lojas para responder por uma. E o `restrict` de
  `contratos.leadId` faz o `DELETE /leads/:id` varrer `contratos` sem índice.
- **Sugestão:** índice composto começando por `loja_id` e seguindo pela coluna de
  recorte de cada tabela: `parcelas (loja_id, vencimento)` e
  `parcelas (loja_id, recebido_em)`, `contas_pagar (loja_id, vencimento)`,
  `pagamentos (loja_id, data)`, `contratos (loja_id, fechado_em)`,
  `leads (loja_id, etapa)`. Mais `pagamento_itens (pagamento_id)` e
  `contrato_itens (contrato_id)`, que são lidos por join em toda montagem de
  extrato. É DDL puro, versionável em `docs/migracoes/`, sem uma linha de
  aplicação.
- **Severidade:** 🟡

### B11 — `criarVersaoEnviada` roda FORA da transação que marcou o orçamento como ENVIADO
- **Onde:** `artifacts/api-server/src/routes/orcamentos.ts:200-215` (o UPDATE de
  status e, depois dele, a chamada solta) e `:288-317` (o mesmo padrão na geração do
  link); a função em si está em `:48-97`, com `max(numero) + 1` em `:81-84`
- **O quê:** duas fragilidades no mesmo lugar. (a) Se `criarVersaoEnviada` falhar,
  o orçamento fica ENVIADO **sem versão congelada** — e o portal cai no ramo de
  fallback de `montarOrcamentoPublico` (`lib/visao-noiva.ts:57-91`), que mostra o
  conteúdo VIVO. É exatamente o que o E75 existe para impedir ("a noiva vê a última
  versão enviada, nunca o rascunho vivo"), e falha em silêncio: nada distingue
  "orçamento antigo, anterior ao versionamento" de "o congelamento quebrou".
  (b) `numero` vem de um `max()+1` lido fora de transação; o
  `uniqueIndex(orcamentoId, numero)` (`schema/orcamentos.ts:87`) segura a corrida,
  mas o 23505 sobe para `classificarErro` e a vendedora recebe um 409 "Registro
  duplicado ou conflito de dados" no meio de um "Enviar" que já mudou o status.
- **Por que importa:** o aceite da noiva (E74) prende `aceiteVersao` + `aceiteHash`
  à versão. Um ENVIADO sem versão é um aceite que não tem a que se prender — e o
  documento que a noiva concordou passa a ser "o que estiver no banco na hora em que
  ela clicar". É o único ponto do fluxo comercial em que o congelamento pode não
  acontecer sem ninguém saber.
- **Sugestão:** envolver status + versão na mesma `db.transaction` (o padrão já usado
  em `lookbooks.ts:203-215` e `contratos.ts:240-307`), e derivar `numero` do
  `count`/`max` dentro dela. Um `ON CONFLICT DO NOTHING` no insert da versão também
  resolveria a corrida sem o 409 opaco.
- **Severidade:** 🟡

### B12 — Resetar a senha de alguém pelo console não derruba as sessões dessa pessoa
- **Onde:** `artifacts/api-server/src/routes/admin.ts:248-259` — o reset grava
  `senhaHash` e `precisaTrocarSenha: true`, e nada mais
- **O quê:** três rotas do sistema mudam credencial ou acesso, e duas derrubam
  sessão dentro da transação: `/auth/senha` (`routes/auth.ts:125-131`, com o
  comentário explicando por que) e `PUT/DELETE /admin/lojas/:id/overrides`
  (`admin.ts:330`, `:375`). O reset de senha pelo superadmin é a terceira e não
  derruba.
- **Por que importa:** cenário concreto — o mesmo que o E57 documenta. Uma pessoa é
  desligada às pressas e o superadmin reseta a senha dela para cortar o acesso. Se a
  aba dela estiver aberta, a sessão continua válida por até 8 horas
  (`SESSAO_TTL_MS`, `lib/auth.ts:7`): ela segue navegando, criando contrato e
  recebendo parcela com a identidade dela na trilha, enquanto o admin já acredita
  ter fechado a porta. Marcar `ativo: false` resolveria — mas essa não é a ação que
  a tela oferece como "trocar a senha".
- **Sugestão:** `encerrarSessoesDoUsuario(tx, usuarioId)` dentro da mesma transação
  sempre que `senha` ou `ativo: false` vierem no corpo — a função já aceita executor
  de transação exatamente para isso.
- **Severidade:** 🟡

### B13 — O 400 devolve `parsed.error.message` cru do Zod
- **Onde:** 95 ocorrências de `res.status(400).json({ error: <parse>.error.message })`
  em `routes/`; por exemplo `routes/contratos.ts:100`, `routes/admin.ts:62`,
  `routes/equipe.ts:112`, `routes/orcamentos.ts:133`, `routes/portal.ts:85`
- **O quê:** `error.message` num ZodError é o JSON serializado do array de `issues`
  — com `path`, `code`, `expected`/`received` e a mensagem em INGLÊS. As rotas que
  fazem melhor existem e são a minoria: `{ error: "INTERVALO_INVALIDO", detalhe:
  "de/ate esperam AAAA-MM-DD" }` (`financeiro.ts:104`), `{ error: "FILTRO_INVALIDO" }`
  (`contratos.ts:79`).
- **Por que importa:** não é vazamento grave — o schema já é público via OpenAPI —,
  mas é a forma do corpo do orçamento e do contrato aparecendo no toast do usuário
  final ("Expected number, received string at parcelas.0.valorPrevisto"), e é
  inconsistente com o contrato de erro do resto da API (`{error, detalhe}` com
  código estável). A trilha F vai encontrar isso como mensagem incompreensível na
  tela; a trilha A já apontou que o contrato é a força deste repo — o formato de
  erro deveria fazer parte dele.
- **Sugestão:** um helper `erroDeValidacao(zodError)` que devolve
  `{ error: "CORPO_INVALIDO", campos: [{campo, motivo}] }` a partir de
  `error.issues`, usado nas ~40 chamadas. O código estável é o que a tela consegue
  traduzir para português.
- **Severidade:** 🟡

### B14 — Buracos de teste nas rotas que mais escrevem, e uma suíte de escopo que parou onde a regressão parou
- **Onde:** `artifacts/api-server/src/__tests__/` (87 arquivos)
- **O quê:** o que está coberto é bom — `escopo-loja-api.test.ts` prova os três
  casos de atendimento/reserva/bloqueio, `lote7-permissoes-api.test.ts` prova a
  matriz de módulo, `lote17-agenda-concorrencia` prova a corrida da agenda. O que
  falta é o que esta trilha achou:
  - **escopo de loja** de `POST /contratos` (vendedoraId) e `POST /orcamentos`
    (leadId) — o teste existente cobre só as três rotas da regressão C2 original
    e passaria intacto com o B4 presente
  - **`PATCH`/`DELETE /lojas/:lojaId/equipe/:usuarioId` com usuário de outra loja**
    (B1) — nenhum teste em `equipe-convites-api.test.ts` ou `equipe-gate-api.test.ts`
    toca o cross-tenant
  - **`POST /parcelas/:id/receber` concorrente** (B6) — há teste de corrida para a
    agenda e nenhum para dinheiro
  - **`DELETE /admin/usuarios/:id`** (B2) — nenhum teste; o cascade nunca foi
    exercitado
  - **`POST /leads/expurgo` sob perfil com `criar` e sem `editar`** (B5)
  - `lib/portal.ts` e `visao-noiva.ts` sem unitário — já apontado como A11, e a
    trilha B confirma que `montarOrcamentoPublico` tem DOIS ramos (com versão e
    sem), e só o ramo COM versão é exercitado pelos testes de API
- **Por que importa:** cada item acima é um achado desta trilha que a suíte não
  teria pego. O ponto não é o número de testes — é que os testes existentes cobrem
  exatamente as regressões que já aconteceram, e não a CLASSE delas. O
  `escopo-loja-api.test.ts` é o exemplo perfeito: ele prova três rotas e o comentário
  diz "o guard garante acesso à loja da URL, não que os IDs do corpo são dela" — a
  afirmação está certa e vale para outras quatro rotas que ele não testa.
- **Sugestão:** um teste por achado desta trilha, no molde de `escopo-loja-api.test.ts`
  (duas fixtures, agente da A, ids da B). Não vi nenhum teste dependendo de estado
  global além do já documentado no `replit.md` sobre a poda do backup —
  `backup-download-api.test.ts` cria a própria fixture, como manda o gotcha.
- **Severidade:** 🟡

### B15 — O parser de 6 MB da rota de foto é montado ANTES de qualquer autenticação
- **Onde:** `artifacts/api-server/src/app.ts:54`
  (`app.use("/api/lojas/:lojaId/vestidos/:vestidoId/fotos/:ordem", express.json({ limit: "6mb" }))`),
  registrado em `:54` — o router com os guards só entra em `:100`
- **O quê:** o parser roda no pipeline do app, não na rota. Qualquer request para
  esse caminho, com ou sem cookie de sessão, tem o corpo lido e parseado como JSON
  até 6 MB antes de o `requireSessaoComLoja` de `vestidos.ts:51` sequer ser
  alcançado. O caminho não está coberto por nenhum dos quatro rate limiters
  (`:68`, `:80-84`, `:95`, `:98`).
- **Por que importa:** um anônimo com um loop simples envia N × 6 MB de JSON e
  consome CPU de parsing e memória de heap do processo — sem login, sem teto de
  requisições. Não expõe dado nenhum, é só disponibilidade, e o Replit tem proteção
  de borda; mas é o único ponto do servidor onde trabalho não trivial acontece antes
  do gate. A ordem do parser em si está certa e o comentário explica bem por quê —
  o problema é o escopo do `app.use`, não a decisão.
- **Sugestão:** aplicar o `express.json({ limit: "6mb" })` como middleware DA ROTA,
  depois de `requireSessaoComLoja` e `requireModulo("vestidos")`, em
  `vestidos.ts:484`. O parser global de 100 kb continua rejeitando o resto, e o
  `ehCorpoGrandeDemais` (`lib/erros.ts:52`) segue traduzindo em 413.
- **Severidade:** 🔵

## O que está BEM (não mexer)

- **O portal público está correto nas quatro rotas.** `GET /portal`,
  `POST /portal/aceite`, `POST /portal/provas/:id/confirmar` e `GET /portal/foto`
  passam TODAS por `buscarPorToken` (que recusa revogado, `portal.ts:60`) e checam
  `expiraEm` logo depois — não há uma rota que tenha esquecido. O escopo é sempre
  pelo `leadId` DO TOKEN, nunca por id vindo do cliente: a prova de outra noiva é
  404 mesmo existindo (`:230-236`), a foto de vestido fora do lookbook DELA é 404
  (`:302-319`), e o extrato sai só do contrato ATIVO daquela noiva (`:127-144`). O
  404 para revogado é decisão consciente e certa. Token em query com o logger
  cortando `?` (`app.ts:24-30`), 256 bits, unique index — enumeração está fora de
  alcance.
- **O padrão "sub-recurso confere o PAI" está aplicado com disciplina.**
  `itemChecklistDaLoja` (`agenda.ts:515-522`) carrega o item e compara
  `item.ajuste.lojaId`; `catalogo.ts:136-146` e `:170-178` fazem o mesmo com a opção
  e o atributo; parcela, avaria e item de orçamento carregam `lojaId` próprio e o
  usam no `where`. Procurei um `:id` de filho buscado direto e não achei nenhum.
- **As três idempotências têm constraint embaixo, não só um SELECT.**
  `unique(contratoId, numero)` em parcelas com o comentário explicando a corrida do
  `gerar-plano`; `uniqueIndex` parcial `(lojaId, competencia, recorrenciaId)` com o
  `onConflictDoNothing` que repete o predicado (detalhe que quase todo mundo erra);
  `unique(lojaId, vendedoraId, competencia)` no fechamento, com o 23505 traduzido em
  409 idempotente (`comissao.ts:984-990`). O fechamento lê vendas, estorno e regra
  DENTRO da transação, no mesmo instante da escrita — está escrito e está feito.
- **Autoria vem da sessão, sem exceção.** Varri as inserções: `orcamentos.vendedoraId`
  é sobrescrito por `req.usuario!.id` mesmo que o corpo mande algo
  (`orcamentos.ts:143`), `lookbooks.criadoPorId` idem, `avarias.registradoPorNome`
  idem, `registrarAuditoria` só aceita `req.usuario`. As duas exceções são as ações
  da NOIVA pelo portal, que gravam `usuarioId: null` com nome desnormalizado
  ("… (link público)") — que é o desenho certo.
- **Resposta à pista da trilha A sobre o estorno das duas portas de pagamento:** o
  estorno trata as duas igual, e por construção. `POST /pagamentos/:id/estornar`
  (`financeiro.ts:361-393`) trabalha a partir de `pagamento_itens`, que as duas
  rotas escrevem do mesmo jeito — não há caminho em que uma conta paga pelo
  single-conta escape do estorno. O `unique(contaPagarId)` também protege as duas
  simetricamente.
- **`normalizarAcessos` é fail-closed de verdade** e a ponte com o formato plano
  antigo não alarga permissão. `getPermissoes` devolvendo `null` para superadmin
  (bypass) e `null` para "sem vínculo" é ambíguo no tipo, mas o guard trata os dois
  casos na ordem certa (`middlewares/auth.ts:78-86`: superadmin sai antes) — não é
  bug, mas é a linha do arquivo que eu leria duas vezes antes de mexer.
- **`selecionar-loja` confere o vínculo antes de gravar `lojaAtivaId`**
  (`auth.ts:155-167`). É essa checagem que faz as duas rotas sem `requireModulo`
  (dashboard e minha-comissão) não serem uma falha de tenant — só uma falha de
  módulo (B7).
- **`classificarErro` não vaza nada.** 500 genérico, stack só no log, 23505/23503/23P01
  traduzidos, e o `RESPOSTA_FORA_DO_CONTRATO` greppável para ZodError de saída. O
  Express 5 encaminha a promise rejeitada do handler async sozinho, então não há
  `try/catch` faltando — os únicos `catch` explícitos (`equipe.ts:241`,
  `comissao.ts:980`) existem para traduzir o 23505 em 409 nomeado, que é o uso certo.

## Pistas para as outras trilhas

- **C (financeiro):** o B6 é de vocês tanto quanto meu — o lost update no
  `receber` é a única forma que encontrei de dinheiro real sumir do sistema por
  uso normal. Somem a ele o B3 (cancelar contrato com `estornar` zera
  `valorRecebido`/`recebidoEm` de parcelas PAGAS, mudando o caixa realizado de um
  mês possivelmente já fechado com a contabilidade — confiram se o
  `/financeiro/contabilidade/enviar` deveria travar o período) e o B8 (a conta de
  comissão apagável). Vale também olhar `contratos.ts:57-61` (`liquidoEmCentavos`)
  contra `visao-noiva.ts:65-71`: são a MESMA regra de desconto escrita duas vezes,
  uma em centavos inteiros e a outra em float com `round2` — e é o número que a
  noiva vê contra o número que o servidor valida no fechamento do contrato.
- **D (frontend):** `GET /lojas/:lojaId/portais` (`portal.ts:350-360`) devolve a
  linha inteira de `portal_tokens`, com o TOKEN, de TODAS as noivas da loja, e é
  chamada em lote pelo E84. É o desenho pretendido, mas significa que a lista de
  links vivos passa pelo cliente inteira — vale conferir se ela não está sendo
  cacheada/logada em algum lugar do lado de lá. Também: o B13 é a origem daquelas
  mensagens de erro em inglês nos toasts.
- **E/F (UI/UX):** o B7 muda o que a home DEVE mostrar por perfil, e o B5 é uma
  lista de ações que a tela provavelmente já esconde de quem não pode — mas o
  servidor não. Se a UI já esconde "Expurgar" de quem não tem `leads:editar`, a
  correção do B5 é só alinhar o servidor com o que o produto já decidiu; se não
  esconde, é decisão de produto a tomar.
- **G (consolidação):** B1, B2 e B4 são a mesma família (identidade e escopo de
  tenant) e provavelmente devem virar UM épico; B10 é DDL puro e cabe no mesmo
  épico do B2 (as duas mudanças mexem em `docs/migracoes/`). B14 não é épico
  próprio: é o teste que acompanha cada correção acima.
