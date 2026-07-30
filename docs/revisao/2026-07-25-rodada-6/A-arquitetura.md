# Trilha A — Arquitetura, contrato e dívida estrutural

**Rodada 6** · commit `01729db` · concluída em 2026-07-25

## Resumo executivo

A espinha do sistema está sadia e é rara: o contrato bate quase perfeitamente com
a implementação (177 operações no OpenAPI × 178 nas rotas, **uma** sobra e **zero**
faltas), não há um único `as any` ou `@ts-ignore` em código de produção, e os três
motores puros (`financeiro-core`, `funil-core`, `agenda-core`) são consumidos pelos
dois lados com teste de verdade. A poda do E88 fez o serviço na lib do front: não
sobrou export de FUNÇÃO órfão. E não achei nenhuma violação do padrão de rotas
`/loja/:lojaId/…` — o `LegacyRedirect` continua sendo só compatibilidade.

O que preocupa é o que sobrou nas BORDAS. Três coisas escapam do desenho: (1) a
tela de orçamento recalcula, em float, o rateio de parcelas e o total com desconto
que o servidor já resolve em centavos inteiros — as duas implementações já divergem
hoje; (2) existem DUAS rotas para "pagar conta a pagar" no servidor, com trilhas de
auditoria diferentes, e a suíte de testes exercita justamente a que a UI **não**
usa; (3) 22 MB e 1.611 arquivos de `.migration-backup/` estão versionados,
envenenando toda busca no repo. Somam-se a isso 3.701 linhas de shadcn/ui sem
consumidor, um pacote inteiro (`mockup-sandbox`) que não produz nada mas entra no
typecheck e no build, e o padrão sistemático de "uma página = um componente de mil
linhas", que é onde as próximas trilhas vão tropeçar.

## Achados

### A1 — O plano de parcelas é calculado DUAS vezes, e a cópia do front soma em float
- **Onde:** `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:426-443` vs.
  `artifacts/api-server/src/lib/parcelas.ts:13` (`ratearRestante`)
- **O quê:** o servidor tem o rateio como função pura, em centavos inteiros, com
  invariantes provadas por propriedade (`lote25-rateio-parcelas-unit.test.ts`). A
  tela de orçamento não a usa: ao "Gerar contrato" ela monta o array de parcelas
  sozinha, em reais float
  (`const base = Math.floor((restante / numParcelas) * 100) / 100`, linha 433) e
  manda pronto no `POST /lojas/:lojaId/contratos`.
- **Por que importa:** as duas implementações **já divergem**. Rodando ambas para
  todo restante entre R$ 100,00 e R$ 12.000,00 com n de 2 a 12: `restante=100,02`,
  `n=3` → front `33,33 / 33,33 / 33,36`, servidor `33,34 / 33,34 / 33,34`;
  `restante=100,05`, `n=5` → front `20,00 ×4 + 20,05`, servidor `20,01 ×5`. A soma
  fecha, então o 422 `SOMA_PARCELAS_DIVERGE` (`routes/contratos.ts:191-196`) não
  dispara e o erro passa silencioso: o carnê da noiva sai com a última parcela
  inchada em até n−1 centavos por arredondamento binário. É exatamente o que a
  regra "dinheiro soma em CENTAVOS INTEIROS" (`replit.md`) existe para impedir, e
  a rota `gerar-plano` (`routes/contratos.ts:774`) já resolve certo — a tela é que
  não a chama.
- **Sugestão:** a tela para de montar parcelas. Ou (a) `POST /contratos` sem
  `parcelas` seguido de `POST /contratos/:id/parcelas/gerar-plano`, ou (b)
  `ratearRestante` sobe para `@workspace/financeiro-core` e a tela importa a MESMA
  função. (b) é o padrão já estabelecido no repo (E25/E27/E28).
- **Severidade:** 🟠

### A2 — Duas rotas escrevem "conta paga", e os testes cobrem só a que a UI abandonou
- **Onde:** `artifacts/api-server/src/routes/financeiro.ts:155` (`POST
  /lojas/:lojaId/contas-pagar/:contaId/pagar`) e `:269` (`POST
  /lojas/:lojaId/financeiro/pagamentos`)
- **O quê:** os dois caminhos fazem a mesma coisa — inserem `pagamentos` +
  `pagamento_itens` e viram a conta para `PAGA` (`:177-196` e `:317-337`). A UI usa
  só o multi-conta: o hook gerado `usePagarContaPagar` não aparece em nenhum
  arquivo de `artifacts/moscow-noivas/src`. Já os testes usam quase só o single:
  `lote8-financeiro-api.test.ts:37,63,67`, `lote15-caixa-realizado.test.ts:50`,
  `lote20-auditoria-api.test.ts:75`, `reabrir-fechamento-api.test.ts:137` e
  `e2e/33-auditoria-filtros.spec.ts:44`.
- **Por que importa:** duas coisas. (a) As trilhas de auditoria são DIFERENTES —
  `CONTA_PAGA` sobre `entidade: "conta_pagar"` (`:200-202`) contra
  `PAGAMENTO_REGISTRADO` sobre `entidade: "pagamento"` (`:341-343`): o histórico
  de quem pagou o quê depende de por qual porta se entrou. (b) A rota que a
  vendedora realmente usa é a menos testada; uma regressão no rateio proporcional
  do multi-conta (`:304-308`) passaria por toda a suíte de `contas-pagar`.
- **Sugestão:** decidir qual é a porta. Se for a multi-conta, o single-conta vira
  um wrapper fino sobre ela (um único `contaId` na lista) e os testes migram —
  assim a auditoria fica uniforme e a suíte exercita o caminho vivo. Se o single
  precisa existir por compat, ao menos os testes de caixa/auditoria devem passar a
  cobrir o multi.
- **Severidade:** 🟠

### A3 — `round2` e a regra de desconto do orçamento vivem em três lugares
- **Onde:** `artifacts/api-server/src/lib/dinheiro.ts:10` (canônico),
  `artifacts/api-server/src/lib/visao-noiva.ts:65-70`,
  `artifacts/api-server/src/routes/orcamentos.ts:63-68`,
  `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:69-71` e `:185-194`
- **O quê:** o E88 unificou `round2` **no servidor** ("round2 único (lib do
  server), importado pelas rotas de orçamento e pela visao-noiva") e deixou a
  terceira cópia intacta: a tela redeclara `round2` local (`:69`) e reescreve
  bruto/líquido/desconto (`:186-192`) com a mesma aritmética das duas cópias do
  servidor.
- **Por que importa:** o `valorTotal` que a tela envia é conferido contra o cálculo
  do servidor (`routes/contratos.ts:176-186`, 422 `VALOR_TOTAL_DIVERGE`). No dia em que
  a regra de desconto mudar (piso, desconto por item, outro arredondamento), o
  servidor recusa o contrato e a tela não sabe explicar — o usuário vê um 422 opaco
  no meio da venda. O épico E88 ficou pela metade.
- **Sugestão:** `totalOrcamento(itens, descontoTipo, descontoValor)` como função
  pura num core compartilhado, consumida pelas duas rotas do servidor e pela tela.
  A direção já está apontada pelo E88; falta o lado do cliente.
- **Severidade:** 🟠

### A4 — `.migration-backup/` está VERSIONADO: 1.611 arquivos, 22 MB de um app morto
- **Onde:** raiz do repo, `.migration-backup/`; `.gitignore` (59 linhas) não a
  cobre — cobre `backups/` (última linha) e `dist`/`node_modules`, não esta
- **O quê:** uma cópia congelada da estrutura pré-migração segue rastreada pelo
  git: 1.025 arquivos em `.migration-backup/app/`, 493 em
  `.migration-backup/artifacts/`, mais `.claude/skills/`, `.agents/memory/` e um
  `replit.md` antigo — 22 MB no total (`git ls-files | grep '^\.migration-backup/'
  | wc -l` → 1611).
- **Por que importa:** todo grep/glob do repo — humano ou de agente — cai em código
  morto com nomes idênticos aos arquivos vivos. É a maior fonte de falso positivo
  em qualquer auditoria: nesta trilha foi preciso filtrar `.migration-backup` de
  praticamente toda busca, e um `replit.md` desatualizado ali dentro é uma armadilha
  pronta. O histórico do git já é o backup do backup.
- **Sugestão:** `git rm -r --cached .migration-backup` + entrada no `.gitignore`
  (o conteúdo permanece recuperável pelo histórico). Se algo ali ainda importa
  (skills, memória de agente), promover para o lugar certo antes de remover.
- **Severidade:** 🟠

### A5 — 27 componentes shadcn/ui sem um único consumidor (3.701 linhas)
- **Onde:** `artifacts/moscow-noivas/src/components/ui/` — `accordion`,
  `aspect-ratio`, `avatar`, `breadcrumb`, `button-group`, `carousel`, `chart`
  (367 linhas), `context-menu`, `drawer`, `dropdown-menu`, `empty`, `field`,
  `hover-card`, `input-group`, `input-otp`, `item`, `kbd`, `menubar`,
  `navigation-menu`, `pagination`, `progress`, `resizable`, `scroll-area`,
  `sidebar` (727 linhas), `slider`, `sonner`, `spinner`
- **O quê:** nenhum arquivo de `artifacts/moscow-noivas/src` importa
  `@/components/ui/<nome>` para esses 27 (verificado um a um, inclusive
  importações entre os próprios componentes de UI). O sidebar real é
  `components/layout/sidebar.tsx`; o `ui/sidebar.tsx` de 727 linhas é o
  boilerplate do shadcn, intocado.
- **Por que importa:** não é peso de bundle (o Vite não empacota o que ninguém
  importa) — é peso de MANUTENÇÃO e de escolha: ~25 dependências `@radix-ui/*` em
  `package.json` existem só para eles, e quem vai construir uma tela nova encontra
  27 primitivos que parecem disponíveis e testados, mas nunca rodaram neste app.
  O E88 podou a lib de negócio e não olhou para o kit de UI.
- **Sugestão:** apagar os 27 e as dependências radix correspondentes. Reintroduzir
  pelo `shadcn add` no dia em que uma tela precisar — é um comando.
- **Severidade:** 🟡

### A6 — O pacote `mockup-sandbox` não produz nada e ainda assim entra no typecheck e no build
- **Onde:** `artifacts/mockup-sandbox/` (62 arquivos, 344 KB de `src`);
  `artifacts/mockup-sandbox/src/components/mockups/` está **vazio**
- **O quê:** um workspace inteiro sem nenhum import de `@workspace/*`, cuja pasta
  de mockups não tem um único arquivo, com ~40 devDependencies próprias e cópias
  do `ui/sidebar.tsx` (714 linhas) e `ui/chart.tsx` (365) do moscow-noivas. Último
  commit que o tocou: `9e68c2c`, 2026-07-06 ("Task start baseline checkpoint").
  Nada no repo o referencia fora do próprio `package.json`, do
  `.replit-artifact/artifact.toml` e do lockfile.
- **Por que importa:** `pnpm run typecheck` (`package.json:9`, filtro
  `./artifacts/**`) e `pnpm run build` (`pnpm -r --if-present run build`) o incluem
  — tempo de CI e de instalação por zero produto. E as duas cópias de `ui/*` são
  divergência garantida no dia em que alguém "corrigir" a errada.
- **Sugestão:** decidir se é ferramenta de design viva. Se não, remover o pacote.
  Se sim, tirá-lo do `pnpm-workspace.yaml` de produção (ou do filtro de
  typecheck/build) para que ele não custe em toda pipeline.
- **Severidade:** 🟡

### A7 — Os testes da lib do frontend NÃO passam pelo typecheck
- **Onde:** `artifacts/moscow-noivas/tsconfig.json:3` —
  `"exclude": ["node_modules", "build", "dist", "**/*.test.ts"]`; os 15 arquivos
  de teste do front são todos `.test.ts`
- **O quê:** `pnpm --filter @workspace/moscow-noivas run typecheck` ignora os
  testes por construção. O api-server não faz isso: seu tsconfig inclui `src`
  inteiro, e `__tests__/` é typechecado.
- **Por que importa:** o E88 declarou "o typecheck é o fiscal (remoção quebra quem
  usava)". Do lado do front esse fiscal está de olhos fechados: remover um export
  da lib deixa `pnpm run typecheck` verde e só o `vitest` reclama — e o `vitest`
  do front não roda no mesmo comando que o build. É como um teste que referencia
  `horizonteAberto` (`src/lib/financeiro/parcial.test.ts:6`) sobrevive a uma poda
  que o E88 pretendia fazer.
- **Sugestão:** remover `**/*.test.ts` do `exclude` e deixar o typecheck cobrir os
  testes, como já faz no servidor. Se algo quebrar, é justamente o que se quer
  descobrir.
- **Severidade:** 🟡

### A8 — Rota implementada fora do contrato: `GET /contratos/{id}/parcelas`
- **Onde:** `artifacts/api-server/src/routes/contratos.ts:552`; o spec
  (`lib/api-spec/openapi.yaml:2815-2850`) declara só `post` nesse path
- **O quê:** varredura das 178 operações registradas nas rotas contra as 177 do
  OpenAPI: **uma** sobra do lado do servidor, essa. Nenhuma operação do spec ficou
  sem implementação.
- **Por que importa:** endpoint sem contrato é endpoint sem cliente gerado (não há
  hook para ele em `lib/api-client-react/src/generated/`, e nenhuma tela o chama) e
  sem conferência de resposta no codegen. Ele existe, responde e é superfície de
  API que ninguém audita. Também é a única brecha no invariante mais forte deste
  repo — vale fechá-la para que "spec = servidor" continue sendo verdade absoluta.
- **Sugestão:** confirmar que está morto e remover. Se algum consumidor externo
  depende dele, documentá-lo no spec e regerar.
- **Severidade:** 🟡

### A9 — `pages/financeiro/helpers.tsx` virou a lib compartilhada do app, e há cópia manual dela
- **Onde:** `artifacts/moscow-noivas/src/pages/financeiro/helpers.tsx:32`
  (`useCaminhoDaLoja`) e `:80` (`mensagemApi`); importados de fora da feature por
  `pages/trocar-senha.tsx:11` e `pages/comissoes/index.tsx:68`. Cópias locais em
  `pages/contratos/[id].tsx:76` (`mensagemApi`) e `:91` (`parseValor`)
- **O quê:** duas coisas ao mesmo tempo. (a) Uma pasta de feature virou módulo
  compartilhado — telas fora de `/financeiro` importam `@/pages/financeiro/helpers`.
  (b) `contratos/[id].tsx:91-104` é uma cópia **byte a byte** de
  `lib/financeiro-core/src/dinheiro.ts:35-48` (`parseValor`), incluindo o comentário
  sobre ponto de milhar pt-BR, quando `@/lib/financeiro/dinheiro` já reexporta a
  função; e `:76-83` reimplementa `mensagemApi` sem o parâmetro `mensagens`.
- **Por que importa:** `parseValor` é a porta de entrada de DINHEIRO digitado ("1.234"
  = mil duzentos e trinta e quatro, não um e pouco). Ter duas cópias significa que a
  correção de um caso-limite conserta metade das telas. E o helper de caminho de
  loja, que é a régua do padrão `/loja/:lojaId/…`, está enterrado numa feature: 102
  ocorrências de `` `/loja/${...}` `` montado à mão em 43 arquivos, contra 6 telas
  usando `useCaminhoDaLoja`.
- **Sugestão:** `useCaminhoDaLoja` e `mensagemApi` sobem para `@/lib/` (ou
  `@/hooks/`); `contratos/[id].tsx` importa `parseValor` de
  `@/lib/financeiro/dinheiro` e apaga a cópia.
- **Severidade:** 🟡

### A10 — Toda página grande é UM componente só; as costuras estão claras
- **Onde:** `pages/comissoes/index.tsx:124` (uma função de ~1.013 linhas),
  `pages/orcamentos/[id].tsx:103` (~917), `pages/reservas/[bloqueioId].tsx:58`
  (~813), `pages/financeiro/pagar.tsx:105` (~730), `pages/financeiro/folha.tsx:79`
  (~729), `pages/atendimentos/novo.tsx:108` (~658), `pages/equipe/index.tsx:97`
  (~634), `pages/contratos/[id].tsx:106` (~603)
- **O quê:** não é o número de linhas do arquivo — é que em cada um deles o arquivo
  inteiro é o corpo de UMA função componente. `pages/admin/index.tsx` é a exceção
  que mostra o caminho: já tem `ConsolidadoRede()` (`:87`) separado de
  `AdminConsole()` (`:139`).
- **Por que importa:** um componente de mil linhas concentra dezenas de `useState`,
  `useMemo` e mutations num escopo só; qualquer re-render é o arquivo inteiro, e
  qualquer leitura para revisão exige carregar tudo. É a raiz estrutural do que as
  trilhas D e E vão encontrar como sintoma.
- **Sugestão:** quebrar por RESPONSABILIDADE, não por tamanho. Costuras naturais,
  na ordem de retorno:
  - `comissoes/index.tsx` → três coisas independentes que já não conversam:
    **escada/regras por vendedora** (CRUD de faixas, `descreverFaixa`, o formulário
    de `FaixaForm`), **ranking ao vivo do mês** (preview + projeção) e **fechamentos
    + estornos + série histórica**. Cada uma consome endpoints distintos.
  - `orcamentos/[id].tsx` → **cabeçalho/status do orçamento**, **itens** (adicionar/
    editar/remover, o seletor de vestido), e o **diálogo Gerar contrato** (que é uma
    tela inteira embutida — e é onde mora o A1).
  - `financeiro/pagar.tsx` → **lista/filtros de contas**, **nova conta**, e o
    **diálogo de saída multi-conta** (o rateio, a seleção, o valor).
  - `financeiro/folha.tsx` → **recorrências** (o cadastro do que se repete) e
    **folha/geração da competência** — são dois assuntos que só dividem a rota.
  - `reservas/[bloqueioId].tsx` → **dados da reserva**, **avarias** (com upload de
    foto) e **linha do tempo/ações**.
  - `atendimentos/novo.tsx` → o **seletor de slot** (que já consome `agenda-core`)
    é um componente reutilizável pela grade; o resto é formulário.
  - `routes/comissao.ts` (1.223) e `routes/financeiro.ts` (1.154) são grandes mas
    **coesos e bem separados por seção** (`// ── Regras ──`, `// ── Fechamentos ──`,
    `// ─── Recorrências (E48) ───`). Se forem divididos, que seja por sub-domínio
    (`financeiro/contas.ts`, `financeiro/pagamentos.ts`, `financeiro/relatorios.ts`,
    `financeiro/exportacoes.ts`) — mas o ganho aqui é bem menor que nas telas.
- **Severidade:** 🟡

### A11 — Buracos de teste que importam: `visao-noiva.ts` e `lib/portal.ts`
- **Onde:** `artifacts/api-server/src/lib/visao-noiva.ts` e
  `artifacts/moscow-noivas/src/lib/portal.ts`
- **O quê:** varrendo os 19 módulos de `api-server/src/lib/` contra
  `src/__tests__/`, praticamente todos têm cobertura direta ou por API. Duas
  exceções que carregam regra:
  - `visao-noiva.ts:65-70` calcula bruto/líquido/desconto — o número que a noiva vê
    no portal e no aceite. Não tem teste unitário; é exercitado só de raspão por
    asserts de `totalLiquido` em `lote22-orcamento-publico-api.test.ts:81`,
    `aceite-orcamento-api.test.ts:66,141` e `e78-portal-api.test.ts:123`, todos com
    valores redondos (3000, 4000, 7470) — nenhum toca arredondamento de desconto
    percentual, que é onde a função pode errar.
  - `lib/portal.ts` (a "régua única" do E84: `portalVivo`, `linkDoPortal`,
    `urlsDePortalPorLead`) não tem teste nenhum. É a função que decide se a
    mensagem de wa.me sai com link vivo ou com link morto — e "link morto na
    mensagem é pior que nenhum" está escrito no cabeçalho do próprio arquivo.
- **Por que importa:** são os dois pontos em que o sistema fala com a CLIENTE, não
  com a equipe. Errar o total no portal ou mandar um link expirado é o tipo de falha
  que não gera ticket, gera desconfiança.
- **Sugestão:** um teste unitário para `visao-noiva` cobrindo desconto percentual
  com centavo quebrado, e outro para `portal.ts` cobrindo expirado/revogado/na
  fronteira do instante.
- **Severidade:** 🟡

### A12 — Referências de projeto TypeScript incompletas: `financeiro-core` fica de fora nos dois consumidores
- **Onde:** `artifacts/api-server/tsconfig.json:11-18` e
  `artifacts/moscow-noivas/tsconfig.json:20-24` — ambos declaram `references` para
  `funil-core` e `agenda-core`, nenhum para `financeiro-core`, que os dois importam
  (`api-server/src/routes/financeiro.ts:23`; `moscow-noivas/src/lib/financeiro/*.ts`)
- **O quê:** os pacotes exportam FONTE (`"exports": {".": "./src/index.ts"}`) mas
  compilam com `composite: true` + `emitDeclarationOnly` para `dist/`. Quando há
  `reference`, o TypeScript redireciona para o `.d.ts` de `dist/`; quando não há,
  ele typecheca a fonte inline. Resultado: `financeiro-core` é lido como fonte pelos
  consumidores, e `api-zod`/`funil-core`/`agenda-core` como `.d.ts` compilado.
- **Por que importa:** é a raiz do gotcha já documentado ("`lib/api-zod` é consumido
  COMPILADO… senão as rotas continuam vendo o contrato antigo e o erro de tipo
  aponta para o lugar errado"). Hoje o gotcha vale para uns pacotes e não para
  outros, o que é pior do que valer para todos: quem depurar um erro de tipo não
  sabe de antemão se está vendo o `dist` velho ou a fonte nova. Também deixa
  `financeiro-core` fora da garantia de ordem do `tsc --build` de cada artifact
  (só o `tsc --build` da raiz, via `tsconfig.json:11-13`, o cobre).
- **Sugestão:** ou acrescentar `{"path": "../../lib/financeiro-core"}` nas duas
  referências (uniformiza no modelo "compilado", e o gotcha do `replit.md` passa a
  valer sempre), ou remover `composite`/`emitDeclarationOnly` e deixar tudo resolver
  por fonte (o gotcha some, ao custo de recompilar as libs em cada consumidor).
  Qualquer uma das duas; a mistura é que confunde.
- **Severidade:** 🔵

### A13 — `strictFunctionTypes: false` e `noUncheckedIndexedAccess` ausente na base
- **Onde:** `tsconfig.base.json:12` (`"strictFunctionTypes": false`) e a ausência de
  `"strict": true` / `"noUncheckedIndexedAccess"` no mesmo arquivo
- **O quê:** a base liga as flags de strictness uma a uma e deixa
  `strictFunctionTypes` explicitamente desligada. `noUncheckedIndexedAccess` fica no
  default (off), então `array[i]` é tipado como `T` e nunca como `T | undefined`.
- **Por que importa:** o padrão `const [conta] = await db.select()…` seguido de
  `if (!conta)` aparece dezenas de vezes nas rotas — funciona, mas o compilador não
  é quem está exigindo a checagem; é a disciplina de quem escreveu. Em
  `routes/financeiro.ts:308` (`rateioCentavos[rateioCentavos.length - 1] += …`) e
  em `lib/parcelas.ts` o índice é seguro por construção, mas o tipo não prova nada.
  Não vi bug causado por isso — é uma rede de segurança desligada, não um incêndio.
- **Sugestão:** ligar `strictFunctionTypes` (é quase sempre indolor) e avaliar
  `noUncheckedIndexedAccess` como projeto próprio — o segundo gera muito ruído de
  uma vez e não vale como mudança de passagem.
- **Severidade:** 🔵

## O que está BEM (não mexer)

- **O contrato é real.** 177 operações no OpenAPI × 178 nas rotas, com uma única
  divergência (A8) e **zero** endpoints do spec sem implementação. Isso é raro e é a
  coisa mais valiosa do repo — vale defender o invariante, não relaxá-lo.
- **Zero escapes de tipo em produção.** Nenhum `as any`, `as unknown as`,
  `@ts-ignore` ou `@ts-expect-error` fora de arquivos de teste. Os únicos `: any`
  em código de produção são `routes/admin.ts:247` e dois callbacks de `orderBy` do
  drizzle (`routes/agenda.ts:120,381`) — casos de tipagem de biblioteca, não de
  contorno de contrato.
- **Os três cores puros funcionam como prometido.** `financeiro-core`,
  `funil-core` e `agenda-core` são importados dos DOIS lados (a grade da agenda
  recusa a célula com a mesma função que o PATCH usa para devolver 422), sem I/O e
  com teste. Os arquivos-porta do front (`lib/financeiro/datas.ts`,
  `dinheiro.ts`, `projecao.ts`, `funil.ts`, `agenda.ts`) são re-exports honestos,
  com o comentário dizendo por quê — não são camada extra a ser "simplificada".
- **A poda do E88 na lib do front está feita.** Varredura de exports de
  `src/lib`, `src/hooks` e `src/components`: **nenhuma função ou constante órfã**.
  Só sobraram tipos exportados sem referência nominal (`Aging`, `Conferencia`,
  `PortalStatusLike`…), o que é normal — são usados estruturalmente. A única
  exceção é `hooks/use-toast.ts:74` (`reducer`, boilerplate do shadcn).
- **O padrão de rotas `/loja/:lojaId/…` está sendo respeitado.** Busca por links
  absolutos planos (`to="/financeiro"`, `navigate("/contratos/…")`) em todo
  `moscow-noivas/src`: **zero ocorrências**. O `LegacyRedirect`
  (`App.tsx:119-127`) continua sendo só a rede para deep-links antigos.
- **A separação regra-pura × rota no api-server.** `routes/comissao.ts` orquestra
  e desenha; quem calcula é `lib/comissao.ts` (`calcularComissao`,
  `projetarCompetencia`, `pendenciasDeFechamento`, `validarFaixas`), com teste
  unitário dedicado. As funções que sobraram na rota (`projecaoDaLinha:594`,
  `colocacaoDe:732`) são cola fina e estão comentadas explicando por que não
  viraram uma segunda implementação da regra.
- **`comissao-serie.ts`** documenta explicitamente que NÃO recalcula nada (soma
  sobre dado persistido) e por que agrega no cliente. Esse é o comentário certo no
  lugar certo — não substituir por um endpoint "por consistência".

## Pistas para as outras trilhas

- **B (backend):** as duas portas de "pagar conta" do A2 merecem uma olhada de
  segurança/consistência além da arquitetural — o `pagamento_itens.contaPagarId`
  é UNIQUE, mas as duas rotas chegam nele por caminhos diferentes; verificar se
  o estorno (`routes/financeiro.ts:361`) trata igual os dois. Também: 18 hooks
  gerados sem consumidor no front (`useDeleteLead`, `useDeleteVestido`,
  `useDeleteLoja`, `useDeletePerfil`, `useDeleteUsuario`, `useUpdateContrato`,
  `useUpdateReserva`, `useCaptarLead`…) são endpoints destrutivos que existem e
  respondem sem nenhuma tela por trás — vale conferir o gate de permissão de cada
  um, porque não há UI que os exercite e a suíte pode não cobri-los.
- **C (financeiro):** o A1 é de vocês tanto quanto meu — o rateio em float na
  tela de orçamento. Além dele: `pages/comissoes/index.tsx:191` soma
  `l.valorTotal` em reais float (`reduce((soma, l) => soma + l.valorTotal, 0)`),
  contrariando a regra dos centavos inteiros; e `visao-noiva.ts:65-70` (o total
  que a NOIVA vê) não tem teste de arredondamento de desconto percentual (A11).
  Vale também conferir `routes/financeiro.ts:304-308`, o rateio proporcional do
  pagamento multi-conta — está em centavos e comentado, mas é a aritmética menos
  testada do módulo.
- **D (frontend):** o A10 é o mapa. Comecem por `comissoes/index.tsx` (1.013
  linhas num componente) e `orcamentos/[id].tsx` — e olhem `financeiro/pagar.tsx`
  e `receber.tsx`, que fazem agregação client-side (`vencidas`, `somaCentavos`)
  sobre listas que o E79 passou a filtrar no banco: pode haver dupla filtragem.
  `pages/financeiro/helpers.tsx` sendo importado de `trocar-senha.tsx` e
  `comissoes/` (A9) é sintoma de que falta uma camada `@/lib/ui`.
- **E (UI):** os 27 componentes shadcn não usados (A5) são também um diagnóstico
  de design system — vale entender por que `avatar`, `progress`, `breadcrumb` e
  `pagination` nunca foram adotados: ou as telas resolvem à mão o que eles fazem
  (inconsistência visual), ou o produto não precisa deles (poda limpa).
- **F (UX):** `usePagarContaPagar` sem UI e os `useDelete*` órfãos sugerem ações
  que a API oferece e a tela não — pode ser decisão deliberada (não expor
  exclusão) ou lacuna de jornada. E o diálogo "Gerar contrato" dentro de
  `orcamentos/[id].tsx` é uma tela inteira embutida num modal: vale avaliar se o
  momento mais crítico da venda merece página própria.
