# Roteiro de jornada — Entrada (login · seleção de loja · shell)

## Propósito (1-2 linhas)
Mapear, passo a passo e ancorado no código real, a jornada de ENTRADA do atelier: do login à loja ativa e ao shell de navegação — incluindo os gates em camadas (sessão → loja → URL) e os casos de borda (0/1/N lojas, sessão expirada, loja desativada, super-admin).

## Personas e permissões (quem usa; gates/sessão exigidos)
- **Super-admin** (`Usuario.isSuperAdmin = true`): staff da plataforma. No login é mandado para `/admin` (`login/actions.ts:32`), **não** para o fluxo de loja. Vê **todas as lojas ativas** no seletor (`listarLojasDoUsuario`, `sessao.ts:64-69`). Para abrir uma loja, basta ela existir e estar `ativo` (`definirLojaAtiva`, `sessao.ts:109-111`). `isSuperAdmin` **não** afeta o tenant scoping — opera dentro de UMA loja por vez via `lojaAtivaId`.
- **Admin de loja** (`perfil-admin`, vínculo `UsuarioLoja`): além dos módulos, libera a seção **Gestão** da nav (Equipe + Permissões) via `ehAdminDaLoja` (`loja/[lojaId]/layout.tsx:30`).
- **Usuário comum** (vendedora/recepção/costureira): só vê as lojas a que está vinculado por `UsuarioLoja` (`sessao.ts:71-76`). Links de nav aparecem conforme `podeNoModulo(...)` — porém **esconder link nunca autoriza**; os gates reais vivem em cada page/action.
- **Gate de sessão (todos):** cookie `moscow_sessao` (`cookie.ts:4`), tabela `Sessao`, **TTL absoluto de 8h sem rolling** (`SESSAO_TTL_MS`, `sessao.ts:5`). A sessão também exige `usuario.ativo` a cada leitura (`lerSessao`, `sessao.ts:37`).
- **Gate de loja ativa (todos no `(app)`):** `Sessao.lojaAtivaId` apontando para loja existente e `ativo` (`gateSessaoLojaAtivaPorId`, `sessao.ts:152-168`).

## Rotas/telas envolvidas (lista: rota → arquivo)
- `/login` → `src/app/(public)/login/page.tsx` (+ `login-form.tsx`, `actions.ts`)
- `/selecionar-loja` → `src/app/(public)/selecionar-loja/page.tsx` (+ `selecao-form.tsx`, `actions.ts`)
- `/` (hub redirect) → `src/app/(app)/page.tsx`
- `/loja/[lojaId]` (shell + dashboard) → `src/app/(app)/loja/[lojaId]/layout.tsx` (shell) e `page.tsx` (dashboard)
- Gate global do grupo autenticado → `src/app/(app)/layout.tsx`
- Logout → `src/app/(app)/actions.ts` (`logoutAction`)
- Fronteira de erro do atelier → `src/app/(app)/loja/[lojaId]/error.tsx`
- Núcleo de sessão/tenant → `src/lib/auth/{index,sessao,cookie,senha}.ts`, `src/lib/tenant.ts`, `src/lib/loja/acesso.ts`
- Shell de navegação → `src/components/layout/{sidebar,topbar,mobile-nav,nav-items}.{tsx,ts}`

## Jornada(s) principal(is)

### Jornada A — Login com sucesso (usuário comum, 1 loja) · usuário comum · entrar e cair direto na loja
1. **[/login]** Usuário acessa `/login` → o servidor checa `getSessao()`; se já houver sessão, redireciona para `/` (`login/page.tsx:6-7`). Sem sessão, renderiza o form (campo e-mail com `autoFocus`).
2. **[/login]** Preenche e-mail + senha e clica **Entrar** → `loginAction` normaliza o e-mail (`trim().toLowerCase()`, `actions.ts:13`), busca usuário, valida `ativo` e `verificarSenha` (bcrypt, `senha.ts:9-17`).
3. **[/login]** Credenciais válidas → `criarSessao` gera id `randomBytes(32).base64url`, grava `Sessao` com `expiraEm = now + 8h` e faz cleanup de sessões expiradas do usuário (`sessao.ts:11-26`); `setCookieSessao` seta o cookie httpOnly; `redirect("/")` (não super-admin, `actions.ts:32`).
4. **[/ → gate]** O `(app)/layout` chama `gateSessaoLojaAtiva()`. Como ainda **não há `lojaAtivaId`**, o estado é `sem-loja-ativa` → `redirect("/selecionar-loja")` (`(app)/layout.tsx:8`).
5. **[/selecionar-loja]** A página vê `getSessaoComLoja()` ainda nulo, lista as lojas e, com **exatamente 1**, faz **auto-select server-side**: `definirLojaAtiva(...)` grava `lojaAtivaId` e `redirect("/")` — **sem render visível** (`selecionar-loja/page.tsx:27-30`).
6. **[/ → /loja/[id]]** Agora `getSessaoComLoja()` resolve; o hub redireciona para `/loja/${loja.id}` (`(app)/page.tsx:11`).
7. **[/loja/[id]]** O `LojaLayout` (`force-dynamic`) revalida sessão+loja, confere URL×loja (`resolverAcessoLoja`, `acesso.ts:12`), resolve as flags de nav em `Promise.all` (`layout.tsx:29-36`) e renderiza Sidebar + Topbar + dashboard.
   - **ATRITO (leve):** a jornada feliz atravessa **3 redirects encadeados** (`/` → `/selecionar-loja` → `/` → `/loja/[id]`) antes de pintar a tela. Para 1 loja é invisível em prática, mas é latência de navegação acumulada e dependente de DB a cada salto.

### Jornada B — Login com erro · qualquer persona · feedback de credencial
1. **[/login]** Usuário envia e-mail inexistente, usuário `ativo = false`, ou senha errada.
2. **[/login]** Em qualquer um dos casos, `loginAction` retorna **a mesma** mensagem genérica `"Credenciais inválidas"` (`actions.ts:17`) — nunca revela se o e-mail existe (decisão de segurança). `verificarSenha` também trata hash malformado como "não bate" (`senha.ts:13-15`).
3. **[/login]** O `login-form` (client, `useActionState`) exibe `state.erro` num `<p role="alert">` (`login-form.tsx:41-45`).
   - **ATRITO:** mensagem deliberadamente vaga — correto para segurança, mas **sem caminho de recuperação** ("Esqueci a senha" não existe; reset de senha não tem UI em nenhum lugar do sistema). Usuário travado depende 100% do administrador.
   - **ATRITO (menor):** o campo não distingue "conta desativada" de "senha errada" — esperado por design, mas significa que um colaborador desligado/reativado não recebe nenhuma pista.

### Jornada C — Super-admin · staff da plataforma · entrar no console, depois numa loja
1. **[/login]** Super-admin loga com sucesso → `redirect("/admin")` (`actions.ts:32`), **fora** do gate de loja.
2. **[/admin]** Opera o console (lojas, admins, perfis-modelo) sem `lojaAtivaId` definido.
3. **[entrar numa loja]** Ao querer operar uma loja, precisa passar por `/selecionar-loja`; lá vê **todas as lojas ativas** (`sessao.ts:64-69`) e escolhe.
   - **ATRITO:** o caminho do super-admin do `/admin` para "abrir uma loja específica" **não é sinalizado** na entrada — não há um seletor a partir do console; ele precisa navegar manualmente para `/selecionar-loja` (ou para uma URL `/loja/[id]`, que será corrigida pelo espelhamento). A transição console→operação é implícita.

### Jornada D — N lojas (escolha manual) · super-admin ou usuário multi-loja · escolher a loja de trabalho
1. **[/selecionar-loja]** Com `lojas.length > 1`, renderiza o `SelecaoForm` com radios (primeiro pré-marcado, `selecao-form.tsx:39`) (`page.tsx:65-84`).
2. **[/selecionar-loja]** Usuário escolhe e clica **Entrar** → `selecionarLojaAction` chama `definirLojaAtiva`, que **valida o acesso ANTES de gravar** (`sessao.ts:99-123`).
3. **[sucesso]** `redirect("/")` → segue para `/loja/[id]`.
4. **[lojaId forjado/sem acesso]** `definirLojaAtiva` lança; o `catch` redireciona para `/selecionar-loja?erro=acesso` (`selecionar-loja/actions.ts:17-22`) e o form mostra "Você não tem acesso a essa loja." (`selecao-form.tsx:47-51`). **Falha-fechada, sem 500.**
   - **ATRITO:** a lista de lojas é só **nome** (`page.tsx:79`), sem cidade/endereço/sigla. Para uma rede com lojas de nome parecido (ex.: duas unidades "Moscow Centro"), a escolha é ambígua.
   - **ATRITO:** não há memória de "última loja usada" nem ordenação por uso — sempre pré-marca a primeira alfabética; multi-loja recorrente reescolhe toda vez que perde `lojaAtivaId`.

### Jornada E — Trocar de loja pelo menu · usuário multi-loja · mudar a loja ativa
1. **[shell]** Com `>1` loja, a nav mostra **"Trocar loja"** apontando para `/selecionar-loja` (`nav-items.ts:96-98`; flag `mostrarTroca` de `mostrarTrocaLoja`, `acesso.ts:20`).
2. **[/selecionar-loja]** A página roda `getSessaoComLoja()` **primeiro**; como a loja ativa atual é válida, **redireciona para `/`** antes de mostrar o seletor (`selecionar-loja/page.tsx:21-22`).
3. **[resultado]** Volta para a loja atual — **o seletor nunca aparece**.
   - **ATRITO (grave / bug funcional):** **"Trocar loja" não funciona enquanto há loja ativa válida.** O guard anti-loop (`comLoja → redirect("/")`) é o mesmo que impede a troca deliberada. Para trocar, o usuário hoje teria que deslogar (perdendo a sessão) e logar de novo, ou ter a loja desativada. Não há ação que **limpe** `lojaAtivaId` sob demanda.

### Jornada F — Sessão expirada / 8h · qualquer persona · expiração silenciosa
1. **[qualquer rota `(app)`]** Após 8h da criação (TTL absoluto, sem rolling — `sessao.ts:5,23`), a próxima request: `lerSessao` vê `expiraEm <= now` e retorna null (`sessao.ts:36`).
2. **[gate]** `gateSessaoLojaAtivaPorId` devolve `sem-sessao` → `(app)/layout` faz `redirect("/login")` (`(app)/layout.tsx:7`).
   - **ATRITO:** expiração é **absoluta e silenciosa**, mesmo em uso contínuo. Uma vendedora no meio de um cadastro às 8h01 é jogada para `/login` **sem aviso prévio e sem retorno ao ponto onde estava** (não há `?next=`/deep-link de volta). O trabalho não salvo no formulário se perde.
   - **ATRITO (menor):** o cookie tem `expires = sessao.expiraEm` (`cookie.ts:15`), então pode sumir do navegador no mesmo instante — sem distinção entre "cookie sumiu" e "sessão expirou no DB".

### Jornada G — Loja desativada durante a sessão · usuário com a loja ativa apontando para loja `ativo=false`
1. **[qualquer rota `(app)`]** A loja em que a pessoa trabalhava é desativada (`Loja.ativo = false`).
2. **[gate]** `gateSessaoLojaAtivaPorId` busca a loja, vê `!loja.ativo` e retorna `sem-loja-ativa` (`sessao.ts:163-166`) → `redirect("/selecionar-loja")`.
3. **[/selecionar-loja]** `getSessaoComLoja()` também retorna null (loja inativa, `sessao.ts:138`), então o seletor aparece de fato — listando só lojas **ativas**.
   - **ATRITO:** transição abrupta e **sem explicação** ("a loja foi desativada") — a pessoa simplesmente reaparece no seletor. Se era a única loja, cai direto no estado "Sem acesso a lojas" (Jornada H) sem entender o porquê.

### Jornada H — Zero lojas · usuário sem vínculo (ou única loja desativada) · beco sem saída elegante
1. **[/selecionar-loja]** `lojas.length === 0` → renderiza o estado vazio "Sem acesso a lojas" com só um botão **Sair** (`logoutAction`) — **sem loop** (`page.tsx:33-63`).
   - **ATRITO:** beco sem saída real — a única ação possível é **Sair**. Mensagem "Procure o administrador" é a única orientação; não há contato, e-mail nem CTA de suporte. Um super-admin recém-criado sem nenhuma loja ativa no sistema também cairia aqui se navegasse para `/selecionar-loja`.

## Ramificações e estados de borda (erros, fail-closed, casos vazios)
- **Espelhamento URL × loja ativa:** acessar `/loja/[outra]` (loja alheia, inexistente ou lixo) → `resolverAcessoLoja` devolve `redirect` para `/loja/${lojaAtivaId}` (`acesso.ts:12-16`). Nunca renderiza dado de loja que não é a ativa.
- **`lojaId` forjado no seletor:** `definirLojaAtiva` valida vínculo/atividade e lança → `catch` → `?erro=acesso` (`selecionar-loja/actions.ts:17-22`). Sem 500, sem gravação.
- **Já logado tentando `/login`:** redireciona para `/` (`login/page.tsx:6-7`).
- **Já com loja válida tentando `/selecionar-loja`:** redireciona para `/` (anti-loop — e é a causa do bug da Jornada E).
- **Narrows defensivos:** `(app)/page.tsx:10` e `loja/[lojaId]/layout.tsx:22` repetem `if (!sc) redirect("/login")` mesmo após o gate de layout — defesa em profundidade.
- **Tenant fail-closed:** `tenantPrisma` lança se `lojaId` vazio (`tenant.ts:99-101`); linha de outra loja → `findUnique` null, `update/delete` P2025. Raw SQL não passa pelo guard (proibido por scan de CI).
- **Erro de runtime no subtree da loja:** `loja/[lojaId]/error.tsx` captura exceções (motor de disponibilidade, Prisma) e mostra mensagem calma "Algo saiu do lugar" com **Tentar de novo** + **Voltar ao início**, mantendo sidebar/topbar.
- **Logout:** `logoutAction` destrói sessão (idempotente), limpa cookie e `redirect("/login")` (`(app)/actions.ts:10-15`).
- **`force-dynamic`:** `(app)/page.tsx` e `loja/[lojaId]/layout.tsx` nunca cacheiam — contagem/flags de tenant sempre por-request.

## Pontos de fricção observados no código real
1. **"Trocar loja" é um no-op enquanto a loja ativa é válida** (Jornada E): o link `/selecionar-loja` colide com o guard anti-loop e devolve para `/`. Não existe ação que limpe `lojaAtivaId` sob demanda — trocar de loja é, na prática, impossível sem deslogar.
2. **Expiração de 8h absoluta, silenciosa e sem retorno** (Jornada F): sem aviso, sem rolling, sem deep-link de volta (`?next=`). Trabalho em formulário se perde no corte.
3. **Sem recuperação de credencial em lugar nenhum**: "Credenciais inválidas" é o fim da linha; não há "esqueci a senha", nem reset de senha por UI (confirmado também no estado-por-módulo: Equipe/Admin são "read+create only").
4. **Seletor de loja pobre em contexto** (Jornada D): só o nome, sem desambiguação, sem "última usada", sempre pré-marcando a primeira alfabética.
5. **Estados de transição sem explicação** (Jornadas G/H): loja desativada e "0 lojas" reaparecem em telas novas sem dizer o que aconteceu; "Sem acesso a lojas" é beco sem saída com só "Sair".
6. **Cadeia de 3 redirects no caminho feliz de 1 loja** (Jornada A): correto, mas é latência encadeada dependente de DB a cada salto.
7. **Transição console→loja do super-admin é implícita** (Jornada C): nada no `/admin` conduz para abrir uma loja específica.

## Sementes de melhoria (ideias para brainstorming — NÃO implementar)
- **Trocar loja de verdade:** rota/parâmetro que limpe `lojaAtivaId` (ex.: `/selecionar-loja?trocar=1` ignorando o guard `comLoja`, ou uma `trocarLojaAction` dedicada) — destravar a Jornada E sem deslogar. Bônus: dropdown de lojas direto no Topbar para quem tem `>1`.
- **Saída elegante da expiração:** banner/aviso de "sua sessão expira em X" e, ao cair em `/login`, preservar `?next=` para voltar exatamente à tela onde estava — preservando o tom Concierge (nada de "stack trace" de sistema).
- **Recuperação de acesso humana:** fluxo "Precisa de ajuda para entrar?" que orienta a falar com o administrador (com nome/contato do admin da loja), mesmo sem auto-reset — coerente com a postura concierge.
- **Seletor de loja com contexto e memória:** mostrar cidade/identidade da loja, destacar a "última usada" e pré-selecionar a mais provável; transformar o auto-select de 1 loja numa micro-transição calma (não um flash de redirect).
- **Mensagens de transição cuidadas:** ao ser mandado ao seletor por loja desativada, dizer gentilmente "Esta loja foi pausada — escolha outra"; no estado "0 lojas", oferecer um caminho de contato em vez de só "Sair".
- **Login com alma de atelier:** a tela de login é funcional mas neutra ("Acesse o sistema interno") — oportunidade de aplicar a direção Concierge (serifa editorial, atmosfera marfim/champagne) já na primeira impressão, sem virar decoração.
- **Achatamento dos redirects de entrada:** resolver loja ativa o mais cedo possível (no próprio gate) para reduzir os saltos `/` → `/selecionar-loja` → `/` → `/loja/[id]` no caminho de 1 loja.
