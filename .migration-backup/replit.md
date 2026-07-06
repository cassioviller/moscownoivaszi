# Moscow Noivas

Sistema interno de gestão de ateliê de vestidos de noiva. Gerencia noivas/leads, atendimentos, vestidos, contratos, financeiro e equipe.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/moscow-noivas run dev` — run the Vite frontend (port 25188)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: Vite + React + Wouter (routing) + TanStack Query + Tailwind v4
- API: Express 5, port 8080
- DB: PostgreSQL (raw pg pool, no ORM)
- Auth: Custom cookie sessions (`moscow_sessao`, 8h TTL, `SESSION` → `Sessao` table)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/moscow-noivas/src/` — Vite+React frontend
  - `pages/` — all pages (LoginPage, SelecionarLojaPage, loja/*)
  - `contexts/auth.tsx` — AuthProvider/useAuth
  - `lib/api.ts` — fetch wrapper
  - `lib/dinheiro.ts` — currency formatting
  - `components/layout/nav-items.ts` — sidebar nav config + flags
  - `index.css` — Tailwind v4 @theme with Moscow Noivas design tokens
- `artifacts/api-server/src/` — Express API
  - `routes/` — auth.ts, loja.ts, equipe.ts, admin.ts, seed.ts
  - `lib/auth.ts` — session management
  - `lib/permissoes.ts` — permission checks
  - `lib/db.ts` — pg pool helpers

## Architecture decisions

- Cookie-based session auth: `moscow_sessao` cookie → `Sessao` table (not JWT)
- Super admin (`isSuperAdmin=true`) bypasses all loja permission checks
- Vite dev proxy `/api` → `http://localhost:8080` (configured in vite.config.ts)
- Custom CSS design tokens: `papel`, `tinta`, `bordo`, `champagne`, `grafite`, `cinza-fumo`, `borda-suave` — all defined in `@theme {}` in index.css
- Old Next.js `src/app/` and `src/lib/` directories excluded from tsconfig (migration artifacts)

## Product

- Login + multi-loja selection
- Dashboard with stats (noivas, atendimentos, contratos, vestidos)
- Noivas/leads CRUD with stages, profile view, WhatsApp
- Vestidos (dress catalog) with search + pagination
- Contratos with parcelas breakdown
- Agendamento de atendimentos
- Calendário mensal de atendimentos
- Reservas de vestidos
- Financeiro: receber, pagar, comissões
- Permissões por perfil por loja
- Equipe: cadastro de vendedoras
- Admin: gestão de lojas + admins + perfis (super-admin only)

## Seed

POST `/api/seed` — creates default perfis (admin/vendedora/recepcao), super admin (`admin@moscownoivas.com` / `admin123`), and one demo loja (`Moscow Noivas SP`) if none exist.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- TS exclude list in `artifacts/moscow-noivas/tsconfig.json` covers old Next.js `src/app/` and `src/components/*` files that still use `next/link`/`next/navigation`
- `UsuarioLoja` table has no `updatedAt` column
- Geist Sans/Geist Mono are loaded from Google Fonts (not Next.js font system)
- Super admin with `isSuperAdmin=true` has access to all lojas automatically (via `listarLojasDoUsuario`)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
