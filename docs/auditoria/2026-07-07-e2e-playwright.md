# Auditoria E2E com Playwright — Sistema Moscow Noivas

> Execução real em 2026-07-07, browser Chromium 138 (Nix), contra o branch `main` (`f9064f3`).
> Suíte: `e2e/*.spec.ts` (12 arquivos, 38 testes + setup). Rodar com `pnpm run test:e2e`.
> **Cada teste assere o comportamento CORRETO** — uma falha é um problema do sistema, não do teste.
> As correções para a maior parte dos achados já existem no branch `fix/auditoria-sistema-noivas` (Lotes 1–12).

---

## 1. Como esta auditoria foi montada

### 1.1 O que existia antes

- **Playwright não existia** no projeto: nenhuma dependência, nenhum browser, nenhum teste de interface. Os únicos testes do repositório (`artifacts/api-server/src/__tests__/` no branch de correções) são de API; no `main` não há teste algum.
- **Não havia como rodar frontend + API juntos em dev**: `artifacts/moscow-noivas/vite.config.ts` não tinha proxy `/api`, então as chamadas relativas do frontend nunca chegavam ao servidor fora do ambiente Replit. Este é o achado nº 0 — o repositório não oferecia um caminho local de ponta a ponta.

### 1.2 Infra criada (arquivos novos)

| Arquivo | Papel |
|---|---|
| `playwright.config.ts` | Sobe os dois servidores (`api-server` em :5099, Vite em :5173 com proxy), browser Chromium do Nix via `executablePath`, traces/screenshots em falha |
| `artifacts/moscow-noivas/vite.config.ts` | + proxy `/api` ativado **apenas** quando `E2E_API_PROXY` está definido (zero impacto no run do Replit) |
| `e2e/global-setup.ts` | Dados de teste **idempotentes** (IDs fixos `e2e-*`): vínculo da vendedora à loja, vestido, lead, cabine, regra de disponibilidade, orçamento com item; roda o seed oficial se o banco estiver virgem; grava `e2e/.state.json` |
| `e2e/helpers.ts` | Login pela UI, sessão via API com injeção de cookie (necessário porque a UI da vendedora trava — ver A3), coletor de erros de rede `/api` |
| `e2e/auth.setup.ts` | storageState do admin (com workaround do bug A1) |
| `e2e/01…12-*.spec.ts` | 38 testes cobrindo autenticação, seleção de loja, dashboard, vestidos, leads, agenda, orçamentos, contratos, financeiro, comissões, configurações e permissões |

### 1.3 Decisões práticas que a execução forçou

- **Chromium do Playwright não roda neste ambiente** (NixOS — `libglib-2.0.so.0` ausente). A config usa o `ungoogled-chromium 138` do `/nix/store`; sobreponível com `PLAYWRIGHT_CHROMIUM_PATH`.
- **Navegação fria do Vite dev é lenta** (plugins Replit + compilação por rota): o timeout de teste precisou ir a 60s. Numa CI, rodar contra build de produção (`vite preview`) resolveria.
- **O seed oficial não é idempotente** (`artifacts/api-server/src/scripts/seed.ts` usa PKs fixos de perfil e re-execução quebra em unique) — por isso o global-setup tem dados próprios com verificação de existência.

---

## 2. Resultado da execução

**39 testes: 19 passaram, 20 falharam** (rodada final de 10min11s, worker único, sem retries).

As 20 falhas mapeiam para **13 problemas distintos do sistema** (A1–A13 na seção 3) — nenhuma é flake ou bug de teste: cada uma tem arquivo, linha e evidência de execução. A rodada também **confirmou na prática o que funciona** (seção 4): login/logout, KPIs do dashboard, o cadastro de vestidos de ponta a ponta e as listagens básicas do superadmin.

O padrão geral: **para o superadmin, as telas de listagem funcionam; todo o resto — criar, detalhar, operar como vendedora — está quebrado.** O sistema hoje é um visualizador somente-leitura para um único usuário.

---

## 3. ACHADOS — por gravidade, com arquivo e evidência de execução

### 🔴 A1 (NOVO — descoberto pela execução): selecionar a loja trava a navegação

**Arquivos:** `artifacts/moscow-noivas/src/pages/selecionar-loja.tsx:14-17` + `artifacts/moscow-noivas/src/components/layout/app-layout.tsx:27` + `artifacts/moscow-noivas/src/hooks/use-auth.tsx:22-26`

**Evidência:** teste `02 › selecionar a loja navega ao dashboard sem precisar de F5` — após o clique, o POST `/api/auth/selecionar-loja` responde 200 (sessão gravada no servidor), mas a URL recebida foi `http://localhost:5173/selecionar-loja` em vez de `/dashboard`.

**Mecânica do bug:** `handleSelect` chama `setLocation("/dashboard")`, mas a página **não invalida a query `getMe`**. O `AppLayout` lê `activeLojaId` do estado em memória (sincronizado do `getMe` stale) → continua `null` → `<Redirect to="/selecionar-loja">` devolve a usuária. Só um F5 (que refaz o `getMe`) destrava. Este achado **não estava na auditoria estática** — só apareceu clicando de verdade. Detalhe curioso comprovado pelos snapshots: a tela volta para `/selecionar-loja` **renderizada dentro do layout com sidebar**, um estado híbrido que não deveria existir.

**Impacto:** toda usuária, em todo login, fica presa na segunda tela até recarregar a página na mão.

### 🔴 A2 (C1): a API inteira é superadmin-only — vendedora recebe 403 em tudo

**Arquivos:** `artifacts/api-server/src/routes/index.ts:21` (monta `adminRouter` sem prefixo) + `artifacts/api-server/src/routes/admin.ts:38-39` (`router.use(requireSessao); router.use(requireSuperAdmin)` valem para toda requisição que passa pelo router raiz).

**Evidência:** teste `12 › vendedora com loja ativa consegue listar leads` — probe direto: `GET /api/lojas/{id}/leads` autenticada como Maria (com vínculo e loja ativa) → **403** (esperado 200). Corpo: `"Acesso negado (SuperAdmin only)"`.

**Impacto:** nenhuma funcionária consegue operar o sistema. É o achado mais grave do produto.

### 🔴 A3 (C5): a tela de seleção de loja quebra para a vendedora

**Arquivo:** `artifacts/moscow-noivas/src/pages/selecionar-loja.tsx:10` — usa `useListLojas()` → `GET /api/admin/lojas` (superadmin-only) em vez das lojas da sessão (`session.lojas`, que o `/auth/me` já devolve).

**Evidência:** teste `02 › vendedora com vínculo vê a própria loja` — Maria loga, chega a `/selecionar-loja` e a loja dela **não aparece** ("Nenhuma loja encontrada"). Combinado com A2, a vendedora não passa da segunda tela por dois motivos independentes.

### 🔴 A4 (C2): frontend e servidor falam URLs diferentes — telas de detalhe mortas

**Arquivos:** `lib/api-spec/openapi.yaml` (fonte dos clientes gerados) × rotas reais em `artifacts/api-server/src/routes/*.ts`; consumidores quebrados: `contratos/[id].tsx:11`, `orcamentos/[id].tsx:12`, `configuracoes/index.tsx:14`.

**Evidência (probe API, sem UI no meio):** teste `08 › PROBE API`:
- `GET /api/contratos/{id}` (o que o cliente gerado chama) → **404**
- `GET /api/lojas/{lojaId}/contratos/{id}` (o que o servidor expõe) → **200**

**Consequências vistas na UI durante a execução:**
- `07 › detalhe do orçamento carrega os itens` → tela mostra "Orçamento não encontrado" para um orçamento que **existe** (item "E2E Item Vestido" gravado no banco pelo setup).
- `08 › detalhe do contrato carrega valor e parcelas` → "Contrato não encontrado" para o contrato seedado.
- `11 › regra de disponibilidade configurada é exibida` → Configurações nega a regra que o setup gravou (o cliente chama `/disponibilidade`, o servidor expõe `/disponibilidade/regras`; o 404 é engolido e a tela mente "não configuradas").

### 🔴 A5 (C4): os quatro botões de criação não fazem nada

**Arquivos e linhas:** `leads/index.tsx:35-38`, `agenda/index.tsx:20-23`, `orcamentos/index.tsx:17-20`, `contratos/index.tsx:17-20` — botões `Novo Lead`, `Novo Agendamento`, `Novo Orçamento`, `Novo Contrato` **sem handler**.

**Evidência:** 4 testes clicam e esperam um formulário/dialog/navegação — nada acontece em nenhum (o de contrato falha em 3.7s: nem dialog, nem navegação). Sem esses fluxos, não há como registrar noiva, agendar atendimento, montar orçamento ou fechar contrato pela interface — **o funil inteiro do negócio é inoperável**.

### 🟠 A6 (C9c): GET de faixas de comissão responde 500

**Arquivo:** `artifacts/api-server/src/routes/comissao.ts:70-74` — a rota lê `comissao_faixas` (colunas `minimoVenda`/`percentual`) e valida com `ListComissaoFaixasResponse`, que é **alias do schema de regras** (`minAcumulado`/`regraId`/`vendedoraId`); o parse Zod explode no servidor.

**Evidência:** teste `10 › PROBE API: GET /comissao/faixas responde 200` → **500** com a faixa seedada (5% desde R$ 0) no banco. A tela de Comissões nem consome faixas (elas não aparecem em lugar nenhum da UI — teste `10 › faixas configuradas aparecem na tela` também falha).

### 🟠 A7: "Atendimentos do Dia" lista a história inteira

**Arquivo:** `artifacts/moscow-noivas/src/pages/agenda/index.tsx:10` — `useListAtendimentos` sem filtro de data; o card se chama "Atendimentos do Dia".

**Evidência (a mais literal da rodada):** o teste encontrou no card um atendimento de **"7/6/2026, 9:46:07 PM"** — o seedado dias antes — exibido como se fosse de hoje. Além do filtro, `agenda/index.tsx:13` chama `useListAjustes(primeiroAtendimentoId)` passando **id de atendimento onde a API espera lojaId** (o middleware devolve 403 "Acesso negado a esta loja", engolido pela tela).

### 🟠 A8: dashboard com cards hardcoded que mentem

**Arquivo:** `artifacts/moscow-noivas/src/pages/dashboard.tsx:96-115`.

**Evidência:** teste `03 › Leads Recentes reflete os leads existentes` — com leads reais no banco (o KPI "Novos Leads" do mesmo dashboard mostra número > 0), o card exibe o texto **fixo** "Nenhum lead novo recentemente."; "Próximos Atendimentos" idem ("A agenda está vazia…"). Os dois blocos não consultam nada — são JSX estático.

### 🟠 A9 (C13): o menu ignora o perfil — modelo de permissões decorativo

**Arquivo:** `artifacts/moscow-noivas/src/components/layout/sidebar.tsx:20-31` — `navItems` fixo com os 10 módulos, sem filtro por `acessosModulos`.

**Evidência:** teste `12 › menu da vendedora esconde módulos sem acesso` — Maria (perfil Vendedora: `financeiro: false, comissao: false`) vê **Financeiro** e **Comissões** no menu. O backend também não aplica os perfis (o `getPermissoes` de `lib/auth.ts` nunca é chamado por nenhum middleware) — no `main` a única "permissão" real é o 403 global do A2.

### 🟡 A10: identificadores crus no lugar de nomes

**Arquivos:** `orcamentos/index.tsx:38` ("Orçamento para Lead: a1b2c3d4"), `contratos/index.tsx:38` ("Contrato #abc123"), `comissoes/index.tsx:27,53`, `financeiro/index.tsx:47`.

**Evidência:** teste `07 › card do orçamento identifica a noiva pelo nome` — "E2E Noiva Playwright" não aparece; o card mostra o prefixo do UUID. Para a vendedora, um funil que exibe hashes em vez de noivas é inutilizável.

### 🟡 A11: enum cru na interface

**Arquivos:** `vestidos/index.tsx:226` (badge `{vestido.status}` → "ativo"), `leads/index.tsx:48` (badge `{lead.etapa}` → "CONTRATO_FECHADO").

**Evidência:** teste `04 › status do vestido é exibido com rótulo tratado` — o texto exato "ativo" (minúsculo, valor de banco) está visível no card; o snapshot do funil mostra "CONTRATO_FECHADO" como badge para a usuária.

### 🟠 A12: Financeiro não carrega nem o que promete — e não tem recebíveis

**Arquivo:** `artifacts/moscow-noivas/src/pages/financeiro/index.tsx` + a mesma divergência do A4.

**Evidência (dupla, do teste `09`):**
1. `página carrega as contas a pagar` — a conta **"Aluguel" existe no banco e não aparece na tela**. Causa confirmada por diff de URLs: o cliente gerado chama `GET /api/lojas/{id}/contas-pagar` (`lib/api-client-react/src/generated/api.ts:5695`), o servidor expõe `GET /api/lojas/{id}/financeiro/contas-pagar` (`routes/financeiro.ts:55`) → 404 engolido → "Nenhuma conta pendente". **Mais uma instância viva do A4/C2**, agora no financeiro.
2. `parcelas a receber aparecem com ação de baixa` — a tela **não consulta parcelas a receber** nem oferece baixa; há parcela `PREVISTA` no banco. O caixa de entrada (o coração financeiro de uma loja de vestidos) não é operável.

### 🟡 A13: erros de API são engolidos — falha parece "não há dados"

**Transversal** (nenhuma listagem trata `error` das queries). Evidência: em Configurações o 404 do A4 vira "Regras de disponibilidade não configuradas."; na Agenda o 403 do A7 vira "Nenhum ajuste pendente."; o coletor de rede dos testes registrou respostas 4xx/5xx em páginas que renderizam como se estivessem vazias. Para a usuária é impossível distinguir "sem dados" de "sistema quebrado".

---

## 4. O que FUNCIONA (também é resultado de auditoria)

- **Login/logout** com sessão em cookie httpOnly (senha errada mostra toast de erro; logout limpa e redireciona).
- **Dashboard KPIs** consultam a API de verdade e refletem o banco (só os dois cards de lista são fake — A8).
- **Catálogo de vestidos**: listagem, **cadastro pelo dialog de ponta a ponta** (único fluxo de escrita funcional da UI) e detalhe.
- **Listagens básicas** de leads, orçamentos, contratos e cabines carregam para o superadmin.
- **Proteção de sessão**: anônimo recebe 401 nas rotas de dados (probe do teste 12).

---

## 5. Placar final da execução (teste a teste)

| Spec | Teste | Resultado | Achado |
|---|---|---|---|
| setup | autentica admin e seleciona a loja | ✅ | (com workaround do A1) |
| 01-auth | senha errada mostra erro e permanece no login | ✅ | |
| 01-auth | admin loga e chega à seleção de loja | ✅ | |
| 01-auth | vendedora loga e chega à seleção de loja | ✅ | |
| 01-auth | logout encerra a sessão e volta ao login | ✅ | (com workaround do A1) |
| 02-selecionar-loja | admin vê a loja disponível | ✅ | |
| 02-selecionar-loja | selecionar a loja navega ao dashboard sem F5 | ❌ | **A1** (novo) |
| 02-selecionar-loja | vendedora com vínculo vê a própria loja | ❌ | **A3** (C5) |
| 03-dashboard | KPIs carregam com dados reais, sem erros de API | ✅ | |
| 03-dashboard | Leads Recentes reflete os leads existentes | ❌ | **A8** |
| 04-vestidos | catálogo lista os vestidos, sem erros de API | ✅ | |
| 04-vestidos | cadastrar vestido pelo dialog (ponta a ponta) | ✅ | |
| 04-vestidos | detalhe do vestido abre com nome e preço | ✅ | |
| 04-vestidos | status exibido com rótulo tratado | ❌ | **A11** |
| 05-leads | funil lista os leads existentes | ✅ | |
| 05-leads | detalhe do lead abre | ✅ | |
| 05-leads | botão Novo Lead abre formulário e cadastra | ❌ | **A5** (C4) |
| 06-agenda | página abre com cabines listadas | ✅ | |
| 06-agenda | botão Novo Agendamento abre formulário | ❌ | **A5** (C4) |
| 06-agenda | Atendimentos do Dia mostra apenas os de hoje | ❌ | **A7** |
| 07-orcamentos | lista mostra o orçamento existente | ✅ | |
| 07-orcamentos | card identifica a noiva pelo nome | ❌ | **A10** |
| 07-orcamentos | botão Novo Orçamento abre formulário | ❌ | **A5** (C4) |
| 07-orcamentos | detalhe do orçamento carrega os itens | ❌ | **A4** (C2) |
| 08-contratos | lista mostra o contrato existente | ✅ | |
| 08-contratos | botão Novo Contrato leva a fluxo de criação | ❌ | **A5** (C4) |
| 08-contratos | detalhe do contrato carrega valor e parcelas | ❌ | **A4** (C2) |
| 08-contratos | PROBE API: URLs do front e do servidor divergem | ❌ | **A4** (404 vs 200) |
| 09-financeiro | contas a pagar carregam ("Aluguel" do banco) | ❌ | **A12/A4** |
| 09-financeiro | sem "Invalid Date"/"NaN" renderizado | ✅ | |
| 09-financeiro | parcelas a receber com ação de baixa | ❌ | **A12** |
| 10-comissoes | página abre sem crash | ✅ | |
| 10-comissoes | faixas configuradas aparecem na tela | ❌ | **A6/A10** |
| 10-comissoes | PROBE API: GET faixas responde 200 | ❌ | **A6** (500) |
| 11-configuracoes | página abre | ✅ | |
| 11-configuracoes | regra de disponibilidade é exibida | ❌ | **A4** (C2) |
| 12-permissoes | vendedora com loja ativa lista leads | ❌ | **A2** (C1, 403) |
| 12-permissoes | menu da vendedora esconde módulos sem acesso | ❌ | **A9** (C13) |
| 12-permissoes | PROBE API: anônimo → 401 | ✅ | |

**19 ✅ / 20 ❌.** Artefatos de cada falha (screenshot + trace navegável) em `e2e/.results/`; para depurar: `pnpm exec playwright show-trace e2e/.results/<pasta>/trace.zip`.

---

## 6. Correções

Todos os achados A2–A13 têm correção implementada e testada (113 testes de API) no branch **`fix/auditoria-sistema-noivas`** (12 commits, Lotes 1–12 — ver `docs/auditoria/2026-07-06-revisao-e-plano.md`). O A1 (seleção travada) está corrigido lá **por tabela** (a página de seleção foi reescrita para usar `session.lojas` e invalidar o `getMe`), e esta suíte E2E — que roda em qualquer branch — serve como verificação: no branch corrigido, os testes que aqui falham devem passar.

### Como rodar

```bash
pnpm run test:e2e                     # sobe API (:5099) + Vite (:5173) e roda tudo
pnpm exec playwright test e2e/07-*    # um spec específico
pnpm exec playwright show-trace e2e/.results/<pasta>/trace.zip  # depurar uma falha
```
