# Moscow Noivas

O sistema interno de um atelier de noivas: acompanha a noiva do primeiro contato
ao casamento — atendimentos, provas do vestido, ajustes, orçamento, contrato,
parcelas — e fecha o caixa, a comissão da vendedora e a folha em cima disso.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — sobe a API (porta 5000)
- `pnpm --filter @workspace/moscow-noivas run dev` — sobe o frontend (Vite)
- `pnpm run typecheck` — typecheck de todos os pacotes
- `pnpm run build` — typecheck + build
- `pnpm --filter @workspace/api-server test` — testes da API (tocam o banco de `DATABASE_URL`)
  - **Para rodar UM arquivo, entre no pacote:** `cd artifacts/api-server && ./node_modules/.bin/vitest run lote17`
    (6 s). `pnpm --filter … test -- lote17` NÃO filtra — o `--` chega ao vitest
    como argumento posicional ignorado e a suíte inteira roda (6 min). Medido no E143.
- `pnpm --filter @workspace/moscow-noivas test` — testes da lógica pura do frontend
- `pnpm run test:e2e` — Playwright (sobe API + frontend; ver `playwright.config.ts`)
- `pnpm --filter @workspace/api-spec run codegen` — regenera cliente e Zod do OpenAPI
- `pnpm --filter @workspace/db run push` — aplica o schema no banco (dev)
- **Configurar um ateliê do zero** (E147): `cd artifacts/api-server &&
  ./node_modules/.bin/tsx src/scripts/seed.ts`. Cria só o que NÃO é trabalho da
  loja — 4 perfis, a dona, 3 cabines, horário, 9 atributos de catálogo (66
  opções, com **Tipo de peça** e **Cor** desde o E149), a escada de comissão e
  4 recorrências —, é **idempotente e nunca
  sobrescreve** (ids derivados da loja + `onConflictDoNothing`), e imprime o que
  criou e o que já existia. Depois dele, o único primeiro passo pendente é
  "cadastrar os primeiros vestidos". A mesma configuração roda sozinha na
  SUBIDA quando o banco não tem nenhum usuário (`lib/seed.ts`), então um banco
  provisionado do zero e um configurado à mão terminam idênticos.
  Parametrização por env (branco = default): `SEED_LOJA_ID|NOME|CNPJ|ENDERECO|
  TELEFONE`, `SEED_DONA_ID|NOME|EMAIL|SENHA|SUPERADMIN`,
  `SEED_EXEMPLOS_FINANCEIROS=false` (sem escada nem recorrências).
  **Ele não cadastra noiva, vestido, contrato nem parcela** — isso é trabalho da
  loja, e entra pela tela.
  **O expediente padrão é o DESTE ateliê, e não uma premissa** (S-A8): abre os
  **sete dias** e fecha às **20h**. Os dois números vieram do papel — 7
  compromissos em 5 domingos, e 6 provas às 18:30 que o fechamento anterior
  (19h, com prova de 60 min) recusava. Domingo aberto é a resposta da dona
  (*"com hora marcada"*) traduzida na única alavanca que o sistema tem: ele sabe
  abrir ou recusar o dia, não sabe dizer "só sob demanda". **O default do schema
  e o `HORARIO_PADRAO` do seed são comparados campo a campo por teste** — a
  mesma régua morava em três lugares e podia divergir em três.
  **O resumo que ele imprime sai do DADO** (S-D41): a linha do horário era a
  frase `"seg–sáb, 9h–19h"` cravada no script, e as duas metades estavam erradas
  desde a S-A8. Hoje ela é `descreverHorario` sobre a linha gravada, e as
  contagens dizem o **total e, entre parênteses, o que aquela execução criou**
  (`Cabines 122 (+3)`) — antes era um `+` na frente do total, e criar 3 numa loja
  com 122 imprimia `+ Cabines 122` (S-A12).
- **A régua do banco VIRGEM** (S-D43): `cd artifacts/api-server &&
  ./node_modules/.bin/tsx ../../scripts/banco-virgem.ts`. Cria um banco
  descartável, aplica o schema com `push`, roda o seed, **confere que o resumo
  impresso descreve o que o banco guarda**, sobe o `global-setup` do E2E inteiro,
  roda o seed de novo para provar a idempotência, e apaga o banco — inclusive se
  algum passo estourar. Leva ~40 s. **Rode-a antes de publicar e depois de mexer
  no seed, no schema ou no `global-setup`.** As três suítes rodam contra o banco
  de `DATABASE_URL`, que existe desde antes do E147: o caminho da PRIMEIRA
  execução — o único que um ateliê novo percorre — não é exercitado por nenhuma
  delas, e foi ali que a S-D38 viveu (o setup morria com 23505
  `regra_disponibilidade_loja_id_unique` antes do primeiro spec). Ela guarda e
  devolve o `e2e/.state.json`, então pode rodar no meio de outra coisa. Sobrepor
  o nome do banco: `BANCO_VIRGEM=...`.
- **Capturar as telas para revisão visual** (S-D1/S-D2): com o app de pé,
  `BASE_URL=http://localhost:5173 CAPTURAS_DIR=<destino absoluto>
  ./artifacts/api-server/node_modules/.bin/tsx scripts/capturar-telas.ts` —
  27 rotas × claro/escuro/390px, locale **pt-BR fixada**, e o manifest de saída
  declara o ambiente inteiro (navegador, timezone, viewport, tema, data). As
  env obrigatórias falham alto: o destino das 81 capturas da rodada 7 nasceu
  `undefined/` por env ausente, e o script se perdeu com o scratchpad — este é
  versionado. Detalhes: `scripts/README.md`.
- `pnpm --filter @workspace/api-server run backup` — dump do banco inteiro (E30); é o
  comando que o Scheduled Deployment do Replit chama para a rotina agendada. O status
  aparece em Configurações → Administração; dumps caem em `artifacts/api-server/backups/`.
  A tela baixa o dump (E59) e cada backup bom poda os dumps além dos 10 mais
  recentes e as sessões expiradas — o registro fica, o arquivo sai do disco.
- Env obrigatória: `DATABASE_URL` (Postgres)
- **Para MEDIR o bundle do frontend**, o build do Vite exige duas variáveis e
  falha antes de compilar sem elas (o `vite.config.ts` lança de propósito):
  `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/moscow-noivas run build`.
  O tamanho de cada chunk sai no relatório; **o que importa para o primeiro
  desenho não é a soma deles**, e sim a entrada mais os `modulepreload` do
  `dist/public/index.html` — o resto só desce quando alguém abre a rota.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Frontend: Vite + React 19 + react-router + TanStack Query + shadcn/ui
- DB: PostgreSQL + Drizzle ORM
- Validação: Zod (`zod/v4`), `drizzle-zod`
- Codegen: Orval (a partir do OpenAPI)
- Build: esbuild (bundle CJS)

## Where things live

O contrato é o centro: **o OpenAPI é a fonte da verdade da API**, e cliente e
schemas Zod são GERADOS dele. Não edite nada em `generated/` — edite o spec e
rode o codegen.

| O quê | Onde |
|---|---|
| Contrato da API (fonte da verdade) | `lib/api-spec/openapi.yaml` |
| Schema do banco (fonte da verdade) | `lib/db/src/schema/*.ts` |
| Cliente + hooks React (gerado) | `lib/api-client-react/src/generated/` |
| Schemas Zod de request/response (gerado) | `lib/api-zod/src/generated/` |
| Rotas da API | `artifacts/api-server/src/routes/` |
| Regra de negócio pura (API) | `artifacts/api-server/src/lib/` |
| Guard de permissão | `artifacts/api-server/src/middlewares/auth.ts` |
| Telas | `artifacts/moscow-noivas/src/pages/` |
| Regra de negócio pura (frontend) | `artifacts/moscow-noivas/src/lib/` |
| E2E | `e2e/` + `e2e/global-setup.ts` (seed) |
| Histórico das decisões de unificação | `docs/auditoria/` |

## Architecture decisions

- **O contrato gera o cliente.** Mudou a API? Edite `openapi.yaml`, rode o
  codegen, e o typecheck aponta cada tela que quebrou. É de propósito: o
  compilador é quem encontra os call-sites, não a memória de quem mexeu.
- **A regra de negócio mora em função pura, longe do banco e da tela.** Cálculo
  de comissão, agregação do caixa, projeção, folha e o gerador de PDF são
  módulos sem I/O, com teste unitário. As rotas e as telas só buscam, chamam e
  desenham. É o que permite testar "estorno maior que o mês" sem subir Postgres.
- **Dinheiro soma em CENTAVOS INTEIROS.** A API fala reais (`decimal` com
  `mode: "number"`); converta na borda, some inteiro, volte para reais só ao
  exibir. Um DRE que fecha com um centavo de diferença do fluxo não tem conserto
  depois: a divergência vira desconfiança no número. **E o dinheiro tem piso na
  borda** (E115): `valorRecebido`/`valorPago` têm `minimum: 0.01` no spec — um
  `-700` passava pelo único guard do servidor (o teto) e gravava −R$ 700,00 no
  caixa realizado, com o saldo aberto da parcela subindo para MAIS que o
  previsto.
- **O recebimento é `recebidoEm + valorRecebido`, não uma lista de status**
  (E115/S5). `teveRecebimento` no `financeiro-core` é a régua única: cancelar
  um contrato com `destinoPago: "manter"` vira a PARCIAL em CANCELADA
  preservando o que entrou — "o valor fica no caixa" é o contrato documentado
  do `manter` —, e a lista `["PAGA","PARCIAL"]` tirava esses reais do fluxo,
  do DRE e da tendência retroativamente. Quem filtra recebimento no SQL usa
  `recebido_em IS NOT NULL` (superconjunto; o motor recorta). O estorno —
  avulso E em massa — zera `valorRecebido`/`recebidoEm` e limpa os DOIS
  carimbos (`conciliadoEm`, `enviadoContabilidadeEm`): o carimbo da contadora é
  operacional (alimenta o `isNull` do próximo envio), não histórico — a
  história mora na trilha.
- **Data de negócio ≠ instante.** `vencimento`/`dataReferencia` são dias
  (ancorados ao meio-dia de São Paulo — o dia UTC já é o dia certo).
  `recebidoEm`/`pagamento.data` são INSTANTES, e o dia deles só existe num fuso:
  lidos em UTC, todo movimento das 21h à meia-noite cai no dia seguinte e o
  caixa do dia fecha errado. Ver `artifacts/moscow-noivas/src/lib/financeiro/datas.ts`.
  **"Hoje" nunca sai de `new Date()` + `setHours(0,0,0,0)`**: isso é a meia-noite
  do relógio do PROCESSO, que no container é UTC — o E111 achou quatro desses
  (dashboard, consolidado da rede, relatório de acervo, expurgo LGPD), um deles
  no MESMO handler em que o número ao lado já usava `hojeLocal()`. A régua é
  `hojeLocal()`/`inicioDoDia()`/`addDias()`/`addMeses()` do `financeiro-core`, e
  `addMeses` existe porque `setMonth` **transborda para o futuro** quando o dia
  de hoje não existe no mês alvo (31/03 −1 mês = 03/03).
- **Autoria vem da SESSÃO, não do corpo da request.** Quem registrou um contato
  de cobrança sai de `req.usuario`, e `RegistroCobrancaInput` não aceita
  `vendedorId` de propósito — um cliente que declara o próprio autor pode
  atribuir a ação a outra pessoa. Mesma lógica de sempre: a autoridade é o
  servidor. **A vendedora da VENDA não é autoria** (E120, decisão P1 do dono):
  `ContratoInput.vendedoraId` vem do corpo de propósito — a dona fecha de manhã
  a venda que a Ana montou ontem, e é esse campo que decide a comissão. O que
  protege é o rastro, não a trava: quando o contrato nasce de um orçamento e a
  vendedora diverge de `orcamento.vendedoraId`, a transação grava
  `CONTRATO_VENDEDORA_DIVERGENTE` na trilha com os dois lados nomeados; quem
  clicou continua saindo da sessão. Corolário: campos de autoria são ON DELETE SET NULL, porque perder
  quem fez é recuperável e perder o registro do que aconteceu não é. Onde a
  coluna é `notNull` e `set null` não existe — `contratos`, `orcamentos`,
  `atendimentos`, `comissao_regras` e `comissao_fechamentos`, todas por
  `vendedora_id` — a regra vira ON DELETE **RESTRICT** (E91): o banco RECUSA a
  exclusão em vez de apagar o histórico junto com a pessoa. Quem sai do ateliê é
  INATIVADO (`usuarios.ativo`), e `DELETE /admin/usuarios/:id` responde 409
  `USUARIO_COM_HISTORICO` dizendo isso.
- **Apagar uma LOJA segue a mesma régua, um andar acima** (E106/S1). `lojas` é
  referenciada por **31 FKs em CASCADE** — entre elas `parcelas` (com
  `recebido_em`), `pagamentos`, `vestidos`, `usuarios_lojas` e a própria
  `audit_log` —, então um `DELETE` numa linha levava 31 tabelas junto.
  `DELETE /admin/lojas/:id` responde 409 `LOJA_COM_HISTORICO` sempre que houver
  parcela, pagamento, contrato, noiva, **vestido no acervo ou pessoa na equipe**
  — a régua não é só de dinheiro, porque acervo e equipe também são trabalho que
  some. Loja que sai de operação é DESATIVADA (`lojas.ativo`): ela some dos
  seletores (`buscarLojasUsuario` filtra `ativo = true`) e nenhuma sessão entra
  nela (`buscarSessao` recusa), sem perder nada. **O cascade continua de
  propósito** — é o que faz o expurgo de LGPD e a limpeza de fixture caberem num
  comando; a guarda é de aplicação, e recusa só o caso perigoso. E a exclusão de
  uma loja NÃO deixa trilha, porque não há onde: `audit_log.loja_id` é `notNull`
  + CASCADE, e o registro morreria com a loja (sobra S3). Fica o `req.log.warn`
  `loja_excluida`.
- **Nenhum id entra sem prova de loja** (E91). `usuarios` é tabela GLOBAL e a FK
  do banco só garante que um id EXISTE, não a que loja pertence. Toda escrita
  que recebe id de outra entidade — do CORPO ou do PATH — passa por
  `api-server/src/lib/escopo-loja.ts` (`leadNaLoja`, `cabineNaLoja`,
  `usuarioNaLoja`/`vendedoraNaLoja`, `reservaNaLoja`, `vestidoNaLoja`,
  `atributosDaLoja`) ANTES de escrever: id do corpo que não é da loja vira 422
  `REFERENCIA_INVALIDA`, id do path vira 404. Régua única — quem precisar de uma
  pergunta nova a acrescenta lá, não escreve a checagem à mão na rota.
- **A loja da URL é conferida contra a da sessão em TODA rota de loja** (E111),
  e a conferência lê o CAMINHO CRU (`lojaIdDaUrl`, em `middlewares/auth.ts`), não
  `req.params`. O motivo é uma pegadinha do Express que custou caro: `router.use(fn)`
  **sem path** roda com `req.params` vazio, e os dez routers de domínio montam
  assim — a comparação nunca falhava porque nunca rodava, e uma vendedora da loja
  A lia, editava e apagava noiva da loja B com 200/200/204. `requireModulo` não
  protege disso: ele consulta as permissões de `lojaAtivaId` e aprova. Middleware
  que precisa de um param **tem** de ser montado com o path, ou ler a URL.
- **Ação destrutiva responde 404, conta o que vai junto e deixa rastro** — a
  régua que o E91 (usuário), o E106 (loja), o E111 (noiva, parcela, perfil) e o
  E115 (reserva, bloqueio, atendimento, orçamento, avaria) aplicam igual: 404
  antes de qualquer escrita, 409 LEGÍVEL dizendo o que segura o registro
  (`LEAD_COM_CONTRATO`, `PERFIL_EM_USO`, `USUARIO_COM_HISTORICO`,
  `LOJA_COM_HISTORICO`, `RESERVA_COM_HISTORICO`, `ATENDIMENTO_CONCLUIDO`,
  `ORCAMENTO_APROVADO`) em vez do 23503 genérico do banco, e
  `registrarAuditoria` DENTRO da transação e ANTES do delete — depois dele não
  há linha de onde reconstituir. A guarda de `DELETE /admin/usuarios/:id` conta
  as **seis** FKs que apontam para `usuarios`, contando `recorrencias`
  (CASCADE: apagava o salário em silêncio) e `comissao_regras` (restrict).
  A cascata mais funda é a da RESERVA (E115): `bloqueio_vestidos.reserva_id` é
  CASCADE e de cada bloqueio caem avarias (foto-prova de parcela já cobrada),
  provas e vínculos de contratos ATIVOS — por isso reserva e bloqueio com
  história recusam o DELETE e ensinam o soft-cancel.
- **Todo dinheiro na tela sai de `brl()`, e ele já traz o `R$`** (E92).
  `moscow-noivas/src/lib/formatos.ts` é a régua única: `Intl.NumberFormat` com
  `style: "currency"`, o que põe um espaço RÍGIDO (U+00A0) entre o símbolo e o
  número — sem ele o navegador quebra a linha ali e o card de dinheiro dobra de
  altura em 390px. Nenhuma tela escreve `R$` à mão (eram 98 cópias, e a única
  que esquecia era o dashboard). Negativo sai `-R$ 500,00`, não `R$ -500,00`.
- **O erro da API vira frase de gente em `lib/erro-api.ts`** (E92), nunca
  `err.message` — a mensagem que o cliente gerado monta é `HTTP 404 Not Found`,
  e era isso que a vendedora lia no toast. A ordem é: código que a tela conhece
  → `detalhe` do servidor → régua por faixa (401 sessão, 403 permissão, 5xx e
  rede "não consegui falar com o sistema") → o `fallback` da TELA. Desde o
  E122: o builder (`lib/api-client-react/src/custom-fetch.ts`) também lê
  `detalhe` (a grafia da casa) ao montar `err.message`; **o título da falha é
  UM — "Não deu para <verbo>"** (exceções: "Não consegui entrar" no login e
  "Essa mudança não é possível agora" nas recusas de transição); e
  `lib/erro-cru-varredura.test.ts` reprova `err.message` em tela e título
  começando em "Erro", varrendo o arquivo inteiro.
- **A cor da marca é `--primary: 350 25% 65%` e não muda para consertar
  contraste** (E92) — quem muda é o que vai EM CIMA dela. `index.css` traz a
  razão WCAG ao lado de cada token, e `lib/aparencia.test.ts` lê o arquivo de
  verdade e reprova qualquer par de texto abaixo de 4,5:1, nos dois modos. No
  ESCURO os preenchimentos (`--primary`, `--destructive`) são mais CLAROS com
  texto escuro em cima, pelo mesmo motivo que `--positivo` já era.
- **Competência vira frase por `rotuloCompetencia()`** (`lib/financeiro/datas.ts`,
  E92), em minúscula ("julho de 2026"); quem abre frase com ela usa
  `capitalizar()` de `lib/formatos.ts`. **Nunca `className="capitalize"` sobre
  uma frase**: o CSS sobe a inicial de toda palavra e produz "Julho De 2026 — O
  Que Seria Pago Se Fechasse Agora."
- **Permissão é MÓDULO × AÇÃO** (`{leads: {ver, criar, editar}}`), com o shape
  vindo do CÓDIGO e nunca do banco (`api-server/src/lib/permissoes.ts`): chave
  desconhecida é descartada, ausente é `false`. O guard deriva a ação do método
  HTTP. O cliente espelha o gate (`moscow-noivas/src/lib/permissoes.ts`) só para
  não OFERECER o que o servidor vai negar — a autoridade é sempre o servidor.
  **A ação vem do método E do caminho** (`acaoDoRequest`): POST que termina em
  verbo de mutação (`receber`, `pagar`, `cobrar`, `aprovar`, `cancelar`,
  `estornar`, `marcar`, `enviar`, …) é `editar`, não `criar`. A lista é uma só,
  e a varredura de `e101-acao-da-rota-api.test.ts` a IMPORTA — verbo novo sem
  classificação reprova o teste (e desde o E115 ela também vê POSTs
  `<literal>/<verbo>`, a forma por onde `conciliacao/marcar` e
  `contabilidade/enviar` escaparam). POST que muta com caminho de SUBSTANTIVO
  entra em `POST_QUE_MUTA_POR_CAMINHO` (hoje só `/financeiro/pagamentos`, a
  mesma operação da porta irmã que declara `editar`). E o guard deriva a ação
  de `req.baseUrl + req.path`, nunca de `req.path` sozinho: dentro de um
  `router.use(prefixo, fn)` o Express DESMONTA o prefixo casado — a mesma
  pegadinha do `req.params` vazio do E111, na dimensão do caminho. Sem isso, o
  guard de prefixo do router e o guard da rota exigem ações DIFERENTES e a
  pessoa leva 403 numa ação que ela pode fazer.
- **Uma reserva de vestido é de um contrato ATIVO só** (E111). `POST /contratos`
  recusa com 409 `RESERVA_JA_CONTRATADA` o bloqueio já preso por outro contrato
  ativo, **e grava `bloqueio_vestidos.lead_id`** — o contrato é quem dá dona à
  reserva que nasceu sem. Cancelar o contrato solta a peça (soft-cancel), e ela
  volta ao mercado. A seção "O seu vestido" do portal resolve pelo vínculo VIVO
  `contrato_bloqueios`; `contratos.bloqueio_vestido_id` é legado lido, nunca
  escrito — decidir por ele deixava a seção morta em produção.

- **As réguas de UI da rodada 7 (E120–E142) valem e têm varredura.** O rosa da
  marca nunca é TEXTO pequeno (`--primary-texto`, 6,24:1+) nem cor de dinheiro
  (`escala-dinheiro.test.ts` varre por VIZINHANÇA de 3 linhas — o prettier
  separa atributo de expressão, e foi assim que o preço do portal viveu meses a
  2,68:1); o aviso tem token (`--aviso`), os dois testados nos dois modos em
  `aparencia.test.ts`. O badge de status vem da tabela semântica de
  `lib/status-badge.ts` (decisão P6) — mapeamento inline nas 7 telas reprova
  varredura. Dinheiro nunca é `type="number"` (varredura) e o degrau maior é
  `money-lg`; a confirmação de estorno cita o RECEBIDO
  (`lib/financeiro/confirmacoes.ts`, com o caso 1.000/300 em teste). Filtro de
  tela mora na URL pela gramática de `lib/filtro-url.ts` (default FORA da
  URL; `useBuscaNaUrl` debounce+replace). Alvo tocável no mobile tem 44px
  (`default` é `min-h-11 md:min-h-9`; override de tamanho só de `md` para
  cima). **⌘K/Ctrl+K** abre a busca de noivas de qualquer tela
  (`components/busca-global.tsx`, chunk lazy de 1,6 kB, gate `leads.ver`) —
  e cmdk sobre busca de SERVIDOR é sempre `shouldFilter={false}`. A grade da
  agenda solta o card onde o PONTEIRO está (`pointerWithin` — a colisão por
  retângulo soltava na cabine vizinha no fio do meio).

## Product

- **Jornada da noiva** — leads/noivas, agenda, atendimentos, provas, ajustes,
  reservas de vestido (com motor de disponibilidade), catálogo e acervo.
  Avarias da devolução viram parcela cobrável (E71); LGPD interna com
  consentimento carimbado e expurgo que preserva números (E77).
- **As duas naturezas de peça (E150, E154)** — o que decide se uma peça está
  disponível não é o que ela é, é como se pergunta. A peça ÚNICA (vestido,
  bolero, mantilha) mora no acervo, tem código e **se reserva**: o contrato que
  a vende sem reserva no mesmo contrato leva 422 (E150). A peça de ESTOQUE
  (saiote, crinol, anágua) mora em `itens_estoque`, tem `quantidade` e **se
  conta**: `GET /lojas/:id/itens-estoque/comprometimento?data=` soma o que os
  contratos ATIVOS comprometeram no dia (janela de uso, a mesma régua do
  vestido) e a tela de orçamento **avisa sem bloquear** — *"3 × Saiote 2 aros
  para 19/09/2026 — a loja tem 2"* e deixa fechar. Saiote é substituível;
  recusar uma venda de R$ 4.000 por causa de uma anágua seria um defeito, não
  uma proteção. A dona conta a arara em **Vestidos → Estoque**.
- **A peça é precificada pela VEZ em que sai (E157)** — `vestidos` ganha
  `precoRealuguel` (**nulo = não tem preço de segunda saída**, e o orçamento
  segue com o `precoBase` — o comportamento de sempre). A contagem que decide
  qual preço vale **já existia**: `GET /vestidos/utilizacao` sem recorte
  `de`/`ate` conta a vida inteira da peça. Ao escolher uma peça já alugada, o
  item de orçamento **sugere** o preço de realuguel e diz por quê ("3ª saída
  desta peça"); o campo segue editável, porque preço é conversa. O papel
  registra a contagem 7 vezes em 14 semanas.
- **O ciclo da peça tem três datas reais (E152)** — retirada, devolução e agora
  **`lavagemConcluidaEm`**: a lavagem era a única etapa calculada só por soma, e
  a peça voltava da lavanderia na quarta presa até domingo. A régua de 7 dias
  continua valendo (é lavanderia externa); o que existe é o caminho de dizer que
  ela chegou — em **Reserva → Movimentação**, depois da devolução. Encurtar a
  janela só REDUZ ocupação, nunca cria conflito, e a peça não volta da
  lavanderia sem ter voltado da noiva (400 `LAVAGEM_SEM_DEVOLUCAO` nos dois
  sentidos). **O que ele NÃO resolve, e é decisão da dona, não limitação a
  consertar** (P6, 2026-08-05): a mesma peça alugada de novo em **7 dias** segue
  recusada, e não pela lavagem — é a janela de PROVA de 11 dias da segunda noiva
  que invade o USO da primeira (medido: `PROVA[02-24..03-06]` × `USO[02-28..
  03-05]`). O ateliê trata o caso como exceção fora do sistema; o caderno o
  mostra uma vez em 14 semanas. E **toda reserva guarda ao menos um dia de
  prova** (P7): nem no realuguel se dispensa conferir a peça antes de ela sair.
- **A ausência da equipe (E151)** — `ausencias` (loja, pessoa, `inicio`/`fim`
  em DIAS locais **inclusivos**, motivo) é o primeiro fato de indisponibilidade
  de GENTE que o sistema guarda. A recusa mora na mesma régua que já recusa dia
  fechado (`agenda-core/mover.ts`, motivo `VENDEDORA_AUSENTE`), então a grade e
  o formulário de agendamento **apagam o dia antes do clique** e o servidor
  recusa com uma frase que diz quem e até quando. **Ela só impede o novo**: o
  que já estava agendado não é cancelado nem remarcado. Cadastro em
  **Cabines & horário**, gate `agenda`.
- **A peça sob medida (E155)** — a terceira natureza, e a única que ainda não
  existe quando é vendida: `ajustes` guarda `tipo` (`AJUSTE` | `CONFECCAO`) e
  `custo`, então a **fila da costureira é uma só** — prazo (a próxima prova),
  status e checklist já eram os mesmos. O item de orçamento `AJUSTE` aponta a
  confecção (`ajuste_id`), e a prova é da NOIVA, não só da loja: cobrar o
  trabalho que a costureira faz para outra dá 404. Registrar em **Reserva →
  prova**; a fila mostra o selo *Confecção* e o custo. **Em aberto:** depois do
  casamento a peça confeccionada vira item do acervo? **Respondido no E156.**
- **A confecção vira peça do acervo (E156)** — `vestidos.origemAjusteId` guarda
  de onde a peça veio quando ela não veio do fornecedor. É **gesto, não
  gatilho**: na fila da costureira, no trabalho `CONFECCAO` já `FEITO`, o botão
  *"Virou peça do acervo"* abre o cadastro de vestido com nome e observação
  preenchidos — e o **preço é digitado**, porque `ajustes.custo` é o que a
  costureira cobrou e `precoBase` é o que a noiva paga. A peça nasce **ativa e
  sem reserva nenhuma**; o contrato antigo segue apontando a confecção pelo
  `ajusteId` do item, e nada é reescrito para trás. Feita uma vez, a linha da
  fila mostra *"no acervo · CÓDIGO"* no lugar do botão — a mesma confecção não
  vira duas peças. O servidor recusa com 422 o que a tela já não oferece:
  trabalho de outra loja (`REFERENCIA_INVALIDA`), ajuste comum ou confecção
  ainda pendente (`CONFECCAO_INVALIDA`). Apagar o trabalho da fila **não** apaga
  a peça: perde-se a proveniência, não o acervo.
- **Portal da noiva (E78)** — UM link público por noiva (`/noiva/:token`,
  `portal_tokens`, 30 dias **de inatividade**): proposta com aceite (E74),
  lookbook, próximas provas e extrato de parcelas só-leitura, com "falta pagar"
  e "próxima em" somados (E100/F36). A vendedora gera/revoga no card da ficha;
  os links antigos de orçamento/lookbook seguem valendo (compat).
  A noiva CONFIRMA a presença da prova por ele (E85 — o mesmo `confirmadoEm`
  do E39, com rastro "link público" na trilha) ou avisa que **não pode ir**
  (E100/F37 — `remarcacaoPedidaEm`, que não cancela nada e devolve a linha à
  fila de remarcação da loja), e as mensagens de wa.me
  (cobrança/confirmação/orçamento) fecham com o link quando o portal está
  vivo (E84, `GET /portais` em lote + `lib/portal.ts` como régua única).
  O rodapé traz nome, endereço e "Falar no WhatsApp" da LOJA, com o nome dela
  já na mensagem (E100/F35). Depois do contrato ele mostra **"Seu contrato"**
  (o snapshot de itens, o total e o PDF pelo mesmo token — E100/F21) e **"O seu
  vestido"** (a peça reservada, a retirada e os ajustes como pronto/em
  andamento — E100/F39). O papel do contrato é montado por
  `lib/contrato-do-papel.ts`, a mesma régua dos dois lados: a loja e a noiva
  baixam byte por byte o mesmo documento.
- **Comercial** — orçamento → contrato (com snapshot dos itens) → plano de
  parcelas → PDF do contrato. A noiva vê a última versão ENVIADA (E75) e
  aceita pelo link com rastro (instante, versão, hash — E74).
- **Financeiro** — `/financeiro` é o fluxo de caixa (realizado), com recortes
  (**DRE de CAIXA**, projeção de saldo) e telas de ação (receber, pagar com
  saída multi-conta, cobrança por faixa de atraso). Conciliação por extrato
  OFX/CSV no navegador (E70). E79: os agregados rodam no BANCO
  (`GET /financeiro/fluxo`, `/financeiro/dre`, recortes de parcelas,
  `/leads/parados`) — os mesmos motores do `financeiro-core`, sobre linhas já
  filtradas no SQL.
- **Comissão** — escada por vendedora, versionada por vigência, com bônus,
  preview ao vivo do mês e fechamento idempotente que gera a conta a pagar.
- **Recorrências** — o que se repete todo mês (salário, aluguel, assinatura,
  fornecedor fixo) vira conta a pagar por geração idempotente por competência,
  e o período fecha com a contabilidade (export CSV). **Sair da equipe DESATIVA
  a recorrência da pessoa naquela loja** (E111): a geração lê as ativas da loja
  sem junção com `usuarios_lojas`, então sem isso a conta de quem já não
  trabalha ali renascia todo mês, na tela de Pagar e no DRE previsto. Desativa,
  não apaga — a recorrência é a régua que explica os salários já pagos.
- **Avisos sem cron** — o sino (E68) reúne caixa furando, comissão esquecida,
  noivas esfriando e presenças por confirmar; "Mensagens de hoje" (E69) é a
  fila de wa.me pronta (confirmação carimba `confirmadoEm`). E83: o poll e as
  telas do dia pedem `GET /atendimentos?de=&ate=` (janela por dia local), não
  a agenda inteira; a fila usa parcelas ABERTAS e orçamentos ENVIADOS.
- **Multi-loja** — tudo é escopado por loja; superadmin tem bypass e o console
  consolidado da rede (E76). O perfil Admin é flag `perfis.sistema` (E80) —
  o servidor recusa PATCH/DELETE dele. Gerir equipe é ato sobre a tabela GLOBAL
  `usuarios`: `PATCH`/`DELETE /lojas/:lojaId/equipe/:usuarioId` provam o vínculo
  `usuarios_lojas` antes de escrever e respondem 404 sem ele (E91) — sem essa
  prova, um admin inativava a dona da loja vizinha por curl.

## Gotchas

- **O `Test` do supertest é LAZY: a request só sai no `.then()`.** `agent.delete(...)`
  devolve um *thenable* que ainda não falou com o servidor — guardar a variável
  não dispara nada. Num teste comum isso é invisível (o `await` vem na linha
  seguinte); num teste de CONCORRÊNCIA é a diferença entre provar e não provar.
  O teste da corrida da S33 (`s33-corrida-delete-loja-api.test.ts`) precisa da
  rota pendurada numa tranca do Postgres ENQUANTO outra conexão commita: a
  primeira versão guardava o `Test` numa variável, dormia 300 ms e commitava —
  com a request ainda no papel. Ela passava verde inclusive contra o código
  SEM o conserto. `Promise.resolve(agent.delete(...))` assimila o thenable e
  dispara agora; com isso o vermelho apareceu, literal: `expected 204 to be 409`.
- **Em `e2e/`, `await import(...)` não sobrevive à transpilação do Playwright.**
  O import dinâmico chega ao `.ts` cru como ESM e estoura
  `ReferenceError: exports is not defined in ES module scope`; o import
  ESTÁTICO passa pelo transform normalmente. Medido no épico da S-D25: a régua
  de limpeza nasceu com `await import("../lib/db/src/index")` — para não abrir o
  Pool do banco nos ~50 specs que não o tocam — e derrubou **7 specs**. A
  cautela era desnecessária por medida: todo spec que usa o banco já o importava
  estático. **E o estrago do crash não fica no run:** os sete `afterAll`
  morreram no meio da limpeza, e o rastro que ficou derrubou OUTRO spec no run
  seguinte (o gotcha logo abaixo).
- **O banco do E2E PERSISTE entre execuções: rastro de spec vira vermelho em
  outro arquivo, um run depois — e se lê como flake.** As três suítes rodam
  contra o `DATABASE_URL` de sempre; um `afterAll` que não roda (ou que morre no
  meio) não perde nada hoje, perde amanhã. Medido na sessão de 2026-08-06/07: o
  `afterAll` do `55-ficha-responde-o-telefone` morreu antes de apagar o contrato
  que ele cria, e no run SEGUINTE o `37-projecao-comissao` reprovou com
  `expected 1550 to be 4340` — o contrato vazado de R$ 8.400 (com 3 parcelas de
  840 recebidas no dia) deu projeção de comissão a uma SEGUNDA vendedora, e o
  spec pega a primeira linha com projeção. Não há retry no `playwright.config`
  (`retries: 0`, de propósito): **vermelho é achado**, e quando ele não bate com
  o que você mexeu, procure o rastro do run anterior antes de suspeitar do
  próprio código. A limpeza segue a ordem dos FKs — parcelas → contratos →
  leads → cabines.

- **Import morto num módulo ANSIOSO custa caro desde o E104/D8.** Enquanto o app
  era um chunk só, um `import` sem uso não pesava nada — o E99 mediu a poda de 24
  primitivos e o bundle não mudou um byte, porque tudo já era tree-shaken. Com o
  corte por rota isso deixou de valer: `dashboard.tsx` importava `format` do
  date-fns sem usar, e como o dashboard é uma das quatro rotas ansiosas, aquele
  import prendia **103 kB de date-fns no caminho crítico de todo mundo** — até da
  noiva abrindo o portal no celular, que não usa data nenhuma. Ao mexer nos
  quatro módulos ansiosos (`App.tsx`, `app-layout`, `login`, `dashboard`),
  confira o que eles importam de verdade.

- **`drizzle-kit push` trava sem TTY** quando há coluna a dropar/renomear: ele
  pergunta "renomeou ou removeu?" e não há terminal interativo aqui. Aplique o
  DDL equivalente por `psql "$DATABASE_URL"` (em transação, com uma guarda que
  aborta se a tabela não estiver no estado esperado) e rode o push depois — ele
  confirma com "Changes applied", sem prompt. Esse DDL fica versionado em
  `docs/migracoes/`: um banco NOVO nasce certo do schema, mas um banco que já
  existe só chega lá por esse script — e `push` não sabe fazê-lo sozinho.
- **O que os scripts de `docs/migracoes/` criam tem de existir no schema
  drizzle, com o MESMO NOME** (S-A20). O drizzle nunca lê aqueles scripts: são
  duas descrições do mesmo banco, e quando divergem, um banco novo e um banco
  antigo deixam de ser o mesmo banco. Divergiram em quatro pontos, e só um
  gritou — o E154 batizou a unique de `itens_estoque_loja_nome_tamanho_unq` e o
  drizzle gera `itens_estoque_loja_id_nome_tamanho_unique`, então o `push`
  tentava criar a duplicata e morria num prompt sem TTY. Os outros três eram
  índices (`itens_estoque_loja_idx`, `avarias_parcela_id_idx`,
  `atendimentos_loja_contato_idx`) que existiam nos bancos antigos e em nenhum
  banco novo: ninguém tropeça num índice que falta. **A varredura de
  `e115-migracao-snapshot-unit.test.ts` agora reprova nome novo que o snapshot
  não conheça** — e a pergunta, quando ela reprovar, é qual das duas pontas está
  certa, nunca como calá-la. Nome divergente conserta-se do lado do SCHEMA
  enquanto nenhum banco consumir o `migrate` (`__drizzle_migrations` não existe),
  porque assim o conserto custa zero DDL em banco de verdade.
- **`drizzle-kit generate` tem o MESMO defeito sem-TTY** (E115): com snapshot
  anterior ele pergunta "criada ou renomeada?" e morre sem terminal. O segundo
  defeito — `out` ABSOLUTO no `drizzle.config.ts`, que o kit relia como
  `.//home/...` e matava com ENOENT — **foi consertado no E154**: `out` é
  relativo (`"./migrations"`) e `pnpm --filter @workspace/db run generate`
  funciona direto. A saída é incremental: o E154 gerou
  `0001_tired_power_man.sql`. **A baseline é regenerável
  enquanto nenhum banco consumir o `migrate`** (o dev usa `push` e não tem
  `__drizzle_migrations` — conferido no E115), e
  `e115-migracao-snapshot-unit.test.ts` reprova schema com coluna fora do
  snapshot: foi assim que o 0000 ficou SEIS migrações para trás e um banco
  provisionado por `migrate` nascia sem `conciliado_em`, com o portal da noiva
  respondendo 500 em toda abertura.
- **`lib/api-zod` é consumido COMPILADO.** Depois do codegen, rode
  `npx tsc --build` na raiz, senão as rotas continuam vendo o contrato antigo e
  o erro de tipo aponta para o lugar errado.
- **Colisão de nomes no codegen**: o Orval gera o schema Zod e o tipo de query
  params com o mesmo nome. `lib/api-zod/src/index.ts` desambigua com re-export
  explícito — se um `Params` novo colidir, some à lista de lá.
- **Param no nível do path vaza para todos os métodos** do OpenAPI. Um
  `competencia` em query que só o GET usa vai dentro do `get:`, senão o POST
  também o ganha e o codegen colide.
- **Os testes de API tocam o banco de verdade** (`DATABASE_URL`). Eles usam
  fixtures isoladas por loja (`criarFixture`/`limparFixture`); competências dos
  testes são datas PASSADAS de propósito — o fechamento recusa mês corrente. A
  ORDEM da limpeza é significativa desde o E91: contratos → loja → usuários →
  perfil. Com as FKs de vendedora em `restrict`, apagar a pessoa primeiro passa
  a falhar em toda fixture que fechou contrato.
- **O navegador desenha `<input type="date|month|time">` na locale da INTERFACE
  dele, NÃO no `lang` do documento** (medido no E92, em dois builds de
  Chromium). `<html lang="pt-BR">` está lá porque é WCAG 3.1.1 nível A e porque
  o leitor de tela lia "noiva" com fonemas ingleses — mas ele NÃO garante
  DD/MM/AAAA. Quem opera com o navegador em inglês continua vendo `07/31/2026`
  num filtro de dinheiro. Teste de UI que dependa do formato desses campos
  precisa fixar `--lang` no browser; a captura sem isso mede o navegador, não o
  app.
- **Para navegar o app à mão, o `E2E_API_PROXY` do Vite NÃO serve.** Ele existe
  só para o Playwright (`vite.config.ts:69`, ligado em `playwright.config.ts:59`)
  e devolve **404 em POST** — ou seja, o login não passa por ele e não há como
  chegar a tela nenhuma. O que funciona (medido na trilha E e reusado no E92):
  subir `api-server` na 5000, o Vite na 5173, e um **proxy próprio na frente dos
  dois** (ex.: 5174 → `/api` para a 5000, resto para a 5173); daí logar normal.
  Vale para conferência visual, captura de tela e medição de contraste — e
  lembre que fazer login **escreve** (uma linha em `sessions` e o carimbo de
  `ultimoLoginEm`), o que é aceitável, mas não é "não toquei no banco".
- **Rotas planas (`/financeiro`, `/contratos/:id`) são compatibilidade
  transitória**: caem no `LegacyRedirect` do `App.tsx`. Código novo linka com
  escopo de loja (`/loja/:lojaId/...`); a sidebar e `useCaminhoDaLoja` mostram o
  padrão.
- **A poda do backup roda DENTRO do backup** (E59): cada dump bom apaga os
  além dos 10 mais recentes e as sessões expiradas. Teste que conta dumps ou
  sessões precisa de fixture própria — o estado global muda sob os pés.
- **Orçamento versiona no ENVIO** (E75): a noiva vê a última versão enviada,
  nunca o rascunho vivo; o aceite congela versão+hash. Editar depois de
  enviado NÃO muda o que ela está vendo — crie/envie nova versão. **APROVADO
  congela de vez** (E115): item e desconto respondem 422 `ORCAMENTO_APROVADO`
  (renegociar é criar novo orçamento), e o `POST /contratos` de um orçamento
  com aceite reconstrói o conteúdo vivo pela MESMA régua do congelamento
  (`conteudoEnviado`) e compara com o `aceiteHash` — divergiu, 422
  `ORCAMENTO_DIVERGE_DO_ACEITE`: o contrato nasce do que a noiva viu, nunca de
  um valor que ela não aceitou.
- **A régua da ação destrutiva** (E10/E99). Toda ação que apaga, desfaz dinheiro
  ou tira acesso **pede confirmação**; a confirmação **nomeia o objeto** ("o
  portal de Marina", "Parcela 3") **e o que se perde** — o valor em dinheiro
  quando houver, o que deixa de funcionar quando não houver; e a ação de
  **confirmar** é vermelha (o gatilho, numa fileira, não precisa ser).
  Duas coisas que a régua NÃO diz, e o porquê: **não** exige
  `variant="destructive"` no gatilho, porque `DropdownMenuItem` não tem essa
  prop — pedir uma grafia que o componente não aceita é escrever regra que
  ninguém pode seguir; e **desfazer não é destrutivo** ("Desfazer retirada",
  "Desfazer devolução"), porque o desfazer É a rede que o E97 criou para errar
  sair barato. `src/lib/destrutivas-varredura.test.ts` cobra a **ausência** de
  confirmação, e só isso — a segunda cláusula é prosa e mora na revisão, com o
  motivo escrito no próprio teste.
- **O portal expõe dados financeiros num link** (E78): TTL 30d, revogação a um
  clique, token em QUERY (o logger corta a query), e o extrato sai só do
  contrato ATIVO da própria noiva. Revogado responde 404 como desconhecido —
  o link morto não conta que um dia valeu. **Nenhuma rota pública aceita id de
  recurso na URL** (E100/F21): o PDF do contrato sai do `leadId` do token, não
  de um `:contratoId` — o que não se pode adivinhar não precisa ser provado.
  A raiz do payload de `GET /portal` tem **lista fechada de chaves**, com teste:
  acrescentar campo naquele link é decisão, não efeito colateral de um `select`
  que cresceu.
- **O TTL do portal conta INATIVIDADE, não idade** (E100/F38): cada `GET
  /portal` bem-sucedido empurra `expiraEm` para 30 dias à frente, junto com o
  `ultimoAcessoEm`. A decisão de segurança dos 30 dias fica de pé — o link de
  quem parou de usar continua morrendo sozinho, no mesmo prazo —, e some o
  absurdo de o link de uma noiva ATIVA vencer no meio de um noivado de um ano.
  **Renovar não ressuscita:** o 410 do vencido e o 404 do revogado rodam ANTES
  do `UPDATE`, então só o acesso vivo estica o prazo. Do lado de dentro, o que
  vencer para de vencer em silêncio: a fila de `/mensagens` marca a linha cuja
  mensagem vai sair sem o link (`leadsComPortalVencido`, mesma régua do selo
  "Expirado" da ficha).
- **O DRE é de CAIXA, e só existe um** (E102/C8). Ele soma o dinheiro que se
  MOVEU dentro da competência — parcela recebida menos pagamento feito —, e por
  isso fecha com o fluxo por construção. A coluna `contas_pagar.competencia`
  existe, está preenchida e **não entra na conta**: nenhuma comissão aparece no
  DRE da competência que a gerou, e sim no mês em que foi paga. O irmão por
  competência foi decidido como épico SEPARADO (E105) em 2026-07-25 — o que não
  podia seguir era o mesmo nome para as duas coisas.
- **Se `.migration-backup/` reaparecer no disco, apague** (A4 + E104). Ele saiu
  do versionamento no A4, mas continuava ocupando 22 MB e **1.563 arquivos** com
  nomes idênticos aos dos vivos — e o custo não é disco, é busca: `find` por
  `*.ts`/`*.tsx` devolvia **2.317 resultados contra 1.528**, ou seja **789
  fantasmas, 34% do total**, e `openapi.yaml` aparecia duas vezes. Duas sessões
  desta rodada perderam tempo abrindo o arquivo errado. Não é commit — o repo já
  está limpo; é higiene de ambiente, e o `.gitignore` já o cobre.
- **`pnpm run build` na raiz exige `PORT` e `BASE_PATH` no ambiente** (A6/E104).
  Sem elas o build morre em `Error: PORT environment variable is required but was
  not provided.`, lançado pelo `vite.config.ts:11` do **`moscow-noivas`** — as
  variáveis só existem no bloco de `run` do Replit. Com `PORT=5000 BASE_PATH=/`
  ele passa inteiro em 8,21 s. Não é defeito de um pacote: é convenção do repo, e
  vale para qualquer build fora do `run`.
- **`artifacts/mockup-sandbox` está no workspace, e sai do typecheck e do build
  pelo FILTRO** (A6/E104), não pelo `pnpm-workspace.yaml`: os dois scripts da raiz
  levam `--filter "!@workspace/mockup-sandbox"`. Medido: o typecheck roda **3 dos
  12 projetos** (`Scope: 3 of 12`), que é onde o custo do pacote morava — 60
  devDependencies, zero dependencies, e nada dele importa `@workspace/*`.
  **Tirá-lo do workspace quebra o Canvas**, e isso já aconteceu uma vez: o
  `[[services]]` roda `pnpm --filter @workspace/mockup-sandbox run dev`
  (`.replit-artifact/artifact.toml:17`), e fora do workspace o filtro responde
  "No projects matched the filters". Ele não foi tirado por quebrar o build da
  raiz — essa razão foi medida e é falsa, veja o item acima.
- **O drill do restore PROVA o dump, não restaura nada** (E89):
  `pnpm --filter api-server run restore-drill` pega o dump mais recente,
  restaura num database EFÊMERO `drill_<timestamp>` na mesma instância e
  confere contra a origem (contagem por tabela, FKs sem órfãs, soma de
  parcelas) — o efêmero morre no `finally`, sucesso OU falha. Ele NUNCA toca o
  database de origem (aborta se o alvo não começar com `drill_`, e a leitura
  da origem é read-only por sessão) e NÃO substitui a guarda de retenção dos
  dumps — se a poda dos 10 apagar o único dump bom, o drill só conta que o
  último que sobrou confere. O resultado fica em `restore_drill_log` e aparece
  em Configurações → Administração ao lado do status do backup.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- `docs/auditoria/2026-07-15-unificacao-mapa-e-plano.md` — por que o sistema é
  assim: a unificação `main` × `feat/orcamentos`, onda a onda, com os desvios
  conscientes e o que segue em aberto.
