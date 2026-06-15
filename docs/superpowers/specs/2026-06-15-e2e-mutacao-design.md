# Spec — Suíte E2E com mutação (Playwright)

> Data: 2026-06-15. Fecha o último item "genuinamente em aberto" do `docs/estado-atual.md`:
> a suíte E2E integrada. Eleva o scaffold read-only atual (não commitado) para uma suíte
> que exercita os **fluxos de escrita** de ponta a ponta, com isolamento total do banco de dev.

## 1. Objetivo

Hoje a qualidade integrada vive em diagnósticos avulsos (`scripts/repro/*.mjs`) e nos testes
de unidade/integração (Vitest contra Postgres). Falta uma suíte que suba o app e **dirija a UI
real** nos fluxos críticos — incluindo os de **mutação** (cadastrar, agendar, contratar).

Esta fatia entrega essa suíte cobrindo quatro fluxos de escrita, cada um exercitado pela UI,
com os dados criados/editados **isolados numa loja efêmera** (`loja-e2e`) que nasce no setup e
é destruída no teardown — `loja-moscow` nunca é tocada.

## 2. Princípio de isolamento (decisão arquitetural central)

A app é multi-tenant: **todo** acesso a dado de tenant passa por `tenantPrisma(prisma, lojaId)`
e o isolamento entre lojas é provado por teste (`src/lib/__tests__/tenant.test.ts`). A suíte
aproveita essa garantia: cria uma **loja dedicada** e muta só dentro dela.

- **`globalSetup`** (Playwright, uma vez, antes de qualquer spec) — via **Prisma direto** (módulo
  `e2e/fixtures.ts`, fora do `tenantPrisma`, com `lojaId` carimbado à mão):
  - cria `Loja` efêmera `loja-e2e` (id e nome estáveis, reconhecíveis);
  - cria `Usuario` admin da e2e (`admin-e2e@moscow.local`, senha fixa via `gerarHash`) com
    `isSuperAdmin=false` e `UsuarioLoja` (perfil Admin) vinculando à `loja-e2e`;
  - semeia os **pré-requisitos lentos** do fluxo de agendamento: 1 `Cabine` ativa + 1
    `RegraDisponibilidade` (horário comercial cobrindo o dia útil de teste).
  - **Guard de segurança:** se já existir uma `loja-e2e` de uma corrida anterior, o setup a
    **remove primeiro** (idempotente) antes de recriar; e **aborta** se o id/ nome resolvido
    colidir com uma loja real (`loja-moscow`/`loja-teste-2`). A `loja-e2e` é sempre efêmera.
- **`globalTeardown`** (em `finally`, sempre roda): apaga `Sessao` do usuário e2e, `UsuarioLoja`,
  `Usuario` e a `Loja` `loja-e2e`. O cascade da `Loja` leva todo dado de tenant (leads,
  vestidos, atendimentos, contratos, parcelas, cabines, regras). Nada vaza pra `loja-moscow`.

### Pré-condições por Prisma, mutação por UI

Cada spec cria suas **pré-condições** via fixture Prisma (ex.: o fluxo de contrato precisa de
uma noiva existente). **Não** encadeamos a UI de um teste como entrada de outro — assim o spec
de "fechar contrato" não quebra se o de "cadastrar noiva" falhar. O que está **sob teste** é
sempre feito pela **UI real**; o resto é arranjado pelo caminho mais barato e determinístico.

## 3. Fluxos cobertos (cada spec independente, escopado em `loja-e2e`)

Todos autenticam como o admin da `loja-e2e` e garantem `loja-e2e` como loja ativa
(helper `entrarNaLoja`, já existente, com `E2E_LOJA=loja-e2e`).

| Spec | Pré-condição (Prisma) | Ação (UI real) | Asserção |
|---|---|---|---|
| `cadastrar-noiva.spec.ts` | — | `/loja/loja-e2e/noivas/nova` → preenche `noivaNome` (+ campos req.) → salva | a noiva aparece na lista `/noivas` |
| `cadastrar-vestido.spec.ts` | — | `/loja/loja-e2e/vestidos/novo` → código/nome/preço → salva | o vestido aparece na lista de acervo |
| `agendar-atendimento.spec.ts` | 1 `Lead` (fixture) + cabine/horário (setup) | `/loja/loja-e2e/atendimentos/novo` → escolhe a noiva → seleciona slot livre da grade → salva | o atendimento aparece no Dia do atelier (`/loja/loja-e2e`) ou no calendário |
| `fechar-contrato.spec.ts` | 1 `Lead` (fixture) | perfil da noiva (`/noivas/[leadId]`) → **"Gerar contrato em branco"** → detalhe do contrato → ajusta forma/parcelas → **cancelar (manter/estornar)** | as parcelas do contrato ficam `CANCELADA` |

Notas de fidelidade ao código real:
- O contrato **não nasce de formulário em branco**: `/contratos/novo` está aposentada
  (redireciona). O CTA real é **"Gerar contrato em branco"** no perfil da noiva
  (`noivas/[leadId]/page.tsx`), que chama `criarContratoDaNoiva(lojaId, leadId, vendedoraId)`
  via `contratos/actions.ts` (a `vendedoraId` é o próprio usuário logado).
- Agendar usa a **grade de disponibilidade**: o slot só fica livre se houver `Cabine` +
  `RegraDisponibilidade` na loja — por isso ambos são semeados no `globalSetup`.
- Os asserts de mutação verificam o **efeito observável na UI** (item aparece na lista /
  parcela marcada como cancelada), não o estado interno do banco.

## 4. Server, porta e os specs read-only existentes

- **Trava de instância única do Next 16:** não se sobe um 2º `next dev`. A suíte **reusa o dev
  server já no ar** (`reuseExistingServer: true`) e só sobe o seu num CI limpo. **Default na
  porta 5000** (a que o Replit mantém viva localmente); `E2E_PORT` sobrescreve no CI. O
  `e2e/README.md` será **corrigido** (hoje diz 5050) para alinhar à `playwright.config.ts`.
- **Unificação na `loja-e2e`:** os 2 specs read-only atuais (`auth.spec.ts`, `jornada.spec.ts`)
  migram para apontar à `loja-e2e`. Hoje dependem do seed da `loja-moscow`; apontando à loja
  efêmera, a **suíte inteira fica autocontida** e não depende de dado de dev. Os asserts de
  jornada checam **render + gate** (rota libera, `main`/cabeçalho da tela visíveis) — **não**
  dependem de conteúdo semeado nem de a loja estar vazia (specs rodam serial e os de mutação
  podem ter criado dados antes), evitando acoplamento entre specs.

## 5. Arquivos

| Arquivo | Papel |
|---|---|
| `playwright.config.ts` | já existe; ajustar `globalSetup`/`globalTeardown` e confirmar default 5000 |
| `e2e/fixtures.ts` | **novo** — Prisma direto: cria/derruba `loja-e2e` + usuário + cabine/horário; cria `Lead`/`Vestido` de pré-condição por spec |
| `e2e/global-setup.ts` / `e2e/global-teardown.ts` | **novos** — orquestram fixtures (setup idempotente + guard; teardown em `finally`) |
| `e2e/helpers.ts` | existe; `LOJA` passa a default `loja-e2e`; `login/entrarNaLoja` reusados |
| `e2e/auth.spec.ts` | existe; migra para `loja-e2e` |
| `e2e/jornada.spec.ts` | existe; migra para `loja-e2e` (asserts de estado-vazio) |
| `e2e/cadastrar-noiva.spec.ts` | **novo** |
| `e2e/cadastrar-vestido.spec.ts` | **novo** |
| `e2e/agendar-atendimento.spec.ts` | **novo** |
| `e2e/fechar-contrato.spec.ts` | **novo** |
| `e2e/README.md` | existe; corrigir porta + documentar a `loja-e2e` e o ciclo setup/teardown |
| `package.json` | já tem `test:e2e` + `@playwright/test`; manter |

## 6. Como rodar

```bash
# dev server no ar (Replit :5000) ou Playwright sobe o seu num CI limpo
npm run test:e2e
```

`globalSetup` prepara a `loja-e2e`; os specs rodam serial (`workers: 1`, `fullyParallel: false`
— já no config, evita corrida no tenant compartilhado da corrida); `globalTeardown` limpa tudo.

## 7. Fora de escopo (YAGNI)

- **Pipeline de CI** propriamente (GitHub Actions etc.) — a suíte fica *CI-ready* (setup/teardown
  autossuficientes, `E2E_PORT`/`E2E_*` por env), mas montar o workflow é outra fatia.
- **Banco de teste separado** — descartado: a loja efêmera + cascade já isola sem subir 2º banco.
- Fluxos de escrita não listados (reserva/prova/ajuste, cobrança, projeção/saldo, permissões) —
  podem virar specs adicionais depois, reusando `fixtures.ts`.
- Testes cross-browser — só Chromium (via `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE`, sem download).

## 8. Riscos e mitigações

- **Client Prisma defasado após migração** (nota recorrente do `estado-atual`): a `loja-e2e` não
  cria tabela nova (só linhas), então não há migração nesta fatia — risco não se aplica.
- **Teardown não roda se o processo morre forçado:** `globalSetup` é idempotente (remove
  `loja-e2e` órfã antes de recriar), então uma corrida seguinte se autolimpa.
- **Slot de agenda indisponível por causa do dia/horário do relógio:** a `RegraDisponibilidade`
  semeada cobre uma janela larga; o spec escolhe um slot livre **derivado da grade renderizada**
  (não um horário fixo), para não depender do horário do relógio da máquina.
