# Suíte E2E Playwright — Moscow Noivas (Design)

**Data:** 2026-06-21
**Status:** Aprovado

## Objetivo

Suíte de testes end-to-end em **browser real** (Playwright) cobrindo **todas as ~19 páginas reais da SPA**, com cobertura completa: smoke (cada página abre), fluxos que mexem em dados, permissões por papel, casos negativos e isolamento entre lojas.

Nasceu da validação do bug de roteamento do super-admin (login caía numa loja em vez de `/admin`). O fix já foi aplicado em 3 arquivos da SPA (`pages/LoginPage.tsx`, `App.tsx`, `contexts/auth.tsx`); esta suíte trava aquele comportamento como regressão e estende a cobertura ao app inteiro.

## Contexto do app (fatos confirmados)

- O app que roda é uma **SPA Vite + React** (`src/main.tsx` → `App.tsx` → `pages/`), roteada por **wouter**. A árvore `src/app/...` (estilo Next.js) é **código morto** da migração — não testar.
- A SPA fala com o **api-server** (Express) via `proxy /api`. O api-server usa **SQL cru** (`pg`) e bcryptjs (custo 12) para senhas.
- Autenticação por **cookie de sessão** (tabela `Sessao`). Não-super precisam selecionar loja (`Sessao.lojaAtivaId`).
- `LojaLayout` redireciona se `lojaAtivaId !== lojaId` da URL → base do teste de **isolamento**.

### Rotas reais da SPA (alvo do smoke)

`/login`, `/selecionar-loja`, `/admin`, `/admin/perfis`, `/equipe`, e sob `/loja/:id`:
`` (Início), `noivas`, `noivas/:id`, `vestidos`, `contratos`, `contratos/:id`, `atendimentos/novo`, `calendario`, `reservas`, `financeiro`, `financeiro/receber`, `financeiro/pagar`, `financeiro/comissoes`, `permissoes`.

Headings reais (para asserts): Início, Noivas, Vestidos, Contratos, Calendário, Reservas, Fluxo de caixa, Contas a receber, Contas a pagar, Comissões, Permissões, Equipe, Administração. Página inexistente mostra **"404 Page Not Found"**.

> Observação: o menu (`nav-items.ts`) lista links para `/provas`, `/ajustes`, `/catalogo` que **não existem na SPA** (só na árvore morta). O smoke deve flagrar esses links como "caem em 404".

## Decisões (escolhas do dono)

| Eixo | Decisão |
|---|---|
| Profundidade | **Cobertura completa** (smoke + fluxos + permissões + negativos + isolamento) |
| Persistência | **Suíte commitada** no repo (`@playwright/test` como devDep) |
| Dados | **Banco de teste dedicado** `heliumdb_e2e` + seed determinístico (banco real intocado) |
| Seed | **Schema clonado via `pg_dump --schema-only`** + `INSERT`s determinísticos por SQL |
| Auth | **storageState** (loga 1× por papel num setup, reusa o cookie) |
| Onde rodar | **Tentar no sandbox** (Playwright baixa o próprio Chromium, fora do nix quebrado); fallback Replit |

## Arquitetura do stack de teste

Portas isoladas, sem tocar no ambiente de dev:

```
Playwright (chromium próprio)
   │ dirige browser real
   ▼
Vite TEST :5175 ──proxy /api──▶ api-server TEST :8090
   (código SPA real)                  │
                                      ▼
                         Postgres: heliumdb_e2e (dedicado)
                         ── heliumdb (real) intocado ──
```

- **api-server :8090** com `DATABASE_URL` → `heliumdb_e2e`.
- **Vite :5175** com `proxy /api → :8090`.
- **Única mudança em produção:** parametrizar o alvo do proxy no `vite.config.ts` via `API_PROXY_TARGET` (default idêntico ao atual, `http://localhost:8080`). Nada mais é tocado.
- Playwright sobe/derruba ambos via `webServer`.

## Fixture determinística (`heliumdb_e2e`)

Recriada do zero a cada execução. Senha única **`teste123`** (hash bcryptjs em runtime no seed).

| id usuário | email | papel | loja | testa |
|---|---|---|---|---|
| `e2e-super` | super@e2e.test | super admin | (todas) | cai em `/admin` (regressão) |
| `e2e-admin-a` | admin-a@e2e.test | admin | loja-a | gestão completa |
| `e2e-vend-a` | vend-a@e2e.test | vendedora | loja-a | NÃO vê Financeiro/Equipe |
| `e2e-recep-a` | recep-a@e2e.test | recepção | loja-a | acesso limitado |
| `e2e-admin-b` | admin-b@e2e.test | admin | loja-b | isolamento |

- **Perfis:** `perfil-admin`, `perfil-vendedora`, `perfil-recepcao` (mesmo `acessosModulos` do seed de produção).
- **Lojas:** `loja-a` "Atelier SP" (com dados), `loja-b` "Atelier RJ" (vazia).
- **Dados em loja-a:** 2 vestidos; 2 leads, sendo um **"Ana Isolamento"** (marcador); 1 contrato (lead + `e2e-admin-a` como vendedora).
- **Vínculos:** `UsuarioLoja` liga cada não-super à sua loja+perfil. Super não tem vínculo (enxerga todas).

## Plano de testes

| Spec | Cobre |
|---|---|
| `auth.spec.ts` | login válido/inválido; **super→`/admin`**, admin→loja; logout |
| `smoke.spec.ts` | cada papel visita toda página permitida: URL certa, sem `pageerror`, sem "404 Page Not Found", heading visível, screenshot; flagra links de menu mortos |
| `admin.spec.ts` | super: criar loja, criar admin, abrir perfis |
| `loja-fluxos.spec.ts` | admin-a: criar noiva → aparece na lista (write path real). *Extensão mapeada:* contrato/pagamento |
| `permissoes.spec.ts` | vendedora/recepção não veem links nem páginas proibidas; URL proibida → redirect |
| `isolamento.spec.ts` | admin-b é expulso de `/loja/loja-a/...` e não vê "Ana Isolamento" |

### Escopo explícito (sem cap silencioso)

`loja-fluxos` entrega **a criação de noiva** totalmente escrita (entrada da jornada, write path completo form→API→lista). Os fluxos mais profundos **contrato → pagamento** são uma extensão mapeada (arquivos de entrada identificados no plano) a escrever depois que o harness estiver verde, pois exigem dirigir UI multi-etapas ainda não mapeada. Isso é registrado, não omitido.

## Robustez e fallback

- Browser real → trace + screenshot automáticos em falha (nativo).
- Specs independentes; `storageState` elimina flakiness de login.
- `DROP DATABASE ... WITH (FORCE)` só no `heliumdb_e2e` — **nunca** no `heliumdb`.
- Se o install do Playwright/Chromium travar (FUSE do sandbox), a suíte fica commitada e funcional; `tests/README.md` documenta rodar no Replit (`pnpm i && pnpm test:e2e`).

## Fora de escopo

- Testar a árvore morta `src/app/...`.
- Testes de carga/performance, visual regression por pixel, acessibilidade automatizada.
- CI (pode ser adicionado depois; o `package.json` já terá o script `test:e2e`).
