# Estado atual — Moscow Noivas

> Snapshot de onde paramos. Atualizado em **2026-06-01**. Envelhece — confira os commits e os testes antes de confiar.

## Provas & Ajustes + bloco contínuo (fatia 2026-06-01)

Spec/decisão: `docs/superpowers/specs/2026-06-01-provas-ajustes-design.md`. **Opção B** —
núcleo da noiva (provas/ajustes na reserva) + tela global de Ajustes da costureira.

**Decisão de regra de negócio (registrada):** (1) indisponibilidade do vestido é um
**bloco contínuo, sem buracos** (preparação → uso → higienização, encostadas); (2) a
**prova real é operacional e NÃO alimenta o motor** — registrar/remarcar/faltar prova não
move a disponibilidade nem libera a peça.

| Peça | Onde | Notas |
|---|---|---|
| Schema | `prisma/schema.prisma` + migration `..._atelier_provas_ajustes` | Enums `ProvaTipo`/`ProvaComparecimento`/`AjusteStatus`. `Prova` (filha de `BloqueioVestido`), `Ajuste` (filha de `Prova`) — ambas com `lojaId`, em `TENANT_MODELS`. `AjusteChecklistItem` (filha pura, via pai). |
| Motor | `src/lib/disponibilidade/{motor,tipos,agenda}.ts` | `calcularJanelas` projeta bloco **contínuo**: fase `preparacao` (renomeada de `prova`) vai de `C−provaDiasAntes` até **encostar no uso** (sem buraco). **Ignora `provaDataReal`** (coluna mantida, deprecada — sem migração destrutiva). `provaDuracao` não afeta mais a disponibilidade. |
| Data layer | `src/lib/atelier/{provas,ajustes}.ts` (+ `__tests__/atelier.test.ts`, 9) | Tudo via `tenantPrisma`. `registrarProva` valida que o bloqueio é RESERVA da loja; `listarAjustesPendentes` é a fila global (junta prova→reserva→noiva/vestido, ordena por casamento). Checklist confirma o Ajuste pai antes de tocar a filha (padrão `fotos.ts`). |
| Permissão | `src/lib/permissoes/modulos.ts` + `prisma/seed.ts` | Novo módulo **`ajustes`** na grade. Admin = TODAS; novo perfil **Costureira** (só `ajustes`); vendedora ganha `ajustes:ver`; usuário dev `costureira@moscow.local`. |
| Navegação | `src/components/layout/nav-items.ts` + `loja/[lojaId]/layout.tsx` | Item "Ajustes" sob flag `podeVerAjustes` (resolvida no servidor). |
| Detalhe da reserva | `src/app/(app)/loja/[lojaId]/reservas/[bloqueioId]/{page,actions}.tsx` | Noiva/vestido/casamento + fases do bloco + provas (registrar/comparecimento/remover) + ajustes por prova (add/marcar feito/remover) + checklist. Ver = `leads:ver`; mutações = `ajustes:criar/editar`. Linkado do perfil da noiva e do livro de reservas. |
| Ajustes (global) | `src/app/(app)/loja/[lojaId]/ajustes/{page,actions}.tsx` | Fila da costureira: pendentes por urgência (bordô ≤14d), "marcar feito". Gate `ajustes:ver`/`ajustes:editar`. |

**Fast-follow (fora desta fatia):** transformar provas reais em compromissos próprios da
Agenda (hoje a Agenda mostra a fase de preparação como período reservado). Gates: `npm test`
**195/195**, `tsc` limpo, rotas novas compilam e gateiam (307 sem auth). Smoke HTTP autenticado
(click-through) não feito — o fluxo reserva→prova→ajuste→fila→feito está coberto por
`atelier.test.ts` contra Postgres real.

### Conserto (2026-06-01)

Spec/plano: `docs/superpowers/specs/2026-06-01-conserto-provas-ajustes-design.md`, `docs/superpowers/plans/2026-06-01-conserto-provas-ajustes.md`.

- **Acesso da costureira:** o detalhe da reserva (`reservas/[bloqueioId]`) agora abre com `leads:ver` **OU** `ajustes:ver`; links de noiva/vestido viram texto puro sem a permissão; "voltar" vai p/ `/ajustes` quando sem `leads`. A costureira passa a registrar provas, criar ajustes e usar checklist (antes só "marcar feito").
- **Robustez (falha-fechada):** `registrarProva`/`editarProva` validam formato de data (via `parseDiaUTC`) e o enum `comparecimento`, retornando motivo (`data_invalida`/`comparecimento_invalido`) em vez de 500/silêncio; a action de edição mostra o erro.
- **Edição completa da prova:** o form por prova vira "Editar prova" (data/tipo/comparecimento/responsável/observação) — `editarComparecimentoAction` → `editarProvaAction`.
- **Smoke commitado:** `scripts/smoke-atelier.ts` (HTTP autenticado + camada de dados, com cleanup em `finally`). Rodar com o app no ar: `BASE_URL=http://localhost:5000 node node_modules/tsx/dist/cli.mjs scripts/smoke-atelier.ts` → 13/13 (inclui "costureira abre o detalhe").
- **Operacional:** após mudar schema, reiniciar o app (Run) p/ recarregar o client Prisma — senão telas com models novos dão 500.

## Em uma frase

**`main` integrada** (fast-forward, `ee8c440`): agora contém **central de permissões** + **direção criativa Concierge Atelier** (docs) + **tokens CSS** + **shell de navegação** (sidebar/topbar/mobile-nav + layout/dashboard da loja). A dívida de merge foi paga — as branches `feat/central-permissoes` e `feat/design-concierge-atelier` ficaram empilhadas linearmente sobre a `main` e foram trazidas de uma vez. Antes fecharam: Central de permissões, Módulo Vestidos, B.1, B.2-T1/T1b/T2/T3, B.3 F1–2. Próximo: continuar o **dashboard Concierge Command** (Passo 6 do `IMPLEMENTACAO_DESIGN.md`) **ou** abrir o módulo **Leads/Interesses** (entra na grade de permissões quando ganhar superfície).

> Central de permissões — **templates globais + override por loja**: tabela `PerfilOverrideLoja` (PK composta, dentro do `tenantPrisma`); `podeNoModulo` resolve `override(loja) ?? template(perfil)` normalizado (snapshot + `normalizarAcessos` fail-closed; `criar|editar ⇒ ver`); Admin = acesso total travado. Telas `/admin/perfis` (super-admin) e `/loja/[lojaId]/permissoes` (admin da loja), ambas reusando `MatrizPermissoes`. Spec/plano: `docs/superpowers/specs/2026-05-29-central-permissoes-design.md` (v2), `docs/superpowers/plans/2026-05-29-central-permissoes.md`.

> **Design Concierge Atelier (shell):** docs em `docs/design/` + `DESIGN.md`; tokens CSS warm (marfim/champagne/bordô) em `globals.css`; shell de navegação em `src/components/layout/{sidebar,topbar,mobile-nav,nav-items}` montado no `loja/[lojaId]/layout.tsx` — flags de nav resolvidas no servidor (esconder link não é autorização; gates reais seguem nas pages/actions). Falta o **dashboard Concierge Command** (cards do dia → agenda → atenções → jornada → destaque do atelier).

> **Estado do banco de dev:** `admin@moscownoivas.local` está com `isSuperAdmin=true` (UPDATE manual). Há 2 lojas (`loja-moscow`, `loja-teste-2`). A vendedora (`vendedora@lojateste.local`) tem vínculo em **uma só loja** (`loja-moscow`) — auto-seleciona e cai direto na home. **Sessões: 0** (as 3 sessões forjadas de smoke foram removidas em 2026-05-30; recriar via `scripts/forge-sessao-smoke.ts` quando precisar).

## Onde estamos no loop

```
Motor de Disponibilidade: PLAN ✓ → RED-TEAM ✓ → BUILD ✓ → VERIFY ✓ → POLISH ✓ → REVIEW ✓ → correções #1/#2 ✓ [fechada]
B.1 Identidade:           PLAN ✓ → RED-TEAM ✓ → BUILD ✓ (T1-6) → POLISH ✓ (T7) → VERIFY ✓ (T8) [fechada]
B.2 Scoping de loja:      T2 (guard tenantPrisma + zero-vazamento) ✓ → T1 (sessão.lojaAtivaId + /selecionar-loja) ✓ → T3 (rota /loja/[lojaId]/ + dashboard scoped) ✓ [fechada]
Módulo Vestidos + permissões: PLAN (brainstorming + impeccable consultiva) ✓ → BUILD (subagent-driven, 8 tasks) ✓ → VERIFY (119/119 + tsc + smoke) ✓ [fechada]
Central de permissões:        PLAN (brainstorming + grill-me + spec v2) ✓ → BUILD (tdd, 8 tasks) ✓ → VERIFY (133/133 + tsc + smoke) ✓ → CODE-REVIEW (high, 7 finders) + correções ✓ [fechada, mergeada na main]
Design Concierge Atelier:     docs+tokens (drop-in) ✓ → shell de navegação (Fatia 2: sidebar/topbar/mobile-nav) ✓ → INTEGRAÇÃO (ff main) ✓ → dashboard Concierge Command [próximo]
```

Próxima fatia: **dashboard Concierge Command** (Passo 6 do `IMPLEMENTACAO_DESIGN.md`) ou **módulos Leads/Interesses**. Quando Leads ganhar página, entra em `MODULOS_VISIVEIS` da grade de permissões. O módulo `config` segue fora da grade até ter superfície real.

## O que está pronto na Central de permissões

| Peça | Onde | Notas |
|---|---|---|
| Tabela de override | `prisma/schema.prisma` + migration `..._add_perfil_override_loja` | `PerfilOverrideLoja { lojaId, perfilId, acessosModulos, @@id([lojaId,perfilId]) }`, cascade. Entra em `TENANT_MODELS` (`src/lib/tenant.ts`). |
| Helpers puros | `src/lib/permissoes/modulos.ts` (+ `__tests__/acessos.test.ts`, 7) | `normalizarAcessos` (reconcilia shape, fail-closed, `criar\|editar⇒ver`) e `resolverAcessosEfetivos` (snapshot: override ?? template). |
| Enforcement | `src/lib/permissoes/modulos.ts` (P5/P6 em `modulos.test.ts`) | `podeNoModulo`: super-admin→true; perfil Admin→true; senão `override(loja via tenantPrisma, where {perfilId}) ?? template`. |
| Camada de dados | `src/lib/permissoes/perfis.ts` (+ `__tests__/perfis.test.ts`, 4) | `listarPerfis`, `salvarTemplate`, `listarOverridesDaLoja`, `salvarOverride` (findFirst→updateMany/create), `removerOverride` (deleteMany idempotente). `PERFIL_RECEPCAO_ID` add. |
| Componente | `src/components/permissoes/matriz-permissoes.tsx` | Grade `módulos×ações` reutilizável; coerência no cliente; Admin readonly; badge Padrão/Personalizado; Restaurar c/ confirm. |
| Tela templates | `src/app/admin/perfis/{page,actions}.tsx` + link no `/admin` | super-admin; recusa editar Admin. |
| Tela override | `src/app/(app)/loja/[lojaId]/permissoes/{page,actions}.tsx` + link no dashboard | admin da loja (`ehAdminDaLoja`); nested → herda gates do layout; `salvar`/`restaurar`. |

Smoke (`scripts/smoke-permissoes.ts`): override liga `vestidos.criar` da vendedora na `loja-moscow` → `podeNoModulo` true; outra loja não afetada; restaurar → volta a false. HTTP: `/admin/perfis` e `/loja/[id]/permissoes` redirecionam sem auth.

**Correções do `/code-review` (commit `664f353`):** (1) o save preserva módulos fora da grade — `MatrizPermissoes` emite inputs hidden p/ os ocultos (ex.: `config`), senão o snapshot zerava o que o template concedia; (2) a grade remonta (key por assinatura) quando o servidor reenvia valores, senão o checkbox ficava stale após "Restaurar padrão"; (3) DRY: `lerAcessosDoForm` e `MODULOS_VISIVEIS` extraídos p/ `permissoes/modulos` (eram duplicados em 2 actions + 2 pages). Refutados na verificação (não eram bugs): "Admin renderiza vazio" (seed real = `TODAS`) e "rota ignora `[lojaId]`" (o layout já faz espelhamento).

## O que está pronto no Módulo Vestidos + permissões

Spec: `docs/superpowers/specs/2026-05-29-modulo-vestidos-design.md`. Plano: `docs/superpowers/plans/2026-05-29-modulo-vestidos.md`. **Sem mudança de schema** (shape granular coube no `Json`).

| Peça | Onde | Notas |
|---|---|---|
| Helper de permissão | `src/lib/permissoes/modulos.ts` (+ testes, 4: P1–P4) | `podeNoModulo(usuarioId, lojaId, modulo, acao)`. super-admin → true; senão lê `perfil.acessosModulos[modulo][acao]`; ausência → false (falha-fechada). `MODULOS`/`ACOES`/tipos. |
| Seed granular | `prisma/seed.ts` (+ `seed.test.ts` S1) | `acessosModulos` = `{ módulo: { ver, criar, editar } }`. Admin tudo; vendedora vê vestidos (não muta); recepção idem. |
| Data layer | `src/lib/vestidos/vestidos.ts` (+ testes, 6: V1–V6) | `listar/obter/criar/editar` 100% via `tenantPrisma`; valida código/nome/preço (parse pt-BR), traduz `P2002` ("código duplicado"). |
| Rotas + UI | `src/app/(app)/loja/[lojaId]/vestidos/{page,actions,vestido-form,novo,[vestidoId]/editar}` | Lista (gate ver) + CTA/editar condicionais; criar/editar em rotas dedicadas reusando 1 form (`useActionState`); gate duplo page+action; `force-dynamic`. Dashboard linka "Ver vestidos →". |

Vendedora read-only verificada no smoke (vê lista sem CTA; `/vestidos/novo` redireciona). UI seguiu a direção da `impeccable` (lista, não tabela; bordô ≤5%; estado-zero orientado).

## Porta obrigatória de dados de tenant — `tenantPrisma`

A partir de agora, **toda leitura/escrita** em `Vestido`, `Lead`, `Atributo`, `BloqueioVestido` e `RegraDisponibilidade` deve passar por `tenantPrisma(prisma, lojaId)` (ver `src/lib/tenant.ts`). Acesso direto via `prisma.vestido.*` etc. é considerado bug de segurança.

- **O que o guard garante:** filtro por `lojaId` em `findUnique/First/Many/count/aggregate/groupBy/update/delete/upsert`; carimbo de `lojaId` em `create/createMany/upsert.create`; impede `update.data.lojaId` (não dá pra re-tenantar uma linha).
- **Falha fechada:** sem `lojaId` válido, o guard lança. `findUnique` em linha de outra loja retorna `null`; `delete` lança `P2025`.
- **Exceção:** `UsuarioLoja` (tabela de acesso) NÃO entra no guard — é lida via `prisma` direto, filtrada por `usuarioId`. Razão e detalhes no cabeçalho de `src/lib/tenant.ts`.
- **Limitação conhecida:** tabelas-filha sem coluna `lojaId` (`AtributoOpcao`, `VestidoAtributo`, `LeadInteresse`, `LeadInteresseAtributo`) **não** são escopadas pelo guard. Convenção: só acessar via `include` do pai.
- **Canário anti-raw:** `src/lib/__tests__/tenant.test.ts` falha o CI se `$queryRaw*` aparecer em arquivo que cite model de tenant. Raw em tabela de tenant é proibido.

A prova de isolamento vive em `src/lib/__tests__/tenant.test.ts` — 10 testes cobrindo Vestido (create/createMany/upsert/update/cross-loja-read) + helper `proveZeroVazamento` aplicado em Lead. Use o helper pra cobrir novos models conforme forem criados.

## O que está pronto na B.1

| Task | Status | Commit | Notas |
|---|---|---|---|
| 1 — Migration `Sessao` | ✓ | `c39f090` | tabela + índices em `expiraEm` e `usuarioId`; FK cascade pra `Usuario`. Smoke test no `seed.test.ts`. |
| 2 — `senha.ts` | ✓ | `a54efea` | `gerarHash` + `verificarSenha`; 5 testes. |
| 3 — `sessao.ts` | ✓ | `67184fa` | `criarSessao`/`lerSessao`/`destruirSessao` + cleanup lazy; 9 testes de integração. |
| 4 — `cookie.ts` + barrel `index.ts` | ✓ | `eb9f6c6` | wrappers sobre `cookies()` (async no Next 16) + `getSessao()` composto. |
| 5 — Rota `/login` | ✓ | `6f8e470` | page (Server) + login-form (Client `useActionState`) + Server Action; mensagem de erro genérica. |
| 6 — Layout `(app)` + dashboard `/` + logout | ✓ | `b501cc2` + `93d3abd` (catch-up dos checkboxes) | layout faz `getSessao()→redirect`; `/` mostra "Olá, {nome}" + form logout. |
| 7 — Polish da `/login` (impeccable) | ✓ | `cf0e0cd` (PRODUCT.md + DESIGN.md) + `fc63fd2` (polish) | tokens warm-tinted + acento bordô; tipografia humanista; light-only; respeita reduced-motion. |
| 8 — Verify manual end-to-end | ✓ | (snapshot) | 7 critérios verificados via curl + psql + sessão forçada-expirar; check de produto: `vendedora@lojateste.local` (perfil Vendedora ligada à `loja-moscow` via `UsuarioLoja`) logou e viu "Olá, Vendedora" — sem hardcode de admin. Fixture deixada no banco pra B.2-T1. |

## Estado das gates

- `npm test`: **133/133 verdes** (119 anteriores + 8 de `permissoes/acessos` (7 puros + `lerAcessosDoForm`) + 2 casos novos em `permissoes/modulos` (P5/P6) + 4 de `permissoes/perfis`). Rodar via `node node_modules/vitest/vitest.mjs run`. **Após mudar schema, rodar `npx prisma generate`** — o `migrate dev` nem sempre regenera o client no output custom (`src/generated/prisma`), e o runtime falha com `prisma.<model>` undefined mesmo com `tsc` limpo.
- `npx tsc --noEmit`: limpo (`node node_modules/typescript/bin/tsc --noEmit`).
- Smoke test na app rodando (porta 5000): `/login` 200; `/admin`, `/equipe`, `/` redirecionam pra `/login` sem auth; com sessão de super-admin, `/admin` renderiza o console; com loja ativa, `/equipe` renderiza a equipe.
- Dev server compila; fluxo de auth + loja ativa end-to-end verificado manualmente: admin e vendedora (1 loja) auto-selecionam e caem direto em `/`; vendedora com 2 lojas cai em `/selecionar-loja`, escolhe e segue pra `/`. Cleanup da `loja-teste-2` feito.
- **Ambiente:** o Node às vezes não está no PATH do shell (Nix/Replit); quando faltar, está em `/nix/store/*/bin`. Os binários `node_modules/.bin/{tsc,vitest}` dão "permission denied" via symlink — rodar via `node node_modules/typescript/bin/tsc --noEmit` e `node node_modules/vitest/vitest.mjs run`. Tsx: `node node_modules/tsx/dist/cli.mjs <script>`. **Python não está no PATH** (a skill `ui-ux-pro-max` precisa dele — usar o Quick Reference inline em vez do `search.py`).
- **Smoke / dev server:** a **porta 5000 é gerida pelo Replit** e some/reaparece entre turnos (contenção) — não dá pra confiar nela pro smoke próprio. Suba um server em **outra porta** e faça tudo num **único comando** (start em background → poll até 200 → curl → `kill`): `node node_modules/next/dist/bin/next dev -p 5050 &` … ver [[dev-server-porta-replit]]. Em dev o CSS do Tailwind v4 não sai em `/_next/static/css/*.css` (injetado por outro caminho), então confirmar regra de CSS pelo fonte/`.next`, não por curl do CSS.

## Revisão de UI/UX (skill `ui-ux-pro-max`, 2026-05-29)

Passada de auditoria em **todas as páginas** contra o Quick Reference da skill + o perfil (`PRODUCT.md`/`DESIGN.md`, que commita WCAG AA). Veredito: produto muito coerente com o próprio perfil; pouca correção real. Commit `1acc04d`.

- **Corrigido:** `html lang` en→pt-BR; inputs de texto ≥16px (regra global em `globals.css`, fora de `@layer` → vence as utilities do Tailwind; evita zoom-on-focus do Safari iOS no tablet); empty state no `/equipe`.
- **Contraste auditado e MANTIDO:** calculei OKLCH→sRGB→WCAG — texto todo ≥4.5:1 (cinza-fumo 4.59:1 é o mais justo, mas passa). **Não re-investigar; tokens de cor estão certos.**
- **Flags abertos (decisão de design, não bug):** (1) botões de ação ~40px `py-2.5` vs. 44px de toque — desktop é primário; subir a `py-3` muda o ritmo global. (2) borda do input em repouso 1.49:1 (WCAG 1.4.11 pede 3:1 p/ afordância) — é o "flat" intencional. (3) `/admin` tem "Lojas" h1 + "Admins" h2 irmãos; um h1 de página limparia a hierarquia. (4) **DRY:** `Field`/`Submit` duplicados em ~5 forms → extrair p/ `src/components/ui/` no checkpoint de consolidação de UI (após Leads).

## Documentos desta fatia

- **Spec B.2-T1 (esta fatia):** `docs/superpowers/specs/2026-05-28-b2-t1-loja-ativa.md`
- **Spec B.1:** `docs/superpowers/specs/2026-05-28-multitenant-b1-identidade-design.md`
- **Plano B.1 (8/8 tasks):** `docs/superpowers/plans/2026-05-28-multitenant-b1-identidade.md`
- **PRODUCT.md** + **DESIGN.md** (raiz do projeto) — escritos via `impeccable teach` na Task 7. Servem qualquer fatia de UI daqui pra frente.
- Spec/plano da Base: `docs/superpowers/specs/2026-05-27-moscow-noivas-base-design.md`, `docs/superpowers/plans/2026-05-27-base-plano-{a,b}-*.md`
- Mapa de workflow × skills: `docs/workflow-skills.md`

## O que está pronto na B.2-T1

| Peça | Onde | Notas |
|---|---|---|
| Migration `Sessao.lojaAtivaId` | `prisma/migrations/20260528185829_sessao_loja_ativa/` | `ADD COLUMN lojaAtivaId TEXT` + FK `onDelete: SetNull → Loja`. Aditiva (nullable). Schema: campo + relação `lojaAtiva` em `Sessao` e back-relation **virtual** `sessoesAtivas Sessao[]` em `Loja` (sem coluna/SQL em `Loja`). |
| Helpers de loja ativa | `src/lib/auth/sessao.ts` + re-export `index.ts` | `listarLojasDoUsuario` (cross-loja, filtra `ativo`), `selecionarLojaPorPadrao`, `definirLojaAtiva` (valida `UsuarioLoja` antes de gravar — falha fechada), `lerSessaoComLojaId`/`getSessaoComLoja`, `gateSessaoLojaAtivaPorId`/`gateSessaoLojaAtiva` (+ tipo `GateEstado`). Padrão **helper-por-id** pra testar sem mockar `cookies()`. |
| Rota `/selecionar-loja` | `src/app/(public)/selecionar-loja/{page,actions,selecao-form}.tsx` | Adaptativa: 0 lojas → estado vazio + logout; 1 loja → auto-select server-side → `/`; >1 → form de escolha. `selecionarLojaAction` valida e manda `?erro=acesso` se forjado. `page` usa `getSessaoComLoja()` (não o campo cru) pro short-circuit → evita loop quando a loja foi desativada. |
| Gate triplo | `src/app/(app)/layout.tsx` | `gateSessaoLojaAtiva()` → `sem-sessao`/`sem-loja-ativa`/`ok`, mapeado pra redirect. |
| Testes | `src/lib/auth/__tests__/loja-ativa.test.ts` | 14 novos (A1–E3 da spec §5), Prisma real. |

Decisão de produto desta fatia (seletor adaptativo, hipótese 1-loja-99%) e follow-ups vivem na spec `2026-05-28-b2-t1-loja-ativa.md` §7.

## O que está pronto na B.2-T3 (dashboard scoped)

Spec: `docs/superpowers/specs/2026-05-29-b2-t3-dashboard-scoped.md`. Plano: `docs/superpowers/plans/2026-05-29-b2-t3-dashboard-scoped.md`. **Sem mudança de schema.** O guard `tenantPrisma` (B.2-T2) saiu do laboratório e entrou num fluxo real.

| Peça | Onde | Notas |
|---|---|---|
| Regra de espelhamento (pura) | `src/lib/loja/acesso.ts` (+ `__tests__/acesso.test.ts`, 6) | `resolverAcessoLoja(lojaIdUrl, lojaAtivaId)` → `{ok}`/`{redirectTo}` (falha-fechada ao canônico); `mostrarTrocaLoja(qtd)` → só com >1 loja. Testável sem `cookies()` (padrão helper-por-id). |
| Leitura escopada | `src/lib/loja/resumo.ts` (+ `__tests__/resumo.test.ts`, 3) | `carregarResumoLoja(lojaId)` → `{ vestidos }` via `tenantPrisma(prisma, lojaId).vestido.count()`. **Migra o teste D**: prova zero-vazamento entre lojas no fluxo real. |
| Gate de espelhamento | `src/app/(app)/loja/[lojaId]/layout.tsx` | `getSessaoComLoja()` + `await params` + `resolverAcessoLoja` → redirect. `export const dynamic = "force-dynamic"`. |
| Dashboard scoped | `src/app/(app)/loja/[lojaId]/page.tsx` | Bloco de catálogo honesto ("N vestidos cadastrados" / "Nenhum vestido cadastrado ainda", sem CTA); link "Trocar loja" só p/ multi-loja; nav + logout migrados. `force-dynamic`. |
| Hub de redirect | `src/app/(app)/page.tsx` | `/` resolve a loja ativa e redireciona p/ `/loja/{id}` (lógica de loja-padrão centralizada num lugar). |

**Decisões de produto (no spec §3, fechadas via brainstorming + grill-me):** fonte da verdade = sessão (URL espelha); dashboard transitório/mínimo; só vestidos (leads fica p/ o módulo); estado-zero sem link morto; troca-loja condicional; **contagem de tenant nunca cacheada** entre requests (`force-dynamic`). Smoke end-to-end (porta 5000): redirects sem-auth/com-auth e espelhamento falha-fechada verificados.

## O que está pronto na B.3 (gestão de usuários)

Spec: `docs/superpowers/specs/2026-05-28-b3-gestao-usuarios.md`. **Sem mudança de schema** — usa `Usuario.isSuperAdmin` + `UsuarioLoja(perfilId)` + `Perfil.acessosModulos`.

| Peça | Onde | Notas |
|---|---|---|
| Data layer | `src/lib/admin/usuarios.ts` (+ testes em `__tests__/usuarios.test.ts`, 14) | `criarLoja`/`listarLojas`; `criarAdmin`/`listarAdmins`; `criarVendedora`/`listarEquipe`; `ehAdminDaLoja` (super-admin OU perfil Admin). Núcleo `criarUsuarioComPerfil` atômico ($transaction), valida e-mail único + lojas + senha≥8. |
| Console super-admin (Fatia 1) | `src/app/admin/{layout,page,actions,loja-form,admin-form}.tsx` | Grupo de rota FORA do gate de loja; guard `isSuperAdmin`. Lista/cria lojas e admins (admin pode receber N lojas). Login manda super-admin pra `/admin`. |
| Gestão de equipe (Fatia 2) | `src/app/(app)/equipe/{page,actions,vendedora-form}.tsx` + links no dashboard | Dentro do gate de loja; guard `ehAdminDaLoja` (vendedora é redirecionada). Admin cadastra vendedoras na loja ativa. |

Toda Server Action revalida o papel server-side (defesa em profundidade). Falta a **Fatia 3** (enforce de `acessosModulos`) — só faz sentido quando existirem páginas de módulo (leads/vestidos/etc.), que ainda não existem.

## Pendências de housekeeping (fora do escopo da fatia)

- `.claude/settings.local.json` — entradas de permissão acumuladas. Pode virar uma corrida do `fewer-permission-prompts` em algum momento.
- `.claude/worktrees/` — worktrees de subagentes antigos.
- `.replit` — **resolvido** (commit `8ab3738`): removidas portas órfãs 3001/5050 e o wrapper "Project"; `runButton` aponta direto p/ "Start application".
- `scripts/` — `smoke-permissoes.ts` agora **commitado** (na branch). Os demais utilitários seguem untracked (`inspect-multiloja`, `remove-vinculo-loja`, `forge-sessao-smoke`, `cleanup-smoke`, `forge-smoke-vestidos`, `smoke-cria-vestido`, `smoke-limpa-vestido`). Decidir manter ou remover (precisa de OK explícito).
- **UI flags** da revisão `ui-ux-pro-max` (touch target 44px, borda 1.4.11, heading do `/admin`) — ver seção "Revisão de UI/UX". A extração DRY dos forms começou nesta fatia (`MatrizPermissoes`, `lerAcessosDoForm`, `MODULOS_VISIVEIS`); `Field`/`Submit` ainda duplicados nos forms antigos.
- **Skills:** instaladas as suítes completas `obra/superpowers` (14) e `mattpocock/skills` (14) no esquema `.agents/skills` + symlink + `skills-lock.json` (32 skills no total). Install funcional, não via plugin oficial (sem hook de SessionStart).

## Últimos commits relevantes

Branch `feat/central-permissoes` (10 commits à frente da `main`, **falta merge**):

- `664f353` fix(permissoes): review — preserva módulos ocultos no save + reset de estado da grade
- `b454de9` docs+smoke: fecha fatia central de permissões (override por loja verificado)
- `5d12a80` feat(permissoes): tela /loja/[id]/permissoes (override por loja)
- `e00c891` feat(permissoes): tela /admin/perfis (edita templates globais)
- `4ebdef7` feat(permissoes): componente MatrizPermissoes
- `990df10` feat(permissoes): camada de dados perfis (template + override) + PERFIL_RECEPCAO_ID
- `1825e1b` feat(permissoes): podeNoModulo resolve override > template (Admin=total)
- `9a1dd5b` feat(permissoes): normalizarAcessos + resolverAcessosEfetivos (puros, TDD)
- `11f5ecf` feat(permissoes): tabela PerfilOverrideLoja + entrada no tenantPrisma
- `8ab3738` chore: limpa .replit (portas órfãs + wrapper)

Na `main` (antes da branch): `7389c52` plano · `3ad1734` spec v2 · `b697917` spec v1 · `7772095` skills mattpocock · `ba0d2a8` skills superpowers · `f8bdac9` scripts dev/ops.
