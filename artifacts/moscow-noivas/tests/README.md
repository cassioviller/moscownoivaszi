# Testes E2E (Playwright)

Suíte em browser real cobrindo todas as páginas da SPA, fluxos, permissões e isolamento entre lojas.

## Rodar

```bash
pnpm install
pnpm add -D @playwright/test pg bcryptjs @types/pg   # se ainda não instalados
pnpm exec playwright install chromium                # baixa o Chromium (1ª vez)

# Gerar o schema do banco de teste (1ª vez / após mudar o modelo):
pg_dump --schema-only --no-owner --no-privileges \
  "postgresql://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE" > tests/setup/schema.sql

pnpm test:e2e                            # roda tudo
pnpm test:e2e -- tests/auth.spec.ts      # um arquivo
pnpm test:e2e:ui                         # modo interativo
```

## Como funciona

- Stack isolada: Vite `:5175` → proxy `/api` → api-server `:8090` → Postgres `heliumdb_e2e`.
- O projeto `setup` (`tests/global.setup.ts`) recria o banco de teste, carrega `tests/setup/schema.sql`, roda o seed determinístico (`tests/setup/seed-e2e.ts`) e salva o `storageState` de cada papel em `tests/.auth/`.
- O banco real (`heliumdb`) **nunca é tocado**.

## Papéis do seed (senha `teste123`)

| email | papel | loja |
|---|---|---|
| super@e2e.test | super admin | (todas) |
| admin-a@e2e.test | admin | Atelier SP |
| vend-a@e2e.test | vendedora | Atelier SP |
| recep-a@e2e.test | recepção | Atelier SP |
| admin-b@e2e.test | admin | Atelier RJ |

## Extensões mapeadas (a fazer)

Fluxos profundos ainda não escritos (escopo registrado no spec):
- **Contrato → Pagamento**: começar lendo `src/pages/loja/AtendimentosNovoPage.tsx`,
  `src/pages/loja/ContratosPage.tsx`, `src/pages/loja/ContratoPage.tsx` e
  `src/pages/loja/FinanceiroReceberPage.tsx` para mapear os seletores, e seguir o
  padrão de `loja-fluxos.spec.ts`.
