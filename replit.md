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
- `pnpm --filter @workspace/moscow-noivas test` — testes da lógica pura do frontend
- `pnpm run test:e2e` — Playwright (sobe API + frontend; ver `playwright.config.ts`)
- `pnpm --filter @workspace/api-spec run codegen` — regenera cliente e Zod do OpenAPI
- `pnpm --filter @workspace/db run push` — aplica o schema no banco (dev)
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
  depois: a divergência vira desconfiança no número.
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
  servidor. Corolário: campos de autoria são ON DELETE SET NULL, porque perder
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
  régua que o E91 (usuário), o E106 (loja) e o E111 (noiva, parcela, perfil)
  aplicam igual: 404 antes de qualquer escrita, 409 LEGÍVEL dizendo o que segura
  o registro (`LEAD_COM_CONTRATO`, `PERFIL_EM_USO`, `USUARIO_COM_HISTORICO`,
  `LOJA_COM_HISTORICO`) em vez do 23503 genérico do banco, e `registrarAuditoria`
  DENTRO da transação e ANTES do delete — depois dele não há linha de onde
  reconstituir. A guarda de `DELETE /admin/usuarios/:id` conta as **seis** FKs
  que apontam para `usuarios`, contando `recorrencias` (CASCADE: apagava o
  salário em silêncio) e `comissao_regras` (restrict).
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
  rede "não consegui falar com o sistema") → o `fallback` da TELA.
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
  `estornar`, …) é `editar`, não `criar`. A lista é uma só, e a varredura de
  `e101-acao-da-rota-api.test.ts` a IMPORTA — verbo novo sem classificação
  reprova o teste. Sem isso, o guard de prefixo do router e o guard da rota
  exigem ações DIFERENTES e a pessoa leva 403 numa ação que ela pode fazer.
- **Uma reserva de vestido é de um contrato ATIVO só** (E111). `POST /contratos`
  recusa com 409 `RESERVA_JA_CONTRATADA` o bloqueio já preso por outro contrato
  ativo, **e grava `bloqueio_vestidos.lead_id`** — o contrato é quem dá dona à
  reserva que nasceu sem. Cancelar o contrato solta a peça (soft-cancel), e ela
  volta ao mercado. A seção "O seu vestido" do portal resolve pelo vínculo VIVO
  `contrato_bloqueios`; `contratos.bloqueio_vestido_id` é legado lido, nunca
  escrito — decidir por ele deixava a seção morta em produção.

## Product

- **Jornada da noiva** — leads/noivas, agenda, atendimentos, provas, ajustes,
  reservas de vestido (com motor de disponibilidade), catálogo e acervo.
  Avarias da devolução viram parcela cobrável (E71); LGPD interna com
  consentimento carimbado e expurgo que preserva números (E77).
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
  enviado NÃO muda o que ela está vendo — crie/envie nova versão.
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
