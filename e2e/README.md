# e2e — suíte Playwright (fluxos críticos)

Testes end-to-end com `@playwright/test`. Diferente de `scripts/repro/*` (diagnósticos
manuais avulsos), esta é a **suíte integrada**: um comando sobe o app e roda os fluxos,
incluindo os de **mutação** (cadastrar, agendar, contratar).

## Rodar

```bash
npm run test:e2e
```

O `playwright.config.ts` usa a porta `E2E_PORT` (default **5000**, a que o Replit mantém viva)
e **reusa** um dev server já no ar (`reuseExistingServer`); num CI limpo, o Playwright sobe o
seu. O Chromium vem do nix via `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` — nenhum browser é baixado.

> O Next 16 dev tem trava de instância única (recusa um 2º `next dev`), então garanta o app
> no ar antes de rodar (botão Run do Replit ou `npm run dev`).

### Isolamento (loja efêmera)

O `globalSetup` cria via Prisma uma loja descartável **`loja-e2e`** + um usuário admin
(`admin-e2e@moscow.local` / `e2e-12345`) + 1 cabine e horário de funcionamento. Os specs de
mutação criam/editam **só dentro dessa loja**; o `globalTeardown` apaga a loja inteira (cascade)
e o usuário. `loja-moscow` nunca é tocada. O setup é idempotente (remove uma `loja-e2e` órfã
antes de recriar), então uma corrida interrompida se autolimpa na seguinte.

As operações de banco rodam num subprocess `tsx` (`scripts/e2e-db.ts`): o client Prisma gerado
é CommonJS e o loader do Playwright o trata como ESM, então importá-lo direto de dentro do
Playwright quebra (`exports is not defined`). `e2e/fixtures.ts` é um wrapper fino sobre esse script.

Sobrescreva por env: `E2E_LOJA`, `E2E_EMAIL`, `E2E_SENHA`, `E2E_PORT`. Pré-requisito: Postgres
de dev no ar com as migrações aplicadas (o setup semeia as linhas, não cria tabelas).

## Cobertura

| Spec | Fluxo | Tipo |
|---|---|---|
| `auth.spec.ts` | Gate: rota protegida sem sessão → `/login`; login válido sai do `/login`. | read-only |
| `jornada.spec.ts` | Autenticado: Início (Dia do atelier), Noivas, Vestidos, Calendário. | read-only |
| `cadastrar-noiva.spec.ts` | Cria noiva pela UI → aparece no acervo de noivas. | mutação |
| `cadastrar-vestido.spec.ts` | Cria vestido pela UI → aparece no acervo. | mutação |
| `agendar-atendimento.spec.ts` | Escolhe slot livre da grade → atendimento entra na fila. | mutação |
| `fechar-contrato.spec.ts` | Gera contrato em branco → parcela → cancela (status + parcelas canceladas). | mutação |

**Pré-condições por Prisma, mutação por UI:** cada spec arranja suas pré-condições pela fixture
(`criarNoivaE2E`), mas o que está **sob teste** é sempre exercido pela **UI real** e verificado
pelo **efeito observável na tela**. Specs de mutação rodam serial (`workers: 1`), escopados na
`loja-e2e`; os read-only checam só render/gate (não dependem de a loja estar vazia).

> Detalhe de seletor: as páginas de mutação vivem sob o layout `(app)`, cujo Topbar tem um
> `<button type="submit">` de logout antes do `<main>`. Clique o botão do form pelo **nome**
> (`getByRole("button", { name: ... })`), nunca por `button[type="submit"]` genérico.
