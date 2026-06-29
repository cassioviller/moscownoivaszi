# Roteiro de jornada — Gestão (Permissões · Equipe · Admin)

## Propósito (1-2 linhas)
Mapear como o **super-admin** monta a plataforma (lojas, admins, perfis-modelo globais) e como o **admin da loja** personaliza permissões e cadastra a equipe — a camada de governança que decide o que cada perfil enxerga em cada módulo, com `podeNoModulo` como única porta de enforcement.

## Personas e permissões
- **super-admin** (`Usuario.isSuperAdmin = true`): vive no console `/admin`, **fora** do gate de loja (`admin/layout.tsx:8-11` exige `sessao.usuario.isSuperAdmin`, não exige loja ativa). Cria lojas/admins, edita os templates globais de perfil. `podeNoModulo` retorna sempre `true` para ele (`modulos.ts:79`). `isSuperAdmin` **NÃO** afeta o scoping de dados — isolamento segue no `tenantPrisma`; ele só vê todas as lojas no seletor.
- **admin da loja** (`UsuarioLoja.perfilId === "perfil-admin"` na loja): gate `ehAdminDaLoja(usuarioId, lojaId)` (`admin/usuarios.ts:125-136` — true se super-admin OU perfil-admin na loja). Edita override de permissões e cadastra vendedoras na **loja ativa**. `podeNoModulo` retorna `true` para perfil-admin escopado à loja (`modulos.ts:86`).
- **vendedora/recepção/costureira** (perfis seedados): **não** são personas desta jornada — são o *objeto* das permissões. Caem no trilho `efetivo = override(loja) ?? template(perfil)` normalizado (`modulos.ts:88-96`).
- **Gate de navegação** (`nav-items.ts:85-97`): seção "Gestão" mostra Equipe + Permissões só com `podeGerenciarEquipe` (= `ehAdminDaLoja`); "Administração" só com `isSuperAdmin`. Lembrar: esconder link **nunca** autoriza — os gates reais vivem em cada page/action (defesa em profundidade).

## Rotas/telas envolvidas (rota → arquivo)
| Rota | Arquivo | Persona | Gate |
|---|---|---|---|
| `/admin` (lojas + admins) | `src/app/admin/page.tsx` · `admin/actions.ts` | super-admin | `admin/layout.tsx:8-11` + `exigirSuperAdmin()` por action |
| `/admin/perfis` (templates globais) | `src/app/admin/perfis/page.tsx` · `perfis/actions.ts` | super-admin | layout + revalida `isSuperAdmin` na action (`perfis/actions.ts:16-17`) |
| `/loja/[lojaId]/permissoes` (override da loja) | `permissoes/page.tsx` · `permissoes/actions.ts` | admin da loja | `ehAdminDaLoja` na page (`page.tsx:16`) e na `guard()` (`actions.ts:12-17`) |
| `/equipe` (membros + cadastro de vendedora) | `equipe/page.tsx` · `equipe/actions.ts` · `vendedora-form.tsx` | admin da loja | `ehAdminDaLoja` na page (`page.tsx:19`) e na action (`actions.ts:15`) |
| Componente compartilhado | `src/components/permissoes/matriz-permissoes.tsx` | ambos | `modo: readonly` para perfil Admin |
| Núcleos | `src/lib/permissoes/{modulos,perfis}.ts` · `src/lib/admin/usuarios.ts` | — | — |

Nota: `/equipe` fica **fora** de `/loja/[lojaId]` e opera sobre a **loja ativa da sessão** (`getSessaoComLoja`), sem `lojaId` na URL.

## Jornada(s) principal(is)

### Jornada A — Montar a plataforma · super-admin · provisionar loja + admin com N lojas
1. **[`/admin`]** Super-admin abre o console → `admin/layout.tsx:8-11` confirma `isSuperAdmin` (senão `/` ou `/login`); a página carrega `listarLojas()` + `listarAdmins()` em paralelo (`page.tsx:17`). Lista mostra todas as lojas, marcando "inativa" quando `!loja.ativo` (`page.tsx:47-49`).
2. **[`/admin` · form Loja]** Digita o nome e "Criar loja" → `criarLojaAction` (`admin/actions.ts:19-28`) revalida super-admin, chama `criarLoja(nome)` (`usuarios.ts:22-26`, valida nome não-vazio) → `redirect("/admin?ok=loja")`, feedback "Loja criada." O `LojaForm` dá `ref.current?.reset()` após a action (`loja-form.tsx:26-29`).
3. **[`/admin` · form Admin]** Preenche nome/email/senha e **marca uma ou mais lojas** (checkboxes `lojaIds`, `admin-form.tsx:57`) → "Cadastrar admin". Só lojas **ativas** aparecem como opção (`page.tsx:81`).
   - **ATRITO:** se não há nenhuma loja, o `AdminForm` troca o formulário por um aviso "Crie uma loja primeiro" (`admin-form.tsx:15-21`) — bom; mas se houver só lojas **inativas**, a lista de checkboxes fica vazia e o `<fieldset>` aparece sem nenhuma opção, sem mensagem de "nenhuma loja ativa".
4. **[action]** `criarAdminAction` (`admin/actions.ts:30-42`) coleta `formData.getAll("lojaIds")`, revalida super-admin, chama `criarAdmin` → `criarUsuarioComPerfil(input, "perfil-admin")` (`usuarios.ts:68-105`): normaliza email (trim/lowercase), **dedup de lojas** (`new Set`), valida nome/email/senha≥8, e-mail único, **existência de todas as lojas** (`lojas.length !== lojaIds.length → "Loja inexistente"`), bcrypt, e cria `Usuario` + N×`UsuarioLoja(perfil-admin)` numa **transação** (`usuarios.ts:94-100`). Erro → `redirect("/admin?erro=...")`.
   - **ATRITO:** o form oferece só lojas ativas, mas o servidor **não revalida `ativo`** (`criarUsuarioComPerfil` só checa existência) — um POST forjado vincularia admin a loja inativa. Dívida conhecida (`estado-por-modulo.md` §Admin).
5. **[`/admin`]** Lista de Admins mostra nome, email e os nomes das lojas onde ele é perfil-admin (`listarAdmins` filtra `isSuperAdmin:false` + `perfilId:"perfil-admin"`, `usuarios.ts:45-60`). **Não há** editar/desativar/remover — só listar e criar (create+list only).

### Jornada B — Definir o modelo global · super-admin · editar templates de perfil
1. **[`/admin` → link]** Clica "Gerenciar perfis (modelos globais) →" (`page.tsx:84-89`) → `/admin/perfis`.
2. **[`/admin/perfis`]** `listarPerfis()` (`perfis.ts:9-16`) traz todos os perfis ordenados por nome, cada um normalizado (`normalizarAcessos`). Renderiza um `MatrizPermissoes` por perfil (`perfis/page.tsx:20-31`).
3. **[matriz]** Para cada perfil ≠ Admin (`modo: "editavel"`), edita a grade **módulo × ação**: linhas = `leads, interesses, vestidos, ajustes, config→"Catálogo", financeiro` (`matriz-permissoes.tsx:10-17`); colunas = `ver/criar/editar`. **Coerência (UX):** marcar criar/editar força `ver` e o trava (`verTravado`, `matriz-permissoes.tsx:207`); desmarcar `ver` cascateia limpando criar/editar (`onVer`, `:200-206`).
4. **[Admin readonly]** O perfil **Admin** aparece com `modo: "readonly"` (`perfis/page.tsx:28`) — grade desabilitada e selo "Acesso total — perfil do sistema" (`matriz-permissoes.tsx:44-45`). Não editável de propósito (perfil-admin é true por construção em `podeNoModulo`).
5. **[Salvar]** "Salvar" → `salvarTemplateAction` (`perfis/actions.ts:11-29`): revalida super-admin, **rejeita** `perfilId` vazio ou `PERFIL_ADMIN_ID` ("Perfil inválido."), `lerAcessosDoForm` lê checkboxes `${m}.${a}==="on"`, `salvarTemplate` faz `prisma.perfil.update` com `normalizarAcessos` (`perfis.ts:19-24`). Retorna `{ok:true}` → matriz mostra "X atualizado.".
   - **ATRITO:** salvar template **não** roda `revalidatePath` (diferente do override, que revalida em `actions.ts:33`). A própria página é `force-dynamic`, então o estado da matriz vem do `useActionState` — mas qualquer outra superfície que leia o template fica obsoleta até novo request.

### Jornada C — Personalizar a loja · admin da loja · override por loja (snapshot total)
1. **[`/loja/[lojaId]/permissoes`]** Admin abre Permissões → `page.tsx:14-16` exige sessão+loja e `ehAdminDaLoja` (senão `/loja/${id}`). Carrega `listarPerfis()` + `listarOverridesDaLoja(loja.id)` em paralelo (`page.tsx:18-21`).
2. **[resolução override ?? template]** Para cada perfil: `override = overrides.get(p.id) ?? null` e `efetivo = resolverAcessosEfetivos(p.acessosModulos, override)` (`page.tsx:39-40`). **Ponto-chave:** `resolverAcessosEfetivos` (`modulos.ts:57-59`) faz `normalizarAcessos(override != null ? override : template)` — o override **substitui o template inteiro** (snapshot, **não** merge campo a campo). O selo da matriz reflete isso: "Personalizado" se há override, "Padrão" se não (`page.tsx:49`, `matriz-permissoes.tsx:48`).
3. **[matriz módulo × ação]** Edita a grade igual à Jornada B (mesmas regras de coerência criar/editar⇒ver). O perfil **Admin** continua readonly aqui também (`page.tsx:48`).
4. **[Salvar override]** "Salvar" → `salvarOverrideAction` (`permissoes/actions.ts:19-35`): `guard()` (sessão + `ehAdminDaLoja`), rejeita `perfilId` vazio/`PERFIL_ADMIN_ID`, `salvarOverride(loja, perfilId, lerAcessosDoForm(fd))` (`perfis.ts:33-42` — upsert manual via `findFirst`+`updateMany`/`create`, escopado pelo `tenantPrisma`), `revalidatePath`.
   - **Detalhe do snapshot total:** o `MatrizPermissoes` emite **hidden inputs** para módulos fora da grade (`ocultos`, `matriz-permissoes.tsx:88-97`) justamente para o snapshot não **zerar** módulos que o template concedia mas que a UI não desenha. Hoje `MODULOS_VISIVEIS` = todos os MODULOS (`modulos.ts:19`), então não há ocultos na prática — mas o mecanismo está pronto para módulos futuros.
5. **[Restaurar padrão]** Se "Personalizado", aparece "Restaurar padrão" (`matriz-permissoes.tsx:110-128`) com `confirm()` nativo → `restaurarPadraoAction` → `removerOverride` (`perfis.ts:45-47`, `deleteMany` idempotente) → volta a herdar o template global.
   - **ATRITO:** "Restaurar padrão" usa `window.confirm()` — diálogo de navegador cru, fora da linguagem "concierge"; quebra a atmosfera premium e não diz **qual** será o estado resultante (mostra texto genérico, não um preview da matriz que voltará).
6. **[Resolução em runtime]** Quando uma vendedora usa o sistema, `podeNoModulo` (`modulos.ts:69-97`) repete a resolução: super-admin→true; perfil-admin→true; senão busca override por `tenantPrisma(...).perfilOverrideLoja.findFirst({perfilId})` e aplica `resolverAcessosEfetivos`, **falha-fechada** sem vínculo/flag.

### Jornada D — Crescer o time · admin da loja · cadastrar vendedora + ver comissão ao vivo
1. **[`/equipe`]** Admin abre Equipe → `page.tsx:16-19` exige loja ativa (`getSessaoComLoja`, senão `/selecionar-loja`) e `ehAdminDaLoja` (senão `/`). Carrega `listarEquipe(loja.id)` + `podeNoModulo(...,"financeiro","ver")` em paralelo (`page.tsx:25-28`).
2. **[lista + comissão ao vivo]** Lista membros (nome/email/perfil, `usuarios.ts:139-151`). Se `podeVerFinanceiro`, calcula `previewComissao(loja, competenciaAtual())` e exibe "R$ X este mês" por vendedora (`page.tsx:29-31, 75-79`) — **preview ao vivo, não grava** — e o link "Ver ranking de comissões →" (`page.tsx:85-92`). Sem permissão, o número **some sem ruído** (dado sensível).
3. **[cadastrar vendedora]** Preenche nome/email/senha (campo rotulado "Senha inicial (mín. 8 caracteres)", `vendedora-form.tsx:23`, todos `required`) e "Cadastrar vendedora".
4. **[action]** `criarVendedoraAction` (`equipe/actions.ts:11-26`): revalida sessão + `ehAdminDaLoja` (defesa em profundidade), `criarVendedora({...,lojaId: sc.loja.id})` → `criarUsuarioComPerfil(..., "perfil-vendedora")` em **1 loja** (`usuarios.ts:154-159`). Mesma validação do admin (email único, senha≥8, bcrypt, transação). Sucesso → `redirect("/equipe?ok=1")` ("Vendedora cadastrada."); erro → `?erro=` (`equipe/page.tsx:48-55`). O `VendedoraForm` dá `reset()` após a action (`vendedora-form.tsx:12-15`).
   - **ATRITO:** só cria perfil **Vendedora**. Para cadastrar recepção/costureira (perfis que existem no seed e aparecem na matriz de permissões), **não há UI** — fica um descompasso: o admin pode *dar permissões* a um perfil que nunca consegue *atribuir* a alguém pela tela.

## Ramificações e estados de borda
- **Read + create only (Equipe e Admin):** sem editar membro, trocar perfil, remover membro, desativar/editar loja, editar/excluir admin, trocar lojas de um admin, nem reset de senha pela UI (`estado-por-modulo.md` §Equipe/§Admin). Toda correção exige banco.
- **Override é snapshot total → módulo novo = false:** ao adicionar um `MODULO` novo ao código, lojas com override **não** o herdam — o snapshot gravado não tem a chave, e `normalizarAcessos` preenche ausente como `false` (fail-closed, `modulos.ts:46-53`). Precisa regravar override por loja. O template global pega o novo módulo via `normalizarAcessos` automaticamente (false até o super-admin marcar).
- **Sem CRUD de perfis customizados:** só os 4 perfis seedados (admin/vendedora/recepção/costureira) — não há criar/excluir perfil pela UI; só editar template/override dos existentes.
- **Perfil Admin é intocável:** readonly na matriz nas duas telas; ambas as actions **rejeitam** `PERFIL_ADMIN_ID` (`perfis/actions.ts:20`, `permissoes/actions.ts:25`). `podeNoModulo` o trata como true por construção, então editá-lo não teria efeito.
- **`salvarOverride` sem upsert atômico:** `findFirst`+`create`/`updateMany` (`perfis.ts:36-41`) tem corrida teórica (dois admins salvando ao mesmo tempo). Sem unique-constraint protegendo na camada de lib (PK é `[lojaId, perfilId]`, então o banco barraria duplicata, mas o caminho não usa upsert nativo).
- **Equipe opera na loja ativa (sem lojaId na URL):** se o admin gerencia N lojas, precisa "Trocar loja" antes; não há seletor de loja dentro de `/equipe`.
- **Admin form: só lojas ativas como opção, servidor não revalida ativo** (ver Jornada A passo 4).
- **`config` rotulado "Catálogo" e `ajustes` = "tela da costureira"** na matriz (`matriz-permissoes.tsx:14-15`): o rótulo da UI diverge do nome técnico do módulo — fonte de confusão para quem cruza permissão com código.

## Pontos de fricção observados no código real
1. **`window.confirm()` em "Restaurar padrão"** (`matriz-permissoes.tsx:115-123`): diálogo de browser cru rompe a atmosfera Concierge Atelier e não mostra o estado resultante. É a única ação destrutiva da jornada e merece um confirm in-app com preview.
2. **Grade de permissões é uma tabela densa de checkboxes** (6 módulos × 3 ações × N perfis empilhados): cara de "ERP de permissões", sem explicar o que cada módulo/ação concede na prática nem o efeito real (quem é afetado, quantos usuários). Rótulos divergentes (`config`→"Catálogo") agravam.
3. **Salvar template não revalida cache** (`perfis/actions.ts`, sem `revalidatePath`) enquanto o override revalida (`permissoes/actions.ts:33`) — inconsistência; mudança de template pode parecer "não pegou" em superfícies cacheadas.
4. **Servidor não revalida loja `ativo` ao criar admin** (`usuarios.ts:83-87` só checa existência) — confia no filtro do form. Risco de vincular admin a loja inativa via POST forjado.
5. **Descompasso perfil×cadastro:** matriz dá permissões a recepção/costureira, mas Equipe só cadastra **Vendedora** — perfis "órfãos" sem caminho de atribuição na UI.
6. **`/equipe` sem contexto de loja visível além do "← {nome}"** e sem seletor: admin multi-loja precisa adivinhar que cadastra na loja ativa atual.
7. **Sem nenhuma forma de desfazer** no provisionamento (criar loja/admin/vendedora): erro de digitação de email vira registro permanente que só o banco corrige.

## Sementes de melhoria (ideias para brainstorming — NÃO implementar)
- **Matriz "humana" por perfil:** transformar a grade em cartões por perfil com microcopy ("A recepção pode **ver** noivas e **agendar**, mas não mexe em Financeiro"), contagem de "X pessoas usam este perfil nesta loja", e um *preview do efetivo* antes de salvar. Aproxima do tom concierge e reduz erro.
- **Confirm in-app para "Restaurar padrão"** com diff visual (antes×depois) em vez de `window.confirm`; mesma linguagem para qualquer ação destrutiva futura.
- **Editar/desativar (não deletar) na Equipe e no Admin:** trocar perfil de um membro, desativar vínculo, reset de senha (gera senha temporária), editar nome da loja, desativar loja — fechando o "read+create only" sem precisar de banco. Manter o padrão "nunca DELETE, só desativar" do resto do app.
- **Atribuir qualquer perfil seedado na Equipe** (Vendedora/Recepção/Costureira) via seletor de perfil, eliminando o descompasso perfil×cadastro.
- **Migração de override ao adicionar módulo:** ao introduzir um `MODULO` novo, oferecer "atualizar overrides desta loja para herdar o novo módulo do template" (resolve o snapshot-total que congela em false).
- **Seletor de loja dentro de `/equipe`** (ou levar Equipe para `/loja/[lojaId]/equipe`) para admin multi-loja agir sem "Trocar loja".
- **Padronizar revalidação** entre template e override; e considerar upsert atômico em `salvarOverride`.
- **Convite por email** em vez de "senha inicial" digitada pelo admin (o admin nunca conhece a senha alheia; reduz fricção e risco).
